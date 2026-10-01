import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { useChatStore } from "./useChatStore";
import { startRingtone, stopRingtone } from "../utils/ringtone";

// ---------------------------------------------------------------------------
// Media settings
// ---------------------------------------------------------------------------
// 720p / 30fps capture. The encoder lowers resolution or bitrate by itself when the network is weak.
const VIDEO_CONSTRAINTS = {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 },
    facingMode: "user",
};

const AUDIO_CONSTRAINTS = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
};

const SIGNAL_TIMEOUT_MS = 10000;
const INCOMING_RING_TIMEOUT_MS = 50000; // server cancels after 45s; this is a safety net
const DISCONNECTED_RESTART_MS = 4000;
const MAX_ICE_RESTARTS = 3;
const FALLBACK_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

// ---------------------------------------------------------------------------
// WebRTC objects are kept outside React state (they are mutable and not serializable)
// ---------------------------------------------------------------------------
// userId -> { pc, polite, makingOffer, ignoreOffer, queue, stream, restartTimer, restarts }
const peers = new Map();
let localStream = null;
let iceServers = FALLBACK_ICE_SERVERS;
let iceServersFetchedAt = 0;
let attemptSeq = 0; // invalidates async steps of a call that was hung up meanwhile
let incomingRingTimer = null;
let videoToggleInFlight = false;

const getSocket = () => useChatStore.getState().socket;

const getMyId = () => {
    const authUser = useAuthStore.getState().authUser;
    return authUser ? String(authUser._id || authUser.id) : "";
};

const stopStream = (stream) => stream?.getTracks().forEach((track) => track.stop());

const emitWithAck = async (event, payload) => {
    const socket = getSocket();
    if (!socket?.connected) return { ok: false, error: "Not connected to the server. Check your internet connection." };
    try {
        return await socket.timeout(SIGNAL_TIMEOUT_MS).emitWithAck(event, payload);
    } catch {
        return { ok: false, error: "The server did not respond. Please try again." };
    }
};

// STUN/TURN servers come from the backend (TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL)
const loadIceServers = async () => {
    if (Date.now() - iceServersFetchedAt < 10 * 60 * 1000) return;
    try {
        const { data } = await axiosInstance.get("/call/ice-servers");
        if (Array.isArray(data?.iceServers) && data.iceServers.length) {
            iceServers = data.iceServers;
            iceServersFetchedAt = Date.now();
        }
    } catch {
        // keep the public STUN fallback
    }
};

// Camera + mic, falling back to "any camera" and then to audio only
const acquireLocalMedia = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("Calls need a secure (HTTPS) connection and a modern browser.");
        return null;
    }

    for (const constraints of [
        { video: VIDEO_CONSTRAINTS, audio: AUDIO_CONSTRAINTS },
        { video: true, audio: AUDIO_CONSTRAINTS },
    ]) {
        try {
            return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
            console.warn("getUserMedia failed:", error.name);
        }
    }

    try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
        toast("Camera unavailable — joining with audio only.");
        return audioOnly;
    } catch (error) {
        toast.error(
            error.name === "NotAllowedError"
                ? "Microphone permission denied. Allow it in your browser's site settings."
                : "No microphone was found."
        );
        return null;
    }
};

const idleState = {
    callId: null,
    callStatus: "idle", // idle | outgoing | connecting | active
    isGroupCall: false,
    callTitle: "",
    chatTarget: null, // chat the call belongs to: { type: "user" | "group", id }
    callStartedAt: null,
    participants: {}, // userId -> { name, audio, video, recording, connection }
    remoteStreams: {}, // userId -> MediaStream
    mediaVersion: 0, // bumped whenever tracks change, so video elements refresh
    localStream: null,
    isAudioMuted: false,
    isVideoMuted: false,
    isVideoBusy: false,
    isRecording: false,
};

