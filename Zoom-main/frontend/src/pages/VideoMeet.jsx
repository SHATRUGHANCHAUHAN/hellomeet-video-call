import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import {
    Badge,
    IconButton,
    TextField,
    Button,
    Card,
    Typography,
    Alert,
    Tooltip,
    CircularProgress
} from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import ChatIcon from '@mui/icons-material/Chat';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import CameraswitchIcon from '@mui/icons-material/Cameraswitch';
import PeopleIcon from '@mui/icons-material/People';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import styles from '../styles/videoComponent.module.css';
import server, { getBackendCandidates } from '../environment';

const peerConfigConnections = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ]
};

// Sub-component for individual participant video tile
function RemoteParticipantTile({ peer }) {
    const videoRef = useRef(null);
    const [autoplayBlocked, setAutoplayBlocked] = useState(false);

    useEffect(() => {
        if (videoRef.current && peer.stream) {
            videoRef.current.srcObject = peer.stream;
            videoRef.current.playsInline = true;
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => setAutoplayBlocked(false))
                    .catch((err) => {
                        console.warn(`Autoplay prevented for peer ${peer.socketId}:`, err);
                        setAutoplayBlocked(true);
                    });
            }
        }
    }, [peer.stream, peer.socketId]);

    const handlePlayClick = () => {
        if (videoRef.current) {
            videoRef.current
                .play()
                .then(() => setAutoplayBlocked(false))
                .catch(console.error);
        }
    };

    const hasLiveVideo = Boolean(
        peer.video &&
        peer.stream &&
        peer.stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live')
    );

    const displayName = peer.username || 'Participant';
    const initials = displayName.substring(0, 2).toUpperCase();

    return (
        <div className={styles.conferenceTile}>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{ display: hasLiveVideo ? 'block' : 'none' }}
            />

            {!hasLiveVideo && (
                <div className={styles.avatarPlaceholder}>
                    <div className={styles.avatarCircle}>{initials}</div>
                    <div className={styles.avatarText}>Camera is off</div>
                </div>
            )}

            {autoplayBlocked && (
                <div
                    style={{
                        position: 'absolute',
                        zIndex: 15,
                        background: 'rgba(0,0,0,0.7)',
                        borderRadius: '8px',
                        padding: '8px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer'
                    }}
                    onClick={handlePlayClick}
                >
                    <PlayArrowIcon sx={{ color: '#22c55e' }} />
                    <span style={{ color: 'white', fontSize: '0.85rem' }}>Tap to Play Video</span>
                </div>
            )}

            <div className={styles.tileOverlay}>
                <div className={styles.tileNameBadge} title={displayName}>
                    {displayName}
                </div>
                <div className={styles.tileMicStatus}>
                    {peer.audio ? (
                        <MicIcon fontSize="inherit" />
                    ) : (
                        <MicOffIcon fontSize="inherit" sx={{ color: '#ef4444' }} />
                    )}
                </div>
            </div>
        </div>
    );
}

