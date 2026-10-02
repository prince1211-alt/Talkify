import axios from "axios";
import { clearSessionKeys } from "../utils/keyStore";

// Backend origin ("" = same origin, when the backend serves the built frontend)
export const BACKEND_URL = import.meta.env.MODE === "development"
    ? "http://localhost:5000"
    : (import.meta.env.VITE_BACKEND_URL || "").replace(/\/+$/, "");

export const axiosInstance = axios.create({
    baseURL: `${BACKEND_URL}/api`,
    withCredentials: true,
});

// Attach JWT token from localStorage to every request
axiosInstance.interceptors.request.use((config) => {
    try {
        const user = JSON.parse(localStorage.getItem("chat-user"));
        if (user?.token && !config.headers["Authorization"]) {
            config.headers["Authorization"] = `Bearer ${user.token}`;
        }
    } catch {
        // corrupted localStorage entry — send the request without a token
    }
    return config;
});

let isLoggingOut = false;

// Session is gone (expired token, password changed elsewhere): wipe local data and go to login
export const forceLogout = async () => {
    if (isLoggingOut) return;
    isLoggingOut = true;
    localStorage.removeItem("chat-user");
    await clearSessionKeys().catch(() => {});
    window.location.href = "/login";
};

// These endpoints return 401 for a wrong password etc. — that must not reload the page
const PUBLIC_AUTH_ENDPOINTS = ["/auth/login", "/auth/signup"];

// Handle 401 Unauthorized globally
axiosInstance.interceptors.response.use(
    (response) => response,
    (error) => {
        const url = error.config?.url || "";
        const isPublicAuthCall = PUBLIC_AUTH_ENDPOINTS.some((path) => url.startsWith(path));
        if (error.response?.status === 401 && !isPublicAuthCall && localStorage.getItem("chat-user")) {
            forceLogout();
        }
        return Promise.reject(error);
    }
);
