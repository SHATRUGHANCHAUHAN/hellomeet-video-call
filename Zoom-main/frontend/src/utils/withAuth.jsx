import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const withAuth = (WrappedComponent) => {
    const AuthComponent = (props) => {
        const navigate = useNavigate();
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

        useEffect(() => {
            if (!token) {
                navigate("/auth", { replace: true });
            }
        }, [navigate, token]);

        if (!token) {
            return null;
        }

        return <WrappedComponent {...props} />;
    };

    return AuthComponent;
};

export default withAuth;