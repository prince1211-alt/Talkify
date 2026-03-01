const express = require("express");
const router = express.Router();

const { getUsersForSidebar, getMessages, sendMessage } = require("../controllers/message");
const { auth } = require("../middleware/auth");

router.get("/users", auth, getUsersForSidebar);
router.get("/:id", auth, getMessages);
router.post("/send/:id", auth, sendMessage);

module.exports = router;