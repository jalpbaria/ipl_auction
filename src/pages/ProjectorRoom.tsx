import {
  ArrowLeft,
  ArrowLeftRight,
  Maximize2,
  Minimize2,
  RefreshCw,
  Shield,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PlayerReveal } from '../components/auction/PlayerReveal';
import { TeamCrest } from '../components/host/TeamCrest';
import { ProjectorAuctionView } from '../components/projector/ProjectorAuctionView';
import { ProjectorLeaderboardView } from '../components/projector/ProjectorLeaderboardView';
import { ProjectorSquadsView } from '../components/projector/ProjectorSquadsView';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { getSkillInfo } from '../data/categories';
import { useAuction } from '../hooks/useAuction';
import { getSetCategoryInfo } from '../lib/auction';
import { formatLakhs } from '../lib/format';
import { playProjectorBidTick, playProjectorGavelSound } from '../lib/sound';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import { useToastStore } from '../store/toast';
import type {
  AccelStatus,
  DbTrade,
  ProjectorMode,
  RoomPlayerWithPlayer,
  TradeStatus,
} from '../types/database';

function formatIstClock12h(date: Date): string {
  return date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
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

export default function ProjectorRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const session = useAuthStore((s) => s.session);
  const showToast = useToastStore((s) => s.showToast);

  const {
    room,
    state,
    lot,
    teams,
    lotBids,
    soldLog,
    roomPlayers,
    latestNotice,
    offsetMs,
    reveal,
    accelStatus,
    accelSelectionEndsAt,
    accelProgress,
    tradeStatus,
    tradeEndsAt,
    setProgress,
    setsOverview,
    loading,
    error,
    refetch,
  } = useAuction(roomId, { role: 'team' });

  // Accelerated selecting team-pick counter + countdown + 6s complete card
  const [pickedTeamsCount, setPickedTeamsCount] = useState<number>(0);
  const [accelNowMs, setAccelNowMs] = useState(() => Date.now());
  const [showAccelCompleteCard, setShowAccelCompleteCard] = useState(false);
  const prevAccelStatusRef = useRef<AccelStatus | null>(null);
  const accelCompleteTimerRef = useRef<number | null>(null);

  // Trade window live trades + countdown + 6s closed card
  const [trades, setTrades] = useState<DbTrade[]>([]);
  const [tradeNowMs, setTradeNowMs] = useState(() => Date.now());
  const [showTradeClosedCard, setShowTradeClosedCard] = useState(false);
  const prevTradeStatusRef = useRef<TradeStatus | null>(null);
  const tradeClosedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (accelStatus !== 'selecting') return;
    setAccelNowMs(Date.now());
    const id = window.setInterval(() => setAccelNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [accelStatus]);

  useEffect(() => {
    if (tradeStatus !== 'open') return;
    setTradeNowMs(Date.now());
    const id = window.setInterval(() => setTradeNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [tradeStatus]);

  useEffect(() => {
    if (!supabase || !roomId || (tradeStatus !== 'open' && !showTradeClosedCard)) {
      return;
    }

    const client = supabase;
    let cancelled = false;

    const loadTrades = async () => {
      const { data, error: tradeErr } = await client
        .from('trades')
        .select(
          'id, room_id, from_team_id, to_team_id, give_ids, get_ids, status, created_at, resolved_at',
        )
        .eq('room_id', roomId)
        .order('created_at', { ascending: false });

      if (cancelled || tradeErr || !data) return;
      const normalized = (data as DbTrade[]).map((t) => ({
        ...t,
        give_ids: Array.isArray(t.give_ids) ? t.give_ids : [],
        get_ids: Array.isArray(t.get_ids) ? t.get_ids : [],
      }));
      setTrades(normalized);
    };

    void loadTrades();

    const channel = client
      .channel(`projector-trades-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void loadTrades();
        },
      )
      .subscribe();

    const pollId = window.setInterval(() => {
      void loadTrades();
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      void client.removeChannel(channel);
    };
  }, [roomId, tradeStatus, showTradeClosedCard]);

  useEffect(() => {
    const prev = prevTradeStatusRef.current;
    if (prev === 'open' && tradeStatus === 'closed') {
      if (tradeClosedTimerRef.current !== null) {
        window.clearTimeout(tradeClosedTimerRef.current);
      }
      setShowTradeClosedCard(true);
      tradeClosedTimerRef.current = window.setTimeout(() => {
        tradeClosedTimerRef.current = null;
        setShowTradeClosedCard(false);
      }, 6_000);
    }
    prevTradeStatusRef.current = tradeStatus;
  }, [tradeStatus]);

  useEffect(() => {
    if (!supabase || !roomId || accelStatus !== 'selecting') {
      setPickedTeamsCount(0);
      return;
    }

    const client = supabase;
    let cancelled = false;

    const loadPickCounts = async () => {
      const { data, error: pickErr } = await client
        .from('accel_picks')
        .select('team_id')
        .eq('room_id', roomId);
      if (cancelled || pickErr || !data) return;
      const distinct = new Set<string>();
      for (const row of data as { team_id: string }[]) {
        if (row.team_id) distinct.add(row.team_id);
      }
      setPickedTeamsCount(distinct.size);
    };

    void loadPickCounts();

    const channel = client
      .channel(`projector-accel-picks-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'accel_picks',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void loadPickCounts();
        },
      )
      .subscribe();

    const pollId = window.setInterval(() => {
      void loadPickCounts();
    }, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      void client.removeChannel(channel);
    };
  }, [roomId, accelStatus]);

  useEffect(() => {
    const prev = prevAccelStatusRef.current;
    if (prev === 'live' && accelStatus === 'done') {
      if (accelCompleteTimerRef.current !== null) {
        window.clearTimeout(accelCompleteTimerRef.current);
      }
      setShowAccelCompleteCard(true);
      accelCompleteTimerRef.current = window.setTimeout(() => {
        accelCompleteTimerRef.current = null;
        setShowAccelCompleteCard(false);
      }, 6_000);
    }
    prevAccelStatusRef.current = accelStatus;
  }, [accelStatus]);

  useEffect(() => {
    return () => {
      if (accelCompleteTimerRef.current !== null) {
        window.clearTimeout(accelCompleteTimerRef.current);
      }
      if (tradeClosedTimerRef.current !== null) {
        window.clearTimeout(tradeClosedTimerRef.current);
      }
    };
  }, []);

  // Viewport scale to fit fixed 1920x1080 canvas with letterboxing
  const [scale, setScale] = useState<number>(() => {
    if (typeof window === 'undefined') return 1;
    return Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  });

  useEffect(() => {
    const updateScale = () => {
      setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // Mouse idle detection (hide cursor after 3 seconds, show Replay only while moving)
  const [mouseActive, setMouseActive] = useState(true);
  const mouseIdleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const markActive = () => {
      setMouseActive(true);
      if (mouseIdleTimerRef.current !== null) {
        window.clearTimeout(mouseIdleTimerRef.current);
      }
      mouseIdleTimerRef.current = window.setTimeout(() => {
        setMouseActive(false);
      }, 3_000);
    };

    markActive();
    window.addEventListener('mousemove', markActive);
    window.addEventListener('mousedown', markActive);

    return () => {
      window.removeEventListener('mousemove', markActive);
      window.removeEventListener('mousedown', markActive);
      if (mouseIdleTimerRef.current !== null) {
        window.clearTimeout(mouseIdleTimerRef.current);
      }
    };
  }, []);

  // Live IST 12h clock
  const [istClock, setIstClock] = useState<string>(() =>
    formatIstClock12h(new Date()),
  );
  useEffect(() => {
    const id = window.setInterval(() => {
      setIstClock(formatIstClock12h(new Date()));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Sound state (default muted; browsers require user click to unlock Web Audio)
  const [soundEnabled, setSoundEnabled] = useState(false);
  const prevBidIdRef = useRef<string | null>(null);
  const prevPhaseRef = useRef<string | null>(null);

  useEffect(() => {
    const latestBidId = lotBids[0]?.id ?? null;
    if (
      soundEnabled &&
      latestBidId &&
      prevBidIdRef.current !== null &&
      latestBidId !== prevBidIdRef.current &&
      state?.phase === 'bidding'
    ) {
      playProjectorBidTick();
    }
    prevBidIdRef.current = latestBidId;
  }, [lotBids, soundEnabled, state?.phase]);

  useEffect(() => {
    const currentPhase = state?.phase ?? null;
    if (
      soundEnabled &&
      currentPhase === 'sold' &&
      prevPhaseRef.current !== null &&
      prevPhaseRef.current !== 'sold'
    ) {
      playProjectorGavelSound();
    }
    prevPhaseRef.current = currentPhase;
  }, [state?.phase, soundEnabled]);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) {
      playProjectorBidTick();
    }
  };

  // Fullscreen toggle + F shortcut
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false,
  );

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      showToast({
        title: 'Fullscreen blocked',
        description: 'Press F11 or click directly inside the projector window.',
        tone: 'warning',
      });
    }
  }, [showToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
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
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        void handleToggleFullscreen();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleToggleFullscreen]);

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

  const acceptedTrades = useMemo(
    () => trades.filter((t) => t.status === 'accepted'),
    [trades],
  );

  // Loading Skeleton (no infinite spinner)
  if (loading) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-[#070B14] flex items-center justify-center p-8">
        <div className="w-full max-w-4xl space-y-5">
          <div className="h-16 animate-pulse rounded-[4px] border border-white/10 bg-[#0E1524]" />
          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-5 h-[420px] animate-pulse rounded-[4px] border border-white/10 bg-[#0E1524]" />
            <div className="col-span-7 h-[420px] animate-pulse rounded-[4px] border border-white/10 bg-[#0E1524]" />
          </div>
          <div className="h-14 animate-pulse rounded-[4px] border border-white/10 bg-[#0E1524]" />
        </div>
      </div>
    );
  }

  // Error State with Retry
  if (error || !room) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-[#070B14] broadcast-grid flex items-center justify-center p-6">
        <Card brackets bracketTone="gold" className="w-full max-w-xl p-8">
          <Badge tone="danger">PROJECTOR FEED ERROR</Badge>
          <h1 className="mt-3 font-display text-4xl tracking-wide text-[#E8ECF4]">
            UNABLE TO LOAD PROJECTOR
          </h1>
          <p className="mt-2 text-sm text-red-300">
            {error || 'The requested auction room could not be loaded.'}
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Button variant="cyan" size="md" onClick={() => void refetch()}>
              <RefreshCw className="h-4 w-4" />
              <span>Retry</span>
            </Button>
            <Link to="/rooms">
              <Button variant="outline" size="md">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Rooms</span>
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Host-only access gate
  if (!session || room.host_id !== session.user.id) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-[#070B14] broadcast-grid flex items-center justify-center p-6">
        <Card brackets bracketTone="gold" className="w-full max-w-xl p-8">
          <Badge tone="danger">HOST ACCOUNT REQUIRED</Badge>
          <h1 className="mt-3 font-display text-4xl tracking-wide text-[#E8ECF4]">
            PROJECTOR ACCESS RESTRICTED
          </h1>
          <p className="mt-3 text-base text-[#E8ECF4]">
            Open this page with the host account
          </p>
          <div className="mt-6">
            <Link to="/rooms">
              <Button variant="gold" size="md">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Rooms</span>
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const projectorMode: ProjectorMode = room.projector_mode ?? 'auction';
  const phase = state?.phase ?? 'idle';
  const currentSetInfo = getSetCategoryInfo(state?.current_set_no ?? 1);

  // Build center broadcast ticker text
  let tickerText = 'AWAITING FIRST SALE';
  if (phase === 'bidding' && lot?.players) {
    const p = lot.players;
    const pName = `${p.first_name} ${p.last_name}`.trim();
    if (reveal.active) {
      tickerText = `NEXT UP: ${pName} (${p.skill}) - BASE ${formatLakhs(lot.base_price_lakhs)}`;
    } else {
      const bidAmt = state?.current_bid_team_id
        ? state.current_bid_lakhs
        : lot.base_price_lakhs;
      tickerText = `LIVE HAMMER: ${pName} (${p.skill}) - CURRENT BID ${formatLakhs(bidAmt)}`;
    }
  } else if (soldLog.length > 0) {
    const lastSale = soldLog[0];
    const lp = lastSale.players;
    const lName = lp ? `${lp.first_name} ${lp.last_name}`.trim() : 'PLAYER';
    const buyer = lastSale.sold_to_team_id
      ? teamMap.get(lastSale.sold_to_team_id)
      : null;
    const price = lastSale.sold_price_lakhs ?? 0;
    tickerText = `LAST SOLD: ${lName}${lp ? ` (${lp.skill})` : ''} TO ${buyer?.short_code || 'FRANCHISE'} FOR ${formatLakhs(price)}`;
  }

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center overflow-hidden bg-[#070B14] select-none ${
        mouseActive ? '' : 'cursor-none'
      }`}
    >
      {/* Fixed 1920x1080 Design Canvas scaled cleanly to window */}
      <div
        style={{
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
        className="relative flex shrink-0 flex-col overflow-hidden border border-white/[0.08] bg-[#070B14] text-[#E8ECF4]"
      >
        {/* TOP BAR (ALWAYS VISIBLE) */}
        <header className="shrink-0 flex h-[84px] items-center justify-between gap-6 border-b border-white/15 bg-[#0E1524] px-8">
          {/* Left: Logo + LIVE BROADCAST + Set & Room */}
          <div className="flex items-center gap-5 shrink-0">
            <div className="flex items-center gap-3 rounded-[4px] border border-[#F5B921]/45 bg-[#070B14] px-4 py-2">
              <Shield className="h-7 w-7 text-[#F5B921]" aria-hidden="true" />
              <span className="font-display text-4xl leading-none tracking-[0.06em] text-[#E8ECF4]">
                IPL <span className="text-[#F5B921]">AUCTION</span>
              </span>
            </div>

            <div className="flex items-center gap-2.5 rounded-[4px] border border-red-500/60 bg-red-500/15 px-3.5 py-1.5">
              <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
              <span className="font-mono text-base font-bold uppercase tracking-[0.12em] text-red-300">
                LIVE BROADCAST
              </span>
            </div>

            <div className="flex items-center gap-3 border-l border-white/15 pl-5">
              {tradeStatus === 'open' ? (
                <span className="rounded-[2px] border border-emerald-400/60 bg-emerald-500/15 px-3 py-1 font-mono text-lg font-bold uppercase tracking-[0.08em] text-emerald-300">
                  TRADE WINDOW
                </span>
              ) : accelStatus === 'live' || accelStatus === 'selecting' ? (
                <span className="rounded-[2px] border border-red-500/60 bg-red-500/15 px-3 py-1 font-mono text-lg font-bold uppercase tracking-[0.08em] text-red-300">
                  ACCELERATED ROUND
                </span>
              ) : (
                <span className="rounded-[2px] border border-[#22D3EE]/45 bg-[#070B14] px-3 py-1 font-mono text-lg font-bold uppercase tracking-[0.08em] text-[#22D3EE]">
                  SET {state?.current_set_no ?? 1} · {currentSetInfo?.label ?? 'POOL'}
                </span>
              )}
              <span className="max-w-[260px] truncate font-mono text-xl font-semibold uppercase tracking-[0.08em] text-[#E8ECF4]">
                {room.name}
              </span>
            </div>
          </div>

          {/* Center Ticker */}
          <div className="min-w-0 flex-1 rounded-[4px] border border-white/10 bg-[#070B14] px-5 py-2 text-center">
            <p className="truncate font-mono text-[22px] font-bold uppercase tracking-[0.06em] text-[#F5B921] tabular-nums">
              {tradeStatus === 'open'
                ? `TRADE WINDOW LIVE · ${trades.length} OFFERS MADE · ${acceptedTrades.length} COMPLETED`
                : tickerText}
            </p>
          </div>

          {/* Right: PAUSE chip, IST Clock, Sound & Fullscreen */}
          <div className="flex items-center gap-4 shrink-0">
            {phase === 'paused' && (
              <span className="rounded-[4px] border border-[#F5B921] bg-[#F5B921] px-4 py-1 font-mono text-lg font-bold uppercase tracking-[0.12em] text-[#070B14]">
                PAUSE
              </span>
            )}

            <div className="rounded-[4px] border border-white/10 bg-[#070B14] px-4 py-1.5 text-right">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B95AA]">
                IST LIVE
              </p>
              <p className="font-mono text-xl font-bold text-[#E8ECF4] tabular-nums">
                {istClock}
              </p>
            </div>

            <button
              type="button"
              onClick={handleToggleSound}
              aria-label={soundEnabled ? 'Mute projector sound' : 'Enable projector sound'}
              title={soundEnabled ? 'Sound on (click to mute)' : 'Sound muted (click to enable)'}
              className={`inline-flex h-12 items-center gap-2 rounded-[4px] border px-4 font-mono text-base font-semibold uppercase tracking-[0.08em] transition-colors ${
                soundEnabled
                  ? 'border-[#22D3EE] bg-[#22D3EE]/15 text-[#22D3EE]'
                  : 'border-white/20 bg-[#070B14] text-[#8B95AA] hover:border-white/40 hover:text-[#E8ECF4]'
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="h-5 w-5" />
              ) : (
                <VolumeX className="h-5 w-5" />
              )}
              <span>{soundEnabled ? 'SFX ON' : 'MUTED'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleToggleFullscreen()}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title="Toggle fullscreen (F)"
              className="inline-flex h-12 items-center gap-2 rounded-[4px] border border-[#F5B921]/50 bg-[#070B14] px-4 font-mono text-base font-semibold uppercase tracking-[0.08em] text-[#F5B921] transition-colors hover:bg-[#F5B921] hover:text-[#070B14]"
            >
              {isFullscreen ? (
                <Minimize2 className="h-5 w-5" />
              ) : (
                <Maximize2 className="h-5 w-5" />
              )}
              <span>FS (F)</span>
            </button>
          </div>
        </header>

        {/* MODE VIEWPORT */}
        <div className="flex flex-1 min-h-0 flex-col">
          {projectorMode === 'squads' ? (
            <ProjectorSquadsView
              room={room}
              teams={teams}
              roomPlayers={roomPlayers}
            />
          ) : projectorMode === 'leaderboard' ? (
            <ProjectorLeaderboardView
              roomId={room.id}
              mouseActive={mouseActive}
            />
          ) : tradeStatus === 'open' ? (
            <div className="relative flex flex-1 min-h-0 flex-col bg-[#070B14] broadcast-grid px-14 py-10">
              <div className="grid flex-1 min-h-0 grid-cols-12 gap-10 items-stretch">
                {/* Left Column: Title, Countdown, Stats (5 cols) */}
                <div className="col-span-5 flex flex-col justify-between rounded-[4px] border-2 border-emerald-400/65 bg-[#0E1524] p-12">
                  <div>
                    <span className="inline-flex items-center gap-2.5 rounded-[2px] border border-emerald-400/60 bg-emerald-500/15 px-4 py-1.5 font-mono text-lg font-bold uppercase tracking-[0.16em] text-emerald-300">
                      <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
                      <span>LIVE SWAP WINDOW</span>
                    </span>
                    <h1 className="mt-6 font-display text-[104px] leading-none tracking-[0.04em] text-[#E8ECF4]">
                      TRADE <span className="text-[#F5B921]">WINDOW</span>
                    </h1>
                    <p className="mt-4 font-sans text-2xl text-[#8B95AA] leading-relaxed">
                      Franchises may swap 1 to 3 players for the same count. Overseas caps enforced on both squads.
                    </p>
                  </div>

                  <div className="my-6 rounded-[4px] border-2 border-[#22D3EE]/60 bg-[#070B14] px-10 py-8 text-center">
                    <p className="font-mono text-lg uppercase tracking-[0.2em] text-[#22D3EE]">
                      TIME REMAINING
                    </p>
                    <p className="mt-2 font-display text-[148px] leading-none tracking-wide text-[#F5B921] tabular-nums">
                      {formatAccelCountdown(tradeEndsAt, tradeNowMs + offsetMs)}
                    </p>
                  </div>

                  <div className="rounded-[4px] border border-white/15 bg-[#070B14] px-8 py-5 text-center">
                    <p className="font-mono text-2xl font-bold uppercase tracking-[0.08em] text-[#E8ECF4] tabular-nums">
                      <span className="text-[#22D3EE]">{trades.length}</span>{' '}
                      {trades.length === 1 ? 'offer' : 'offers'} made,{' '}
                      <span className="text-emerald-400">{acceptedTrades.length}</span>{' '}
                      {acceptedTrades.length === 1 ? 'trade' : 'trades'} completed
                    </p>
                  </div>
                </div>

                {/* Right Column: Live Feed of Last 8 Accepted Trades (7 cols) */}
                <div className="col-span-7 flex min-h-0 flex-col rounded-[4px] border border-white/15 bg-[#0E1524] p-10">
                  <div className="flex items-center justify-between border-b border-white/15 pb-5">
                    <div className="flex items-center gap-3.5">
                      <ArrowLeftRight className="h-7 w-7 text-[#22D3EE]" />
                      <h2 className="font-display text-5xl leading-none tracking-[0.05em] text-[#E8ECF4]">
                        COMPLETED TRADES FEED
                      </h2>
                    </div>
                    <span className="font-mono text-lg uppercase tracking-[0.12em] text-[#8B95AA]">
                      LAST 8 SWAPS
                    </span>
                  </div>

                  {acceptedTrades.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center text-center">
                      <ArrowLeftRight className="h-14 w-14 text-[#8B95AA]/60" />
                      <p className="mt-5 font-display text-5xl tracking-wide text-[#8B95AA]">
                        AWAITING FIRST ACCEPTED TRADE
                      </p>
                      <p className="mt-2 font-mono text-xl text-[#8B95AA]/80">
                        Confirmed player-for-player swaps will broadcast here live
                      </p>
                    </div>
                  ) : (
                    <div className="mt-6 grid grid-cols-1 gap-4 overflow-hidden">
                      {acceptedTrades.slice(0, 8).map((tr) => {
                        const fromTeam = teamMap.get(tr.from_team_id);
                        const toTeam = teamMap.get(tr.to_team_id);
                        return (
                          <div
                            key={tr.id}
                            className="rounded-[4px] border border-[#22D3EE]/35 bg-[#070B14] px-6 py-4"
                          >
                            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-2.5">
                              <div className="flex items-center gap-3">
                                {fromTeam && (
                                  <TeamCrest shortCode={fromTeam.short_code} size="sm" />
                                )}
                                <span className="font-display text-3xl leading-none tracking-wide text-[#E8ECF4]">
                                  {fromTeam?.short_code ?? 'TEAM'} and{' '}
                                  {toTeam?.short_code ?? 'TEAM'} swapped
                                </span>
                                {toTeam && (
                                  <TeamCrest shortCode={toTeam.short_code} size="sm" />
                                )}
                              </div>
                              <span className="rounded-[2px] border border-emerald-400/50 bg-emerald-500/15 px-3 py-0.5 font-mono text-sm font-bold uppercase tracking-[0.1em] text-emerald-300">
                                {tr.give_ids.length} FOR {tr.get_ids.length}
                              </span>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-6">
                              <div className="space-y-1">
                                <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
                                  {fromTeam?.short_code ?? 'FROM'} SENT
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {tr.give_ids.map((id) => {
                                    const p = rpMap.get(id)?.players;
                                    const skill = getSkillInfo(p?.skill);
                                    return (
                                      <span
                                        key={id}
                                        className="inline-flex items-center gap-1.5 rounded-[2px] border border-white/10 bg-[#0E1524] px-2.5 py-1 font-sans text-base font-semibold text-[#E8ECF4]"
                                      >
                                        <span>
                                          {p
                                            ? `${p.first_name} ${p.last_name}`.trim()
                                            : id.slice(0, 8)}
                                        </span>
                                        {skill && (
                                          <span className="font-mono text-xs uppercase text-[#22D3EE]">
                                            · {skill.value}
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="space-y-1">
                                <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
                                  {toTeam?.short_code ?? 'TO'} SENT
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {tr.get_ids.map((id) => {
                                    const p = rpMap.get(id)?.players;
                                    const skill = getSkillInfo(p?.skill);
                                    return (
                                      <span
                                        key={id}
                                        className="inline-flex items-center gap-1.5 rounded-[2px] border border-white/10 bg-[#0E1524] px-2.5 py-1 font-sans text-base font-semibold text-[#E8ECF4]"
                                      >
                                        <span>
                                          {p
                                            ? `${p.first_name} ${p.last_name}`.trim()
                                            : id.slice(0, 8)}
                                        </span>
                                        {skill && (
                                          <span className="font-mono text-xs uppercase text-[#F5B921]">
                                            · {skill.value}
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : accelStatus === 'selecting' ? (
            <div className="relative flex flex-1 min-h-0 flex-col items-center justify-center bg-[#070B14] broadcast-grid px-16 py-12">
              <div className="relative w-full max-w-[1360px] rounded-[4px] border-2 border-amber-400/70 bg-[#0E1524] px-16 py-14 text-center">
                <span className="inline-block rounded-[2px] border border-amber-400/60 bg-amber-500/15 px-5 py-1.5 font-mono text-xl font-bold uppercase tracking-[0.18em] text-amber-300">
                  SELECTION WINDOW OPEN
                </span>
                <h1 className="mt-5 font-display text-[112px] leading-none tracking-[0.05em] text-[#E8ECF4]">
                  ACCELERATED <span className="text-[#F5B921]">ROUND</span>
                </h1>
                <p className="mt-3 font-sans text-[32px] text-[#8B95AA]">
                  Teams are choosing the players they want back
                </p>

                <div className="mx-auto mt-10 inline-block rounded-[4px] border-2 border-[#22D3EE]/60 bg-[#070B14] px-16 py-8">
                  <p className="font-mono text-lg uppercase tracking-[0.2em] text-[#22D3EE]">
                    TIME REMAINING
                  </p>
                  <p className="mt-2 font-display text-[152px] leading-none tracking-wide text-[#F5B921] tabular-nums">
                    {formatAccelCountdown(accelSelectionEndsAt, accelNowMs + offsetMs)}
                  </p>
                </div>

                <div className="mx-auto mt-10 grid max-w-[960px] grid-cols-2 gap-6">
                  <div className="rounded-[4px] border border-white/15 bg-[#070B14] px-8 py-6">
                    <p className="font-display text-6xl leading-none text-[#E8ECF4] tabular-nums">
                      {accelProgress?.unsold_total ?? 0}
                    </p>
                    <p className="mt-2 font-mono text-xl uppercase tracking-[0.12em] text-[#8B95AA]">
                      UNSOLD PLAYERS
                    </p>
                  </div>

                  <div className="rounded-[4px] border border-white/15 bg-[#070B14] px-8 py-6">
                    <p className="font-display text-6xl leading-none text-[#22D3EE] tabular-nums">
                      {pickedTeamsCount} of {teams.filter((t) => t.status === 'active').length}
                    </p>
                    <p className="mt-2 font-mono text-xl uppercase tracking-[0.12em] text-[#8B95AA]">
                      TEAMS HAVE MADE THEIR PICKS
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative flex flex-1 min-h-0 flex-col">
              <ProjectorAuctionView
                room={room}
                state={state}
                lot={lot}
                teams={teams}
                lotBids={lotBids}
                roomPlayers={roomPlayers}
                latestNotice={latestNotice}
                offsetMs={offsetMs}
                setProgress={setProgress}
                setsOverview={setsOverview}
                accelStatus={accelStatus}
                accelProgress={accelProgress}
              />
              {room.auction_open && reveal.active && (
                <div className="absolute inset-0 z-40 flex bg-[#070B14]">
                  <PlayerReveal
                    lot={lot}
                    setProgress={setProgress}
                    durationMs={reveal.durationMs}
                    elapsedMs={reveal.elapsedMs}
                    variant="projector"
                    soundOn={soundEnabled}
                    accelMode={accelStatus === 'live'}
                    accelRemaining={accelProgress?.queue_remaining ?? 0}
                  />
                </div>
              )}
              {showAccelCompleteCard && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#070B14]/95 px-12">
                  <div className="w-full max-w-[1160px] rounded-[4px] border-2 border-emerald-400/70 bg-[#0E1524] px-16 py-16 text-center">
                    <span className="inline-block rounded-[2px] border border-emerald-400/60 bg-emerald-500/15 px-5 py-1.5 font-mono text-xl font-bold uppercase tracking-[0.16em] text-emerald-300">
                      SECOND CHANCE AUCTION CONCLUDED
                    </span>
                    <h2 className="mt-6 font-display text-[112px] leading-none tracking-[0.05em] text-[#E8ECF4]">
                      ACCELERATED ROUND{' '}
                      <span className="text-[#F5B921]">COMPLETE</span>
                    </h2>
                    <p className="mt-5 font-mono text-2xl uppercase tracking-[0.14em] text-[#8B95AA]">
                      ALL NOMINATED LOTS RESOLVED · {accelProgress?.queue_total ?? 0} LOTS AUCTIONED
                    </p>
                  </div>
                </div>
              )}
              {showTradeClosedCard && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#070B14]/95 px-12">
                  <div className="w-full max-w-[1160px] rounded-[4px] border-2 border-[#F5B921]/75 bg-[#0E1524] px-16 py-16 text-center">
                    <span className="inline-block rounded-[2px] border border-[#F5B921]/60 bg-[#F5B921]/15 px-5 py-1.5 font-mono text-xl font-bold uppercase tracking-[0.16em] text-[#F5B921]">
                      PLAYER SWAP PHASE CONCLUDED
                    </span>
                    <h2 className="mt-6 font-display text-[112px] leading-none tracking-[0.05em] text-[#E8ECF4]">
                      TRADE WINDOW <span className="text-[#F5B921]">CLOSED</span>
                    </h2>
                    <p className="mt-5 font-mono text-2xl uppercase tracking-[0.14em] text-[#8B95AA] tabular-nums">
                      {acceptedTrades.length}{' '}
                      {acceptedTrades.length === 1 ? 'TRADE COMPLETED' : 'TRADES COMPLETED'} · TEAMS REBUILDING PLAYING XI
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
