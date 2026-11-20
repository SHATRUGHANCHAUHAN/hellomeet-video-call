import axios from "axios";
import httpStatus from "http-status";
import { createContext, useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import server, { LOCAL_BACKEND_URL, CLOUD_BACKEND_URL } from "../environment";

export const AuthContext = createContext({});

const primaryBase = server.replace(/\/+$/, "");
const fallbackBase = primaryBase.includes("localhost") || primaryBase.includes("127.0.0.1")
    ? CLOUD_BACKEND_URL
    : LOCAL_BACKEND_URL;

// Resilient API post helper: tries primary server; if unreachable due to network error, tries fallback server
const apiPost = async (endpoint, data, config = {}) => {
    try {
        const res = await axios.post(`${primaryBase}/api/v1/users${endpoint}`, data, {
            ...config,
            timeout: 30000
        });
        return res;
    } catch (err) {
        const isNetworkErr = !err.response || err.code === "ERR_NETWORK" || err.code === "ECONNREFUSED";
        if (isNetworkErr && fallbackBase && fallbackBase !== primaryBase) {
            console.warn(`Primary server (${primaryBase}) unreachable. Retrying with fallback (${fallbackBase})...`);
            try {
                const fallbackRes = await axios.post(`${fallbackBase}/api/v1/users${endpoint}`, data, {
                    ...config,
                    timeout: 45000
                });
                return fallbackRes;
            } catch (fallbackErr) {
                throw fallbackErr.response ? fallbackErr : err;
            }
        }
        throw err;
    }
};

// Resilient API get helper: tries primary server; if unreachable, tries fallback server
const apiGet = async (endpoint, config = {}) => {
    try {
        const res = await axios.get(`${primaryBase}/api/v1/users${endpoint}`, {
            ...config,
            timeout: 30000
        });
        return res;
    } catch (err) {
        const isNetworkErr = !err.response || err.code === "ERR_NETWORK" || err.code === "ECONNREFUSED";
        if (isNetworkErr && fallbackBase && fallbackBase !== primaryBase) {
            console.warn(`Primary server (${primaryBase}) unreachable. Retrying with fallback (${fallbackBase})...`);
            try {
                const fallbackRes = await axios.get(`${fallbackBase}/api/v1/users${endpoint}`, {
                    ...config,
                    timeout: 45000
                });
                return fallbackRes;
            } catch (fallbackErr) {
                throw fallbackErr.response ? fallbackErr : err;
            }
        }
        throw err;
    }
};

export const AuthProvider = ({ children }) => {
    const authContext = useContext(AuthContext);
    const [userData, setUserData] = useState(authContext || {});
    const router = useNavigate();

    const handleRegister = async (name, username, password) => {
        try {
            const request = await apiPost("/register", {
                name: (name || "").trim(),
                username: (username || "").trim(),
                password: password
            });

            if (request.status === httpStatus.CREATED || request.status === 200 || request.status === 201) {
                return request.data?.message || "User registered successfully";
            }
            return request.data?.message;
        } catch (err) {
            console.error("Register request failed:", err);
            throw err;
        }
    };

    const handleLogin = async (username, password) => {
        try {
            const request = await apiPost("/login", {
                username: (username || "").trim(),
                password: password
            });

            if (request.status === httpStatus.OK || request.status === 200) {
                const token = request.data.token;
                localStorage.setItem("token", token);
                if (request.data.user) {
                    localStorage.setItem("user", JSON.stringify(request.data.user));
                    setUserData(request.data.user);
                }
                router("/home");
                return request.data;
            }
        } catch (err) {
            console.error("Login request failed:", err);
            throw err;
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setUserData({});
        router("/auth");
    };

    const getHistoryOfUser = async () => {
        const token = localStorage.getItem("token");
        if (!token) {
            return [];
        }

        try {
            const request = await apiGet("/get_all_activity", {
                params: { token: token },
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (Array.isArray(request.data)) {
                return request.data;
            }
            return [];
        } catch (err) {
            console.error("Failed to fetch meeting history:", err);
            return [];
        }
    };

    const addToUserHistory = async (meetingCode) => {
        const token = localStorage.getItem("token");
        if (!token || !meetingCode) {
            return null;
        }

        try {
            const request = await apiPost(
                "/add_to_activity",
                {
                    token: token,
                    meeting_code: meetingCode.trim()
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );
            return request.data;
        } catch (e) {
            console.warn("Could not save meeting to history:", e.message);
            return null;
        }
    };

    const data = {
        userData,
        setUserData,
        addToUserHistory,
        getHistoryOfUser,
        handleRegister,
        handleLogin,
        handleLogout
    };

    return (
        <AuthContext.Provider value={data}>
            {children}
        </AuthContext.Provider>
    );
};
