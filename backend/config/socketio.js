const { Server } = require("socket.io");
const http = require("http");
const express = require("express");
const mongoose = require("mongoose");
const { registerWebRTCEvents } = require("../controllers/webrtc");
const { verifyAccessToken } = require("../middleware/auth");
const { isOriginAllowed, allowSocketRequest } = require("./cors");
const Group = require("../models/Group");

const app = express();
const server = http.createServer(app);

// 🔹 Online users: userId -> number of open sockets (tabs/devices)
const onlineCounts = new Map();

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    credentials: true,
  },
  // Origin check for both polling and WebSocket (browsers don't apply CORS to WebSockets)
  allowRequest: allowSocketRequest,
});

const broadcastOnlineUsers = () => {
  io.emit("getOnlineUsers", Array.from(onlineCounts.keys()));
};

const isUserOnline = (userId) => onlineCounts.has(String(userId));

// 🔹 Authenticate every socket with the same JWT used for the REST API.
// The user id comes from the verified token, never from the client.
io.use(async (socket, next) => {
  try {
    const result = await verifyAccessToken(socket.handshake.auth?.token);
    if (!result) return next(new Error("Unauthorized"));

    socket.data.userId = String(result.user._id);
    socket.data.fullName = result.user.fullName;
    next();
  } catch (error) {
    console.error("socket auth error:", error.message);
    next(new Error("Server error"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId;

  socket.join(userId); // Room named after the userId (all of the user's tabs)
  onlineCounts.set(userId, (onlineCounts.get(userId) || 0) + 1);
  broadcastOnlineUsers();

  // 🔹 Register WebRTC events (1-1 and group video calls)
  registerWebRTCEvents(io, socket);

  // 🔹 Group Chat — join a group's socket room (members only)
  socket.on("joinGroup", async (groupId) => {
    try {
      if (!mongoose.isObjectIdOrHexString(groupId)) return;
      const isMember = await Group.exists({ _id: groupId, members: userId });
      if (isMember) socket.join(`group:${groupId}`);
    } catch (error) {
      console.error("joinGroup error:", error.message);
    }
  });

  // 🔹 Group Chat — leave a group's socket room
  socket.on("leaveGroup", (groupId) => {
    if (typeof groupId === "string") socket.leave(`group:${groupId}`);
  });

  socket.on("disconnect", () => {
    const remaining = (onlineCounts.get(userId) || 1) - 1;
    if (remaining > 0) {
      onlineCounts.set(userId, remaining);
    } else {
      onlineCounts.delete(userId);
      broadcastOnlineUsers();
    }
  });

  // 🔹 Join all of the user's group rooms (also re-done automatically after a reconnect)
  Group.find({ members: userId })
    .select("_id")
    .then((groups) => groups.forEach((g) => socket.join(`group:${g._id}`)))
    .catch((error) => console.error("auto-join groups error:", error.message));
});

module.exports = {
  io,
  app,
  server,
  isUserOnline,
};
