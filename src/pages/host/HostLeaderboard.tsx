import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Info,
  Lock,
  Monitor,
  RefreshCw,
  Trophy,
  Unlock,
  Users,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GroundView,
  roomPlayerToGroundPlayer,
} from '../../components/ground/GroundView';
import { ConfirmModal } from '../../components/host/ConfirmModal';
import { getTeamPalette, TeamCrest } from '../../components/host/TeamCrest';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { isSquadValid, squadChecks, toSquadPlayers } from '../../lib/squadRules';
import { supabase } from '../../lib/supabase';
import { formatDateTime12h } from '../../lib/time';
import { useHostRoom } from '../../store/hostRoom';
import { useToastStore } from '../../store/toast';
import type {
  LeaderboardRow,
  ProjectorMode,
  RoomPlayerWithPlayer,
} from '../../types/database';

type PendingControlAction =
  | { type: 'lock_xi'; nextValue: boolean }
  | { type: 'projector_mode'; nextMode: ProjectorMode }
  | null;

function csvCell(value: string | number): string {
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

export default function HostLeaderboard() {
  const room = useHostRoom((s) => s.room);
  const teams = useHostRoom((s) => s.teams);
  const roomPlayers = useHostRoom((s) => s.roomPlayers);
  const playingXis = useHostRoom((s) => s.playingXis);
  const refreshRoom = useHostRoom((s) => s.refreshRoom);
  const showToast = useToastStore((s) => s.showToast);

  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingAction, setPendingAction] = useState<PendingControlAction>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedTeamIds, setExpandedTeamIds] = useState<Record<string, boolean>>({});

  const roomId = room?.id;

  const fetchLeaderboard = useCallback(
    async (silent = false) => {
      if (!supabase || !roomId) return;
      if (!silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      try {
        const { data, error: rpcErr } = await supabase.rpc('get_leaderboard', {
          p_room: roomId,
        });

        if (rpcErr) {
          throw new Error(rpcErr.message || 'Unable to fetch leaderboard.');
        }

        const parsed = Array.isArray(data) ? (data as LeaderboardRow[]) : [];
        parsed.sort((a, b) => a.pos - b.pos);
        setRows(parsed);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Unable to fetch leaderboard.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [roomId],
  );

  useEffect(() => {
    if (!roomId) return;
    void fetchLeaderboard(false);

    const intervalId = window.setInterval(() => {
      void fetchLeaderboard(true);
    }, 10_000);

    return () => window.clearInterval(intervalId);
  }, [roomId, fetchLeaderboard]);

  // Refetch whenever roomPlayers changes (e.g. a player is sold or voided)
  useEffect(() => {
    if (!roomId) return;
    void fetchLeaderboard(true);
  }, [roomId, roomPlayers, fetchLeaderboard]);

  const roomPlayerById = useMemo(() => {
    const map = new Map<string, RoomPlayerWithPlayer>();
    for (const rp of roomPlayers) {
      map.set(rp.id, rp);
    }
    return map;
  }, [roomPlayers]);

  const xiByTeamId = useMemo(() => {
    const map = new Map<string, (typeof playingXis)[number]>();
    for (const xi of playingXis) {
      map.set(xi.team_id, xi);
    }
    return map;
  }, [playingXis]);

  const validityByTeamId = useMemo(() => {
    const map = new Map<string, { valid: boolean; failedLabels: string[] }>();
    if (!room) return map;
    for (const team of teams) {
      const squad = toSquadPlayers(roomPlayers, team.id);
      const valid = isSquadValid(squad, room);
      const failedLabels = squadChecks(squad, room)
        .filter((c) => !c.ok)
        .map((c) => c.label);
      map.set(team.id, { valid, failedLabels });
    }
    return map;
  }, [room, teams, roomPlayers]);

  const topScore = useMemo(() => {
    if (rows.length === 0) return 0;
    return Math.max(...rows.map((r) => Number(r.score) || 0), 0);
  }, [rows]);

  const savedTeamsCount = useMemo(() => {
    let count = 0;
    for (const team of teams) {
      const xi = xiByTeamId.get(team.id);
      if (xi && xi.room_player_ids.length > 0) {
        count += 1;
      }
    }
    return count;
  }, [teams, xiByTeamId]);

  if (!room) return null;

  const isXiLocked = Boolean(room.xi_locked);
  const projectorMode: ProjectorMode = room.projector_mode ?? 'auction';
  const xiOverseasLimit = room.xi_overseas_max ?? room.overseas_max;

  const handleExportCsv = () => {
    if (rows.length === 0) {
      showToast({
        title: 'No rows to export',
        description: 'Leaderboard currently has no ranked teams.',
        tone: 'warning',
      });
      return;
    }

    const header = [
      csvCell('Rank'),
      csvCell('Team'),
      csvCell('Squad Size'),
      csvCell('Score'),
    ].join(',');

    const body = rows.map((row) =>
      [
        csvCell(row.pos),
        csvCell(row.team_name),
        csvCell(row.squad),
        csvCell(row.score),
      ].join(','),
    );

    const csvContent = `\uFEFF${[header, ...body].join('\r\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const safeRoomName = room.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const fileName = `${safeRoomName || 'ipl-auction'}-leaderboard.csv`;

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast({
      title: 'Leaderboard exported',
      description: `Downloaded ${fileName}`,
      tone: 'success',
    });
  };

  const handleConfirmAction = async () => {
    if (!supabase || !pendingAction) return;
    setActionLoading(true);

    try {
      if (pendingAction.type === 'lock_xi') {
        const { error: rpcErr } = await supabase.rpc('set_xi_locked', {
          p_room: room.id,
          p_locked: pendingAction.nextValue,
        });
        if (rpcErr) throw new Error(rpcErr.message);
        await refreshRoom();
        showToast({
          title: pendingAction.nextValue
            ? 'All playing XIs locked'
            : 'Playing XIs unlocked',
          description: pendingAction.nextValue
            ? 'Franchises can no longer modify their playing XI selections.'
            : 'Franchises can update their playing XI and captain again.',
          tone: 'success',
        });
      } else if (pendingAction.type === 'projector_mode') {
        const { error: rpcErr } = await supabase.rpc('set_projector_mode', {
          p_room: room.id,
          p_mode: pendingAction.nextMode,
        });
        if (rpcErr) throw new Error(rpcErr.message);
        await refreshRoom();
        showToast({
          title:
            pendingAction.nextMode === 'leaderboard'
              ? 'Leaderboard revealed on projector'
              : 'Projector switched back to auction',
          description:
            pendingAction.nextMode === 'leaderboard'
              ? 'Venue display is now showing final standings.'
              : 'Venue display returned to live auction mode.',
          tone: 'success',
        });
      }

      setPendingAction(null);
    } catch (err) {
      showToast({
        title: 'Action failed',
        description:
          err instanceof Error ? err.message : 'Unable to update room control.',
        tone: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const toggleTeamExpand = (teamId: string) => {
    setExpandedTeamIds((prev) => ({ ...prev, [teamId]: !prev[teamId] }));
  };

  const confirmModalCopy = (() => {
    if (!pendingAction) return null;

    if (pendingAction.type === 'lock_xi') {
      return pendingAction.nextValue
        ? {
            title: 'Lock all playing XIs',
            message:
              'Freeze playing XI submissions across all franchises? Teams will no longer be able to edit their 11 or captain.',
            confirmLabel: 'Lock playing XIs',
            tone: 'danger' as const,
          }
        : {
            title: 'Unlock all playing XIs',
            message:
              'Re-open playing XI editing so teams can adjust their lineup and captain?',
            confirmLabel: 'Unlock playing XIs',
            tone: 'cyan' as const,
          };
    }

    return pendingAction.nextMode === 'leaderboard'
      ? {
          title: 'Reveal leaderboard on projector',
          message:
            'Switch the venue projector display to leaderboard mode now?',
          confirmLabel: 'Reveal on projector',
          tone: 'gold' as const,
        }
      : {
          title: 'Switch projector back to auction',
          message:
            'Return the venue projector display from leaderboard to live auction mode?',
          confirmLabel: 'Back to auction',
          tone: 'cyan' as const,
        };
  })();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#F5B921]">
            TOURNAMENT STANDINGS // FINAL EVALUATION
          </p>
          <h1 className="mt-1.5 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
            LEADERBOARD AND FINAL RESULTS
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void fetchLeaderboard(true)}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
            />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </Button>
          <Button
            variant="gold"
            size="sm"
            disabled={rows.length === 0}
            onClick={handleExportCsv}
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export leaderboard (CSV)</span>
          </Button>
        </div>
      </div>

      {/* Visibility & Formula Notes */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-[4px] border border-[#22D3EE]/35 bg-[#0E1524] px-4 py-3.5">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#22D3EE]" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-[#E8ECF4]">
            The scoring formula is a placeholder stored in the database function{' '}
            <code className="rounded-[2px] border border-white/10 bg-[#070B14] px-1.5 py-0.5 font-mono text-[11px] text-[#22D3EE]">
              _team_score
            </code>
            . It will be replaced with the official formula.
          </p>
        </div>
        <p className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-[#F5B921]">
          The leaderboard is visible to the host and on the projector only.
        </p>
      </div>

      {/* Controls Panel */}
      <Card brackets bracketTone="gold" className="p-5">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
            RESULTS &amp; BROADCAST CONTROLS
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
            CONFIRMED ACTIONS
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 1. Lock all playing XIs */}
          <div className="flex flex-col justify-between gap-4 rounded-[4px] border border-white/[0.08] bg-[#070B14] p-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#E8ECF4]">
                  Lock all playing XIs
                </span>
                <Badge tone={isXiLocked ? 'danger' : 'neutral'}>
                  {isXiLocked ? 'LOCKED' : 'OPEN'}
                </Badge>
              </div>
              <p className="mt-1.5 text-xs text-[#8B95AA]">
                Prevents any franchise from altering their submitted playing XI or captain.
              </p>
            </div>
            <Button
              variant={isXiLocked ? 'outline' : 'gold'}
              size="sm"
              onClick={() =>
                setPendingAction({ type: 'lock_xi', nextValue: !isXiLocked })
              }
            >
              {isXiLocked ? (
                <>
                  <Unlock className="h-3.5 w-3.5" />
                  <span>Unlock playing XIs</span>
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  <span>Lock all playing XIs</span>
                </>
              )}
            </Button>
          </div>

          {/* 2. Reveal leaderboard on projector */}
          <div className="flex flex-col justify-between gap-4 rounded-[4px] border border-white/[0.08] bg-[#070B14] p-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#E8ECF4]">
                  Reveal leaderboard on projector
                </span>
                <Badge
                  tone={projectorMode === 'leaderboard' ? 'gold' : 'cyan'}
                >
                  {projectorMode.toUpperCase()}
                </Badge>
              </div>
              <p className="mt-1.5 text-xs text-[#8B95AA]">
                Switches the venue screen to final rankings or restores live auction view.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={projectorMode === 'leaderboard' ? 'outline' : 'gold'}
                size="sm"
                disabled={projectorMode === 'leaderboard'}
                onClick={() =>
                  setPendingAction({
                    type: 'projector_mode',
                    nextMode: 'leaderboard',
                  })
                }
              >
                <Monitor className="h-3.5 w-3.5" />
                <span>Reveal on projector</span>
              </Button>
              {projectorMode !== 'auction' && (
                <Button
                  variant="cyan"
                  size="sm"
                  onClick={() =>
                    setPendingAction({
                      type: 'projector_mode',
                      nextMode: 'auction',
                    })
                  }
                >
                  <span>Back to auction</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Leaderboard Table */}
      <Card brackets bracketTone="cyan" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Trophy className="h-4 w-4 text-[#F5B921]" aria-hidden="true" />
            <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              FRANCHISE RANKINGS
            </h2>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA]">
            AUTO-SYNCED EVERY 10S &amp; ON SALE
          </span>
        </div>

        {loading ? (
          <div className="p-5 space-y-3" aria-busy="true">
            {Array.from({ length: 5 }, (_, idx) => (
              <div
                key={idx}
                className="h-12 animate-pulse rounded-[3px] border border-white/[0.06] bg-[#141C2F]/60"
              />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-4">
            <AlertTriangle className="mx-auto h-7 w-7 text-red-400" />
            <div>
              <p className="font-display text-2xl tracking-wide text-[#E8ECF4]">
                UNABLE TO LOAD LEADERBOARD
              </p>
              <p className="mt-1 text-xs text-red-300">{error}</p>
            </div>
            <Button
              variant="cyan"
              size="sm"
              onClick={() => void fetchLeaderboard(false)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
              No leaderboard standings available yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.08] bg-[#070B14]/80 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                  <th className="px-5 py-3 w-20">Rank</th>
                  <th className="px-4 py-3">Franchise</th>
                  <th className="px-4 py-3 text-center">Squad Size</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-5 py-3 text-center">Valid Squad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-sm">
                {rows.map((row) => {
                  const isFirst = row.pos === 1;
                  const numericScore = Number(row.score) || 0;
                  const barPct =
                    topScore > 0
                      ? Math.max(4, Math.min(100, (numericScore / topScore) * 100))
                      : 0;
                  const validity = validityByTeamId.get(row.team_id);

                  return (
                    <tr
                      key={row.team_id}
                      className={`transition-colors hover:bg-[#141C2F]/60 ${
                        isFirst
                          ? 'bg-[#F5B921]/[0.07] border-l-2 border-l-[#F5B921]'
                          : ''
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-[3px] border font-display text-xl leading-none tabular-nums ${
                            isFirst
                              ? 'border-[#F5B921] bg-[#F5B921] text-[#070B14]'
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
                            <p
                              className={`font-medium truncate ${
                                isFirst ? 'text-[#F5B921]' : 'text-[#E8ECF4]'
                              }`}
                            >
                              {row.team_name}
                            </p>
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#8B95AA]">
                              {row.short_code}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-center font-mono text-xs text-[#E8ECF4] tabular-nums">
                        {row.squad}/{room.squad_max}
                      </td>

                      <td className="px-4 py-3.5 min-w-[220px]">
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
                              style={{ width: `${barPct}%` }}
                              className={`h-full transition-all duration-300 ${
                                isFirst ? 'bg-[#F5B921]' : 'bg-[#22D3EE]'
                              }`}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-center">
                        {validity?.valid ? (
                          <span
                            title="All squad rules satisfied"
                            className="inline-flex items-center justify-center text-emerald-400"
                          >
                            <CheckCircle2 className="h-4 w-4" aria-label="Valid squad" />
                          </span>
                        ) : (
                          <span
                            title={
                              validity?.failedLabels.length
                                ? `Missing/invalid: ${validity.failedLabels.join('; ')}`
                                : 'Squad rules incomplete'
                            }
                            className="inline-flex items-center justify-center text-red-400 cursor-help"
                          >
                            <XCircle className="h-4 w-4" aria-label="Invalid squad" />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* PLAYING XI Overview */}
      <Card brackets bracketTone="subtle" className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2.5">
            <Users className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
            <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              PLAYING XI
            </h2>
          </div>
          <span className="font-mono text-xs text-[#22D3EE] tabular-nums">
            {savedTeamsCount} of {teams.length} teams have saved an XI
          </span>
        </div>

        <div className="space-y-2.5">
          {teams.map((team) => {
            const xi = xiByTeamId.get(team.id);
            const hasSaved = Boolean(xi && xi.room_player_ids.length > 0);
            const isExpanded = Boolean(expandedTeamIds[team.id]);

            const xiPlayers = hasSaved && xi
              ? xi.room_player_ids
                  .map((id) => roomPlayerById.get(id))
                  .filter((rp): rp is RoomPlayerWithPlayer => Boolean(rp))
                  .map(roomPlayerToGroundPlayer)
                  .filter((gp): gp is NonNullable<typeof gp> => Boolean(gp))
              : [];

            const captainPlayer = xi?.captain_room_player_id
              ? roomPlayerById.get(xi.captain_room_player_id)?.players ?? null
              : null;

            const overseasInXi = xiPlayers.filter((p) => p.isOverseas).length;

            return (
              <div
                key={team.id}
                className="rounded-[4px] border border-white/[0.08] bg-[#070B14]"
              >
                <button
                  type="button"
                  disabled={!hasSaved}
                  onClick={() => toggleTeamExpand(team.id)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                    hasSaved
                      ? 'cursor-pointer hover:bg-[#141C2F]/60 focus-visible:outline-2 focus-visible:outline-[#22D3EE]'
                      : 'cursor-default opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {hasSaved ? (
                      isExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-[#22D3EE]" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#8B95AA]" />
                      )
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <TeamCrest shortCode={team.short_code} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-[#E8ECF4] truncate">
                        {team.name}
                      </p>
                      {hasSaved && xi && (
                        <p className="font-mono text-[10px] text-[#8B95AA]">
                          Saved {formatDateTime12h(xi.updated_at)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {hasSaved ? (
                      <>
                        {captainPlayer && (
                          <span className="hidden sm:inline-block font-mono text-[11px] text-[#F5B921]">
                            C: {captainPlayer.first_name} {captainPlayer.last_name}
                          </span>
                        )}
                        <Badge tone="cyan">SAVED ({xiPlayers.length}/11)</Badge>
                      </>
                    ) : (
                      <Badge tone="neutral">Not saved yet</Badge>
                    )}
                  </div>
                </button>

                {hasSaved && xi && isExpanded && (
                  <div className="border-t border-white/[0.08] bg-[#0E1524] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-[#8B95AA]">
                      <span>
                        Captain:{' '}
                        <span className="text-[#F5B921] font-semibold">
                          {captainPlayer
                            ? `${captainPlayer.first_name} ${captainPlayer.last_name}`
                            : 'Not set'}
                        </span>
                      </span>
                      <span>
                        Overseas:{' '}
                        <span
                          className={
                            overseasInXi > xiOverseasLimit
                              ? 'text-red-400 font-semibold'
                              : 'text-[#22D3EE] font-semibold'
                          }
                        >
                          {overseasInXi}/{xiOverseasLimit}
                        </span>
                      </span>
                      <span>Saved: {formatDateTime12h(xi.updated_at)}</span>
                    </div>

                    <GroundView
                      players={xiPlayers}
                      captainId={xi.captain_room_player_id}
                      accent={getTeamPalette(team.short_code).primary}
                      size="sm"
                      showEmptySlots
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Confirm Modal for Broadcast & Lock Controls */}
      {confirmModalCopy && (
        <ConfirmModal
          open={Boolean(pendingAction)}
          onClose={() => setPendingAction(null)}
          onConfirm={() => void handleConfirmAction()}
          title={confirmModalCopy.title}
          message={confirmModalCopy.message}
          confirmLabel={confirmModalCopy.confirmLabel}
          confirmTone={confirmModalCopy.tone}
          loading={actionLoading}
        />
      )}
    </div>
  );
}
