import { useEffect, useState, memo } from "react";
import { useChatStore } from "../store/useChatStore";
import { Users, Search, Plus, MessageSquare } from "lucide-react";
import CreateGroupModal from "./CreateGroupModal";
import AddContactModal from "./AddContactModal";
import { useAuthStore } from "../store/useAuthStore";

export default function Sidebar({ className = "" }) {
    const {
        users, getUsers,
        groups, getGroups,
        selectedUser, setSelectedUser,
        selectedGroup, setSelectedGroup,
        onlineUsers, isUsersLoading, isGroupsLoading
    } = useChatStore();

    const [searchTerm, setSearchTerm] = useState("");
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false);
    const { authUser } = useAuthStore();

    useEffect(() => {
        getUsers();
        getGroups();
    }, [getUsers, getGroups]);

    const filteredUsers = users
        .filter(user => user._id !== authUser?._id)
        .filter(user =>
            user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.uniqueId.toLowerCase().includes(searchTerm.toLowerCase())
        );

    const filteredGroups = groups.filter(group =>
        group.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (isUsersLoading || isGroupsLoading) {
        return (
            <div className={`${className} p-4 bg-white`}>
                <div className="animate-pulse space-y-4">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gray-100 rounded-full" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-gray-100 rounded w-1/2" />
                                <div className="h-3 bg-gray-100 rounded w-3/4" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className={`${className} bg-white flex flex-col h-full border-r border-gray-100`}>
            {/* Header with Search */}
            <div className="p-6 border-b border-gray-100 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-bold text-gray-900 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-indigo-600" />
                        Conversations
                    </h2>
                </div>
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search chats..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-6">
                {/* Groups Section */}
                <div>
                    <div className="flex items-center justify-between px-2 mb-2">
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider">Groups</h3>
                        <button
                            onClick={() => setIsGroupModalOpen(true)}
                            className="p-1 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                        >
                            <Plus className="w-4 h-4 text-white" />
                        </button>
                    </div>
                    <div className="space-y-1">
                        {filteredGroups.map((group) => (
                            <button
                                key={group._id}
                                onClick={() => setSelectedGroup(group)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${selectedGroup?._id === group._id
                                    ? "bg-indigo-50 border border-indigo-100 shadow-sm"
                                    : "hover:bg-gray-50 border border-transparent"
                                    }`}
                            >
                                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-bold shadow-indigo-100 shadow-lg shrink-0">
                                    {group.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="text-left flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900 truncate">{group.name}</p>
                                    <p className="text-xs text-indigo-600 font-medium">{group.members.length} members</p>
                                </div>
                                {group.unread > 0 && (
                                    <div className="ml-2">
                                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500 text-white">{group.unread}</span>
                                    </div>
                                )}
                            </button>
                        ))}
                        {filteredGroups.length === 0 && (
                            <p className="text-center py-4 text-xs text-white">No groups found</p>
                        )}
                    </div>
                </div>

                {/* Direct Messages Section */}
                <div>
                    <div className="flex items-center justify-between px-2 mb-2">
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider">Private Messages</h3>
                        <button
                            onClick={() => setIsAddContactModalOpen(true)}
                            className="p-1 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                        >
                            <Plus className="w-4 h-4 text-white" />
                        </button>
                    </div>
                    <div className="space-y-1">
                        {filteredUsers.map((user) => (
                            <UserItem
                                key={user._id}
                                user={user}
                                isSelected={selectedUser?._id === user._id}
                                isOnline={onlineUsers.includes(user._id)}
                                onClick={setSelectedUser}
                            />
                        ))}
                        {filteredUsers.length === 0 && (
                            <p className="text-center py-4 text-xs text-gray-400">No contacts found</p>
                        )}
                    </div>
                </div>
            </div>

            <CreateGroupModal
                isOpen={isGroupModalOpen}
                onClose={() => setIsGroupModalOpen(false)}
            />
            <AddContactModal
                isOpen={isAddContactModalOpen}
                onClose={() => setIsAddContactModalOpen(false)}
            />
        </div>
    );
}

const UserItem = memo(({ user, isSelected, isOnline, onClick }) => (
    <button
        onClick={() => onClick(user)}
        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${isSelected
            ? "bg-[#128c7e]  shadow-sm"
            : "hover:bg-[#054640] border border-transparent"
            }`}
    >
        <div className="relative shrink-0">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-bold overflow-hidden">
                {user.profilePic ? (
                    <img src={user.profilePic} alt={user.fullName} className="w-full h-full object-cover" />
                ) : (
                    user.fullName.charAt(0)
                )}
            </div>
            {isOnline && (
                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></span>
            )}
        </div>
        <div className="text-left flex-1 min-w-0">
            <p className="font-semibold text-white truncate">{user.fullName}</p>
            <p className="text-xs text-white truncate">{user.uniqueId}</p>
        </div>
        {user.unread > 0 && (
            <div className="pl-2">
                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500 text-white">{user.unread}</span>
            </div>
        )}
    </button>
));

UserItem.displayName = "UserItem";
