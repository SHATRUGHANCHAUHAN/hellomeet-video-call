import httpStatus from "http-status";
import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { Meeting } from "../models/meeting.model.js";

// In-memory fallback database if MongoDB is not running locally
const memUsers = new Map(); // username (lowercase) -> { name, username, password, token }
const memMeetings = []; // [{ _id, user_id, meetingCode, date }]

const isDbConnected = () => {
    return mongoose.connection.readyState === 1;
};

const login = async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
        return res.status(httpStatus.BAD_REQUEST).json({
            message: "Username and password are required"
        });
    }

    const trimmedUsername = username.trim().toLowerCase();

    try {
        if (isDbConnected()) {
            // Case-insensitive username lookup in MongoDB
            const user = await User.findOne({
                username: { $regex: new RegExp(`^${trimmedUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
            });

            if (!user) {
                return res.status(httpStatus.UNAUTHORIZED).json({
                    message: "Invalid username or password"
                });
            }

            const isPasswordCorrect = await bcrypt.compare(password, user.password);

            if (!isPasswordCorrect) {
                return res.status(httpStatus.UNAUTHORIZED).json({
                    message: "Invalid username or password"
                });
            }

            const token = crypto.randomBytes(32).toString("hex");
            user.token = token;
            await user.save();

            return res.status(httpStatus.OK).json({
                message: "Login successful",
                token: token,
                user: {
                    name: user.name,
                    username: user.username
                }
            });
        } else {
            // In-Memory Fallback
            console.log(`[In-Memory DB] Logging in user: ${trimmedUsername}`);
            const user = memUsers.get(trimmedUsername);
            if (!user) {
                return res.status(httpStatus.UNAUTHORIZED).json({
                    message: "Invalid username or password"
                });
            }

            const isPasswordCorrect = await bcrypt.compare(password, user.password);
            if (!isPasswordCorrect) {
                return res.status(httpStatus.UNAUTHORIZED).json({
                    message: "Invalid username or password"
                });
            }

            const token = crypto.randomBytes(32).toString("hex");
            user.token = token;

            return res.status(httpStatus.OK).json({
                message: "Login successful",
                token: token,
                user: {
                    name: user.name,
                    username: user.username
                }
            });
        }
    } catch (e) {
        console.error("Login error:", e);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            message: "An unexpected error occurred during login"
        });
    }
};

const register = async (req, res) => {
    const { name, username, password } = req.body || {};

    if (!name || !username || !password) {
        return res.status(httpStatus.BAD_REQUEST).json({
            message: "Name, username, and password are required"
        });
    }

    const trimmedName = String(name).trim();
    const trimmedUsername = String(username).trim().toLowerCase();

    if (trimmedUsername.length < 3) {
        return res.status(httpStatus.BAD_REQUEST).json({
            message: "Username must be at least 3 characters long"
        });
    }

    if (String(password).length < 4) {
        return res.status(httpStatus.BAD_REQUEST).json({
            message: "Password must be at least 4 characters long"
        });
    }

    try {
        if (isDbConnected()) {
            const existingUser = await User.findOne({
                username: { $regex: new RegExp(`^${trimmedUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
            });

            if (existingUser) {
                return res.status(httpStatus.CONFLICT).json({
                    message: "User already exists with this username"
                });
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            const newUser = new User({
                name: trimmedName,
                username: trimmedUsername,
                password: hashedPassword
            });

            await newUser.save();

            return res.status(httpStatus.CREATED).json({
                message: "User registered successfully"
            });
        } else {
            // In-Memory Fallback
            console.log(`[In-Memory DB] Registering user: ${trimmedUsername}`);
            if (memUsers.has(trimmedUsername)) {
                return res.status(httpStatus.CONFLICT).json({
                    message: "User already exists with this username"
                });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            memUsers.set(trimmedUsername, {
                name: trimmedName,
                username: trimmedUsername,
                password: hashedPassword,
                token: null
            });

            return res.status(httpStatus.CREATED).json({
                message: "User registered successfully"
            });
        }
    } catch (e) {
        console.error("Register error:", e);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            message: "An unexpected error occurred during registration"
        });
    }
};

const getUserHistory = async (req, res) => {
    const token = req.query?.token || req.headers?.authorization?.replace(/^Bearer\s+/i, "");

    if (!token || typeof token !== "string" || !token.trim()) {
        return res.status(httpStatus.UNAUTHORIZED).json({
            message: "Authentication token is required"
        });
    }

    const cleanToken = token.trim();

    try {
        if (isDbConnected()) {
            const user = await User.findOne({ token: cleanToken });
            if (!user) {
                return res.status(httpStatus.UNAUTHORIZED).json({
                    message: "Invalid or expired session. Please login again."
                });
            }

            const meetings = await Meeting.find({ user_id: user.username })
                .sort({ date: -1 })
                .lean();

            return res.status(httpStatus.OK).json(meetings);
        } else {
            // In-Memory Fallback
            let foundUser = null;
            for (const u of memUsers.values()) {
                if (u.token === cleanToken) {
                    foundUser = u;
                    break;
                }
            }

            if (!foundUser) {
                return res.status(httpStatus.UNAUTHORIZED).json({
                    message: "Invalid or expired session. Please login again."
                });
            }

            const userMeetings = memMeetings
                .filter(m => m.user_id === foundUser.username)
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            return res.status(httpStatus.OK).json(userMeetings);
        }
    } catch (e) {
        console.error("Get history error:", e);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            message: "Failed to retrieve meeting history"
        });
    }
};

const addToHistory = async (req, res) => {
    const token = req.body?.token || req.headers?.authorization?.replace(/^Bearer\s+/i, "");
    const { meeting_code } = req.body || {};

    if (!token || typeof token !== "string" || !token.trim()) {
        return res.status(httpStatus.UNAUTHORIZED).json({
            message: "Authentication token is required"
        });
    }

    if (!meeting_code || typeof meeting_code !== "string" || !meeting_code.trim()) {
        return res.status(httpStatus.BAD_REQUEST).json({
            message: "Meeting code is required"
        });
    }

    const cleanToken = token.trim();

    try {
        if (isDbConnected()) {
            const user = await User.findOne({ token: cleanToken });
            if (!user) {
                return res.status(httpStatus.UNAUTHORIZED).json({
                    message: "Invalid or expired session"
                });
            }

            const newMeeting = new Meeting({
                user_id: user.username,
                meetingCode: meeting_code.trim()
            });

            await newMeeting.save();

            return res.status(httpStatus.CREATED).json({
                message: "Added code to history",
                meeting: newMeeting
            });
        } else {
            // In-Memory Fallback
            let foundUser = null;
            for (const u of memUsers.values()) {
                if (u.token === cleanToken) {
                    foundUser = u;
                    break;
                }
            }

            if (!foundUser) {
                return res.status(httpStatus.UNAUTHORIZED).json({
                    message: "Invalid or expired session"
                });
            }

            const newMeeting = {
                _id: crypto.randomBytes(12).toString("hex"),
                user_id: foundUser.username,
                meetingCode: meeting_code.trim(),
                date: new Date()
            };

            memMeetings.push(newMeeting);

            return res.status(httpStatus.CREATED).json({
                message: "Added code to history",
                meeting: newMeeting
            });
        }
    } catch (e) {
        console.error("Add to history error:", e);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            message: "Failed to save meeting to history"
        });
    }
};

export { login, register, getUserHistory, addToHistory };