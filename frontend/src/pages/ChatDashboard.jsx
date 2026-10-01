import { useEffect } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useCallStore } from "../store/useCallStore";
import Sidebar from "../components/Sidebar";
import ChatWindow from "../components/ChatWindow";
import VideoCallModal from "../components/VideoCallModal";
import { Phone, Video, Users } from "lucide-react";

export default function ChatDashboard() {
    const { authUser, logout } = useAuthStore();
    const { connectSocket, disconnectSocket, selectedUser, selectedGroup } = useChatStore();
    const { incomingCall, acceptCall, rejectCall } = useCallStore();

    useEffect(() => {
        connectSocket();
        return () => {
            useCallStore.getState().hangUp();
            disconnectSocket();
        };
    }, [connectSocket, disconnectSocket]);

    const handleLogout = async () => {
        useCallStore.getState().hangUp();
        disconnectSocket();
        useChatStore.getState().reset();
        await logout();
    };

    const hasOpenChat = Boolean(selectedUser || selectedGroup);

    return (
        <div className="h-[100dvh] bg-gray-50 flex flex-col overflow-hidden">
            {/* Top Navigation */}
            <nav className="bg-[#075e54] shadow-sm border-b border-gray-200 px-4 py-3 flex justify-between items-center z-10">
                <div className="flex items-center gap-2">
                    <div className="bg-indigo-600 p-2 rounded-lg">
                        <Users className="w-5 h-5 text-white" />
                    </div>
                    <h1 className="text-xl font-bold text-white">
                        Talkify
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    <span className="text-sm border border-gray-200 rounded-md px-3 py-1 font-medium text-black hidden sm:block bg-white">
                        {authUser?.fullName}
                    </span>
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="text-sm border border-black/20 rounded-md px-3 py-1 font-medium text-white hover:bg-red-600 transition-colors bg-red-500"
                    >
                        Logout
                    </button>
                </div>
            </nav>

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar: full screen on phones until a chat is opened */}
                <Sidebar
                    className={`${hasOpenChat ? "hidden md:flex" : "flex"} w-full md:w-80 border-r border-gray-200 bg-[#075e54] flex-shrink-0 flex-col`}
                />

                {/* Chat Area */}
                <div className={`${hasOpenChat ? "flex" : "hidden md:flex"} flex-1 flex-col bg-slate-50 relative min-w-0`}>
                    {hasOpenChat ? (
                        <ChatWindow />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                            <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mb-6 shadow-indigo-100 shadow-lg">
                                <Users className="w-12 h-12 text-indigo-500" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome to Talkify!</h2>
                            <p className="text-gray-500 max-w-md">
                                Select a contact to start a private conversation or create a group to chat with multiple friends.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modals and Overlays */}
            <VideoCallModal />

            {/* Incoming Call */}
            {incomingCall && (
                <div className="fixed top-20 inset-x-4 sm:inset-x-auto sm:right-4 z-[70] bg-white rounded-xl shadow-2xl border border-indigo-100 p-4 sm:w-80">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                            <Phone className="w-6 h-6 text-indigo-600 animate-pulse" />
                        </div>
                        <div className="min-w-0">
                            <h4 className="font-semibold text-gray-900 truncate">
                                {incomingCall.isGroup ? incomingCall.groupName : incomingCall.fromName}
                            </h4>
                            <p className="text-sm text-gray-500 truncate">
                                {incomingCall.isGroup
                                    ? `${incomingCall.fromName} started a group video call`
                                    : "Incoming video call…"}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={acceptCall}
                            className="flex-1 bg-green-500 hover:bg-green-600 text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                        >
                            <Video className="w-4 h-4" /> Accept
                        </button>
                        <button
                            type="button"
                            onClick={rejectCall}
                            className="flex-1 bg-red-100 hover:bg-red-200 text-red-600 font-medium py-2 rounded-lg transition-colors"
                        >
                            Decline
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
