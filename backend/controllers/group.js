const mongoose = require("mongoose");
const Group = require("../models/Group");
const GroupMessage = require("../models/GroupMessage");
const User = require("../models/User");
const { io } = require("../config/socketio");
const { uploadBufferToCloudinary } = require("../config/multer");

// Only public profile fields (email is the contact identifier) — never encrypted private keys
const MEMBER_FIELDS = "fullName email profilePic status";
const MAX_CIPHERTEXT_LENGTH = 100000;

const str = (value) => (typeof value === "string" ? value : "");
const isValidId = (id) => mongoose.isObjectIdOrHexString(id);
const groupRoom = (groupId) => `group:${groupId}`;
const isMemberOf = (group, userId) => group.members.some((m) => String(m._id || m) === String(userId));
const populateGroup = (groupId) => Group.findById(groupId).populate("members", MEMBER_FIELDS);

const emitGroupUpdated = (group) => {
    io.to(groupRoom(group._id)).emit("groupUpdated", {
        groupId: String(group._id),
        members: group.members,
        createdBy: group.createdBy,
    });
};

// ============================
// CREATE GROUP
// ============================
exports.createGroup = async (req, res) => {
    try {
        const body = req.body || {};
        const name = str(body.name).trim();
        const creatorId = req.user.id;
        const memberIds = Array.isArray(body.memberIds) ? body.memberIds.filter(isValidId).map(String) : [];

        if (!name || memberIds.length === 0) {
            return res.status(400).json({ success: false, message: "Name and at least one member required" });
        }
        if (name.length > 100) {
            return res.status(400).json({ success: false, message: "Group name is too long" });
        }

        // Always include creator in members
        const allMembers = Array.from(new Set([...memberIds, creatorId]));
        const found = await User.countDocuments({ _id: mongoose.trusted({ $in: allMembers }) });
        if (found !== allMembers.length) {
            return res.status(400).json({ success: false, message: "Some selected users do not exist" });
        }

        const group = await Group.create({
            name,
            members: allMembers,
            createdBy: creatorId,
        });

        const populated = await populateGroup(group._id);

        // Put every member's open tabs in the group room and show them the new group
        io.in(allMembers).socketsJoin(groupRoom(group._id));
        allMembers
            .filter((id) => id !== creatorId)
            .forEach((id) => io.to(id).emit("addedToGroup", populated));

        return res.status(201).json({ success: true, group: populated });
    } catch (err) {
        console.error("createGroup error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// ============================
// GET MY GROUPS
// ============================
exports.getMyGroups = async (req, res) => {
    try {
        const groups = await Group.find({ members: req.user.id })
            .populate("members", MEMBER_FIELDS)
            .sort({ updatedAt: -1 });

        return res.json(groups);
    } catch (err) {
        console.error("getMyGroups error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// ============================
// GET GROUP MESSAGES
// ============================
exports.getGroupMessages = async (req, res) => {
    try {
        const { groupId } = req.params;
        if (!isValidId(groupId)) return res.status(400).json({ success: false, message: "Invalid group id" });

        // Verify user is a member
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });
        if (!isMemberOf(group, req.user.id)) return res.status(403).json({ success: false, message: "Not a member" });

        const messages = await GroupMessage.find({ groupId })
            .populate("senderId", "fullName profilePic")
            .sort({ createdAt: 1 });

        // Map messages to ensure senderName is accurate even for old messages
        const mappedMessages = messages.map(msg => {
            const doc = msg.toObject({ flattenMaps: true });
            if (doc.senderName === "Unknown" && msg.senderId) {
                doc.senderName = msg.senderId.fullName || "Unknown";
            }
            return doc;
        });

        return res.json(mappedMessages);
    } catch (err) {
        console.error("getGroupMessages error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// ============================
// SEND GROUP MESSAGE (text and/or image, both encrypted on the client)
// ============================
exports.sendGroupMessage = async (req, res) => {
    try {
        const { groupId } = req.params;
        const body = req.body || {};
        const senderId = req.user.id;
        const text = str(body.text);
        const iv = str(body.iv);
        const imageIv = str(body.imageIv);

        if (!isValidId(groupId)) return res.status(400).json({ success: false, message: "Invalid group id" });
        if (!text && !req.file) return res.status(400).json({ success: false, message: "Message is empty" });
        if (text.length > MAX_CIPHERTEXT_LENGTH) {
            return res.status(413).json({ success: false, message: "Message is too long" });
        }

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });
        if (!isMemberOf(group, senderId)) return res.status(403).json({ success: false, message: "Not a member" });

        // Multipart requests send the keys map as a JSON string
        let keysMap = body.encryptedKeysMap;
        if (typeof keysMap === "string") {
            try {
                keysMap = JSON.parse(keysMap);
            } catch {
                keysMap = null;
            }
        }
        const encryptedKeysMap = {};
        if (keysMap && typeof keysMap === "object" && !Array.isArray(keysMap)) {
            for (const [memberId, wrappedKey] of Object.entries(keysMap)) {
                if (isMemberOf(group, memberId) && typeof wrappedKey === "string" && wrappedKey.length <= 2000) {
                    encryptedKeysMap[memberId] = wrappedKey;
                }
            }
        }

        const user = await User.findById(senderId).select("fullName");
        const imageUrl = req.file ? await uploadBufferToCloudinary(req.file, { encrypted: Boolean(imageIv) }) : "";

        const message = await GroupMessage.create({
            groupId,
            senderId,
            senderName: user?.fullName || "Unknown",
            text,
            encryptedKeysMap,
            iv,
            image: imageUrl,
            imageIv: imageUrl ? imageIv : "",
        });

        // Convert to plain object so Mongoose Map serializes correctly for all clients
        const messageObj = message.toObject({ flattenMaps: true });
        io.to(groupRoom(groupId)).emit("newGroupMessage", messageObj);

        return res.status(201).json(messageObj);
    } catch (err) {
        console.error("sendGroupMessage error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// ============================
// GET GROUP PUBLIC KEYS (members only)
// ============================
exports.getGroupKeys = async (req, res) => {
    try {
        const { groupId } = req.params;
        if (!isValidId(groupId)) return res.status(400).json({ success: false, message: "Invalid group id" });

        const group = await Group.findById(groupId).populate("members", "publicKey");
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });
        if (!isMemberOf(group, req.user.id)) return res.status(403).json({ success: false, message: "Not a member" });

        const keysMap = {};
        group.members.forEach(member => {
            if (member) keysMap[member._id.toString()] = member.publicKey;
        });

        return res.json({ success: true, keysMap });
    } catch (err) {
        console.error("getGroupKeys error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// ============================
// DELETE GROUP MESSAGE (soft — content is wiped)
// ============================
exports.deleteGroupMessage = async (req, res) => {
    try {
        const { groupId, messageId } = req.params;
        const userId = req.user.id;
        if (!isValidId(groupId) || !isValidId(messageId)) {
            return res.status(400).json({ success: false, message: "Invalid id" });
        }

        const [group, message] = await Promise.all([Group.findById(groupId), GroupMessage.findById(messageId)]);
        if (!group || !message || String(message.groupId) !== groupId) {
            return res.status(404).json({ success: false, message: "Message not found" });
        }

        // Sender or the group admin may delete
        const isSender = message.senderId.toString() === userId;
        const isGroupAdmin = group.createdBy.toString() === userId;
        if (!isSender && !isGroupAdmin) {
            return res.status(403).json({ success: false, message: "Not authorized to delete this message" });
        }

        message.deleted = true;
        message.text = "";
        message.iv = "";
        message.image = "";
        message.imageIv = "";
        message.encryptedKeysMap = {};
        await message.save();

        io.to(groupRoom(groupId)).emit("messageDeleted", {
            messageId: message._id,
            chatType: "group",
            groupId,
        });

        return res.json({ success: true });
    } catch (err) {
        console.error("deleteGroupMessage error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// ============================
// DELETE GROUP
// ============================
exports.deleteGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        if (!isValidId(groupId)) return res.status(400).json({ success: false, message: "Invalid group id" });

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });

        // Only creator can delete
        if (group.createdBy.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: "Only the creator can delete the group" });
        }

        await Group.findByIdAndDelete(groupId);
        // Clean up messages
        await GroupMessage.deleteMany({ groupId });

        // Emit to the room that group is deleted, then empty the room
        io.to(groupRoom(groupId)).emit("groupDeleted", groupId);
        io.in(groupRoom(groupId)).socketsLeave(groupRoom(groupId));

        return res.json({ success: true, message: "Group deleted successfully" });
    } catch (err) {
        console.error("deleteGroup error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};


// ============================
// REMOVE MEMBER FROM GROUP
// ============================
exports.removeMember = async (req, res) => {
    try {
        const { groupId, memberId } = req.params;
        if (!isValidId(groupId) || !isValidId(memberId)) {
            return res.status(400).json({ success: false, message: "Invalid id" });
        }

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });

        // Only creator can remove others
        if (group.createdBy.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: "Not authorized to remove members" });
        }

        // Don't allow removing the creator
        if (group.createdBy.toString() === memberId) {
            return res.status(400).json({ success: false, message: "Cannot remove the group creator" });
        }
        if (!isMemberOf(group, memberId)) {
            return res.status(400).json({ success: false, message: "User is not in this group" });
        }

        group.members = group.members.filter(m => m.toString() !== memberId);
        await group.save();
        const populated = await populateGroup(groupId);

        // Removed member must stop receiving this group's messages
        io.in(memberId).socketsLeave(groupRoom(groupId));
        io.to(memberId).emit("removedFromGroup", { groupId });
        emitGroupUpdated(populated);

        return res.json({ success: true, group: populated });
    } catch (err) {
        console.error("removeMember error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};


// ============================
// LEAVE GROUP
// ============================
exports.leaveGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;
        if (!isValidId(groupId)) return res.status(400).json({ success: false, message: "Invalid group id" });

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });
        if (!isMemberOf(group, userId)) return res.status(400).json({ success: false, message: "Not a member" });

        // Remove the user from members
        group.members = group.members.filter(m => m.toString() !== userId);
        io.in(userId).socketsLeave(groupRoom(groupId));

        // If no members left, delete group and messages
        if (group.members.length === 0) {
            await Group.findByIdAndDelete(groupId);
            await GroupMessage.deleteMany({ groupId });
            io.to(userId).emit("leftGroup", { groupId });
            return res.json({ success: true, message: "Left group and group deleted as no members remain" });
        }

        // If the leaving user was the creator, transfer ownership to first member
        if (group.createdBy.toString() === userId) {
            group.createdBy = group.members[0];
        }

        await group.save();
        const populated = await populateGroup(groupId);

        emitGroupUpdated(populated);
        io.to(userId).emit("leftGroup", { groupId });

        return res.json({ success: true, group: populated });
    } catch (err) {
        console.error("leaveGroup error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// ============================
// ADD MEMBER TO GROUP
// ============================
exports.addMember = async (req, res) => {
    try {
        const { groupId } = req.params;
        const email = str((req.body || {}).email).trim().toLowerCase();
        if (!isValidId(groupId)) return res.status(400).json({ success: false, message: "Invalid group id" });

        if (!email) {
            return res.status(400).json({ success: false, message: "Member email is required" });
        }

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });

        // Only creator can add others
        if (group.createdBy.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: "Not authorized to add members" });
        }

        const newMember = await User.findOne({ email }).collation({ locale: "en", strength: 2 }).select("_id");
        if (!newMember) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Check if already in group
        if (isMemberOf(group, newMember._id)) {
            return res.status(400).json({ success: false, message: "User is already in the group" });
        }

        group.members.push(newMember._id);
        await group.save();

        const populatedGroup = await populateGroup(groupId);
        const newMemberId = newMember._id.toString();

        io.in(newMemberId).socketsJoin(groupRoom(groupId));
        emitGroupUpdated(populatedGroup);
        io.to(newMemberId).emit("addedToGroup", populatedGroup);

        return res.json({ success: true, group: populatedGroup });
    } catch (err) {
        console.error("addMember error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};
