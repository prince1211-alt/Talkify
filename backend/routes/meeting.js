const express = require("express");
const router = express.Router();
const multer = require("multer");

const { summarizeMeeting } = require("../controllers/meeting");
const { auth } = require("../middleware/auth"); // Assuming users must be authenticated

// Configure multer for file uploads, storing temporarily in "uploads/" directory
const upload = multer({ dest: "uploads/" });

// Expected form-data field name from the frontend must be "audio"
// This route is protected by `auth` middleware
router.post("/summarize", auth, upload.single("audio"), summarizeMeeting);

module.exports = router;
