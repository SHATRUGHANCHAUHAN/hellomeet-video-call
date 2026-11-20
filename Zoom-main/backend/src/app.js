import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import cors from "cors";

import { connectToSocket } from "./controllers/socketManager.js";
import userRoutes from "./routes/users.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendBuildPath = path.resolve(__dirname, "../../frontend/build");

// Load environment variables if .env file exists (Node 20.6+)
try {
    if (typeof process.loadEnvFile === "function") {
        process.loadEnvFile();
    }
} catch {
    // .env file is optional; continue with defaults or environment variables
}

const app = express();
const server = createServer(app);

// Initialize Socket.io
connectToSocket(server);

app.set("port", Number(process.env.PORT || 8000));
const HOST = process.env.HOST || "0.0.0.0";

// Configure CORS
const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map(origin => origin.trim())
    : "*";

app.use(cors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
    const dbState = mongoose.connection.readyState;
    const dbStatus = ["disconnected", "connected", "connecting", "disconnecting"][dbState] || "unknown";
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: dbStatus,
        uptime: process.uptime()
    });
});

// API Routes
app.use("/api/v1/users", userRoutes);

// Serve static frontend build if it exists (allows running backend standalone on port 8000)
if (fs.existsSync(frontendBuildPath)) {
    console.log(`[Express] Serving static frontend build from: ${frontendBuildPath}`);
    app.use(express.static(frontendBuildPath));
    app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api") || req.path.startsWith("/socket.io") || req.path === "/health") {
            return next();
        }
        res.sendFile(path.join(frontendBuildPath, "index.html"));
    });
} else {
    // 404 handler for undefined API routes when build folder is absent
    app.use((req, res) => {
        res.status(404).json({ message: "Route not found" });
    });
}

// Centralized error handling middleware
app.use((err, req, res, next) => {
    console.error("Unhandled server error:", err);
    res.status(err.status || 500).json({
        message: err.message || "Internal server error"
    });
});

const start = async () => {
    const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/zoom";

    try {
        const connectionDb = await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000
        });
        console.log(`MONGO Connected DB Host: ${connectionDb.connection.host}`);
    } catch (error) {
        console.warn(`MongoDB initial connection warning: ${error.message}`);
        console.warn("Application will continue running; ensure MongoDB is running for authentication/history features.");
    }

    mongoose.connection.on("error", (err) => {
        console.error("MongoDB runtime connection error:", err.message);
    });

    mongoose.connection.on("disconnected", () => {
        console.warn("MongoDB disconnected. Attempting reconnection...");
    });

    mongoose.connection.on("reconnected", () => {
        console.log("MongoDB reconnected successfully.");
    });

    const port = app.get("port");
    server.listen(port, HOST, () => {
        console.log(`=======================================================`);
        console.log(`🚀 Zoom Backend Server running on http://${HOST}:${port}`);
        console.log(`📡 Local check:   http://localhost:${port}/health`);
        console.log(`=======================================================`);
    });

    // Graceful shutdown
    const handleShutdown = async (signal) => {
        console.log(`\nReceived ${signal}. Shutting down gracefully...`);
        server.close(async () => {
            console.log("HTTP server closed.");
            try {
                await mongoose.connection.close(false);
                console.log("MongoDB connection closed.");
            } catch (err) {
                console.error("Error closing MongoDB connection:", err);
            }
            process.exit(0);
        });

        // Force shutdown after timeout if graceful close hangs
        setTimeout(() => {
            console.error("Forceful shutdown after timeout.");
            process.exit(1);
        }, 10000).unref();
    };

    process.on("SIGINT", () => handleShutdown("SIGINT"));
    process.on("SIGTERM", () => handleShutdown("SIGTERM"));
};

start();
