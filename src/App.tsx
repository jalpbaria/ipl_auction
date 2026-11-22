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
import HostLayout from './layouts/HostLayout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import PlayRoom from './pages/PlayRoom';
import ProjectorRoom from './pages/ProjectorRoom';
import Rooms from './pages/Rooms';
import TeamAuction from './pages/TeamAuction';
import HostAnalysis from './pages/host/HostAnalysis';
import HostAuction from './pages/host/HostAuction';
import HostLeaderboard from './pages/host/HostLeaderboard';
import HostNotices from './pages/host/HostNotices';
import HostOverview from './pages/host/HostOverview';
import HostPlayers from './pages/host/HostPlayers';
import HostProjector from './pages/host/HostProjector';
import HostPurseControl from './pages/host/HostPurseControl';
import HostRejoinRequests from './pages/host/HostRejoinRequests';
import HostReports from './pages/host/HostReports';
import HostSettings from './pages/host/HostSettings';
import HostTeamCodes from './pages/host/HostTeamCodes';
import PlayLayout from './pages/play/PlayLayout';
import TeamLeaderboard from './pages/play/TeamLeaderboard';
import TeamPlayingXi from './pages/play/TeamPlayingXi';
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
                <HostLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<HostOverview />} />
            <Route path="auction" element={<HostAuction />} />
            <Route path="codes" element={<HostTeamCodes />} />
            <Route path="rejoin" element={<HostRejoinRequests />} />
            <Route path="players" element={<HostPlayers />} />
            <Route path="notices" element={<HostNotices />} />
            <Route path="purse" element={<HostPurseControl />} />
            <Route path="reports" element={<HostReports />} />
            <Route path="analysis" element={<HostAnalysis />} />
            <Route path="leaderboard" element={<HostLeaderboard />} />
            <Route path="projector" element={<HostProjector />} />
            <Route path="settings" element={<HostSettings />} />
          </Route>
          <Route
            path="/projector/:roomId"
            element={
              <ProtectedRoute>
                <ProjectorRoom />
              </ProtectedRoute>
            }
          />
          <Route
            path="/play/:roomId"
            element={
              <ProtectedRoute>
                <PlayLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<PlayRoom />} />
            <Route path="auction" element={<TeamAuction />} />
            <Route path="xi" element={<TeamPlayingXi />} />
            <Route path="leaderboard" element={<TeamLeaderboard />} />
          </Route>
          <Route path="/host" element={<Navigate to="/rooms" replace />} />
          <Route path="/play" element={<Navigate to="/rooms" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastViewport />
      </BrowserRouter>
    </MotionConfig>
  );
}
