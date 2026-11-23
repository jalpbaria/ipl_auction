import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Gavel,
  Play,
  RefreshCw,
  Timer,
  Users,
  XCircle,
  Zap,
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
import { useAuction } from '../../hooks/useAuction';
import { formatLakhs } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useHostRoom } from '../../store/hostRoom';
import { useToastStore } from '../../store/toast';
import type {
  AccelStatus,
  DbAccelPick,
  DbAccelQueueItem,
} from '../../types/database';

const STEPS: readonly { key: AccelStatus; label: string }[] = [
  { key: 'off', label: 'OFF' },
  { key: 'selecting', label: 'SELECTING' },
  { key: 'live', label: 'LIVE' },
  { key: 'done', label: 'DONE' },
];

function formatCountdownMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function HostAccelerated() {
  const { roomId } = useParams<{ roomId: string }>();
  const showToast = useToastStore((s) => s.showToast);
  const refreshHostRoom = useHostRoom((s) => s.refreshRoom);

  const {
    room,
    state,
    lot,
    teams,
    roomPlayers,
    offsetMs,
    accelStatus,
    accelSelectionEndsAt,
    accelProgress,
    refetchAccelProgress,
    loading,
    error,
    refetch,
  } = useAuction(roomId, { role: 'host' });

  const [windowMinutes, setWindowMinutes] = useState('3');
  const [picksPerTeam, setPicksPerTeam] = useState('5');
  const [openError, setOpenError] = useState<string | null>(null);

  const [picks, setPicks] = useState<DbAccelPick[]>([]);
  const [picksLoading, setPicksLoading] = useState(false);
  const [picksError, setPicksError] = useState<string | null>(null);

  const [queueItems, setQueueItems] = useState<DbAccelQueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [finishConfirm, setFinishConfirm] = useState(false);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const autoResolvedWindowRef = useRef<string | null>(null);

  const lotInProgress = state?.phase === 'bidding' || state?.phase === 'paused';
  const isBusy = busyAction !== null;

  // 200ms ticker during selecting window
  useEffect(() => {
    if (accelStatus !== 'selecting') return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 200);
    return () => window.clearInterval(id);
  }, [accelStatus]);

  const fetchPicks = useCallback(
    async (silent = true) => {
      if (!supabase || !roomId) return;
      if (!silent) setPicksLoading(true);
      try {
        const { data, error: err } = await supabase
          .from('accel_picks')
          .select('id, room_id, team_id, room_player_id, created_at')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true });

        if (err) {
          setPicksError(err.message);
          return;
        }
        setPicks((data as DbAccelPick[]) ?? []);
        setPicksError(null);
      } catch (err) {
        setPicksError(
          err instanceof Error ? err.message : 'Unable to load team picks.',
        );
      } finally {
        setPicksLoading(false);
      }
    },
    [roomId],
  );

  const fetchQueue = useCallback(
    async (silent = true) => {
      if (!supabase || !roomId) return;
      if (!silent) setQueueLoading(true);
      try {
        const { data, error: err } = await supabase
          .from('accel_queue')
          .select('room_player_id, room_id, picks, position, done')
          .eq('room_id', roomId)
          .order('position', { ascending: true });

        if (err) {
          setQueueError(err.message);
          return;
        }
        setQueueItems((data as DbAccelQueueItem[]) ?? []);
        setQueueError(null);
      } catch (err) {
        setQueueError(
          err instanceof Error
            ? err.message
            : 'Unable to load accelerated queue.',
        );
      } finally {
        setQueueLoading(false);
      }
    },
    [roomId],
  );

  // Realtime + 5s polling for accel_picks while selecting
  useEffect(() => {
    if (!supabase || !roomId || accelStatus !== 'selecting') return;
    void fetchPicks(false);

    const client = supabase;
    const channel = client
      .channel(`host-accel-picks-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'accel_picks',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void fetchPicks(true);
          void refetchAccelProgress();
        },
      )
      .subscribe();

    const pollId = window.setInterval(() => {
      void fetchPicks(true);
      void refetchAccelProgress();
    }, 5_000);

    return () => {
      window.clearInterval(pollId);
      void client.removeChannel(channel);
    };
  }, [roomId, accelStatus, fetchPicks, refetchAccelProgress]);

  // Realtime + polling for accel_queue while live or done
  useEffect(() => {
    if (!supabase || !roomId || (accelStatus !== 'live' && accelStatus !== 'done')) {
      return;
    }
    void fetchQueue(false);

    const client = supabase;
    const channel = client
      .channel(`host-accel-queue-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'accel_queue',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void fetchQueue(true);
          void refetchAccelProgress();
        },
      )
      .subscribe();

    const pollId =
      accelStatus === 'live'
        ? window.setInterval(() => {
            void fetchQueue(true);
          }, 5_000)
        : null;

    return () => {
      if (pollId !== null) window.clearInterval(pollId);
      void client.removeChannel(channel);
    };
  }, [roomId, accelStatus, fetchQueue, refetchAccelProgress]);

  // Refetch queue when lot/phase changes while live
  useEffect(() => {
    if (accelStatus === 'live' || accelStatus === 'done') {
      void fetchQueue(true);
    }
  }, [accelStatus, state?.current_room_player_id, state?.phase, fetchQueue]);

  // Countdown remaining ms during selecting
  const selectionRemainingMs = useMemo(() => {
    if (accelStatus !== 'selecting' || !accelSelectionEndsAt) return null;
    const endMs = Date.parse(accelSelectionEndsAt);
    if (Number.isNaN(endMs)) return null;
    return Math.max(0, endMs - (nowMs + offsetMs));
  }, [accelStatus, accelSelectionEndsAt, nowMs, offsetMs]);

  // Auto-resolve once when selection timer reaches 0
  useEffect(() => {
    if (
      !supabase ||
      !roomId ||
      accelStatus !== 'selecting' ||
      !accelSelectionEndsAt ||
      selectionRemainingMs === null ||
      selectionRemainingMs > 0
    ) {
      return;
    }

    if (autoResolvedWindowRef.current === accelSelectionEndsAt) return;
    autoResolvedWindowRef.current = accelSelectionEndsAt;

    const client = supabase;
    void (async () => {
      const { error: rpcErr } = await client.rpc('resolve_accel_selection', {
        p_room: roomId,
      });
      if (rpcErr) {
        showToast({
          title: 'Could not resolve selection window',
          description: rpcErr.message,
          tone: 'error',
        });
      }
      await Promise.all([refetch(), refreshHostRoom(), fetchQueue(true)]);
    })();
  }, [
    roomId,
    accelStatus,
    accelSelectionEndsAt,
    selectionRemainingMs,
    refetch,
    refreshHostRoom,
    fetchQueue,
    showToast,
  ]);

  const activeTeams = useMemo(
    () => teams.filter((t) => t.status === 'active'),
    [teams],
  );

  const teamMap = useMemo(() => {
    const map = new Map<string, (typeof teams)[number]>();
    for (const t of teams) map.set(t.id, t);
    return map;
  }, [teams]);

  const roomPlayerMap = useMemo(() => {
    const map = new Map<string, (typeof roomPlayers)[number]>();
    for (const rp of roomPlayers) map.set(rp.id, rp);
    return map;
  }, [roomPlayers]);

  const squadCountByTeam = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of teams) map.set(t.id, 0);
    for (const rp of roomPlayers) {
      if (rp.status === 'sold' && rp.sold_to_team_id) {
        map.set(rp.sold_to_team_id, (map.get(rp.sold_to_team_id) ?? 0) + 1);
      }
    }
    return map;
  }, [teams, roomPlayers]);

  const unsoldTotal = useMemo(() => {
    if (accelProgress) return accelProgress.unsold_total;
    return roomPlayers.filter((rp) => rp.status === 'unsold').length;
  }, [accelProgress, roomPlayers]);

  const picksLimit = room?.accel_picks_per_team ?? accelProgress?.picks_limit ?? 5;

  // Panel C: By Team & By Player aggregations
  const picksByTeam = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const p of picks) {
      countMap.set(p.team_id, (countMap.get(p.team_id) ?? 0) + 1);
    }
    return activeTeams.map((team) => ({
      team,
      picksUsed: countMap.get(team.id) ?? 0,
      squadCount: squadCountByTeam.get(team.id) ?? 0,
    }));
  }, [activeTeams, picks, squadCountByTeam]);

  const picksByPlayer = useMemo(() => {
    const grouped = new Map<string, { teamIds: string[] }>();
    for (const p of picks) {
      const entry = grouped.get(p.room_player_id) ?? { teamIds: [] };
      if (!entry.teamIds.includes(p.team_id)) {
        entry.teamIds.push(p.team_id);
      }
      grouped.set(p.room_player_id, entry);
    }

    const rows: {
      roomPlayerId: string;
      rp: (typeof roomPlayers)[number];
      teamIds: string[];
      count: number;
    }[] = [];

    for (const [rpId, info] of grouped.entries()) {
      const rp = roomPlayerMap.get(rpId);
      if (!rp) continue;
      rows.push({
        roomPlayerId: rpId,
        rp,
        teamIds: info.teamIds,
        count: info.teamIds.length,
      });
    }

    rows.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.rp.sort_order - b.rp.sort_order;
    });

    return rows;
  }, [picks, roomPlayerMap]);

  // Queue & Done metrics
  const queueStats = useMemo(() => {
    const total =
      queueItems.length > 0 ? queueItems.length : accelProgress?.queue_total ?? 0;
    const doneCount =
      queueItems.length > 0
        ? queueItems.filter((q) => q.done).length
        : Math.max(0, total - (accelProgress?.queue_remaining ?? 0));
    const remaining =
      queueItems.length > 0
        ? Math.max(0, queueItems.length - doneCount)
        : accelProgress?.queue_remaining ?? 0;

    let roundSold = 0;
    let roundSpent = 0;
    let roundUnsold = 0;

    for (const q of queueItems) {
      const rp = roomPlayerMap.get(q.room_player_id);
      if (rp?.status === 'sold') {
        roundSold += 1;
        roundSpent += rp.sold_price_lakhs ?? 0;
      } else {
        roundUnsold += 1;
      }
    }

    return {
      total,
      doneCount,
      remaining,
      roundSold,
      roundSpent,
      roundUnsold,
    };
  }, [queueItems, accelProgress, roomPlayerMap]);

  const canStartAccelLot =
    accelStatus === 'live' &&
    Boolean(room?.auction_open) &&
    !lotInProgress &&
    !isBusy &&
    queueStats.remaining > 0;

  const handleOpenSelection = async () => {
    if (!supabase || !room) return;
    const minutesNum = Math.round(Number(windowMinutes));
    const picksNum = Math.round(Number(picksPerTeam));

    if (!Number.isFinite(minutesNum) || minutesNum < 1 || minutesNum > 30) {
      setOpenError('Selection window must be between 1 and 30 minutes.');
      setOpenConfirm(false);
      return;
    }
    if (!Number.isFinite(picksNum) || picksNum < 1 || picksNum > 30) {
      setOpenError('Picks per team must be between 1 and 30.');
      setOpenConfirm(false);
      return;
    }

    setBusyAction('open');
    setOpenError(null);
    try {
      const { error: rpcErr } = await supabase.rpc('host_open_accel_selection', {
        p_room: room.id,
        p_minutes: minutesNum,
        p_picks: picksNum,
      });
      if (rpcErr) {
        setOpenError(rpcErr.message);
        showToast({
          title: 'Cannot open selection window',
          description: rpcErr.message,
          tone: 'error',
        });
        setOpenConfirm(false);
        return;
      }
      setOpenConfirm(false);
      showToast({
        title: 'Accelerated selection opened',
        description: `Teams have ${minutesNum}m to pick up to ${picksNum} unsold players.`,
        tone: 'success',
      });
      await Promise.all([refetch(), refreshHostRoom()]);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unable to open selection window.';
      setOpenError(msg);
      showToast({
        title: 'Cannot open selection window',
        description: msg,
        tone: 'error',
      });
      setOpenConfirm(false);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCloseSelectionNow = async () => {
    if (!supabase || !room) return;
    setBusyAction('close');
    try {
      const { data, error: rpcErr } = await supabase.rpc(
        'host_close_accel_selection',
        { p_room: room.id },
      );
      if (rpcErr) {
        showToast({
          title: 'Could not close selection',
          description: rpcErr.message,
          tone: 'error',
        });
        return;
      }
      setCloseConfirm(false);
      const qCount = typeof data === 'number' ? data : Number(data ?? 0);
      showToast({
        title: 'Selection closed',
        description: Number.isFinite(qCount)
          ? `${qCount} ${qCount === 1 ? 'player' : 'players'} entered the accelerated queue.`
          : 'Accelerated queue built.',
        tone: 'success',
      });
      await Promise.all([refetch(), refreshHostRoom(), fetchQueue(true)]);
    } catch (err) {
      showToast({
        title: 'Could not close selection',
        description:
          err instanceof Error ? err.message : 'Unexpected network error.',
        tone: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleStartNextAccelLot = useCallback(async () => {
    if (!supabase || !room || !canStartAccelLot) return;
    setBusyAction('start-lot');
    try {
      const { error: rpcErr } = await supabase.rpc('host_start_accel_lot', {
        p_room: room.id,
      });
      if (rpcErr) {
        showToast({
          title: 'Could not start accelerated lot',
          description: rpcErr.message,
          tone: 'error',
        });
        return;
      }
      await Promise.all([refetch(), fetchQueue(true)]);
    } catch (err) {
      showToast({
        title: 'Could not start accelerated lot',
        description:
          err instanceof Error ? err.message : 'Unexpected network error.',
        tone: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  }, [room, canStartAccelLot, refetch, fetchQueue, showToast]);

  const handleFinishAccel = async () => {
    if (!supabase || !room) return;
    setBusyAction('finish');
    try {
      const { error: rpcErr } = await supabase.rpc('host_finish_accel', {
        p_room: room.id,
      });
      if (rpcErr) {
        showToast({
          title: 'Could not finish accelerated round',
          description: rpcErr.message,
          tone: 'error',
        });
        return;
      }
      setFinishConfirm(false);
      showToast({
        title: 'Accelerated round finished',
        description: 'Round summary is now finalized.',
        tone: 'success',
      });
      await Promise.all([refetch(), refreshHostRoom(), fetchQueue(true)]);
    } catch (err) {
      showToast({
        title: 'Could not finish accelerated round',
        description:
          err instanceof Error ? err.message : 'Unexpected network error.',
        tone: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  // Enter key triggers Start next accelerated lot when idle in live queue
  useEffect(() => {
    const anyModal = openConfirm || closeConfirm || finishConfirm;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || anyModal) return;
      if (event.key !== 'Enter') return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'SELECT' ||
        tag === 'TEXTAREA' ||
        tag === 'BUTTON' ||
        tag === 'A' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (canStartAccelLot) {
        event.preventDefault();
        void handleStartNextAccelLot();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    openConfirm,
    closeConfirm,
    finishConfirm,
    canStartAccelLot,
    handleStartNextAccelLot,
  ]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-28 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]" />
        <div className="h-44 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]" />
        <div className="h-72 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <Card brackets bracketTone="gold" className="p-8">
        <Badge tone="danger">ACCELERATED ROUND ERROR</Badge>
        <h1 className="mt-3 font-display text-4xl tracking-wide text-[#E8ECF4]">
          UNABLE TO LOAD ACCELERATED ROUND
        </h1>
        <p className="mt-2 text-sm text-red-300">
          {error || 'Room data could not be loaded.'}
        </p>
        <div className="mt-6">
          <Button variant="cyan" size="md" onClick={() => void refetch()}>
            <RefreshCw className="h-4 w-4" />
            <span>Retry</span>
          </Button>
        </div>
      </Card>
    );
  }

  const canOpenSelection =
    (accelStatus === 'off' || accelStatus === 'done') && !lotInProgress;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#22D3EE]">
            SECOND-CHANCE POOL // UNSOLD NOMINATIONS
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
              ACCELERATED ROUND
            </h1>
            {accelStatus === 'live' && (
              <Badge tone="danger">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 motion-safe:animate-pulse" />
                <span>LIVE</span>
              </Badge>
            )}
            {accelStatus === 'selecting' && (
              <Badge tone="gold">SELECTING</Badge>
            )}
            {accelStatus === 'done' && (
              <Badge tone="cyan">DONE</Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link to={`/host/${room.id}/auction`}>
            <Button variant="outline" size="sm">
              <Gavel className="h-3.5 w-3.5" />
              <span>Auction Control</span>
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => {
              void refetch();
              void fetchPicks(true);
              void fetchQueue(true);
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* PANEL A: STATUS STEP BAR & LIVE COUNTS */}
      <Card brackets bracketTone="cyan" className="p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#F5B921]" aria-hidden="true" />
            <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              ROUND STATUS
            </h2>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#8B95AA]">
            PHASE PROGRESSION
          </span>
        </div>

        {/* 4-Step Progress Bar */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STEPS.map((step, idx) => {
            const isCurrent = accelStatus === step.key;
            const currentIdx = STEPS.findIndex((s) => s.key === accelStatus);
            const isPassed = idx < currentIdx;

            const activeClass =
              step.key === 'selecting'
                ? 'border-[#F5B921] bg-[#F5B921]/15 text-[#F5B921]'
                : step.key === 'live'
                  ? 'border-red-500 bg-red-500/15 text-red-300'
                  : step.key === 'done'
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                    : 'border-[#22D3EE] bg-[#22D3EE]/15 text-[#22D3EE]';

            return (
              <div
                key={step.key}
                className={`flex items-center justify-between rounded-[4px] border px-3.5 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.12em] transition-colors ${
                  isCurrent
                    ? activeClass
                    : isPassed
                      ? 'border-white/15 bg-[#141C2F] text-[#E8ECF4]'
                      : 'border-white/[0.08] bg-[#070B14] text-[#8B95AA]'
                }`}
              >
                <span>
                  0{idx + 1}. {step.label}
                </span>
                {isCurrent && (
                  <span className="h-2 w-2 rounded-full bg-current" />
                )}
              </div>
            );
          })}
        </div>

        {/* Live Counts */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-[4px] border border-white/[0.08] bg-[#070B14] px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
              UNSOLD PLAYERS
            </p>
            <p className="mt-1 font-display text-4xl leading-none text-[#F5B921] tabular-nums">
              {unsoldTotal}
            </p>
          </div>
          <div className="rounded-[4px] border border-white/[0.08] bg-[#070B14] px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
              QUEUE SIZE
            </p>
            <p className="mt-1 font-display text-4xl leading-none text-[#22D3EE] tabular-nums">
              {queueStats.total}
            </p>
          </div>
          <div className="rounded-[4px] border border-white/[0.08] bg-[#070B14] px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
              REMAINING IN QUEUE
            </p>
            <p className="mt-1 font-display text-4xl leading-none text-[#E8ECF4] tabular-nums">
              {queueStats.remaining}
            </p>
          </div>
        </div>
      </Card>

      {/* PANEL B: OPEN SELECTION (only when status is 'off' or 'done' and no lot is live) */}
      {canOpenSelection && (
        <Card brackets bracketTone="gold" className="p-5 sm:p-6 space-y-5">
          <div className="border-b border-white/[0.08] pb-3">
            <h2 className="font-display text-2xl tracking-wide text-[#F5B921]">
              OPEN SELECTION WINDOW
            </h2>
            <p className="mt-1 text-xs text-[#8B95AA]">
              Once all regular sets have finished, let active teams with open squad slots nominate unsold players to return to the block.
            </p>
          </div>

          {openError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-[4px] border border-red-500/45 bg-red-500/10 px-4 py-3 text-xs text-red-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{openError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
            <div>
              <label
                htmlFor="accel-window-minutes"
                className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8B95AA] mb-1.5"
              >
                Selection window (minutes)
              </label>
              <input
                id="accel-window-minutes"
                type="number"
                min={1}
                max={30}
                value={windowMinutes}
                disabled={isBusy}
                onChange={(e) => {
                  setWindowMinutes(e.target.value);
                  setOpenError(null);
                }}
                className={`${INPUT_BASE_CLASS} font-mono tabular-nums`}
              />
            </div>

            <div>
              <label
                htmlFor="accel-picks-limit"
                className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8B95AA] mb-1.5"
              >
                Picks per team
              </label>
              <input
                id="accel-picks-limit"
                type="number"
                min={1}
                max={30}
                value={picksPerTeam}
                disabled={isBusy}
                onChange={(e) => {
                  setPicksPerTeam(e.target.value);
                  setOpenError(null);
                }}
                className={`${INPUT_BASE_CLASS} font-mono tabular-nums`}
              />
            </div>

            <div>
              <Button
                variant="gold"
                size="lg"
                disabled={isBusy}
                onClick={() => {
                  setOpenError(null);
                  setOpenConfirm(true);
                }}
                className="w-full"
              >
                <Timer className="h-4 w-4" />
                <span>Open selection window</span>
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* PANEL C: LIVE SELECTION (status === 'selecting') */}
      {accelStatus === 'selecting' && (
        <div className="space-y-6">
          <Card brackets bracketTone="gold" className="p-5 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <Badge tone="gold">SELECTION WINDOW LIVE</Badge>
                <h2 className="mt-2 font-display text-3xl tracking-wide text-[#E8ECF4]">
                  TEAMS ARE NOMINATING UNSOLD PLAYERS
                </h2>
                <p className="mt-1 font-mono text-xs uppercase tracking-[0.08em] text-[#8B95AA]">
                  Picks limit: {picksLimit} per franchise · Unsold pool: {unsoldTotal}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="rounded-[4px] border border-[#F5B921]/50 bg-[#070B14] px-5 py-3 text-center">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                    TIME REMAINING
                  </p>
                  <p className="mt-1 font-display text-5xl leading-none text-[#F5B921] tabular-nums">
                    {selectionRemainingMs !== null
                      ? formatCountdownMs(selectionRemainingMs)
                      : '00:00'}
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="lg"
                  disabled={isBusy}
                  onClick={() => setCloseConfirm(true)}
                  className="border-red-500/50 text-red-300 hover:border-red-400 hover:bg-red-500/15 hover:text-red-200"
                >
                  <Clock className="h-4 w-4" />
                  <span>Close selection now</span>
                </Button>
              </div>
            </div>
          </Card>

          {picksError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-[4px] border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200"
            >
              <span>{picksError}</span>
              <Button variant="cyan" size="sm" onClick={() => void fetchPicks(false)}>
                Retry
              </Button>
            </div>
          )}

          {/* Two Live Tables: By Team & By Player */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            {/* By Team */}
            <Card className="overflow-hidden xl:col-span-5">
              <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#141C2F]/60 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
                  <h3 className="font-display text-xl tracking-wide text-[#E8ECF4]">
                    NOMINATIONS BY TEAM
                  </h3>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA] tabular-nums">
                  {activeTeams.length} ACTIVE
                </span>
              </div>

              {picksLoading && picks.length === 0 ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 6 }, (_, idx) => (
                    <div
                      key={idx}
                      className="h-10 motion-safe:animate-pulse rounded-[3px] bg-[#070B14]"
                    />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.08] bg-[#070B14] font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                        <th className="px-4 py-2.5">Franchise</th>
                        <th className="px-4 py-2.5 text-right">Picks Used</th>
                        <th className="px-4 py-2.5 text-right">Squad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {picksByTeam.map(({ team, picksUsed, squadCount }) => (
                        <tr key={team.id} className="hover:bg-[#141C2F]/40">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <TeamCrest shortCode={team.short_code} size="sm" />
                              <span className="truncate font-medium text-[#E8ECF4]">
                                {team.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#F5B921] tabular-nums">
                            {picksUsed}/{picksLimit}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[#22D3EE] tabular-nums">
                            {squadCount}/{room.squad_max}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* By Player */}
            <Card className="overflow-hidden xl:col-span-7">
              <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#141C2F]/60 px-5 py-3.5">
                <h3 className="font-display text-xl tracking-wide text-[#E8ECF4]">
                  NOMINATIONS BY PLAYER
                </h3>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#22D3EE] tabular-nums">
                  {picksByPlayer.length} PLAYERS PICKED
                </span>
              </div>

              {picksByPlayer.length === 0 ? (
                <div className="p-8 text-center font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
                  No players nominated by teams yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.08] bg-[#070B14] font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                        <th className="px-4 py-2.5">Code</th>
                        <th className="px-4 py-2.5">Player</th>
                        <th className="px-4 py-2.5">Role</th>
                        <th className="px-4 py-2.5">Nationality</th>
                        <th className="px-4 py-2.5 text-right">Base</th>
                        <th className="px-4 py-2.5 text-center">Picks</th>
                        <th className="px-4 py-2.5">Teams</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {picksByPlayer.map(({ roomPlayerId, rp, teamIds, count }) => {
                        const p = rp.players;
                        if (!p) return null;
                        return (
                          <tr key={roomPlayerId} className="hover:bg-[#141C2F]/40">
                            <td className="px-4 py-2.5 font-mono text-[11px] font-semibold text-[#22D3EE] whitespace-nowrap">
                              {p.player_code}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-[#E8ECF4]">
                              {p.first_name} {p.last_name}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[11px] text-[#8B95AA]">
                              {p.skill}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-[#E8ECF4]">{p.nationality}</span>
                              {p.is_overseas && (
                                <Tag accent="gold" className="ml-1.5">
                                  OS
                                </Tag>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#F5B921] tabular-nums">
                              {formatLakhs(rp.base_price_lakhs)}
                            </td>
                            <td className="px-4 py-2.5 text-center font-mono text-sm font-bold text-[#22D3EE] tabular-nums">
                              {count}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {teamIds.map((tId) => {
                                  const t = teamMap.get(tId);
                                  return (
                                    <span
                                      key={tId}
                                      className="rounded-[2px] border border-white/15 bg-[#070B14] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#E8ECF4]"
                                    >
                                      {t?.short_code ?? 'TEAM'}
                                    </span>
                                  );
                                })}
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
          </div>
        </div>
      )}

      {/* PANEL D: QUEUE & SUMMARY (status === 'live' or 'done') */}
      {(accelStatus === 'live' || accelStatus === 'done') && (
        <div className="space-y-6">
          {/* Done Summary Banner */}
          {accelStatus === 'done' && (
            <Card brackets bracketTone="gold" className="p-5 sm:p-6 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/[0.08] pb-4">
                <div>
                  <Badge tone="cyan">ACCELERATED ROUND COMPLETE</Badge>
                  <h2 className="mt-2 font-display text-3xl tracking-wide text-[#E8ECF4]">
                    FINAL ROUND SUMMARY
                  </h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-[4px] border border-[#22D3EE]/40 bg-[#070B14] px-3.5 py-2 font-mono text-xs text-[#22D3EE]">
                  <span>Next: open the Trade Window</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-[4px] border border-emerald-500/35 bg-[#070B14] p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                    PLAYERS SOLD IN ROUND
                  </p>
                  <p className="mt-1 font-display text-4xl leading-none text-emerald-300 tabular-nums">
                    {queueStats.roundSold}
                  </p>
                </div>
                <div className="rounded-[4px] border border-[#F5B921]/35 bg-[#070B14] p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                    TOTAL SPENT IN ROUND
                  </p>
                  <p className="mt-1 font-display text-4xl leading-none text-[#F5B921] tabular-nums">
                    {formatLakhs(queueStats.roundSpent)}
                  </p>
                </div>
                <div className="rounded-[4px] border border-red-500/35 bg-[#070B14] p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                    PLAYERS STILL UNSOLD
                  </p>
                  <p className="mt-1 font-display text-4xl leading-none text-red-300 tabular-nums">
                    {unsoldTotal}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Queue Card */}
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-white/[0.08] bg-[#141C2F]/60 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#22D3EE]">
                  ACCELERATED AUCTION ORDER
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
                    NOMINATED PLAYER QUEUE
                  </h2>
                  <span className="rounded-[2px] border border-white/15 bg-[#070B14] px-2.5 py-0.5 font-mono text-xs font-semibold text-[#F5B921] tabular-nums">
                    {queueStats.doneCount} of {queueStats.total} done
                  </span>
                </div>
              </div>

              {accelStatus === 'live' && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="cyan"
                    size="md"
                    disabled={!canStartAccelLot}
                    onClick={() => void handleStartNextAccelLot()}
                    title={
                      !room.auction_open
                        ? 'Open the auction room gate first'
                        : lotInProgress
                          ? 'Resolve the current lot on the block first'
                          : 'Start next accelerated lot (Enter)'
                    }
                  >
                    <Play className="h-4 w-4" />
                    <span>Start next accelerated lot</span>
                    <kbd className="hidden xl:inline-flex items-center rounded-[2px] border border-current/30 bg-black/20 px-1.5 py-0.5 font-mono text-[10px] uppercase">
                      Enter
                    </kbd>
                  </Button>

                  <Button
                    variant="outline"
                    size="md"
                    disabled={isBusy}
                    onClick={() => setFinishConfirm(true)}
                    className="border-[#F5B921]/50 text-[#F5B921] hover:border-[#F5B921] hover:bg-[#F5B921]/10"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Finish accelerated round</span>
                  </Button>
                </div>
              )}
            </div>

            {accelStatus === 'live' && !room.auction_open && (
              <div className="border-b border-[#F5B921]/30 bg-[#F5B921]/10 px-5 py-2.5 font-mono text-xs text-[#F5B921]">
                Auction room gate is currently LOCKED. Open the gate in Auction Control before putting the next lot on the block.
              </div>
            )}

            {queueError ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-xs text-red-300">{queueError}</p>
                <Button variant="cyan" size="sm" onClick={() => void fetchQueue(false)}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry</span>
                </Button>
              </div>
            ) : queueLoading && queueItems.length === 0 ? (
              <div className="p-5 space-y-2">
                {Array.from({ length: 5 }, (_, idx) => (
                  <div
                    key={idx}
                    className="h-10 motion-safe:animate-pulse rounded-[3px] bg-[#070B14]"
                  />
                ))}
              </div>
            ) : queueItems.length === 0 ? (
              <div className="p-10 text-center font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
                No players entered the accelerated queue.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.08] bg-[#070B14] font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                      <th className="px-4 py-3">Pos</th>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Player</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Nationality</th>
                      <th className="px-4 py-3 text-right">Base Price</th>
                      <th className="px-4 py-3 text-center">Nominations</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {queueItems.map((item) => {
                      const rp = roomPlayerMap.get(item.room_player_id);
                      const p = rp?.players ?? null;
                      const isOnBlock =
                        lotInProgress &&
                        lot?.id === item.room_player_id;
                      const isSold = rp?.status === 'sold';
                      const sTeam = rp?.sold_to_team_id
                        ? teamMap.get(rp.sold_to_team_id)
                        : null;

                      return (
                        <tr
                          key={item.room_player_id}
                          className={`transition-colors hover:bg-[#141C2F]/40 ${
                            isOnBlock ? 'bg-[#22D3EE]/10' : ''
                          }`}
                        >
                          <td className="px-4 py-3 font-mono font-bold text-[#8B95AA] tabular-nums">
                            #{item.position}
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] font-semibold text-[#22D3EE] whitespace-nowrap">
                            {p?.player_code || '—'}
                          </td>
                          <td className="px-4 py-3 font-medium text-[#E8ECF4]">
                            {p ? `${p.first_name} ${p.last_name}` : 'Player'}
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-[#8B95AA]">
                            {p?.skill || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[#E8ECF4]">
                              {p?.nationality || '—'}
                            </span>
                            {p?.is_overseas && (
                              <Tag accent="gold" className="ml-1.5">
                                OS
                              </Tag>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-[#F5B921] tabular-nums">
                            {rp ? formatLakhs(rp.base_price_lakhs) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-bold text-[#E8ECF4] tabular-nums">
                            {item.picks}
                          </td>
                          <td className="px-4 py-3">
                            {isOnBlock ? (
                              <Badge tone="cyan">
                                <span className="h-1.5 w-1.5 rounded-full bg-[#22D3EE] motion-safe:animate-pulse" />
                                <span>ON BLOCK</span>
                              </Badge>
                            ) : isSold ? (
                              <Badge tone="gold">
                                SOLD TO {sTeam?.short_code || 'TEAM'} ·{' '}
                                {formatLakhs(rp?.sold_price_lakhs ?? 0)}
                              </Badge>
                            ) : item.done ? (
                              <Badge tone="danger">
                                <XCircle className="h-3 w-3" />
                                <span>UNSOLD</span>
                              </Badge>
                            ) : (
                              <Badge tone="neutral">WAITING</Badge>
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
        </div>
      )}

      {/* Confirm Modals */}
      <ConfirmModal
        open={openConfirm}
        onClose={() => setOpenConfirm(false)}
        loading={busyAction === 'open'}
        eyebrow="ACCELERATED ROUND"
        title="OPEN SELECTION WINDOW?"
        message={`Open a ${windowMinutes}-minute selection window allowing each active team with open squad slots to nominate up to ${picksPerTeam} unsold players?`}
        confirmLabel="Open selection window"
        confirmTone="gold"
        onConfirm={() => void handleOpenSelection()}
      />

      <ConfirmModal
        open={closeConfirm}
        onClose={() => setCloseConfirm(false)}
        loading={busyAction === 'close'}
        eyebrow="CLOSE NOMINATIONS"
        title="CLOSE SELECTION NOW?"
        message="End the selection window immediately and lock the accelerated auction queue from current team nominations?"
        confirmLabel="Close selection"
        confirmTone="danger"
        onConfirm={() => void handleCloseSelectionNow()}
      />

      <ConfirmModal
        open={finishConfirm}
        onClose={() => setFinishConfirm(false)}
        loading={busyAction === 'finish'}
        eyebrow="FINALIZE ROUND"
        title="FINISH ACCELERATED ROUND?"
        message="Mark the accelerated round as complete and display the final summary? Any remaining queue players will stay unsold."
        confirmLabel="Finish round"
        confirmTone="gold"
        onConfirm={() => void handleFinishAccel()}
      />
    </div>
  );
}
