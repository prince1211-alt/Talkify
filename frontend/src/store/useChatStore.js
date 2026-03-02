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
            const { selectedUser, messages, users } = get();

            const isForCurrent = newMessage.senderId === selectedUser?._id || newMessage.receiverId === selectedUser?._id;
            if (isForCurrent) {
                // Prevent duplication for the sender
                if (messages.some(m => m._id === newMessage._id)) return;
                set({ messages: [...messages, newMessage] });
                return;
            }

            // Increment unread for the corresponding user
            const updated = users.map(u => {
                if (u._id === newMessage.senderId || u._id === newMessage.receiverId) {
                    return { ...u, unread: (u.unread || 0) + 1 };
                }
                return u;
            });
            set({ users: updated });
        });

        socket.on("newGroupMessage", (message) => {
            const { selectedGroup, messages, groups } = get();
            if (message.groupId === selectedGroup?._id) {
                // Prevent duplication for the sender
                if (messages.some(m => m._id === message._id)) return;
                set({ messages: [...messages, message] });
                return;
            }

            // increment unread for group
            const updatedGroups = groups.map(g => {
                if (g._id === message.groupId) {
                    return { ...g, unread: (g.unread || 0) + 1 };
                }
                return g;
            });
            set({ groups: updatedGroups });
        });

        socket.on("messageDeleted", (payload) => {
            const { messages } = get();
            const messageId = payload?.messageId || payload?.id;
            if (!messageId) return;
            const updated = messages.map(m => {
                if ((m._id || m.id) === messageId) return { ...m, deleted: true };
                return m;
            });
            set({ messages: updated });
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
            // initialize unread counter for each user
            const usersWithUnread = res.data.map(u => ({ ...u, unread: 0 }));
            set({ users: usersWithUnread });
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
            // initialize unread counter for groups
            const groupsWithUnread = res.data.map(g => ({ ...g, unread: 0 }));
            set({ groups: groupsWithUnread });
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

    deleteMessage: async (messageId) => {
        const { selectedGroup, messages } = get();
        try {
            if (selectedGroup) {
                await axiosInstance.delete(`/groups/${selectedGroup._id}/messages/${messageId}`);
            } else {
                await axiosInstance.delete(`/messages/${messageId}`);
            }
            // mark locally as deleted
            const updated = messages.map(m => (m._id === messageId ? { ...m, deleted: true } : m));
            set({ messages: updated });
        } catch (err) {
            console.error("deleteMessage error:", err);
            throw err;
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

    removeMember: async (groupId, memberId) => {
        try {
            const res = await axiosInstance.delete(`/groups/${groupId}/members/${memberId}`);
            // update local group list and selectedGroup if applicable
            const updatedGroups = get().groups.map(g => g._id === groupId ? res.data.group : g);
            set({ groups: updatedGroups });
            if (get().selectedGroup?._id === groupId) {
                set({ selectedGroup: res.data.group });
            }
            toast.success('Member removed');
        } catch (err) {
            console.error('removeMember error:', err);
            toast.error(err.response?.data?.message || 'Failed to remove member');
        }
    },

    leaveGroup: async (groupId) => {
        try {
            const res = await axiosInstance.post(`/groups/${groupId}/leave`);
            // if current user left, remove group from list and clear selection
            const myId = useAuthStore.getState().authUser?._id;
            const stillMember = (res.data.group && res.data.group.members || []).some(m => m._id === myId || m === myId);
            if (!stillMember) {
                set({ groups: get().groups.filter(g => g._id !== groupId), selectedGroup: null, messages: [] });
            } else {
                // update group
                set({ groups: get().groups.map(g => g._id === groupId ? res.data.group : g), selectedGroup: res.data.group });
            }
            toast.success('Left group');
        } catch (err) {
            console.error('leaveGroup error:', err);
            toast.error(err.response?.data?.message || 'Failed to leave group');
        }
    },

    setSelectedUser: async (user) => {
        set({ selectedUser: user, selectedGroup: null, messages: [] });
        if (!user) return;
        // fetch messages and clear unread
        await get().getMessages(user._id);
        // mark as read on server
        try {
            await axiosInstance.post(`/messages/${user._id}/mark-read`);
        } catch (err) {
            // ignore mark-read errors
        }
        // reset unread locally
        set({ users: get().users.map(u => u._id === user._id ? { ...u, unread: 0 } : u) });
    },

    setSelectedGroup: async (group) => {
        set({ selectedGroup: group, selectedUser: null, messages: [] });
        if (!group) return;
        await get().getGroupMessages(group._id);
        // reset unread locally
        set({ groups: get().groups.map(g => g._id === group._id ? { ...g, unread: 0 } : g) });
    },
}));
