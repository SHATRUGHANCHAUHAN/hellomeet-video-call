const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    const target = process.env.BACKEND_PROXY_TARGET || 'http://127.0.0.1:8000';

    const apiProxy = createProxyMiddleware({
        target,
        changeOrigin: true,
        onError: (err, req, res) => {
            console.error('[Proxy Error /api]:', err.message);
            if (res && res.writeHead && !res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Backend server unavailable on ' + target }));
            }
        }
    });

    const socketProxy = createProxyMiddleware({
        target,
        changeOrigin: true,
        ws: true,
        onError: (err, req, res) => {
            console.error('[Proxy Error /socket.io]:', err.message);
        }
    });

    // Hook the underlying HTTP/HTTPS server's upgrade event so that WebSocket connections
    // to /socket.io are properly upgraded through Webpack Dev Server on CRA
    app.use((req, res, next) => {
        if (!app._wsUpgradeHooked && req.socket && req.socket.server) {
            app._wsUpgradeHooked = true;
            req.socket.server.on('upgrade', (upgradeReq, socket, head) => {
                if (upgradeReq.url && upgradeReq.url.startsWith('/socket.io')) {
                    socketProxy.upgrade(upgradeReq, socket, head);
                }
            });
        }
        next();
    });

    app.use('/api', apiProxy);
    app.use('/socket.io', socketProxy);
};
