import {
  Crown,
  Lock,
  RefreshCw,
  Trophy,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { TeamCrest } from '../../components/host/TeamCrest';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/auth';
import type { DbRoom, DbTeam, LeaderboardRow } from '../../types/database';
import { usePlayTheme } from './playTheme';

type MyTeamDetail = Pick<
  DbTeam,
  'id' | 'room_id' | 'short_code' | 'name' | 'leader_name' | 'status'
>;

type RoomSummary = Pick<DbRoom, 'id' | 'name' | 'squad_max' | 'leaderboard_public'>;

function LeaderboardSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-[1200px] space-y-6 p-4 sm:p-6"
      aria-busy="true"
    >
      <div className="h-20 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]" />
      <div className="h-24 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]" />
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, idx) => (
          <div
            key={idx}
            className="h-14 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]"
          />
        ))}
      </div>
    </div>
  );
}

function isUnpublishedMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('not been published') ||
    lower.includes('not published') ||
    lower.includes('leaderboard is hidden')
  );
}

export default function TeamLeaderboard() {
  const { roomId } = useParams<{ roomId: string }>();
  const session = useAuthStore((s) => s.session);
  const { theme } = usePlayTheme();

  const [team, setTeam] = useState<MyTeamDetail | null>(null);
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [unpublished, setUnpublished] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestSeqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadLeaderboard = useCallback(
    async (silent = false) => {
      const seq = ++requestSeqRef.current;

      if (!supabase || !roomId || !session?.user.id) {
        if (mountedRef.current) {
          setError('Missing room or session details.');
          setLoading(false);
          setRefreshing(false);
        }
        return;
      }

      if (!silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      try {
        const [teamRes, roomRes] = await Promise.all([
          supabase
            .from('teams')
            .select('id, room_id, short_code, name, leader_name, status')
            .eq('room_id', roomId)
            .eq('leader_id', session.user.id)
            .eq('status', 'active')
            .maybeSingle(),
          supabase
            .from('rooms')
            .select('id, name, squad_max, leaderboard_public')
            .eq('id', roomId)
            .maybeSingle(),
        ]);

        if (!mountedRef.current || seq !== requestSeqRef.current) return;

        if (teamRes.error) throw new Error(teamRes.error.message);
        if (!teamRes.data) {
          setTeam(null);
          setError('You are not an active member of this room.');
          return;
        }
        if (roomRes.error) throw new Error(roomRes.error.message);
        if (!roomRes.data) throw new Error('Auction room not found.');

        setTeam(teamRes.data as MyTeamDetail);
        setRoom(roomRes.data as RoomSummary);

        const { data: lbData, error: rpcErr } = await supabase.rpc(
          'get_leaderboard',
          {
            p_room: roomId,
          },
        );

        if (!mountedRef.current || seq !== requestSeqRef.current) return;

        if (rpcErr) {
          if (isUnpublishedMessage(rpcErr.message || '')) {
            setUnpublished(true);
            setRows([]);
            return;
          }
          throw new Error(rpcErr.message || 'Unable to fetch leaderboard.');
        }

        const parsed = Array.isArray(lbData) ? (lbData as LeaderboardRow[]) : [];
        parsed.sort((a, b) => a.pos - b.pos);
        setUnpublished(false);
        setRows(parsed);
      } catch (err) {
        if (!mountedRef.current || seq !== requestSeqRef.current) return;
        const message =
          err instanceof Error ? err.message : 'Unable to fetch leaderboard.';
        if (isUnpublishedMessage(message)) {
          setUnpublished(true);
          setRows([]);
          setError(null);
        } else {
          setError(message);
        }
      } finally {
        if (mountedRef.current && seq === requestSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [roomId, session?.user.id],
  );

  // Initial load + 10-second polling (works both while waiting for publish and while live)
  useEffect(() => {
    void loadLeaderboard(false);

    const intervalId = window.setInterval(() => {
      void loadLeaderboard(true);
    }, 10_000);

    return () => window.clearInterval(intervalId);
  }, [loadLeaderboard]);

  // Immediate refresh whenever room.leaderboard_public changes in realtime
  useEffect(() => {
    if (!supabase || !roomId) return;
    const client = supabase;

    const channel = client
      .channel(`play-leaderboard-room-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.new) {
            const updated = payload.new as Partial<RoomSummary>;
            setRoom((prev) => (prev ? { ...prev, ...updated } : prev));
          }
          void loadLeaderboard(true);
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [roomId, loadLeaderboard]);

  const topScore = useMemo(() => {
    if (rows.length === 0) return 0;
    return Math.max(...rows.map((r) => Number(r.score) || 0), 0);
  }, [rows]);

  const myRow = useMemo(() => {
    if (!team) return null;
    return rows.find((r) => r.team_id === team.id) ?? null;
  }, [rows, team]);

  if (loading) {
    return <LeaderboardSkeleton />;
  }

  if (error || !team || !room) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-12 sm:px-6">
        <Card brackets bracketTone="gold" className="p-8">
          <Badge tone="danger">LEADERBOARD ERROR</Badge>
          <h1 className="mt-3 font-display text-4xl tracking-wide text-[#E8ECF4]">
            UNABLE TO LOAD LEADERBOARD
          </h1>
          <p className="mt-2 text-sm text-red-300">
            {error || 'Room or franchise data could not be loaded.'}
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Button
              variant="cyan"
              size="sm"
              onClick={() => void loadLeaderboard(false)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p
            style={{ color: theme.highlight }}
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em]"
          >
            {room.name} // TOURNAMENT STANDINGS
          </p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl leading-none tracking-wide text-[#E8ECF4]">
            LEADERBOARD
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA]">
            SYNCED EVERY 10S
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void loadLeaderboard(true)}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? 'motion-safe:animate-spin' : ''}`}
            />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {/* Locked State until Host Publishes */}
      {unpublished ? (
        <Card
          brackets
          bracketTone="gold"
          className="mx-auto max-w-2xl p-8 sm:p-10 text-center space-y-5"
          style={{
            borderColor: `${theme.primary}66`,
            boxShadow: `0 0 24px ${theme.glow}`,
          }}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[4px] border border-[#F5B921]/40 bg-[#070B14] text-[#F5B921]">
            <Lock className="h-7 w-7" />
          </div>

          <div className="space-y-2">
            <Badge tone="gold">STANDINGS LOCKED</Badge>
            <h2 className="font-display text-3xl sm:text-4xl tracking-wide text-[#E8ECF4]">
              The host has not published the leaderboard yet
            </h2>
            <p className="mx-auto max-w-md text-xs leading-relaxed text-[#8B95AA]">
              This page automatically checks every 10 seconds and updates live as soon as
              the host reveals final standings.
            </p>
          </div>

          <div className="pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => void loadLeaderboard(true)}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? 'motion-safe:animate-spin' : ''}`}
              />
              <span>Check again</span>
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Summary Banner for My Rank */}
          {myRow && (
            <div
              style={{
                borderColor: theme.primary,
                backgroundColor: theme.surfaceTint,
                boxShadow: `0 0 24px ${theme.glow}`,
              }}
              className="flex flex-col gap-4 rounded-[4px] border bg-[#0E1524] p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-4">
                <TeamCrest shortCode={team.short_code} size="lg" />
                <div>
                  <p
                    style={{ color: theme.highlight }}
                    className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]"
                  >
                    Your rank: #{myRow.pos} of {rows.length}
                  </p>
                  <h2 className="mt-1 font-display text-3xl leading-none tracking-wide text-[#E8ECF4]">
                    {team.name}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-6 font-mono tabular-nums">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                    SQUAD
                  </p>
                  <p className="mt-0.5 font-display text-3xl leading-none text-[#E8ECF4]">
                    {myRow.squad}/{room.squad_max}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                    SCORE
                  </p>
                  <p className="mt-0.5 font-display text-3xl leading-none text-[#F5B921]">
                    {Number(myRow.score).toFixed(1).replace(/\.0$/, '')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Ranked Table */}
          <Card brackets bracketTone="cyan" className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Trophy className="h-4 w-4 text-[#F5B921]" aria-hidden="true" />
                <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
                  FRANCHISE RANKINGS
                </h2>
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA]">
                {rows.length} {rows.length === 1 ? 'TEAM' : 'TEAMS'} RANKED
              </span>
            </div>

            {rows.length === 0 ? (
              <div className="p-10 text-center">
                <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
                  No standings available yet.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/[0.08] bg-[#070B14]/80 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                      <th className="w-20 px-5 py-3">Rank</th>
                      <th className="px-4 py-3">Team</th>
                      <th className="px-4 py-3 text-center">Squad</th>
                      <th className="px-5 py-3">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-sm">
                    {rows.map((row) => {
                      const isFirst = row.pos === 1;
                      const isMine = row.team_id === team.id;
                      const numericScore = Number(row.score) || 0;
                      const barPct =
                        topScore > 0
                          ? Math.max(4, Math.min(100, (numericScore / topScore) * 100))
                          : 0;

                      return (
                        <tr
                          key={row.team_id}
                          style={
                            isMine
                              ? {
                                  backgroundColor: theme.surfaceTint,
                                  boxShadow: `inset 3px 0 0 ${theme.primary}`,
                                }
                              : isFirst
                                ? {
                                    backgroundColor: 'rgba(245, 185, 33, 0.07)',
                                    boxShadow: 'inset 3px 0 0 #F5B921',
                                  }
                                : undefined
                          }
                          className="transition-colors hover:bg-[#141C2F]/60"
                        >
                          <td className="px-5 py-3.5">
                            <span
                              style={
                                isMine && !isFirst
                                  ? {
                                      borderColor: theme.primary,
                                      backgroundColor: theme.primary,
                                      color: theme.accent,
                                    }
                                  : undefined
                              }
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-[3px] border font-display text-xl leading-none tabular-nums ${
                                isFirst
                                  ? 'border-[#F5B921] bg-[#F5B921] text-[#070B14]'
                                  : isMine
                                    ? ''
                                    : 'border-white/15 bg-[#070B14] text-[#E8ECF4]'
                              }`}
                            >
                              {row.pos}
                            </span>
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <TeamCrest shortCode={row.short_code} size="md" />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p
                                    className={`font-medium truncate ${
                                      isFirst
                                        ? 'text-[#F5B921]'
                                        : 'text-[#E8ECF4]'
                                    }`}
                                  >
                                    {row.team_name}
                                  </p>
                                  {isFirst && (
                                    <span className="inline-flex items-center gap-1 rounded-[2px] border border-[#F5B921]/50 bg-[#F5B921]/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#F5B921]">
                                      <Crown className="h-2.5 w-2.5" />
                                      <span>CHAMPIONS</span>
                                    </span>
                                  )}
                                  {isMine && (
                                    <span
                                      style={{
                                        borderColor: theme.primary,
                                        backgroundColor: theme.primary,
                                        color: theme.accent,
                                      }}
                                      className="inline-flex items-center rounded-[2px] border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em]"
                                    >
                                      YOU
                                    </span>
                                  )}
                                </div>
                                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#8B95AA]">
                                  {row.short_code}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-center font-mono text-xs text-[#E8ECF4] tabular-nums">
                            {row.squad}/{room.squad_max}
                          </td>

                          <td className="min-w-[220px] px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <span
                                className={`w-16 shrink-0 font-mono text-sm font-bold tabular-nums ${
                                  isFirst ? 'text-[#F5B921]' : 'text-[#22D3EE]'
                                }`}
                              >
                                {numericScore.toFixed(1).replace(/\.0$/, '')}
                              </span>
                              <div className="h-2 flex-1 overflow-hidden rounded-[2px] border border-white/[0.08] bg-[#070B14]">
                                <div
                                  style={{
                                    width: `${barPct}%`,
                                    backgroundColor: isFirst
                                      ? '#F5B921'
                                      : isMine
                                        ? theme.primary
                                        : '#22D3EE',
                                  }}
                                  className="h-full transition-all duration-300"
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
