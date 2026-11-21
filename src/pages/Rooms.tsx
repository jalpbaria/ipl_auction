import { ArrowLeft, LogOut, User } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreateRoomPanel } from '../components/rooms/CreateRoomPanel';
import { JoinRoomPanel } from '../components/rooms/JoinRoomPanel';
import { YourRoomsSection } from '../components/rooms/YourRoomsSection';
import { Button } from '../components/ui/Button';
import { useAuthStore } from '../store/auth';
import { useToastStore } from '../store/toast';

export default function Rooms() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const showToast = useToastStore((s) => s.showToast);

  const [loggingOut, setLoggingOut] = useState(false);

  const displayName =
    profile?.full_name || session?.user.email?.split('@')[0] || 'Manager';

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      showToast({
        title: 'Signed out',
        description: 'Your device session has been closed.',
        tone: 'info',
      });
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-[#E8ECF4]">
      {/* Header Bar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#070B14]">
        <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="font-display text-2xl sm:text-[28px] tracking-[0.06em] text-[#E8ECF4] whitespace-nowrap shrink-0"
            >
              IPL <span className="text-[#F5B921]">AUCTION</span>
            </Link>
            <Link
              to="/"
              className="hidden sm:inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA] transition-colors hover:text-[#E8ECF4]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Landing</span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#E8ECF4] max-w-[160px] truncate">
              <User className="h-3.5 w-3.5 shrink-0 text-[#22D3EE]" aria-hidden="true" />
              <span className="truncate">{displayName}</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={loggingOut}
              onClick={handleLogout}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{loggingOut ? 'Exiting...' : 'Logout'}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 border-b border-white/[0.08] pb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#22D3EE]">
            ROOM LOBBY // HOST OR FRANCHISE
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl lg:text-6xl tracking-wide text-[#E8ECF4]">
            SELECT ENTRY PROTOCOL
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#8B95AA]">
            Initialize a new auction hall as the event host or enter an existing room as a
            competing IPL franchise.
          </p>
        </div>

        {/* Two Side-by-Side Entry Panels */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          <CreateRoomPanel />
          <JoinRoomPanel />
        </div>

        {/* Hosted Rooms & Active Team Assignments */}
        <YourRoomsSection />
      </main>
    </div>
  );
}
