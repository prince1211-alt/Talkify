// controllers/webrtc.js
//
// Call signaling. The server keeps track of every active call so that:
//   - group calls form a full mesh (every participant connects to every other one),
//   - signaling is only relayed between participants of the same call,
//   - messages go to the one tab that joined the call, not to all of a user's tabs,
//   - callers get "busy" / "no answer" / "declined" feedback,
//   - a closed tab or lost connection removes the user from the call.
//
// Client -> server events
//   call:start       { to } | { groupId }               ack -> { ok, callId, isGroup, title, participants }
//   call:accept      { callId }                         ack -> { ok, callId, isGroup, title, participants }
//   call:reject      { callId }
//   call:leave       { callId }
//   call:signal      { callId, to, description?, candidate? }
//   call:media-state { callId, audio, video, recording }
//   call:rejoin      { callId }                         ack -> { ok, participants }   (after a socket reconnect)
//
// Server -> client events
//   call:incoming, call:user-joined, call:user-left, call:declined,
//   call:ended { reason }, call:cancelled { reason }, call:signal, call:media-state

const crypto = require("crypto");
const mongoose = require("mongoose");
const Group = require("../models/Group");
const User = require("../models/User");

const RING_TIMEOUT_MS = 45 * 1000;
const RECONNECT_GRACE_MS = 15 * 1000; // a dropped socket gets this long to come back before leaving the call
const MAX_SDP_LENGTH = 100000;

// callId -> { id, isGroup, groupId, title, participants: Map<userId, socketId>, invited: Set<userId>,
//            names: Map<userId, name>, ringTimer, reconnectTimers: Map<userId, timer> }
const calls = new Map();

const isValidId = (id) => mongoose.isObjectIdOrHexString(id);
const isUserInCall = (userId) => [...calls.values()].some((call) => call.participants.has(userId));
// In a call, or currently being rung by one
const isUserBusy = (userId) =>
  [...calls.values()].some((call) => call.participants.has(userId) || call.invited.has(userId));
const findGroupCall = (groupId) => [...calls.values()].find((call) => call.groupId === groupId);

const splitList = (value) =>
  String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// GET /api/call/ice-servers — STUN/TURN config comes from the server environment
// so TURN credentials can be changed without rebuilding the frontend.
const getIceServers = (req, res) => {
  const stunUrls = splitList(process.env.STUN_URLS || "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302");
  const iceServers = [{ urls: stunUrls }];

  const turnUrls = splitList(process.env.TURN_URLS);
  if (turnUrls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: turnUrls,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  } else {
    // Public demo relay used by the original code. It is shared and rate limited:
    // set TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL for reliable calls across networks.
    iceServers.push({
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    });
  }

  res.json({ iceServers });
};

