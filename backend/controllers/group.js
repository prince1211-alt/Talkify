const Group = require("../models/Group");
const GroupMessage = require("../models/GroupMessage");
const User = require("../models/User");
const { io, getReceiverSocketId } = require("../config/socketio");
const cloudinary = require("../config/cloudinary");

// ============================
// CREATE GROUP
// ============================
exports.createGroup = async (req, res) => {
    try {
        const { name, memberIds } = req.body;
        const creatorId = req.user._id || req.user.id;

        if (!name || !memberIds || memberIds.length === 0) {
            return res.status(400).json({ success: false, message: "Name and at least one member required" });
        }

        // Always include creator in members
        const allMembers = Array.from(new Set([...memberIds, creatorId.toString()]));

        const group = await Group.create({
            name,
            members: allMembers,
            createdBy: creatorId,
        });

        const populated = await Group.findById(group._id).populate("members", "-password");
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
        const userId = req.user._id || req.user.id;

        const groups = await Group.find({ members: userId })
            .populate("members", "-password")
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
        const userId = req.user._id || req.user.id;

        // Verify user is a member
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });

        const isMember = group.members.some((m) => m.toString() === userId.toString());
        if (!isMember) return res.status(403).json({ success: false, message: "Not a member" });

        const messages = await GroupMessage.find({ groupId })
            .populate("senderId", "fullName profilePic")
            .sort({ createdAt: 1 });

        // Map messages to ensure senderName is accurate even for old messages
        const mappedMessages = messages.map(msg => {
            const doc = msg.toObject();
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
// SEND GROUP MESSAGE (supports optional image via multipart)
// ============================
exports.sendGroupMessage = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { text, encryptedKeysMap, iv } = req.body;
        const userId = req.user._id || req.user.id;

        const user = await User.findById(userId);
        const senderName = user?.fullName || "Unknown";
        const senderId = userId;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });

        const isMember = group.members.some((m) => m.toString() === senderId.toString());
        if (!isMember) return res.status(403).json({ success: false, message: "Not a member" });

        let imageUrl = "";
        if (req.file) {
            const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
            const upload = await cloudinary.uploader.upload(dataUri);
            imageUrl = upload.secure_url || "";
        }

        const message = await GroupMessage.create({
            groupId,
            senderId,
            senderName,
            text,
            encryptedKeysMap,
            iv,
            image: imageUrl
        });

        // Emit to socket room for this group
        // Convert to plain object so Mongoose Map serializes correctly for all clients
        const messageObj = message.toObject();
        // Convert the Mongoose Map to a plain object for socket emission
        if (messageObj.encryptedKeysMap instanceof Map) {
            messageObj.encryptedKeysMap = Object.fromEntries(messageObj.encryptedKeysMap);
        }
        io.to(`group:${groupId}`).emit("newGroupMessage", messageObj);

        return res.status(201).json(messageObj);
    } catch (err) {
        console.error("sendGroupMessage error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// ============================
// GET GROUP PUBLIC KEYS
// ============================
exports.getGroupKeys = async (req, res) => {
    try {
        const { groupId } = req.params;
        const group = await Group.findById(groupId).populate("members", "publicKey");
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });

        const keysMap = {};
        group.members.forEach(member => {
            keysMap[member._id.toString()] = member.publicKey;
        });

        return res.json({ success: true, keysMap });
    } catch (err) {
        console.error("getGroupKeys error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// ============================
// DELETE GROUP MESSAGE (soft)
// ============================
exports.deleteGroupMessage = async (req, res) => {
    try {
        const { groupId, messageId } = req.params;
        const userId = req.user._id || req.user.id;

        const message = await GroupMessage.findById(messageId);
        if (!message) return res.status(404).json({ success: false, message: "Message not found" });

        if (message.senderId.toString() !== userId.toString() && !req.user.isAdmin) {
            return res.status(403).json({ success: false, message: "Not authorized to delete this message" });
        }

        message.deleted = true;
        await message.save();

        io.to(`group:${groupId}`).emit("messageDeleted", {
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
        const userId = req.user._id || req.user.id;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });

        // Only creator can delete
        if (group.createdBy.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: "Only the creator can delete the group" });
        }

        await Group.findByIdAndDelete(groupId);
        // Clean up messages
        await GroupMessage.deleteMany({ groupId });

        // Emit to the room that group is deleted
        io.to(`group:${groupId}`).emit("groupDeleted", groupId);

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
        const userId = req.user._id || req.user.id;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });

        // Only creator or admin can remove others
        if (group.createdBy.toString() !== userId.toString() && !req.user.isAdmin) {
            return res.status(403).json({ success: false, message: "Not authorized to remove members" });
        }

        // Don't allow removing the creator
        if (group.createdBy.toString() === memberId.toString()) {
            return res.status(400).json({ success: false, message: "Cannot remove the group creator" });
        }

        group.members = group.members.filter(m => m.toString() !== memberId.toString());
        await group.save();

        // Notify group room of updated members
        io.to(`group:${groupId}`).emit("groupUpdated", { groupId, members: group.members });

        // Notify removed member directly
        io.to(memberId).emit("removedFromGroup", { groupId });

        return res.json({ success: true, group });
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
        const userId = req.user._id || req.user.id;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });

        // Remove the user from members
        group.members = group.members.filter(m => m.toString() !== userId.toString());

        // If no members left, delete group and messages
        if (group.members.length === 0) {
            await Group.findByIdAndDelete(groupId);
            await GroupMessage.deleteMany({ groupId });
            io.to(`group:${groupId}`).emit("groupDeleted", groupId);
            return res.json({ success: true, message: "Left group and group deleted as no members remain" });
        }

        // If the leaving user was the creator, transfer ownership to first member
        if (group.createdBy.toString() === userId.toString()) {
            group.createdBy = group.members[0];
        }

        await group.save();

        io.to(`group:${groupId}`).emit("groupUpdated", { groupId, members: group.members });
        io.to(userId).emit("leftGroup", { groupId });

        return res.json({ success: true, group });
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
        const { uniqueId } = req.body;
        const userId = req.user._id || req.user.id;

        if (!uniqueId) {
            return res.status(400).json({ success: false, message: "Member uniqueId is required" });
        }

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });

        // Only creator or admin can add others
        if (group.createdBy.toString() !== userId.toString() && !req.user.isAdmin) {
            return res.status(403).json({ success: false, message: "Not authorized to add members" });
        }

        const newMember = await User.findOne({ uniqueId });
        if (!newMember) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Check if already in group
        if (group.members.includes(newMember._id)) {
            return res.status(400).json({ success: false, message: "User is already in the group" });
        }

        group.members.push(newMember._id);
        await group.save();

        const populatedGroup = await Group.findById(groupId).populate("members", "-password");

        // Notify group room of updated members
        io.to(`group:${groupId}`).emit("groupUpdated", { groupId, members: populatedGroup.members });

        // Notify added member directly
        io.to(newMember._id.toString()).emit("addedToGroup", populatedGroup);

        return res.json({ success: true, group: populatedGroup });
    } catch (err) {
        console.error("addMember error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};
