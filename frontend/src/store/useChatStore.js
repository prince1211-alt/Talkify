import { create } from "zustand";
import { axiosInstance, BACKEND_URL, forceLogout } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { registerCallSocketHandlers } from "./useCallStore";
import { io } from "socket.io-client";
import toast from "react-hot-toast";
import {
    generateAESKey, encryptAESMessage, decryptAESMessage, encryptAESBytes,
    encryptAESKeyWithRSA, decryptAESKeyWithRSA, importRSAPublicKey,
} from "../utils/crypto";
import { getSessionPrivateKey } from "../utils/keyStore";

const UNREADABLE_TEXT = "🔒 This message can't be decrypted (it was encrypted for an older key).";

const getMyId = () => {
    const authUser = useAuthStore.getState().authUser;
    return authUser ? String(authUser._id || authUser.id) : "";
};

// senderId may be a plain id or a populated user object
export const idOf = (value) => (value && typeof value === "object" ? String(value._id) : value ? String(value) : "");

const sameId = (a, b) => idOf(a) === idOf(b);

const unwrapMessageKey = async (msg) => {
    const myId = getMyId();
    const privateKey = await getSessionPrivateKey(myId);
    if (!privateKey) return null;

    let wrappedKey;
    if (msg.groupId) {
        wrappedKey = msg.encryptedKeysMap?.[myId];
    } else if (idOf(msg.senderId) === myId) {
        wrappedKey = msg.encryptedKeyForSender;
    } else if (idOf(msg.receiverId) === myId) {
        wrappedKey = msg.encryptedKeyForReceiver;
    }
    if (!wrappedKey) return null;

    return await decryptAESKeyWithRSA(wrappedKey, privateKey);
};

// Decrypts text now; keeps the AES key on the message so the image can be decrypted when shown
const decryptMessageObj = async (msg) => {
    if (msg.deleted) return msg;

    const hasEncryptedText = Boolean(msg.text && msg.iv);
    const hasEncryptedImage = Boolean(msg.image && msg.imageIv);
    if (!hasEncryptedText && !hasEncryptedImage) return msg; // legacy plaintext message

    try {
        const aesKey = await unwrapMessageKey(msg);
        if (!aesKey) {
            return { ...msg, text: hasEncryptedText ? UNREADABLE_TEXT : msg.text, decryptionFailed: true };
        }
        const text = hasEncryptedText ? await decryptAESMessage(msg.text, msg.iv, aesKey) : msg.text;
        return { ...msg, text, aesKey };
    } catch (err) {
        console.error("Failed to decrypt message:", msg._id, err);
        return { ...msg, text: hasEncryptedText ? UNREADABLE_TEXT : msg.text, decryptionFailed: true };
    }
};

const decryptMessagesArray = (messages) => Promise.all(messages.map(decryptMessageObj));

const wrapKeyFor = async (aesKey, publicKeyStr) =>
    encryptAESKeyWithRSA(aesKey, await importRSAPublicKey(publicKeyStr));

// Ignores responses for a chat the user has already navigated away from
let loadSequence = 0;

const initialState = {
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
};

