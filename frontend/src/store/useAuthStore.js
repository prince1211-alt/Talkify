import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";
import {
    generateRSAKeyPair,
    encryptPrivateKeyWithPassword,
    decryptPrivateKeyWithPassword,
    needsPrivateKeyUpgrade,
} from "../utils/crypto";
import { setSessionPrivateKey, getSessionPrivateKey, clearSessionKeys } from "../utils/keyStore";

const STORAGE_KEY = "chat-user";

const readStoredUser = () => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
    } catch {
        return null;
    }
};

// What we keep in localStorage: profile + token. Never the private key.
const toStoredUser = (user, token) => {
    const { encryptedPrivateKey: _encrypted, privateKeyStr: _plain, password: _password, ...rest } = user;
    return { ...rest, token };
};

const saveUser = (user) => localStorage.setItem(STORAGE_KEY, JSON.stringify(user));

// Creates a brand-new key pair and stores it on the server (old messages become unreadable)
const createNewKeys = async (password, token) => {
    const { publicKeyStr, privateKeyStr } = await generateRSAKeyPair();
    const encryptedPrivateKey = await encryptPrivateKeyWithPassword(privateKeyStr, password);
    await axiosInstance.put(
        "/auth/keys",
        { password, publicKey: publicKeyStr, encryptedPrivateKey },
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return { publicKeyStr, privateKeyStr };
};

const storedUser = readStoredUser();

export const useAuthStore = create((set, get) => ({
    authUser: storedUser,
    // Only block the UI when there is a stored session whose key must be checked
    isCheckingAuth: Boolean(storedUser),
    isSigningUp: false,
    isLoggingIn: false,

    checkAuth: async () => {
        const authUser = get().authUser;
        if (!authUser) {
            set({ isCheckingAuth: false });
            return;
        }

        try {
            const userId = authUser._id || authUser.id;

            // Migrate sessions from the old version that kept the raw private key in localStorage
            if (authUser.privateKeyStr) {
                await setSessionPrivateKey(userId, authUser.privateKeyStr);
                const migrated = toStoredUser(authUser, authUser.token);
                saveUser(migrated);
                set({ authUser: migrated });
            }

            const key = await getSessionPrivateKey(userId);
            if (!key) {
                // Site data was cleared or the browser can't store keys: ask for the password again
                localStorage.removeItem(STORAGE_KEY);
                set({ authUser: null });
                toast("Please log in again to unlock your encrypted messages.");
                return;
            }

            // Refresh the profile in the background (a 401 here logs the user out)
            axiosInstance.get("/auth/me").then((res) => {
                const current = get().authUser;
                if (!current || !res.data?.user) return;
                const refreshed = toStoredUser({ ...current, ...res.data.user }, current.token);
                saveUser(refreshed);
                set({ authUser: refreshed });
            }).catch(() => {});
        } catch (error) {
            console.error("checkAuth error:", error);
        } finally {
            set({ isCheckingAuth: false });
        }
    },

    signup: async (data) => {
        set({ isSigningUp: true });
        try {
            const { publicKeyStr, privateKeyStr } = await generateRSAKeyPair();
            const encryptedPrivateKey = await encryptPrivateKeyWithPassword(privateKeyStr, data.password);

            const signupData = { ...data, publicKey: publicKeyStr, encryptedPrivateKey };

            const res = await axiosInstance.post("/auth/signup", signupData);
            const user = res.data.user;
            const token = res.data.token || user.token;

            await setSessionPrivateKey(user._id, privateKeyStr);
            const authUserData = toStoredUser(user, token);
            saveUser(authUserData);
            set({ authUser: authUserData });

            toast.success("Account created successfully");
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || error.message || "Signup failed");
            return false;
        } finally {
            set({ isSigningUp: false });
        }
    },

    login: async (data) => {
        set({ isLoggingIn: true });
        try {
            const res = await axiosInstance.post("/auth/login", data);
            const user = { ...res.data.user };
            const token = res.data.token || user.token;

            let privateKeyStr = null;
            if (user.encryptedPrivateKey) {
                try {
                    privateKeyStr = await decryptPrivateKeyWithPassword(user.encryptedPrivateKey, data.password);
                } catch (err) {
                    console.error("Failed to decrypt private key:", err);
                }
            }

            if (privateKeyStr && needsPrivateKeyUpgrade(user.encryptedPrivateKey)) {
                // Re-encrypt the key with the stronger KDF settings (best effort)
                try {
                    const upgraded = await encryptPrivateKeyWithPassword(privateKeyStr, data.password);
                    await axiosInstance.put(
                        "/auth/keys",
                        { password: data.password, encryptedPrivateKey: upgraded },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                } catch (err) {
                    console.warn("Key upgrade skipped:", err);
                }
            }

            if (!privateKeyStr) {
                // No keys yet (very old account) or keys locked with a previous password
                const hadKeys = Boolean(user.encryptedPrivateKey);
                const confirmed = !hadKeys || window.confirm(
                    "Your encryption keys were locked with a different password (for example before a password reset), " +
                    "so messages sent to you before now can't be decrypted.\n\n" +
                    "Create new encryption keys? New messages will work normally."
                );
                if (!confirmed) {
                    toast.error("Login cancelled: encryption keys could not be unlocked.");
                    return false;
                }
                const fresh = await createNewKeys(data.password, token);
                user.publicKey = fresh.publicKeyStr;
                privateKeyStr = fresh.privateKeyStr;
                if (hadKeys) toast("New encryption keys created.");
            }

            await setSessionPrivateKey(user._id, privateKeyStr);
            const authUserData = toStoredUser(user, token);
            saveUser(authUserData);
            set({ authUser: authUserData });

            toast.success("Logged in successfully");
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || error.message || "Login failed");
            return false;
        } finally {
            set({ isLoggingIn: false });
        }
    },

    logout: async () => {
        // Clears the httpOnly cookie on the server (ignore network errors)
        await axiosInstance.post("/auth/logout").catch(() => {});
        await clearSessionKeys();
        localStorage.removeItem(STORAGE_KEY);
        set({ authUser: null });
        toast.success("Logged out successfully");
    },
}));