export const useCallStore = create((set, get) => {
    const bump = () => set((state) => ({ mediaVersion: state.mediaVersion + 1 }));

    const updateParticipant = (userId, patch) =>
        set((state) => ({
            participants: {
                ...state.participants,
                [userId]: {
                    name: "",
                    audio: true,
                    video: true,
                    recording: false,
                    connection: "new",
                    ...state.participants[userId],
                    ...patch,
                },
            },
        }));

    const sendSignal = (to, data) => {
        const { callId } = get();
        const socket = getSocket();
        if (callId && socket) socket.emit("call:signal", { callId, to, ...data });
    };

    // Tell the others whether our mic / camera are on and whether we are recording
    const broadcastMediaState = () => {
        const { callId, isAudioMuted, isVideoMuted, isRecording } = get();
        if (!callId) return;
        getSocket()?.emit("call:media-state", {
            callId,
            audio: !isAudioMuted,
            video: !isVideoMuted,
            recording: isRecording,
        });
    };

    // Bitrate is split between peers (group calls are a mesh: we upload one stream per participant).
    // Audio gets network priority so voice stays clear when bandwidth drops.
    const applySenderParameters = async () => {
        const remoteCount = Math.max(1, peers.size);
        const maxVideoBitrate = remoteCount === 1 ? 2_500_000 : Math.max(400_000, Math.floor(4_000_000 / remoteCount));
        const tasks = [];

        for (const { pc } of peers.values()) {
            if (pc.connectionState === "closed") continue;
            for (const sender of pc.getSenders()) {
                if (!sender.track) continue;
                const params = sender.getParameters();
                if (!params.encodings?.length) continue; // not negotiated yet

                if (sender.track.kind === "video") {
                    params.encodings[0].maxBitrate = maxVideoBitrate;
                    params.encodings[0].maxFramerate = 30;
                } else {
                    params.encodings[0].priority = "high";
                    params.encodings[0].networkPriority = "high";
                }
                tasks.push(sender.setParameters(params).catch((err) => console.warn("setParameters failed:", err)));
            }
        }
        await Promise.all(tasks);
    };

    const setLocalStream = (stream) => {
        localStream = stream;
        set((state) => ({
            localStream: stream,
            isAudioMuted: false,
            isVideoMuted: stream.getVideoTracks().length === 0,
            mediaVersion: state.mediaVersion + 1,
        }));
    };

    const closePeer = (peer) => {
        clearTimeout(peer.restartTimer);
        peer.pc.onnegotiationneeded = null;
        peer.pc.onicecandidate = null;
        peer.pc.ontrack = null;
        peer.pc.onconnectionstatechange = null;
        peer.pc.close();
    };

    const removePeer = (userId) => {
        const peer = peers.get(userId);
        if (peer) {
            closePeer(peer);
            peers.delete(userId);
        }
        set((state) => {
            const remoteStreams = { ...state.remoteStreams };
            const participants = { ...state.participants };
            delete remoteStreams[userId];
            delete participants[userId];
            return { remoteStreams, participants, mediaVersion: state.mediaVersion + 1 };
        });
        applySenderParameters();
    };

    const cleanupCall = () => {
        stopRingtone();
        for (const peer of peers.values()) closePeer(peer);
        peers.clear();
        stopStream(localStream);
        localStream = null;
        set({ ...idleState });
    };

    const restartIce = (peer, userId) => {
        if (peers.get(userId) !== peer) return;
        if (peer.restarts >= MAX_ICE_RESTARTS) {
            const name = get().participants[userId]?.name || "the other participant";
            toast.error(`Connection lost with ${name}`);
            if (get().isGroupCall) removePeer(userId);
            else get().hangUp();
            return;
        }
        peer.restarts += 1;
        peer.pc.restartIce(); // triggers negotiationneeded -> new offer with fresh ICE credentials
    };

    // "Perfect negotiation" (https://w3c.github.io/webrtc-pc/#perfect-negotiation-example):
    // either side may renegotiate at any time (camera turned on, ICE restart, ...) and offer
    // collisions are resolved by having exactly one "polite" peer per pair.
    const createPeer = (userId, { initiator }) => {
        const existing = peers.get(userId);
        if (existing) return existing;

        const pc = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
        const peer = {
            pc,
            polite: getMyId() > userId,
            makingOffer: false,
            ignoreOffer: false,
            queue: Promise.resolve(),
            stream: new MediaStream(),
            restartTimer: null,
            restarts: 0,
        };
        peers.set(userId, peer);
        updateParticipant(userId, { connection: "connecting" });

        pc.onnegotiationneeded = async () => {
            try {
                peer.makingOffer = true;
                await pc.setLocalDescription();
                sendSignal(userId, { description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
            } catch (err) {
                console.error("Negotiation error:", err);
            } finally {
                peer.makingOffer = false;
            }
        };

        pc.onicecandidate = ({ candidate }) => {
            if (candidate) sendSignal(userId, { candidate: candidate.toJSON() });
        };

        // One stable MediaStream per participant; tracks are added/removed in place
        pc.ontrack = ({ track }) => {
            if (!peer.stream.getTracks().includes(track)) peer.stream.addTrack(track);
            track.onmute = bump;
            track.onunmute = bump;
            track.onended = () => {
                peer.stream.removeTrack(track);
                bump();
            };
            set((state) => ({
                remoteStreams: { ...state.remoteStreams, [userId]: peer.stream },
                mediaVersion: state.mediaVersion + 1,
            }));
        };

        pc.onconnectionstatechange = () => {
            if (peers.get(userId) !== peer) return;
            const state = pc.connectionState;
            updateParticipant(userId, { connection: state });
            clearTimeout(peer.restartTimer);

            if (state === "connected") {
                peer.restarts = 0;
                stopRingtone();
                if (get().callStatus !== "active") {
                    set({ callStatus: "active", callStartedAt: get().callStartedAt || Date.now() });
                }
                applySenderParameters();
            } else if (state === "disconnected") {
                peer.restartTimer = setTimeout(() => {
                    if (pc.connectionState === "disconnected") restartIce(peer, userId);
                }, DISCONNECTED_RESTART_MS);
            } else if (state === "failed") {
                restartIce(peer, userId);
            }
        };

        localStream?.getTracks().forEach((track) => pc.addTrack(track, localStream));

        // The first offerer also asks to receive what it doesn't send (e.g. joined without a camera)
        if (initiator) {
            for (const kind of ["audio", "video"]) {
                if (!localStream?.getTracks().some((track) => track.kind === kind)) {
                    pc.addTransceiver(kind, { direction: "recvonly" });
                }
            }
        }

        return peer;
    };

    const processSignal = async (peer, from, { description, candidate }) => {
        const { pc } = peer;
        if (pc.signalingState === "closed") return;

        if (description) {
            const offerCollision = description.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
            peer.ignoreOffer = !peer.polite && offerCollision;
            if (peer.ignoreOffer) return;

            await pc.setRemoteDescription(description);
            if (description.type === "offer") {
                await pc.setLocalDescription();
                sendSignal(from, { description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
            }
            applySenderParameters();
        } else if (candidate) {
            try {
                await pc.addIceCandidate(candidate);
            } catch (err) {
                if (!peer.ignoreOffer) console.warn("Could not add ICE candidate:", err);
            }
        }
    };

    // Puts a new camera track on every connection (re-using the video transceiver when there is one)
    const attachVideoTrack = async (peer, track) => {
        const transceiver = peer.pc
            .getTransceivers()
            .find((t) => t.currentDirection !== "stopped" && t.receiver.track?.kind === "video");

        if (!transceiver) {
            peer.pc.addTrack(track, localStream); // renegotiates automatically
            return;
        }

        await transceiver.sender.replaceTrack(track);
        transceiver.sender.setStreams?.(localStream);
        if (transceiver.direction === "recvonly" || transceiver.direction === "inactive") {
            transceiver.direction = "sendrecv"; // renegotiates automatically
        }
    };

    const isCurrentCall = (callId) => {
        const state = get();
        return state.callStatus !== "idle" && (!state.callId || state.callId === callId);
    };

    return {
        ...idleState,
        incomingCall: null, // { callId, from, fromName, isGroup, groupId, groupName }

        // ---------------- actions ----------------
        startCall: async ({ to, groupId, title }) => {
            if (get().callStatus !== "idle" || get().incomingCall) {
                toast.error("Finish the current call first.");
                return;
            }
            if (!getSocket()?.connected) {
                toast.error("Not connected to the server. Check your internet connection.");
                return;
            }

            const attempt = ++attemptSeq;
            set({
                callStatus: "outgoing",
                isGroupCall: Boolean(groupId),
                callTitle: title || "",
                chatTarget: groupId ? { type: "group", id: groupId } : { type: "user", id: to },
            });

            await loadIceServers();
            const stream = await acquireLocalMedia();
            if (attempt !== attemptSeq) return stopStream(stream);
            if (!stream) return cleanupCall();
            setLocalStream(stream);

            const res = await emitWithAck("call:start", groupId ? { groupId } : { to });
            if (attempt !== attemptSeq) {
                if (res?.ok) getSocket()?.emit("call:leave", { callId: res.callId });
                return;
            }
            if (!res?.ok) {
                toast.error(res?.error || "Could not start the call");
                cleanupCall();
                return;
            }

            set({ callId: res.callId, isGroupCall: res.isGroup, callTitle: res.title || title || "" });

            if (res.participants?.length) {
                // A group call was already running: join it
                set({ callStatus: "connecting" });
                res.participants.forEach((p) => {
                    updateParticipant(p.userId, { name: p.name });
                    createPeer(p.userId, { initiator: true });
                });
            } else {
                startRingtone("outgoing");
            }
            broadcastMediaState();
        },

        acceptCall: async () => {
            const incoming = get().incomingCall;
            if (!incoming || get().callStatus !== "idle") return;

            stopRingtone();
            clearTimeout(incomingRingTimer);
            const attempt = ++attemptSeq;
            set({
                incomingCall: null,
                callStatus: "connecting",
                isGroupCall: incoming.isGroup,
                callTitle: incoming.isGroup ? incoming.groupName : incoming.fromName,
                chatTarget: incoming.isGroup
                    ? { type: "group", id: incoming.groupId }
                    : { type: "user", id: incoming.from },
            });

            await loadIceServers();
            const stream = await acquireLocalMedia();
            if (attempt !== attemptSeq) return stopStream(stream);
            if (!stream) {
                getSocket()?.emit("call:reject", { callId: incoming.callId });
                cleanupCall();
                return;
            }
            setLocalStream(stream);

            const res = await emitWithAck("call:accept", { callId: incoming.callId });
            if (attempt !== attemptSeq) {
                if (res?.ok) getSocket()?.emit("call:leave", { callId: incoming.callId });
                return;
            }
            if (!res?.ok) {
                toast.error(res?.error || "This call is no longer available");
                cleanupCall();
                return;
            }

            set({ callId: res.callId, callTitle: res.title || get().callTitle });
            // As the newcomer we open a connection to everyone already in the call
            res.participants.forEach((p) => {
                updateParticipant(p.userId, { name: p.name });
                createPeer(p.userId, { initiator: true });
            });
            broadcastMediaState();
        },

        rejectCall: () => {
            const incoming = get().incomingCall;
            if (!incoming) return;
            stopRingtone();
            clearTimeout(incomingRingTimer);
            getSocket()?.emit("call:reject", { callId: incoming.callId });
            set({ incomingCall: null });
        },

        hangUp: () => {
            attemptSeq++;
            const { callId } = get();
            if (callId) getSocket()?.emit("call:leave", { callId });
            cleanupCall();
        },

        toggleAudio: () => {
            const track = localStream?.getAudioTracks()[0];
            if (!track) return;
            track.enabled = !track.enabled;
            set({ isAudioMuted: !track.enabled });
            broadcastMediaState();
        },

        // Turning the camera off releases it (camera light goes off) and stops sending video.
        // Turning it on gets a new camera track and puts it on every connection.
        toggleVideo: async () => {
            if (!localStream || videoToggleInFlight) return;
            videoToggleInFlight = true;
            set({ isVideoBusy: true });

            try {
                const current = localStream.getVideoTracks()[0];
                if (current) {
                    for (const { pc } of peers.values()) {
                        const sender = pc.getSenders().find((s) => s.track === current);
                        if (sender) await sender.replaceTrack(null);
                    }
                    current.stop();
                    localStream.removeTrack(current);
                    set({ isVideoMuted: true });
                } else {
                    const camera = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS });
                    const track = camera.getVideoTracks()[0];
                    if (get().callStatus === "idle") {
                        track.stop(); // call ended while the camera was starting
                        return;
                    }
                    localStream.addTrack(track);
                    for (const peer of peers.values()) await attachVideoTrack(peer, track);
                    set({ isVideoMuted: false });
                    applySenderParameters();
                }
                bump();
                broadcastMediaState();
            } catch (err) {
                console.error("Camera toggle failed:", err);
                toast.error(err.name === "NotAllowedError" ? "Camera permission denied." : "Camera is not available.");
            } finally {
                videoToggleInFlight = false;
                set({ isVideoBusy: false });
            }
        },

        setRecording: (isRecording) => {
            set({ isRecording });
            broadcastMediaState();
        },

        // ---------------- socket events ----------------
        _onIncoming: (data) => {
            if (get().callStatus !== "idle" || get().incomingCall) {
                // Busy: decline right away so the caller isn't left waiting
                getSocket()?.emit("call:reject", { callId: data.callId });
                return;
            }
            set({ incomingCall: data });
            startRingtone("incoming");
            clearTimeout(incomingRingTimer);
            incomingRingTimer = setTimeout(() => {
                if (get().incomingCall?.callId === data.callId) {
                    stopRingtone();
                    set({ incomingCall: null });
                }
            }, INCOMING_RING_TIMEOUT_MS);
        },

        _onCancelled: ({ callId, reason }) => {
            const incoming = get().incomingCall;
            if (incoming?.callId !== callId) return;
            stopRingtone();
            clearTimeout(incomingRingTimer);
            set({ incomingCall: null });
            if (reason === "missed" || reason === "ended" || reason === "no-answer") {
                toast(`Missed call from ${incoming.fromName}`);
            }
        },

        _onEnded: ({ callId, reason }) => {
            if (get().callId !== callId) return;
            cleanupCall();
            const messages = { rejected: "Call declined", "no-answer": "No answer" };
            toast(messages[reason] || "Call ended");
        },

        _onUserJoined: ({ callId, userId, name }) => {
            if (get().callId !== callId) return;
            stopRingtone();
            updateParticipant(userId, { name });
            if (get().callStatus === "outgoing") set({ callStatus: "connecting" });
            // The newcomer opens the connection; we just share our mic/camera state
            broadcastMediaState();
        },

        _onUserLeft: ({ callId, userId }) => {
            if (get().callId !== callId) return;
            const name = get().participants[userId]?.name;
            removePeer(userId);
            if (name) toast(`${name} left the call`);
        },

        _onDeclined: ({ callId, name }) => {
            if (get().callId === callId && name) toast(`${name} declined the call`);
        },

        _onSignal: (data) => {
            if (!data?.callId || data.callId !== get().callId || !data.from) return;
            const peer = peers.get(data.from) || createPeer(data.from, { initiator: false });
            // Process each peer's messages strictly in order (an ICE candidate must not
            // be applied before the offer it belongs to)
            peer.queue = peer.queue
                .then(() => processSignal(peer, data.from, data))
                .catch((err) => console.error("Signaling error:", err));
        },

        _onMediaState: ({ callId, userId, audio, video, recording }) => {
            if (!isCurrentCall(callId)) return;
            const previous = get().participants[userId];
            updateParticipant(userId, { audio, video, recording });
            if (recording && !previous?.recording) {
                toast(`${previous?.name || "Someone"} started recording the call audio`);
            }
        },

        // Socket reconnected (network blip): re-attach to the call on the server
        _onReconnect: async () => {
            const { callId } = get();
            if (!callId) return;
            const res = await emitWithAck("call:rejoin", { callId });
            if (get().callId !== callId) return;
            if (!res?.ok) {
                cleanupCall();
                toast.error("Call ended: the connection to the server was lost.");
                return;
            }
            const stillThere = new Set((res.participants || []).map((p) => p.userId));
            for (const userId of [...peers.keys()]) {
                if (!stillThere.has(userId)) removePeer(userId);
            }
            broadcastMediaState();
        },
    };
});

export const registerCallSocketHandlers = (socket) => {
    const store = () => useCallStore.getState();
    socket.on("call:incoming", (data) => store()._onIncoming(data));
    socket.on("call:cancelled", (data) => store()._onCancelled(data));
    socket.on("call:ended", (data) => store()._onEnded(data));
    socket.on("call:user-joined", (data) => store()._onUserJoined(data));
    socket.on("call:user-left", (data) => store()._onUserLeft(data));
    socket.on("call:declined", (data) => store()._onDeclined(data));
    socket.on("call:signal", (data) => store()._onSignal(data));
    socket.on("call:media-state", (data) => store()._onMediaState(data));
    socket.on("connect", () => store()._onReconnect());
};

// Leave the call cleanly when the tab is closed or reloaded
if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => {
        const { callId } = useCallStore.getState();
        if (callId) getSocket()?.emit("call:leave", { callId });
    });
}
