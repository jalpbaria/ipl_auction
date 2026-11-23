import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Lock,
  Plus,
  RefreshCw,
  Timer,
  Users,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConfirmModal } from '../../components/host/ConfirmModal';
import { TeamCrest } from '../../components/host/TeamCrest';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { INPUT_BASE_CLASS } from '../../components/ui/FormField';
import { Tag } from '../../components/ui/Tag';
import { getSkillInfo } from '../../data/categories';
import { useAuction } from '../../hooks/useAuction';
import { supabase } from '../../lib/supabase';
import { formatDateTime12h } from '../../lib/time';
import { useHostRoom } from '../../store/hostRoom';
import { useToastStore } from '../../store/toast';
import type {
  DbTrade,
  RoomPlayerWithPlayer,
  TradeRowStatus,
} from '../../types/database';

function formatCountdownMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatPlayerSummaryList(
  ids: readonly string[],
  rpMap: Map<string, RoomPlayerWithPlayer>,
): string {
  return ids
    .map((id) => {
      const rp = rpMap.get(id);
      const p = rp?.players;
      if (!p) return id.slice(0, 8);
      return `${p.first_name} ${p.last_name}`.trim();
    })
    .join('; ');
}

function statusChipProps(status: TradeRowStatus): {
  label: string;
  tone: 'gold' | 'cyan' | 'danger' | 'neutral';
} {
  switch (status) {
    case 'pending':
      return { label: 'PENDING', tone: 'gold' };
    case 'accepted':
      return { label: 'ACCEPTED', tone: 'cyan' };
    case 'rejected':
      return { label: 'REJECTED', tone: 'danger' };
    case 'cancelled':
      return { label: 'CANCELLED', tone: 'neutral' };
    case 'expired':
      return { label: 'EXPIRED', tone: 'neutral' };
  }
}

