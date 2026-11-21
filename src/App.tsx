import { MotionConfig } from 'framer-motion';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing';
import PhasePlaceholder from './pages/PhasePlaceholder';

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/login"
            element={
              <PhasePlaceholder
                routePath="/login"
                title="FRANCHISE & HOST LOGIN"
                description="Authentication, team code validation, and session assignment are scheduled for Phase 2."
              />
            }
          />
          <Route
            path="/rooms"
            element={
              <PhasePlaceholder
                routePath="/rooms"
                title="AUCTION ROOM LOBBY"
                description="Room creation, join codes, and pre-auction table readiness checks are coming in the next phase."
              />
            }
          />
          <Route
            path="/host"
            element={
              <PhasePlaceholder
                routePath="/host"
                title="ADMIN & PROJECTOR STAGE"
                description="Host gavel controls, player set triggers, re-entry approvals, and the 16:9 hall feed are coming in the next phase."
              />
            }
          />
          <Route
            path="/play"
            element={
              <PhasePlaceholder
                routePath="/play"
                title="LIVE FRANCHISE CONSOLE"
                description="Real-time bidding paddles, 20-second shot clock, purse guardrails, and squad builder are coming in the next phase."
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </MotionConfig>
  );
}
