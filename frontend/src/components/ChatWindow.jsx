import { useEffect, useRef, useState, memo } from "react";
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

    const handleVideoCall = () => {
        if (selectedGroup) {
            // Group call: pass all members except self
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
        if (window.confirm(`Are you sure you want to delete the group "${selectedGroup.name}"? This action cannot be undone.`)) {
            deleteGroup(selectedGroup._id);
        }
    };

    const title = selectedGroup ? selectedGroup.name : selectedUser?.fullName;
    const isOnline = selectedUser ? onlineUsers.includes(selectedUser._id) : false;
    const isCreator = selectedGroup && (selectedGroup.createdBy === authUser?._id || selectedGroup.createdBy === authUser?.id);

    if (isMessagesLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 h-full bg-slate-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                <p className="text-gray-500 font-medium">Loading messages...</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 relative">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        {selectedGroup ? (
                            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0 font-bold">
                                {selectedGroup.name.charAt(0).toUpperCase()}
                            </div>
                        ) : (
                            <>
                                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 border border-gray-200 font-bold uppercase overflow-hidden">
                                    {selectedUser?.profilePic ? (
                                        <img src={selectedUser.profilePic} alt={selectedUser.fullName} className="w-full h-full object-cover" />
                                    ) : (
                                        selectedUser?.fullName?.charAt(0)
                                    )}
                                </div>
                                {isOnline && (
                                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full shadow-sm"></span>
                                )}
                            </>
                        )}
                    </div>
                    <div>
                        <h2 className="font-bold text-gray-900 text-lg">{title}</h2>
                        <div
                            className={`flex items-center gap-1.5 cursor-pointer hover:opacity-70 transition-opacity`}
                            onClick={() => selectedGroup && setIsMembersModalOpen(true)}
                        >
                            <p className={`text-sm font-medium ${isOnline ? "text-green-600" : "text-gray-500"}`}>
                                {selectedGroup
                                    ? `${selectedGroup.members.length} members`
                                    : (isOnline ? "Online" : "Offline")}
                            </p>
                            {selectedGroup && <Info className="w-3.5 h-3.5 text-gray-400" />}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleVideoCall}
                        className="p-2.5 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition-colors"
                        title="Video Call"
                    >
                        <Video className="w-5 h-5" />
                    </button>
                    {isCreator && (
                        <button
                            onClick={handleDeleteGroup}
                            className="p-2.5 bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors"
                            title="Delete Group"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    )}
                    <button className="p-2.5 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
                        <MoreVertical className="w-5 h-5" />
                    </button>
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
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                {messages.map((message, idx) => (
                    <MessageBubble
                        key={message._id || idx}
                        message={message}
                        isOwn={message.senderId === authUser._id}
                        isGroup={!!selectedGroup}
                    />
                ))}
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center text-gray-500">
                        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                            {selectedGroup ? <Hash className="w-8 h-8 text-indigo-200" /> : <Send className="w-8 h-8 text-indigo-200" />}
                        </div>
                        <p className="font-medium text-gray-600">No messages yet</p>
                        <p className="text-sm">Start the conversation!</p>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="bg-white px-6 py-4 border-t border-gray-100">
                <form onSubmit={handleSendMessage} className="flex gap-3">
                    <button
                        type="button"
                        className="p-3 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                    >
                        <Image className="w-5 h-5" />
                    </button>
                    <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-[15px]"
                    />
                    <button
                        type="submit"
                        disabled={!text.trim()}
                        className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-colors shadow-sm flex items-center justify-center"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </form>
            </div>
        </div>
    );
}

const MessageBubble = memo(({ message, isOwn, isGroup }) => {
    return (
        <div className={`flex ${isOwn ? "justify-end" : "justify-start"} items-end gap-2`}>
            {!isOwn && (
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0 mb-1 border border-gray-200">
                    {message.senderName ? message.senderName.charAt(0) : "U"}
                </div>
            )}

            <div className={`flex flex-col max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}>
                {isGroup && !isOwn && (
                    <span className="text-[11px] text-gray-500 mb-1 ml-1 font-bold">{message.senderName || "Unknown"}</span>
                )}

                <div
                    className={`px-4 py-2.5 rounded-2xl shadow-sm ${isOwn
                        ? "bg-indigo-600 text-white rounded-br-sm"
                        : "bg-white border border-gray-100 text-gray-800 rounded-bl-sm"
                        }`}
                >
                    <p className="text-[15px] leading-relaxed break-words">{message.text}</p>
                </div>

                <span className="text-[10px] text-gray-400 mt-1 mx-1 font-medium">
                    {message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}
                </span>
            </div>
        </div>
    );
});

MessageBubble.displayName = "MessageBubble";
