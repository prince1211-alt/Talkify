import { useEffect, useRef, useState, memo } from "react";
import toast from "react-hot-toast";
import { useChatStore, idOf } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useCallStore } from "../store/useCallStore";
import { Send, Image, Video, Trash2, Info, ArrowLeft, Lock, Loader2 } from "lucide-react";
import GroupMembersModal from "./GroupMembersModal";
import { decryptAESBytes } from "../utils/crypto";
import { axiosInstance } from "../lib/axios";

const MAX_IMAGE_SIDE = 1280;
const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;

// Resize + re-encode as JPEG before encrypting (keeps uploads small)
const compressImage = (file) => new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;
        if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
            const scale = MAX_IMAGE_SIDE / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob(
            (blob) => resolve(blob ? new File([blob], "image.jpg", { type: "image/jpeg" }) : file),
            "image/jpeg",
            0.82
        );
    };
    img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("This file isn't a supported image"));
    };
    img.src = objectUrl;
});

export default function ChatWindow() {
    const {
        messages,
        selectedUser,
        selectedGroup,
        sendMessage,
        deleteGroup,
        isMessagesLoading,
        onlineUsers,
        setSelectedUser,
        setSelectedGroup,
    } = useChatStore();

    const { authUser } = useAuthStore();
    const startCall = useCallStore((state) => state.startCall);
    const isInCall = useCallStore((state) => state.callStatus !== "idle");
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    const [text, setText] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);

    const myId = String(authUser?._id || authUser?.id || "");

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        const value = text.trim();
        if (!value || isSending) return;

        setIsSending(true);
        const sent = await sendMessage({ text: value });
        setIsSending(false);
        if (sent) setText(""); // keep the draft if sending failed
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = null;
        if (!file) return;
        if (!file.type.startsWith("image/")) return toast.error("Please choose an image file");
        if (file.size > MAX_ORIGINAL_BYTES) return toast.error("Image is too large (max 20 MB)");

        setIsUploadingImage(true);
        try {
            const compressed = await compressImage(file);
            const caption = text.trim();
            const sent = await sendMessage({ text: caption, imageFile: compressed });
            if (sent && caption) setText("");
        } catch (err) {
            toast.error(err.message || "Failed to send image");
            console.error(err);
        } finally {
            setIsUploadingImage(false);
        }
    };

    const handleVideoCall = () => {
        if (selectedGroup) {
            startCall({ groupId: selectedGroup._id, title: selectedGroup.name });
        } else if (selectedUser) {
            startCall({ to: selectedUser._id, title: selectedUser.fullName });
        }
    };

    const handleBack = () => {
        if (selectedGroup) setSelectedGroup(null);
        else setSelectedUser(null);
    };

    const handleDeleteGroup = () => {
        if (!selectedGroup) return;

        toast((t) => (
            <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">
                    Delete group "{selectedGroup.name}"? This cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                    <button
                        onClick={() => toast.dismiss(t.id)}
                        className="px-3 py-1 text-sm bg-gray-200 rounded-lg"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={async () => {
                            toast.dismiss(t.id);
                            await deleteGroup(selectedGroup._id);
                        }}
                        className="px-3 py-1 text-sm bg-red-500 text-white rounded-lg"
                    >
                        Delete
                    </button>
                </div>
            </div>
        ));
    };

    const title = selectedGroup ? selectedGroup.name : selectedUser?.fullName;
    const isOnline = selectedUser ? onlineUsers.includes(selectedUser._id) : false;
    const isGroupAdmin = Boolean(selectedGroup) && idOf(selectedGroup.createdBy) === myId;

    return (
        <div className="flex-1 flex flex-col h-full min-h-0 relative">
            {/* Header */}
            <div className="border-b px-3 sm:px-6 py-3 flex items-center justify-between gap-2 rounded-lg bg-[#398187] m-1">
                <div className="flex items-center gap-2 min-w-0">
                    <button
                        type="button"
                        onClick={handleBack}
                        className="md:hidden p-1 rounded hover:bg-black/10"
                        aria-label="Back to chats"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="min-w-0">
                        <h2 className="font-bold text-black text-lg truncate">{title}</h2>
                        <p className="text-sm text-green-100 flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            {selectedGroup
                                ? `${selectedGroup.members.length} members · end-to-end encrypted`
                                : `${isOnline ? "Online" : "Offline"} · end-to-end encrypted`}
                        </p>
                    </div>
                </div>

                <div className="flex gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={handleVideoCall}
                        disabled={isInCall}
                        className="disabled:opacity-40"
                        title={isInCall ? "You're already in a call" : "Start video call"}
                        aria-label="Start video call"
                    >
                        <Video className="w-5 h-5" />
                    </button>

                    {selectedGroup && (
                        <button type="button" onClick={() => setIsMembersModalOpen(true)} title="Group members" aria-label="Group members">
                            <Info className="w-5 h-5" />
                        </button>
                    )}

                    {isGroupAdmin && (
                        <button type="button" onClick={handleDeleteGroup} title="Delete group" aria-label="Delete group">
                            <Trash2 className="w-5 h-5 text-red-600" />
                        </button>
                    )}
                </div>
            </div>

            {/* Members Modal */}
            {selectedGroup && (
                <GroupMembersModal
                    isOpen={isMembersModalOpen}
                    onClose={() => setIsMembersModalOpen(false)}
                    members={selectedGroup.members}
                />
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4">
                {isMessagesLoading && messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-500 gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" /> Loading messages…
                    </div>
                ) : (
                    messages.map((message, idx) => {
                        const isOwn = idOf(message.senderId) === myId;
                        return (
                            <MessageBubble
                                key={message._id || idx}
                                message={message}
                                isOwn={isOwn}
                                senderName={selectedGroup && !isOwn ? message.senderName || message.senderId?.fullName : ""}
                                canDelete={isOwn || !selectedGroup || isGroupAdmin}
                            />
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="bg-white p-3 border-t">
                <form onSubmit={handleSendMessage} className="flex gap-2 sm:gap-3">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                    />

                    <button
                        className="px-2 bg-green-400 rounded-md relative disabled:opacity-60"
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingImage}
                        title={isUploadingImage ? "Uploading..." : "Send image (text in the box is sent as its caption)"}
                        aria-label="Send image"
                    >
                        {isUploadingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Image className="w-5 h-5" />}
                    </button>

                    <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="flex-1 min-w-0 border rounded px-3 py-2"
                        placeholder="Type a message..."
                        maxLength={5000}
                    />

                    <button
                        className="px-2 bg-green-400 rounded-md disabled:opacity-60"
                        type="submit"
                        disabled={isSending || !text.trim()}
                        aria-label="Send message"
                    >
                        {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                </form>
            </div>
        </div>
    );
}

// Encrypted bytes straight from Cloudinary, or through the backend if that is blocked (CORS / network)
const fetchEncryptedImage = async (url) => {
    try {
        const res = await fetch(url);
        if (res.ok) return await res.arrayBuffer();
    } catch {
        // fall back to the backend below
    }
    const res = await axiosInstance.get("/messages/media", { params: { url }, responseType: "arraybuffer" });
    return res.data;
};

// messageId -> object URL of the decrypted image (so it is downloaded/decrypted only once)
const decryptedImageCache = new Map();

function MessageImage({ message }) {
    const isEncrypted = Boolean(message.imageIv);
    const cacheKey = String(message._id);
    const [result, setResult] = useState(() => ({ url: decryptedImageCache.get(cacheKey) || null, failed: false }));

    useEffect(() => {
        if (!isEncrypted || message.localImageUrl || decryptedImageCache.has(cacheKey) || !message.aesKey) return undefined;

        let cancelled = false;
        (async () => {
            try {
                const encrypted = await fetchEncryptedImage(message.image);
                const decrypted = await decryptAESBytes(encrypted, message.imageIv, message.aesKey);
                const url = URL.createObjectURL(new Blob([decrypted], { type: "image/jpeg" }));
                decryptedImageCache.set(cacheKey, url);
                if (!cancelled) setResult({ url, failed: false });
            } catch (err) {
                console.error("Image decryption failed:", err);
                if (!cancelled) setResult({ url: null, failed: true });
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [cacheKey, isEncrypted, message.image, message.imageIv, message.aesKey, message.localImageUrl]);

    // Legacy (unencrypted) image or our own just-sent image
    const src = !isEncrypted ? message.image : message.localImageUrl || result.url;

    if (src) return <img src={src} alt="attachment" className="mb-2 rounded max-h-80 object-contain" />;

    if (!message.aesKey || result.failed) {
        return <p className="mb-2 text-sm italic opacity-80">🔒 Image can't be decrypted</p>;
    }
    return (
        <div className="mb-2 w-48 h-32 rounded bg-black/10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
        </div>
    );
}

const MessageBubble = memo(({ message, isOwn, senderName, canDelete }) => {
    const deleteMessage = useChatStore(state => state.deleteMessage);

    const handleDelete = () => {
        toast((t) => (
            <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">
                    Delete this message?
                </p>
                <div className="flex justify-end gap-2">
                    <button
                        onClick={() => toast.dismiss(t.id)}
                        className="px-3 py-1 text-sm bg-gray-200 rounded-lg"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={async () => {
                            toast.dismiss(t.id);
                            try {
                                await deleteMessage(message._id);
                                toast.success("Message deleted");
                            } catch (err) {
                                toast.error(err.response?.data?.message || "Failed to delete message");
                            }
                        }}
                        className="px-3 py-1 text-sm bg-red-500 text-white rounded-lg"
                    >
                        Delete
                    </button>
                </div>
            </div>
        ));
    };

    return (
        <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[80%] sm:max-w-md">
                {senderName && <p className="text-xs font-semibold text-indigo-700 mb-1 ml-1">{senderName}</p>}
                {message.deleted ? (
                    <div className="italic text-gray-400 text-sm">
                        Message deleted
                    </div>
                ) : (
                    <div className={`p-3 rounded-lg ${isOwn ? "bg-green-600 text-white" : "bg-white border"}`}>
                        {message.image && <MessageImage message={message} />}
                        {message.text && (
                            <p className={`whitespace-pre-wrap break-words text-left ${message.decryptionFailed ? "italic opacity-80 text-sm" : ""}`}>
                                {message.text}
                            </p>
                        )}
                    </div>
                )}

                <div className={`flex items-center gap-2 mt-1 ${isOwn ? "justify-end" : ""}`}>
                    <span className="text-xs text-gray-400">
                        {message.createdAt
                            ? new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : "Now"}
                    </span>

                    {!message.deleted && canDelete && (
                        <button type="button" onClick={handleDelete} aria-label="Delete message">
                            <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
});

MessageBubble.displayName = "MessageBubble";
