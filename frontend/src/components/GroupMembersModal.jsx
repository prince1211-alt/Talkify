import { X } from "lucide-react";

export default function GroupMembersModal({ isOpen, onClose, members }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-indigo-50/50">
                    <h2 className="text-xl font-bold text-gray-900">Group Members</h2>
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
                            <div key={member._id} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
                                <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-600 border border-gray-200 font-bold uppercase overflow-hidden shrink-0">
                                    {member.profilePic ? (
                                        <img src={member.profilePic} alt={member.fullName} className="w-full h-full object-cover" />
                                    ) : (
                                        member.fullName?.charAt(0)
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-gray-900 truncate">{member.fullName}</h3>
                                    <p className="text-sm text-gray-500 truncate">@{member.uniqueId}</p>
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
