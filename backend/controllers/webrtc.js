// controllers/webrtcController.js

const registerWebRTCEvents = (io, socket, userSocketMap) => {

  // 🔹 1️⃣ When Video Call Icon Pressed
  socket.on("webrtc:call-request", ({ to, from }) => {
    console.log(`[WebRTC] Call request from ${from} to ${to}`);
    // Emit to the receiver's room (all their tabs)
    io.to(to).emit("webrtc:incoming-call", { from });
  });

  // 🔹 2️⃣ Receiver Accepts Call
  socket.on("webrtc:call-accepted", ({ to }) => {
    const from = socket.handshake.query.userId;
    console.log(`[WebRTC] Call accepted by ${from}. Notifying ${to} to start offer.`);
    io.to(to).emit("webrtc:start-offer", { from });
  });

  // 🔹 3️⃣ Caller Sends Offer
  socket.on("webrtc:offer", ({ to, offer }) => {
    const from = socket.handshake.query.userId;
    console.log(`[WebRTC] Offer from ${from} to ${to}`);
    io.to(to).emit("webrtc:receive-offer", { from, offer });
  });

  // 🔹 4️⃣ Receiver Sends Answer
  socket.on("webrtc:answer", ({ to, answer }) => {
    const from = socket.handshake.query.userId;
    console.log(`[WebRTC] Answer from ${from} to ${to}`);
    io.to(to).emit("webrtc:receive-answer", { from, answer });
  });

  // 🔹 5️⃣ ICE Candidate Exchange
  socket.on("webrtc:ice-candidate", ({ to, candidate }) => {
    const from = socket.handshake.query.userId;
    // We log ICE candidates sparingly as they are many
    io.to(to).emit("webrtc:ice-candidate", { from, candidate });
  });

  // 🔹 6️⃣ Reject Call
  socket.on("webrtc:reject-call", ({ to }) => {
    const from = socket.handshake.query.userId;
    console.log(`[WebRTC] Call rejected by ${from} for ${to}`);
    io.to(to).emit("webrtc:call-rejected", { from });
  });

  // 🔹 7️⃣ End Call
  socket.on("webrtc:end-call", ({ to, groupId }) => {
    const from = socket.handshake.query.userId;
    console.log(`[WebRTC] End-call signal from ${from}. Target: ${to}, Group: ${groupId || "none"}`);

    if (to === "all" && groupId) {
      // Broadcast to the entire group room except sender
      socket.to(`group:${groupId}`).emit("webrtc:call-ended", { from });
    } else if (to) {
      // Individual notification
      io.to(to).emit("webrtc:call-ended", { from });
    }
  });

};

module.exports = {
  registerWebRTCEvents,
};