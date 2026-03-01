import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { useCallStore } from "./useCallStore";
import { io } from "socket.io-client";
import toast from "react-hot-toast";

const BASE_URL = import.meta.env.MODE === "development" ? "http://localhost:5000" : "/";

export const useChatStore = create((set, get) => ({
    messages: [],
    users: [],
    groups: [],
    selectedUser: null,
    selectedGroup: null,
    isUsersLoading: false,
    isGroupsLoading: false,
    isMessagesLoading: false,
    socket: null,
    onlineUsers: [],

    connectSocket: () => {
        const { authUser } = useAuthStore.getState();
        if (!authUser || get().socket?.connected) return;

        const socket = io(BASE_URL, {
            query: {
                userId: authUser._id || authUser.id || authUser.uniqueId,
            },
        });

        socket.connect();
        set({ socket });

        socket.on("getOnlineUsers", (userIds) => {
            set({ onlineUsers: userIds });
        });

        socket.on("newMessage", (newMessage) => {
            const { selectedUser, messages } = get();
            if (newMessage.senderId === selectedUser?._id || newMessage.receiverId === selectedUser?._id) {
                // Prevent duplication for the sender
                if (messages.some(m => m._id === newMessage._id)) return;
                set({ messages: [...messages, newMessage] });
            }
        });

        socket.on("newGroupMessage", (message) => {
            const { selectedGroup, messages } = get();
            if (message.groupId === selectedGroup?._id) {
                // Prevent duplication for the sender
                if (messages.some(m => m._id === message._id)) return;
                set({ messages: [...messages, message] });
            }
        });

        // 🔹 WebRTC Signaling Listeners
        socket.on("webrtc:incoming-call", (data) => {
            useCallStore.getState().handleIncomingCall(data);
        });

        socket.on("webrtc:start-offer", (data) => {
            useCallStore.getState().handleStartOffer(data, socket);
        });

        socket.on("webrtc:receive-offer", (data) => {
            useCallStore.getState().handleOffer(data, socket);
        });

        socket.on("webrtc:receive-answer", (data) => {
            useCallStore.getState().handleAnswer(data);
        });

        socket.on("webrtc:ice-candidate", (data) => {
            useCallStore.getState().handleIceCandidate(data);
        });

        socket.on("webrtc:call-rejected", () => {
            useCallStore.getState().endCall();
            toast.error("Call rejected");
        });

        socket.on("webrtc:call-ended", () => {
            console.log("Call ended signal received");
            useCallStore.getState().endCall();
        });
        socket.on("groupDeleted", (groupId) => {
            const { groups, selectedGroup } = get();
            set({ groups: groups.filter(g => g._id !== groupId) });
            if (selectedGroup?._id === groupId) {
                set({ selectedGroup: null, messages: [] });
                toast.error("Group has been deleted");
            }
        });
    },

    disconnectSocket: () => {
        if (get().socket?.connected) get().socket.disconnect();
        set({ socket: null });
    },

    getUsers: async () => {
        set({ isUsersLoading: true });
        try {
            const res = await axiosInstance.get("/messages/users");
            set({ users: res.data });
        } catch (error) {
            console.error("getUsers error:", error);
        } finally {
            set({ isUsersLoading: false });
        }
    },

    getGroups: async () => {
        set({ isGroupsLoading: true });
        try {
            const res = await axiosInstance.get("/groups/my");
            set({ groups: res.data });
            // Automatically join socket rooms for all groups
            const socket = get().socket;
            if (socket) {
                res.data.forEach(group => socket.emit("joinGroup", group._id));
            }
        } catch (error) {
            console.error("getGroups error:", error);
        } finally {
            set({ isGroupsLoading: false });
        }
    },

    getMessages: async (userId) => {
        set({ isMessagesLoading: true });
        try {
            const res = await axiosInstance.get(`/messages/${userId}`);
            set({ messages: res.data });
        } catch (error) {
            console.error("getMessages error:", error);
        } finally {
            set({ isMessagesLoading: false });
        }
    },

    getGroupMessages: async (groupId) => {
        set({ isMessagesLoading: true });
        try {
            const res = await axiosInstance.get(`/groups/${groupId}/messages`);
            set({ messages: res.data });
        } catch (error) {
            console.error("getGroupMessages error:", error);
        } finally {
            set({ isMessagesLoading: false });
        }
    },

    sendMessage: async (messageData) => {
        const { selectedUser, selectedGroup, messages } = get();
        try {
            let res;
            if (selectedGroup) {
                res = await axiosInstance.post(`/groups/${selectedGroup._id}/send`, messageData);
            } else {
                res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
            }
            set({ messages: [...messages, res.data] });
        } catch (error) {
            console.error("sendMessage error:", error);
        }
    },

    createGroup: async (groupData) => {
        try {
            const res = await axiosInstance.post("/groups/create", groupData);
            set({ groups: [...get().groups, res.data.group] });
            get().socket?.emit("joinGroup", res.data.group._id);
            return res.data.group;
        } catch (error) {
            console.error("createGroup error:", error);
            throw error;
        }
    },

    deleteGroup: async (groupId) => {
        try {
            await axiosInstance.delete(`/groups/${groupId}`);
            set({
                groups: get().groups.filter(g => g._id !== groupId),
                selectedGroup: null,
                messages: []
            });
            toast.success("Group deleted successfully");
        } catch (error) {
            console.error("deleteGroup error:", error);
            toast.error(error.response?.data?.message || "Failed to delete group");
        }
    },

    setSelectedUser: (user) => set({ selectedUser: user, selectedGroup: null, messages: [] }),
    setSelectedGroup: (group) => set({ selectedGroup: group, selectedUser: null, messages: [] }),
}));
