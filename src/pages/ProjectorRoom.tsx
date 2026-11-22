import {
  ArrowLeft,
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
import { ProjectorAuctionView } from '../components/projector/ProjectorAuctionView';
import { ProjectorLeaderboardView } from '../components/projector/ProjectorLeaderboardView';
import { ProjectorSquadsView } from '../components/projector/ProjectorSquadsView';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useAuction } from '../hooks/useAuction';
import { getSetCategoryInfo } from '../lib/auction';
import { formatLakhs } from '../lib/format';
import { playProjectorBidTick, playProjectorGavelSound } from '../lib/sound';
import { useAuthStore } from '../store/auth';
import { useToastStore } from '../store/toast';
import type { ProjectorMode } from '../types/database';

function formatIstClock12h(date: Date): string {
  return date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
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
    setProgress,
    setsOverview,
    loading,
    error,
    refetch,
  } = useAuction(roomId, { role: 'team' });

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
              <span className="rounded-[2px] border border-[#22D3EE]/45 bg-[#070B14] px-3 py-1 font-mono text-lg font-bold uppercase tracking-[0.08em] text-[#22D3EE]">
                SET {state?.current_set_no ?? 1} · {currentSetInfo?.label ?? 'POOL'}
              </span>
              <span className="max-w-[260px] truncate font-mono text-xl font-semibold uppercase tracking-[0.08em] text-[#E8ECF4]">
                {room.name}
              </span>
            </div>
          </div>

          {/* Center Ticker */}
          <div className="min-w-0 flex-1 rounded-[4px] border border-white/10 bg-[#070B14] px-5 py-2 text-center">
            <p className="truncate font-mono text-[22px] font-bold uppercase tracking-[0.06em] text-[#F5B921] tabular-nums">
              {tickerText}
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
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
