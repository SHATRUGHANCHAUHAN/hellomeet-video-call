import * as React from 'react';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CircularProgress from '@mui/material/CircularProgress';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { AuthContext } from '../contexts/AuthContext';
import { Snackbar, Alert } from '@mui/material';

const defaultTheme = createTheme();

export default function Authentication() {
    const [username, setUsername] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [name, setName] = React.useState("");
    const [error, setError] = React.useState("");
    const [message, setMessage] = React.useState("");
    const [loading, setLoading] = React.useState(false);

    const [formState, setFormState] = React.useState(0); // 0 = Login, 1 = Register
    const [open, setOpen] = React.useState(false);

    const { handleRegister, handleLogin } = React.useContext(AuthContext);

    const handleSwitchForm = (newFormState) => {
        setFormState(newFormState);
        setError("");
        setMessage("");
    };

    const handleAuth = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        setError("");

        const cleanUsername = username.trim();
        const cleanPassword = password;
        const cleanName = name.trim();

        if (!cleanUsername || !cleanPassword) {
            setError("Please fill in both username and password.");
            return;
        }

        if (cleanUsername.length < 3) {
            setError("Username must be at least 3 characters long.");
            return;
        }

        if (cleanPassword.length < 4) {
            setError("Password must be at least 4 characters long.");
            return;
        }

        if (formState === 1 && !cleanName) {
            setError("Full name is required to register.");
            return;
        }

        setLoading(true);
        try {
            if (formState === 0) {
                await handleLogin(cleanUsername, cleanPassword);
            } else if (formState === 1) {
                const regMsg = await handleRegister(cleanName, cleanUsername, cleanPassword);
                setMessage(regMsg || "Registration successful! You can now log in.");
                setOpen(true);
                setFormState(0);
                setPassword("");
            }
        } catch (err) {
            console.error("Auth error:", err);
            let serverMsg = err.response?.data?.message;
            if (!serverMsg) {
                if (err.code === "ECONNABORTED" || (err.message && err.message.includes("timeout"))) {
                    serverMsg = "Server took too long to respond. The cloud server may be waking up from sleep—please try again in a few seconds.";
                } else if (!err.response) {
                    serverMsg = "Cannot connect to server. Please check your internet connection or start your local backend ('npm run dev:backend').";
                } else {
                    serverMsg = err.message || "Authentication failed. Please try again.";
                }
            }
            setError(serverMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <ThemeProvider theme={defaultTheme}>
            <Grid container component="main" sx={{ height: '100vh' }}>
                <CssBaseline />
                <Grid
                    item
                    xs={false}
                    sm={4}
                    md={7}
                    sx={{
                        background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        color: 'white',
                        padding: 4
                    }}
                >
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', textAlign: 'center' }}>
                        Welcome to Hello Video Call
                    </h1>
                    <p style={{ fontSize: '1.2rem', textAlign: 'center', maxWidth: '480px' }}>
                        Reliable, fast, and high-definition video conferencing for teams and friends.
                    </p>
                </Grid>
                <Grid item xs={12} sm={8} md={5} component={Paper} elevation={6} square>
                    <Box
                        sx={{
                            my: 8,
                            mx: 4,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                        }}
                    >
                        <Avatar sx={{ m: 1, bgcolor: 'secondary.main' }}>
                            <LockOutlinedIcon />
                        </Avatar>

                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            <Button
                                variant={formState === 0 ? "contained" : "outlined"}
                                onClick={() => handleSwitchForm(0)}
                                disabled={loading}
                            >
                                Sign In
                            </Button>
                            <Button
                                variant={formState === 1 ? "contained" : "outlined"}
                                onClick={() => handleSwitchForm(1)}
                                disabled={loading}
                            >
                                Sign Up
                            </Button>
                        </div>

                        <Box component="form" onSubmit={handleAuth} noValidate sx={{ mt: 1, width: '100%' }}>
                            {formState === 1 && (
                                <TextField
                                    margin="normal"
                                    required
                                    fullWidth
                                    id="fullname"
                                    label="Full Name"
                                    name="name"
                                    value={name}
                                    autoFocus
                                    disabled={loading}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. John Doe"
                                />
                            )}

                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                id="username"
                                label="Username"
                                name="username"
                                value={username}
                                autoFocus={formState === 0}
                                disabled={loading}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Choose a username"
                            />
                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                name="password"
                                label="Password"
                                value={password}
                                type="password"
                                id="password"
                                disabled={loading}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="At least 4 characters"
                            />

                            {error && (
                                <Alert severity="error" sx={{ mt: 2 }}>
                                    {error}
                                </Alert>
                            )}

                            {loading && (
                                <Alert severity="info" sx={{ mt: 2, display: 'flex', alignItems: 'center' }}>
                                    Connecting to authentication server... (cloud servers may take a moment to wake up).
                                </Alert>
                            )}

                            <Button
                                type="submit"
                                fullWidth
                                variant="contained"
                                sx={{ mt: 3, mb: 2, py: 1.2 }}
                                disabled={loading}
                                onClick={handleAuth}
                            >
                                {loading ? (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <CircularProgress size={20} color="inherit" />
                                        <span>Please wait...</span>
                                    </Box>
                                ) : formState === 0 ? (
                                    "Sign In"
                                ) : (
                                    "Create Account"
                                )}
                            </Button>
                        </Box>
                    </Box>
                </Grid>
            </Grid>

            <Snackbar
                open={open}
                autoHideDuration={5000}
                onClose={() => setOpen(false)}
            >
                <Alert onClose={() => setOpen(false)} severity="success" sx={{ width: '100%' }}>
                    {message}
                </Alert>
            </Snackbar>
        </ThemeProvider>
    );
}
