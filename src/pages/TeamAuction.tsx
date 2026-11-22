import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Gavel,
  Lock,
  RefreshCw,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Countdown } from '../components/auction/Countdown';
import { PlayerCard } from '../components/auction/PlayerCard';
import { PlayerReveal } from '../components/auction/PlayerReveal';
import { getTeamPalette, TeamCrest } from '../components/host/TeamCrest';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { CornerBrackets } from '../components/ui/CornerBrackets';
import { Tag } from '../components/ui/Tag';
import { getCategoryInfo, getSkillInfo } from '../data/categories';
import { useAuction } from '../hooks/useAuction';
import {
  formatStatValue,
  getSetCategoryInfo,
  nextBid,
  PHASE_LABEL,
  remainingMs,
} from '../lib/auction';
import { formatLakhs } from '../lib/format';
import { playProjectorBidTick } from '../lib/sound';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import { useToastStore } from '../store/toast';
import type { DbTeam } from '../types/database';

type MyTeamSummary = Pick<
  DbTeam,
  'id' | 'room_id' | 'short_code' | 'name' | 'leader_name' | 'status'
>;

type RightTab = 'up-next' | 'sold-log' | 'franchises';

function isLightHex(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return false;
  return r * 0.299 + g * 0.587 + b * 0.114 > 170;
}

function formatCountdownDuration(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) return `${hrs}h ${pad(mins)}m ${pad(secs)}s`;
  return `${pad(mins)}m ${pad(secs)}s`;
}

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

function formatNoticeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function TeamAuction() {
  const { roomId } = useParams<{ roomId: string }>();
  const session = useAuthStore((s) => s.session);
  const showToast = useToastStore((s) => s.showToast);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const raiseBtnRef = useRef<HTMLButtonElement | null>(null);

  // Explicit active-team gate lookup
  const [verifiedTeam, setVerifiedTeam] = useState<MyTeamSummary | null>(null);
  const [teamCheckLoading, setTeamCheckLoading] = useState(true);
  const [teamCheckError, setTeamCheckError] = useState<string | null>(null);
  const [notActiveMember, setNotActiveMember] = useState(false);

  // Realtime auction room data (team role: never fetches pending players)
  const {
    room,
    state,
    lot,
    teams,
    finance,
    lotBids,
    soldLog,
    roomPlayers,
    latestNotice,
    connectionStatus,
    offsetMs,
    reveal,
    setProgress,
    setsOverview,
    setsLoading,
    setsError,
    refetchSets,
    loading: auctionLoading,
    error: auctionError,
    refetch,
  } = useAuction(roomId, { role: 'team' });

  // UI state
  const [rightTab, setRightTab] = useState<RightTab>('up-next');
  const [soldRankingMode, setSoldRankingMode] = useState(false);
  const [squadDrawerOpen, setSquadDrawerOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  // Bid submission anti-double-click + state wait
  const [cooldownActive, setCooldownActive] = useState(false);
  const [waitingNextState, setWaitingNextState] = useState(false);
  const submittedBidSeqRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const bidSafetyTimerRef = useRef<number | null>(null);

  // Result overlay (~4s)
  const [resultOverlayKey, setResultOverlayKey] = useState<string | null>(null);
  const resultOverlayTimerRef = useRef<number | null>(null);

  // Live clock tick for locked notice countdown & timer-zero disable guard
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  // Auto-resolve timer refs (team fallback 500-1500ms after 0)
  const resolvedLotKeyRef = useRef<string | null>(null);
  const autoResolveTimerRef = useRef<number | null>(null);
  const autoResolveFallbackRefetchRef = useRef<number | null>(null);

  const verifyMembership = useCallback(async () => {
    if (!supabase || !roomId || !session?.user.id) {
      setVerifiedTeam(null);
      setTeamCheckError('Missing room or session details.');
      setTeamCheckLoading(false);
      return;
    }

    setTeamCheckLoading(true);
    setTeamCheckError(null);
    setNotActiveMember(false);

    try {
      const { data, error } = await supabase
        .from('teams')
        .select('id, room_id, short_code, name, leader_name, status')
        .eq('room_id', roomId)
        .eq('leader_id', session.user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (error) {
        setVerifiedTeam(null);
        setTeamCheckError(error.message);
        return;
      }

      if (!data) {
        setVerifiedTeam(null);
        setNotActiveMember(true);
        return;
      }

      setVerifiedTeam(data as MyTeamSummary);
    } catch (err) {
      setTeamCheckError(
        err instanceof Error ? err.message : 'Unable to verify team access.',
      );
    } finally {
      setTeamCheckLoading(false);
    }
  }, [roomId, session?.user.id]);

  useEffect(() => {
    void verifyMembership();
  }, [verifyMembership]);

  // Watch live team status for removal while inside the auction room
  const liveTeamRow = useMemo(() => {
    if (!verifiedTeam) return null;
    return teams.find((t) => t.id === verifiedTeam.id) ?? null;
  }, [teams, verifiedTeam]);

  const activeTeam: MyTeamSummary | null = liveTeamRow ?? verifiedTeam;

  // Apply --team-primary and --team-secondary CSS variables
  const teamPalette = useMemo(
    () =>
      activeTeam
        ? getTeamPalette(activeTeam.short_code)
        : { primary: '#22D3EE', secondary: '#F5B921' },
    [activeTeam],
  );

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.style.setProperty('--team-primary', teamPalette.primary);
    el.style.setProperty('--team-secondary', teamPalette.secondary);
  }, [teamPalette]);

  // Clear waitingNextState once bid_seq advances or phase leaves bidding
  useEffect(() => {
    if (!waitingNextState || !state) return;
    if (
      submittedBidSeqRef.current !== null &&
      (state.bid_seq !== submittedBidSeqRef.current ||
        state.phase !== 'bidding')
    ) {
      setWaitingNextState(false);
      submittedBidSeqRef.current = null;
      if (bidSafetyTimerRef.current !== null) {
        window.clearTimeout(bidSafetyTimerRef.current);
        bidSafetyTimerRef.current = null;
      }
    }
  }, [state, waitingNextState]);

  // Cleanup bid timers on unmount
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current !== null) {
        window.clearTimeout(cooldownTimerRef.current);
      }
      if (bidSafetyTimerRef.current !== null) {
        window.clearTimeout(bidSafetyTimerRef.current);
      }
    };
  }, []);

  // Result overlay for ~4s on sold / unsold; immediately disappears when next lot starts
  useEffect(() => {
    if (resultOverlayTimerRef.current !== null) {
      window.clearTimeout(resultOverlayTimerRef.current);
      resultOverlayTimerRef.current = null;
    }

    if (!state || (state.phase !== 'sold' && state.phase !== 'unsold')) {
      setResultOverlayKey(null);
      return;
    }

    const key = `${state.current_room_player_id ?? 'none'}:${state.phase}:${state.updated_at}`;
    setResultOverlayKey(key);

    resultOverlayTimerRef.current = window.setTimeout(() => {
      resultOverlayTimerRef.current = null;
      setResultOverlayKey(null);
    }, 4000);

    return () => {
      if (resultOverlayTimerRef.current !== null) {
        window.clearTimeout(resultOverlayTimerRef.current);
        resultOverlayTimerRef.current = null;
      }
    };
  }, [state?.phase, state?.current_room_player_id, state?.updated_at]);

  // Team-side auto-close fallback: wait random 500-1500ms after timer hits 0, call resolve_expired_lot once per (lot, bid_seq)
  useEffect(() => {
    if (autoResolveTimerRef.current !== null) {
      window.clearTimeout(autoResolveTimerRef.current);
      autoResolveTimerRef.current = null;
    }
    if (autoResolveFallbackRefetchRef.current !== null) {
      window.clearTimeout(autoResolveFallbackRefetchRef.current);
      autoResolveFallbackRefetchRef.current = null;
    }

    if (
      !roomId ||
      !room?.auction_open ||
      !activeTeam ||
      !state ||
      state.phase !== 'bidding' ||
      !state.timer_ends_at ||
      reveal.active
    ) {
      return;
    }

    const lotKey = `${state.current_room_player_id ?? 'none'}:${state.bid_seq}`;

    const checkExpired = () => {
      if (!supabase || reveal.active) return;
      const ms = remainingMs(state, offsetMs);
      if (ms === null || ms > 0) return;

      if (resolvedLotKeyRef.current === lotKey) return;
      resolvedLotKeyRef.current = lotKey;

      const randomDelay = 500 + Math.floor(Math.random() * 1000);
      autoResolveTimerRef.current = window.setTimeout(() => {
        autoResolveTimerRef.current = null;
        if (!supabase) return;
        void (async () => {
          await supabase.rpc('resolve_expired_lot', { p_room: roomId });
          autoResolveFallbackRefetchRef.current = window.setTimeout(() => {
            autoResolveFallbackRefetchRef.current = null;
            void refetch();
          }, 1000);
        })();
      }, randomDelay);
    };

    checkExpired();
    const intervalId = window.setInterval(checkExpired, 150);

    return () => {
      window.clearInterval(intervalId);
      if (autoResolveTimerRef.current !== null) {
        window.clearTimeout(autoResolveTimerRef.current);
        autoResolveTimerRef.current = null;
      }
      if (autoResolveFallbackRefetchRef.current !== null) {
        window.clearTimeout(autoResolveFallbackRefetchRef.current);
        autoResolveFallbackRefetchRef.current = null;
      }
    };
  }, [
    roomId,
    room?.auction_open,
    activeTeam,
    state,
    offsetMs,
    reveal.active,
    refetch,
  ]);

  // Derived data (my finance ONLY — never access another team's finance)
  const myFinance = useMemo(() => {
    if (!activeTeam) return null;
    return finance.find((f) => f.team_id === activeTeam.id) ?? null;
  }, [finance, activeTeam]);

  const teamMap = useMemo(() => {
    const map = new Map<string, DbTeam>();
    for (const t of teams) map.set(t.id, t);
    return map;
  }, [teams]);

  const squadCountsByTeam = useMemo(() => {
    const map = new Map<string, number>();
    for (const rp of roomPlayers) {
      if (rp.status === 'sold' && rp.sold_to_team_id) {
        map.set(
          rp.sold_to_team_id,
          (map.get(rp.sold_to_team_id) ?? 0) + 1,
        );
      }
    }
    return map;
  }, [roomPlayers]);

  const mySquad = useMemo(() => {
    if (!activeTeam) return [];
    return roomPlayers.filter(
      (rp) => rp.status === 'sold' && rp.sold_to_team_id === activeTeam.id,
    );
  }, [roomPlayers, activeTeam]);

  const myOverseasCount = useMemo(
    () => mySquad.filter((rp) => rp.players?.is_overseas).length,
    [mySquad],
  );

  const myTotalSpent = useMemo(() => {
    if (myFinance) return myFinance.spent_lakhs;
    return mySquad.reduce((acc, rp) => acc + (rp.sold_price_lakhs ?? 0), 0);
  }, [myFinance, mySquad]);

  const otherFranchises = useMemo(() => {
    if (!activeTeam) return [];
    return teams.filter((t) => t.id !== activeTeam.id);
  }, [teams, activeTeam]);

  const soldList = useMemo(() => {
    if (!soldRankingMode) return soldLog;
    return [...soldLog].sort(
      (a, b) => (b.sold_price_lakhs ?? 0) - (a.sold_price_lakhs ?? 0),
    );
  }, [soldLog, soldRankingMode]);

  const phase = state?.phase ?? 'idle';
  const nextAmount = lot
    ? nextBid(state, lot.base_price_lakhs)
    : 0;

  const msRemainingLive = useMemo(() => {
    // Re-evaluate against current clock offset using nowMs tick
    void nowMs;
    return remainingMs(state, offsetMs);
  }, [state, offsetMs, nowMs]);

  const iHoldHighestBid = Boolean(
    activeTeam &&
      state?.current_bid_team_id &&
      state.current_bid_team_id === activeTeam.id &&
      (phase === 'bidding' || phase === 'paused'),
  );

  const raiseDisableReason = useMemo(() => {
    if (phase === 'idle') return 'WAITING FOR THE HOST';
    if (phase === 'paused') return 'PAUSED';
    if (phase === 'sold' || phase === 'unsold') return 'LOT CLOSED';
    if (!lot) return 'WAITING FOR THE HOST';
    if (reveal.active) {
      const openSec = Math.max(1, Math.ceil(reveal.remainingMs / 1000));
      return `BIDDING OPENS IN ${openSec}S`;
    }
    if (iHoldHighestBid) return 'YOU HOLD THE HIGHEST BID';
    if (!myFinance || myFinance.purse_left_lakhs < nextAmount) {
      return 'NOT ENOUGH PURSE';
    }
    if (room && mySquad.length >= room.squad_max) return 'SQUAD FULL';
    if (
      room &&
      lot.players?.is_overseas &&
      myOverseasCount >= room.overseas_max
    ) {
      return 'OVERSEAS LIMIT REACHED';
    }
    if (msRemainingLive !== null && msRemainingLive <= 0) {
      return 'TIME EXPIRED';
    }
    if (cooldownActive || waitingNextState) return 'PLACING BID...';
    return null;
  }, [
    phase,
    lot,
    reveal.active,
    reveal.remainingMs,
    iHoldHighestBid,
    myFinance,
    nextAmount,
    room,
    mySquad.length,
    myOverseasCount,
    msRemainingLive,
    cooldownActive,
    waitingNextState,
  ]);

  const canRaise =
    Boolean(room?.auction_open) &&
    Boolean(activeTeam) &&
    !reveal.active &&
    raiseDisableReason === null;

  const handleRaiseBid = useCallback(async () => {
    if (!supabase || !room || !lot || !canRaise || !state || reveal.active) return;

    const amountToBid = nextBid(state, lot.base_price_lakhs);
    const seqAtSubmit = state.bid_seq;

    submittedBidSeqRef.current = seqAtSubmit;
    setCooldownActive(true);
    setWaitingNextState(true);

    if (cooldownTimerRef.current !== null) {
      window.clearTimeout(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = window.setTimeout(() => {
      cooldownTimerRef.current = null;
      setCooldownActive(false);
    }, 420);

    if (bidSafetyTimerRef.current !== null) {
      window.clearTimeout(bidSafetyTimerRef.current);
    }
    bidSafetyTimerRef.current = window.setTimeout(() => {
      bidSafetyTimerRef.current = null;
      setWaitingNextState(false);
      submittedBidSeqRef.current = null;
      void refetch();
    }, 2500);

    try {
      const { error: rpcError } = await supabase.rpc('place_bid', {
        p_room: room.id,
        p_amount: amountToBid,
      });

      if (rpcError) {
        if (bidSafetyTimerRef.current !== null) {
          window.clearTimeout(bidSafetyTimerRef.current);
          bidSafetyTimerRef.current = null;
        }
        submittedBidSeqRef.current = null;
        setWaitingNextState(false);

        showToast({
          title: 'Bid could not be placed',
          description: rpcError.message || 'The bid may have moved.',
          tone: 'error',
        });
        await refetch();
      }
    } catch (err) {
      if (bidSafetyTimerRef.current !== null) {
        window.clearTimeout(bidSafetyTimerRef.current);
        bidSafetyTimerRef.current = null;
      }
      submittedBidSeqRef.current = null;
      setWaitingNextState(false);

      showToast({
        title: 'Bid failed',
        description:
          err instanceof Error ? err.message : 'Unexpected network error.',
        tone: 'error',
      });
      await refetch();
    }
  }, [room, lot, canRaise, state, reveal.active, refetch, showToast]);

  // Keyboard accessibility: Space or Enter triggers RAISE when focused or page has focus with no input active
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!room?.auction_open || !activeTeam || reveal.active) return;

      const isRaiseTrigger = event.code === 'Space' || event.key === 'Enter';
      if (!isRaiseTrigger) return;

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

      // If focus is on another interactive control (not our raise button), let native control handle Enter/Space
      if (
        (tag === 'BUTTON' || tag === 'A') &&
        target !== raiseBtnRef.current
      ) {
        return;
      }

      if (canRaise) {
        event.preventDefault();
        void handleRaiseBid();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [room?.auction_open, activeTeam, reveal.active, canRaise, handleRaiseBid]);

  // Render guards
  const isInitialLoading = teamCheckLoading || (Boolean(verifiedTeam) && auctionLoading);

  if (isInitialLoading) {
    return (
      <div
        ref={rootRef}
        className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6"
      >
        <Card brackets bracketTone="cyan" className="w-full max-w-md p-8 text-center">
          <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-[#22D3EE] border-t-transparent" />
          <p className="mt-4 font-display text-3xl tracking-wide text-[#E8ECF4]">
            ENTERING AUCTION ROOM
          </p>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-[#8B95AA]">
            SYNCING FRANCHISE CREDENTIALS &amp; LIVE CLOCK...
          </p>
        </Card>
      </div>
    );
  }

  if (teamCheckError || (verifiedTeam && (auctionError || !room))) {
    return (
      <div
        ref={rootRef}
        className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6"
      >
        <Card brackets bracketTone="gold" className="w-full max-w-xl p-8">
          <Badge tone="danger">AUCTION ROOM ERROR</Badge>
          <h1 className="mt-3 font-display text-4xl tracking-wide text-[#E8ECF4]">
            UNABLE TO ENTER ROOM
          </h1>
          <p className="mt-2 text-sm text-red-300">
            {teamCheckError ||
              auctionError ||
              'Auction room state could not be loaded.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              variant="cyan"
              size="md"
              onClick={() => {
                void verifyMembership();
                void refetch();
              }}
            >
              <RefreshCw className="h-4 w-4" />
              <span>Retry</span>
            </Button>
            <Link to={`/play/${roomId}`}>
              <Button variant="outline" size="md">
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (notActiveMember || !activeTeam) {
    return (
      <div
        ref={rootRef}
        className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6"
      >
        <Card brackets bracketTone="gold" className="w-full max-w-lg p-8">
          <Badge tone="gold">ACCESS RESTRICTED</Badge>
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
                <span>Back</span>
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // LOCKED STATE: Full-screen locked panel; nothing else is visible
  if (!room?.auction_open) {
    const opensAtMs = latestNotice?.opens_at
      ? Date.parse(latestNotice.opens_at)
      : NaN;
    const hasOpensAt =
      Boolean(latestNotice?.opens_at) && !Number.isNaN(opensAtMs);
    const serverNow = nowMs + offsetMs;
    const noticeDiffMs = hasOpensAt ? Math.max(0, opensAtMs - serverNow) : 0;

    return (
      <div
        ref={rootRef}
        className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6"
      >
        <div className="relative w-full max-w-xl rounded-[4px] border border-[var(--team-primary)] bg-[#0E1524] p-8 sm:p-10 text-center">
          <CornerBrackets tone="gold" size="md" />

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[4px] border border-[var(--team-primary)] bg-[#070B14]">
            <Lock className="h-7 w-7 text-[#F5B921]" aria-hidden="true" />
          </div>

          <h1 className="mt-5 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
            AUCTION ROOM LOCKED
          </h1>
          <p className="mt-2 text-sm text-[#8B95AA]">
            The host will open the room soon
          </p>

          <div className="mt-6 rounded-[4px] border border-white/[0.08] bg-[#070B14] p-5 text-left">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#22D3EE]">
              LATEST HOST NOTICE
            </p>
            {latestNotice ? (
              <div className="mt-2 space-y-3">
                <p className="text-sm leading-relaxed text-[#E8ECF4]">
                  {latestNotice.message}
                </p>

                {hasOpensAt && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-3">
                    <div className="flex items-center gap-2 text-xs text-[#8B95AA]">
                      <Clock className="h-3.5 w-3.5 text-[#F5B921]" />
                      <span>
                        Opens at{' '}
                        <span className="font-medium text-[#E8ECF4]">
                          {formatNoticeTime(latestNotice.opens_at!)}
                        </span>
                      </span>
                    </div>
                    <span className="rounded-[2px] border border-[#F5B921]/40 bg-[#F5B921]/10 px-2.5 py-1 font-mono text-xs font-bold text-[#F5B921] tabular-nums">
                      {noticeDiffMs > 0
                        ? formatCountdownDuration(noticeDiffMs)
                        : 'OPENING SOON'}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 font-mono text-xs text-[#8B95AA]">
                No host announcement posted yet.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // OPEN STATE: Live Team Auction Room
  const player = lot?.players ?? null;
  const fullName = player
    ? `${player.first_name} ${player.last_name}`.trim()
    : '';
  const categoryInfo = getCategoryInfo(player?.category);
  const skillInfo = getSkillInfo(player?.skill);
  const currentSetInfo = getSetCategoryInfo(state?.current_set_no ?? 1);

  const highBidTeam = state?.current_bid_team_id
    ? (teamMap.get(state.current_bid_team_id) ?? null)
    : null;

  const soldTeam = lot?.sold_to_team_id
    ? (teamMap.get(lot.sold_to_team_id) ?? null)
    : highBidTeam;

  const useDarkRaiseText = isLightHex(teamPalette.primary);

  const showResultOverlay =
    Boolean(resultOverlayKey) &&
    (phase === 'sold' || phase === 'unsold') &&
    Boolean(player);

  const iWonSoldLot =
    phase === 'sold' && Boolean(soldTeam) && soldTeam?.id === activeTeam.id;

  return (
    <div
      ref={rootRef}
      className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex flex-col"
    >
      {/* 1. TOP BAR */}
      <header className="sticky top-0 z-30 border-b-2 border-[var(--team-primary)] bg-[#0E1524]">
        <div className="mx-auto flex min-h-16 max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-2 sm:px-6">
          {/* Team Badge & Name */}
          <div className="flex items-center gap-3 min-w-0">
            <TeamCrest shortCode={activeTeam.short_code} size="md" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-display text-2xl leading-none tracking-wide text-[#E8ECF4]">
                  {activeTeam.name}
                </span>
                <span className="hidden sm:inline-flex rounded-[2px] border border-[var(--team-secondary)] bg-[#070B14] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--team-secondary)]">
                  {activeTeam.short_code}
                </span>
              </div>
              <p className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                {room.name}
              </p>
            </div>
          </div>

          {/* Team Purse, Squad, Overseas, Connection Status */}
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div className="rounded-[4px] border border-[var(--team-primary)] bg-[#070B14] px-3.5 py-1.5">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#8B95AA]">
                MY PURSE
              </p>
              <p className="font-display text-2xl leading-none tracking-wide text-[#F5B921] tabular-nums">
                {myFinance
                  ? formatLakhs(myFinance.purse_left_lakhs)
                  : 'Unavailable'}
              </p>
            </div>

            <div className="font-mono tabular-nums">
              <p className="text-[9px] uppercase tracking-[0.12em] text-[#8B95AA]">
                SQUAD
              </p>
              <p className="text-sm font-bold text-[#E8ECF4]">
                {mySquad.length}
                <span className="text-[#8B95AA]">/{room.squad_max}</span>
              </p>
            </div>

            <div className="font-mono tabular-nums">
              <p className="text-[9px] uppercase tracking-[0.12em] text-[#8B95AA]">
                OVERSEAS
              </p>
              <p className="text-sm font-bold text-[#22D3EE]">
                {myOverseasCount}
                <span className="text-[#8B95AA]">/{room.overseas_max}</span>
              </p>
            </div>

            <div
              className="flex items-center gap-2 rounded-[4px] border border-white/10 bg-[#070B14] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
              title={
                connectionStatus === 'live'
                  ? 'Realtime connection live'
                  : 'Reconnecting to auction feed'
              }
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionStatus === 'live'
                    ? 'bg-emerald-400'
                    : 'bg-[#F5B921] animate-pulse'
                }`}
              />
              <span
                className={
                  connectionStatus === 'live'
                    ? 'text-emerald-300'
                    : 'text-[#F5B921]'
                }
              >
                {connectionStatus === 'live' ? 'LIVE' : 'RECONNECTING'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                if (next) playProjectorBidTick();
              }}
              aria-label={soundEnabled ? 'Mute reveal audio' : 'Unmute reveal audio'}
              title={soundEnabled ? 'Reveal audio on' : 'Reveal audio muted'}
              className={`inline-flex h-8 items-center gap-1.5 rounded-[4px] border px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                soundEnabled
                  ? 'border-[#22D3EE] bg-[#22D3EE]/15 text-[#22D3EE]'
                  : 'border-white/15 bg-[#070B14] text-[#8B95AA] hover:border-white/30 hover:text-[#E8ECF4]'
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="h-3.5 w-3.5" />
              ) : (
                <VolumeX className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">
                {soundEnabled ? 'SFX' : 'MUTE'}
              </span>
            </button>

            <Link to={`/play/${roomId}`}>
              <Button variant="ghost" size="sm" className="border border-white/10">
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Desk</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* MAIN LIVE STAGE (1280px+ 12-col layout) */}
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-4 p-4 sm:p-5 lg:p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
          {/* LEFT / CENTRE STAGE + RAISE PAD (8 cols) */}
          <div className="space-y-4 lg:col-span-8">
            {/* 2. CURRENT LOT PANEL */}
            <div
              className={`relative overflow-hidden rounded-[4px] border bg-[#0E1524] p-5 transition-colors ${
                reveal.active ? 'min-h-[510px]' : ''
              } ${
                iHoldHighestBid
                  ? 'border-[var(--team-primary)] bg-[color-mix(in_srgb,var(--team-primary)_10%,#0E1524)]'
                  : 'border-[var(--team-primary)]/45'
              }`}
            >
              <CornerBrackets tone={iHoldHighestBid ? 'cyan' : 'gold'} size="md" />

              {phase === 'idle' || !lot || !player ? (
                <div className="flex flex-col items-center gap-6 py-4 sm:flex-row">
                  <PlayerCard player={null} size="lg" />
                  <div className="flex-1 space-y-3 text-center sm:text-left">
                    <Tag accent="cyan">
                      SET {state?.current_set_no ?? 1} ·{' '}
                      {currentSetInfo?.label ?? 'POOL'}
                    </Tag>
                    <h1 className="font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
                      WAITING FOR THE HOST
                    </h1>
                    <p className="max-w-md text-sm text-[#8B95AA]">
                      The auctioneer is preparing the next player on the block. Keep an eye on the Up Next set tracker.
                    </p>
                    <div className="pt-2">
                      <Countdown
                        state={state}
                        totalSeconds={room.bid_timer_seconds}
                        offsetMs={offsetMs}
                        size="md"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6 md:flex-row">
                  {/* Left: PlayerCard large */}
                  <div className="mx-auto shrink-0 md:mx-0">
                    <PlayerCard
                      player={player}
                      size="lg"
                      basePriceLakhs={lot.base_price_lakhs}
                    />
                  </div>

                  {/* Right: Details, Stats, Current Bid & Countdown */}
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-4">
                    <div className="space-y-3">
                      {/* Lot code & phase tags */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-[2px] border border-[#22D3EE]/40 bg-[#070B14] px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[#22D3EE]">
                          LOT {player.player_code}
                        </span>
                        <Badge
                          tone={
                            phase === 'bidding'
                              ? 'cyan'
                              : phase === 'paused' || phase === 'sold'
                                ? 'gold'
                                : 'danger'
                          }
                        >
                          {PHASE_LABEL[phase]}
                        </Badge>
                        {iHoldHighestBid && (
                          <Tag accent="cyan">YOU ARE LEADING</Tag>
                        )}
                      </div>

                      {/* Name */}
                      <h1 className="font-display text-4xl sm:text-5xl leading-none tracking-wide text-[#E8ECF4]">
                        {fullName}
                      </h1>

                      {/* Role, Category, Nationality, Overseas, Base */}
                      <div className="flex flex-wrap items-center gap-1.5">
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
                        {player.is_overseas && (
                          <Tag accent="gold">OVERSEAS</Tag>
                        )}
                        <span className="inline-flex items-center rounded-[2px] border border-[#F5B921]/35 bg-[#070B14] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#F5B921] tabular-nums">
                          BASE {formatLakhs(lot.base_price_lakhs)}
                        </span>
                      </div>

                      {/* Stats Bar */}
                      <div className="grid grid-cols-5 gap-2 rounded-[4px] border border-white/[0.08] bg-[#070B14] px-3 py-2.5 font-mono tabular-nums">
                        <div>
                          <p className="text-[9px] text-[#8B95AA]">MAT</p>
                          <p className="text-sm font-bold text-[#E8ECF4]">
                            {player.matches}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-[#8B95AA]">RUNS</p>
                          <p className="text-sm font-bold text-[#E8ECF4]">
                            {player.runs}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-[#8B95AA]">WKTS</p>
                          <p className="text-sm font-bold text-[#E8ECF4]">
                            {player.wickets}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-[#8B95AA]">SR</p>
                          <p className="text-sm font-bold text-[#E8ECF4]">
                            {formatStatValue(player.strike_rate)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-[#8B95AA]">ECON</p>
                          <p className="text-sm font-bold text-[#F5B921]">
                            {formatStatValue(player.economy)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Highest Bid + Holding Team + Countdown Ring */}
                    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-4">
                      <div className="space-y-2 min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B95AA]">
                          CURRENT HIGHEST BID
                        </p>
                        <AnimatePresence mode="popLayout" initial={false}>
                          <motion.div
                            key={`${state?.bid_seq ?? 0}-${state?.current_bid_team_id ?? 'none'}`}
                            initial={{ opacity: 0, y: -8, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8 }}
                            transition={{ duration: 0.16 }}
                          >
                            {state?.current_bid_team_id ? (
                              <p className="font-display text-5xl sm:text-6xl leading-none tracking-wide text-[#F5B921] tabular-nums">
                                {formatLakhs(state.current_bid_lakhs)}
                              </p>
                            ) : (
                              <p className="font-display text-3xl sm:text-4xl leading-none tracking-wide text-[#8B95AA]">
                                NO BIDS YET
                              </p>
                            )}
                          </motion.div>
                        </AnimatePresence>

                        {highBidTeam ? (
                          <div className="flex items-center gap-2.5 pt-1">
                            <TeamCrest
                              shortCode={highBidTeam.short_code}
                              size="sm"
                            />
                            <span className="truncate font-sans text-sm font-semibold text-[#E8ECF4]">
                              {highBidTeam.name}
                            </span>
                          </div>
                        ) : (
                          <p className="font-mono text-xs text-[#8B95AA]">
                            Opening at {formatLakhs(lot.base_price_lakhs)}
                          </p>
                        )}
                      </div>

                      <Countdown
                        state={state}
                        totalSeconds={room.bid_timer_seconds}
                        offsetMs={offsetMs}
                        size="lg"
                        revealActive={reveal.active}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* PLAYER REVEAL OVERLAY (synced to bidding_opens_at) */}
              {reveal.active && (
                <div className="absolute inset-0 z-20 flex bg-[#070B14]">
                  <PlayerReveal
                    lot={lot}
                    setProgress={setProgress}
                    durationMs={reveal.durationMs}
                    elapsedMs={reveal.elapsedMs}
                    variant="team"
                    teamColors={teamPalette}
                    soundOn={soundEnabled}
                  />
                </div>
              )}

              {/* 4. RESULT OVERLAY (4 seconds max, never blocks next lot) */}
              {showResultOverlay && player && (
                <div
                  role="status"
                  className={`pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center ${
                    phase === 'sold'
                      ? iWonSoldLot
                        ? 'bg-[#070B14]/95 border-2 border-[var(--team-primary)]'
                        : 'bg-[#070B14]/95 border-2 border-[#F5B921]'
                      : 'bg-[#070B14]/95 border-2 border-red-500/70'
                  }`}
                >
                  {phase === 'sold' ? (
                    <>
                      {iWonSoldLot ? (
                        <div
                          className={`mb-3 inline-flex items-center gap-2 rounded-[2px] border border-[var(--team-secondary)] bg-[var(--team-primary)] px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.14em] ${
                            useDarkRaiseText ? 'text-[#070B14]' : 'text-white'
                          }`}
                        >
                          <Trophy className="h-4 w-4" />
                          <span>YOU WON</span>
                        </div>
                      ) : (
                        <Badge tone="gold" className="mb-3">
                          HAMMER DOWN
                        </Badge>
                      )}
                      <h2 className="font-display text-6xl sm:text-7xl leading-none tracking-wider text-[#F5B921]">
                        SOLD
                      </h2>
                      <p className="mt-2 font-display text-3xl tracking-wide text-[#E8ECF4]">
                        {fullName}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                        {soldTeam && (
                          <TeamCrest shortCode={soldTeam.short_code} size="md" />
                        )}
                        <span className="font-sans text-lg font-semibold text-[#E8ECF4]">
                          {soldTeam?.name || 'Franchise'}
                        </span>
                        <span className="font-display text-3xl text-[#F5B921] tabular-nums">
                          {formatLakhs(
                            lot?.sold_price_lakhs ??
                              state?.current_bid_lakhs ??
                              0,
                          )}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="mb-2 h-10 w-10 text-red-400" />
                      <h2 className="font-display text-6xl sm:text-7xl leading-none tracking-wider text-red-400">
                        UNSOLD
                      </h2>
                      <p className="mt-2 font-display text-3xl tracking-wide text-[#E8ECF4]">
                        {fullName}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 3. RAISE BUTTON */}
            <div className="space-y-2">
              <button
                ref={raiseBtnRef}
                type="button"
                disabled={!canRaise}
                onClick={() => void handleRaiseBid()}
                className={`group relative flex h-16 w-full items-center justify-between rounded-[4px] border-2 px-6 transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE] ${
                  canRaise
                    ? 'border-[var(--team-secondary)] bg-[var(--team-primary)] hover:brightness-110 active:scale-[0.995] cursor-pointer'
                    : 'border-white/10 bg-[#141C2F] text-[#8B95AA] cursor-not-allowed opacity-65'
                } ${
                  canRaise
                    ? useDarkRaiseText
                      ? 'text-[#070B14]'
                      : 'text-white'
                    : ''
                }`}
              >
                <span className="inline-flex items-center gap-3 font-display text-3xl sm:text-4xl tracking-wider">
                  <Gavel className="h-6 w-6 shrink-0" />
                  <span>
                    {reveal.active
                      ? 'PLAYER REVEAL'
                      : lot
                        ? `RAISE TO ${formatLakhs(nextAmount)}`
                        : 'RAISE BID'}
                  </span>
                </span>

                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-[2px] border border-current/30 bg-black/20 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em]">
                  {reveal.active
                    ? `OPENS IN ${Math.max(1, Math.ceil(reveal.remainingMs / 1000))}S`
                    : 'SPACE / ENTER'}
                </span>
              </button>

              <div className="flex items-center justify-between px-1">
                {reveal.active ? (
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.1em] text-[#F5B921]">
                    Bidding opens in{' '}
                    {Math.max(1, Math.ceil(reveal.remainingMs / 1000))}s
                  </p>
                ) : raiseDisableReason ? (
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.1em] text-[#F5B921]">
                    {raiseDisableReason}
                  </p>
                ) : (
                  <p className="font-mono text-xs uppercase tracking-[0.08em] text-[#22D3EE]">
                    Click or press Space / Enter to place bid immediately
                  </p>
                )}

                {lot && (
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA] tabular-nums">
                    INCREMENT {state?.current_bid_team_id ? (state.current_bid_lakhs < 100 ? '+₹20 L' : '+₹25 L') : 'BASE'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 5. RIGHT COLUMN (4 cols): BID LOG + TABBED (UP NEXT / SOLD LOG / OTHER FRANCHISES) */}
          <div className="space-y-4 lg:col-span-4">
            {/* BID LOG */}
            <Card className="border-[var(--team-primary)]/40 p-4">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2 mb-2.5">
                <h2 className="font-display text-xl tracking-wide text-[#E8ECF4]">
                  BID LOG
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#22D3EE] tabular-nums">
                  {lotBids.length} BIDS
                </span>
              </div>

              {lotBids.length === 0 ? (
                <p className="py-5 text-center font-mono text-xs uppercase tracking-[0.08em] text-[#8B95AA]">
                  No bids placed on current lot
                </p>
              ) : (
                <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1 broadcast-scroll">
                  {lotBids.map((bid, idx) => {
                    const bTeam = teamMap.get(bid.team_id);
                    const isMine = bid.team_id === activeTeam.id;
                    return (
                      <div
                        key={bid.id}
                        className={`flex items-center justify-between gap-2 rounded-[3px] border px-2.5 py-1.5 text-xs ${
                          isMine
                            ? 'border-[var(--team-primary)] bg-[color-mix(in_srgb,var(--team-primary)_14%,#070B14)]'
                            : idx === 0
                              ? 'border-[#F5B921]/40 bg-[#F5B921]/10'
                              : 'border-white/[0.06] bg-[#070B14]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {bTeam && (
                            <TeamCrest shortCode={bTeam.short_code} size="sm" />
                          )}
                          <span className="font-mono text-xs font-bold text-[#E8ECF4]">
                            {bTeam?.short_code || 'TEAM'}
                          </span>
                          {isMine && <Tag accent="cyan">YOU</Tag>}
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

            {/* TABBED PANEL: UP NEXT | SOLD LOG | OTHER FRANCHISES */}
            <Card className="border-[var(--team-primary)]/40 overflow-hidden">
              <div
                role="tablist"
                aria-label="Auction feed panels"
                className="grid grid-cols-3 border-b border-white/[0.08] bg-[#141C2F]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={rightTab === 'up-next'}
                  onClick={() => setRightTab('up-next')}
                  className={`px-2 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                    rightTab === 'up-next'
                      ? 'border-b-2 border-[#22D3EE] bg-[#0E1524] text-[#22D3EE]'
                      : 'text-[#8B95AA] hover:text-[#E8ECF4]'
                  }`}
                >
                  UP NEXT
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={rightTab === 'sold-log'}
                  onClick={() => setRightTab('sold-log')}
                  className={`px-2 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                    rightTab === 'sold-log'
                      ? 'border-b-2 border-[#F5B921] bg-[#0E1524] text-[#F5B921]'
                      : 'text-[#8B95AA] hover:text-[#E8ECF4]'
                  }`}
                >
                  SOLD ({soldLog.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={rightTab === 'franchises'}
                  onClick={() => setRightTab('franchises')}
                  className={`px-2 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                    rightTab === 'franchises'
                      ? 'border-b-2 border-[#22D3EE] bg-[#0E1524] text-[#22D3EE]'
                      : 'text-[#8B95AA] hover:text-[#E8ECF4]'
                  }`}
                >
                  FRANCHISES
                </button>
              </div>

              <div className="p-4">
                {/* UP NEXT (Set-level progress & 8-set timeline — never shows pending players) */}
                {rightTab === 'up-next' &&
                  (() => {
                    if (
                      setsLoading &&
                      !setProgress &&
                      setsOverview.length === 0
                    ) {
                      return (
                        <div className="space-y-3" aria-busy="true">
                          <div className="h-28 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#070B14]" />
                          <div className="h-8 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#070B14]" />
                          <div className="space-y-1.5">
                            {Array.from({ length: 8 }, (_, idx) => (
                              <div
                                key={idx}
                                className="h-7 motion-safe:animate-pulse rounded-[3px] border border-white/[0.06] bg-[#070B14]"
                              />
                            ))}
                          </div>
                        </div>
                      );
                    }

                    if (setsError && !setProgress && setsOverview.length === 0) {
                      return (
                        <div className="rounded-[4px] border border-red-500/35 bg-[#070B14] p-4 text-center space-y-3">
                          <p className="font-mono text-xs uppercase tracking-[0.08em] text-red-300">
                            {setsError}
                          </p>
                          <Button
                            variant="cyan"
                            size="sm"
                            onClick={() => void refetchSets()}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>Retry</span>
                          </Button>
                        </div>
                      );
                    }

                    const activeSetNo =
                      setProgress?.setNo ?? state?.current_set_no ?? 1;
                    const activeCatInfo = getSetCategoryInfo(activeSetNo);
                    const activeLabel =
                      setProgress?.setLabel ??
                      activeCatInfo?.label ??
                      currentSetInfo?.label ??
                      `Set ${activeSetNo}`;
                    const currentTotal = setProgress?.total ?? 0;
                    const currentRemaining = setProgress?.remaining ?? 0;
                    const currentDone = setProgress?.done ?? 0;
                    const currentPct =
                      currentTotal > 0
                        ? Math.min(
                            100,
                            Math.round((currentDone / currentTotal) * 100),
                          )
                        : 0;

                    const allSetsDone =
                      setsOverview.length > 0 &&
                      setsOverview.every((s) => s.remaining === 0);
                    const isAuctionComplete = allSetsDone && !lot;
                    const currentSetComplete =
                      currentTotal > 0 && currentRemaining === 0;

                    const nextSet =
                      setsOverview.find((s) => s.setNo === activeSetNo + 1) ??
                      null;
                    const nextIncompleteSet =
                      setsOverview.find(
                        (s) => s.setNo > activeSetNo && s.remaining > 0,
                      ) ??
                      nextSet ??
                      null;

                    const highlightedSetNo = isAuctionComplete
                      ? -1
                      : currentSetComplete && nextIncompleteSet
                        ? nextIncompleteSet.setNo
                        : activeSetNo;

                    return (
                      <div className="space-y-3.5">
                        {/* Section Header */}
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#22D3EE]">
                            UP NEXT
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA] tabular-nums">
                            {isAuctionComplete
                              ? 'ALL 8 SETS COMPLETE'
                              : `SET ${activeSetNo} OF 8`}
                          </span>
                        </div>

                        {/* Large Current Set Card */}
                        <div className="relative rounded-[4px] border border-[#22D3EE]/35 bg-[#070B14] p-4">
                          <CornerBrackets tone="cyan" size="sm" />

                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#22D3EE]">
                              SET {activeSetNo}
                            </span>
                            {isAuctionComplete ? (
                              <Badge tone="gold">AUCTION COMPLETE</Badge>
                            ) : currentSetComplete ? (
                              <Badge tone="gold">SET COMPLETE</Badge>
                            ) : (
                              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA] tabular-nums">
                                {currentDone}/{currentTotal} DONE
                              </span>
                            )}
                          </div>

                          <h3 className="mt-1.5 font-display text-4xl leading-none tracking-wide text-[#E8ECF4]">
                            {isAuctionComplete
                              ? 'AUCTION COMPLETE'
                              : activeLabel.toUpperCase()}
                          </h3>

                          <p className="mt-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#F5B921] tabular-nums">
                            {isAuctionComplete
                              ? '0 PLAYERS LEFT IN ROOM'
                              : currentSetComplete
                                ? 'SET COMPLETE · STANDING BY FOR NEXT SET'
                                : `${currentRemaining} ${currentRemaining === 1 ? 'PLAYER' : 'PLAYERS'} LEFT IN THIS SET`}
                          </p>

                          <div className="mt-3 space-y-1">
                            <div className="h-2 w-full overflow-hidden rounded-[2px] border border-white/[0.08] bg-[#0E1524]">
                              <div
                                style={{ width: `${currentPct}%` }}
                                className="h-full bg-[#22D3EE] transition-all duration-300"
                              />
                            </div>
                            <div className="flex items-center justify-between font-mono text-[10px] text-[#8B95AA] tabular-nums">
                              <span>
                                {currentDone} / {currentTotal} RESOLVED
                              </span>
                              <span>{currentPct}%</span>
                            </div>
                          </div>
                        </div>

                        {/* NEXT SET Line */}
                        <div className="flex items-center justify-between gap-2 rounded-[3px] border border-white/[0.08] bg-[#070B14] px-3 py-2 font-mono text-[11px]">
                          <span className="uppercase tracking-[0.1em] text-[#8B95AA]">
                            NEXT SET
                          </span>
                          {isAuctionComplete ? (
                            <span className="font-bold uppercase tracking-[0.08em] text-[#F5B921]">
                              AUCTION COMPLETE
                            </span>
                          ) : activeSetNo >= 8 ? (
                            <span className="font-bold uppercase tracking-[0.08em] text-[#F5B921]">
                              FINAL SET
                            </span>
                          ) : nextSet ? (
                            <span className="truncate font-semibold uppercase tracking-[0.06em] text-[#E8ECF4] tabular-nums">
                              SET {nextSet.setNo} · {nextSet.label} (
                              {nextSet.total})
                            </span>
                          ) : (
                            <span className="uppercase text-[#8B95AA]">—</span>
                          )}
                        </div>

                        {/* Compact Vertical 8-Set Timeline */}
                        <div className="space-y-1.5">
                          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                            8-SET TIMELINE
                          </p>
                          <div className="space-y-1">
                            {setsOverview.map((s) => {
                              const isCompleted =
                                s.total > 0 && s.remaining === 0;
                              const isHighlighted = s.setNo === highlightedSetNo;
                              const pct =
                                s.total > 0
                                  ? Math.min(
                                      100,
                                      Math.round((s.done / s.total) * 100),
                                    )
                                  : 0;

                              return (
                                <div
                                  key={s.setNo}
                                  style={
                                    isHighlighted
                                      ? {
                                          borderColor: 'var(--team-primary)',
                                          backgroundColor:
                                            'color-mix(in srgb, var(--team-primary) 14%, #070B14)',
                                        }
                                      : undefined
                                  }
                                  className={`flex items-center gap-2.5 rounded-[3px] border px-2.5 py-1.5 transition-colors ${
                                    isHighlighted
                                      ? 'text-[#E8ECF4]'
                                      : isCompleted
                                        ? 'border-white/[0.05] bg-[#070B14]/60 opacity-55'
                                        : 'border-white/[0.06] bg-[#070B14]'
                                  }`}
                                >
                                  <span
                                    style={
                                      isHighlighted
                                        ? { color: 'var(--team-primary)' }
                                        : undefined
                                    }
                                    className={`w-5 shrink-0 font-mono text-[10px] font-bold tabular-nums ${
                                      isHighlighted
                                        ? ''
                                        : isCompleted
                                          ? 'text-[#22D3EE]'
                                          : 'text-[#8B95AA]'
                                    }`}
                                  >
                                    {isCompleted ? (
                                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                                    ) : (
                                      `S${s.setNo}`
                                    )}
                                  </span>

                                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[#E8ECF4]">
                                    {s.label}
                                  </span>

                                  <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-[2px] bg-[#0E1524] border border-white/[0.06]">
                                    <div
                                      style={{
                                        width: `${pct}%`,
                                        backgroundColor: isHighlighted
                                          ? 'var(--team-primary)'
                                          : isCompleted
                                            ? '#34D399'
                                            : '#22D3EE',
                                      }}
                                      className="h-full transition-all duration-300"
                                    />
                                  </div>

                                  <span className="w-11 shrink-0 text-right font-mono text-[10px] text-[#8B95AA] tabular-nums">
                                    {s.done}/{s.total}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Muted Helper Note */}
                        <p className="border-t border-white/[0.06] pt-2.5 font-mono text-[10px] leading-relaxed text-[#8B95AA]">
                          The host decides the order of players inside a set.
                        </p>
                      </div>
                    );
                  })()}

                {/* SOLD LOG / RANKINGS */}
                {rightTab === 'sold-log' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                        {soldRankingMode ? 'TOP BUYS RANKING' : 'RECENT SALES'}
                      </span>

                      <div className="inline-flex rounded-[3px] border border-white/10 bg-[#070B14] p-0.5">
                        <button
                          type="button"
                          onClick={() => setSoldRankingMode(false)}
                          className={`rounded-[2px] px-2 py-0.5 font-mono text-[10px] uppercase ${
                            !soldRankingMode
                              ? 'bg-[#22D3EE] font-semibold text-[#070B14]'
                              : 'text-[#8B95AA]'
                          }`}
                        >
                          Recent
                        </button>
                        <button
                          type="button"
                          onClick={() => setSoldRankingMode(true)}
                          className={`rounded-[2px] px-2 py-0.5 font-mono text-[10px] uppercase ${
                            soldRankingMode
                              ? 'bg-[#F5B921] font-semibold text-[#070B14]'
                              : 'text-[#8B95AA]'
                          }`}
                        >
                          Rankings
                        </button>
                      </div>
                    </div>

                    {soldList.length === 0 ? (
                      <p className="py-6 text-center font-mono text-xs uppercase tracking-[0.08em] text-[#8B95AA]">
                        No players sold yet
                      </p>
                    ) : (
                      <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1 broadcast-scroll">
                        {soldList.map((rp, idx) => {
                          const sp = rp.players;
                          const sTeam = rp.sold_to_team_id
                            ? teamMap.get(rp.sold_to_team_id)
                            : null;
                          if (!sp) return null;
                          return (
                            <div
                              key={rp.id}
                              className="flex items-center justify-between gap-2 rounded-[3px] border border-white/[0.06] bg-[#070B14] px-2.5 py-1.5 text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {soldRankingMode && (
                                  <span className="w-5 shrink-0 font-mono text-[11px] font-bold text-[#F5B921] tabular-nums">
                                    #{idx + 1}
                                  </span>
                                )}
                                {sTeam && (
                                  <TeamCrest
                                    shortCode={sTeam.short_code}
                                    size="sm"
                                  />
                                )}
                                <span className="truncate font-medium text-[#E8ECF4]">
                                  {sp.first_name} {sp.last_name}
                                </span>
                              </div>
                              <span className="shrink-0 font-mono text-xs font-bold text-[#F5B921] tabular-nums">
                                {formatLakhs(rp.sold_price_lakhs ?? 0)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* OTHER FRANCHISES (badge, status, squad count ONLY — NO purse) */}
                {rightTab === 'franchises' && (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1 broadcast-scroll">
                    {otherFranchises.map((team) => {
                      const sqCount = squadCountsByTeam.get(team.id) ?? 0;
                      const isDimmed = team.status !== 'active';
                      return (
                        <div
                          key={team.id}
                          className={`flex items-center justify-between gap-2 rounded-[3px] border border-white/[0.06] bg-[#070B14] px-3 py-2 text-xs ${
                            isDimmed ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <TeamCrest shortCode={team.short_code} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-[#E8ECF4]">
                                {team.name}
                              </p>
                              <p
                                className={`font-mono text-[10px] uppercase ${
                                  team.status === 'active'
                                    ? 'text-[#22D3EE]'
                                    : team.status === 'removed'
                                      ? 'text-red-400'
                                      : 'text-[#8B95AA]'
                                }`}
                              >
                                {team.status}
                              </p>
                            </div>
                          </div>

                          <span className="shrink-0 font-mono text-xs font-semibold text-[#E8ECF4] tabular-nums">
                            {sqCount}/{room.squad_max}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>

      {/* 6. BOTTOM DRAWER: MY SQUAD */}
      <section
        aria-label="My squad drawer"
        className="sticky bottom-0 z-30 border-t-2 border-[var(--team-primary)] bg-[#0E1524]"
      >
        <div className="mx-auto max-w-[1440px]">
          <button
            type="button"
            onClick={() => setSquadDrawerOpen((prev) => !prev)}
            aria-expanded={squadDrawerOpen}
            className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-[#141C2F]/60 sm:px-6"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 font-display text-xl tracking-wide text-[#E8ECF4]">
                <Users className="h-4 w-4 text-[#22D3EE]" />
                <span>MY SQUAD</span>
              </span>
              <Badge tone="cyan">
                {mySquad.length} / {room.squad_max}
              </Badge>
              <span className="font-mono text-xs text-[#F5B921] tabular-nums">
                TOTAL SPENT: {formatLakhs(myTotalSpent)}
              </span>
            </div>

            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA]">
              <span>{squadDrawerOpen ? 'Hide squad' : 'View squad'}</span>
              {squadDrawerOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </span>
          </button>

          {squadDrawerOpen && (
            <div className="max-h-[40vh] overflow-y-auto border-t border-white/[0.08] bg-[#070B14] px-4 py-4 sm:px-6 broadcast-scroll">
              {mySquad.length === 0 ? (
                <p className="py-4 text-center font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
                  No players bought yet
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {mySquad.map((rp) => {
                    const mp = rp.players;
                    if (!mp) return null;
                    return (
                      <div
                        key={rp.id}
                        className="rounded-[4px] border border-[var(--team-primary)]/45 bg-[#0E1524] p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-sans text-sm font-semibold text-[#E8ECF4]">
                            {mp.first_name} {mp.last_name}
                          </p>
                          <span className="shrink-0 font-mono text-xs font-bold text-[#F5B921] tabular-nums">
                            {formatLakhs(rp.sold_price_lakhs ?? 0)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-[2px] border border-white/10 bg-[#070B14] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#22D3EE]">
                            {mp.skill}
                          </span>
                          {mp.is_overseas && <Tag accent="gold">OS</Tag>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
