import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Gavel,
  Lock,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  SkipForward,
  Tv,
  Unlock,
  Undo2,
  XCircle,
  Zap,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Countdown } from '../../components/auction/Countdown';
import { PlayerCard } from '../../components/auction/PlayerCard';
import { ConfirmModal } from '../../components/host/ConfirmModal';
import { FullResetModal } from '../../components/host/FullResetModal';
import { PreviewLengthControl } from '../../components/host/PreviewLengthControl';
import { ProjectorControlCard } from '../../components/host/ProjectorControlCard';
import { TeamCrest } from '../../components/host/TeamCrest';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { INPUT_BASE_CLASS } from '../../components/ui/FormField';
import { Tag } from '../../components/ui/Tag';
import {
  getCategoryInfo,
  getSkillInfo,
  PLAYER_CATEGORIES,
} from '../../data/categories';
import { useAuction } from '../../hooks/useAuction';
import {
  getSetCategoryInfo,
  nextBid,
  PHASE_LABEL,
  remainingMs,
} from '../../lib/auction';
import { formatLakhs } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useToastStore } from '../../store/toast';
import type { RoomPlayerStatus } from '../../types/database';

type QueueFilter = 'all' | 'pending' | 'sold' | 'unsold';

function formatBidTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString('en-IN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatAccelCountdown(endsAt: string | null, serverNowMs: number): string {
  if (!endsAt) return '00:00';
  const target = Date.parse(endsAt);
  if (Number.isNaN(target)) return '00:00';
  const sec = Math.max(0, Math.ceil((target - serverNowMs) / 1000));
  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${String(mins).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
}

function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="hidden xl:inline-flex items-center justify-center rounded-[2px] border border-current/30 bg-black/25 px-1.5 py-0.5 font-mono text-[10px] leading-none uppercase tracking-wider opacity-80">
      {children}
    </kbd>
  );
}

