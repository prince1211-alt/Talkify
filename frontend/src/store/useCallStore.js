import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";
import { useChatStore } from "./useChatStore";
import toast from "react-hot-toast";

export const useCallStore = create((set, get) => ({
    localStream: null,
    remoteStreams: {}, // map of userId -> MediaStream
    peerConnections: {}, // map of userId -> RTCPeerConnection
    isCalling: false,
    incomingCall: null, // { from: userId }
    activeCallParticipants: [], // array of userIds in current call
    targetUserId: null, // The person we are currently calling (for 1-1)

    // Media statuses
    isVideoMuted: false,
    isAudioMuted: false,

    setLocalStream: (stream) => set({ localStream: stream }),

    initializeCall: async () => {
        if (!navigator?.mediaDevices?.getUserMedia) {
            toast.error("Media devices not supported in this browser");
            return null;
        }

        const stopExistingStream = (stream) => {
            if (!stream) return;
            stream.getTracks().forEach(track => track.stop());
        };

        try {
            console.log("Initializing media devices (480p / 15fps optimized)");

            const videoConstraints = {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 15, max: 20 }
            };

            const constraints = {
                video: videoConstraints,
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000,
                    channelCount: 1,
                    sampleSize: 16
                }
            };

            let stream = await navigator.mediaDevices.getUserMedia(constraints);

            set({
                localStream: stream,
                isVideoMuted: false,
                isAudioMuted: false
            });

            return stream;

        } catch (error) {
            console.warn("Video+Audio failed:", error.name);

            // 🔽 Try lower video quality before removing video
            if (error.name === "OverconstrainedError") {
                try {
                    console.log("Retrying with lower video constraints...");

                    const lowVideoStream = await navigator.mediaDevices.getUserMedia({
                        video: { width: 320, height: 240, frameRate: 10 },
                        audio: true
                    });

                    set({
                        localStream: lowVideoStream,
                        isVideoMuted: false,
                        isAudioMuted: false
                    });

                    return lowVideoStream;

                } catch (retryError) {
                    console.warn("Low video retry failed:", retryError.name);
                }
            }

            // 🔽 Final fallback → Audio only
            try {
                console.log("Falling back to audio-only mode...");

                const audioStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });

                set({
                    localStream: audioStream,
                    isVideoMuted: true,
                    isAudioMuted: false
                });

                toast.error("Camera unavailable. Joined with audio only.");

                return audioStream;

            } catch (audioError) {
                console.error("Audio fallback failed:", audioError);
                toast.error("Unable to access microphone.");
                return null;
            }
        }
    },

    toggleLocalVideo: async () => {
        const { localStream, isVideoMuted } = get();
        if (!localStream) return;

        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            if (!isVideoMuted) {
                // STOP and disable to release hardware immediately
                videoTrack.stop();
                videoTrack.enabled = false;
                console.log("Video track stopped (Hardware released)");
                set({ isVideoMuted: true });
            } else {
                try {
                    // Re-acquire hardware
                    const newStream = await navigator.mediaDevices.getUserMedia({
                        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } }
                    });
                    const newVideoTrack = newStream.getVideoTracks()[0];

                    const { peerConnections } = get();
                    for (const pc of Object.values(peerConnections)) {
                        const sender = pc.getSenders().find(s => s.track?.kind === "video");
                        if (sender) {
                            await sender.replaceTrack(newVideoTrack);
                        } else {
                            // If no video sender exists, addTrack will trigger onnegotiationneeded
                            pc.addTrack(newVideoTrack, localStream);
                        }
                    }

                    // Add to local stream (releasing the old stopped track implicitly or explicitly)
                    localStream.removeTrack(videoTrack);
                    localStream.addTrack(newVideoTrack);
                    set({ isVideoMuted: false });
                    console.log("Video track re-acquired via replaceTrack (Zero Latency)");
                } catch (err) {
                    console.error("Failed to re-acquire video:", err);
                    toast.error("Camera is busy.");
                }
            }
        } else if (isVideoMuted) {
            // Case: Joined as audio-only, now adding video
            try {
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } }
                });
                const newVideoTrack = newStream.getVideoTracks()[0];
                localStream.addTrack(newVideoTrack);

                const { peerConnections } = get();
                for (const pc of Object.values(peerConnections)) {
                    pc.addTrack(newVideoTrack, localStream);
                    // addTrack triggers onnegotiationneeded automatically
                }
                set({ isVideoMuted: false });
            } catch (err) {
                toast.error("Could not start video.");
            }
        }
    },

    toggleLocalAudio: () => {
        const { localStream, isAudioMuted } = get();
        if (!localStream) return;
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = isAudioMuted;
            set({ isAudioMuted: !audioTrack.enabled });
        }
    },

    endCall: () => {
        console.log("Ending call and cleaning up...");
        const { localStream, remoteStreams, peerConnections } = get();

        if (localStream) {
            localStream.getTracks().forEach((track) => {
                track.stop();
                console.log(`Stopped local track: ${track.kind} (RELEASING HARDWARE)`);
            });
        }

        // Stop all tracks in remote streams
        Object.values(remoteStreams).forEach(stream => {
            if (stream && stream.getTracks) {
                stream.getTracks().forEach(track => {
                    track.stop();
                    console.log(`Stopped remote track: ${track.kind}`);
                });
            }
        });

        // Close all P2P connections
        Object.entries(peerConnections).forEach(([userId, pc]) => {
            pc.close();
            console.log(`Closed peer connection with ${userId}`);
        });

        set({
            localStream: null,
            remoteStreams: {},
            peerConnections: {},
            isCalling: false,
            incomingCall: null,
            activeCallParticipants: [],
            targetUserId: null,
            iceQueues: {},
            isVideoMuted: false,
            isAudioMuted: false
        });
    },

    removeUserFromCall: (userId) => {
        console.log(`Removing user ${userId} from call...`);
        const { remoteStreams, peerConnections, activeCallParticipants } = get();

        // 1. Stop their remote tracks
        const stream = remoteStreams[userId];
        if (stream && stream.getTracks) {
            stream.getTracks().forEach(track => track.stop());
        }

        // 2. Close their PeerConnection
        const pc = peerConnections[userId];
        if (pc) {
            pc.close();
        }

        // 3. Remove them from state
        const updatedRemoteStreams = { ...remoteStreams };
        delete updatedRemoteStreams[userId];

        const updatedPeerConnections = { ...peerConnections };
        delete updatedPeerConnections[userId];

        const updatedParticipants = activeCallParticipants.filter(id => id !== userId);

        set({
            remoteStreams: updatedRemoteStreams,
            peerConnections: updatedPeerConnections,
            activeCallParticipants: updatedParticipants,
        });

        // 4. If no one else is in the call and we didn't just start it, end it fully
        if (updatedParticipants.length === 0 && Object.keys(updatedPeerConnections).length === 0) {
            console.log("No participants left in call. Ending full call.");
            get().endCall();
        }
    },

    createPeerConnection: (userId, socket) => {
        const { targetUserId, localStream } = get();
        console.log(`Creating SUPER OPTIMIZED RTCPeerConnection for ${userId}`);

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
                { urls: "stun:stun2.l.google.com:19302" },
                { urls: "stun:stun3.l.google.com:19302" },
                // TURN relay - needed when both peers are behind strict NAT
                {
                    urls: "turn:openrelay.metered.ca:80",
                    username: "openrelayproject",
                    credential: "openrelayproject"
                },
                {
                    urls: "turn:openrelay.metered.ca:443",
                    username: "openrelayproject",
                    credential: "openrelayproject"
                },
                {
                    urls: "turn:openrelay.metered.ca:443?transport=tcp",
                    username: "openrelayproject",
                    credential: "openrelayproject"
                },
            ],
            bundlePolicy: "max-bundle",
            rtcpMuxPolicy: "require",
            iceCandidatePoolSize: 8,
        });

        // The receiver is polite, the caller (who has targetUserId set) is impolite
        const polite = !targetUserId;

        pc.onnegotiationneeded = async () => {
            try {
                // Set makingOffer flag in state
                set(state => ({
                    negotiationStates: {
                        ...state.negotiationStates,
                        [userId]: { ...state.negotiationStates[userId], makingOffer: true }
                    }
                }));

                console.log(`[Negotiation] Creating offer for ${userId}...`);
                const offer = await pc.createOffer();
                const limitedOffer = setBitrate(offer.sdp, 400);
                await pc.setLocalDescription({ type: 'offer', sdp: limitedOffer });
                socket.emit("webrtc:offer", { to: userId, offer: pc.localDescription });
            } catch (err) {
                console.error("Negotiation error:", err);
            } finally {
                set(state => ({
                    negotiationStates: {
                        ...state.negotiationStates,
                        [userId]: { ...state.negotiationStates[userId], makingOffer: false }
                    }
                }));
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("webrtc:ice-candidate", { to: userId, candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            console.log(`Received remote track (${event.track.kind}) from ${userId}`);
            set((state) => {
                const currentStream = state.remoteStreams[userId] || new MediaStream();
                if (!currentStream.getTracks().find(t => t.id === event.track.id)) {
                    currentStream.addTrack(event.track);
                }
                const updatedStream = new MediaStream(currentStream.getTracks());
                return {
                    remoteStreams: { ...state.remoteStreams, [userId]: updatedStream },
                };
            });
        };

        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            console.log(`ICE Connection State [${userId}]: ${state}`);

            if (state === "failed") {
                console.warn("ICE Failed. Attempting restart...");
                pc.restartIce();
            } else if (state === "disconnected") {
                setTimeout(() => {
                    const currentPc = get().peerConnections[userId];
                    if (currentPc && currentPc.iceConnectionState === "disconnected") {
                        console.log("Auto-Restaring ICE due to disconnection...");
                        pc.restartIce();
                    }
                }, 3000);
            }
        };

        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }

        set((state) => ({
            peerConnections: { ...state.peerConnections, [userId]: pc },
            activeCallParticipants: [...new Set([...state.activeCallParticipants, userId])],
            negotiationStates: {
                ...state.negotiationStates,
                [userId]: { polite, makingOffer: false }
            }
        }));

        const { iceQueues } = get();
        if (iceQueues[userId]) {
            iceQueues[userId].forEach(candidate => {
                pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => { });
            });
            set(state => ({ iceQueues: { ...state.iceQueues, [userId]: [] } }));
        }

        return pc;
    },

    negotiationStates: {}, // map of userId -> { polite, makingOffer }
    iceQueues: {},

    handleIncomingCall: (data) => {
        set({ incomingCall: data, targetUserId: null });
    },

    acceptCall: async (socket) => {
        const { incomingCall, initializeCall } = get();
        if (!incomingCall) return;
        await initializeCall();
        set({ isCalling: true, incomingCall: null, targetUserId: null });
        socket.emit("webrtc:call-accepted", { to: incomingCall.from });
    },

    rejectCall: (socket) => {
        const { incomingCall } = get();
        if (incomingCall) {
            socket.emit("webrtc:reject-call", { to: incomingCall.from });
            set({ incomingCall: null });
        }
    },

    handleStartOffer: (data, socket) => {
        get().createPeerConnection(data.from, socket);
    },

    handleOffer: async (data, socket) => {
        const { createPeerConnection, peerConnections, negotiationStates } = get();
        let pc = peerConnections[data.from];
        if (!pc) pc = createPeerConnection(data.from, socket);

        const nState = negotiationStates[data.from] || {};
        // Collision if we are already making an offer or signaling state is not stable
        const offerCollision = nState.makingOffer || pc.signalingState !== "stable";
        const ignoreOffer = !nState.polite && offerCollision;

        if (ignoreOffer) {
            console.log(`[PerfectNeg] Ignoring collide offer from ${data.from}`);
            return;
        }

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            const limitedAnswer = setBitrate(answer.sdp, 400);
            await pc.setLocalDescription({ type: 'answer', sdp: limitedAnswer });
            socket.emit("webrtc:answer", { to: data.from, answer: pc.localDescription });
        } catch (err) {
            console.error("Error handling offer:", err);
        }
    },

    handleAnswer: async (data) => {
        const { peerConnections } = get();
        const pc = peerConnections[data.from];
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            } catch (err) {
                console.error("Error setting answer:", err);
            }
        }
    },

    handleIceCandidate: async (data) => {
        const { peerConnections } = get();
        const pc = peerConnections[data.from];
        try {
            if (pc && pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else {
                set(state => ({
                    iceQueues: {
                        ...state.iceQueues,
                        [data.from]: [...(state.iceQueues[data.from] || []), data.candidate]
                    }
                }));
            }
        } catch (e) { }
    },

    initiateCall: async (targetUserId, socket) => {
        const { authUser } = useAuthStore.getState();
        const myId = authUser._id || authUser.id;
        set({ targetUserId });
        await get().initializeCall();
        set({ isCalling: true });
        socket.emit("webrtc:call-request", { to: targetUserId, from: myId });
    },

    initiateGroupCall: async (targetUserIds, socket) => {
        const { authUser } = useAuthStore.getState();
        const myId = authUser._id || authUser.id;
        set({ targetUserId: "GROUP" });
        await get().initializeCall();
        set({ isCalling: true });
        targetUserIds.forEach(id => {
            socket.emit("webrtc:call-request", { to: id, from: myId });
        });
    }
}));