export default function VideoMeetComponent() {
    const { url: routeRoom } = useParams();
    const navigate = useNavigate();

    const normalizedRoom = (routeRoom || 'lobby').trim().toLowerCase();

    const socketRef = useRef(null);
    const socketIdRef = useRef(null);
    const localVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const screenStreamRef = useRef(null);
    const connectionsRef = useRef({});
    const remoteStreamsRef = useRef({});
    const iceCandidatesQueue = useRef({});
    const chatEndRef = useRef(null);
    const candidateIndexRef = useRef(0);
    const isConnectingRef = useRef(false);

    const [videoAvailable, setVideoAvailable] = useState(false);
    const [audioAvailable, setAudioAvailable] = useState(false);
    const [video, setVideo] = useState(true);
    const [audio, setAudio] = useState(true);
    const [screen, setScreen] = useState(false);
    const [screenAvailable, setScreenAvailable] = useState(false);

    const [showModal, setModal] = useState(false);
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState('');
    const [newMessages, setNewMessages] = useState(0);

    const [askForUsername, setAskForUsername] = useState(true);
    const [facingMode, setFacingMode] = useState('user');
    const [canSwitchCamera, setCanSwitchCamera] = useState(false);
    const [copied, setCopied] = useState(false);

    // Connection states: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'
    const [connStatus, setConnStatus] = useState('idle');
    const [connError, setConnError] = useState('');
    const [activeBackendUrl, setActiveBackendUrl] = useState('');

    const [username, setUsername] = useState(() => {
        try {
            const saved = localStorage.getItem('user');
            if (saved) {
                const parsed = JSON.parse(saved);
                return parsed.name || parsed.username || '';
            }
        } catch {}
        return '';
    });
    const [permissionError, setPermissionError] = useState('');

    // Map of socketId -> { socketId, username, video, audio, stream }
    const [participants, setParticipants] = useState({});

    // Initialize media preview in lobby (runs ONCE on mount)
    useEffect(() => {
        let isMounted = true;

        const isMobile =
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            window.innerWidth <= 768;
        if (isMobile) {
            setCanSwitchCamera(true);
        }

        if (navigator.mediaDevices?.getDisplayMedia && !isMobile) {
            setScreenAvailable(true);
        }

        if (
            typeof window !== 'undefined' &&
            !window.isSecureContext &&
            window.location.hostname !== 'localhost' &&
            window.location.hostname !== '127.0.0.1'
        ) {
            setPermissionError(
                'Mobile browsers require HTTPS or localhost to enable Camera and Microphone.'
            );
        }

        if (navigator.mediaDevices?.enumerateDevices) {
            navigator.mediaDevices
                .enumerateDevices()
                .then((devices) => {
                    const videoInputs = devices.filter((d) => d.kind === 'videoinput');
                    if (videoInputs.length > 1) {
                        setCanSwitchCamera(true);
                    }
                })
                .catch(() => {});
        }

        const initMedia = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user' },
                    audio: true
                });

                if (!isMounted) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }

                localStreamRef.current = stream;
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                }
                setVideoAvailable(true);
                setAudioAvailable(true);
                setVideo(true);
                setAudio(true);
            } catch (err) {
                console.warn('Could not acquire both video and audio; attempting individual devices:', err);

                // Try video only
                try {
                    const videoOnly = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'user' },
                        audio: false
                    });
                    if (!isMounted) {
                        videoOnly.getTracks().forEach((t) => t.stop());
                        return;
                    }
                    localStreamRef.current = videoOnly;
                    if (localVideoRef.current) {
                        localVideoRef.current.srcObject = videoOnly;
                    }
                    setVideoAvailable(true);
                    setAudioAvailable(false);
                    setVideo(true);
                    setAudio(false);
                } catch (videoErr) {
                    // Try audio only
                    try {
                        const audioOnly = await navigator.mediaDevices.getUserMedia({
                            video: false,
                            audio: true
                        });
                        if (!isMounted) {
                            audioOnly.getTracks().forEach((t) => t.stop());
                            return;
                        }
                        localStreamRef.current = audioOnly;
                        setVideoAvailable(false);
                        setAudioAvailable(true);
                        setVideo(false);
                        setAudio(true);
                    } catch (audioErr) {
                        if (isMounted) {
                            setVideoAvailable(false);
                            setAudioAvailable(false);
                            setVideo(false);
                            setAudio(false);
                            setPermissionError(
                                'Camera and microphone access could not be acquired. You can still join as a viewer/listener.'
                            );
                        }
                    }
                }
            }
        };

        if (navigator.mediaDevices?.getUserMedia) {
            initMedia();
        } else if (!window.isSecureContext && window.location.hostname !== 'localhost') {
            setPermissionError('Mobile browsers require HTTPS or localhost to enable Camera and Microphone.');
        } else {
            setPermissionError('Media devices are not supported on this browser or connection.');
        }

        return () => {
            isMounted = false;
        };
    }, []);

    // Scroll chat on new messages
    useEffect(() => {
        if (showModal && chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, showModal]);

    // Create or retrieve existing RTCPeerConnection for a socketId
    const getOrCreatePeerConnection = useCallback((peerSocketId) => {
        if (connectionsRef.current[peerSocketId]) {
            return connectionsRef.current[peerSocketId];
        }

        const pc = new RTCPeerConnection(peerConfigConnections);

        // Ensure remote stream container exists for this peer
        if (!remoteStreamsRef.current[peerSocketId]) {
            remoteStreamsRef.current[peerSocketId] = new MediaStream();
        }

        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current) {
                socketRef.current.emit(
                    'signal',
                    peerSocketId,
                    JSON.stringify({ ice: event.candidate })
                );
            }
        };

        pc.ontrack = (event) => {
            let stream = remoteStreamsRef.current[peerSocketId];
            if (!stream) {
                stream = new MediaStream();
                remoteStreamsRef.current[peerSocketId] = stream;
            }

            const existingTrack = stream.getTracks().find((t) => t.kind === event.track.kind);
            if (existingTrack) {
                stream.removeTrack(existingTrack);
            }
            stream.addTrack(event.track);

            setParticipants((prev) => {
                const current = prev[peerSocketId] || {
                    socketId: peerSocketId,
                    username: 'Participant',
                    video: true,
                    audio: true
                };
                return {
                    ...prev,
                    [peerSocketId]: {
                        ...current,
                        stream: new MediaStream(stream.getTracks())
                    }
                };
            });
        };

        // Add local tracks to peer connection
        const activeStream = screenStreamRef.current || localStreamRef.current;
        if (activeStream) {
            activeStream.getTracks().forEach((track) => {
                try {
                    pc.addTrack(track, activeStream);
                } catch (e) {
                    console.warn(`Could not add track ${track.kind}:`, e);
                }
            });
        }

        pc.onconnectionstatechange = () => {
            console.log(`[WebRTC] Peer ${peerSocketId} connectionState: ${pc.connectionState}`);
        };

        connectionsRef.current[peerSocketId] = pc;
        return pc;
    }, []);

    // Incoming WebRTC signal handler
    const gotMessageFromServer = useCallback(
        async (fromId, messagePayload) => {
            if (fromId === socketIdRef.current) return;

            let signal;
            try {
                signal = typeof messagePayload === 'string' ? JSON.parse(messagePayload) : messagePayload;
            } catch (err) {
                console.error('Invalid signal message received:', err);
                return;
            }

            const pc = getOrCreatePeerConnection(fromId);

            if (signal.sdp) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

                    // Flush queued ICE candidates for this peer
                    if (iceCandidatesQueue.current[fromId]?.length) {
                        for (const candidate of iceCandidatesQueue.current[fromId]) {
                            try {
                                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                            } catch (e) {
                                console.warn('Queued ICE candidate error:', e);
                            }
                        }
                        iceCandidatesQueue.current[fromId] = [];
                    }

                    if (signal.sdp.type === 'offer') {
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        socketRef.current?.emit(
                            'signal',
                            fromId,
                            JSON.stringify({ sdp: pc.localDescription })
                        );
                    }
                } catch (err) {
                    console.error('Error handling remote SDP signal:', err);
                }
            }

            if (signal.ice) {
                try {
                    if (pc.remoteDescription && pc.remoteDescription.type) {
                        await pc.addIceCandidate(new RTCIceCandidate(signal.ice));
                    } else {
                        if (!iceCandidatesQueue.current[fromId]) {
                            iceCandidatesQueue.current[fromId] = [];
                        }
                        iceCandidatesQueue.current[fromId].push(signal.ice);
                    }
                } catch (err) {
                    console.error('Error adding ICE candidate:', err);
                }
            }
        },
        [getOrCreatePeerConnection]
    );

    const addMessage = useCallback((data, sender, socketIdSender) => {
        setMessages((prevMessages) => [
            ...prevMessages,
            { sender: sender || 'Anonymous', data: data, id: Date.now() + Math.random() }
        ]);

        if (socketIdSender !== socketIdRef.current) {
            setNewMessages((prev) => prev + 1);
        }
    }, []);

    // Connect to Socket.IO and join the room with automatic multi-candidate fallback
    const connectToSocketServer = useCallback((targetUrlOverride = null) => {
        const candidates = getBackendCandidates();
        const targetUrl = targetUrlOverride || candidates[candidateIndexRef.current] || server;

        if (socketRef.current) {
            try {
                socketRef.current.disconnect();
            } catch {}
            socketRef.current = null;
        }

        setConnStatus('connecting');
        setConnError('');
        isConnectingRef.current = true;

        console.log(`[Socket.io] Connecting to signaling server at: ${targetUrl}`);

        const socket = io(targetUrl, {
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: 8,
            reconnectionDelay: 1000,
            timeout: 12000
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log(`[Socket.io] Successfully connected to: ${targetUrl} (socketId: ${socket.id})`);
            socketIdRef.current = socket.id;
            setActiveBackendUrl(targetUrl);
            setConnStatus('connected');
            setConnError('');
            isConnectingRef.current = false;

            const effectiveName = username.trim() || 'Anonymous';
            socket.emit('join-call', {
                path: normalizedRoom,
                username: effectiveName,
                video: video,
                audio: audio
            });
        });

        socket.on('signal', gotMessageFromServer);

        socket.on('chat-message', (data, sender, socketIdSender) => {
            addMessage(data, sender, socketIdSender);
        });

        // Handle user status changes (audio/video toggle by peers)
        socket.on('user-status-changed', ({ socketId, audio: peerAudio, video: peerVideo }) => {
            setParticipants((prev) => {
                if (!prev[socketId]) return prev;
                return {
                    ...prev,
                    [socketId]: {
                        ...prev[socketId],
                        audio: typeof peerAudio === 'boolean' ? peerAudio : prev[socketId].audio,
                        video: typeof peerVideo === 'boolean' ? peerVideo : prev[socketId].video
                    }
                };
            });
        });

        // Handle room participants update
        socket.on('user-joined', (joinedId, rawClients) => {
            console.log(`[Socket.io] user-joined event received. Joined ID: ${joinedId}`, rawClients);
            if (!Array.isArray(rawClients)) return;

            const clientList = rawClients.map((c) => {
                if (typeof c === 'string') {
                    return { socketId: c, username: 'Participant', video: true, audio: true };
                }
                return {
                    socketId: c.socketId,
                    username: c.username || 'Participant',
                    video: typeof c.video === 'boolean' ? c.video : true,
                    audio: typeof c.audio === 'boolean' ? c.audio : true
                };
            });

            // Update participants list in state
            setParticipants((prev) => {
                const next = { ...prev };
                clientList.forEach((client) => {
                    if (client.socketId === socketIdRef.current) return;
                    if (!next[client.socketId]) {
                        next[client.socketId] = {
                            ...client,
                            stream: remoteStreamsRef.current[client.socketId] || null
                        };
                    } else {
                        next[client.socketId] = {
                            ...next[client.socketId],
                            username: client.username,
                            video: client.video,
                            audio: client.audio
                        };
                    }
                });
                return next;
            });

            // Ensure peer connections are registered for each client
            clientList.forEach((client) => {
                if (client.socketId === socketIdRef.current) return;
                getOrCreatePeerConnection(client.socketId);
            });

            // If WE just joined, create and send offers to all existing peers in the room
            if (joinedId === socketIdRef.current) {
                clientList.forEach(async (client) => {
                    const targetId = client.socketId;
                    if (targetId === socketIdRef.current) return;
                    const pc = getOrCreatePeerConnection(targetId);
                    try {
                        const offer = await pc.createOffer({
                            offerToReceiveAudio: true,
                            offerToReceiveVideo: true
                        });
                        await pc.setLocalDescription(offer);
                        socket.emit(
                            'signal',
                            targetId,
                            JSON.stringify({ sdp: pc.localDescription })
                        );
                    } catch (err) {
                        console.error('Error creating offer for', targetId, err);
                    }
                });
            }
        });

        socket.on('user-left', (leftSocketId) => {
            console.log(`[Socket.io] user-left event for: ${leftSocketId}`);
            if (connectionsRef.current[leftSocketId]) {
                try {
                    connectionsRef.current[leftSocketId].close();
                } catch {}
                delete connectionsRef.current[leftSocketId];
            }
            delete iceCandidatesQueue.current[leftSocketId];
            delete remoteStreamsRef.current[leftSocketId];
            setParticipants((prev) => {
                const next = { ...prev };
                delete next[leftSocketId];
                return next;
            });
        });

        socket.on('reconnecting', (attempt) => {
            setConnStatus('reconnecting');
            setConnError(`Reconnecting to server (attempt ${attempt})...`);
        });

        socket.on('reconnect', () => {
            console.log(`[Socket.io] Reconnected!`);
            setConnStatus('connected');
            setConnError('');
            const effectiveName = username.trim() || 'Anonymous';
            socket.emit('join-call', {
                path: normalizedRoom,
                username: effectiveName,
                video: video,
                audio: audio
            });
        });

        socket.on('disconnect', (reason) => {
            console.warn(`[Socket.io] Disconnected:`, reason);
            setConnStatus('disconnected');
            if (reason === 'io server disconnect') {
                socket.connect();
            }
        });

        socket.on('connect_error', (err) => {
            console.warn(`[Socket.io] Connection error to ${targetUrl}:`, err.message);

            // If primary candidate fails and more candidates exist, try next candidate URL
            if (candidates.length > 1 && isConnectingRef.current) {
                const nextIndex = (candidateIndexRef.current + 1) % candidates.length;
                if (nextIndex !== candidateIndexRef.current) {
                    console.log(`[Socket.io] Switching to next candidate server: ${candidates[nextIndex]}`);
                    candidateIndexRef.current = nextIndex;
                    setConnStatus('reconnecting');
                    setConnError(`Retrying with alternative backend...`);
                    setTimeout(() => {
                        connectToSocketServer(candidates[nextIndex]);
                    }, 1500);
                    return;
                }
            }

            setConnStatus('error');
            setConnError(`Could not reach signaling server (${err.message}). Tap Reconnect to try again.`);
        });
    }, [gotMessageFromServer, addMessage, getOrCreatePeerConnection, normalizedRoom, username, video, audio]);

    const handleVideo = () => {
        if (!localStreamRef.current) return;
        const videoTracks = localStreamRef.current.getVideoTracks();
        if (videoTracks.length === 0) return;

        const nextState = !video;
        videoTracks.forEach((track) => {
            track.enabled = nextState;
        });
        setVideo(nextState);

        if (socketRef.current) {
            socketRef.current.emit('user-toggle-video', nextState);
        }
    };

    const handleAudio = () => {
        if (!localStreamRef.current) return;
        const audioTracks = localStreamRef.current.getAudioTracks();
        if (audioTracks.length === 0) return;

        const nextState = !audio;
        audioTracks.forEach((track) => {
            track.enabled = nextState;
        });
        setAudio(nextState);

        if (socketRef.current) {
            socketRef.current.emit('user-toggle-audio', nextState);
        }
    };

    const switchCamera = async () => {
        if (!navigator.mediaDevices?.getUserMedia) return;
        const targetMode = facingMode === 'user' ? 'environment' : 'user';

        try {
            const newStream = await navigator.mediaDevices
                .getUserMedia({
                    video: { facingMode: { exact: targetMode } },
                    audio: false
                })
                .catch(async () => {
                    return await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: targetMode },
                        audio: false
                    });
                });

            const newVideoTrack = newStream.getVideoTracks()[0];
            if (!newVideoTrack) return;

            if (localStreamRef.current) {
                const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
                if (oldVideoTrack) {
                    oldVideoTrack.stop();
                    localStreamRef.current.removeTrack(oldVideoTrack);
                }
                localStreamRef.current.addTrack(newVideoTrack);
            }

            // Replace video track across all active peer connections
            for (const peerId in connectionsRef.current) {
                const pc = connectionsRef.current[peerId];
                const senders = pc.getSenders ? pc.getSenders() : [];
                const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
                if (videoSender) {
                    videoSender.replaceTrack(newVideoTrack).catch(console.error);
                }
            }

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStreamRef.current;
            }

            setFacingMode(targetMode);
        } catch (err) {
            console.warn('Could not flip camera:', err);
        }
    };

    const stopScreenShare = useCallback(() => {
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((t) => t.stop());
            screenStreamRef.current = null;
        }

        const camTrack = localStreamRef.current?.getVideoTracks()?.[0];
        if (camTrack) {
            for (const peerId in connectionsRef.current) {
                const pc = connectionsRef.current[peerId];
                const senders = pc.getSenders();
                const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
                if (videoSender) {
                    videoSender.replaceTrack(camTrack).catch(console.error);
                }
            }
        }

        if (localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
        }
        setScreen(false);
    }, []);

    const handleScreen = async () => {
        if (!screen) {
            try {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });
                screenStreamRef.current = screenStream;
                const screenTrack = screenStream.getVideoTracks()[0];

                screenTrack.onended = () => {
                    stopScreenShare();
                };

                for (const peerId in connectionsRef.current) {
                    const pc = connectionsRef.current[peerId];
                    const senders = pc.getSenders();
                    const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
                    if (videoSender) {
                        videoSender.replaceTrack(screenTrack).catch(console.error);
                    }
                }

                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = screenStream;
                }
                setScreen(true);
            } catch (err) {
                console.warn('Screen share cancelled or failed:', err);
            }
        } else {
            stopScreenShare();
        }
    };

    const cleanupResources = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => track.stop());
            localStreamRef.current = null;
        }
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((track) => track.stop());
            screenStreamRef.current = null;
        }
        for (const peerId in connectionsRef.current) {
            try {
                connectionsRef.current[peerId].close();
            } catch {}
        }
        connectionsRef.current = {};
        remoteStreamsRef.current = {};
        iceCandidatesQueue.current = {};

        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }
    }, []);

    const handleEndCall = () => {
        cleanupResources();
        navigate('/home');
    };

    // Clean up on component unmount
    useEffect(() => {
        return () => {
            cleanupResources();
        };
    }, [cleanupResources]);

    const sendMessage = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const trimmed = message.trim();
        if (!trimmed || !socketRef.current) return;

        socketRef.current.emit('chat-message', trimmed, username || 'Anonymous');
        setMessage('');
    };

    const toggleChat = () => {
        setModal((prev) => {
            if (!prev) setNewMessages(0);
            return !prev;
        });
    };

    const connectToMeeting = () => {
        const finalName = username.trim() || `User-${Math.floor(1000 + Math.random() * 9000)}`;
        setUsername(finalName);
        setAskForUsername(false);
        connectToSocketServer();
    };

    const handleManualReconnect = () => {
        connectToSocketServer();
    };

    const copyMeetingCode = () => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(normalizedRoom);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const participantList = Object.values(participants);
    const totalParticipantCount = participantList.length + 1;

    return (
        <div>
            {askForUsername ? (
                <div className={styles.lobbyContainer}>
                    <Card className={styles.lobbyCard}>
                        <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
                            Meeting Lobby: {normalizedRoom}
                        </Typography>

                        {permissionError && (
                            <Alert
                                severity="warning"
                                sx={{ width: '100%', textAlign: 'left', fontSize: '0.85rem' }}
                            >
                                <div>{permissionError}</div>
                                {typeof window !== 'undefined' &&
                                    !window.isSecureContext &&
                                    window.location.protocol === 'http:' && (
                                        <div style={{ marginTop: '8px' }}>
                                            <a
                                                href={`https://${window.location.host}${window.location.pathname}${window.location.search}`}
                                                style={{
                                                    color: '#1976d2',
                                                    fontWeight: 600,
                                                    textDecoration: 'underline'
                                                }}
                                            >
                                                👉 Tap here to switch to HTTPS (https://{window.location.host})
                                            </a>
                                        </div>
                                    )}
                            </Alert>
                        )}

                        <video
                            className={styles.lobbyPreviewVideo}
                            ref={localVideoRef}
                            autoPlay
                            muted
                            playsInline
                        />

                        <div style={{ display: 'flex', gap: '10px' }}>
                            {videoAvailable && (
                                <IconButton
                                    onClick={handleVideo}
                                    sx={{ bgcolor: video ? '#3b82f6' : '#ef4444', color: 'white' }}
                                >
                                    {video ? <VideocamIcon /> : <VideocamOffIcon />}
                                </IconButton>
                            )}
                            {audioAvailable && (
                                <IconButton
                                    onClick={handleAudio}
                                    sx={{ bgcolor: audio ? '#3b82f6' : '#ef4444', color: 'white' }}
                                >
                                    {audio ? <MicIcon /> : <MicOffIcon />}
                                </IconButton>
                            )}
                            {canSwitchCamera && videoAvailable && (
                                <IconButton
                                    title="Switch Camera (Front/Back)"
                                    onClick={switchCamera}
                                    sx={{ bgcolor: '#3b82f6', color: 'white' }}
                                >
                                    <CameraswitchIcon />
                                </IconButton>
                            )}
                        </div>

                        <TextField
                            id="username-lobby"
                            label="Your Name"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') connectToMeeting();
                            }}
                            variant="outlined"
                            fullWidth
                            placeholder="Enter your name"
                        />

                        <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                            <Button
                                variant="outlined"
                                color="inherit"
                                fullWidth
                                onClick={() => navigate('/home')}
                            >
                                Back
                            </Button>
                            <Button
                                variant="contained"
                                color="primary"
                                fullWidth
                                onClick={connectToMeeting}
                            >
                                Join Call
                            </Button>
                        </div>
                    </Card>
                </div>
            ) : (
                <div className={styles.meetVideoContainer}>
                    {/* Top Bar with Room Code, Connection Status & Participant Count */}
                    <div className={styles.topBar}>
                        <div className={styles.meetingBadge}>
                            <span>Room: {normalizedRoom}</span>
                            <Tooltip title={copied ? 'Copied!' : 'Copy Code'}>
                                <IconButton
                                    size="small"
                                    onClick={copyMeetingCode}
                                    sx={{ color: 'white', p: 0.5 }}
                                >
                                    <ContentCopyIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {connStatus === 'connected' ? (
                                <span
                                    className={styles.statusPillConnected}
                                    title={`Connected to signaling server (${activeBackendUrl})`}
                                >
                                    ● Online
                                </span>
                            ) : connStatus === 'connecting' || connStatus === 'reconnecting' ? (
                                <span className={styles.statusPillConnecting}>
                                    <CircularProgress size={10} color="inherit" sx={{ mr: 0.5 }} />
                                    Connecting...
                                </span>
                            ) : (
                                <span
                                    className={styles.statusPillDisconnected}
                                    title={connError || 'Disconnected from signaling server'}
                                >
                                    ✕ Disconnected
                                </span>
                            )}

                            <div className={styles.participantCount}>
                                <PeopleIcon fontSize="small" />
                                <span>
                                    {totalParticipantCount} {totalParticipantCount === 1 ? 'Person' : 'People'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Disconnected / Error Banner */}
                    {(connStatus === 'error' || connStatus === 'disconnected') && (
                        <div className={styles.reconnectBanner}>
                            <span>⚠️ {connError || 'Signaling connection lost. Live updates paused.'}</span>
                            <Button
                                size="small"
                                variant="contained"
                                color="inherit"
                                sx={{ color: '#0f172a', bgcolor: 'white', textTransform: 'none', py: 0.2 }}
                                startIcon={<RefreshIcon />}
                                onClick={handleManualReconnect}
                            >
                                Reconnect
                            </Button>
                        </div>
                    )}

                    {/* Chat Drawer */}
                    {showModal && (
                        <div className={styles.chatRoom}>
                            <div className={styles.chatContainer}>
                                <div className={styles.chatHeader}>
                                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                        Chat
                                    </Typography>
                                    <IconButton size="small" onClick={() => setModal(false)}>
                                        <CloseIcon />
                                    </IconButton>
                                </div>

                                <div className={styles.chattingDisplay}>
                                    {messages.length === 0 ? (
                                        <Typography
                                            color="text.secondary"
                                            sx={{ textAlign: 'center', mt: 4 }}
                                        >
                                            No messages yet. Send a greeting!
                                        </Typography>
                                    ) : (
                                        messages.map((item) => (
                                            <div key={item.id} className={styles.chatMessage}>
                                                <div className={styles.chatSender}>{item.sender}</div>
                                                <p className={styles.chatText}>{item.data}</p>
                                            </div>
                                        ))
                                    )}
                                    <div ref={chatEndRef} />
                                </div>

                                <form onSubmit={sendMessage} className={styles.chattingArea}>
                                    <TextField
                                        size="small"
                                        fullWidth
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder="Type a message..."
                                        variant="outlined"
                                    />
                                    <IconButton
                                        color="primary"
                                        type="submit"
                                        disabled={!message.trim()}
                                    >
                                        <SendIcon />
                                    </IconButton>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* Bottom Control Bar */}
                    <div className={styles.buttonContainers}>
                        <IconButton
                            title={video ? 'Turn Off Camera' : 'Turn On Camera'}
                            onClick={handleVideo}
                            sx={{ color: video ? 'white' : '#ef4444' }}
                        >
                            {video ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>

                        <IconButton
                            title={audio ? 'Mute Microphone' : 'Unmute Microphone'}
                            onClick={handleAudio}
                            sx={{ color: audio ? 'white' : '#ef4444' }}
                        >
                            {audio ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>

                        {screenAvailable && (
                            <IconButton
                                title={screen ? 'Stop Screen Share' : 'Share Screen'}
                                onClick={handleScreen}
                                sx={{ color: screen ? '#22c55e' : 'white' }}
                            >
                                {screen ? <StopScreenShareIcon /> : <ScreenShareIcon />}
                            </IconButton>
                        )}

                        {canSwitchCamera && videoAvailable && video && (
                            <IconButton
                                title="Switch Camera"
                                onClick={switchCamera}
                                sx={{ color: 'white' }}
                            >
                                <CameraswitchIcon />
                            </IconButton>
                        )}

                        <Badge badgeContent={newMessages} color="primary">
                            <IconButton
                                title="Open Chat"
                                onClick={toggleChat}
                                sx={{ color: showModal ? '#3b82f6' : 'white' }}
                            >
                                <ChatIcon />
                            </IconButton>
                        </Badge>

                        <IconButton
                            title="End Call"
                            onClick={handleEndCall}
                            sx={{ color: '#ef4444', ml: 2 }}
                        >
                            <CallEndIcon />
                        </IconButton>
                    </div>

                    {/* Local User Self-Preview Video */}
                    <video
                        className={styles.meetUserVideo}
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        title="You"
                    />

                    {/* Remote Participants Grid */}
                    <div className={styles.conferenceView}>
                        {participantList.length === 0 ? (
                            <div
                                style={{
                                    color: '#94a3b8',
                                    textAlign: 'center',
                                    gridColumn: '1 / -1'
                                }}
                            >
                                <Typography variant="h5" sx={{ mb: 1 }}>
                                    You are the only one in this meeting
                                </Typography>
                                <Typography variant="body2">
                                    Share the meeting link or code <strong>{normalizedRoom}</strong> to invite others.
                                </Typography>
                            </div>
                        ) : (
                            participantList.map((peer) => (
                                <RemoteParticipantTile key={peer.socketId} peer={peer} />
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
