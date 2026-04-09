const express = require("express");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const path = require("path");

const { connect } = require("./config/database.js");

dotenv.config();

const userRoutes = require("./routes/User.js");
const messageRoutes = require("./routes/Message.js");
const meetingRoutes = require("./routes/meeting.js");
const groupRoutes = require("./routes/group.js");
const { app, server } = require("./config/socketio.js");

const PORT = process.env.PORT || 5001;
// const __dirname = path.resolve();

app.use(express.json());
app.use(cookieParser());

// Removing strict array since we will allow Origin dynamically
// const allowedOrigins = [
//   /^http:\/\/localhost:\d+$/,
//   process.env.FRONTEND_URL,
// ].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow all origins to seamlessly support standalone and monolith deployment
      callback(null, true);
    },
    credentials: true,
  })
);

app.use("/api/auth", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/meeting", meetingRoutes);
app.use("/api/groups", groupRoutes);

if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "Production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("/*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}

server.listen(PORT, () => {
  console.log("server is running on PORT:" + PORT);
  connect();
});
