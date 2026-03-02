import { useEffect, useRef, useState, memo } from "react";
import toast from "react-hot-toast";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useCallStore } from "../store/useCallStore";
import { Send, Image, MoreVertical, Video, Hash, Trash2, Info } from "lucide-react";
import GroupMembersModal from "./GroupMembersModal";

export default function ChatWindow() {
    const {
        messages,
        getMessages,
        getGroupMessages,
        selectedUser,
        selectedGroup,
        sendMessage,
        deleteGroup,
        isMessagesLoading,
        socket,
        onlineUsers
    } = useChatStore();

    const { authUser } = useAuthStore();
    const { initiateCall, initiateGroupCall } = useCallStore();
    const messagesEndRef = useRef(null);

    const [text, setText] = useState("");
    const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (selectedUser?._id) {
            getMessages(selectedUser._id);
        } else if (selectedGroup?._id) {
            getGroupMessages(selectedGroup._id);
        }
    }, [selectedUser, selectedGroup, getMessages, getGroupMessages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        await sendMessage({ text: text.trim() });
        setText("");
    };

    const handleImageClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const form = new FormData();
            form.append("image", file);
            if (text.trim()) form.append("text", text.trim());
            await sendMessage(form);
            setText("");
        } catch (err) {
            toast.error("Failed to send image");
            console.error(err);
        } finally {
            e.target.value = null;
        }
    };

    const handleVideoCall = () => {
        if (selectedGroup) {
            const targetUserIds = selectedGroup.members
                .map(m => m._id)
                .filter(id => id !== authUser._id);

            if (targetUserIds.length > 0) {
                initiateGroupCall(targetUserIds, socket);
            }
        } else if (selectedUser) {
            initiateCall(selectedUser._id, socket);
        }
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
                            await deleteGroup(selectedGroup._id);
                            toast.dismiss(t.id);
                            toast.success("Group deleted");
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
    const isCreator =
        selectedGroup &&
        (String(selectedGroup.createdBy) === String(authUser?._id) ||
            String(selectedGroup.createdBy) === String(authUser?.id));

    if (isMessagesLoading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                Loading...
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 relative">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
                <div>
                    <h2 className="font-bold text-lg">{title}</h2>
                    <p className="text-sm text-gray-500">
                        {selectedGroup
                            ? `${selectedGroup.members.length} members`
                            : (isOnline ? "Online" : "Offline")}
                    </p>
                </div>

                <div className="flex gap-3">
                    <button onClick={handleVideoCall}>
                        <Video className="w-5 h-5" />
                    </button>

                    {isCreator && (
                        <button onClick={handleDeleteGroup}>
                            <Trash2 className="w-5 h-5 text-red-500" />
                        </button>
                    )}

                    <MoreVertical className="w-5 h-5" />
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
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((message, idx) => (
                    <MessageBubble
                        key={message._id || idx}
                        message={message}
                        isOwn={message.senderId === authUser._id}
                        isGroup={!!selectedGroup}
                    />
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="bg-white p-4 border-t">
                <form onSubmit={handleSendMessage} className="flex gap-3">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                    />

                    <button type="button" onClick={handleImageClick}>
                        <Image className="w-5 h-5" />
                    </button>

                    <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="flex-1 border rounded px-3 py-2"
                        placeholder="Type a message..."
                    />

                    <button type="submit">
                        <Send className="w-5 h-5" />
                    </button>
                </form>
            </div>
        </div>
    );
}

const MessageBubble = memo(({ message, isOwn, isGroup }) => {
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
                            try {
                                await deleteMessage(message._id);
                                toast.dismiss(t.id);
                                toast.success("Message deleted");
                            } catch {
                                toast.dismiss(t.id);
                                toast.error("Failed to delete message");
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
            <div className="max-w-xs">
                {message.deleted ? (
                    <div className="italic text-gray-400 text-sm">
                        Message deleted
                    </div>
                ) : (
                    <div className={`p-3 rounded-lg ${isOwn ? "bg-indigo-600 text-white" : "bg-white border"}`}>
                        {message.image && (
                            <img src={message.image} alt="attachment" className="mb-2 rounded" />
                        )}
                        <p>{message.text}</p>
                    </div>
                )}

                <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">
                        {message.createdAt
                            ? new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : "Now"}
                    </span>

                    {!message.deleted && (
                        <button onClick={handleDelete}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
});

MessageBubble.displayName = "MessageBubble";