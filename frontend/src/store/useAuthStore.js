import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";

export const useAuthStore = create((set) => ({
    authUser: JSON.parse(localStorage.getItem("chat-user")) || null,
    isCheckingAuth: false,
    isSigningUp: false,
    isLoggingIn: false,

    checkAuth: async () => {
        // Since there is no explicit /auth/check endpoint in your backend,
        // we'll rely on the localStorage persistence for now.
        set({ isCheckingAuth: false });
    },

    signup: async (data) => {
        set({ isSigningUp: true });
        try {
            const res = await axiosInstance.post("/auth/signUp", data);
            const user = res.data.user;
            const token = res.data.token || user.token;
            const authUserData = { ...user, token };

            localStorage.setItem("chat-user", JSON.stringify(authUserData));
            set({ authUser: authUserData });

            toast.success("Account created successfully");
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || "Signup failed");
            return false;
        } finally {
            set({ isSigningUp: false });
        }
    },

    login: async (data) => {
        set({ isLoggingIn: true });
        try {
            const res = await axiosInstance.post("/auth/login", data);
            const user = res.data.user;
            const token = res.data.token || user.token;
            const authUserData = { ...user, token };

            localStorage.setItem("chat-user", JSON.stringify(authUserData));
            set({ authUser: authUserData });

            toast.success("Logged in successfully");
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || "Login failed");
            return false;
        } finally {
            set({ isLoggingIn: false });
        }
    },

    logout: async () => {
        try {
            // Usually we'd call /auth/logout but endpoint doesn't exist
            localStorage.removeItem("chat-user");
            set({ authUser: null });
            toast.success("Logged out successfully");
        } catch (error) {
            console.log("Logout error", error);
            toast.error("Logout failed");
        }
    },
}));
