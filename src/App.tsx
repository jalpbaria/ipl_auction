import { MotionConfig } from 'framer-motion';
import { useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ToastViewport } from './components/ui/ToastViewport';
import HostRoom from './pages/HostRoom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import PlayRoom from './pages/PlayRoom';
import Rooms from './pages/Rooms';
import { useAuthStore } from './store/auth';

const TOUCH_SESSION_INTERVAL_MS = 45_000;

function AuthLifecycleManager() {
  const navigate = useNavigate();
  const location = useLocation();

  const session = useAuthStore((s) => s.session);
  const kickedMessage = useAuthStore((s) => s.kickedMessage);
  const initializeAuth = useAuthStore((s) => s.initializeAuth);
  const touchCurrentSession = useAuthStore((s) => s.touchCurrentSession);

  // Restore session + subscribe to auth state changes once
  useEffect(() => {
    const unsubscribe = initializeAuth();
    return unsubscribe;
  }, [initializeAuth]);

  // Poll touch_session every 45 seconds while signed in (never calls register_session)
  useEffect(() => {
    if (!session) return;

    const intervalId = window.setInterval(() => {
      void touchCurrentSession().then((valid) => {
        if (!valid) {
          navigate('/login', { replace: true });
        }
      });
    }, TOUCH_SESSION_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [session, touchCurrentSession, navigate]);

  // If app-load touch_session kicked this device, ensure user lands on /login banner
  useEffect(() => {
    if (kickedMessage && location.pathname !== '/login') {
      navigate('/login', { replace: true });
    }
  }, [kickedMessage, location.pathname, navigate]);

  return null;
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AuthLifecycleManager />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/rooms"
            element={
              <ProtectedRoute>
                <Rooms />
              </ProtectedRoute>
            }
          />
          <Route
            path="/host/:roomId"
            element={
              <ProtectedRoute>
                <HostRoom />
              </ProtectedRoute>
            }
          />
          <Route
            path="/play/:roomId"
            element={
              <ProtectedRoute>
                <PlayRoom />
              </ProtectedRoute>
            }
          />
          <Route path="/host" element={<Navigate to="/rooms" replace />} />
          <Route path="/play" element={<Navigate to="/rooms" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastViewport />
      </BrowserRouter>
    </MotionConfig>
  );
}
