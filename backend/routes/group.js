const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/auth");
const {
    createGroup,
    getMyGroups,
    getGroupMessages,
    sendGroupMessage,
    deleteGroup,
    deleteGroupMessage,
    removeMember,
    leaveGroup,
} = require("../controllers/group");
const upload = require("../config/multer");

router.post("/create", auth, createGroup);
router.get("/my", auth, getMyGroups);
router.get("/:groupId/messages", auth, getGroupMessages);
router.post("/:groupId/send", auth, upload.single("image"), sendGroupMessage);
router.delete("/:groupId", auth, deleteGroup);
router.delete("/:groupId/messages/:messageId", auth, deleteGroupMessage);
router.delete("/:groupId/members/:memberId", auth, removeMember);
router.post("/:groupId/leave", auth, leaveGroup);

module.exports = router;
