import { useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { X, Users, Search, Check } from "lucide-react";
import toast from "react-hot-toast";

export default function CreateGroupModal({ isOpen, onClose }) {
    const { users, createGroup } = useChatStore();
    const [groupName, setGroupName] = useState("");
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const filteredUsers = users.filter((u) =>
        u.fullName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleUser = (userId) => {
        if (selectedUsers.includes(userId)) {
            setSelectedUsers(selectedUsers.filter((id) => id !== userId));
        } else {
            setSelectedUsers([...selectedUsers, userId]);
        }
    };

    const handleCreate = async () => {
        if (!groupName.trim()) return toast.error("Group name is required");
        if (selectedUsers.length < 1) return toast.error("Select at least one member");

        setIsSubmitting(true);
        try {
            await createGroup({ name: groupName, memberIds: selectedUsers });
            toast.success("Group created successfully!");
            onClose();
            setGroupName("");
            setSelectedUsers([]);
        } catch (error) {
            toast.error("Failed to create group");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="bg-indigo-100 p-2 rounded-lg">
                            <Users className="w-5 h-5 text-indigo-600" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900">Create New Group</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700">Group Name</label>
                        <input
                            type="text"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            placeholder="Enter group name..."
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                        />
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-semibold text-gray-700">Select Members</label>
                            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                                {selectedUsers.length} selected
                            </span>
                        </div>

                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search contacts..."
                                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            />
                        </div>

                        <div className="max-h-60 overflow-y-auto pr-2 space-y-1 custom-scrollbar">
                            {filteredUsers.map((user) => (
                                <button
                                    key={user._id}
                                    onClick={() => toggleUser(user._id)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${selectedUsers.includes(user._id)
                                            ? "bg-indigo-50 border border-indigo-100"
                                            : "hover:bg-gray-50 border border-transparent"
                                        }`}
                                >
                                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-600 overflow-hidden shrink-0">
                                        {user.profilePic ? (
                                            <img src={user.profilePic} className="w-full h-full object-cover" />
                                        ) : (
                                            user.fullName.charAt(0)
                                        )}
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="font-semibold text-gray-900 text-sm">{user.fullName}</p>
                                        <p className="text-xs text-gray-500 truncate">{user.uniqueId}</p>
                                    </div>
                                    {selectedUsers.includes(user._id) && (
                                        <div className="bg-indigo-600 rounded-full p-1 shadow-sm">
                                            <Check className="w-3 h-3 text-white" />
                                        </div>
                                    )}
                                </button>
                            ))}
                            {filteredUsers.length === 0 && (
                                <div className="text-center py-8 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                    No contacts found
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 px-4 text-sm font-bold text-gray-700 hover:bg-gray-200 rounded-xl transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={isSubmitting || !groupName.trim() || selectedUsers.length === 0}
                        className="flex-2 py-3 px-8 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-indigo-200"
                    >
                        {isSubmitting ? "Creating..." : "Create Group"}
                    </button>
                </div>
            </div>
        </div>
    );
}
