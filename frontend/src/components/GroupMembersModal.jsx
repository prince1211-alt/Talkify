import { X, Trash2, LogOut } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";

export default function GroupMembersModal({ isOpen, onClose, members }) {
    const { authUser } = useAuthStore();
    const { selectedGroup, removeMember, leaveGroup } = useChatStore();

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
                           // toast.success("Member removed successfully");
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
                           // toast.success("You left the group");
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

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-indigo-50/50">
                    <h2 className="text-xl font-bold text-gray-900">
                        Group Members
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white rounded-full transition-colors text-gray-500 hover:text-gray-700 shadow-sm"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Members List */}
                <div className="p-4 max-h-[60vh] overflow-y-auto">
                    <div className="space-y-3">
                        {members.map((member) => (
                            <div
                                key={member._id}
                                className="flex items-center gap-4 p-3 rounded-2xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100"
                            >
                                <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-600 border border-gray-200 font-bold uppercase overflow-hidden shrink-0">
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

                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-gray-900 truncate">
                                        {member.fullName}
                                    </h3>
                                    <p className="text-sm text-gray-500 truncate">
                                        @{member.uniqueId}
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
                        ))}
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