import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { useCallStore } from "./useCallStore";
import { io } from "socket.io-client";
import toast from "react-hot-toast";
import {
    generateAESKey, encryptAESMessage, decryptAESMessage,
    encryptAESKeyWithRSA, decryptAESKeyWithRSA,
    importRSAPublicKey, importRSAPrivateKey
} from "../utils/crypto";

const BASE_URL = import.meta.env.MODE === "development" ? "http://localhost:5000" : "/";

const decryptMessageObj = async (msg) => {
    if (msg.deleted || !msg.text || !msg.iv) return msg;

    const authUser = useAuthStore.getState().authUser;
    if (!authUser || !authUser.privateKeyStr) return msg;

    try {
        const rsaPriv = await importRSAPrivateKey(authUser.privateKeyStr);
        let encryptedAesKeyStr = null;

        const myId = authUser._id || authUser.id;
        if (msg.groupId) {
            encryptedAesKeyStr = msg.encryptedKeysMap?.[myId];
        } else {
            if (msg.senderId?._id === myId || msg.senderId === myId) {
                encryptedAesKeyStr = msg.encryptedKeyForSender;
            } else if (msg.receiverId === myId) {
                encryptedAesKeyStr = msg.encryptedKeyForReceiver;
            }
        }

        if (!encryptedAesKeyStr) return msg;

        const aesKey = await decryptAESKeyWithRSA(encryptedAesKeyStr, rsaPriv);
        const plaintext = await decryptAESMessage(msg.text, msg.iv, aesKey);

        return { ...msg, text: plaintext };
    } catch (err) {
        console.error("Failed to decrypt message:", msg._id, err);
        return { ...msg, text: "[Decryption Failed]" };
    }
};