const registerWebRTCEvents = (io, socket) => {
  const userId = socket.data.userId;
  const userName = socket.data.fullName || "Someone";

  const reply = (cb, payload) => {
    if (typeof cb === "function") cb(payload);
  };

  const isOnline = (uid) => (io.sockets.adapter.rooms.get(uid)?.size || 0) > 0;

  const emitToParticipants = (call, event, payload, exceptUserId) => {
    for (const [uid, socketId] of call.participants) {
      if (uid !== exceptUserId) io.to(socketId).emit(event, payload);
    }
  };

  const participantList = (call, exceptUserId) =>
    [...call.participants.keys()]
      .filter((uid) => uid !== exceptUserId)
      .map((uid) => ({ userId: uid, name: call.names.get(uid) || "" }));

  const endCall = (call, reason) => {
    clearTimeout(call.ringTimer);
    call.reconnectTimers.forEach((timer) => clearTimeout(timer));
    if (!calls.delete(call.id)) return;
    const payload = { callId: call.id, reason };
    emitToParticipants(call, "call:ended", payload);
    for (const uid of call.invited) io.to(uid).emit("call:cancelled", payload);
  };

  const leaveCall = (call, leavingUserId) => {
    clearTimeout(call.reconnectTimers.get(leavingUserId));
    call.reconnectTimers.delete(leavingUserId);
    if (!call.participants.delete(leavingUserId)) return;

    // In a 1-1 call, either side hanging up ends it (also cancels ringing)
    if (!call.isGroup || call.participants.size === 0) {
      endCall(call, "ended");
      return;
    }
    emitToParticipants(call, "call:user-left", { callId: call.id, userId: leavingUserId });
  };

  const joinCall = (call, cb) => {
    call.invited.delete(userId);
    const existing = participantList(call, userId);

    call.participants.set(userId, socket.id);
    call.names.set(userId, userName);

    emitToParticipants(call, "call:user-joined", { callId: call.id, userId, name: userName }, userId);
    // Stop the ringing in the user's other tabs/devices
    socket.to(userId).emit("call:cancelled", { callId: call.id, reason: "answered-elsewhere" });

    reply(cb, {
      ok: true,
      callId: call.id,
      isGroup: call.isGroup,
      groupId: call.groupId,
      title: call.isGroup ? call.title : existing[0]?.name || call.title,
      participants: existing,
    });
  };

  const createCall = ({ isGroup, groupId = null, title }) => {
    const call = {
      id: crypto.randomUUID(),
      isGroup,
      groupId,
      title,
      participants: new Map([[userId, socket.id]]),
      invited: new Set(),
      names: new Map([[userId, userName]]),
      ringTimer: null,
      reconnectTimers: new Map(),
    };
    calls.set(call.id, call);
    return call;
  };

  const ringInvitees = (call) => {
    const incoming = {
      callId: call.id,
      from: userId,
      fromName: userName,
      isGroup: call.isGroup,
      groupId: call.groupId,
      groupName: call.isGroup ? call.title : null,
    };
    for (const uid of call.invited) io.to(uid).emit("call:incoming", incoming);

    call.ringTimer = setTimeout(() => {
      if (!calls.has(call.id)) return;
      for (const uid of call.invited) io.to(uid).emit("call:cancelled", { callId: call.id, reason: "missed" });
      call.invited.clear();
      if (call.participants.size <= 1) endCall(call, "no-answer");
    }, RING_TIMEOUT_MS);
  };

  // 🔹 1️⃣ Start a call (or join the group's ongoing call)
  socket.on("call:start", async (payload, cb) => {
    try {
      const { to, groupId } = payload || {};
      if (isUserInCall(userId)) return reply(cb, { ok: false, error: "You are already in a call" });

      if (groupId) {
        if (!isValidId(groupId)) return reply(cb, { ok: false, error: "Invalid group" });
        const group = await Group.findById(groupId).populate("members", "fullName");
        if (!group || !group.members.some((m) => String(m._id) === userId)) {
          return reply(cb, { ok: false, error: "Group not found" });
        }

        const ongoing = findGroupCall(String(group._id));
        if (ongoing) return joinCall(ongoing, cb);
        if (isUserInCall(userId)) return reply(cb, { ok: false, error: "You are already in a call" });

        const invitees = group.members.filter((m) => {
          const id = String(m._id);
          return id !== userId && isOnline(id) && !isUserBusy(id);
        });
        if (invitees.length === 0) {
          return reply(cb, { ok: false, error: "No other group members are available right now" });
        }

        const call = createCall({ isGroup: true, groupId: String(group._id), title: group.name });
        invitees.forEach((m) => {
          call.invited.add(String(m._id));
          call.names.set(String(m._id), m.fullName);
        });
        ringInvitees(call);
        return reply(cb, { ok: true, callId: call.id, isGroup: true, groupId: call.groupId, title: call.title, participants: [] });
      }

      const target = String(to || "");
      if (!isValidId(target) || target === userId) return reply(cb, { ok: false, error: "Invalid user" });

      const targetUser = await User.findById(target).select("fullName");
      if (!targetUser) return reply(cb, { ok: false, error: "User not found" });
      if (!isOnline(target)) return reply(cb, { ok: false, error: `${targetUser.fullName} is offline` });
      if (isUserBusy(target)) return reply(cb, { ok: false, error: `${targetUser.fullName} is on another call` });
      if (isUserInCall(userId)) return reply(cb, { ok: false, error: "You are already in a call" });

      const call = createCall({ isGroup: false, title: targetUser.fullName });
      call.invited.add(target);
      call.names.set(target, targetUser.fullName);
      ringInvitees(call);
      return reply(cb, { ok: true, callId: call.id, isGroup: false, title: targetUser.fullName, participants: [] });
    } catch (error) {
      console.error("call:start error:", error.message);
      return reply(cb, { ok: false, error: "Could not start the call" });
    }
  });

  // 🔹 2️⃣ Receiver accepts
  socket.on("call:accept", (payload, cb) => {
    const call = calls.get(payload?.callId);
    if (!call) return reply(cb, { ok: false, error: "This call has already ended" });
    if (!call.invited.has(userId)) return reply(cb, { ok: false, error: "You are not invited to this call" });
    if (isUserInCall(userId)) return reply(cb, { ok: false, error: "You are already in another call" });
    joinCall(call, cb);
  });

  // 🔹 3️⃣ Receiver declines
  socket.on("call:reject", (payload) => {
    const call = calls.get(payload?.callId);
    if (!call || !call.invited.has(userId)) return;

    call.invited.delete(userId);
    socket.to(userId).emit("call:cancelled", { callId: call.id, reason: "declined" });

    if (!call.isGroup) {
      endCall(call, "rejected");
      return;
    }
    emitToParticipants(call, "call:declined", { callId: call.id, userId, name: userName });
    if (call.invited.size === 0 && call.participants.size <= 1) endCall(call, "no-answer");
  });

  // 🔹 4️⃣ Hang up / leave
  socket.on("call:leave", (payload) => {
    const call = calls.get(payload?.callId);
    if (call && call.participants.get(userId) === socket.id) leaveCall(call, userId);
  });

  // 🔹 5️⃣ SDP + ICE relay, only between participants of the same call
  socket.on("call:signal", (payload) => {
    const { callId, to, description, candidate } = payload || {};
    const call = calls.get(callId);
    if (!call || call.participants.get(userId) !== socket.id) return;

    const targetSocketId = call.participants.get(String(to));
    if (!targetSocketId) return;

    if (description) {
      const validDescription =
        typeof description.type === "string" &&
        typeof description.sdp === "string" &&
        description.sdp.length <= MAX_SDP_LENGTH;
      if (!validDescription) return;
    }
    if (!description && !candidate) return;

    io.to(targetSocketId).emit("call:signal", { callId, from: userId, description, candidate });
  });

  // 🔹 6️⃣ Mic / camera / recording indicators for the other participants
  socket.on("call:media-state", (payload) => {
    const { callId, audio, video, recording } = payload || {};
    const call = calls.get(callId);
    if (!call || call.participants.get(userId) !== socket.id) return;

    emitToParticipants(
      call,
      "call:media-state",
      { callId, userId, audio: Boolean(audio), video: Boolean(video), recording: Boolean(recording) },
      userId
    );
  });

  // 🔹 7️⃣ Socket came back after a network blip: re-attach to the call
  socket.on("call:rejoin", (payload, cb) => {
    const call = calls.get(payload?.callId);
    if (!call || !call.participants.has(userId)) return reply(cb, { ok: false });

    clearTimeout(call.reconnectTimers.get(userId));
    call.reconnectTimers.delete(userId);
    call.participants.set(userId, socket.id);
    reply(cb, { ok: true, participants: participantList(call, userId) });
  });

  // 🔹 8️⃣ Lost connection: leave the call unless the user reconnects within the grace period
  // (closing the tab sends call:leave right away)
  socket.on("disconnect", () => {
    for (const call of [...calls.values()]) {
      if (call.participants.get(userId) !== socket.id) continue;

      clearTimeout(call.reconnectTimers.get(userId));
      call.reconnectTimers.set(
        userId,
        setTimeout(() => {
          call.reconnectTimers.delete(userId);
          if (calls.get(call.id) === call && call.participants.get(userId) === socket.id) {
            leaveCall(call, userId);
          }
        }, RECONNECT_GRACE_MS)
      );
    }
  });
};

module.exports = {
  registerWebRTCEvents,
  getIceServers,
};