export default function HostAuction() {
  const { roomId } = useParams<{ roomId: string }>();
  const showToast = useToastStore((s) => s.showToast);

  const {
    room,
    state,
    lot,
    teams,
    finance,
    lotBids,
    soldLog,
    roomPlayers,
    offsetMs,
    reveal,
    previewSeconds,
    accelStatus,
    accelSelectionEndsAt,
    accelProgress,
    loading,
    error,
    refetch,
  } = useAuction(roomId, { role: 'host' });

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (accelStatus !== 'selecting') return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [accelStatus]);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [viewSetNo, setViewSetNo] = useState<number>(1);

  // Force assign controls
  const [forceTeamId, setForceTeamId] = useState<string>('');
  const [forceLakhs, setForceLakhs] = useState<string>('');

  // Confirm modals
  const [openGateConfirm, setOpenGateConfirm] = useState(false);
  const [unsoldConfirm, setUnsoldConfirm] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [forceAssignConfirm, setForceAssignConfirm] = useState(false);
  const [fullResetOpen, setFullResetOpen] = useState(false);

  // Auto-close guard refs
  const autoResolveKeyRef = useRef<string | null>(null);
  const fallbackRefetchTimerRef = useRef<number | null>(null);

  const currentSetNo = state?.current_set_no ?? 1;

  // Sync inspected set when state's current_set_no changes
  useEffect(() => {
    if (state?.current_set_no) {
      setViewSetNo(state.current_set_no);
    }
  }, [state?.current_set_no]);

  // Prefill force assign amount whenever active lot changes
  useEffect(() => {
    if (lot) {
      setForceLakhs(String(lot.base_price_lakhs));
    } else {
      setForceLakhs('');
    }
  }, [lot?.id, lot?.base_price_lakhs]);

  const activeTeams = useMemo(
    () => teams.filter((t) => t.status === 'active'),
    [teams],
  );

  // Ensure a valid active team is selected in force assign dropdown
  useEffect(() => {
    if (activeTeams.length === 0) {
      setForceTeamId('');
      return;
    }
    if (!activeTeams.some((t) => t.id === forceTeamId)) {
      setForceTeamId(activeTeams[0].id);
    }
  }, [activeTeams, forceTeamId]);

  const teamMap = useMemo(() => {
    const map = new Map<string, (typeof teams)[number]>();
    for (const t of teams) map.set(t.id, t);
    return map;
  }, [teams]);

  const financeMap = useMemo(() => {
    const map = new Map<string, (typeof finance)[number]>();
    for (const f of finance) map.set(f.team_id, f);
    return map;
  }, [finance]);

  const teamStatsMap = useMemo(() => {
    const map = new Map<string, { squad: number; overseas: number }>();
    for (const t of teams) {
      map.set(t.id, { squad: 0, overseas: 0 });
    }
    for (const rp of roomPlayers) {
      if (rp.status === 'sold' && rp.sold_to_team_id) {
        const current = map.get(rp.sold_to_team_id) ?? {
          squad: 0,
          overseas: 0,
        };
        current.squad += 1;
        if (rp.players?.is_overseas) {
          current.overseas += 1;
        }
        map.set(rp.sold_to_team_id, current);
      }
    }
    return map;
  }, [teams, roomPlayers]);

  const setCountsMap = useMemo(() => {
    const map = new Map<number, { pending: number; total: number }>();
    for (const cat of PLAYER_CATEGORIES) {
      map.set(cat.setNo, { pending: 0, total: 0 });
    }
    for (const rp of roomPlayers) {
      const entry = map.get(rp.set_no) ?? { pending: 0, total: 0 };
      entry.total += 1;
      if (rp.status === 'pending') entry.pending += 1;
      map.set(rp.set_no, entry);
    }
    return map;
  }, [roomPlayers]);

  const sessionMetrics = useMemo(() => {
    let totalSpent = 0;
    let unsoldCount = 0;
    for (const rp of roomPlayers) {
      if (rp.status === 'sold') {
        totalSpent += rp.sold_price_lakhs ?? 0;
      } else if (rp.status === 'unsold') {
        unsoldCount += 1;
      }
    }
    return {
      soldCount: soldLog.length,
      totalSpent,
      unsoldCount,
      currentLotBidsCount: lotBids.length,
    };
  }, [roomPlayers, soldLog.length, lotBids.length]);

  const setQueuePlayers = useMemo(() => {
    return roomPlayers.filter((rp) => {
      if (rp.set_no !== viewSetNo) return false;
      if (queueFilter === 'all') return true;
      return rp.status === queueFilter;
    });
  }, [roomPlayers, viewSetNo, queueFilter]);

  const runRpc = useCallback(
    async (
      actionKey: string,
      fnName: string,
      args: Record<string, unknown>,
      successTitle?: string,
    ): Promise<boolean> => {
      if (!supabase) return false;
      setBusyAction(actionKey);
      try {
        const { error: rpcError } = await supabase.rpc(fnName, args);
        if (rpcError) {
          showToast({
            title: 'Auction action failed',
            description: rpcError.message || `Could not run ${fnName}.`,
            tone: 'error',
          });
          return false;
        }
        if (successTitle) {
          showToast({
            title: successTitle,
            tone: 'success',
            durationMs: 3000,
          });
        }
        await refetch();
        return true;
      } catch (err) {
        showToast({
          title: 'Auction action failed',
          description:
            err instanceof Error ? err.message : 'Unexpected network error.',
          tone: 'error',
        });
        return false;
      } finally {
        setBusyAction(null);
      }
    },
    [refetch, showToast],
  );

  // Auto-close expired bidding lot once per (current_room_player_id, bid_seq)
  useEffect(() => {
    if (fallbackRefetchTimerRef.current !== null) {
      window.clearTimeout(fallbackRefetchTimerRef.current);
      fallbackRefetchTimerRef.current = null;
    }

    if (
      !roomId ||
      !state ||
      state.phase !== 'bidding' ||
      !state.timer_ends_at ||
      reveal.active
    ) {
      return;
    }

    const triggerResolveIfExpired = () => {
      if (!supabase || reveal.active) return;
      const ms = remainingMs(state, offsetMs);
      if (ms === null || ms > 0) return;

      const lotKey = `${state.current_room_player_id ?? 'none'}:${state.bid_seq}`;
      if (autoResolveKeyRef.current === lotKey) return;
      autoResolveKeyRef.current = lotKey;

      void (async () => {
        const { error: rpcErr } = await supabase.rpc('resolve_expired_lot', {
          p_room: roomId,
        });
        if (rpcErr) {
          showToast({
            title: 'Auto-close failed',
            description: rpcErr.message,
            tone: 'error',
          });
        }
        fallbackRefetchTimerRef.current = window.setTimeout(() => {
          fallbackRefetchTimerRef.current = null;
          void refetch();
        }, 1000);
      })();
    };

    triggerResolveIfExpired();
    const intervalId = window.setInterval(triggerResolveIfExpired, 150);

    return () => {
      window.clearInterval(intervalId);
      if (fallbackRefetchTimerRef.current !== null) {
        window.clearTimeout(fallbackRefetchTimerRef.current);
        fallbackRefetchTimerRef.current = null;
      }
    };
  }, [roomId, state, offsetMs, reveal.active, refetch, showToast]);

  const phase = state?.phase ?? 'idle';
  const lotInProgress = phase === 'bidding' || phase === 'paused';
  const isBusy = busyAction !== null;
  const anyModalOpen =
    openGateConfirm ||
    unsoldConfirm ||
    restoreConfirm ||
    forceAssignConfirm ||
    fullResetOpen;

  const canStartNext = Boolean(room?.auction_open) && !lotInProgress && !isBusy;
  const canSellNow =
    lotInProgress && state?.current_bid_team_id !== null && !isBusy;
  const canMarkUnsold = lotInProgress && !isBusy;
  const canVoidLastBid = lotInProgress && lotBids.length > 0 && !isBusy;
  const canPauseResume = lotInProgress && !isBusy;
  const canResetTimer = lotInProgress && !isBusy;
  const canSkipReveal = reveal.active && !isBusy;

  const handleStartNextLot = useCallback(() => {
    if (!room || !canStartNext) return;
    if (accelStatus === 'live') {
      void runRpc('start-lot', 'host_start_accel_lot', {
        p_room: room.id,
      });
    } else {
      void runRpc('start-lot', 'host_start_lot', {
        p_room: room.id,
        p_room_player_id: null,
      });
    }
  }, [room, canStartNext, accelStatus, runRpc]);

  const handlePutPlayerOnBlock = useCallback(
    (roomPlayerId: string) => {
      if (!room || lotInProgress || !room.auction_open || isBusy) return;
      void runRpc('put-on-block', 'host_start_lot', {
        p_room: room.id,
        p_room_player_id: roomPlayerId,
      });
    },
    [room, lotInProgress, isBusy, runRpc],
  );

  const handleSetChange = useCallback(
    (setNo: number) => {
      if (!room || isBusy) return;
      void runRpc('set-set', 'host_set_set', {
        p_room: room.id,
        p_set_no: setNo,
      });
    },
    [room, isBusy, runRpc],
  );

  const handleSellNow = useCallback(() => {
    if (!room || !canSellNow) return;
    void runRpc('sell-now', 'host_sell_now', { p_room: room.id });
  }, [room, canSellNow, runRpc]);

  const handleRequestMarkUnsold = useCallback(() => {
    if (!room || !canMarkUnsold) return;
    const hasBids =
      state?.current_bid_team_id !== null || lotBids.length > 0;
    if (hasBids) {
      setUnsoldConfirm(true);
      return;
    }
    void runRpc('mark-unsold', 'host_mark_unsold', { p_room: room.id });
  }, [room, canMarkUnsold, state?.current_bid_team_id, lotBids.length, runRpc]);

  const handlePauseResume = useCallback(() => {
    if (!room || !canPauseResume) return;
    const shouldPause = phase !== 'paused';
    void runRpc('pause', 'host_pause', {
      p_room: room.id,
      p_pause: shouldPause,
    });
  }, [room, canPauseResume, phase, runRpc]);

  const handleResetTimer = useCallback(() => {
    if (!room || !canResetTimer) return;
    void runRpc('reset-timer', 'host_reset_timer', { p_room: room.id });
  }, [room, canResetTimer, runRpc]);

  const handleSkipReveal = useCallback(() => {
    if (!room || !canSkipReveal) return;
    void runRpc(
      'skip-reveal',
      'host_skip_reveal',
      { p_room: room.id },
      'Reveal skipped — bidding open',
    );
  }, [room, canSkipReveal, runRpc]);

  const handleVoidLastBid = useCallback(() => {
    if (!room || !canVoidLastBid) return;
    void runRpc(
      'void-bid',
      'host_void_last_bid',
      { p_room: room.id },
      'Last bid voided',
    );
  }, [room, canVoidLastBid, runRpc]);

  const handleToggleGate = useCallback(() => {
    if (!room || isBusy) return;
    if (!room.auction_open) {
      setOpenGateConfirm(true);
    } else {
      void runRpc(
        'toggle-gate',
        'set_auction_open',
        { p_room: room.id, p_open: false },
        'Auction room locked',
      );
    }
  }, [room, isBusy, runRpc]);

  // Host keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (anyModalOpen) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'SELECT' ||
        tag === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }

      if (event.key === 'Enter') {
        if (tag === 'BUTTON' || tag === 'A') return;
        if (canStartNext) {
          event.preventDefault();
          handleStartNextLot();
        }
        return;
      }

      if (event.code === 'Space') {
        if (tag === 'BUTTON' || tag === 'A') return;
        if (canSellNow) {
          event.preventDefault();
          handleSellNow();
        }
        return;
      }

      const lower = event.key.toLowerCase();
      if (lower === 'u' && canMarkUnsold) {
        event.preventDefault();
        handleRequestMarkUnsold();
      } else if (lower === 'p' && canPauseResume) {
        event.preventDefault();
        handlePauseResume();
      } else if (lower === 'r' && canResetTimer) {
        event.preventDefault();
        handleResetTimer();
      } else if (lower === 'v' && canVoidLastBid) {
        event.preventDefault();
        handleVoidLastBid();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    anyModalOpen,
    canStartNext,
    canSellNow,
    canMarkUnsold,
    canPauseResume,
    canResetTimer,
    canVoidLastBid,
    handleStartNextLot,
    handleSellNow,
    handleRequestMarkUnsold,
    handlePauseResume,
    handleResetTimer,
    handleVoidLastBid,
  ]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-36 animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="h-96 animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524] lg:col-span-3" />
          <div className="h-96 animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524] lg:col-span-4" />
          <div className="h-96 animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524] lg:col-span-5" />
        </div>
      </div>
    );
  }

  if (error || !room) {
    return (
      <Card brackets bracketTone="gold" className="p-8">
        <Badge tone="danger">AUCTION CONSOLE ERROR</Badge>
        <h1 className="mt-3 font-display text-4xl tracking-wide text-[#E8ECF4]">
          UNABLE TO LOAD AUCTION CONTROL
        </h1>
        <p className="mt-2 text-sm text-red-300">
          {error || 'Auction state could not be loaded for this room.'}
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

  const player = lot?.players ?? null;
  const fullName = player
    ? `${player.first_name} ${player.last_name}`.trim()
    : '';
  const categoryInfo = getCategoryInfo(player?.category);
  const skillInfo = getSkillInfo(player?.skill);
  const currentSetInfo = getSetCategoryInfo(currentSetNo);
  const viewSetInfo = getSetCategoryInfo(viewSetNo);

  const highBidTeam = state?.current_bid_team_id
    ? (teamMap.get(state.current_bid_team_id) ?? null)
    : null;

  const soldTeam = lot?.sold_to_team_id
    ? (teamMap.get(lot.sold_to_team_id) ?? null)
    : highBidTeam;

  const nextLegalBidLakhs = lot
    ? nextBid(state, lot.base_price_lakhs)
    : null;

  const parsedForceLakhs = Number(forceLakhs);
  const forceAssignValid =
    Boolean(lot) &&
    Boolean(forceTeamId) &&
    Number.isFinite(parsedForceLakhs) &&
    parsedForceLakhs > 0;
  const forceTargetTeam = forceTeamId
    ? (teamMap.get(forceTeamId) ?? null)
    : null;

  const canRestoreSale =
    !isBusy &&
    !lotInProgress &&
    (phase === 'sold' || phase === 'unsold' || soldLog.length > 0);

  return (
    <div className="space-y-4">
      {accelStatus === 'selecting' && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-amber-400/60 bg-amber-500/10 px-5 py-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-amber-400/50 bg-[#070B14] text-amber-300">
              <Zap className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-amber-300">
                ACCELERATED SELECTION WINDOW OPEN
              </p>
              <p className="font-mono text-xs text-[#E8ECF4] tabular-nums">
                Closes in{' '}
                <span className="font-bold text-amber-300">
                  {formatAccelCountdown(accelSelectionEndsAt, nowMs + offsetMs)}
                </span>{' '}
                · {accelProgress?.unsold_total ?? 0} unsold players eligible
              </p>
            </div>
          </div>

          <Link to={`/host/${room.id}/accelerated`} className="shrink-0">
            <Button variant="gold" size="sm">
              <span>Accelerated Console</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      )}

      {/* A. TOP LOT HEADER PANEL */}
      <Card brackets bracketTone="gold" className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: Lot Identity + Chips */}
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  phase === 'bidding'
                    ? 'cyan'
                    : phase === 'sold' || phase === 'paused'
                      ? 'gold'
                      : phase === 'unsold'
                        ? 'danger'
                        : 'neutral'
                }
              >
                {phase === 'bidding' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#22D3EE] animate-pulse" />
                )}
                <span>{PHASE_LABEL[phase]}</span>
              </Badge>

              {accelStatus === 'live' ? (
                <>
                  <Badge tone="danger">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                    <span>ACCELERATED ROUND</span>
                  </Badge>
                  <Link
                    to={`/host/${room.id}/accelerated`}
                    className="inline-flex items-center gap-1 rounded-[2px] border border-white/15 bg-[#070B14] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#22D3EE] hover:border-[#22D3EE]"
                  >
                    <span>
                      Queue ({accelProgress?.queue_remaining ?? 0}/
                      {accelProgress?.queue_total ?? 0})
                    </span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </>
              ) : (
                <Tag accent="cyan">
                  SET {currentSetNo} · {currentSetInfo?.label ?? 'POOL'}
                </Tag>
              )}

              {player?.player_code && (
                <span className="rounded-[2px] border border-[#22D3EE]/35 bg-[#070B14] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#22D3EE]">
                  {player.player_code}
                </span>
              )}

              {!room.auction_open && (
                <Tag accent="gold">ROOM LOCKED</Tag>
              )}

              {reveal.active && (
                <Badge tone="gold">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#F5B921] animate-pulse" />
                  <span>
                    REVEAL RUNNING{' '}
                    {Math.max(1, Math.ceil(reveal.remainingMs / 1000))}S
                  </span>
                </Badge>
              )}

              <Button
                variant="outline"
                size="sm"
                disabled={!canSkipReveal}
                onClick={handleSkipReveal}
                title={
                  reveal.active
                    ? 'Skip player reveal and open bidding immediately'
                    : 'Available while a player reveal is running'
                }
                className="border-[#22D3EE]/45 text-[#22D3EE] hover:border-[#22D3EE] hover:bg-[#22D3EE]/10"
              >
                <SkipForward className="h-3.5 w-3.5" />
                <span>Skip reveal</span>
              </Button>
            </div>

            {phase === 'idle' || !lot || !player ? (
              <div className="py-1">
                <h1 className="font-display text-3xl sm:text-4xl tracking-wide text-[#E8ECF4]">
                  NO PLAYER ON THE BLOCK
                </h1>
                <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
                  {room.auction_open
                    ? accelStatus === 'live'
                      ? 'Press Start next accelerated lot [Enter] or manage the queue on the Accelerated Round page.'
                      : 'Press Start next lot [Enter] or pick any pending player from the set queue below.'
                    : 'Open the auction room gate on the left panel before starting the next lot.'}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <h1 className="truncate font-display text-3xl sm:text-4xl lg:text-5xl leading-none tracking-wide text-[#E8ECF4]">
                    {fullName}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {categoryInfo && (
                      <span
                        className={`inline-flex items-center rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${categoryInfo.chipClass}`}
                      >
                        {categoryInfo.label}
                      </span>
                    )}
                    {skillInfo && (
                      <span
                        className={`inline-flex items-center rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${skillInfo.chipClass}`}
                      >
                        {skillInfo.value}
                      </span>
                    )}
                    <span className="inline-flex items-center rounded-[2px] border border-white/10 bg-[#070B14] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#E8ECF4]">
                      {player.nationality}
                    </span>
                    {player.is_overseas && <Tag accent="gold">OVERSEAS</Tag>}
                    <span className="inline-flex items-center rounded-[2px] border border-[#F5B921]/30 bg-[#070B14] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#F5B921] tabular-nums">
                      BASE {formatLakhs(lot.base_price_lakhs)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Center: Highest Bid + Bidder on Deck */}
          <div className="flex flex-wrap items-center gap-4 lg:gap-6 border-y border-white/[0.08] py-3 lg:border-y-0 lg:border-x lg:px-6 lg:py-1">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                CURRENT HIGHEST BID
              </p>
              {lot && state?.current_bid_team_id ? (
                <p className="mt-0.5 font-display text-4xl sm:text-5xl leading-none tracking-wide text-[#F5B921] tabular-nums">
                  {formatLakhs(state.current_bid_lakhs)}
                </p>
              ) : (
                <p className="mt-1 font-display text-2xl sm:text-3xl leading-none tracking-wide text-[#8B95AA]">
                  {lot ? 'NO BIDS YET' : '--'}
                </p>
              )}
              {nextLegalBidLakhs !== null && lotInProgress && (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#22D3EE] tabular-nums">
                  NEXT CALL: {formatLakhs(nextLegalBidLakhs)}
                </p>
              )}
            </div>

            <div className="min-w-[160px]">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                BIDDER ON DECK
              </p>
              {highBidTeam ? (
                <div className="mt-1.5 flex items-center gap-2.5">
                  <TeamCrest shortCode={highBidTeam.short_code} size="md" />
                  <div className="min-w-0">
                    <p className="truncate font-sans text-sm font-semibold text-[#E8ECF4]">
                      {highBidTeam.name}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#F5B921]">
                      LEADING BID
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 font-mono text-xs text-[#8B95AA]">
                  {lot ? 'Awaiting paddle' : 'Standby'}
                </p>
              )}
            </div>
          </div>

          {/* Right: PlayerCard + Countdown */}
          <div className="flex items-center justify-between gap-3 sm:justify-end shrink-0">
            <PlayerCard
              player={player}
              size="sm"
              basePriceLakhs={lot?.base_price_lakhs}
            />
            <Countdown
              state={state}
              totalSeconds={room.bid_timer_seconds}
              offsetMs={offsetMs}
              size="md"
              revealActive={reveal.active}
            />
          </div>
        </div>
      </Card>

      {/* B. RESULT BANNER */}
      {phase === 'sold' && lot && player && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[#F5B921] bg-[#F5B921]/15 px-5 py-3"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[#F5B921]" />
            {soldTeam && (
              <TeamCrest shortCode={soldTeam.short_code} size="sm" />
            )}
            <p className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              SOLD TO{' '}
              <span className="text-[#F5B921]">
                {soldTeam?.name || 'FRANCHISE'}
              </span>{' '}
              FOR{' '}
              <span className="text-[#F5B921] tabular-nums">
                {formatLakhs(
                  lot.sold_price_lakhs ?? state?.current_bid_lakhs ?? 0,
                )}
              </span>
            </p>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#F5B921]">
            {fullName}
          </span>
        </div>
      )}

      {phase === 'unsold' && lot && player && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-red-500/60 bg-red-500/15 px-5 py-3"
        >
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 shrink-0 text-red-400" />
            <p className="font-display text-2xl tracking-wide text-red-200">
              UNSOLD — <span className="text-[#E8ECF4]">{fullName}</span>
            </p>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-red-300">
            LOT PASSED
          </span>
        </div>
      )}

      {/* C, D, E: 3-COLUMN HOST CONTROL DECK */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
        {/* C. LEFT COLUMN — AUCTION FLOW */}
        <Card className="p-4 space-y-4 lg:col-span-3">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
            <h2 className="font-display text-xl tracking-wide text-[#22D3EE]">
              AUCTION FLOW
            </h2>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isBusy}
              title="Refresh state"
              className="inline-flex h-7 w-7 items-center justify-center rounded-[4px] border border-white/10 bg-[#070B14] text-[#8B95AA] hover:border-white/25 hover:text-[#E8ECF4] disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Start Next Lot */}
          <div className="space-y-1.5">
            <div
              className="group relative"
              title={
                !room.auction_open
                  ? 'Open the auction room first'
                  : lotInProgress
                    ? 'Resolve the current lot first'
                    : accelStatus === 'live'
                      ? 'Start next player from the accelerated queue'
                      : 'Start next pending player in current set'
              }
            >
              <Button
                variant={accelStatus === 'live' ? 'gold' : 'cyan'}
                size="md"
                disabled={!canStartNext}
                onClick={handleStartNextLot}
                className="w-full justify-between"
              >
                <span className="inline-flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  <span>
                    {accelStatus === 'live'
                      ? 'Start next accelerated lot'
                      : 'Start next lot'}
                  </span>
                </span>
                <KeyCap>Enter</KeyCap>
              </Button>
            </div>
            {!room.auction_open && (
              <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-[#F5B921]">
                Open the auction room first
              </p>
            )}
          </div>

          {/* Jump to Set & Next Set */}
          <div className="space-y-2 border-t border-white/[0.08] pt-3">
            <label
              htmlFor="auction-set-select"
              className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]"
            >
              JUMP TO AUCTION SET
            </label>
            <select
              id="auction-set-select"
              value={currentSetNo}
              disabled={isBusy || accelStatus === 'live'}
              onChange={(e) => handleSetChange(Number(e.target.value))}
              className={`${INPUT_BASE_CLASS} py-2 text-xs`}
            >
              {PLAYER_CATEGORIES.map((cat) => {
                const counts = setCountsMap.get(cat.setNo) ?? {
                  pending: 0,
                  total: 0,
                };
                return (
                  <option key={cat.setNo} value={cat.setNo}>
                    Set {cat.setNo} · {cat.label} ({counts.pending}/
                    {counts.total})
                  </option>
                );
              })}
            </select>

            <Button
              variant="outline"
              size="sm"
              disabled={
                isBusy ||
                accelStatus === 'live' ||
                currentSetNo >= PLAYER_CATEGORIES.length
              }
              onClick={() => handleSetChange(currentSetNo + 1)}
              className="w-full justify-center"
            >
              <SkipForward className="h-3.5 w-3.5" />
              <span>Next set</span>
            </Button>
            {accelStatus === 'live' && (
              <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-red-300">
                Set selector locked during accelerated round
              </p>
            )}
          </div>

          {/* Time and Regulation */}
          <div className="space-y-2 border-t border-white/[0.08] pt-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                TIME &amp; REGULATION
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#22D3EE] tabular-nums">
                <Clock className="h-3 w-3" />
                {room.bid_timer_seconds}s
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={phase === 'paused' ? 'gold' : 'outline'}
                size="sm"
                disabled={!canPauseResume}
                onClick={handlePauseResume}
                className="justify-between px-2.5"
              >
                <span className="inline-flex items-center gap-1.5">
                  {phase === 'paused' ? (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      <span>Resume</span>
                    </>
                  ) : (
                    <>
                      <Pause className="h-3.5 w-3.5" />
                      <span>Pause</span>
                    </>
                  )}
                </span>
                <KeyCap>P</KeyCap>
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={!canResetTimer}
                onClick={handleResetTimer}
                className="justify-between px-2.5"
              >
                <span className="inline-flex items-center gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </span>
                <KeyCap>R</KeyCap>
              </Button>
            </div>

            <div className="border-t border-white/[0.06] pt-2.5">
              <PreviewLengthControl
                roomId={room.id}
                currentSeconds={previewSeconds}
                disabled={isBusy}
                compact
                onUpdated={refetch}
              />
            </div>
          </div>

          {/* Room Gate Toggle */}
          <div className="border-t border-white/[0.08] pt-3">
            <div className="flex items-center justify-between gap-2 rounded-[4px] border border-white/[0.08] bg-[#070B14] p-2.5">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                  AUCTION GATE
                </p>
                <p
                  className={`font-mono text-xs font-bold uppercase ${
                    room.auction_open ? 'text-[#22D3EE]' : 'text-red-400'
                  }`}
                >
                  {room.auction_open ? 'OPEN' : 'LOCKED'}
                </p>
              </div>
              <Button
                variant={room.auction_open ? 'outline' : 'gold'}
                size="sm"
                disabled={isBusy}
                onClick={handleToggleGate}
              >
                {room.auction_open ? (
                  <>
                    <Lock className="h-3.5 w-3.5" />
                    <span>Lock</span>
                  </>
                ) : (
                  <>
                    <Unlock className="h-3.5 w-3.5" />
                    <span>Open</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* D. MIDDLE COLUMN — AUCTIONEER VERDICT PAD */}
        <Card brackets bracketTone="subtle" className="p-4 space-y-4 lg:col-span-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
            <h2 className="font-display text-xl tracking-wide text-[#F5B921]">
              AUCTIONEER VERDICT PAD
            </h2>
            <Gavel className="h-4 w-4 text-[#F5B921]" aria-hidden="true" />
          </div>

          {/* Primary Verdict Buttons */}
          <div className="space-y-2.5">
            <Button
              variant="gold"
              size="lg"
              disabled={!canSellNow}
              onClick={handleSellNow}
              className="w-full justify-between"
            >
              <span className="inline-flex items-center gap-2 font-display text-xl tracking-wide">
                <Gavel className="h-4 w-4" />
                <span>HAMMER DOWN: SOLD</span>
              </span>
              <KeyCap>Space</KeyCap>
            </Button>

            <Button
              variant="outline"
              size="md"
              disabled={!canMarkUnsold}
              onClick={handleRequestMarkUnsold}
              className="w-full justify-between border-red-500/45 text-red-300 hover:border-red-400 hover:bg-red-500/15 hover:text-red-200"
            >
              <span className="inline-flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                <span>OUT / UNSOLD</span>
              </span>
              <KeyCap>U</KeyCap>
            </Button>
          </div>

          {/* DRS Panel */}
          <div className="space-y-2 rounded-[4px] border border-white/[0.08] bg-[#070B14] p-3">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#22D3EE]">
                DRS // DISPUTE RESOLUTION
              </p>
              <ShieldAlert className="h-3.5 w-3.5 text-[#22D3EE]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!canVoidLastBid}
                onClick={handleVoidLastBid}
                className="justify-between px-2.5"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Undo2 className="h-3.5 w-3.5" />
                  <span>Void bid</span>
                </span>
                <KeyCap>V</KeyCap>
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={!canRestoreSale}
                onClick={() => setRestoreConfirm(true)}
                className="justify-center px-2.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Restore sale</span>
              </Button>
            </div>
          </div>

          {/* Administrative Force Assign */}
          <div className="space-y-2.5 rounded-[4px] border border-white/[0.08] bg-[#070B14] p-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#F5B921]">
              ADMINISTRATIVE FORCE ASSIGN
            </p>

            <div className="space-y-2">
              <select
                aria-label="Force assign franchise"
                value={forceTeamId}
                disabled={!lot || activeTeams.length === 0 || isBusy}
                onChange={(e) => setForceTeamId(e.target.value)}
                className={`${INPUT_BASE_CLASS} py-2 text-xs`}
              >
                {activeTeams.length === 0 ? (
                  <option value="">No active teams available</option>
                ) : (
                  activeTeams.map((team) => {
                    const purse = financeMap.get(team.id)?.purse_left_lakhs ?? 0;
                    return (
                      <option key={team.id} value={team.id}>
                        {team.short_code} · {team.name} ({formatLakhs(purse)})
                      </option>
                    );
                  })
                )}
              </select>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min={1}
                    aria-label="Force assign amount in lakhs"
                    value={forceLakhs}
                    disabled={!lot || isBusy}
                    onChange={(e) => setForceLakhs(e.target.value)}
                    placeholder="Lakhs"
                    className={`${INPUT_BASE_CLASS} py-2 pr-20 font-mono text-xs tabular-nums`}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-[#F5B921] tabular-nums">
                    {Number.isFinite(parsedForceLakhs) && parsedForceLakhs > 0
                      ? formatLakhs(Math.round(parsedForceLakhs))
                      : 'LAKHS'}
                  </span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={!forceAssignValid || isBusy}
                  onClick={() => setForceAssignConfirm(true)}
                  className="shrink-0 border-[#F5B921]/45 text-[#F5B921] hover:border-[#F5B921] hover:bg-[#F5B921]/10"
                >
                  Force assign
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* E. RIGHT COLUMN — FRANCHISE TABLES + GAVEL LOG + SESSION OVERVIEW */}
        <div className="space-y-4 lg:col-span-5">
          {/* Franchise Tables */}
          <Card className="p-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2 mb-3">
              <h2 className="font-display text-xl tracking-wide text-[#E8ECF4]">
                FRANCHISE TABLES
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA] tabular-nums">
                {activeTeams.length}/{teams.length} ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {teams.map((team) => {
                const fin = financeMap.get(team.id);
                const stats = teamStatsMap.get(team.id) ?? {
                  squad: 0,
                  overseas: 0,
                };
                const isHighest =
                  lotInProgress && state?.current_bid_team_id === team.id;
                const isDimmed = team.status !== 'active';

                return (
                  <div
                    key={team.id}
                    className={`rounded-[4px] border px-2.5 py-2 transition-colors ${
                      isHighest
                        ? 'border-[#F5B921] bg-[#F5B921]/10'
                        : 'border-white/[0.08] bg-[#070B14]'
                    } ${isDimmed ? 'opacity-45' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <TeamCrest shortCode={team.short_code} size="sm" />
                        <span className="font-mono text-xs font-bold text-[#E8ECF4]">
                          {team.short_code}
                        </span>
                        {isHighest && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[#F5B921] animate-pulse" />
                        )}
                      </div>

                      <span className="font-mono text-xs font-semibold text-[#F5B921] tabular-nums">
                        {fin ? formatLakhs(fin.purse_left_lakhs) : '—'}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-[#8B95AA] tabular-nums">
                      <span>
                        SQ {stats.squad}/{room.squad_max} · OS {stats.overseas}/
                        {room.overseas_max}
                      </span>
                      <span
                        className={
                          team.status === 'active'
                            ? 'text-[#22D3EE]'
                            : team.status === 'removed'
                              ? 'text-red-400'
                              : 'text-[#8B95AA]'
                        }
                      >
                        {team.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Ball-by-Ball Gavel Log + Session Overview */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <Card className="p-4 sm:col-span-7">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2 mb-2.5">
                <h2 className="font-display text-lg tracking-wide text-[#E8ECF4]">
                  BALL-BY-BALL GAVEL LOG
                </h2>
                <span className="font-mono text-[10px] text-[#22D3EE] tabular-nums">
                  {lotBids.length} BIDS
                </span>
              </div>

              {lotBids.length === 0 ? (
                <p className="py-5 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA]">
                  No bids placed on active lot
                </p>
              ) : (
                <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {lotBids.map((bid, idx) => {
                    const bTeam = teamMap.get(bid.team_id);
                    return (
                      <div
                        key={bid.id}
                        className={`flex items-center justify-between gap-2 rounded-[3px] border px-2.5 py-1.5 text-xs ${
                          idx === 0
                            ? 'border-[#F5B921]/40 bg-[#F5B921]/10'
                            : 'border-white/[0.06] bg-[#070B14]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {bTeam && (
                            <TeamCrest shortCode={bTeam.short_code} size="sm" />
                          )}
                          <span className="truncate font-mono text-[11px] font-semibold text-[#E8ECF4]">
                            {bTeam?.short_code || 'TEAM'}
                          </span>
                        </div>
                        <span className="font-mono text-xs font-bold text-[#F5B921] tabular-nums">
                          {formatLakhs(bid.amount_lakhs)}
                        </span>
                        <span className="font-mono text-[10px] text-[#8B95AA] tabular-nums">
                          {formatBidTime(bid.created_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className="p-4 sm:col-span-5">
              <div className="border-b border-white/[0.08] pb-2 mb-2.5">
                <h2 className="font-display text-lg tracking-wide text-[#E8ECF4]">
                  SESSION OVERVIEW
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono tabular-nums">
                <div className="rounded-[3px] border border-white/[0.06] bg-[#070B14] p-2">
                  <p className="text-[9px] uppercase text-[#8B95AA]">SOLD</p>
                  <p className="mt-0.5 text-lg font-bold text-[#F5B921]">
                    {sessionMetrics.soldCount}
                  </p>
                </div>
                <div className="rounded-[3px] border border-white/[0.06] bg-[#070B14] p-2">
                  <p className="text-[9px] uppercase text-[#8B95AA]">UNSOLD</p>
                  <p className="mt-0.5 text-lg font-bold text-red-400">
                    {sessionMetrics.unsoldCount}
                  </p>
                </div>
                <div className="rounded-[3px] border border-white/[0.06] bg-[#070B14] p-2">
                  <p className="text-[9px] uppercase text-[#8B95AA]">SPENT</p>
                  <p className="mt-0.5 text-sm font-bold text-[#22D3EE]">
                    {formatLakhs(sessionMetrics.totalSpent)}
                  </p>
                </div>
                <div className="rounded-[3px] border border-white/[0.06] bg-[#070B14] p-2">
                  <p className="text-[9px] uppercase text-[#8B95AA]">
                    LOT BIDS
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-[#E8ECF4]">
                    {sessionMetrics.currentLotBidsCount}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Projector Mode Switch Card */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <div className="flex items-center gap-2">
                <Tv className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
                <h2 className="font-display text-lg tracking-wide text-[#E8ECF4]">
                  PROJECTOR
                </h2>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#22D3EE]">
                {(room.projector_mode ?? 'auction').toUpperCase()}
              </span>
            </div>
            <ProjectorControlCard
              roomId={room.id}
              currentMode={room.projector_mode ?? 'auction'}
              compact
              onModeChanged={refetch}
            />
          </Card>
        </div>
      </div>

      {/* F. SET QUEUE */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-white/[0.08] bg-[#141C2F]/60 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#22D3EE]">
              AUCTION ORDER // SET {viewSetNo}
            </p>
            <h2 className="mt-0.5 font-display text-2xl tracking-wide text-[#E8ECF4]">
              SET QUEUE — {viewSetInfo?.label.toUpperCase() ?? `SET ${viewSetNo}`}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Inspect auction set queue"
              value={viewSetNo}
              onChange={(e) => setViewSetNo(Number(e.target.value))}
              className="rounded-[4px] border border-white/15 bg-[#070B14] px-3 py-1.5 font-mono text-xs text-[#E8ECF4] focus:border-[#22D3EE] focus:outline-none"
            >
              {PLAYER_CATEGORIES.map((cat) => {
                const counts = setCountsMap.get(cat.setNo) ?? {
                  pending: 0,
                  total: 0,
                };
                return (
                  <option key={cat.setNo} value={cat.setNo}>
                    Set {cat.setNo} · {cat.label} ({counts.pending}/
                    {counts.total})
                  </option>
                );
              })}
            </select>

            <div
              role="group"
              aria-label="Filter set queue"
              className="inline-flex rounded-[4px] border border-white/10 bg-[#070B14] p-0.5"
            >
              {(['all', 'pending', 'sold', 'unsold'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setQueueFilter(tab)}
                  className={`rounded-[2px] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
                    queueFilter === tab
                      ? 'bg-[#22D3EE] font-semibold text-[#070B14]'
                      : 'text-[#8B95AA] hover:text-[#E8ECF4]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {setQueuePlayers.length === 0 ? (
          <div className="p-8 text-center font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
            No players match this filter in Set {viewSetNo}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.08] bg-[#141C2F] font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Player</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Nationality</th>
                  <th className="px-4 py-3 text-right">Base Price</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-xs">
                {setQueuePlayers.map((rp) => {
                  const p = rp.players;
                  if (!p) return null;
                  const pName = `${p.first_name} ${p.last_name}`.trim();
                  const sTeam = rp.sold_to_team_id
                    ? teamMap.get(rp.sold_to_team_id)
                    : null;
                  const canPutOnBlock =
                    (rp.status === 'pending' || rp.status === 'unsold') &&
                    !lotInProgress &&
                    room.auction_open &&
                    !isBusy;

                  return (
                    <tr
                      key={rp.id}
                      className={`transition-colors hover:bg-[#141C2F]/40 ${
                        rp.id === state?.current_room_player_id
                          ? 'bg-[#22D3EE]/5'
                          : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 font-mono text-[#8B95AA] tabular-nums">
                        #{rp.sort_order}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] font-semibold text-[#22D3EE] whitespace-nowrap">
                        {p.player_code || '—'}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[#E8ECF4]">
                        {pName}
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
                      <td className="px-4 py-2.5">
                        <QueueStatusBadge
                          status={rp.status}
                          teamCode={sTeam?.short_code}
                          soldPrice={rp.sold_price_lakhs}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {(rp.status === 'pending' ||
                          rp.status === 'unsold') && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canPutOnBlock}
                            title={
                              !room.auction_open
                                ? 'Open the auction room first'
                                : lotInProgress
                                  ? 'Resolve the current lot first'
                                  : `Put ${pName} on the block`
                            }
                            onClick={() => handlePutPlayerOnBlock(rp.id)}
                          >
                            Put on block
                          </Button>
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

      {/* G. DANGER PANEL */}
      <Card className="border-red-500/35 bg-red-500/5 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <div>
              <h2 className="font-display text-2xl tracking-wide text-red-300">
                DANGER ZONE
              </h2>
              <p className="mt-0.5 text-xs text-[#8B95AA]">
                Wipe all sales, bids, and restore team purses back to Set 1 standby. Teams and members stay intact.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="md"
            disabled={isBusy}
            onClick={() => setFullResetOpen(true)}
            className="border-red-500/50 text-red-300 hover:border-red-400 hover:bg-red-500/15 hover:text-red-200"
          >
            Full auction reset
          </Button>
        </div>
      </Card>

      {/* CONFIRMATION MODALS */}
      <ConfirmModal
        open={openGateConfirm}
        onClose={() => setOpenGateConfirm(false)}
        loading={busyAction === 'toggle-gate'}
        eyebrow="ROOM ACCESS"
        title="OPEN AUCTION ROOM?"
        message="Opening the room lets franchises place live bids once you put a player on the block."
        confirmLabel="Open room"
        confirmTone="gold"
        onConfirm={() => {
          void runRpc(
            'toggle-gate',
            'set_auction_open',
            { p_room: room.id, p_open: true },
            'Auction room opened',
          ).then((ok) => {
            if (ok) setOpenGateConfirm(false);
          });
        }}
      />

      <ConfirmModal
        open={unsoldConfirm}
        onClose={() => setUnsoldConfirm(false)}
        loading={busyAction === 'mark-unsold'}
        eyebrow="BIDDING OVERRIDE"
        title="MARK ACTIVE LOT UNSOLD?"
        message={`${lotBids.length} bid(s) have already been placed on ${fullName || 'this player'}. Marking them UNSOLD will discard the current high bid.`}
        confirmLabel="Mark Unsold"
        confirmTone="danger"
        onConfirm={() => {
          void runRpc('mark-unsold', 'host_mark_unsold', {
            p_room: room.id,
          }).then((ok) => {
            if (ok) setUnsoldConfirm(false);
          });
        }}
      />

      <ConfirmModal
        open={restoreConfirm}
        onClose={() => setRestoreConfirm(false)}
        loading={busyAction === 'restore-sale'}
        eyebrow="DRS // RESTORE"
        title="RESTORE LAST SALE?"
        message="This will reverse the last resolved sale and return the player to active bidding so the auctioneer can reopen the gavel."
        confirmLabel="Restore sale"
        confirmTone="cyan"
        onConfirm={() => {
          void runRpc(
            'restore-sale',
            'host_restore_sale',
            { p_room: room.id },
            'Sale restored to block',
          ).then((ok) => {
            if (ok) setRestoreConfirm(false);
          });
        }}
      />

      <ConfirmModal
        open={forceAssignConfirm}
        onClose={() => setForceAssignConfirm(false)}
        loading={busyAction === 'force-assign'}
        eyebrow="ADMINISTRATIVE OVERRIDE"
        title="FORCE ASSIGN PLAYER?"
        message={`Assign ${fullName || 'current lot'} to ${
          forceTargetTeam
            ? `${forceTargetTeam.short_code} · ${forceTargetTeam.name}`
            : 'selected team'
        } for ${
          Number.isFinite(parsedForceLakhs) && parsedForceLakhs > 0
            ? formatLakhs(Math.round(parsedForceLakhs))
            : '—'
        }?`}
        confirmLabel="Confirm assignment"
        confirmTone="gold"
        onConfirm={() => {
          if (!forceAssignValid) return;
          void runRpc(
            'force-assign',
            'host_force_assign',
            {
              p_room: room.id,
              p_team_id: forceTeamId,
              p_lakhs: Math.round(parsedForceLakhs),
            },
            'Player assigned',
          ).then((ok) => {
            if (ok) setForceAssignConfirm(false);
          });
        }}
      />

      <FullResetModal
        open={fullResetOpen}
        onClose={() => setFullResetOpen(false)}
        roomId={room.id}
        onSuccess={refetch}
      />
    </div>
  );
}

function QueueStatusBadge({
  status,
  teamCode,
  soldPrice,
}: {
  status: RoomPlayerStatus;
  teamCode?: string | null;
  soldPrice?: number | null;
}) {
  if (status === 'live') {
    return <Badge tone="cyan">LIVE</Badge>;
  }
  if (status === 'sold') {
    return (
      <Badge tone="gold">
        SOLD
        {teamCode ? ` · ${teamCode}` : ''}
        {soldPrice ? ` · ${formatLakhs(soldPrice)}` : ''}
      </Badge>
    );
  }
  if (status === 'unsold') {
    return <Badge tone="danger">UNSOLD</Badge>;
  }
  return <Badge tone="neutral">PENDING</Badge>;
}
