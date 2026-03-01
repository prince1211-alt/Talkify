const Group = require("../models/Group");
const GroupMessage = require("../models/GroupMessage");
const User = require("../models/User");
const { io, getReceiverSocketId } = require("../config/socketio");

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
// SEND GROUP MESSAGE
// ============================
exports.sendGroupMessage = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { text } = req.body;
        const userId = req.user._id || req.user.id;

        const user = await User.findById(userId);
        const senderName = user?.fullName || "Unknown";
        const senderId = userId;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });

        const isMember = group.members.some((m) => m.toString() === senderId.toString());
        if (!isMember) return res.status(403).json({ success: false, message: "Not a member" });

        const message = await GroupMessage.create({ groupId, senderId, senderName, text });

        // Emit to socket room for this group
        io.to(`group:${groupId}`).emit("newGroupMessage", message);

        return res.status(201).json(message);
    } catch (err) {
        console.error("sendGroupMessage error:", err);
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
