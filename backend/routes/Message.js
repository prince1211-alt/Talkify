const express = require("express");
const router = express.Router();

const {
    getUsersForSidebar,
    getMessages,
    sendMessage,
    deleteMessage,
    getPublicKey,
    markMessagesRead,
    getEncryptedMedia,
} = require("../controllers/message");
const { auth } = require("../middleware/auth");
const upload = require("../config/multer");

router.get("/users", auth, getUsersForSidebar);
router.get("/keys/:id", auth, getPublicKey);
router.get("/media", auth, getEncryptedMedia);
router.get("/:id", auth, getMessages);
router.post("/send/:id", auth, upload.single("image"), sendMessage);
router.post("/:id/mark-read", auth, markMessagesRead);
router.delete("/:id", auth, deleteMessage);

module.exports = router;
