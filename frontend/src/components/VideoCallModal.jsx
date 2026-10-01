import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useCallStore } from "../store/useCallStore";
import { useChatStore } from "../store/useChatStore";
import {
    PhoneOff, Mic, MicOff, Video as VideoIcon, VideoOff, CircleDot, Square, Volume2, Loader2,
} from "lucide-react";
import { axiosInstance } from "../lib/axios";

const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

const formatDuration = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return h ? `${h}:${m}:${s}` : `${m}:${s}`;
};

// Uploads the recorded audio, then posts the AI summary into the chat the call belongs to.
// Runs outside the component so it finishes even after the call window closes.
const summarizeRecording = (blob, target) => {
    if (!blob.size) {
        toast.error("Nothing was recorded.");
        return;
    }
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    const formData = new FormData();
    formData.append("audio", blob, `meeting.${ext}`);

    const job = axiosInstance.post("/meeting/summarize", formData).then(async (res) => {
        if (!res.data?.success) throw new Error(res.data?.message || "Summary failed");
        const sent = await useChatStore.getState().sendMessage(
            { text: `🤖 Meeting Summary:\n\n${res.data.summary}` },
            target
        );
        if (!sent) throw new Error("Could not post the summary");
    });

    toast.promise(job, {
        loading: "Summarizing the meeting…",
        success: "Meeting summary sent to the chat",
        error: (err) => err.response?.data?.message || err.message || "Failed to summarize meeting audio",
    });
};