export const useChatStore = create((set, get) => ({
    ...initialState,

    // Insert or merge a message by _id using the latest state (avoids lost updates / duplicates)
    upsertMessage: (msg) => {
        set((state) => {
            const index = state.messages.findIndex((m) => sameId(m._id, msg._id));
            if (index === -1) return { messages: [...state.messages, msg] };
            const messages = state.messages.slice();
            messages[index] = { ...messages[index], ...msg };
            return { messages };
        });
    },

    reset: () => {
        loadSequence++;
        set({ ...initialState });
    },

    connectSocket: () => {
        const { authUser } = useAuthStore.getState();
        if (!authUser?.token || get().socket) return;

        // The server identifies the user from the JWT, not from a client-supplied id
        const socket = io(BACKEND_URL || undefined, {
            auth: { token: authUser.token },
            withCredentials: true,
        });

        set({ socket });

        socket.on("connect_error", (err) => {
            if (err.message === "Unauthorized") forceLogout();
        });

        socket.on("getOnlineUsers", (userIds) => {
            set({ onlineUsers: userIds });
        });

        socket.on("contactAdded", ({ user }) => {
            set((state) => (
                state.users.some((u) => sameId(u._id, user._id))
                    ? {}
                    : { users: [...state.users, { ...user, unread: 0 }] }
            ));
        });

        socket.on("newMessage", async (rawMessage) => {
            const myId = getMyId();
            const isMine = idOf(rawMessage.senderId) === myId;
            const otherId = isMine ? idOf(rawMessage.receiverId) : idOf(rawMessage.senderId);

            // Already shown (e.g. our own message added from the HTTP response)
            if (get().messages.some((m) => sameId(m._id, rawMessage._id))) return;

            const message = await decryptMessageObj(rawMessage);

            if (sameId(get().selectedUser?._id, otherId)) {
                get().upsertMessage(message);
                return;
            }

            // Increment unread for the corresponding user (not for our own messages from another tab)
            if (!isMine) {
                set((state) => ({
                    users: state.users.map((u) => (sameId(u._id, otherId) ? { ...u, unread: (u.unread || 0) + 1 } : u)),
                }));
            }
        });

        socket.on("newGroupMessage", async (rawMessage) => {
            if (get().messages.some((m) => sameId(m._id, rawMessage._id))) return;

            const message = await decryptMessageObj(rawMessage);

            if (sameId(get().selectedGroup?._id, message.groupId)) {
                get().upsertMessage(message);
                return;
            }

            if (idOf(rawMessage.senderId) !== getMyId()) {
                set((state) => ({
                    groups: state.groups.map((g) => (sameId(g._id, message.groupId) ? { ...g, unread: (g.unread || 0) + 1 } : g)),
                }));
            }
        });

        socket.on("messageDeleted", (payload) => {
            const messageId = payload?.messageId || payload?.id;
            if (!messageId) return;
            set((state) => ({
                messages: state.messages.map((m) => (
                    sameId(m._id, messageId) ? { ...m, deleted: true, text: "", image: "", aesKey: null } : m
                )),
            }));
        });

        // 🔹 Video / voice call signaling
        registerCallSocketHandlers(socket);

        socket.on("groupDeleted", (groupId) => {
            const wasSelected = sameId(get().selectedGroup?._id, groupId);
            set((state) => ({
                groups: state.groups.filter((g) => !sameId(g._id, groupId)),
                ...(wasSelected ? { selectedGroup: null, messages: [] } : {}),
            }));
            if (wasSelected) toast.error("Group has been deleted");
        });

        socket.on("groupUpdated", ({ groupId, members, createdBy }) => {
            const patch = (g) => ({ ...g, members, ...(createdBy ? { createdBy } : {}) });
            set((state) => ({
                groups: state.groups.map((g) => (sameId(g._id, groupId) ? patch(g) : g)),
                selectedGroup: sameId(state.selectedGroup?._id, groupId) ? patch(state.selectedGroup) : state.selectedGroup,
            }));
        });

        socket.on("addedToGroup", (group) => {
            if (get().groups.some((g) => sameId(g._id, group._id))) return;
            set((state) => ({ groups: [...state.groups, { ...group, unread: 0 }] }));
            socket.emit("joinGroup", group._id);
            toast.success(`You were added to group: ${group.name}`);
        });

        const dropGroup = (groupId, message) => {
            const wasSelected = sameId(get().selectedGroup?._id, groupId);
            set((state) => ({
                groups: state.groups.filter((g) => !sameId(g._id, groupId)),
                ...(wasSelected ? { selectedGroup: null, messages: [] } : {}),
            }));
            if (wasSelected && message) toast.error(message);
        };

        socket.on("removedFromGroup", ({ groupId }) => dropGroup(groupId, "You were removed from the group"));
        socket.on("leftGroup", ({ groupId }) => dropGroup(groupId));
    },

    disconnectSocket: () => {
        const socket = get().socket;
        if (socket) {
            socket.removeAllListeners();
            socket.disconnect();
        }
        set({ socket: null });
    },

    getUsers: async () => {
        set({ isUsersLoading: true });
        try {
            const res = await axiosInstance.get("/messages/users");
            // keep unread counters that were already counted
            const unreadById = new Map(get().users.map((u) => [String(u._id), u.unread || 0]));
            set({ users: res.data.map((u) => ({ ...u, unread: unreadById.get(String(u._id)) || 0 })) });
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
            set({ groups: res.data.map((g) => ({ ...g, unread: 0 })) });
            // The server joins group rooms on connect; this covers groups created since then
            const socket = get().socket;
            if (socket) res.data.forEach((group) => socket.emit("joinGroup", group._id));
        } catch (error) {
            console.error("getGroups error:", error);
        } finally {
            set({ isGroupsLoading: false });
        }
    },

    // Loads + decrypts a conversation; ignores the result if the user switched chats meanwhile
    loadConversation: async (url, isStillSelected) => {
        const requestId = ++loadSequence;
        set({ isMessagesLoading: true });
        try {
            const res = await axiosInstance.get(url);
            const decrypted = await decryptMessagesArray(res.data);
            if (requestId !== loadSequence || !isStillSelected()) return;

            // Keep messages that arrived over the socket while we were loading
            set((state) => {
                const loadedIds = new Set(decrypted.map((m) => String(m._id)));
                return { messages: [...decrypted, ...state.messages.filter((m) => !loadedIds.has(String(m._id)))] };
            });
        } catch (error) {
            console.error("loadConversation error:", error);
            if (requestId === loadSequence) toast.error("Could not load messages");
        } finally {
            if (requestId === loadSequence) set({ isMessagesLoading: false });
        }
    },

    getMessages: (userId) =>
        get().loadConversation(`/messages/${userId}`, () => sameId(get().selectedUser?._id, userId)),

    getGroupMessages: (groupId) =>
        get().loadConversation(`/groups/${groupId}/messages`, () => sameId(get().selectedGroup?._id, groupId)),

    // Sends text and/or an image. Everything is encrypted in the browser:
    // the server only ever sees ciphertext and the per-recipient wrapped keys.
    // `target` defaults to the open chat ({ type: "user" | "group", id }).
    sendMessage: async ({ text = "", imageFile = null } = {}, target = null) => {
        const { selectedUser, selectedGroup } = get();
        const chat = target
            || (selectedGroup ? { type: "group", id: selectedGroup._id }
                : selectedUser ? { type: "user", id: selectedUser._id } : null);
        if (!chat || (!text && !imageFile)) return false;

        try {
            const authUser = useAuthStore.getState().authUser;
            const aesKey = await generateAESKey();
            const fields = {};

            if (text) {
                const enc = await encryptAESMessage(text, aesKey);
                fields.text = enc.ciphertextStr;
                fields.iv = enc.ivStr;
            }

            let encryptedImage = null;
            if (imageFile) {
                const enc = await encryptAESBytes(await imageFile.arrayBuffer(), aesKey);
                encryptedImage = new Blob([enc.ciphertext], { type: "application/octet-stream" });
                fields.imageIv = enc.ivStr;
            }

            if (chat.type === "group") {
                const keysRes = await axiosInstance.get(`/groups/${chat.id}/keys`);
                const encryptedKeysMap = {};
                for (const [memberId, publicKey] of Object.entries(keysRes.data.keysMap)) {
                    if (publicKey) encryptedKeysMap[memberId] = await wrapKeyFor(aesKey, publicKey);
                }
                fields.encryptedKeysMap = encryptedKeysMap;
            } else {
                const keyRes = await axiosInstance.get(`/messages/keys/${chat.id}`);
                if (!keyRes.data.publicKey) {
                    throw new Error("This contact hasn't set up encryption yet. Ask them to log in again.");
                }
                fields.encryptedKeyForReceiver = await wrapKeyFor(aesKey, keyRes.data.publicKey);
                if (authUser?.publicKey) {
                    fields.encryptedKeyForSender = await wrapKeyFor(aesKey, authUser.publicKey);
                }
            }

            let body = fields;
            if (encryptedImage) {
                body = new FormData();
                for (const [key, value] of Object.entries(fields)) {
                    body.append(key, typeof value === "string" ? value : JSON.stringify(value));
                }
                body.append("image", encryptedImage, "image.bin");
            }

            const url = chat.type === "group" ? `/groups/${chat.id}/send` : `/messages/send/${chat.id}`;
            const res = await axiosInstance.post(url, body);

            // Show our own message in plaintext right away (no need to download our own image)
            const sentMsg = {
                ...res.data,
                text,
                aesKey,
                localImageUrl: imageFile ? URL.createObjectURL(imageFile) : undefined,
            };

            const current = get();
            const isOpen = chat.type === "group"
                ? sameId(current.selectedGroup?._id, chat.id)
                : sameId(current.selectedUser?._id, chat.id);
            if (isOpen) current.upsertMessage(sentMsg);
            return true;
        } catch (error) {
            console.error("sendMessage error:", error);
            toast.error(error.response?.data?.message || error.message || "Failed to send message");
            return false;
        }
    },

    deleteMessage: async (messageId) => {
        const { selectedGroup } = get();
        if (selectedGroup) {
            await axiosInstance.delete(`/groups/${selectedGroup._id}/messages/${messageId}`);
        } else {
            await axiosInstance.delete(`/messages/${messageId}`);
        }
        // mark locally as deleted
        set((state) => ({
            messages: state.messages.map((m) => (
                sameId(m._id, messageId) ? { ...m, deleted: true, text: "", image: "", aesKey: null } : m
            )),
        }));
    },

    createGroup: async (groupData) => {
        const res = await axiosInstance.post("/groups/create", groupData);
        const group = res.data.group;
        set((state) => (
            state.groups.some((g) => sameId(g._id, group._id)) ? {} : { groups: [...state.groups, { ...group, unread: 0 }] }
        ));
        get().socket?.emit("joinGroup", group._id);
        return group;
    },

    deleteGroup: async (groupId) => {
        try {
            await axiosInstance.delete(`/groups/${groupId}`);
            set((state) => ({
                groups: state.groups.filter((g) => !sameId(g._id, groupId)),
                selectedGroup: null,
                messages: [],
            }));
            toast.success("Group deleted successfully");
        } catch (error) {
            console.error("deleteGroup error:", error);
            toast.error(error.response?.data?.message || "Failed to delete group");
        }
    },

    replaceGroup: (group) => {
        set((state) => ({
            groups: state.groups.map((g) => (sameId(g._id, group._id) ? { ...g, ...group } : g)),
            selectedGroup: sameId(state.selectedGroup?._id, group._id) ? { ...state.selectedGroup, ...group } : state.selectedGroup,
        }));
    },

    removeMember: async (groupId, memberId) => {
        try {
            const res = await axiosInstance.delete(`/groups/${groupId}/remove/${memberId}`);
            get().replaceGroup(res.data.group);
            toast.success('Member removed');
        } catch (err) {
            console.error('removeMember error:', err);
            toast.error(err.response?.data?.message || 'Failed to remove member');
        }
    },

    leaveGroup: async (groupId) => {
        try {
            await axiosInstance.post(`/groups/${groupId}/leave`);
            set((state) => ({
                groups: state.groups.filter((g) => !sameId(g._id, groupId)),
                ...(sameId(state.selectedGroup?._id, groupId) ? { selectedGroup: null, messages: [] } : {}),
            }));
            toast.success('Left group');
        } catch (err) {
            console.error('leaveGroup error:', err);
            toast.error(err.response?.data?.message || 'Failed to leave group');
        }
    },

    addContact: async (uniqueId) => {
        try {
            const res = await axiosInstance.post("/auth/add-contact", { uniqueId });
            toast.success("Contact added successfully");
            const contact = res.data?.targetUser;
            if (contact) {
                set((state) => (
                    state.users.some((u) => sameId(u._id, contact._id))
                        ? {}
                        : { users: [...state.users, { ...contact, unread: 0 }] }
                ));
            }
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
            get().replaceGroup(res.data.group);
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
        // reset unread locally
        set((state) => ({ users: state.users.map((u) => (sameId(u._id, user._id) ? { ...u, unread: 0 } : u)) }));
        await get().getMessages(user._id);
        // mark as read on server
        axiosInstance.post(`/messages/${user._id}/mark-read`).catch(() => {});
    },

    setSelectedGroup: async (group) => {
        set({ selectedGroup: group, selectedUser: null, messages: [] });
        if (!group) return;
        // reset unread locally
        set((state) => ({ groups: state.groups.map((g) => (sameId(g._id, group._id) ? { ...g, unread: 0 } : g)) }));
        await get().getGroupMessages(group._id);
    },
}));
