import axios from "axios";

export const axiosInstance = axios.create({
    baseURL: import.meta.env.MODE === "development"
        ? "http://localhost:5000/api"
        : import.meta.env.VITE_BACKEND_URL ? `${import.meta.env.VITE_BACKEND_URL}/api` : "/api",
    withCredentials: true,
});

// Attach JWT token from localStorage to every request
axiosInstance.interceptors.request.use((config) => {
    try {
        const user = JSON.parse(localStorage.getItem("chat-user"));
        if (user?.token) {
            config.headers["Authorization"] = `Bearer ${user.token}`;
        }
    } catch (_) { }
    return config;
});
