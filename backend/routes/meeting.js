const express = require("express");
const os = require("os");
const path = require("path");
const router = express.Router();
const multer = require("multer");

const { summarizeMeeting } = require("../controllers/meeting");
const { auth } = require("../middleware/auth");

// Temporary files go to the OS temp dir (not the project folder) and are deleted after processing.
// 25 MB is Groq Whisper's upload limit.
const upload = multer({
    dest: path.join(os.tmpdir(), "talkify-audio"),
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const ok = file.mimetype.startsWith("audio/") || file.mimetype.startsWith("video/webm");
        cb(ok ? null : new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname), ok);
    },
});

// Expected form-data field name from the frontend must be "audio"
router.post("/summarize", auth, upload.single("audio"), summarizeMeeting);

module.exports = router;
