const registerWebRTCEvents = (io, socket, userSocketMap) => {

  // When Video Call Icon Pressed
  socket.on("webrtc:call-request", ({ to, from }) => {
    // Emit to the receiver's room (all their tabs)
    io.to(to).emit("webrtc:incoming-call", { from });
  });

  //  Receiver Accepts Call
  socket.on("webrtc:call-accepted", ({ to }) => {
    const from = socket.handshake.query.userId;
    io.to(to).emit("webrtc:start-offer", { from });
  });

  //  Caller Sends Offer
  socket.on("webrtc:offer", ({ to, offer }) => {
    const from = socket.handshake.query.userId;
    io.to(to).emit("webrtc:receive-offer", { from, offer });
  });

  // Receiver Sends Answer
  socket.on("webrtc:answer", ({ to, answer }) => {
    const from = socket.handshake.query.userId;
    io.to(to).emit("webrtc:receive-answer", { from, answer });
  });

  //  ICE Candidate Exchange
  socket.on("webrtc:ice-candidate", ({ to, candidate }) => {
    const from = socket.handshake.query.userId;
    // We log ICE candidates sparingly as they are many
    io.to(to).emit("webrtc:ice-candidate", { from, candidate });
  });

  //  Reject Call
  socket.on("webrtc:reject-call", ({ to }) => {
    const from = socket.handshake.query.userId;
    io.to(to).emit("webrtc:call-rejected", { from });
  });

  //  End Call
  socket.on("webrtc:end-call", ({ to, groupId }) => {
    const from = socket.handshake.query.userId;

    if (to === "all" && groupId) {
      // Broadcast to the entire group room except sender
      socket.to(`group:${groupId}`).emit("webrtc:call-ended", { from });
    } else if (to) {
      // Individual notification
      io.to(to).emit("webrtc:call-ended", { from });
    }
  });

  //  Leave Call (Individual)
  socket.on("webrtc:leave-call", ({ to, groupId }) => {
    const from = socket.handshake.query.userId;

    if (to === "all" && groupId) {
      // Broadcast to the entire group room except sender
      socket.to(`group:${groupId}`).emit("webrtc:user-left", { from });
    } else if (to) {
      // Individual notification
      io.to(to).emit("webrtc:user-left", { from });
    }
  });

};

module.exports = {
  registerWebRTCEvents,
};