const { Server } = require("socket.io");
const http = require("http");
const express = require("express");
const { registerWebRTCEvents } = require("../controllers/webrtc");

const app = express();
const server = http.createServer(app);

// 🔹 Store online users (userId -> socketId)
const userSocketMap = new Map();

// Removing strict array since we allow dynamic Socket.io connections 
// const allowedSocketOrigins = [
//   /^http:\/\/localhost:\d+$/,
//   process.env.FRONTEND_URL,
// ].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow all origins to seamlessly support standalone and monolith deployment
      callback(null, true);
    },
    credentials: true,
  },
});

//  Helper function used in message controller 
const getReceiverSocketId = (userId) => {
  return userSocketMap.get(String(userId));
};

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  if (userId) {
    userSocketMap.set(userId, socket.id); // Keeping for legacy/presence check if needed
    socket.join(userId); // Join a room named after the userId
  }

  // 🔹 Broadcast updated online users list
  io.emit("getOnlineUsers", Array.from(userSocketMap.keys()));

  // 🔹 Register WebRTC events (1-1 and group video calls)
  registerWebRTCEvents(io, socket, userSocketMap);

  // 🔹 Group Chat — join a group's socket room
  socket.on("joinGroup", (groupId) => {
    socket.join(`group:${groupId}`);
  });

  // 🔹 Group Chat — leave a group's socket room
  socket.on("leaveGroup", (groupId) => {
    socket.leave(`group:${groupId}`);
  });

  socket.on("disconnect", () => {
    if (userId) {
      // Small delay to check if user has other sockets before removing from onlineUsers
      setTimeout(() => {
        const hasOtherSockets = io.sockets.adapter.rooms.get(userId)?.size > 0;
        if (!hasOtherSockets) {
          userSocketMap.delete(userId);
          io.emit("getOnlineUsers", Array.from(userSocketMap.keys()));
        }
      }, 1000);
    }
  });
});

module.exports = {
  io,
  app,
  server,
  getReceiverSocketId,
};