/**
 * Super Optimization: SDP Munger for Extreme Bitrate Control
 */
function setBitrate(sdp, videoBitrate) {
    const lines = sdp.split("\r\n");
    const newLines = [];
    let inAudioSection = false;
    let inVideoSection = false;
    const opusPayloads = [];

    // First pass: find Opus payload numbers
    lines.forEach(line => {
        if (line.startsWith("m=audio")) inAudioSection = true;
        if (line.startsWith("m=video")) inAudioSection = false;
        if (inAudioSection) {
            const match = line.match(/^a=rtpmap:(\d+) opus/i);
            if (match) opusPayloads.push(match[1]);
        }
    });

    // Second pass: inject bandwidth + Opus quality params
    inAudioSection = false;
    inVideoSection = false;
    const patchedOpus = new Set();

    lines.forEach(line => {
        if (line.startsWith("m=audio")) { inAudioSection = true; inVideoSection = false; }
        if (line.startsWith("m=video")) { inVideoSection = true; inAudioSection = false; }

        // For Opus fmtp lines, replace with enhanced params
        if (inAudioSection && line.startsWith("a=fmtp:")) {
            const m = line.match(/^a=fmtp:(\d+)/);
            if (m && opusPayloads.includes(m[1])) {
                newLines.push(`a=fmtp:${m[1]} minptime=10;useinbandfec=1;stereo=0;maxaveragebitrate=128000;cbr=0`);
                patchedOpus.add(m[1]);
                return;
            }
        }

        newLines.push(line);

        if (inAudioSection && line.startsWith("m=audio")) {
            newLines.push("b=AS:128");
            newLines.push("b=TIAS:128000");
        }
        if (inVideoSection && line.startsWith("m=video")) {
            newLines.push("b=AS:" + videoBitrate);
            newLines.push("b=TIAS:" + (videoBitrate * 1000));
        }
    });

    // If no fmtp line existed for Opus, inject one at end
    opusPayloads.forEach(payload => {
        if (!patchedOpus.has(payload)) {
            newLines.push(`a=fmtp:${payload} minptime=10;useinbandfec=1;stereo=0;maxaveragebitrate=128000;cbr=0`);
        }
    });

    return newLines.join("\r\n");
}
