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
} = require("../controllers/group");
const upload = require("../config/multer");

router.post("/create", auth, createGroup);
router.get("/my", auth, getMyGroups);
router.get("/:groupId/messages", auth, getGroupMessages);
router.post("/:groupId/send", auth, upload.single("image"), sendGroupMessage);
router.delete("/:groupId", auth, deleteGroup);
router.delete("/:groupId/messages/:messageId", auth, deleteGroupMessage);

module.exports = router;
