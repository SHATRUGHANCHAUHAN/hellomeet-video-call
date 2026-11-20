// Dynamically determine backend URL candidates
// When running locally with setupProxy.js, the React dev server proxies /api and /socket.io
// directly to the backend on port 8000. This eliminates mixed-content errors and firewall blocks!

export const CLOUD_BACKEND_URL = "https://apnacollegebackend.onrender.com";

// Set IS_PROD to true to prioritize the hosted Apna College backend.
// Set IS_PROD to false to prioritize your local backend.
export const IS_PROD = false;

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
    return IS_PROD ? CLOUD_BACKEND_URL : getLocalBackendUrl();
};

/**
 * Returns a prioritized list of backend candidate URLs to connect to.
 * 1. Primary (current origin or REACT_APP_BACKEND_URL)
 * 2. Direct port 8000 (when on HTTP or localhost)
 * 3. Hosted cloud backend (if local is unavailable)
 */
export const getBackendCandidates = () => {
    const list = [];
    const primary = getPrimaryBackendUrl();
    if (primary) list.push(primary);

    if (typeof window !== "undefined" && window.location) {
        const { hostname, protocol } = window.location;
        const directLocal = `http://${hostname}:8000`;
        // Only add direct HTTP if not in an HTTPS context to avoid browser mixed-content blocks
        if (protocol === 'http:' || hostname === 'localhost' || hostname === '127.0.0.1') {
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
