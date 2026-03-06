const express = require("express");
const router = express.Router();

const { getUsersForSidebar, getMessages, sendMessage, deleteMessage, getPublicKey } = require("../controllers/message");
const { auth } = require("../middleware/auth");
const upload = require("../config/multer");

router.get("/users", auth, getUsersForSidebar);
router.get("/keys/:id", auth, getPublicKey);
router.get("/:id", auth, getMessages);
router.post("/send/:id", auth, upload.single("image"), sendMessage);
router.delete("/:id", auth, deleteMessage);
//router.post("/:id/mark-read", auth, markMessagesRead);

module.exports = router;