import {
  ArrowLeft,
  BarChart3,
  Bell,
  Coins,
  FileText,
  Gavel,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Monitor,
  Settings,
  Shield,
  Trophy,
  Tv,
  UserCheck,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Tag } from '../components/ui/Tag';
import { useAuthStore } from '../store/auth';
import { useHostRoom } from '../store/hostRoom';
import { useToastStore } from '../store/toast';

export default function HostLayout() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const logout = useAuthStore((s) => s.logout);
  const showToast = useToastStore((s) => s.showToast);

  const room = useHostRoom((s) => s.room);
  const rejoinRequests = useHostRoom((s) => s.rejoinRequests);
  const loading = useHostRoom((s) => s.loading);
  const error = useHostRoom((s) => s.error);
  const loadHostRoom = useHostRoom((s) => s.loadHostRoom);
  const subscribeRealtime = useHostRoom((s) => s.subscribeRealtime);
  const reset = useHostRoom((s) => s.reset);

  const [loggingOut, setLoggingOut] = useState(false);

  const userId = session?.user.id;
  const userEmail = profile?.email || session?.user.email || '';

  useEffect(() => {
    if (!roomId || !userId) return;

    void loadHostRoom(roomId, userId);

    const unsubscribe = subscribeRealtime(roomId, (teamName) => {
      showToast({
        title: `${teamName} is asking to re-enter`,
        description: 'A removed franchise requested a new one-time code.',
        tone: 'warning',
        position: 'top-right',
        durationMs: 9000,
        action: {
          label: 'View requests',
          onClick: () => navigate(`/host/${roomId}/rejoin`),
        },
      });
    });

    return () => {
      unsubscribe();
      reset();
    };
  }, [roomId, userId, loadHostRoom, subscribeRealtime, reset, showToast, navigate]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      showToast({
        title: 'Signed out',
        description: 'Host console session closed.',
        tone: 'info',
      });
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  const pendingRejoinCount = rejoinRequests.filter(
    (r) => r.status === 'pending',
  ).length;

  const activeNavItems = [
    {
      to: `/host/${roomId}/overview`,
      label: 'Overview',
      icon: LayoutDashboard,
      badgeCount: 0,
    },
    {
      to: `/host/${roomId}/codes`,
      label: 'Team Codes',
      icon: KeyRound,
      badgeCount: 0,
    },
    {
      to: `/host/${roomId}/rejoin`,
      label: 'Re-entry Requests',
      icon: UserCheck,
      badgeCount: pendingRejoinCount,
    },
    {
      to: `/host/${roomId}/players`,
      label: 'Players',
      icon: Users,
      badgeCount: 0,
    },
    {
      to: `/host/${roomId}/notices`,
      label: 'Notices and Room Lock',
      icon: Bell,
      badgeCount: 0,
    },
    {
      to: `/host/${roomId}/purse`,
      label: 'Purse Control',
      icon: Coins,
      badgeCount: 0,
    },
    {
      to: `/host/${roomId}/settings`,
      label: 'Settings',
      icon: Settings,
      badgeCount: 0,
    },
  ];

  const disabledNavItems = [
    { label: 'Auction Control', icon: Gavel },
    { label: 'Squad Analysis', icon: BarChart3 },
    { label: 'Leaderboard', icon: Trophy },
    { label: 'Reports', icon: FileText },
    { label: 'Projector Room', icon: Tv },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6">
        <Card brackets bracketTone="gold" className="w-full max-w-md p-10 text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#F5B921]" />
          <p className="mt-4 font-display text-3xl tracking-wide text-[#E8ECF4]">
            INITIALIZING COMMAND CONSOLE
          </p>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-[#8B95AA]">
            SYNCING ROOM, TEAMS, CODES &amp; PLAYER POOL...
          </p>
        </Card>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6">
        <Card brackets bracketTone="gold" className="w-full max-w-xl p-8">
          <Badge tone="danger">HOST CONSOLE ERROR</Badge>
          <h1 className="mt-3 font-display text-4xl tracking-wide text-[#E8ECF4]">
            CANNOT ACCESS ROOM
          </h1>
          <p className="mt-2 text-sm text-red-300">
            {error || 'The requested auction room could not be found.'}
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Link to="/rooms">
              <Button variant="cyan" size="md">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Rooms</span>
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070B14] text-[#E8ECF4] flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#070B14]">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
          {/* Left: Shield + IPL AUCTION + COMMAND CONSOLE + Room Name */}
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link
              to="/rooms"
              title="Back to Rooms"
              className="flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE]"
            >
              <Shield className="h-5 w-5 text-[#F5B921]" aria-hidden="true" />
              <span className="font-display text-2xl tracking-[0.06em] text-[#E8ECF4]">
                IPL <span className="text-[#F5B921]">AUCTION</span>
              </span>
            </Link>

            <Tag accent="cyan" className="hidden sm:inline-flex">
              COMMAND CONSOLE
            </Tag>

            <span
              className="hidden md:inline-block h-4 w-px bg-white/15 shrink-0"
              aria-hidden="true"
            />

            <span className="hidden md:inline-block truncate font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#E8ECF4] max-w-[220px]">
              {room.name}
            </span>
          </div>

          {/* Right: Logged in as <email> + Disabled Open Projector + Logout */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden xl:inline-block font-mono text-[11px] text-[#8B95AA] truncate max-w-[240px]">
              Logged in as <span className="text-[#E8ECF4]">{userEmail}</span>
            </span>

            <div className="group relative inline-flex">
              <Button
                variant="outline"
                size="sm"
                disabled
                title="Available in a later phase"
                aria-describedby="open-projector-tooltip"
              >
                <Monitor className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Open Projector</span>
              </Button>
              <div
                id="open-projector-tooltip"
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full mt-2 w-max rounded-[4px] border border-[#F5B921]/40 bg-[#141C2F] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#F5B921] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                Available in a later phase
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              disabled={loggingOut}
              onClick={handleLogout}
              className="border border-white/10"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {loggingOut ? 'Exiting...' : 'Logout'}
              </span>
            </Button>
          </div>
        </div>
      </header>

      {/* Body: Collapsible Sidebar + Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar: collapses to icons (w-16) below 1100px, expanded (w-64) at >= 1100px */}
        <aside
          aria-label="Host navigation"
          className="w-16 min-[1100px]:w-64 shrink-0 border-r border-white/[0.08] bg-[#0E1524] flex flex-col justify-between"
        >
          <div className="p-2 min-[1100px]:p-4 space-y-6">
            <div>
              <p className="hidden min-[1100px]:block px-2.5 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8B95AA]">
                AUCTION MANAGEMENT
              </p>

              <nav className="space-y-1">
                {activeNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      title={item.label}
                      className={({ isActive }) =>
                        `relative flex items-center justify-center min-[1100px]:justify-between gap-2.5 rounded-[4px] border px-2.5 py-2.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#22D3EE] ${
                          isActive
                            ? 'border-[#22D3EE]/50 bg-[#141C2F] text-[#22D3EE]'
                            : 'border-transparent text-[#8B95AA] hover:border-white/[0.08] hover:bg-[#141C2F]/60 hover:text-[#E8ECF4]'
                        }`
                      }
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="hidden min-[1100px]:inline truncate">
                          {item.label}
                        </span>
                      </span>

                      {item.badgeCount > 0 && (
                        <>
                          {/* Expanded badge */}
                          <span className="hidden min-[1100px]:inline-flex h-5 min-w-[20px] items-center justify-center rounded-[2px] bg-[#F5B921] px-1.5 font-mono text-[10px] font-bold text-[#070B14] tabular-nums">
                            {item.badgeCount}
                          </span>
                          {/* Collapsed icon-mode corner badge */}
                          <span className="min-[1100px]:hidden absolute -top-1 -right-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-[2px] bg-[#F5B921] px-1 font-mono text-[9px] font-bold text-[#070B14] tabular-nums">
                            {item.badgeCount}
                          </span>
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </nav>
            </div>

            {/* Disabled SOON items */}
            <div className="border-t border-white/[0.08] pt-4">
              <p className="hidden min-[1100px]:block px-2.5 pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B95AA]/70">
                UPCOMING MODULES
              </p>
              <div className="space-y-1">
                {disabledNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      title={`${item.label} (SOON)`}
                      aria-disabled="true"
                      className="flex cursor-not-allowed items-center justify-center min-[1100px]:justify-between gap-2 rounded-[4px] px-2.5 py-2 text-xs text-[#8B95AA]/45 select-none"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="hidden min-[1100px]:inline truncate">
                          {item.label}
                        </span>
                      </span>
                      <span className="hidden min-[1100px]:inline-flex rounded-[2px] border border-white/10 bg-[#070B14] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#8B95AA]/70">
                        SOON
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.08] p-2 min-[1100px]:p-4">
            <Link
              to="/rooms"
              title="Back to Rooms"
              className="flex items-center justify-center min-[1100px]:justify-start gap-2 rounded-[4px] border border-white/10 bg-[#070B14] px-2.5 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA] transition-colors hover:border-white/25 hover:text-[#E8ECF4]"
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden min-[1100px]:inline">All Rooms</span>
            </Link>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="flex-1 min-w-0 bg-[#070B14] p-5 sm:p-7 lg:p-8 overflow-y-auto">
          <div className="mx-auto max-w-[1200px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