export default function VideoCallModal() {
    const {
        callStatus,
        callTitle,
        isGroupCall,
        callStartedAt,
        participants,
        remoteStreams,
        localStream,
        isAudioMuted,
        isVideoMuted,
        isVideoBusy,
        isRecording,
        chatTarget,
        hangUp,
        toggleAudio,
        toggleVideo,
        setRecording,
    } = useCallStore();
    const users = useChatStore((state) => state.users);
    const groups = useChatStore((state) => state.groups);

    const recordingRef = useRef(null); // { recorder, audioCtx, chunks, target }
    const elapsed = useElapsed(callStatus === "active" ? callStartedAt : null);

    const stopRecordingAndSummarize = () => {
        const session = recordingRef.current;
        if (!session) return;
        recordingRef.current = null;
        setRecording(false);

        session.recorder.onstop = () => {
            session.audioCtx.close().catch(() => {});
            const type = (session.recorder.mimeType || "audio/webm").split(";")[0];
            summarizeRecording(new Blob(session.chunks, { type }), session.target);
        };
        session.recorder.stop();
    };

    // If the call ends while recording (e.g. the other side hangs up), still produce the summary
    useEffect(() => {
        if (callStatus === "idle" && recordingRef.current) stopRecordingAndSummarize();
    });

    if (callStatus === "idle") return null;

    // Mix our mic and every participant's audio into one recording
    const startRecording = () => {
        if (!localStream || typeof MediaRecorder === "undefined") {
            toast.error("Recording isn't supported in this browser.");
            return;
        }
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            const audioCtx = new AudioCtx();
            const destination = audioCtx.createMediaStreamDestination();

            [localStream, ...Object.values(remoteStreams)].forEach((stream) => {
                const track = stream?.getAudioTracks()[0];
                if (track) audioCtx.createMediaStreamSource(new MediaStream([track])).connect(destination);
            });

            const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
            const recorder = new MediaRecorder(destination.stream, mimeType ? { mimeType } : undefined);
            const chunks = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recordingRef.current = { recorder, audioCtx, chunks, target: chatTarget };
            recorder.start(1000);
            setRecording(true);
        } catch (e) {
            console.error("Recording error:", e);
            toast.error("Could not start recording.");
        }
    };

    const handleHangUp = () => {
        if (recordingRef.current) stopRecordingAndSummarize();
        hangUp();
    };

    const nameFor = (userId) => {
        const fromCall = participants[userId]?.name;
        if (fromCall) return fromCall;
        const contact = users.find((u) => String(u._id) === String(userId));
        if (contact) return contact.fullName;
        for (const group of groups) {
            const member = group.members?.find((m) => String(m._id) === String(userId));
            if (member) return member.fullName;
        }
        return "Participant";
    };

    const remoteIds = Object.keys(participants);
    const spotlight = remoteIds.length === 1;

    let statusText = "";
    if (callStatus === "outgoing") statusText = isGroupCall ? "Ringing members…" : "Ringing…";
    else if (callStatus === "connecting") statusText = "Connecting…";
    else if (remoteIds.length === 0) statusText = "Waiting for others to join…";
    else statusText = elapsed;

    const localTile = (
        <VideoTile
            stream={localStream}
            name="You"
            isLocal
            audioOn={!isAudioMuted}
            videoOn={!isVideoMuted}
            recording={isRecording}
        />
    );

    const remoteTile = (userId, large = false) => {
        const info = participants[userId] || {};
        return (
            <VideoTile
                key={userId}
                stream={remoteStreams[userId]}
                name={nameFor(userId)}
                audioOn={info.audio !== false}
                videoOn={info.video !== false}
                recording={info.recording}
                connection={info.connection}
                large={large}
            />
        );
    };

    const tileCount = remoteIds.length + 1;
    const gridCols =
        tileCount <= 1 ? "grid-cols-1"
            : tileCount === 2 ? "grid-cols-1 sm:grid-cols-2"
                : tileCount <= 4 ? "grid-cols-2"
                    : tileCount <= 6 ? "grid-cols-2 lg:grid-cols-3"
                        : "grid-cols-3 lg:grid-cols-4";

    return (
        <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col text-white">
            {/* Header */}
            <div className="absolute top-0 inset-x-0 z-20 px-4 sm:px-6 py-4 flex items-center justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent">
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold truncate">{callTitle || "Talkify Call"}</h2>
                    <p className="text-sm text-gray-300 tabular-nums">{statusText}</p>
                </div>
                {isRecording && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-red-500/20 border border-red-500/50 rounded-full shrink-0">
                        <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-red-400 font-semibold text-xs sm:text-sm">Recording audio</span>
                    </div>
                )}
            </div>

            {/* Video area */}
            <div className="flex-1 min-h-0 relative">
                {remoteIds.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-4 p-6">
                        <div className="w-28 h-28 rounded-full bg-indigo-600 flex items-center justify-center text-4xl font-bold">
                            {(callTitle || "?").charAt(0).toUpperCase()}
                        </div>
                        <p className="text-gray-300 flex items-center gap-2">
                            {callStatus !== "active" && <Loader2 className="w-4 h-4 animate-spin" />}
                            {statusText}
                        </p>
                        <div className="absolute bottom-28 right-4 w-32 sm:w-56 aspect-[3/4] sm:aspect-video rounded-xl overflow-hidden shadow-2xl border border-white/10">
                            {localTile}
                        </div>
                    </div>
                ) : spotlight ? (
                    <div className="h-full relative">
                        {remoteTile(remoteIds[0], true)}
                        <div className="absolute bottom-28 right-4 w-32 sm:w-56 aspect-[3/4] sm:aspect-video rounded-xl overflow-hidden shadow-2xl border border-white/10 z-10">
                            {localTile}
                        </div>
                    </div>
                ) : (
                    <div className={`grid ${gridCols} auto-rows-fr gap-2 sm:gap-3 h-full px-2 sm:px-4 pt-20 pb-28`}>
                        <div className="rounded-xl overflow-hidden min-h-0">{localTile}</div>
                        {remoteIds.map((userId) => (
                            <div key={userId} className="rounded-xl overflow-hidden min-h-0">{remoteTile(userId)}</div>
                        ))}
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="absolute bottom-0 inset-x-0 z-20 p-4 sm:p-6 flex justify-center items-center gap-3 sm:gap-5 bg-gradient-to-t from-black/90 to-transparent">
                <ControlButton
                    onClick={toggleAudio}
                    active={!isAudioMuted}
                    label={isAudioMuted ? "Unmute microphone" : "Mute microphone"}
                >
                    {isAudioMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </ControlButton>

                <ControlButton
                    onClick={toggleVideo}
                    active={!isVideoMuted}
                    disabled={isVideoBusy}
                    label={isVideoMuted ? "Turn camera on" : "Turn camera off"}
                >
                    {isVideoBusy ? <Loader2 className="w-6 h-6 animate-spin" />
                        : isVideoMuted ? <VideoOff className="w-6 h-6" /> : <VideoIcon className="w-6 h-6" />}
                </ControlButton>

                {isRecording ? (
                    <button
                        type="button"
                        onClick={stopRecordingAndSummarize}
                        className="h-14 px-4 sm:px-6 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center gap-2 shadow-lg transition-colors"
                        title="Stop recording and summarize"
                    >
                        <Square className="w-5 h-5" />
                        <span className="font-semibold hidden sm:inline">Stop &amp; Summarize</span>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={startRecording}
                        disabled={callStatus !== "active"}
                        className="h-14 px-4 sm:px-6 rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg transition-colors"
                        title="Record call audio for an AI summary (everyone in the call is notified)"
                    >
                        <CircleDot className="w-5 h-5" />
                        <span className="font-semibold hidden sm:inline">Record</span>
                    </button>
                )}

                <button
                    type="button"
                    onClick={handleHangUp}
                    className="h-14 w-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-colors"
                    aria-label="End call"
                    title="End call"
                >
                    <PhoneOff className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
}

function ControlButton({ onClick, active, disabled, label, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            title={label}
            aria-pressed={!active}
            className={`h-14 w-14 rounded-full flex items-center justify-center shadow-lg transition-colors disabled:opacity-60 ${active ? "bg-gray-700 hover:bg-gray-600" : "bg-red-500 hover:bg-red-600"
                }`}
        >
            {children}
        </button>
    );
}

// Ticks once per second while the call is active
function useElapsed(startedAt) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!startedAt) return undefined;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [startedAt]);
    return startedAt ? formatDuration(now - startedAt) : "";
}

