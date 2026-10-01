const dotenv = require("dotenv");
dotenv.config();

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const multer = require("multer");

const missingEnv = ["MONGODB_URL", "JWT_SECRET"].filter((name) => !process.env[name]);
if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

const { connect } = require("./config/database.js");
const {
  rejectDisallowedOrigins,
  corsOptionsDelegate,
  describeAllowedOrigins,
  isProduction,
} = require("./config/cors.js");
const { describeMailProvider } = require("./utils/mailSender.js");

const userRoutes = require("./routes/User.js");
const messageRoutes = require("./routes/Message.js");
const meetingRoutes = require("./routes/meeting.js");
const groupRoutes = require("./routes/group.js");
const callRoutes = require("./routes/call.js");
const { app, server } = require("./config/socketio.js");

const PORT = process.env.PORT || 5000;

// Render / Railway / Heroku put a proxy in front of the app (needed for req.ip and secure cookies)
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Only the frontend(s) listed in FRONTEND_URL (plus same origin, plus localhost in dev) may call the API
app.use(rejectDisallowedOrigins);
app.use(cors(corsOptionsDelegate));

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/health", (req, res) => res.json({ success: true }));
app.use("/api/auth", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/meeting", meetingRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/call", callRoutes);

// Unknown API routes return JSON instead of the frontend's index.html
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

if (isProduction()) {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("/*path", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}

// Central error handler (bad JSON, upload limits, unexpected errors)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const message = err.code === "LIMIT_FILE_SIZE" ? "File is too large" : "Unsupported file";
    return res.status(status).json({ success: false, message });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "Request is too large" });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Invalid JSON body" });
  }
  console.error("Unhandled error:", err);
  return res.status(500).json({ success: false, message: "Server error" });
});

server.listen(PORT, () => {
  console.log("server is running on PORT:" + PORT);
  if (isProduction() && !process.env.FRONTEND_URL) {
    console.warn("⚠️  FRONTEND_URL is not set: only the same-origin frontend can use this API.");
  }
  console.log("Allowed frontend origins:", describeAllowedOrigins());
  console.log("Email provider:", describeMailProvider());
  connect();
});
