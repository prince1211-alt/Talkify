import { useState } from "react";
import { X, Search } from "lucide-react";
import { useChatStore } from "../store/useChatStore";

export default function AddContactModal({ isOpen, onClose }) {
    const [uniqueId, setUniqueId] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { addContact } = useChatStore();

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!uniqueId.trim()) return;

        setIsSubmitting(true);
        const success = await addContact(uniqueId.trim());
        setIsSubmitting(false);

        if (success) {
            setUniqueId("");
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900">Add Contact</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                User Unique ID
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type="text"
                                    required
                                    value={uniqueId}
                                    onChange={(e) => setUniqueId(e.target.value)}
                                    placeholder="Enter user's unique ID..."
                                    className="block w-full pl-10 pr-3 border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 py-2 border bg-gray-50 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !uniqueId.trim()}
                            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                            {isSubmitting ? "Adding..." : "Add Contact"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