// One participant: video (kept mounted so audio keeps playing), avatar when the camera is off,
// name, mic/recording indicators and connection status.
function VideoTile({ stream, name, isLocal = false, audioOn, videoOn, recording, connection, large = false }) {
    const videoRef = useRef(null);
    const [needsTap, setNeedsTap] = useState(false);
    // Re-render when tracks are muted/unmuted/added (the MediaStream object itself stays the same)
    useCallStore((state) => state.mediaVersion);

    const tracks = stream ? stream.getTracks() : [];
    const trackKey = tracks.map((t) => t.id).join(",");
    const videoTrack = tracks.find((t) => t.kind === "video" && t.readyState === "live");
    const showVideo = Boolean(videoTrack) && !videoTrack.muted && videoOn !== false;
    const reconnecting = connection === "disconnected" || connection === "failed";
    const connecting = !isLocal && (!stream || connection === "new" || connection === "connecting");

    // Re-attach only when the set of tracks changes (camera turned on/off), so audio isn't interrupted
    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        el.srcObject = null;
        el.srcObject = stream || null;
        if (stream) {
            el.play()
                .then(() => setNeedsTap(false))
                .catch((err) => {
                    if (err.name === "NotAllowedError") setNeedsTap(true);
                });
        }
    }, [stream, trackKey]);

    const resumePlayback = () => {
        videoRef.current?.play().then(() => setNeedsTap(false)).catch(() => {});
    };

    return (
        <div className={`relative w-full h-full bg-gray-900 overflow-hidden ${large ? "" : "rounded-xl"}`}>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={isLocal}
                className={`absolute inset-0 w-full h-full object-cover ${isLocal ? "-scale-x-100" : ""} ${showVideo ? "opacity-100" : "opacity-0"}`}
            />

            {!showVideo && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <div className={`${large ? "w-28 h-28 text-4xl" : "w-16 h-16 text-2xl"} rounded-full bg-gray-700 flex items-center justify-center font-bold`}>
                        {(name || "?").charAt(0).toUpperCase()}
                    </div>
                    {connecting ? (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Connecting…
                        </span>
                    ) : videoOn === false ? (
                        <span className="text-xs text-gray-400">Camera off</span>
                    ) : null}
                </div>
            )}

            {reconnecting && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-sm gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Reconnecting…
                </div>
            )}

            {needsTap && !isLocal && (
                <button
                    type="button"
                    onClick={resumePlayback}
                    className="absolute inset-0 m-auto h-12 w-48 bg-white text-gray-900 rounded-full flex items-center justify-center gap-2 font-semibold z-10"
                >
                    <Volume2 className="w-5 h-5" /> Tap to hear audio
                </button>
            )}

            <div className={`absolute flex items-center gap-1.5 ${large ? "left-4 bottom-28 max-w-[50%]" : "left-2 bottom-2 max-w-[90%]"}`}>
                <span className="bg-black/60 backdrop-blur px-2 py-1 rounded-md text-xs sm:text-sm font-medium truncate">
                    {name}
                </span>
                {audioOn === false && (
                    <span className="bg-red-500/90 rounded-md p-1" title="Microphone off">
                        <MicOff className="w-3.5 h-3.5" />
                    </span>
                )}
                {recording && !isLocal && (
                    <span className="bg-red-500/90 rounded-md px-1.5 py-0.5 text-[10px] font-bold" title="Recording audio">
                        REC
                    </span>
                )}
            </div>
        </div>
    );
}
