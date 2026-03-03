import { useState } from "react";
import { X, Trash2, LogOut, UserPlus, Search } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";

export default function GroupMembersModal({ isOpen, onClose, members }) {
    const { authUser } = useAuthStore();
    const { selectedGroup, removeMember, leaveGroup, addGroupMember, onlineUsers } = useChatStore();
    const [newMemberId, setNewMemberId] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [showAddInput, setShowAddInput] = useState(false);

    if (!isOpen) return null;

    const isCreator =
        selectedGroup &&
        String(selectedGroup.createdBy) === String(authUser?._id);

    const handleRemove = (memberId) => {
        if (!selectedGroup) return;

        toast((t) => (
            <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">
                    Remove this member from the group?
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
                            await removeMember(selectedGroup._id, memberId);
                            toast.dismiss(t.id);
                        }}
                        className="px-3 py-1 text-sm bg-red-500 text-white rounded-lg"
                    >
                        Remove
                    </button>
                </div>
            </div>
        ));
    };

    const handleLeave = () => {
        if (!selectedGroup) return;

        toast((t) => (
            <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">
                    Leave this group?
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
                            await leaveGroup(selectedGroup._id);
                            toast.dismiss(t.id);
                            onClose();
                        }}
                        className="px-3 py-1 text-sm bg-red-500 text-white rounded-lg"
                    >
                        Leave
                    </button>
                </div>
            </div>
        ));
    };

    const handleAddMember = async (e) => {
        e.preventDefault();
        if (!newMemberId.trim() || !selectedGroup) return;
        setIsAdding(true);
        const success = await addGroupMember(selectedGroup._id, newMemberId.trim());
        setIsAdding(false);
        if (success) {
            setNewMemberId("");
            setShowAddInput(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-indigo-50/50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">
                            Group Members
                        </h2>
                        <p className="text-sm text-indigo-600 font-medium">
                            {members.length} member{members.length !== 1 ? "s" : ""}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {isCreator && (
                            <button
                                onClick={() => setShowAddInput(prev => !prev)}
                                className="p-2 hover:bg-indigo-100 rounded-full transition-colors text-indigo-600"
                                title="Add member"
                            >
                                <UserPlus className="w-5 h-5" />
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white rounded-full transition-colors text-gray-500 hover:text-gray-700 shadow-sm"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Add Member Input (shown only for creator) */}
                {isCreator && showAddInput && (
                    <div className="px-4 pt-4">
                        <form onSubmit={handleAddMember} className="flex gap-2">
                            <div className="relative flex-1">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="w-4 h-4 text-gray-400" />
                                </div>
                                <input
                                    type="text"
                                    value={newMemberId}
                                    onChange={(e) => setNewMemberId(e.target.value)}
                                    placeholder="Enter user's unique ID..."
                                    className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isAdding || !newMemberId.trim()}
                                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {isAdding ? "Adding..." : "Add"}
                            </button>
                        </form>
                    </div>
                )}

                {/* Members List */}
                <div className="p-4 max-h-[60vh] overflow-y-auto">
                    <div className="space-y-3">
                        {members.map((member) => {
                            const isOnline = onlineUsers.includes(member._id);
                            return (
                                <div
                                    key={member._id}
                                    className="flex items-center gap-4 p-3 rounded-2xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100"
                                >
                                    <div className="relative shrink-0">
                                        <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-600 border border-gray-200 font-bold uppercase overflow-hidden">
                                            {member.profilePic ? (
                                                <img
                                                    src={member.profilePic}
                                                    alt={member.fullName}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                member.fullName?.charAt(0)
                                            )}
                                        </div>
                                        {isOnline && (
                                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-gray-900 truncate">
                                            {member.fullName}
                                            {String(member._id) === String(selectedGroup?.createdBy) && (
                                                <span className="ml-2 text-xs text-indigo-600 font-medium">Admin</span>
                                            )}
                                        </h3>
                                        <p className="text-sm text-gray-500 truncate flex items-center gap-1">
                                            @{member.uniqueId}
                                            {isOnline && (
                                                <span className="text-xs text-green-500 font-medium">• Online</span>
                                            )}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {isCreator &&
                                            String(member._id) !==
                                            String(selectedGroup.createdBy) && (
                                                <button
                                                    onClick={() =>
                                                        handleRemove(member._id)
                                                    }
                                                    className="text-red-500 p-2 rounded hover:bg-red-50"
                                                    title="Remove from group"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}

                                        {String(member._id) ===
                                            String(authUser?._id) && (
                                                <button
                                                    onClick={handleLeave}
                                                    className="text-gray-600 p-2 rounded hover:bg-gray-50"
                                                    title="Leave group"
                                                >
                                                    <LogOut className="w-4 h-4" />
                                                </button>
                                            )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50/50">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-white border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-all shadow-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}