import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import HomeIcon from '@mui/icons-material/Home';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import { Button, CircularProgress, IconButton } from '@mui/material';

export default function History() {
    const { getHistoryOfUser } = useContext(AuthContext);
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const routeTo = useNavigate();

    useEffect(() => {
        let isMounted = true;

        const fetchHistory = async () => {
            setLoading(true);
            try {
                const history = await getHistoryOfUser();
                if (isMounted) {
                    setMeetings(Array.isArray(history) ? history : []);
                }
            } catch (err) {
                console.error("Error fetching history:", err);
                if (isMounted) {
                    setMeetings([]);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchHistory();

        return () => {
            isMounted = false;
        };
    }, [getHistoryOfUser]);

    const formatDate = (dateString) => {
        if (!dateString) return "N/A";
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "N/A";
        return date.toLocaleString();
    };

    return (
        <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                <IconButton onClick={() => routeTo("/home")} color="primary">
                    <HomeIcon />
                </IconButton>
                <Typography variant="h5" component="h1">
                    Meeting History
                </Typography>
            </div>

            {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                    <CircularProgress />
                </div>
            ) : meetings.length === 0 ? (
                <Card variant="outlined" style={{ textAlign: "center", padding: "40px" }}>
                    <Typography color="text.secondary">
                        No meeting history found. Join or start a meeting from the home page!
                    </Typography>
                    <Button
                        variant="contained"
                        sx={{ mt: 2 }}
                        onClick={() => routeTo("/home")}
                    >
                        Go to Home
                    </Button>
                </Card>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {meetings.map((item, index) => (
                        <Card key={item._id || index} variant="outlined">
                            <CardContent style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <Typography variant="h6" component="div">
                                        Meeting: {item.meetingCode}
                                    </Typography>
                                    <Typography color="text.secondary" sx={{ fontSize: 14 }}>
                                        Date: {formatDate(item.date)}
                                    </Typography>
                                </div>
                                <Button
                                    variant="outlined"
                                    startIcon={<VideoCallIcon />}
                                    onClick={() => routeTo(`/${item.meetingCode}`)}
                                >
                                    Rejoin
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
