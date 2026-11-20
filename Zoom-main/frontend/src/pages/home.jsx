import React, { useContext, useState } from 'react';
import withAuth from '../utils/withAuth';
import { useNavigate } from 'react-router-dom';
import "../App.css";
import { Button, IconButton, TextField, Alert } from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import { AuthContext } from '../contexts/AuthContext';

function HomeComponent() {
    const navigate = useNavigate();
    const [meetingCode, setMeetingCode] = useState("");
    const [error, setError] = useState("");
    const { addToUserHistory, handleLogout } = useContext(AuthContext);

    const handleJoinVideoCall = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const code = meetingCode.trim();
        if (!code) {
            setError("Please enter a meeting code");
            return;
        }

        setError("");
        try {
            await addToUserHistory(code);
        } catch {
            // Non-fatal, continue navigation
        }
        navigate(`/${code}`);
    };

    const handleStartNewMeeting = async () => {
        const randomCode = Math.random().toString(36).substring(2, 8);
        try {
            await addToUserHistory(randomCode);
        } catch {
            // Non-fatal, continue navigation
        }
        navigate(`/${randomCode}`);
    };

    return (
        <>
            <div className="navBar">
                <div style={{ display: "flex", alignItems: "center" }}>
                    <h2>Hello Video Call</h2>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <IconButton
                        title="Meeting History"
                        onClick={() => navigate("/history")}
                    >
                        <RestoreIcon />
                    </IconButton>
                    <span
                        style={{ cursor: "pointer", fontWeight: 500 }}
                        onClick={() => navigate("/history")}
                    >
                        History
                    </span>

                    <Button
                        variant="outlined"
                        color="secondary"
                        onClick={handleLogout}
                    >
                        Logout
                    </Button>
                </div>
            </div>

            <div className="meetContainer">
                <div className="leftPanel">
                    <div>
                        <h2>Providing Quality Video Call Just Like Quality Education</h2>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
                            <form onSubmit={handleJoinVideoCall} style={{ display: 'flex', gap: "10px", alignItems: 'center' }}>
                                <TextField
                                    value={meetingCode}
                                    onChange={(e) => {
                                        setMeetingCode(e.target.value);
                                        if (error) setError("");
                                    }}
                                    id="meeting-code-input"
                                    label="Meeting Code"
                                    variant="outlined"
                                    size="small"
                                />
                                <Button type="submit" variant="contained">
                                    Join
                                </Button>
                            </form>

                            {error && (
                                <Alert severity="warning" sx={{ width: 'fit-content' }}>
                                    {error}
                                </Alert>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span>or</span>
                                <Button
                                    variant="outlined"
                                    startIcon={<VideoCallIcon />}
                                    onClick={handleStartNewMeeting}
                                >
                                    Start New Meeting
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="rightPanel">
                    <img srcSet="/logo3.png" alt="Video Call Illustration" />
                </div>
            </div>
        </>
    );
}

export default withAuth(HomeComponent);