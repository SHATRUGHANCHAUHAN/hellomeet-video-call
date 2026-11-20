import { Server } from "socket.io";

// Maps to track rooms and sockets efficiently
// roomName -> Map(socket.id -> { socketId, username, video, audio })
const rooms = new Map();

// socket.id -> Set of roomNames
const socketToRooms = new Map();

// roomName -> Array of recent chat messages (bounded to prevent memory leaks)
const roomMessages = new Map();
const MAX_MESSAGES_PER_ROOM = 100;

// socket.id -> connection timestamp
const timeOnline = new Map();

/**
 * Normalizes room identifier so whether a client sends a full URL or just a room slug,
 * they join the exact same room.
 */
const normalizeRoom = (path) => {
    if (!path || typeof path !== "string") return "default";
    try {
        if (path.startsWith("http://") || path.startsWith("https://")) {
            const parsed = new URL(path);
            const pathname = parsed.pathname.replace(/^\/+|\/+$/g, "");
            return pathname.toLowerCase() || "default";
        }
    } catch {
        // Not a standard URL, treat as raw path
    }
    return path.replace(/^\/+|\/+$/g, "").toLowerCase() || "default";
};

export const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"],
            credentials: true
        },
        transports: ["polling", "websocket"],
        allowUpgrades: true,
        pingTimeout: 30000,
        pingInterval: 15000
    });

    io.on("connection", (socket) => {
        timeOnline.set(socket.id, new Date());
        socketToRooms.set(socket.id, new Set());
        console.log(`[Socket.io] Client connected: ${socket.id} (transport: ${socket.conn.transport.name})`);

        socket.conn.on("upgrade", (transport) => {
            console.log(`[Socket.io] Client ${socket.id} upgraded transport to: ${transport.name}`);
        });

        socket.on("join-call", (payload) => {
            try {
                let rawPath = payload;
                let username = "Anonymous";
                let video = true;
                let audio = true;

                if (typeof payload === "object" && payload !== null) {
                    rawPath = payload.path || payload.room || payload.url;
                    username = payload.username || "Anonymous";
                    if (typeof payload.video === "boolean") video = payload.video;
                    if (typeof payload.audio === "boolean") audio = payload.audio;
                }

                const room = normalizeRoom(rawPath);

                socket.join(room);

                if (!rooms.has(room)) {
                    rooms.set(room, new Map());
                }

                const roomUsers = rooms.get(room);
                const userInfo = {
                    socketId: socket.id,
                    username: String(username).trim() || "Anonymous",
                    video: Boolean(video),
                    audio: Boolean(audio)
                };
                roomUsers.set(socket.id, userInfo);
                socketToRooms.get(socket.id)?.add(room);

                const clientsList = Array.from(roomUsers.values());

                console.log(
                    `[Socket.io] User "${userInfo.username}" (${socket.id}) JOINED room "${room}". ` +
                    `Total users in room: ${roomUsers.size} [${clientsList.map((c) => c.username).join(", ")}]`
                );

                // Notify all clients in the room (including this socket)
                io.to(room).emit("user-joined", socket.id, clientsList);

                // Send recent chat history for this room to the newly joined client
                const history = roomMessages.get(room);
                if (history && history.length > 0) {
                    history.forEach((msg) => {
                        socket.emit("chat-message", msg.data, msg.sender, msg["socket-id-sender"], msg.timestamp);
                    });
                }
            } catch (err) {
                console.error(`[Socket.io] Error in join-call for socket ${socket.id}:`, err);
            }
        });

        socket.on("signal", (toId, message) => {
            try {
                if (!toId || !message) return;
                io.to(toId).emit("signal", socket.id, message);
            } catch (err) {
                console.error(`[Socket.io] Error relaying signal from ${socket.id} to ${toId}:`, err);
            }
        });

        socket.on("user-toggle-audio", (isAudio) => {
            try {
                const userRooms = socketToRooms.get(socket.id);
                if (!userRooms) return;
                userRooms.forEach((room) => {
                    const roomUsers = rooms.get(room);
                    if (roomUsers && roomUsers.has(socket.id)) {
                        const user = roomUsers.get(socket.id);
                        user.audio = Boolean(isAudio);
                        io.to(room).emit("user-status-changed", {
                            socketId: socket.id,
                            audio: user.audio,
                            video: user.video
                        });
                    }
                });
            } catch (err) {
                console.error(`[Socket.io] Error in user-toggle-audio from ${socket.id}:`, err);
            }
        });

        socket.on("user-toggle-video", (isVideo) => {
            try {
                const userRooms = socketToRooms.get(socket.id);
                if (!userRooms) return;
                userRooms.forEach((room) => {
                    const roomUsers = rooms.get(room);
                    if (roomUsers && roomUsers.has(socket.id)) {
                        const user = roomUsers.get(socket.id);
                        user.video = Boolean(isVideo);
                        io.to(room).emit("user-status-changed", {
                            socketId: socket.id,
                            audio: user.audio,
                            video: user.video
                        });
                    }
                });
            } catch (err) {
                console.error(`[Socket.io] Error in user-toggle-video from ${socket.id}:`, err);
            }
        });

        socket.on("chat-message", (data, sender) => {
            try {
                if (data === undefined || data === null) return;

                const userRooms = socketToRooms.get(socket.id);
                if (!userRooms || userRooms.size === 0) return;

                const timestamp = new Date().toISOString();

                // Broadcast to the rooms the user is in
                userRooms.forEach((room) => {
                    if (!roomMessages.has(room)) {
                        roomMessages.set(room, []);
                    }

                    const messagesList = roomMessages.get(room);
                    const newMsg = {
                        sender: sender || "Anonymous",
                        data: data,
                        "socket-id-sender": socket.id,
                        timestamp: timestamp
                    };

                    messagesList.push(newMsg);

                    // Bound message history to avoid unbounded memory leak
                    if (messagesList.length > MAX_MESSAGES_PER_ROOM) {
                        messagesList.shift();
                    }

                    io.to(room).emit("chat-message", data, sender || "Anonymous", socket.id, timestamp);
                });
            } catch (err) {
                console.error(`[Socket.io] Error handling chat-message from ${socket.id}:`, err);
            }
        });

        socket.on("disconnect", (reason) => {
            try {
                console.log(`[Socket.io] Client disconnected: ${socket.id} (reason: ${reason})`);
                const userRooms = socketToRooms.get(socket.id);

                if (userRooms) {
                    userRooms.forEach((room) => {
                        const roomUsers = rooms.get(room);
                        if (roomUsers) {
                            const departingUser = roomUsers.get(socket.id);
                            roomUsers.delete(socket.id);

                            console.log(
                                `[Socket.io] User "${departingUser?.username || socket.id}" LEFT room "${room}". ` +
                                `Remaining in room: ${roomUsers.size}`
                            );

                            // Notify remaining clients in the room
                            socket.to(room).emit("user-left", socket.id);

                            // Clean up room if no users remain
                            if (roomUsers.size === 0) {
                                rooms.delete(room);
                                roomMessages.delete(room);
                            }
                        }
                    });
                }

                socketToRooms.delete(socket.id);
                timeOnline.delete(socket.id);
            } catch (err) {
                console.error(`[Socket.io] Error during disconnect of socket ${socket.id}:`, err);
            }
        });

        socket.on("error", (err) => {
            console.error(`[Socket.io] Error on socket ${socket.id}:`, err);
        });
    });

    return io;
};
