const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/auth");
const {
    createGroup,
    getMyGroups,
    getGroupMessages,
    sendGroupMessage,
    deleteGroupMessage,
    deleteGroup,
    removeMember,
    leaveGroup,
    addMember,
    getGroupKeys
} = require("../controllers/group");
const upload = require("../config/multer");

// Group routes
router.post("/create", auth, createGroup);
router.get("/my-groups", auth, getMyGroups);
router.get("/:groupId/messages", auth, getGroupMessages);
router.get("/:groupId/keys", auth, getGroupKeys);
router.post("/:groupId/send", auth, upload.single("image"), sendGroupMessage);
router.delete("/:groupId/messages/:messageId", auth, deleteGroupMessage);
router.delete("/:groupId", auth, deleteGroup);

// Member management
router.delete("/:groupId/remove/:memberId", auth, removeMember);
router.post("/:groupId/leave", auth, leaveGroup);
router.post("/:groupId/add", auth, addMember);

module.exports = router;
