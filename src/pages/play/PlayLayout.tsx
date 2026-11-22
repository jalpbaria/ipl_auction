import {
  ArrowLeft,
  Gavel,
  LayoutDashboard,
  RefreshCw,
  Shield,
  Trophy,
  Users,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { FullscreenGuard } from '../../components/anticheat/FullscreenGuard';
import { RemovedScreen } from '../../components/anticheat/RemovedScreen';
import { TeamCrest } from '../../components/host/TeamCrest';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { getTeamTheme } from '../../data/ipl-teams';
import { formatLakhs } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useToastStore } from '../../store/toast';
import type {
  HeartbeatStatus,
  MyTeamStatus,
  ViolationType,
} from '../../types/database';
import { PlayThemeContext } from './playTheme';

const HEARTBEAT_INTERVAL_MS = 5_000;
const LOAD_TIMEOUT_MS = 10_000;

function normalizeTeamStatus(data: unknown): MyTeamStatus | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  return {
    status: (r.status as HeartbeatStatus) ?? 'none',
    team_id: r.team_id ? String(r.team_id) : null,
    short_code: r.short_code ? String(r.short_code) : null,
    name: r.name ? String(r.name) : null,
    request_id: r.request_id ? String(r.request_id) : null,
    request_status:
      (r.request_status as MyTeamStatus['request_status']) ?? null,
    last_violation_type: r.last_violation_type
      ? String(r.last_violation_type)
      : null,
  };
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out. Please retry.`));
    }, ms);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

interface ThemeProviderProps {
  roomId: string;
  teamId: string | null;
  shortCode: string | null;
  teamName: string | null;
  children: React.ReactNode;
}

function ThemeProvider({
  roomId,
  teamId,
  shortCode,
  teamName,
  children,
}: ThemeProviderProps) {
  const theme = useMemo(() => getTeamTheme(shortCode), [shortCode]);
  const [purseLeftLakhs, setPurseLeftLakhs] = useState<number | null>(null);
  const [spentLakhs, setSpentLakhs] = useState<number | null>(null);

  const refreshPurse = useCallback(async () => {
    if (!supabase || !teamId) return;
    const { data, error } = await supabase
      .from('team_finance')
      .select('purse_left_lakhs, spent_lakhs')
      .eq('team_id', teamId)
      .maybeSingle();

    if (!error && data) {
      setPurseLeftLakhs(Number(data.purse_left_lakhs ?? 0));
      setSpentLakhs(Number(data.spent_lakhs ?? 0));
    }
  }, [teamId]);

  useEffect(() => {
    if (!supabase || !teamId) return;
    void refreshPurse();

    const client = supabase;
    const channel = client
      .channel(`play-nav-finance-${teamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_finance',
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          if (
            (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') &&
            payload.new
          ) {
            const row = payload.new as {
              purse_left_lakhs?: number;
              spent_lakhs?: number;
            };
            if (typeof row.purse_left_lakhs === 'number') {
              setPurseLeftLakhs(row.purse_left_lakhs);
            }
            if (typeof row.spent_lakhs === 'number') {
              setSpentLakhs(row.spent_lakhs);
            }
          }
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [teamId, refreshPurse]);

  const cssVars = useMemo(
    () =>
      ({
        '--team-primary': theme.primary,
        '--team-secondary': theme.secondary,
        '--team-accent': theme.accent,
        '--team-tint': theme.surfaceTint,
        '--team-glow': theme.glow,
      }) as React.CSSProperties,
    [theme],
  );

  const contextValue = useMemo(
    () => ({
      roomId,
      teamId,
      shortCode,
      teamName,
      theme,
      purseLeftLakhs,
      spentLakhs,
      refreshPurse,
    }),
    [roomId, teamId, shortCode, teamName, theme, purseLeftLakhs, spentLakhs, refreshPurse],
  );

  const navItems = [
    { to: `/play/${roomId}`, label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: `/play/${roomId}/auction`, label: 'Auction Room', icon: Gavel, end: false },
    { to: `/play/${roomId}/xi`, label: 'Playing XI', icon: Users, end: false },
    { to: `/play/${roomId}/leaderboard`, label: 'Leaderboard', icon: Trophy, end: false },
  ];

  return (
    <PlayThemeContext.Provider value={contextValue}>
      <div
        style={cssVars}
        className="min-h-screen bg-[#070B14] text-[#E8ECF4] flex flex-col"
      >
        {/* Compact Franchise Top Navigation */}
        <header
          style={{
            borderBottomColor: theme.primary,
            boxShadow: `0 2px 18px ${theme.glow}`,
          }}
          className="relative z-40 h-12 shrink-0 border-b bg-[#0E1524]"
        >
          <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6">
            {/* Left: Mark + 4 Team Nav Tabs */}
            <div className="flex items-center gap-4 min-w-0">
              <div className="hidden lg:flex items-center gap-2 shrink-0">
                <Shield
                  className="h-4 w-4 shrink-0"
                  style={{ color: theme.highlight }}
                  aria-hidden="true"
                />
                <span className="font-display text-xl tracking-[0.06em] text-[#E8ECF4]">
                  IPL <span style={{ color: theme.highlight }}>AUCTION</span>
                </span>
                <span className="ml-1 h-4 w-px bg-white/15" aria-hidden="true" />
              </div>

              <nav aria-label="Franchise navigation" className="flex items-center gap-1 overflow-x-auto">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.07em] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE] ${
                          isActive
                            ? 'border-[var(--team-primary)] bg-[var(--team-primary)] text-[var(--team-accent)]'
                            : 'border-transparent text-[#8B95AA] hover:border-white/10 hover:bg-[#141C2F] hover:text-[#E8ECF4]'
                        }`
                      }
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </nav>
            </div>

            {/* Right: Team Crest + Name + My Purse */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {shortCode && <TeamCrest shortCode={shortCode} size="sm" />}
                <span className="hidden md:inline-block max-w-[180px] truncate font-sans text-xs font-semibold text-[#E8ECF4]">
                  {teamName || 'Franchise'}
                </span>
              </div>

              <div
                style={{
                  borderColor: theme.primary,
                  backgroundColor: theme.surfaceTint,
                }}
                className="flex items-center gap-2 rounded-[3px] border px-2.5 py-1"
              >
                <span className="hidden sm:inline font-mono text-[9px] uppercase tracking-[0.1em] text-[#8B95AA]">
                  PURSE
                </span>
                <span className="font-mono text-xs font-bold text-[#F5B921] tabular-nums">
                  {purseLeftLakhs !== null ? formatLakhs(purseLeftLakhs) : '—'}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 min-w-0 flex flex-col">
          <Outlet />
        </div>
      </div>
    </PlayThemeContext.Provider>
  );
}

export default function PlayLayout() {
  const { roomId } = useParams<{ roomId: string }>();
  const showToast = useToastStore((s) => s.showToast);

  const [teamStatus, setTeamStatus] = useState<MyTeamStatus | null>(null);
  const [anticheatEnabled, setAnticheatEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef<boolean>(true);
  const requestSeqRef = useRef<number>(0);
  const lastHeartbeatErrRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadStatus = useCallback(async () => {
    const seq = ++requestSeqRef.current;

    if (!supabase || !roomId) {
      setTeamStatus(null);
      setError('Missing room or Supabase configuration.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcErr } = await withTimeout(
        supabase.rpc('get_my_team_status', { p_room: roomId }),
        LOAD_TIMEOUT_MS,
        'Team verification',
      );

      if (!mountedRef.current || seq !== requestSeqRef.current) return;

      if (rpcErr) {
        showToast({
          title: 'Team status error',
          description: rpcErr.message,
          tone: 'error',
        });
        setError(rpcErr.message);
        return;
      }

      const parsed = normalizeTeamStatus(data) ?? {
        status: 'none',
        team_id: null,
        short_code: null,
        name: null,
        request_id: null,
        request_status: null,
        last_violation_type: null,
      };

      if (parsed.status === 'active') {
        const { data: roomRow, error: roomErr } = await withTimeout(
          supabase
            .from('rooms')
            .select('anticheat_enabled')
            .eq('id', roomId)
            .maybeSingle(),
          LOAD_TIMEOUT_MS,
          'Room settings lookup',
        );

        if (!mountedRef.current || seq !== requestSeqRef.current) return;

        if (roomErr) {
          showToast({
            title: 'Room settings error',
            description: roomErr.message,
            tone: 'error',
          });
          setError(roomErr.message);
          return;
        }

        const enabled =
          typeof roomRow?.anticheat_enabled === 'boolean'
            ? roomRow.anticheat_enabled
            : true;
        setAnticheatEnabled(enabled);
      }

      setTeamStatus(parsed);
    } catch (err) {
      if (!mountedRef.current || seq !== requestSeqRef.current) return;
      const msg =
        err instanceof Error ? err.message : 'Unable to load franchise status.';
      setError(msg);
    } finally {
      if (mountedRef.current && seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [roomId, showToast]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // 5-second team_heartbeat while status === 'active' (pauses offline, resumes immediately online)
  useEffect(() => {
    if (!supabase || !roomId || teamStatus?.status !== 'active') {
      return;
    }

    const client = supabase;
    let cancelled = false;
    let inFlight = false;

    const runHeartbeat = async () => {
      if (cancelled || inFlight) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return;
      }

      inFlight = true;
      try {
        const { data, error: hbErr } = await client.rpc('team_heartbeat', {
          p_room: roomId,
        });

        if (cancelled || !mountedRef.current) return;

        if (hbErr) {
          if (lastHeartbeatErrRef.current !== hbErr.message) {
            lastHeartbeatErrRef.current = hbErr.message;
            showToast({
              title: 'Heartbeat error',
              description: hbErr.message,
              tone: 'error',
            });
          }
          return;
        }

        lastHeartbeatErrRef.current = null;
        const nextStatus = String(data ?? '') as HeartbeatStatus;

        if (nextStatus === 'removed') {
          try {
            if (
              document.fullscreenElement &&
              typeof document.exitFullscreen === 'function'
            ) {
              void document.exitFullscreen().catch(() => {});
            }
          } catch {
            // ignore fullscreen exit error
          }

          let updatedStatus: MyTeamStatus | null = null;
          try {
            const { data: statusData, error: statusErr } = await client.rpc(
              'get_my_team_status',
              { p_room: roomId },
            );
            if (!statusErr) {
              updatedStatus = normalizeTeamStatus(statusData);
            }
          } catch {
            // Fallback below
          }

          if (cancelled || !mountedRef.current) return;
          setTeamStatus((prev) =>
            updatedStatus ?? {
              status: 'removed',
              team_id: prev?.team_id ?? null,
              short_code: prev?.short_code ?? null,
              name: prev?.name ?? null,
              request_id: prev?.request_id ?? null,
              request_status: prev?.request_status ?? null,
              last_violation_type: prev?.last_violation_type ?? null,
            },
          );
          return;
        }

        if (nextStatus === 'none' || nextStatus === 'open') {
          try {
            if (
              document.fullscreenElement &&
              typeof document.exitFullscreen === 'function'
            ) {
              void document.exitFullscreen().catch(() => {});
            }
          } catch {
            // ignore fullscreen exit error
          }

          setTeamStatus((prev) => ({
            status: nextStatus,
            team_id: prev?.team_id ?? null,
            short_code: prev?.short_code ?? null,
            name: prev?.name ?? null,
            request_id: prev?.request_id ?? null,
            request_status: prev?.request_status ?? null,
            last_violation_type: prev?.last_violation_type ?? null,
          }));
          return;
        }

        if (nextStatus === 'active') {
          const { data: roomRow } = await client
            .from('rooms')
            .select('anticheat_enabled')
            .eq('id', roomId)
            .maybeSingle();

          if (cancelled || !mountedRef.current) return;
          if (typeof roomRow?.anticheat_enabled === 'boolean') {
            setAnticheatEnabled(roomRow.anticheat_enabled);
          }
        }
      } finally {
        inFlight = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void runHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    const handleOnline = () => {
      void runHeartbeat();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
    };
  }, [roomId, teamStatus?.status, showToast]);

  const handleViolationRemoved = useCallback(
    (freshStatus: MyTeamStatus | null, fallbackType?: ViolationType) => {
      setTeamStatus((prev) =>
        freshStatus ?? {
          status: 'removed',
          team_id: prev?.team_id ?? null,
          short_code: prev?.short_code ?? null,
          name: prev?.name ?? null,
          request_id: prev?.request_id ?? null,
          request_status: prev?.request_status ?? null,
          last_violation_type: fallbackType ?? prev?.last_violation_type ?? null,
        },
      );
    },
    [],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6">
        <Card brackets bracketTone="cyan" className="w-full max-w-md p-8 text-center">
          <div className="mx-auto h-7 w-7 rounded-full border-2 border-[#22D3EE] border-t-transparent motion-safe:animate-spin" />
          <p className="mt-4 font-display text-3xl tracking-wide text-[#E8ECF4]">
            VERIFYING FRANCHISE SEAT
          </p>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-[#8B95AA]">
            CHECKING ROOM ACCESS &amp; ANTI-CHEAT STATUS...
          </p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6">
        <Card brackets bracketTone="gold" className="w-full max-w-lg p-8">
          <Badge tone="danger">FRANCHISE ACCESS ERROR</Badge>
          <h1 className="mt-3 font-display text-4xl tracking-wide text-[#E8ECF4]">
            UNABLE TO ENTER ROOM
          </h1>
          <p className="mt-2 text-sm text-red-300">{error}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="cyan" size="md" onClick={() => void loadStatus()}>
              <RefreshCw className="h-4 w-4" />
              <span>Retry</span>
            </Button>
            <Link to="/rooms">
              <Button variant="outline" size="md">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to rooms</span>
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!roomId || !teamStatus || teamStatus.status === 'none' || teamStatus.status === 'open') {
    return (
      <div className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6">
        <Card brackets bracketTone="gold" className="w-full max-w-lg p-8">
          <Badge tone="gold">NO ACTIVE FRANCHISE SEAT</Badge>
          <h1 className="mt-3 font-display text-4xl tracking-wide text-[#E8ECF4]">
            ROOM ACCESS REQUIRED
          </h1>
          <p className="mt-2 text-sm text-[#8B95AA]">
            You are not an active member of this room
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Link to="/rooms">
              <Button variant="outline" size="md">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to rooms</span>
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (teamStatus.status === 'removed') {
    return (
      <RemovedScreen
        roomId={roomId}
        teamStatus={teamStatus}
        onStatusUpdate={setTeamStatus}
        onRejoined={loadStatus}
      />
    );
  }

  return (
    <FullscreenGuard
      roomId={roomId}
      team={{
        id: teamStatus.team_id,
        short_code: teamStatus.short_code,
        name: teamStatus.name,
      }}
      anticheatEnabled={anticheatEnabled}
      onRemoved={handleViolationRemoved}
      onAnticheatDisabled={() => setAnticheatEnabled(false)}
    >
      <ThemeProvider
        roomId={roomId}
        teamId={teamStatus.team_id}
        shortCode={teamStatus.short_code}
        teamName={teamStatus.name}
      >
        <Outlet />
      </ThemeProvider>
    </FullscreenGuard>
  );
}