const decryptMessagesArray = async (messages) => {
    return await Promise.all(messages.map(m => decryptMessageObj(m)));
};

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

        socket.on("contactAdded", ({ user }) => {
            const { users } = get();
            const alreadyExists = users.some(u => u._id === user._id);
            if (!alreadyExists) {
                set({ users: [...users, { ...user, unread: 0 }] });
            }
        });

        socket.on("newMessage", async (newMessage) => {
            const { selectedUser, messages, users } = get();
            const myId = useAuthStore.getState().authUser?._id;

            // If we already have this message locally (sender's copy), skip
            if (messages.some(m => m._id?.toString() === newMessage._id?.toString())) return;

            // Don't try to decrypt our own sent messages — we already added them with plaintext
            const decryptedMsg = newMessage.senderId === myId ? newMessage : await decryptMessageObj(newMessage);

            const isForCurrent = decryptedMsg.senderId === selectedUser?._id || decryptedMsg.receiverId === selectedUser?._id;
            if (isForCurrent) {
                set({ messages: [...messages, decryptedMsg] });
                return;
            }

            // Increment unread for the corresponding user
            const updated = users.map(u => {
                if (u._id === decryptedMsg.senderId || u._id === decryptedMsg.receiverId) {
                    return { ...u, unread: (u.unread || 0) + 1 };
                }
                return u;
            });
            set({ users: updated });
        });

        socket.on("newGroupMessage", async (message) => {
            const { selectedGroup, messages, groups } = get();
            const myId = useAuthStore.getState().authUser?._id;

            // If we already have this message locally (sender's copy), skip
            if (messages.some(m => m._id?.toString() === message._id?.toString())) return;

            // Don't re-decrypt our own messages — we already added them with plaintext
            const decryptedMsg = (message.senderId === myId || message.senderId?.toString() === myId)
                ? message
                : await decryptMessageObj(message);

            if (String(decryptedMsg.groupId) === String(selectedGroup?._id)) {
                set({ messages: [...messages, decryptedMsg] });
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
            useCallStore.getState().endCall();
        });

        socket.on("webrtc:user-left", (data) => {
            if (data.from) {
                useCallStore.getState().removeUserFromCall(data.from);
            }
        });

        socket.on("groupDeleted", (groupId) => {
            const { groups, selectedGroup } = get();
            set({ groups: groups.filter(g => g._id !== groupId) });
            if (selectedGroup?._id === groupId) {
                set({ selectedGroup: null, messages: [] });
                toast.error("Group has been deleted");
            }
        });

        socket.on("groupUpdated", ({ groupId, members }) => {
            const { groups, selectedGroup } = get();
            const updatedGroups = groups.map(g => {
                if (g._id === groupId) {
                    return { ...g, members };
                }
                return g;
            });
            set({ groups: updatedGroups });
            if (selectedGroup?._id === groupId) {
                set({ selectedGroup: { ...selectedGroup, members } });
            }
        });

        socket.on("addedToGroup", (group) => {
            const { groups } = get();
            const alreadyIn = groups.some(g => g._id === group._id);
            if (!alreadyIn) {
                set({ groups: [...groups, { ...group, unread: 0 }] });
                socket.emit("joinGroup", group._id);
                toast.success(`You were added to group: ${group.name}`);
            }
        });

        socket.on("removedFromGroup", ({ groupId }) => {
            const { groups, selectedGroup } = get();
            set({ groups: groups.filter(g => g._id !== groupId) });
            if (selectedGroup?._id === groupId) {
                set({ selectedGroup: null, messages: [] });
                toast.error("You were removed from the group");
            }
        });

        socket.on("leftGroup", ({ groupId }) => {
            const { groups, selectedGroup } = get();
            set({ groups: groups.filter(g => g._id !== groupId) });
            if (selectedGroup?._id === groupId) {
                set({ selectedGroup: null, messages: [] });
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
            const res = await axiosInstance.get("/groups/my-groups");
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
            const decryptedMessages = await decryptMessagesArray(res.data);
            set({ messages: decryptedMessages });
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
            const decryptedMessages = await decryptMessagesArray(res.data);
            set({ messages: decryptedMessages });
        } catch (error) {
            console.error("getGroupMessages error:", error);
        } finally {
            set({ isMessagesLoading: false });
        }
    },

    sendMessage: async (messageData) => {
        const { selectedUser, selectedGroup, messages } = get();
        try {
            const authUser = useAuthStore.getState().authUser;
            let res;

            // ── Image-only (FormData) path — no E2EE needed for images ──
            if (messageData instanceof FormData) {
                if (selectedGroup) {
                    res = await axiosInstance.post(
                        `/groups/${selectedGroup._id}/send`,
                        messageData,
                        { headers: { "Content-Type": "multipart/form-data" } }
                    );
                } else {
                    res = await axiosInstance.post(
                        `/messages/send/${selectedUser._id}`,
                        messageData,
                        { headers: { "Content-Type": "multipart/form-data" } }
                    );
                }
                set({ messages: [...messages, res.data] });
                return;
            }

            // ── Text message (E2EE) path ──
            if (selectedGroup) {
                const keysRes = await axiosInstance.get(`/groups/${selectedGroup._id}/keys`);
                const keysMapStr = keysRes.data.keysMap;

                const aesKey = await generateAESKey();

                let ciphertext = "";
                let iv = "";
                if (messageData.text) {
                    const enc = await encryptAESMessage(messageData.text, aesKey);
                    ciphertext = enc.ciphertextStr;
                    iv = enc.ivStr;
                }

                const encryptedKeysMap = {};
                for (const memberId of Object.keys(keysMapStr)) {
                    if (keysMapStr[memberId]) {
                        const rsaPub = await importRSAPublicKey(keysMapStr[memberId]);
                        encryptedKeysMap[memberId] = await encryptAESKeyWithRSA(aesKey, rsaPub);
                    }
                }

                const payload = { ...messageData, text: ciphertext, iv, encryptedKeysMap };
                res = await axiosInstance.post(`/groups/${selectedGroup._id}/send`, payload);
            } else {
                const keyRes = await axiosInstance.get(`/messages/keys/${selectedUser._id}`);
                const receiverPubKeyStr = keyRes.data.publicKey;
                const senderPubKeyStr = authUser.publicKey;

                const aesKey = await generateAESKey();

                let ciphertext = "";
                let iv = "";
                if (messageData.text) {
                    const enc = await encryptAESMessage(messageData.text, aesKey);
                    ciphertext = enc.ciphertextStr;
                    iv = enc.ivStr;
                }

                let encryptedKeyForReceiver = "";
                if (receiverPubKeyStr) {
                    const receiverRsaPub = await importRSAPublicKey(receiverPubKeyStr);
                    encryptedKeyForReceiver = await encryptAESKeyWithRSA(aesKey, receiverRsaPub);
                }

                let encryptedKeyForSender = "";
                if (senderPubKeyStr) {
                    const senderRsaPub = await importRSAPublicKey(senderPubKeyStr);
                    encryptedKeyForSender = await encryptAESKeyWithRSA(aesKey, senderRsaPub);
                }

                const payload = {
                    ...messageData,
                    text: ciphertext,
                    iv,
                    encryptedKeyForReceiver,
                    encryptedKeyForSender
                };

                res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, payload);
            }

            const sentMsg = res.data;
            if (messageData.text) {
                sentMsg.text = messageData.text; // Use plaintext for local display
            }
            set({ messages: [...messages, sentMsg] });
        } catch (error) {
            console.error("sendMessage error:", error);
            toast.error("Failed to send message");
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
            const res = await axiosInstance.delete(`/groups/${groupId}/remove/${memberId}`);
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

    addContact: async (uniqueId) => {
        try {
            await axiosInstance.post("/auth/add-contact", { uniqueId });
            toast.success("Contact added successfully");
            await get().getUsers();
            return true;
        } catch (error) {
            console.error("addContact error:", error);
            toast.error(error.response?.data?.message || "Failed to add contact");
            return false;
        }
    },

    addGroupMember: async (groupId, uniqueId) => {
        try {
            const res = await axiosInstance.post(`/groups/${groupId}/add`, { uniqueId });
            const updatedGroups = get().groups.map(g => g._id === groupId ? res.data.group : g);
            set({ groups: updatedGroups });
            if (get().selectedGroup?._id === groupId) {
                set({ selectedGroup: res.data.group });
            }
            toast.success("Member added");
            return true;
        } catch (error) {
            console.error("addGroupMember error:", error);
            toast.error(error.response?.data?.message || "Failed to add member");
            return false;
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
        } catch {
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
