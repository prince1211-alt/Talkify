const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/auth");
const {
    createGroup,
    getMyGroups,
    getGroupMessages,
    sendGroupMessage,
    deleteGroup,
} = require("../controllers/group");

router.post("/create", auth, createGroup);
router.get("/my", auth, getMyGroups);
router.get("/:groupId/messages", auth, getGroupMessages);
router.post("/:groupId/send", auth, sendGroupMessage);
router.delete("/:groupId", auth, deleteGroup);

module.exports = router;
