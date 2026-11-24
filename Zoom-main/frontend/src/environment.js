// Dynamically determine backend URL candidates
// When running locally with setupProxy.js, the React dev server proxies /api and /socket.io
// directly to the backend on port 8000. This eliminates mixed-content errors and firewall blocks!

export const CLOUD_BACKEND_URL = "https://apnacollegebackend.onrender.com";

// Check if running in a hosted cloud environment (such as Vercel, Netlify, or custom domain)
export const isHostedProduction = () => {
    if (typeof window === "undefined" || !window.location?.hostname) return false;
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return false;
    // Private LAN IPs (e.g. 192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    if (host.startsWith("192.168.") || host.startsWith("10.")) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return false;
    return true; // e.g. vercel.app, custom domain
};

export const getLocalBackendUrl = () => {
    if (typeof window !== "undefined" && window.location?.origin) {
        return window.location.origin;
    }
    return "http://localhost:8000";
};

export const LOCAL_BACKEND_URL = getLocalBackendUrl();

export const getPrimaryBackendUrl = () => {
    if (process.env.REACT_APP_BACKEND_URL) {
        return process.env.REACT_APP_BACKEND_URL.replace(/\/+$/, "");
    }
    // If running on Vercel or public cloud domain, default to the cloud backend
    if (isHostedProduction()) {
        return CLOUD_BACKEND_URL;
    }
    return getLocalBackendUrl();
};

/**
 * Returns a prioritized list of backend candidate URLs to connect to.
 * 1. Primary (REACT_APP_BACKEND_URL or CLOUD_BACKEND_URL if hosted, or local origin)
 * 2. Direct port 8000 (when on HTTP or localhost)
 * 3. Hosted cloud backend
 */
export const getBackendCandidates = () => {
    const list = [];
    const primary = getPrimaryBackendUrl();
    if (primary) list.push(primary);

    if (typeof window !== "undefined" && window.location) {
        const { hostname, protocol } = window.location;
        const directLocal = `http://${hostname}:8000`;
        // Only add direct HTTP if not in an HTTPS context to avoid browser mixed-content blocks
        if (protocol === "http:" || hostname === "localhost" || hostname === "127.0.0.1") {
            if (!list.includes(directLocal)) {
                list.push(directLocal);
            }
        }
    }

    if (!list.includes(CLOUD_BACKEND_URL)) {
        list.push(CLOUD_BACKEND_URL);
    }

    return list;
};

const server = getPrimaryBackendUrl();

export default server;