export default function HostTrade() {
  const { roomId } = useParams<{ roomId: string }>();
  const showToast = useToastStore((s) => s.showToast);
  const refreshHostRoom = useHostRoom((s) => s.refreshRoom);

  const {
    room,
    state,
    teams,
    roomPlayers,
    offsetMs,
    accelStatus,
    tradeStatus,
    tradeEndsAt,
    loading,
    error,
    refetch,
  } = useAuction(roomId, { role: 'host' });

  const [windowMinutes, setWindowMinutes] = useState('10');
  const [openError, setOpenError] = useState<string | null>(null);
  const [forcePrompt, setForcePrompt] = useState(false);

  const [trades, setTrades] = useState<DbTrade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesError, setTradesError] = useState<string | null>(null);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [forceConfirm, setForceConfirm] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const autoResolvedWindowRef = useRef<string | null>(null);

  const isBusy = busyAction !== null;

  // 250ms ticker while trade window is open
  useEffect(() => {
    if (tradeStatus !== 'open') return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(id);
  }, [tradeStatus]);

  const fetchTrades = useCallback(
    async (silent = true) => {
      if (!supabase || !roomId) return;
      if (!silent) setTradesLoading(true);
      try {
        const { data, error: err } = await supabase
          .from('trades')
          .select(
            'id, room_id, from_team_id, to_team_id, give_ids, get_ids, status, created_at, resolved_at',
          )
          .eq('room_id', roomId)
          .order('created_at', { ascending: false });

        if (err) {
          setTradesError(err.message);
          return;
        }
        const normalized = ((data as DbTrade[]) ?? []).map((t) => ({
          ...t,
          give_ids: Array.isArray(t.give_ids) ? t.give_ids : [],
          get_ids: Array.isArray(t.get_ids) ? t.get_ids : [],
        }));
        setTrades(normalized);
        setTradesError(null);
      } catch (err) {
        setTradesError(
          err instanceof Error ? err.message : 'Unable to load trades.',
        );
      } finally {
        if (!silent) setTradesLoading(false);
      }
    },
    [roomId],
  );

  // Realtime subscription on trades + 10s safety poll
  useEffect(() => {
    if (!roomId || !supabase) return;
    const client = supabase;

    void fetchTrades(false);

    const channel = client
      .channel(`host-trade-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void fetchTrades(true);
        },
      )
      .subscribe();

    const safetyId = window.setInterval(() => {
      void fetchTrades(true);
    }, 10_000);

    return () => {
      window.clearInterval(safetyId);
      void client.removeChannel(channel);
    };
  }, [roomId, fetchTrades]);

  // Auto-resolve trade window when server-synced countdown hits 0
  useEffect(() => {
    if (!supabase || !roomId || tradeStatus !== 'open' || !tradeEndsAt) return;
    const endMs = Date.parse(tradeEndsAt);
    if (Number.isNaN(endMs)) return;

    const remaining = endMs - (nowMs + offsetMs);
    if (remaining > 0) return;
    if (autoResolvedWindowRef.current === tradeEndsAt) return;

    autoResolvedWindowRef.current = tradeEndsAt;
    void (async () => {
      const { error: resErr } = await supabase.rpc('resolve_trade_window', {
        p_room: roomId,
      });
      if (!resErr) {
        await Promise.all([refetch(), fetchTrades(true), refreshHostRoom()]);
      }
    })();
  }, [
    roomId,
    tradeStatus,
    tradeEndsAt,
    nowMs,
    offsetMs,
    refetch,
    fetchTrades,
    refreshHostRoom,
  ]);

  // Derived data
  const teamMap = useMemo(() => {
    const map = new Map<string, (typeof teams)[number]>();
    for (const t of teams) map.set(t.id, t);
    return map;
  }, [teams]);

  const rpMap = useMemo(() => {
    const map = new Map<string, RoomPlayerWithPlayer>();
    for (const rp of roomPlayers) map.set(rp.id, rp);
    return map;
  }, [roomPlayers]);

  const activeTeams = useMemo(
    () =>
      teams
        .filter((t) => t.status === 'active')
        .sort((a, b) => a.short_code.localeCompare(b.short_code)),
    [teams],
  );

  const squadCountsByTeam = useMemo(() => {
    const map = new Map<string, number>();
    for (const rp of roomPlayers) {
      if (rp.status === 'sold' && rp.sold_to_team_id) {
        map.set(rp.sold_to_team_id, (map.get(rp.sold_to_team_id) ?? 0) + 1);
      }
    }
    return map;
  }, [roomPlayers]);

  const pendingPlayersCount = useMemo(
    () => roomPlayers.filter((rp) => rp.status === 'pending').length,
    [roomPlayers],
  );

  const regularSetsDone = pendingPlayersCount === 0;
  const accelDoneOrUnused = accelStatus === 'off' || accelStatus === 'done';
  const lotInProgress = state?.phase === 'bidding' || state?.phase === 'paused';
  const noLotInProgress = !lotInProgress;

  const squadMax = room?.squad_max ?? 25;
  const incompleteTeamsCount = useMemo(() => {
    return activeTeams.filter(
      (t) => (squadCountsByTeam.get(t.id) ?? 0) < squadMax,
    ).length;
  }, [activeTeams, squadCountsByTeam, squadMax]);

  const allSquadsFull = activeTeams.length > 0 && incompleteTeamsCount === 0;

  const windowRemainingMs = useMemo(() => {
    if (tradeStatus !== 'open' || !tradeEndsAt) return 0;
    const endMs = Date.parse(tradeEndsAt);
    if (Number.isNaN(endMs)) return 0;
    return Math.max(0, endMs - (nowMs + offsetMs));
  }, [tradeStatus, tradeEndsAt, nowMs, offsetMs]);

  const parsedMinutes = Math.max(
    1,
    Math.min(60, Math.floor(Number(windowMinutes) || 10)),
  );

  const tradeCounters = useMemo(() => {
    let accepted = 0;
    let pending = 0;
    for (const tr of trades) {
      if (tr.status === 'accepted') accepted += 1;
      else if (tr.status === 'pending') pending += 1;
    }
    return {
      total: trades.length,
      accepted,
      pending,
    };
  }, [trades]);

  // Actions
  const handleOpenTradeWindow = async (force: boolean) => {
    if (!supabase || !roomId || isBusy) return;
    setOpenError(null);
    setBusyAction(force ? 'force_open' : 'open');
    try {
      const { error: rpcErr } = await supabase.rpc('host_open_trade_window', {
        p_room: roomId,
        p_minutes: parsedMinutes,
        p_force: force,
      });

      if (rpcErr) {
        const msg = rpcErr.message || 'Unable to open trade window.';
        setOpenError(msg);
        if (!force && !allSquadsFull) {
          setForcePrompt(true);
        } else if (!force && /full|squad/i.test(msg)) {
          setForcePrompt(true);
        }
        showToast({
          title: 'Cannot open trade window',
          description: msg,
          tone: 'error',
        });
        return;
      }

      setForcePrompt(false);
      setOpenConfirm(false);
      setForceConfirm(false);
      autoResolvedWindowRef.current = null;
      await Promise.all([refetch(), fetchTrades(true), refreshHostRoom()]);
      showToast({
        title: 'Trade window open',
        description: `Teams now have ${parsedMinutes} minute${parsedMinutes === 1 ? '' : 's'} to propose and accept player swaps.`,
        tone: 'success',
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unexpected error opening trade window.';
      setOpenError(msg);
      showToast({
        title: 'Cannot open trade window',
        description: msg,
        tone: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleExtendWindow = async (minutes: number) => {
    if (!supabase || !roomId || isBusy) return;
    setBusyAction(`extend_${minutes}`);
    try {
      const { error: rpcErr } = await supabase.rpc('host_extend_trade_window', {
        p_room: roomId,
        p_minutes: minutes,
      });

      if (rpcErr) {
        showToast({
          title: 'Could not extend window',
          description: rpcErr.message,
          tone: 'error',
        });
        return;
      }

      autoResolvedWindowRef.current = null;
      await Promise.all([refetch(), refreshHostRoom()]);
      showToast({
        title: `Added ${minutes} minutes`,
        description: 'Trade window timer extended.',
        tone: 'success',
      });
    } catch (err) {
      showToast({
        title: 'Could not extend window',
        description: err instanceof Error ? err.message : 'Unexpected error.',
        tone: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCloseWindowNow = async () => {
    if (!supabase || !roomId || isBusy) return;
    setBusyAction('close');
    try {
      const { error: rpcErr } = await supabase.rpc('host_close_trade_window', {
        p_room: roomId,
      });

      if (rpcErr) {
        showToast({
          title: 'Could not close trade window',
          description: rpcErr.message,
          tone: 'error',
        });
        return;
      }

      setCloseConfirm(false);
      await Promise.all([refetch(), fetchTrades(true), refreshHostRoom()]);
      showToast({
        title: 'Trade window closed',
        description: 'All remaining pending offers have been expired.',
        tone: 'info',
      });
    } catch (err) {
      showToast({
        title: 'Could not close trade window',
        description: err instanceof Error ? err.message : 'Unexpected error.',
        tone: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportCsv = () => {
    if (trades.length === 0) return;
    const header = 'time,from,to,give_players,get_players,status';
    const lines = trades.map((tr) => {
      const fromCode = teamMap.get(tr.from_team_id)?.short_code ?? 'TEAM';
      const toCode = teamMap.get(tr.to_team_id)?.short_code ?? 'TEAM';
      const giveStr = formatPlayerSummaryList(tr.give_ids, rpMap);
      const getStr = formatPlayerSummaryList(tr.get_ids, rpMap);
      const timeStr = formatDateTime12h(tr.resolved_at ?? tr.created_at);
      return [
        escapeCsvCell(timeStr),
        escapeCsvCell(fromCode),
        escapeCsvCell(toCode),
        escapeCsvCell(giveStr),
        escapeCsvCell(getStr),
        escapeCsvCell(tr.status),
      ].join(',');
    });

    const csv = '\uFEFF' + [header, ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trade-log-${room?.name?.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || roomId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-20 animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]" />
        <div className="h-64 animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]" />
        <div className="h-80 animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <Card brackets bracketTone="gold" className="p-8">
        <Badge tone="danger">TRADE WINDOW ERROR</Badge>
        <h1 className="mt-3 font-display text-4xl tracking-wide text-[#E8ECF4]">
          UNABLE TO LOAD TRADE CONSOLE
        </h1>
        <p className="mt-2 text-sm text-red-300">
          {error || 'Room details could not be loaded.'}
        </p>
        <div className="mt-6">
          <Button variant="cyan" size="sm" onClick={() => void refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-white/[0.08] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#22D3EE]">
            POST-AUCTION // PLAYER SWAP PHASE
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl sm:text-5xl leading-none tracking-wide text-[#E8ECF4]">
              TRADE WINDOW
            </h1>
            {tradeStatus === 'open' ? (
              <Badge tone="cyan">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>OPEN</span>
              </Badge>
            ) : tradeStatus === 'closed' ? (
              <Badge tone="danger">CLOSED</Badge>
            ) : (
              <Badge tone="neutral">OFF</Badge>
            )}
          </div>
          <p className="mt-1.5 text-sm text-[#8B95AA]">
            Teams swap 1 to 3 players for the exact same count with no cash. Overseas limits are enforced on both sides and saved Playing XIs reset after any accepted swap.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void Promise.all([refetch(), fetchTrades(false)])}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>
          <Link to={`/host/${roomId}/leaderboard`}>
            <Button variant="ghost" size="sm" className="border border-white/10">
              <span>Leaderboard &amp; XI Lock</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Live Panel when OPEN */}
      {tradeStatus === 'open' && (
        <Card brackets bracketTone="cyan" className="p-6 space-y-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
                  TRADE WINDOW LIVE
                </span>
              </div>
              <p className="text-sm text-[#8B95AA]">
                Teams can propose, accept, reject, or cancel player-for-player swaps until the countdown ends.
              </p>
            </div>

            <div className="rounded-[4px] border border-[#22D3EE]/50 bg-[#070B14] px-6 py-4 text-center shrink-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#22D3EE]">
                TIME REMAINING
              </p>
              <p className="mt-1 font-display text-6xl leading-none tracking-wide text-[#F5B921] tabular-nums">
                {formatCountdownMs(windowRemainingMs)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => void handleExtendWindow(2)}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add 2 minutes</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => void handleExtendWindow(5)}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add 5 minutes</span>
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => setCloseConfirm(true)}
              className="border-red-500/60 text-red-300 hover:border-red-400 hover:bg-red-500/15 hover:text-red-200"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Close trade window now</span>
            </Button>
          </div>
        </Card>
      )}

      {/* Closed Summary Banner */}
      {tradeStatus === 'closed' && (
        <Card brackets bracketTone="gold" className="p-6 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Badge tone="gold">TRADE WINDOW CLOSED</Badge>
              <h2 className="mt-2 font-display text-3xl tracking-wide text-[#E8ECF4]">
                TRADING CONCLUDED · {tradeCounters.accepted} ACCEPTED{' '}
                {tradeCounters.accepted === 1 ? 'TRADE' : 'TRADES'}
              </h2>
              <p className="mt-1 font-mono text-xs text-[#22D3EE]">
                Next: players rebuild their playing XI, then lock the XIs
              </p>
            </div>

            <Link to={`/host/${roomId}/leaderboard`} className="shrink-0">
              <Button variant="gold" size="sm">
                <span>Go to XI Lock</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Readiness & Open Panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Readiness Panel (7 cols) */}
        <Card brackets bracketTone="subtle" className="p-6 space-y-5 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#22D3EE]" />
              <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
                ROOM READINESS
              </h2>
            </div>
            <Tag accent={allSquadsFull ? 'cyan' : 'gold'}>
              {allSquadsFull
                ? 'All squads full'
                : `${incompleteTeamsCount} ${incompleteTeamsCount === 1 ? 'squad is' : 'squads are'} not full`}
            </Tag>
          </div>

          {/* Checklist */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div
              className={`flex items-center gap-2.5 rounded-[4px] border px-3.5 py-2.5 font-mono text-xs ${
                regularSetsDone
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-[#E8ECF4]'
                  : 'border-red-500/35 bg-red-500/10 text-red-200'
              }`}
            >
              {regularSetsDone ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-red-400" />
              )}
              <span className="leading-snug">
                Regular sets finished{' '}
                {!regularSetsDone && `(${pendingPlayersCount} pending)`}
              </span>
            </div>

            <div
              className={`flex items-center gap-2.5 rounded-[4px] border px-3.5 py-2.5 font-mono text-xs ${
                accelDoneOrUnused
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-[#E8ECF4]'
                  : 'border-red-500/35 bg-red-500/10 text-red-200'
              }`}
            >
              {accelDoneOrUnused ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-red-400" />
              )}
              <span className="leading-snug">
                Accelerated round done or not used
              </span>
            </div>

            <div
              className={`flex items-center gap-2.5 rounded-[4px] border px-3.5 py-2.5 font-mono text-xs ${
                noLotInProgress
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-[#E8ECF4]'
                  : 'border-red-500/35 bg-red-500/10 text-red-200'
              }`}
            >
              {noLotInProgress ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-red-400" />
              )}
              <span className="leading-snug">No lot in progress</span>
            </div>
          </div>

          {/* Active Teams Squad Table */}
          <div className="overflow-x-auto rounded-[4px] border border-white/[0.08] bg-[#070B14]">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                  <th className="px-4 py-2.5">Franchise</th>
                  <th className="px-4 py-2.5 text-right">Squad Count</th>
                  <th className="px-4 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {activeTeams.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-6 text-center text-[#8B95AA]"
                    >
                      No active teams in this room yet.
                    </td>
                  </tr>
                ) : (
                  activeTeams.map((team) => {
                    const count = squadCountsByTeam.get(team.id) ?? 0;
                    const isFull = count >= squadMax;
                    return (
                      <tr key={team.id} className="hover:bg-[#0E1524]/70">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <TeamCrest shortCode={team.short_code} size="sm" />
                            <div className="min-w-0">
                              <p className="font-sans text-xs font-semibold text-[#E8ECF4]">
                                {team.name}
                              </p>
                              <p className="text-[10px] text-[#8B95AA]">
                                {team.short_code}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-bold tabular-nums ${
                            isFull ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {count} / {squadMax}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span
                            className={`inline-flex items-center rounded-[2px] border px-2 py-0.5 text-[10px] font-bold uppercase ${
                              isFull
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                : 'border-red-500/40 bg-red-500/10 text-red-300'
                            }`}
                          >
                            {isFull ? 'FULL' : `SHORT ${squadMax - count}`}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Open / Controls Panel (5 cols) */}
        <Card brackets bracketTone="gold" className="p-6 space-y-5 lg:col-span-5">
          <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
            <Timer className="h-4 w-4 text-[#F5B921]" />
            <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              {tradeStatus === 'open' ? 'WINDOW SUMMARY' : 'OPEN TRADE WINDOW'}
            </h2>
          </div>

          {tradeStatus === 'open' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-[4px] border border-white/[0.08] bg-[#070B14] p-3.5 text-center">
                  <p className="font-display text-3xl text-[#E8ECF4] tabular-nums">
                    {tradeCounters.total}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                    OFFERS MADE
                  </p>
                </div>
                <div className="rounded-[4px] border border-emerald-500/30 bg-[#070B14] p-3.5 text-center">
                  <p className="font-display text-3xl text-emerald-400 tabular-nums">
                    {tradeCounters.accepted}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                    ACCEPTED
                  </p>
                </div>
                <div className="rounded-[4px] border border-[#F5B921]/30 bg-[#070B14] p-3.5 text-center">
                  <p className="font-display text-3xl text-[#F5B921] tabular-nums">
                    {tradeCounters.pending}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                    PENDING
                  </p>
                </div>
              </div>

              <div className="rounded-[4px] border border-white/[0.08] bg-[#070B14] p-4 font-mono text-xs text-[#8B95AA] leading-relaxed">
                The host monitors all room swaps in real time below. Teams settle trades directly with each other; overseas limits and equal-count checks are enforced server-side.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="trade-window-minutes"
                  className="block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8B95AA]"
                >
                  Window length (minutes)
                </label>
                <input
                  id="trade-window-minutes"
                  type="number"
                  min={1}
                  max={60}
                  value={windowMinutes}
                  onChange={(e) => setWindowMinutes(e.target.value)}
                  className={`${INPUT_BASE_CLASS} mt-2`}
                />
                <p className="mt-1.5 font-mono text-[11px] text-[#8B95AA]">
                  Recommended: 10 minutes (1 to 60 minutes).
                </p>
              </div>

              {openError && (
                <div
                  role="alert"
                  className="rounded-[4px] border border-red-500/45 bg-red-500/10 p-3.5 text-xs text-red-200 space-y-2.5"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                    <span>{openError}</span>
                  </div>

                  {forcePrompt && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => setForceConfirm(true)}
                      className="border-[#F5B921]/60 text-[#F5B921] hover:bg-[#F5B921] hover:text-[#070B14]"
                    >
                      <span>Open anyway</span>
                    </Button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  variant="gold"
                  size="md"
                  disabled={isBusy}
                  onClick={() => {
                    setOpenError(null);
                    setForcePrompt(false);
                    setOpenConfirm(true);
                  }}
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  <span>
                    {tradeStatus === 'closed'
                      ? 'Reopen trade window'
                      : 'Open trade window'}
                  </span>
                </Button>

                {!allSquadsFull && !forcePrompt && (
                  <Button
                    variant="outline"
                    size="md"
                    disabled={isBusy}
                    onClick={() => setForceConfirm(true)}
                  >
                    <span>Open anyway</span>
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Trade Log */}
      <Card brackets bracketTone="subtle" className="p-6 space-y-5">
        <div className="flex flex-col gap-3 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              TRADE LOG
            </h2>
            <p className="mt-0.5 font-mono text-xs text-[#8B95AA] tabular-nums">
              {tradeCounters.total} offers made · {tradeCounters.accepted} accepted ·{' '}
              {tradeCounters.pending} pending
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={trades.length === 0}
            onClick={handleExportCsv}
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </Button>
        </div>

        {tradesError && (
          <div className="rounded-[4px] border border-red-500/40 bg-red-500/10 p-3 font-mono text-xs text-red-200">
            {tradesError}
          </div>
        )}

        {tradesLoading && trades.length === 0 ? (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }, (_, idx) => (
              <div
                key={idx}
                className="h-20 animate-pulse rounded-[4px] border border-white/[0.08] bg-[#070B14]"
              />
            ))}
          </div>
        ) : trades.length === 0 ? (
          <div className="rounded-[4px] border border-dashed border-white/15 bg-[#070B14] py-12 text-center">
            <ArrowLeftRight className="mx-auto h-7 w-7 text-[#8B95AA]" />
            <p className="mt-3 font-display text-2xl tracking-wide text-[#E8ECF4]">
              NO TRADES YET
            </p>
            <p className="mt-1 font-mono text-xs text-[#8B95AA]">
              Trade proposals between franchises will appear here live.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {trades.map((tr) => {
              const fromTeam = teamMap.get(tr.from_team_id);
              const toTeam = teamMap.get(tr.to_team_id);
              const chip = statusChipProps(tr.status);

              return (
                <div
                  key={tr.id}
                  className="rounded-[4px] border border-white/[0.08] bg-[#070B14] p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      {fromTeam && (
                        <TeamCrest shortCode={fromTeam.short_code} size="sm" />
                      )}
                      <span className="font-mono text-xs font-bold text-[#E8ECF4]">
                        {fromTeam?.short_code ?? 'FROM'}
                      </span>
                      <ArrowLeftRight className="h-3.5 w-3.5 text-[#22D3EE]" />
                      {toTeam && (
                        <TeamCrest shortCode={toTeam.short_code} size="sm" />
                      )}
                      <span className="font-mono text-xs font-bold text-[#E8ECF4]">
                        {toTeam?.short_code ?? 'TO'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#8B95AA]">
                        <Clock className="h-3 w-3" />
                        <span>{formatDateTime12h(tr.resolved_at ?? tr.created_at)}</span>
                      </span>
                      <Badge tone={chip.tone}>{chip.label}</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-[3px] border border-white/[0.06] bg-[#0E1524] p-3">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8B95AA]">
                        {fromTeam?.short_code ?? 'FROM'} GIVES ({tr.give_ids.length})
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {tr.give_ids.map((rpId) => {
                          const rp = rpMap.get(rpId);
                          const p = rp?.players;
                          const skill = getSkillInfo(p?.skill);
                          return (
                            <li
                              key={rpId}
                              className="flex flex-wrap items-center justify-between gap-2 text-xs"
                            >
                              <span className="font-medium text-[#E8ECF4]">
                                {p
                                  ? `${p.first_name} ${p.last_name}`.trim()
                                  : rpId.slice(0, 8)}
                              </span>
                              <span className="flex items-center gap-1.5">
                                {skill && (
                                  <span
                                    className={`inline-flex items-center rounded-[2px] border px-1.5 py-0.5 font-mono text-[9px] uppercase ${skill.chipClass}`}
                                  >
                                    {skill.value}
                                  </span>
                                )}
                                {p?.is_overseas && <Tag accent="gold">OS</Tag>}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    <div className="rounded-[3px] border border-white/[0.06] bg-[#0E1524] p-3">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8B95AA]">
                        {toTeam?.short_code ?? 'TO'} GIVES ({tr.get_ids.length})
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {tr.get_ids.map((rpId) => {
                          const rp = rpMap.get(rpId);
                          const p = rp?.players;
                          const skill = getSkillInfo(p?.skill);
                          return (
                            <li
                              key={rpId}
                              className="flex flex-wrap items-center justify-between gap-2 text-xs"
                            >
                              <span className="font-medium text-[#E8ECF4]">
                                {p
                                  ? `${p.first_name} ${p.last_name}`.trim()
                                  : rpId.slice(0, 8)}
                              </span>
                              <span className="flex items-center gap-1.5">
                                {skill && (
                                  <span
                                    className={`inline-flex items-center rounded-[2px] border px-1.5 py-0.5 font-mono text-[9px] uppercase ${skill.chipClass}`}
                                  >
                                    {skill.value}
                                  </span>
                                )}
                                {p?.is_overseas && <Tag accent="gold">OS</Tag>}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modals */}
      <ConfirmModal
        open={openConfirm}
        onClose={() => setOpenConfirm(false)}
        onConfirm={() => void handleOpenTradeWindow(false)}
        title="OPEN TRADE WINDOW?"
        eyebrow="TRADE WINDOW"
        message={`Open the player trade window for ${parsedMinutes} minute${parsedMinutes === 1 ? '' : 's'}? Active teams will be able to propose 1-for-1 up to 3-for-3 player swaps.`}
        confirmLabel="Open window"
        confirmTone="gold"
        loading={busyAction === 'open'}
      />

      <ConfirmModal
        open={forceConfirm}
        onClose={() => setForceConfirm(false)}
        onConfirm={() => void handleOpenTradeWindow(true)}
        title="FORCE OPEN TRADE WINDOW?"
        eyebrow="INCOMPLETE SQUADS"
        message={`${incompleteTeamsCount} ${incompleteTeamsCount === 1 ? 'squad is' : 'squads are'} not full (${squadMax} players). Force open the trade window anyway?`}
        confirmLabel="Open anyway"
        confirmTone="gold"
        loading={busyAction === 'force_open'}
      />

      <ConfirmModal
        open={closeConfirm}
        onClose={() => setCloseConfirm(false)}
        onConfirm={() => void handleCloseWindowNow()}
        title="CLOSE TRADE WINDOW NOW?"
        eyebrow="END TRADING"
        message="This will immediately close the trade window and expire any pending trade offers that have not been accepted."
        confirmLabel="Close window"
        confirmTone="danger"
        loading={busyAction === 'close'}
      />
    </div>
  );
}
