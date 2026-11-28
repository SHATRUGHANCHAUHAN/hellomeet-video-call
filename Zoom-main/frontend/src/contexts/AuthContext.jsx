import axios from "axios";
import httpStatus from "http-status";
import { createContext, useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBackendCandidates, CLOUD_BACKEND_URL } from "../environment";

export const AuthContext = createContext({});

// Track the last successfully contacted backend host
let activeBackendBase = null;

const getCandidateList = () => {
    const rawList = getBackendCandidates() || [];
    const candidates = rawList
        .filter(Boolean)
        .map((url) => String(url).replace(/\/+$/, ""));

    // If we already know a working backend, place it first
    if (activeBackendBase && candidates.includes(activeBackendBase)) {
        return [activeBackendBase, ...candidates.filter((c) => c !== activeBackendBase)];
    }

    if (!candidates.includes(CLOUD_BACKEND_URL)) {
        candidates.push(CLOUD_BACKEND_URL);
    }

    return candidates;
};

// Returns true if response body is HTML (e.g. from Vercel SPA rewrite or proxy error page)
const isHtmlResponse = (data) => {
    if (typeof data === "string") {
        const trimmed = data.trim().toLowerCase();
        return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html") || trimmed.startsWith("<head");
    }
    return false;
};

// Resilient API POST helper with multi-candidate failover
const apiPost = async (endpoint, data, config = {}) => {
    const candidates = getCandidateList();
    let lastError = null;

    for (let i = 0; i < candidates.length; i++) {
        const base = candidates[i];
        const isCloud = base.includes("onrender.com");
        const timeout = isCloud ? 60000 : 25000;

        try {
            console.log(`[Auth API] POST -> ${base}/api/v1/users${endpoint}`);
            const res = await axios.post(`${base}/api/v1/users${endpoint}`, data, {
                ...config,
                timeout,
                validateStatus: (status) => status < 500 // Don't throw on 302, 400, 401, 404, 409
            });

            // If response is HTML, this host is serving a static frontend or error page, not the API
            if (isHtmlResponse(res.data) || res.status === 502 || res.status === 503 || res.status === 504) {
                console.warn(`[Auth API] Candidate ${base} returned invalid response (status ${res.status}). Trying next candidate...`);
                continue;
            }

            // Legitimate client-side validation error from the API (e.g. Wrong password, User already exists)
            if (res.status >= 400) {
                activeBackendBase = base;
                const errMsg = res.data?.message || `Request failed with status ${res.status}`;
                const clientErr = new Error(errMsg);
                clientErr.response = res;
                throw clientErr;
            }

            // Success! Remember this working backend for subsequent requests
            activeBackendBase = base;
            return res;
        } catch (err) {
            // If it's a 4xx error from the auth controller, do not retry other servers—it is an intentional response
            if (err.response && err.response.status >= 400 && err.response.status < 500 && !isHtmlResponse(err.response.data)) {
                throw err;
            }

            lastError = err;
            console.warn(`[Auth API] Error reaching ${base}: ${err.message}. Trying next candidate...`);
        }
    }

    throw lastError || new Error("Cannot reach authentication server. Please check your internet connection.");
};

// Resilient API GET helper with multi-candidate failover
const apiGet = async (endpoint, config = {}) => {
    const candidates = getCandidateList();
    let lastError = null;

    for (let i = 0; i < candidates.length; i++) {
        const base = candidates[i];
        const isCloud = base.includes("onrender.com");
        const timeout = isCloud ? 60000 : 25000;

        try {
            const res = await axios.get(`${base}/api/v1/users${endpoint}`, {
                ...config,
                timeout,
                validateStatus: (status) => status < 500
            });

            if (isHtmlResponse(res.data) || res.status === 502 || res.status === 503 || res.status === 504) {
                continue;
            }

            if (res.status >= 400) {
                activeBackendBase = base;
                const errMsg = res.data?.message || `Request failed with status ${res.status}`;
                const clientErr = new Error(errMsg);
                clientErr.response = res;
                throw clientErr;
            }

            activeBackendBase = base;
            return res;
        } catch (err) {
            if (err.response && err.response.status >= 400 && err.response.status < 500 && !isHtmlResponse(err.response.data)) {
                throw err;
            }
            lastError = err;
        }
    }

    throw lastError || new Error("Cannot reach authentication server.");
};

export const AuthProvider = ({ children }) => {
    const authContext = useContext(AuthContext);
    const [userData, setUserData] = useState(() => {
        try {
            const saved = localStorage.getItem("user");
            if (saved) return JSON.parse(saved);
        } catch {}
        return authContext || {};
    });
    const router = useNavigate();

    const handleRegister = async (name, username, password) => {
        const cleanName = String(name || "").trim();
        const cleanUsername = String(username || "").trim();

        try {
            const request = await apiPost("/register", {
                name: cleanName,
                username: cleanUsername,
                password: password
            });

            // Handle legacy backend status 302 or explicit "already exists" payload
            if (
                request.status === 302 ||
                (request.data?.message && request.data.message.toLowerCase().includes("already exists"))
            ) {
                const err = new Error(request.data?.message || "User already exists with this username");
                err.response = { data: { message: request.data?.message || "User already exists with this username" } };
                throw err;
            }

            if (request.status === httpStatus.CREATED || request.status === 200 || request.status === 201) {
                return request.data?.message || "User registered successfully";
            }

            const err = new Error(request.data?.message || "Registration failed");
            err.response = request;
            throw err;
        } catch (err) {
            console.error("Register request failed:", err);
            throw err;
        }
    };

    const handleLogin = async (username, password) => {
        const cleanUsername = String(username || "").trim();

        try {
            const request = await apiPost("/login", {
                username: cleanUsername,
                password: password
            });

            if (request.status === httpStatus.OK || request.status === 200) {
                const token = request.data?.token;
                if (!token || typeof token !== "string" || isHtmlResponse(token)) {
                    throw new Error("Invalid response received from authentication server.");
                }

                localStorage.setItem("token", token);

                // Preserve or construct user profile
                const userObj = request.data.user || {
                    name: cleanUsername,
                    username: cleanUsername
                };
                localStorage.setItem("user", JSON.stringify(userObj));
                setUserData(userObj);

                router("/home");
                return request.data;
            }

            throw new Error(request.data?.message || "Login failed");
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
