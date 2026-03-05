import { useEffect, useRef, useState } from "react";
import { useCallStore } from "../store/useCallStore";
import { useChatStore } from "../store/useChatStore";
import { PhoneOff, Mic, MicOff, Video as VideoIcon, VideoOff, CircleDot, Loader2, UploadCloud } from "lucide-react";
import { axiosInstance } from "../lib/axios";

export default function VideoCallModal() {
    const {
        localStream,
        remoteStreams,
        isCalling,
        endCall,
        targetUserId,
        isVideoMuted,
        isAudioMuted,
        toggleLocalVideo,
        toggleLocalAudio
    } = useCallStore();
    const { socket, selectedGroup } = useChatStore();

    const localVideoRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);

    // Recording states
    const [isRecording, setIsRecording] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        if (localVideoRef.current && localStream && localVideoRef.current.srcObject !== localStream) {
            console.log("Attaching new local stream to video element.");
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    const handleToggleAudio = () => {
        toggleLocalAudio();
    };

    const handleToggleVideo = () => {
        toggleLocalVideo();
    };

    // Recording Logic
    const startRecording = () => {
        if (!localStream) return;
        recordedChunksRef.current = [];
        const options = { mimeType: 'audio/webm' };

        try {
            // 1. Initialize AudioContext
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioCtx = new AudioContext();

            // 2. Create destination node
            const dest = audioCtx.createMediaStreamDestination();

            // 3. Add local audio to destination
            if (localStream.getAudioTracks().length > 0) {
                const localSource = audioCtx.createMediaStreamSource(
                    new MediaStream([localStream.getAudioTracks()[0]])
                );
                localSource.connect(dest);
            }

            // 4. Add all remote audio to destination
            Object.values(remoteStreams).forEach(remoteStream => {
                if (remoteStream.getAudioTracks().length > 0) {
                    const remoteSource = audioCtx.createMediaStreamSource(
                        new MediaStream([remoteStream.getAudioTracks()[0]])
                    );
                    remoteSource.connect(dest);
                }
            });

            // 5. Use the mixed destination stream for MediaRecorder
            mediaRecorderRef.current = new MediaRecorder(dest.stream, options);
            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    recordedChunksRef.current.push(e.data);
                }
            };

            // Keep a reference to the audio context to close it later
            mediaRecorderRef.current.audioCtx = audioCtx;

            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (e) {
            console.error("Recording error:", e);
            alert("Microphone recording not supported on this browser.");
        }
    };

    const stopRecordingAndUpload = async () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.onstop = async () => {
                setIsUploading(true);
                const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
                const formData = new FormData();
                formData.append("audio", blob, "meeting.webm");

                try {
                    // Add auth header or rely on cookies
                    const res = await axiosInstance.post("/meeting/summarize", formData, {
                        headers: { "Content-Type": "multipart/form-data" }
                    });

                    if (res.data.success) {
                        // 1. Send the summary as a message in the current chat
                        const summaryText = `🤖 **Meeting Summary:**\n\n${res.data.summary}`;
                        useChatStore.getState().sendMessage({ text: summaryText });

                        // 2. Broadcast summary to everyone (if needed)
                        if (socket) {
                            socket.emit("broadcastGroupSummary", res.data.summary);
                        }
                    }
                } catch (error) {
                    console.error("Failed to summarize meeting:", error);
                    alert("Failed to summarize meeting audio.");
                } finally {
                    setIsUploading(false);
                    setIsRecording(false);
                    // Close audio context
                    if (mediaRecorderRef.current?.audioCtx) {
                        mediaRecorderRef.current.audioCtx.close();
                    }
                }
            };

            mediaRecorderRef.current.stop();
        }
    };

    const handleEndCall = () => {
        console.log("Handle end call clicked");
        if (isRecording) {
            stopRecordingAndUpload();
        }

        // Robust target selection: use stored targetUserId, or fallback to first remote stream
        const fallbackId = Object.keys(remoteStreams)[0];
        const target = selectedGroup ? "all" : (targetUserId || fallbackId);

        console.log(`Sending end-call to: ${target}`);

        if (target) {
            const eventName = selectedGroup ? "webrtc:leave-call" : "webrtc:end-call";
            socket?.emit(eventName, {
                to: target,
                groupId: selectedGroup?._id
            });
        }

        endCall();
    };

    if (!isCalling && !localStream) return null;

    return (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col backdrop-blur-sm animate-in fade-in duration-200">
            {/* Header */}
            <div className="p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent absolute top-0 w-full z-10">
                <h2 className="text-white text-xl font-medium tracking-wide">Talkify Call</h2>

                {isRecording && (
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-red-500/20 border border-red-500/50 rounded-full">
                        <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.7)]" />
                        <span className="text-red-500 font-semibold text-sm">Recording Audio...</span>
                    </div>
                )}

                {isUploading && (
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-500/20 border border-blue-500/50 rounded-full">
                        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                        <span className="text-blue-500 font-semibold text-sm">Summarizing Meeting...</span>
                    </div>
                )}
            </div>

            {/* Video Grid */}
            <div className="flex-1 p-6 md:p-12 mb-20 flex pt-24 items-center justify-center">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-7xl mx-auto auto-rows-fr">

                    {/* Local Video */}
                    <div className="relative rounded-2xl overflow-hidden bg-gray-900 border border-gray-800 shadow-2xl group flex flex-col justify-end min-h-[300px]">
                        <video
                            ref={localVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`w-full h-full object-cover absolute inset-0 ${isVideoMuted ? 'opacity-0' : 'opacity-100'}`}
                            onLoadedMetadata={(e) => e.target.play().catch(console.error)}
                        />
                        {isVideoMuted && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
                                <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center">
                                    <VideoOff className="w-8 h-8 text-gray-400" />
                                </div>
                                <span className="mt-4 text-gray-400 text-sm font-medium">Camera is off</span>
                            </div>
                        )}
                        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                            <span className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-white text-sm font-medium border border-white/10">
                                You {!isAudioMuted ? "🎤" : "🔇"}
                            </span>
                        </div>
                    </div>

                    {/* Remote Streams */}
                    {Object.entries(remoteStreams).map(([userId, stream]) => (
                        <RemoteVideo key={userId} stream={stream} userId={userId} />
                    ))}

                </div>
            </div>

            {/* Controls */}
            <div className="absolute bottom-0 w-full p-8 bg-gradient-to-t from-black/90 to-transparent flex justify-center gap-6">
                <button
                    onClick={handleToggleAudio}
                    className={`p-4 rounded-full transition-all shadow-lg ${isAudioMuted ? "bg-red-500 hover:bg-red-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-white"
                        }`}
                >
                    {isAudioMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>

                <button
                    onClick={handleToggleVideo}
                    className={`p-4 rounded-full transition-all shadow-lg ${isVideoMuted ? "bg-red-500 hover:bg-red-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-white"
                        }`}
                >
                    {isVideoMuted ? <VideoOff className="w-6 h-6" /> : <VideoIcon className="w-6 h-6" />}
                </button>

                {!isRecording ? (
                    <button
                        onClick={startRecording}
                        className="p-4 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-lg shadow-indigo-500/30 flex items-center gap-2 px-6"
                    >
                        <CircleDot className="w-6 h-6" />
                        <span className="font-semibold px-1">Record Audio</span>
                    </button>
                ) : (
                    <button
                        onClick={stopRecordingAndUpload}
                        disabled={isUploading}
                        className="p-4 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-lg shadow-blue-500/30 flex items-center gap-2 px-6 disabled:opacity-50"
                    >
                        <UploadCloud className="w-6 h-6" />
                        <span className="font-semibold px-1">Summarize</span>
                    </button>
                )}

                <button
                    onClick={handleEndCall}
                    className="p-4 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all shadow-lg shadow-red-500/30 w-24 flex justify-center"
                >
                    <PhoneOff className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
}

// Helper component for remote video to manage its own ref
function RemoteVideo({ stream, userId }) {
    const videoRef = useRef(null);
    const users = useChatStore(state => state.users);
    const selectedGroup = useChatStore(state => state.selectedGroup);

    let user = users.find(u => String(u._id) === String(userId));
    if (!user && selectedGroup) {
        user = selectedGroup.members.find(m => String(m._id) === String(userId));
    }

    const displayName = user ? (user.fullName || user.uniqueId) : `User ${userId.slice(-4)}`;

    useEffect(() => {
        if (videoRef.current && stream && videoRef.current.srcObject !== stream) {
            console.log(`Attaching remote stream for user ${userId}`);
            videoRef.current.srcObject = stream;
        }
    }, [stream, userId]);

    return (
        <div className="relative rounded-2xl overflow-hidden bg-gray-900 border border-gray-800 shadow-2xl flex flex-col justify-end min-h-[300px]">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover absolute inset-0"
                onLoadedMetadata={(e) => e.target.play().catch(console.error)}
            />
            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                <span className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-white text-sm font-medium border border-white/10">
                    {displayName}
                </span>
            </div>
        </div>
    );
};
