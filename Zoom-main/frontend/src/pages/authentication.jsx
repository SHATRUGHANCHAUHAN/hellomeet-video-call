import * as React from 'react';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
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

        if (!username.trim() || !password) {
            setError("Please fill in all required fields.");
            return;
        }

        if (formState === 1 && !name.trim()) {
            setError("Full name is required to register.");
            return;
        }

        setLoading(true);
        try {
            if (formState === 0) {
                await handleLogin(username.trim(), password);
            } else if (formState === 1) {
                const regMsg = await handleRegister(name.trim(), username.trim(), password);
                setMessage(regMsg || "Registration successful! You can now log in.");
                setOpen(true);
                setFormState(0);
                setPassword("");
            }
        } catch (err) {
            console.error("Auth error:", err);
            let serverMsg = err.response?.data?.message;
            if (!serverMsg) {
                if (err.code === "ECONNABORTED") {
                    serverMsg = "Server connection timed out. The server may be waking up—please try again.";
                } else if (!err.response) {
                    serverMsg = "Cannot reach server. If using local backend, please run 'npm run dev:backend'. If using cloud, check your internet connection.";
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
                            >
                                Sign In
                            </Button>
                            <Button
                                variant={formState === 1 ? "contained" : "outlined"}
                                onClick={() => handleSwitchForm(1)}
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
                                    onChange={(e) => setName(e.target.value)}
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
                                onChange={(e) => setUsername(e.target.value)}
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
                                onChange={(e) => setPassword(e.target.value)}
                            />

                            {error && (
                                <Alert severity="error" sx={{ mt: 2 }}>
                                    {error}
                                </Alert>
                            )}

                            <Button
                                type="submit"
                                fullWidth
                                variant="contained"
                                sx={{ mt: 3, mb: 2 }}
                                disabled={loading}
                                onClick={handleAuth}
                            >
                                {loading ? "Please wait..." : formState === 0 ? "Login" : "Register"}
                            </Button>
                        </Box>
                    </Box>
                </Grid>
            </Grid>

            <Snackbar
                open={open}
                autoHideDuration={4000}
                onClose={() => setOpen(false)}
            >
                <Alert onClose={() => setOpen(false)} severity="success" sx={{ width: '100%' }}>
                    {message}
                </Alert>
            </Snackbar>
        </ThemeProvider>
    );
}