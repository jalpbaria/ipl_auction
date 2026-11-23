import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Inbox,
  Lock,
  Plane,
  RefreshCw,
  Send,
  Timer,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmModal } from '../../components/host/ConfirmModal';
import { TeamCrest } from '../../components/host/TeamCrest';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { CornerBrackets } from '../../components/ui/CornerBrackets';
import { Tag } from '../../components/ui/Tag';
import { getSkillInfo } from '../../data/categories';
import { useAuction } from '../../hooks/useAuction';
import { formatLakhs } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { formatDateTime12h } from '../../lib/time';
import { useAuthStore } from '../../store/auth';
import { useToastStore } from '../../store/toast';
import type {
  DbTeam,
  DbTrade,
  RoomPlayerWithPlayer,
  TradeRowStatus,
} from '../../types/database';
import { usePlayTheme } from './playTheme';

type MyTeamDetail = Pick<
  DbTeam,
  'id' | 'room_id' | 'short_code' | 'name' | 'leader_name' | 'status'
>;

type TradeTab = 'new' | 'incoming' | 'mine' | 'feed';

function formatCountdownMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
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

export default function TeamTrade() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const showToast = useToastStore((s) => s.showToast);
  const { theme, refreshPurse } = usePlayTheme();

  const {
    room,
    teams,
    roomPlayers,
    offsetMs,
    tradeStatus,
    tradeEndsAt,
    loading: auctionLoading,
    error: auctionError,
    refetch,
  } = useAuction(roomId, { role: 'team' });

  const [myTeam, setMyTeam] = useState<MyTeamDetail | null>(null);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState<string | null>(null);

  const [trades, setTrades] = useState<DbTrade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesError, setTradesError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TradeTab>('new');
  const [targetTeamId, setTargetTeamId] = useState<string>('');
  const [giveIds, setGiveIds] = useState<string[]>([]);
  const [getIds, setGetIds] = useState<string[]>([]);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [acceptConfirmTrade, setAcceptConfirmTrade] = useState<DbTrade | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const autoResolvedWindowRef = useRef<string | null>(null);
  const initialTradesLoadedRef = useRef(false);
  const knownPendingIncomingIdsRef = useRef<Set<string>>(new Set());
  const knownAcceptedMyTradeIdsRef = useRef<Set<string>>(new Set());

  const loadMyTeam = useCallback(async () => {
    if (!supabase || !roomId || !session?.user.id) {
      setMyTeam(null);
      setTeamError('Missing room or session details.');
      setTeamLoading(false);
      return;
    }

    setTeamLoading(true);
    setTeamError(null);
    try {
      const { data, error: err } = await supabase
        .from('teams')
        .select('id, room_id, short_code, name, leader_name, status')
        .eq('room_id', roomId)
        .eq('leader_id', session.user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (err) {
        setTeamError(err.message);
        setMyTeam(null);
        return;
      }
      setMyTeam((data as MyTeamDetail | null) ?? null);
    } catch (err) {
      setTeamError(
        err instanceof Error ? err.message : 'Unable to verify franchise membership.',
      );
      setMyTeam(null);
    } finally {
      setTeamLoading(false);
    }
  }, [roomId, session?.user.id]);

  useEffect(() => {
    void loadMyTeam();
  }, [loadMyTeam]);

  useEffect(() => {
    initialTradesLoadedRef.current = false;
    knownPendingIncomingIdsRef.current = new Set();
    knownAcceptedMyTradeIdsRef.current = new Set();
  }, [roomId, myTeam?.id]);

  const teamMap = useMemo(() => {
    const map = new Map<string, DbTeam>();
    for (const t of teams) map.set(t.id, t);
    return map;
  }, [teams]);

  const fetchTrades = useCallback(
    async (silent = true) => {
      if (!supabase || !roomId || !myTeam) return;
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

        if (initialTradesLoadedRef.current) {
          for (const tr of normalized) {
            if (
              tr.status === 'pending' &&
              tr.to_team_id === myTeam.id &&
              !knownPendingIncomingIdsRef.current.has(tr.id)
            ) {
              const fromCode =
                teamMap.get(tr.from_team_id)?.short_code ?? 'Another team';
              showToast({
                title: `New trade offer from ${fromCode}`,
                description: `Offering ${tr.give_ids.length} player${tr.give_ids.length === 1 ? '' : 's'} for ${tr.get_ids.length} of yours.`,
                tone: 'warning',
                action: {
                  label: 'Review',
                  onClick: () => setActiveTab('incoming'),
                },
              });
            }

            const involvesMe =
              tr.from_team_id === myTeam.id || tr.to_team_id === myTeam.id;
            if (
              tr.status === 'accepted' &&
              involvesMe &&
              !knownAcceptedMyTradeIdsRef.current.has(tr.id)
            ) {
              showToast({
                title: 'Trade completed',
                description:
                  'Trade completed. Your playing XI was cleared, rebuild it on the Playing XI page.',
                tone: 'info',
                durationMs: 8000,
                action: {
                  label: 'Playing XI',
                  onClick: () => navigate(`/play/${roomId}/xi`),
                },
              });
              void refetch();
              void refreshPurse();
            }
          }
        }

        knownPendingIncomingIdsRef.current = new Set(
          normalized
            .filter((t) => t.status === 'pending' && t.to_team_id === myTeam.id)
            .map((t) => t.id),
        );
        knownAcceptedMyTradeIdsRef.current = new Set(
          normalized
            .filter(
              (t) =>
                t.status === 'accepted' &&
                (t.from_team_id === myTeam.id || t.to_team_id === myTeam.id),
            )
            .map((t) => t.id),
        );
        initialTradesLoadedRef.current = true;

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
    [roomId, myTeam, teamMap, showToast, navigate, refetch, refreshPurse],
  );

  // Realtime subscription on trades + 10s safety poll
  useEffect(() => {
    if (!roomId || !myTeam || !supabase) return;
    const client = supabase;

    void fetchTrades(false);

    const channel = client
      .channel(`team-trade-${roomId}-${myTeam.id}`)
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
  }, [roomId, myTeam, fetchTrades]);

  // 250ms ticker while trade window is open
  useEffect(() => {
    if (tradeStatus !== 'open') return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(id);
  }, [tradeStatus]);

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
        await Promise.all([refetch(), fetchTrades(true)]);
      }
    })();
  }, [roomId, tradeStatus, tradeEndsAt, nowMs, offsetMs, refetch, fetchTrades]);

  // Derived squads
  const rpMap = useMemo(() => {
    const map = new Map<string, RoomPlayerWithPlayer>();
    for (const rp of roomPlayers) map.set(rp.id, rp);
    return map;
  }, [roomPlayers]);

  const otherActiveTeams = useMemo(() => {
    if (!myTeam) return [];
    return teams
      .filter((t) => t.id !== myTeam.id && t.status === 'active')
      .sort((a, b) => a.short_code.localeCompare(b.short_code));
  }, [teams, myTeam]);

  // Keep targetTeamId valid
  useEffect(() => {
    if (otherActiveTeams.length === 0) {
      setTargetTeamId('');
      return;
    }
    if (!targetTeamId || !otherActiveTeams.some((t) => t.id === targetTeamId)) {
      setTargetTeamId(otherActiveTeams[0].id);
      setGetIds([]);
    }
  }, [otherActiveTeams, targetTeamId]);

  const squadByTeamId = useMemo(() => {
    const map = new Map<string, RoomPlayerWithPlayer[]>();
    for (const rp of roomPlayers) {
      if (rp.status !== 'sold' || !rp.sold_to_team_id) continue;
      const list = map.get(rp.sold_to_team_id);
      if (list) list.push(rp);
      else map.set(rp.sold_to_team_id, [rp]);
    }
    return map;
  }, [roomPlayers]);

  const mySquad = useMemo(
    () => (myTeam ? (squadByTeamId.get(myTeam.id) ?? []) : []),
    [squadByTeamId, myTeam],
  );

  const otherSquad = useMemo(
    () => (targetTeamId ? (squadByTeamId.get(targetTeamId) ?? []) : []),
    [squadByTeamId, targetTeamId],
  );

  // Prune selections if squads change during an active trade
  useEffect(() => {
    const mySet = new Set(mySquad.map((rp) => rp.id));
    setGiveIds((prev) => prev.filter((id) => mySet.has(id)));
  }, [mySquad]);

  useEffect(() => {
    const otherSet = new Set(otherSquad.map((rp) => rp.id));
    setGetIds((prev) => prev.filter((id) => otherSet.has(id)));
  }, [otherSquad]);

  const overseasMax = room?.overseas_max ?? 8;
  const squadMax = room?.squad_max ?? 25;

  const myOverseasNow = useMemo(
    () => mySquad.filter((rp) => rp.players?.is_overseas).length,
    [mySquad],
  );

  const otherOverseasNow = useMemo(
    () => otherSquad.filter((rp) => rp.players?.is_overseas).length,
    [otherSquad],
  );

  const giveOverseasCount = useMemo(
    () =>
      giveIds.filter((id) => rpMap.get(id)?.players?.is_overseas).length,
    [giveIds, rpMap],
  );

  const getOverseasCount = useMemo(
    () =>
      getIds.filter((id) => rpMap.get(id)?.players?.is_overseas).length,
    [getIds, rpMap],
  );

  const myOverseasAfter = myOverseasNow - giveOverseasCount + getOverseasCount;
  const otherOverseasAfter =
    otherOverseasNow - getOverseasCount + giveOverseasCount;

  const countInRange = giveIds.length >= 1 && giveIds.length <= 3;
  const countsEqual = giveIds.length > 0 && giveIds.length === getIds.length;
  const myOsValid = myOverseasAfter <= overseasMax;
  const otherOsValid = otherOverseasAfter <= overseasMax;
  const canSendOffer =
    Boolean(targetTeamId) &&
    countInRange &&
    countsEqual &&
    myOsValid &&
    otherOsValid &&
    busyAction === null;

  const incomingPending = useMemo(() => {
    if (!myTeam) return [];
    return trades.filter(
      (t) => t.status === 'pending' && t.to_team_id === myTeam.id,
    );
  }, [trades, myTeam]);

  const mySentTrades = useMemo(() => {
    if (!myTeam) return [];
    return trades.filter((t) => t.from_team_id === myTeam.id);
  }, [trades, myTeam]);

  const acceptedFeed = useMemo(
    () => trades.filter((t) => t.status === 'accepted'),
    [trades],
  );

  const myAcceptedTrades = useMemo(() => {
    if (!myTeam) return [];
    return acceptedFeed.filter(
      (t) => t.from_team_id === myTeam.id || t.to_team_id === myTeam.id,
    );
  }, [acceptedFeed, myTeam]);

  const windowRemainingMs = useMemo(() => {
    if (tradeStatus !== 'open' || !tradeEndsAt) return 0;
    const endMs = Date.parse(tradeEndsAt);
    if (Number.isNaN(endMs)) return 0;
    return Math.max(0, endMs - (nowMs + offsetMs));
  }, [tradeStatus, tradeEndsAt, nowMs, offsetMs]);

  const toggleGive = (id: string) => {
    setGiveIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        showToast({
          title: 'Maximum 3 players',
          description: 'You can swap up to 3 players per trade offer.',
          tone: 'warning',
        });
        return prev;
      }
      return [...prev, id];
    });
  };

  const toggleGet = (id: string) => {
    setGetIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        showToast({
          title: 'Maximum 3 players',
          description: 'You can request up to 3 players per trade offer.',
          tone: 'warning',
        });
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleProposeTrade = async () => {
    if (!supabase || !roomId || !targetTeamId || !canSendOffer) return;
    setBusyAction('propose');
    try {
      const { error: rpcErr } = await supabase.rpc('propose_trade', {
        p_room: roomId,
        p_to: targetTeamId,
        p_give: giveIds,
        p_get: getIds,
      });

      if (rpcErr) {
        showToast({
          title: 'Trade offer failed',
          description: rpcErr.message || 'Unable to send offer.',
          tone: 'error',
        });
        return;
      }

      const toCode = teamMap.get(targetTeamId)?.short_code ?? 'team';
      setGiveIds([]);
      setGetIds([]);
      setActiveTab('mine');
      await fetchTrades(true);
      showToast({
        title: `Offer sent to ${toCode}`,
        description: 'Waiting for the other franchise to respond.',
        tone: 'success',
      });
    } catch (err) {
      showToast({
        title: 'Trade offer failed',
        description: err instanceof Error ? err.message : 'Unexpected error.',
        tone: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRespondTrade = async (trade: DbTrade, accept: boolean) => {
    if (!supabase || !roomId || busyAction !== null) return;
    setBusyAction(`${accept ? 'accept' : 'reject'}_${trade.id}`);
    try {
      const { data, error: rpcErr } = await supabase.rpc('respond_trade', {
        p_trade: trade.id,
        p_accept: accept,
      });

      if (rpcErr) {
        showToast({
          title: accept ? 'Could not accept trade' : 'Could not reject trade',
          description: rpcErr.message,
          tone: 'error',
        });
        return;
      }

      setAcceptConfirmTrade(null);
      const outcome = String(data ?? (accept ? 'accepted' : 'rejected'));
      await Promise.all([fetchTrades(true), refetch()]);
      if (outcome === 'accepted') {
        void refreshPurse();
        knownAcceptedMyTradeIdsRef.current.add(trade.id);
        showToast({
          title: 'Trade completed',
          description:
            'Trade completed. Your playing XI was cleared, rebuild it on the Playing XI page.',
          tone: 'info',
          durationMs: 8000,
          action: {
            label: 'Playing XI',
            onClick: () => navigate(`/play/${roomId}/xi`),
          },
        });
      } else {
        showToast({
          title: 'Offer rejected',
          description: 'The trade proposal was declined.',
          tone: 'info',
        });
      }
    } catch (err) {
      showToast({
        title: 'Trade response failed',
        description: err instanceof Error ? err.message : 'Unexpected error.',
        tone: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCancelTrade = async (tradeId: string) => {
    if (!supabase || busyAction !== null) return;
    setBusyAction(`cancel_${tradeId}`);
    try {
      const { error: rpcErr } = await supabase.rpc('cancel_trade', {
        p_trade: tradeId,
      });

      if (rpcErr) {
        showToast({
          title: 'Could not cancel offer',
          description: rpcErr.message,
          tone: 'error',
        });
        return;
      }

      await fetchTrades(true);
      showToast({
        title: 'Offer cancelled',
        description: 'Your trade proposal has been withdrawn.',
        tone: 'info',
      });
    } catch (err) {
      showToast({
        title: 'Could not cancel offer',
        description: err instanceof Error ? err.message : 'Unexpected error.',
        tone: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  if (teamLoading || auctionLoading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6" aria-busy="true">
        <div className="h-24 animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]" />
        <div className="h-80 animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]" />
      </div>
    );
  }

  if (teamError || auctionError || !myTeam || !room) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-12 sm:px-6">
        <Card brackets bracketTone="gold" className="p-8">
          <Badge tone="danger">TRADE WINDOW ERROR</Badge>
          <h1 className="mt-3 font-display text-4xl tracking-wide text-[#E8ECF4]">
            UNABLE TO LOAD TRADE WINDOW
          </h1>
          <p className="mt-2 text-sm text-red-300">
            {teamError || auctionError || 'Franchise or room data is unavailable.'}
          </p>
          <div className="mt-6">
            <Button
              variant="cyan"
              size="sm"
              onClick={() => {
                void loadMyTeam();
                void refetch();
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // OFF STATE
  if (tradeStatus === 'off') {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-12 sm:px-6">
        <div
          style={{ borderColor: theme.primary, boxShadow: `0 0 24px ${theme.glow}` }}
          className="relative rounded-[4px] border bg-[#0E1524] p-8 sm:p-10 text-center"
        >
          <CornerBrackets tone="gold" size="md" />
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[4px] border border-white/15 bg-[#070B14]">
            <Lock className="h-6 w-6 text-[#F5B921]" />
          </div>
          <p
            style={{ color: theme.highlight }}
            className="mt-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]"
          >
            {myTeam.short_code} // TRADE WINDOW
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl leading-none tracking-wide text-[#E8ECF4]">
            TRADE WINDOW NOT OPEN YET
          </h1>
          <p className="mt-3 text-sm text-[#8B95AA]">
            The trade window opens after the auction
          </p>
          <div className="mt-6 flex justify-center">
            <Link to={`/play/${roomId}`}>
              <Button variant="outline" size="sm">
                <span>Back to Dashboard</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // CLOSED STATE
  if (tradeStatus === 'closed') {
    return (
      <div className="mx-auto w-full max-w-[1160px] space-y-6 p-4 sm:p-6">
        <div
          style={{ borderColor: theme.primary, boxShadow: `0 0 24px ${theme.glow}` }}
          className="relative rounded-[4px] border bg-[#0E1524] p-6 sm:p-8"
        >
          <CornerBrackets tone="gold" size="md" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Badge tone="danger">TRADE WINDOW CLOSED</Badge>
              <h1 className="mt-2 font-display text-4xl sm:text-5xl leading-none tracking-wide text-[#E8ECF4]">
                THE TRADE WINDOW IS CLOSED
              </h1>
              <p className="mt-2 text-sm text-[#8B95AA]">
                All pending offers are closed. If your squad changed in a trade, review and save your Playing XI before the host locks lineups.
              </p>
            </div>

            <Link to={`/play/${roomId}/xi`} className="shrink-0">
              <Button variant="gold" size="md">
                <Users className="h-4 w-4" />
                <span>Open Playing XI</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        <Card brackets bracketTone="subtle" className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              MY ACCEPTED TRADES
            </h2>
            <Tag accent="cyan">
              {myAcceptedTrades.length}{' '}
              {myAcceptedTrades.length === 1 ? 'TRADE' : 'TRADES'}
            </Tag>
          </div>

          {myAcceptedTrades.length === 0 ? (
            <p className="py-8 text-center font-mono text-xs uppercase tracking-[0.08em] text-[#8B95AA]">
              Your franchise did not complete any trades during the window.
            </p>
          ) : (
            <div className="space-y-3">
              {myAcceptedTrades.map((tr) => {
                const iAmFrom = tr.from_team_id === myTeam.id;
                const partner = teamMap.get(iAmFrom ? tr.to_team_id : tr.from_team_id);
                const receivedIds = iAmFrom ? tr.get_ids : tr.give_ids;
                const sentIds = iAmFrom ? tr.give_ids : tr.get_ids;

                return (
                  <div
                    key={tr.id}
                    className="rounded-[4px] border border-white/[0.08] bg-[#070B14] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
                      <div className="flex items-center gap-2.5">
                        {partner && (
                          <TeamCrest shortCode={partner.short_code} size="sm" />
                        )}
                        <span className="font-mono text-xs font-bold text-[#E8ECF4]">
                          SWAP WITH {partner?.name ?? 'FRANCHISE'}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-[#8B95AA]">
                        {formatDateTime12h(tr.resolved_at ?? tr.created_at)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-[3px] border border-emerald-500/25 bg-[#0E1524] p-3">
                        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-300">
                          RECEIVED ({receivedIds.length})
                        </p>
                        <ul className="mt-2 space-y-1">
                          {receivedIds.map((id) => {
                            const p = rpMap.get(id)?.players;
                            return (
                              <li key={id} className="text-xs text-[#E8ECF4]">
                                {p ? `${p.first_name} ${p.last_name}`.trim() : id.slice(0, 8)}{' '}
                                {p && (
                                  <span className="font-mono text-[10px] text-[#8B95AA]">
                                    ({p.skill}
                                    {p.is_overseas ? ' · OS' : ''})
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      <div className="rounded-[3px] border border-white/[0.08] bg-[#0E1524] p-3">
                        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#8B95AA]">
                          SENT ({sentIds.length})
                        </p>
                        <ul className="mt-2 space-y-1">
                          {sentIds.map((id) => {
                            const p = rpMap.get(id)?.players;
                            return (
                              <li key={id} className="text-xs text-[#E8ECF4]">
                                {p ? `${p.first_name} ${p.last_name}`.trim() : id.slice(0, 8)}{' '}
                                {p && (
                                  <span className="font-mono text-[10px] text-[#8B95AA]">
                                    ({p.skill}
                                    {p.is_overseas ? ' · OS' : ''})
                                  </span>
                                )}
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
      </div>
    );
  }

  // OPEN STATE
  const selectedPartner = otherActiveTeams.find((t) => t.id === targetTeamId) ?? null;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6">
      {/* Header Banner */}
      <section
        style={{
          borderColor: theme.primary,
          boxShadow: `0 0 28px ${theme.glow}`,
        }}
        className="relative rounded-[4px] border bg-[#0E1524] p-5 sm:p-6"
      >
        <CornerBrackets tone="cyan" size="md" />

        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge tone="cyan">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>TRADE WINDOW OPEN</span>
              </Badge>
              <span className="font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA] tabular-nums">
                SQUAD {mySquad.length}/{squadMax} · OVERSEAS {myOverseasNow}/{overseasMax}
              </span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl leading-none tracking-wide text-[#E8ECF4]">
              PLAYER TRADE DESK
            </h1>

            <p className="text-sm text-[#8B95AA]">
              Swap 1 to 3 players for the same number of players. No cash. The other team must accept.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 shrink-0">
            <div className="rounded-[4px] border border-[#22D3EE]/50 bg-[#070B14] px-5 py-3 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#22D3EE]">
                TIME LEFT
              </p>
              <p className="mt-0.5 font-display text-5xl leading-none tracking-wide text-[#F5B921] tabular-nums">
                {formatCountdownMs(windowRemainingMs)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sub-navigation Tabs */}
      <div
        role="tablist"
        aria-label="Trade window sections"
        className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] pb-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'new'}
          onClick={() => setActiveTab('new')}
          className={`inline-flex items-center gap-2 rounded-[4px] border px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] transition-colors ${
            activeTab === 'new'
              ? 'border-[var(--team-primary)] bg-[var(--team-primary)] text-[var(--team-accent)]'
              : 'border-white/10 bg-[#0E1524] text-[#8B95AA] hover:border-white/25 hover:text-[#E8ECF4]'
          }`}
        >
          <Send className="h-3.5 w-3.5" />
          <span>New Offer</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'incoming'}
          onClick={() => setActiveTab('incoming')}
          className={`inline-flex items-center gap-2 rounded-[4px] border px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] transition-colors ${
            activeTab === 'incoming'
              ? 'border-[var(--team-primary)] bg-[var(--team-primary)] text-[var(--team-accent)]'
              : incomingPending.length > 0
                ? 'border-[#F5B921]/70 bg-[#F5B921]/15 text-[#F5B921] hover:bg-[#F5B921]/25'
                : 'border-white/10 bg-[#0E1524] text-[#8B95AA] hover:border-white/25 hover:text-[#E8ECF4]'
          }`}
        >
          <Inbox className="h-3.5 w-3.5" />
          <span>Incoming Offers</span>
          {incomingPending.length > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-[2px] bg-[#F5B921] px-1.5 font-mono text-[10px] font-bold text-[#070B14] tabular-nums">
              {incomingPending.length}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'mine'}
          onClick={() => setActiveTab('mine')}
          className={`inline-flex items-center gap-2 rounded-[4px] border px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] transition-colors ${
            activeTab === 'mine'
              ? 'border-[var(--team-primary)] bg-[var(--team-primary)] text-[var(--team-accent)]'
              : 'border-white/10 bg-[#0E1524] text-[#8B95AA] hover:border-white/25 hover:text-[#E8ECF4]'
          }`}
        >
          <Timer className="h-3.5 w-3.5" />
          <span>My Offers ({mySentTrades.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'feed'}
          onClick={() => setActiveTab('feed')}
          className={`inline-flex items-center gap-2 rounded-[4px] border px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] transition-colors ${
            activeTab === 'feed'
              ? 'border-[var(--team-primary)] bg-[var(--team-primary)] text-[var(--team-accent)]'
              : 'border-white/10 bg-[#0E1524] text-[#8B95AA] hover:border-white/25 hover:text-[#E8ECF4]'
          }`}
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          <span>Trade Feed ({acceptedFeed.length})</span>
        </button>
      </div>

      {tradesError && (
        <div className="rounded-[4px] border border-red-500/40 bg-red-500/10 p-3 font-mono text-xs text-red-200">
          {tradesError}
        </div>
      )}

      {/* TAB 1: NEW OFFER */}
      {activeTab === 'new' && (
        <div className="space-y-6">
          {/* Step 1: Select Partner Team */}
          <Card brackets bracketTone="subtle" className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
                1. CHOOSE FRANCHISE TO TRADE WITH
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                ACTIVE FRANCHISES
              </span>
            </div>

            {otherActiveTeams.length === 0 ? (
              <p className="py-6 text-center font-mono text-xs text-[#8B95AA]">
                No other active franchises available in this room.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {otherActiveTeams.map((team) => {
                  const selected = team.id === targetTeamId;
                  const count = (squadByTeamId.get(team.id) ?? []).length;
                  return (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => {
                        if (team.id !== targetTeamId) {
                          setTargetTeamId(team.id);
                          setGetIds([]);
                        }
                      }}
                      className={`flex items-center gap-3 rounded-[4px] border p-3 text-left transition-colors ${
                        selected
                          ? 'border-[#22D3EE] bg-[#22D3EE]/10'
                          : 'border-white/10 bg-[#070B14] hover:border-white/25'
                      }`}
                    >
                      <TeamCrest shortCode={team.short_code} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs font-bold text-[#E8ECF4]">
                          {team.short_code}
                        </p>
                        <p className="truncate font-mono text-[10px] text-[#8B95AA] tabular-nums">
                          {count}/{squadMax} players
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Step 2: Two-column player picker + Live checks */}
          {selectedPartner && (
            <>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Left Column: My Squad */}
                <Card
                  brackets
                  bracketTone="subtle"
                  className="p-5 space-y-3"
                  style={{ borderColor: `${theme.primary}66` }}
                >
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                    <div className="flex items-center gap-2.5">
                      <TeamCrest shortCode={myTeam.short_code} size="sm" />
                      <div>
                        <h3 className="font-display text-2xl leading-none tracking-wide text-[#E8ECF4]">
                          YOU GIVE ({myTeam.short_code})
                        </h3>
                        <p className="mt-0.5 font-mono text-[10px] text-[#8B95AA] tabular-nums">
                          Overseas now: {myOverseasNow}/{overseasMax}
                        </p>
                      </div>
                    </div>
                    <Badge tone={giveIds.length > 0 ? 'cyan' : 'neutral'}>
                      {giveIds.length} / 3 SELECTED
                    </Badge>
                  </div>

                  {mySquad.length === 0 ? (
                    <p className="py-8 text-center font-mono text-xs text-[#8B95AA]">
                      No players in your squad.
                    </p>
                  ) : (
                    <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1 broadcast-scroll">
                      {mySquad.map((rp) => {
                        const p = rp.players;
                        if (!p) return null;
                        const checked = giveIds.includes(rp.id);
                        const skill = getSkillInfo(p.skill);

                        return (
                          <button
                            key={rp.id}
                            type="button"
                            onClick={() => toggleGive(rp.id)}
                            className={`flex w-full items-center justify-between gap-3 rounded-[3px] border px-3 py-2 text-left transition-colors ${
                              checked
                                ? 'border-[#22D3EE] bg-[#22D3EE]/10'
                                : 'border-white/[0.07] bg-[#070B14] hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border ${
                                  checked
                                    ? 'border-[#22D3EE] bg-[#22D3EE] text-[#070B14]'
                                    : 'border-white/25 bg-[#0E1524]'
                                }`}
                              >
                                {checked && <Check className="h-3 w-3 stroke-[3]" />}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-sans text-xs font-semibold text-[#E8ECF4]">
                                  {p.first_name} {p.last_name}
                                </p>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                  <span className="font-mono text-[10px] text-[#8B95AA]">
                                    {p.player_code}
                                  </span>
                                  {skill && (
                                    <span
                                      className={`inline-flex items-center rounded-[2px] border px-1.5 py-0.5 font-mono text-[9px] uppercase ${skill.chipClass}`}
                                    >
                                      {skill.value}
                                    </span>
                                  )}
                                  {p.is_overseas && <Tag accent="gold">OS</Tag>}
                                </div>
                              </div>
                            </div>

                            <span className="shrink-0 font-mono text-xs font-bold text-[#F5B921] tabular-nums">
                              {formatLakhs(rp.sold_price_lakhs ?? 0)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Card>

                {/* Right Column: Target Team Squad */}
                <Card brackets bracketTone="subtle" className="p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                    <div className="flex items-center gap-2.5">
                      <TeamCrest shortCode={selectedPartner.short_code} size="sm" />
                      <div>
                        <h3 className="font-display text-2xl leading-none tracking-wide text-[#E8ECF4]">
                          YOU GET ({selectedPartner.short_code})
                        </h3>
                        <p className="mt-0.5 font-mono text-[10px] text-[#8B95AA] tabular-nums">
                          Overseas now: {otherOverseasNow}/{overseasMax}
                        </p>
                      </div>
                    </div>
                    <Badge tone={getIds.length > 0 ? 'gold' : 'neutral'}>
                      {getIds.length} / 3 SELECTED
                    </Badge>
                  </div>

                  {otherSquad.length === 0 ? (
                    <p className="py-8 text-center font-mono text-xs text-[#8B95AA]">
                      No players in {selectedPartner.short_code}&apos;s squad.
                    </p>
                  ) : (
                    <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1 broadcast-scroll">
                      {otherSquad.map((rp) => {
                        const p = rp.players;
                        if (!p) return null;
                        const checked = getIds.includes(rp.id);
                        const skill = getSkillInfo(p.skill);

                        return (
                          <button
                            key={rp.id}
                            type="button"
                            onClick={() => toggleGet(rp.id)}
                            className={`flex w-full items-center justify-between gap-3 rounded-[3px] border px-3 py-2 text-left transition-colors ${
                              checked
                                ? 'border-[#F5B921] bg-[#F5B921]/10'
                                : 'border-white/[0.07] bg-[#070B14] hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border ${
                                  checked
                                    ? 'border-[#F5B921] bg-[#F5B921] text-[#070B14]'
                                    : 'border-white/25 bg-[#0E1524]'
                                }`}
                              >
                                {checked && <Check className="h-3 w-3 stroke-[3]" />}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-sans text-xs font-semibold text-[#E8ECF4]">
                                  {p.first_name} {p.last_name}
                                </p>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                  <span className="font-mono text-[10px] text-[#8B95AA]">
                                    {p.player_code}
                                  </span>
                                  {skill && (
                                    <span
                                      className={`inline-flex items-center rounded-[2px] border px-1.5 py-0.5 font-mono text-[9px] uppercase ${skill.chipClass}`}
                                    >
                                      {skill.value}
                                    </span>
                                  )}
                                  {p.is_overseas && <Tag accent="gold">OS</Tag>}
                                </div>
                              </div>
                            </div>

                            <span className="shrink-0 font-mono text-xs font-bold text-[#F5B921] tabular-nums">
                              {formatLakhs(rp.sold_price_lakhs ?? 0)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </div>

              {/* Validation & Send Offer Bar */}
              <Card brackets bracketTone="gold" className="p-5 space-y-4">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  <div
                    className={`flex items-center justify-between gap-2 rounded-[3px] border px-3 py-2 font-mono text-xs ${
                      countInRange
                        ? 'border-emerald-500/35 bg-emerald-500/10 text-[#E8ECF4]'
                        : 'border-white/10 bg-[#070B14] text-[#8B95AA]'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {countInRange ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-[#F5B921]" />
                      )}
                      <span>1 to 3 players</span>
                    </span>
                    <span className="tabular-nums font-bold">{giveIds.length}</span>
                  </div>

                  <div
                    className={`flex items-center justify-between gap-2 rounded-[3px] border px-3 py-2 font-mono text-xs ${
                      countsEqual
                        ? 'border-emerald-500/35 bg-emerald-500/10 text-[#E8ECF4]'
                        : 'border-red-500/35 bg-red-500/10 text-red-200'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {countsEqual ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                      )}
                      <span>Equal count</span>
                    </span>
                    <span className="tabular-nums font-bold">
                      {giveIds.length} vs {getIds.length}
                    </span>
                  </div>

                  <div
                    className={`flex items-center justify-between gap-2 rounded-[3px] border px-3 py-2 font-mono text-xs ${
                      myOsValid
                        ? 'border-emerald-500/35 bg-emerald-500/10 text-[#E8ECF4]'
                        : 'border-red-500/45 bg-red-500/15 text-red-200'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {myOsValid ? (
                        <Plane className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                      )}
                      <span>{myTeam.short_code} OS after</span>
                    </span>
                    <span className="tabular-nums font-bold">
                      {myOverseasAfter}/{overseasMax}
                    </span>
                  </div>

                  <div
                    className={`flex items-center justify-between gap-2 rounded-[3px] border px-3 py-2 font-mono text-xs ${
                      otherOsValid
                        ? 'border-emerald-500/35 bg-emerald-500/10 text-[#E8ECF4]'
                        : 'border-red-500/45 bg-red-500/15 text-red-200'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {otherOsValid ? (
                        <Plane className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                      )}
                      <span>{selectedPartner.short_code} OS after</span>
                    </span>
                    <span className="tabular-nums font-bold">
                      {otherOverseasAfter}/{overseasMax}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
                  <p className="font-mono text-xs text-[#8B95AA]">
                    {!countInRange
                      ? 'Select 1 to 3 players from your squad to offer.'
                      : !countsEqual
                        ? `Select ${giveIds.length} player${giveIds.length === 1 ? '' : 's'} from ${selectedPartner.short_code} to match.`
                        : !myOsValid
                          ? `Trade would exceed your overseas cap (${myOverseasAfter}/${overseasMax}).`
                          : !otherOsValid
                            ? `Trade would exceed ${selectedPartner.short_code}'s overseas cap (${otherOverseasAfter}/${overseasMax}).`
                            : `Ready to propose ${giveIds.length}-for-${getIds.length} swap with ${selectedPartner.short_code}.`}
                  </p>

                  <Button
                    variant="gold"
                    size="md"
                    disabled={!canSendOffer}
                    onClick={() => void handleProposeTrade()}
                  >
                    <Send className="h-4 w-4" />
                    <span>
                      {busyAction === 'propose' ? 'Sending offer...' : 'Send offer'}
                    </span>
                  </Button>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* TAB 2: INCOMING OFFERS */}
      {activeTab === 'incoming' && (
        <Card brackets bracketTone="gold" className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              INCOMING OFFERS
            </h2>
            <Badge tone={incomingPending.length > 0 ? 'gold' : 'neutral'}>
              {incomingPending.length} PENDING
            </Badge>
          </div>

          {tradesLoading && incomingPending.length === 0 ? (
            <div className="h-32 animate-pulse rounded-[4px] border border-white/[0.08] bg-[#070B14]" />
          ) : incomingPending.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-white/15 bg-[#070B14] py-12 text-center">
              <Inbox className="mx-auto h-7 w-7 text-[#8B95AA]" />
              <p className="mt-3 font-display text-2xl tracking-wide text-[#E8ECF4]">
                NO PENDING INCOMING OFFERS
              </p>
              <p className="mt-1 font-mono text-xs text-[#8B95AA]">
                Trade proposals sent to {myTeam.short_code} will appear here immediately.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {incomingPending.map((tr) => {
                const fromTeam = teamMap.get(tr.from_team_id);
                const incomingOs = tr.give_ids.filter(
                  (id) => rpMap.get(id)?.players?.is_overseas,
                ).length;
                const outgoingOs = tr.get_ids.filter(
                  (id) => rpMap.get(id)?.players?.is_overseas,
                ).length;
                const myOsAfter = myOverseasNow - outgoingOs + incomingOs;
                const osExceeded = myOsAfter > overseasMax;

                return (
                  <div
                    key={tr.id}
                    className="rounded-[4px] border border-[#F5B921]/45 bg-[#070B14] p-4 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
                      <div className="flex items-center gap-2.5">
                        {fromTeam && (
                          <TeamCrest shortCode={fromTeam.short_code} size="sm" />
                        )}
                        <div>
                          <p className="font-sans text-sm font-semibold text-[#E8ECF4]">
                            Offer from {fromTeam?.name ?? 'Franchise'} ({fromTeam?.short_code ?? 'TEAM'})
                          </p>
                          <p className="font-mono text-[10px] text-[#8B95AA]">
                            Received {formatDateTime12h(tr.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-[2px] border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tabular-nums ${
                            osExceeded
                              ? 'border-red-500/45 bg-red-500/15 text-red-300'
                              : 'border-[#22D3EE]/40 bg-[#0E1524] text-[#22D3EE]'
                          }`}
                        >
                          YOUR OS AFTER: {myOsAfter}/{overseasMax}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-[3px] border border-emerald-500/25 bg-[#0E1524] p-3">
                        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">
                          THEY GIVE ({tr.give_ids.length})
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {tr.give_ids.map((id) => {
                            const rp = rpMap.get(id);
                            const p = rp?.players;
                            const skill = getSkillInfo(p?.skill);
                            return (
                              <li
                                key={id}
                                className="flex flex-wrap items-center justify-between gap-2 text-xs"
                              >
                                <span className="font-medium text-[#E8ECF4]">
                                  {p
                                    ? `${p.first_name} ${p.last_name}`.trim()
                                    : id.slice(0, 8)}
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

                      <div className="rounded-[3px] border border-white/[0.08] bg-[#0E1524] p-3">
                        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#8B95AA]">
                          YOU GIVE ({tr.get_ids.length})
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {tr.get_ids.map((id) => {
                            const rp = rpMap.get(id);
                            const p = rp?.players;
                            const skill = getSkillInfo(p?.skill);
                            return (
                              <li
                                key={id}
                                className="flex flex-wrap items-center justify-between gap-2 text-xs"
                              >
                                <span className="font-medium text-[#E8ECF4]">
                                  {p
                                    ? `${p.first_name} ${p.last_name}`.trim()
                                    : id.slice(0, 8)}
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

                    <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-white/[0.06] pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyAction !== null}
                        onClick={() => void handleRespondTrade(tr, false)}
                        className="border-red-500/55 text-red-300 hover:border-red-400 hover:bg-red-500/15 hover:text-red-200"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Reject</span>
                      </Button>

                      <Button
                        variant="gold"
                        size="sm"
                        disabled={busyAction !== null}
                        onClick={() => setAcceptConfirmTrade(tr)}
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Accept</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* TAB 3: MY OFFERS */}
      {activeTab === 'mine' && (
        <Card brackets bracketTone="subtle" className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              MY OFFERS
            </h2>
            <Tag accent="cyan">{mySentTrades.length} SENT</Tag>
          </div>

          {mySentTrades.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-white/15 bg-[#070B14] py-12 text-center">
              <Send className="mx-auto h-7 w-7 text-[#8B95AA]" />
              <p className="mt-3 font-display text-2xl tracking-wide text-[#E8ECF4]">
                NO OFFERS SENT YET
              </p>
              <p className="mt-1 font-mono text-xs text-[#8B95AA]">
                Use the New Offer tab to propose a player swap with another franchise.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {mySentTrades.map((tr) => {
                const toTeam = teamMap.get(tr.to_team_id);
                const chip = statusChipProps(tr.status);
                const isPending = tr.status === 'pending';

                return (
                  <div
                    key={tr.id}
                    className="rounded-[4px] border border-white/[0.08] bg-[#070B14] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-2.5">
                      <div className="flex items-center gap-2.5">
                        {toTeam && (
                          <TeamCrest shortCode={toTeam.short_code} size="sm" />
                        )}
                        <div>
                          <p className="font-sans text-sm font-semibold text-[#E8ECF4]">
                            To {toTeam?.name ?? 'Franchise'} ({toTeam?.short_code ?? 'TEAM'})
                          </p>
                          <p className="font-mono text-[10px] text-[#8B95AA]">
                            Sent {formatDateTime12h(tr.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <Badge tone={chip.tone}>{chip.label}</Badge>
                        {isPending && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyAction !== null}
                            onClick={() => void handleCancelTrade(tr.id)}
                            className="border-red-500/45 text-red-300 hover:border-red-400 hover:bg-red-500/15"
                          >
                            <span>
                              {busyAction === `cancel_${tr.id}`
                                ? 'Cancelling...'
                                : 'Cancel'}
                            </span>
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-[3px] border border-white/[0.06] bg-[#0E1524] p-3">
                        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8B95AA]">
                          YOU OFFERED ({tr.give_ids.length})
                        </p>
                        <ul className="mt-2 space-y-1">
                          {tr.give_ids.map((id) => {
                            const p = rpMap.get(id)?.players;
                            const skill = getSkillInfo(p?.skill);
                            return (
                              <li
                                key={id}
                                className="flex flex-wrap items-center justify-between gap-2 text-xs"
                              >
                                <span className="text-[#E8ECF4]">
                                  {p
                                    ? `${p.first_name} ${p.last_name}`.trim()
                                    : id.slice(0, 8)}
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
                          REQUESTED ({tr.get_ids.length})
                        </p>
                        <ul className="mt-2 space-y-1">
                          {tr.get_ids.map((id) => {
                            const p = rpMap.get(id)?.players;
                            const skill = getSkillInfo(p?.skill);
                            return (
                              <li
                                key={id}
                                className="flex flex-wrap items-center justify-between gap-2 text-xs"
                              >
                                <span className="text-[#E8ECF4]">
                                  {p
                                    ? `${p.first_name} ${p.last_name}`.trim()
                                    : id.slice(0, 8)}
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
      )}

      {/* TAB 4: TRADE FEED */}
      {activeTab === 'feed' && (
        <Card brackets bracketTone="subtle" className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              COMPLETED TRADES IN THIS ROOM
            </h2>
            <Tag accent="cyan">{acceptedFeed.length} COMPLETED</Tag>
          </div>

          {acceptedFeed.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-white/15 bg-[#070B14] py-12 text-center">
              <ArrowLeftRight className="mx-auto h-7 w-7 text-[#8B95AA]" />
              <p className="mt-3 font-display text-2xl tracking-wide text-[#E8ECF4]">
                NO COMPLETED TRADES YET
              </p>
              <p className="mt-1 font-mono text-xs text-[#8B95AA]">
                Accepted player swaps across all teams will appear here live.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {acceptedFeed.map((tr) => {
                const fromTeam = teamMap.get(tr.from_team_id);
                const toTeam = teamMap.get(tr.to_team_id);
                return (
                  <div
                    key={tr.id}
                    className="rounded-[4px] border border-[#22D3EE]/30 bg-[#070B14] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-2.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        {fromTeam && (
                          <TeamCrest shortCode={fromTeam.short_code} size="sm" />
                        )}
                        <span className="font-mono text-xs font-bold text-[#E8ECF4]">
                          {fromTeam?.short_code ?? 'TEAM'}
                        </span>
                        <ArrowLeftRight className="h-3.5 w-3.5 text-[#22D3EE]" />
                        {toTeam && (
                          <TeamCrest shortCode={toTeam.short_code} size="sm" />
                        )}
                        <span className="font-mono text-xs font-bold text-[#E8ECF4]">
                          {toTeam?.short_code ?? 'TEAM'}
                        </span>
                      </div>

                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#8B95AA]">
                        <Clock className="h-3 w-3" />
                        <span>{formatDateTime12h(tr.resolved_at ?? tr.created_at)}</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-[3px] border border-white/[0.06] bg-[#0E1524] p-3">
                        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8B95AA]">
                          {fromTeam?.short_code ?? 'TEAM'} SENT
                        </p>
                        <ul className="mt-2 space-y-1">
                          {tr.give_ids.map((id) => {
                            const p = rpMap.get(id)?.players;
                            const skill = getSkillInfo(p?.skill);
                            return (
                              <li
                                key={id}
                                className="flex flex-wrap items-center justify-between gap-2 text-xs"
                              >
                                <span className="text-[#E8ECF4]">
                                  {p
                                    ? `${p.first_name} ${p.last_name}`.trim()
                                    : id.slice(0, 8)}
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
                          {toTeam?.short_code ?? 'TEAM'} SENT
                        </p>
                        <ul className="mt-2 space-y-1">
                          {tr.get_ids.map((id) => {
                            const p = rpMap.get(id)?.players;
                            const skill = getSkillInfo(p?.skill);
                            return (
                              <li
                                key={id}
                                className="flex flex-wrap items-center justify-between gap-2 text-xs"
                              >
                                <span className="text-[#E8ECF4]">
                                  {p
                                    ? `${p.first_name} ${p.last_name}`.trim()
                                    : id.slice(0, 8)}
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
      )}

      {/* Accept Confirmation Modal */}
      <ConfirmModal
        open={acceptConfirmTrade !== null}
        onClose={() => setAcceptConfirmTrade(null)}
        onConfirm={() => {
          if (acceptConfirmTrade) {
            void handleRespondTrade(acceptConfirmTrade, true);
          }
        }}
        title="ACCEPT PLAYER TRADE?"
        eyebrow="CONFIRM SWAP"
        message="Accepting this trade swaps the selected players immediately and clears both teams' saved Playing XIs so each side can rebuild."
        confirmLabel="Accept trade"
        confirmTone="gold"
        loading={
          acceptConfirmTrade !== null &&
          busyAction === `accept_${acceptConfirmTrade.id}`
        }
      />
    </div>
  );
}
