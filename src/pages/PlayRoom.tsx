import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  Gavel,
  LayoutGrid,
  List,
  Lock,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PlayerCard } from '../components/auction/PlayerCard';
import {
  GroundView,
  roomPlayerToGroundPlayer,
} from '../components/ground/GroundView';
import { TeamCrest } from '../components/host/TeamCrest';
import { TeamHeaderArt } from '../components/play/TeamHeaderArt';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { CornerBrackets } from '../components/ui/CornerBrackets';
import { getSkillInfo, type PlayerSkill } from '../data/categories';
import { normalizeSetProgress, type SetProgress } from '../lib/auction';
import { formatLakhs } from '../lib/format';
import {
  overseasCount,
  squadChecks,
  toSquadPlayers,
} from '../lib/squadRules';
import { supabase } from '../lib/supabase';
import { formatDateTime12h, formatRelativeTime } from '../lib/time';
import { useAuthStore } from '../store/auth';
import type {
  DbAuctionState,
  DbNotice,
  DbPlayer,
  DbPlayingXi,
  DbRoom,
  DbTeam,
  DbTeamFinance,
  RoomPlayerStatus,
  RoomPlayerWithPlayer,
} from '../types/database';
import { usePlayTheme } from './play/playTheme';

type MyTeamDetail = Pick<
  DbTeam,
  'id' | 'room_id' | 'short_code' | 'name' | 'leader_name' | 'status'
>;

type MyTeamFinance = Pick<DbTeamFinance, 'purse_left_lakhs' | 'spent_lakhs'>;

type SquadViewMode = 'grid' | 'list';

interface RawRoomPlayerRow {
  id: string;
  base_price_lakhs: number;
  set_no: number;
  sort_order: number | null;
  status: RoomPlayerStatus;
  sold_to_team_id: string | null;
  sold_price_lakhs: number | null;
  sold_at: string | null;
  players: DbPlayer | DbPlayer[] | null;
}

const ROLE_ORDER: readonly { skill: PlayerSkill; plural: string }[] = [
  { skill: 'Wicketkeeper', plural: 'Wicketkeepers' },
  { skill: 'Batter', plural: 'Batters' },
  { skill: 'All-Rounder', plural: 'All-Rounders' },
  { skill: 'Bowler', plural: 'Bowlers' },
];

const ROOM_SELECT =
  'id, host_id, name, starting_purse_lakhs, squad_max, squad_min, overseas_max, xi_overseas_max, xi_locked, leaderboard_public, bid_timer_seconds, auction_open, status, created_at';

const ROOM_PLAYER_SELECT =
  'id, base_price_lakhs, set_no, sort_order, status, sold_to_team_id, sold_price_lakhs, sold_at, players(id, serial, player_code, first_name, last_name, category, skill, nationality, is_overseas, ipl_season, ipl_team, matches, runs, strike_rate, economy, wickets, base_price_lakhs, card_image_url)';

function normalizeRoomPlayer(row: RawRoomPlayerRow): RoomPlayerWithPlayer {
  const player = Array.isArray(row.players)
    ? (row.players[0] ?? null)
    : row.players;
  return {
    id: row.id,
    base_price_lakhs: row.base_price_lakhs,
    set_no: row.set_no,
    sort_order: row.sort_order ?? player?.serial ?? 0,
    status: row.status,
    sold_to_team_id: row.sold_to_team_id,
    sold_price_lakhs: row.sold_price_lakhs,
    sold_at: row.sold_at ?? null,
    players: player,
  };
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6" aria-busy="true">
      <div className="h-44 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, idx) => (
          <div
            key={idx}
            className="h-28 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="h-72 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524] lg:col-span-7" />
        <div className="h-72 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524] lg:col-span-5" />
      </div>
    </div>
  );
}

export default function PlayRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const session = useAuthStore((s) => s.session);
  const { theme } = usePlayTheme();

  const [team, setTeam] = useState<MyTeamDetail | null>(null);
  const [room, setRoom] = useState<DbRoom | null>(null);
  const [allTeams, setAllTeams] = useState<DbTeam[]>([]);
  const [finance, setFinance] = useState<MyTeamFinance | null>(null);
  const [financeMissing, setFinanceMissing] = useState(false);
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayerWithPlayer[]>([]);
  const [notices, setNotices] = useState<DbNotice[]>([]);
  const [auctionState, setAuctionState] = useState<DbAuctionState | null>(null);
  const [setProgress, setSetProgress] = useState<SetProgress | null>(null);
  const [myPlayingXi, setMyPlayingXi] = useState<DbPlayingXi | null>(null);

  const [squadViewMode, setSquadViewMode] = useState<SquadViewMode>('grid');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const requestSeqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 15_000);
    return () => window.clearInterval(id);
  }, []);

  const loadDashboard = useCallback(
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
        const { data: teamData, error: teamErr } = await supabase
          .from('teams')
          .select('id, room_id, short_code, name, leader_name, status')
          .eq('room_id', roomId)
          .eq('leader_id', session.user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (!mountedRef.current || seq !== requestSeqRef.current) return;

        if (teamErr) {
          throw new Error(teamErr.message);
        }

        if (!teamData) {
          setTeam(null);
          setError('You are not an active member of this room.');
          return;
        }

        const myTeam = teamData as MyTeamDetail;
        setTeam(myTeam);

        const [
          roomRes,
          financeRes,
          teamsRes,
          playersRes,
          noticesRes,
          stateRes,
          xiRes,
          setProgressRes,
        ] = await Promise.all([
          supabase
            .from('rooms')
            .select(ROOM_SELECT)
            .eq('id', roomId)
            .maybeSingle(),
          supabase
            .from('team_finance')
            .select('purse_left_lakhs, spent_lakhs')
            .eq('team_id', myTeam.id)
            .maybeSingle(),
          supabase
            .from('teams')
            .select('id, room_id, short_code, name, leader_id, leader_name, status, joined_at')
            .eq('room_id', roomId)
            .order('short_code', { ascending: true }),
          supabase
            .from('room_players')
            .select(ROOM_PLAYER_SELECT)
            .eq('room_id', roomId)
            .in('status', ['live', 'sold', 'unsold'])
            .order('sort_order', { ascending: true })
            .range(0, 999),
          supabase
            .from('notices')
            .select('id, room_id, message, opens_at, created_at')
            .eq('room_id', roomId)
            .order('created_at', { ascending: false })
            .limit(10),
          supabase
            .from('auction_state')
            .select(
              'room_id, current_room_player_id, phase, current_bid_lakhs, current_bid_team_id, timer_ends_at, bid_seq, current_set_no, paused_remaining_ms, updated_at',
            )
            .eq('room_id', roomId)
            .maybeSingle(),
          supabase
            .from('playing_xi')
            .select('team_id, room_id, room_player_ids, captain_room_player_id, updated_at')
            .eq('room_id', roomId)
            .eq('team_id', myTeam.id)
            .maybeSingle(),
          supabase.rpc('get_set_progress', { p_room: roomId }),
        ]);

        if (!mountedRef.current || seq !== requestSeqRef.current) return;

        if (roomRes.error) throw new Error(roomRes.error.message);
        if (!roomRes.data) throw new Error('Auction room not found.');
        if (financeRes.error) throw new Error(financeRes.error.message);
        if (teamsRes.error) throw new Error(teamsRes.error.message);
        if (playersRes.error) throw new Error(playersRes.error.message);

        const nextState = !stateRes.error
          ? ((stateRes.data as DbAuctionState | null) ?? null)
          : null;

        setRoom(roomRes.data as DbRoom);
        if (financeRes.data) {
          setFinance(financeRes.data as MyTeamFinance);
          setFinanceMissing(false);
        } else {
          setFinance(null);
          setFinanceMissing(true);
        }
        setAllTeams((teamsRes.data as DbTeam[]) ?? []);
        setRoomPlayers(
          ((playersRes.data as RawRoomPlayerRow[]) ?? []).map(normalizeRoomPlayer),
        );
        if (!noticesRes.error && noticesRes.data) {
          setNotices(noticesRes.data as DbNotice[]);
        }
        if (!stateRes.error) {
          setAuctionState(nextState);
        }
        if (!setProgressRes.error) {
          setSetProgress(
            normalizeSetProgress(setProgressRes.data, nextState?.current_set_no),
          );
        }
        if (!xiRes.error) {
          const rawXi = xiRes.data as DbPlayingXi | null;
          setMyPlayingXi(
            rawXi
              ? {
                  ...rawXi,
                  room_player_ids: Array.isArray(rawXi.room_player_ids)
                    ? rawXi.room_player_ids
                    : [],
                }
              : null,
          );
        }
      } catch (err) {
        if (!mountedRef.current || seq !== requestSeqRef.current) return;
        setError(
          err instanceof Error ? err.message : 'Unable to load franchise dashboard.',
        );
      } finally {
        if (mountedRef.current && seq === requestSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [roomId, session?.user.id],
  );

  useEffect(() => {
    void loadDashboard(false);
  }, [loadDashboard]);

  // Realtime sync for dashboard panels
  const myTeamId = team?.id;
  useEffect(() => {
    if (!supabase || !roomId || !myTeamId) return;
    const client = supabase;

    const channel = client
      .channel(`play-dashboard-${roomId}-${myTeamId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new) {
            setRoom((prev) => ({ ...(prev ?? {}), ...(payload.new as DbRoom) }));
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_finance',
          filter: `team_id=eq.${myTeamId}`,
        },
        (payload) => {
          if (
            (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') &&
            payload.new
          ) {
            const row = payload.new as MyTeamFinance;
            setFinance({
              purse_left_lakhs: row.purse_left_lakhs,
              spent_lakhs: row.spent_lakhs,
            });
            setFinanceMissing(false);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_players',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void loadDashboard(true);
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auction_state',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (
            (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') &&
            payload.new
          ) {
            const next = payload.new as DbAuctionState;
            setAuctionState(next);
            void supabase
              ?.rpc('get_set_progress', { p_room: roomId })
              .then(({ data, error: spErr }) => {
                if (!mountedRef.current || spErr) return;
                setSetProgress(normalizeSetProgress(data, next.current_set_no));
              });
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notices',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            setNotices((prev) => [payload.new as DbNotice, ...prev]);
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const oldId = (payload.old as { id: string }).id;
            setNotices((prev) => prev.filter((n) => n.id !== oldId));
          } else {
            void loadDashboard(true);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'playing_xi',
          filter: `team_id=eq.${myTeamId}`,
        },
        (payload) => {
          if (
            (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') &&
            payload.new
          ) {
            const row = payload.new as DbPlayingXi;
            setMyPlayingXi({
              ...row,
              room_player_ids: Array.isArray(row.room_player_ids)
                ? row.room_player_ids
                : [],
            });
          } else if (payload.eventType === 'DELETE') {
            setMyPlayingXi(null);
          }
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [roomId, myTeamId, loadDashboard]);

  const teamById = useMemo(() => {
    const map = new Map<string, DbTeam>();
    for (const t of allTeams) {
      map.set(t.id, t);
    }
    return map;
  }, [allTeams]);

  const roomPlayerById = useMemo(() => {
    const map = new Map<string, RoomPlayerWithPlayer>();
    for (const rp of roomPlayers) {
      map.set(rp.id, rp);
    }
    return map;
  }, [roomPlayers]);

  const mySquad = useMemo(() => {
    if (!team) return [];
    return toSquadPlayers(roomPlayers, team.id);
  }, [roomPlayers, team]);

  const myOverseas = useMemo(() => overseasCount(mySquad), [mySquad]);

  const checks = useMemo(() => {
    if (!room) return [];
    return squadChecks(mySquad, room);
  }, [mySquad, room]);

  const spendByRole = useMemo(() => {
    const sums: Record<PlayerSkill, number> = {
      Wicketkeeper: 0,
      Batter: 0,
      'All-Rounder': 0,
      Bowler: 0,
    };

    for (const rp of mySquad) {
      const skill = rp.players?.skill;
      if (
        skill === 'Wicketkeeper' ||
        skill === 'Batter' ||
        skill === 'All-Rounder' ||
        skill === 'Bowler'
      ) {
        sums[skill] += rp.sold_price_lakhs ?? 0;
      }
    }

    const maxVal = Math.max(...Object.values(sums), 0);
    return ROLE_ORDER.map(({ skill, plural }) => ({
      skill,
      plural,
      spent: sums[skill],
      pct: maxVal > 0 ? Math.max(sums[skill] > 0 ? 6 : 0, (sums[skill] / maxVal) * 100) : 0,
    }));
  }, [mySquad]);

  const recentSales = useMemo(() => {
    return roomPlayers
      .filter((rp) => rp.status === 'sold')
      .sort((a, b) => {
        const aMs = a.sold_at ? Date.parse(a.sold_at) : 0;
        const bMs = b.sold_at ? Date.parse(b.sold_at) : 0;
        return bMs - aMs;
      })
      .slice(0, 8);
  }, [roomPlayers]);

  const latestNotices = useMemo(() => notices.slice(0, 3), [notices]);

  const xiGroundPlayers = useMemo(() => {
    if (!myPlayingXi) return [];
    return myPlayingXi.room_player_ids
      .map((id) => roomPlayerById.get(id))
      .filter((rp): rp is RoomPlayerWithPlayer => Boolean(rp))
      .map(roomPlayerToGroundPlayer)
      .filter((gp): gp is NonNullable<typeof gp> => Boolean(gp));
  }, [myPlayingXi, roomPlayerById]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !team || !room) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-12 sm:px-6">
        <Card brackets bracketTone="gold" className="p-8">
          <Badge tone="danger">FRANCHISE CONSOLE ERROR</Badge>
          <h1 className="mt-3 font-display text-4xl tracking-wide text-[#E8ECF4]">
            UNABLE TO LOAD DASHBOARD
          </h1>
          <p className="mt-2 text-sm text-red-300">
            {error || 'Room or franchise data could not be loaded.'}
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Button variant="cyan" size="sm" onClick={() => void loadDashboard(false)}>
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const currentLot =
    auctionState?.current_room_player_id &&
    (auctionState.phase === 'bidding' || auctionState.phase === 'paused')
      ? roomPlayerById.get(auctionState.current_room_player_id) ?? null
      : null;
  const currentLotPlayer = currentLot?.players ?? null;
  const isLotLive = Boolean(currentLot && currentLotPlayer);

  const hasSavedXi = Boolean(myPlayingXi && myPlayingXi.room_player_ids.length > 0);
  const xiLocked = Boolean(room.xi_locked);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-7">
      {/* 1. Themed Header Banner with Unique Team Art */}
      <section
        aria-label="Franchise header"
        style={{
          borderColor: theme.primary,
          boxShadow: `0 0 32px ${theme.glow}`,
        }}
        className="relative overflow-hidden rounded-[4px] border bg-[#0E1524]"
      >
        <TeamHeaderArt
          patternId={theme.patternId}
          primary={theme.primary}
          secondary={theme.secondary}
        />
        <CornerBrackets tone="gold" size="md" />

        <div className="relative z-10 flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <TeamCrest shortCode={team.short_code} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  style={{
                    backgroundColor: theme.primary,
                    color: theme.accent,
                    borderColor: theme.secondary,
                  }}
                  className="inline-flex items-center rounded-[2px] border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em]"
                >
                  {team.short_code}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#E8ECF4]/85">
                  {room.name}
                </span>
              </div>

              <h1 className="mt-1.5 font-display text-4xl sm:text-5xl leading-none tracking-wide text-[#FFFFFF] drop-shadow-sm">
                {team.name}
              </h1>

              <p className="mt-1.5 font-mono text-xs uppercase tracking-[0.08em] text-[#E8ECF4]/80">
                LEADER:{' '}
                <span className="font-semibold text-[#FFFFFF]">
                  {team.leader_name || 'Assigned Leader'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => void loadDashboard(true)}
              className="bg-[#070B14]/85"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? 'motion-safe:animate-spin' : ''}`}
              />
              <span>{refreshing ? 'Syncing...' : 'Refresh'}</span>
            </Button>
          </div>
        </div>
      </section>

      {/* 2. Four Stat Tiles */}
      <section aria-label="Franchise metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Purse Left */}
        <div
          style={{
            borderColor: theme.primary,
            backgroundColor: theme.surfaceTint,
            boxShadow: `0 0 20px ${theme.glow}`,
          }}
          className="relative rounded-[4px] border bg-[#0E1524] p-5"
        >
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8B95AA]">
            MY PURSE LEFT
          </p>
          {financeMissing || !finance ? (
            <div className="mt-2 flex items-center gap-2 text-red-300 font-mono text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Unavailable</span>
            </div>
          ) : (
            <p className="mt-2 font-display text-4xl leading-none tracking-wide text-[#F5B921] tabular-nums">
              {formatLakhs(finance.purse_left_lakhs)}
            </p>
          )}
          <p className="mt-2 font-mono text-[11px] text-[#8B95AA]">
            Starting {formatLakhs(room.starting_purse_lakhs)}
          </p>
        </div>

        {/* Total Spent */}
        <div
          style={{
            borderColor: `${theme.primary}66`,
            backgroundColor: '#0E1524',
          }}
          className="relative rounded-[4px] border p-5"
        >
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8B95AA]">
            TOTAL SPENT
          </p>
          <p className="mt-2 font-display text-4xl leading-none tracking-wide text-[#E8ECF4] tabular-nums">
            {finance ? formatLakhs(finance.spent_lakhs) : '—'}
          </p>
          <p className="mt-2 font-mono text-[11px] text-[#8B95AA]">
            Across {mySquad.length} signed {mySquad.length === 1 ? 'player' : 'players'}
          </p>
        </div>

        {/* Squad Count */}
        <div
          style={{
            borderColor: `${theme.primary}66`,
            backgroundColor: '#0E1524',
          }}
          className="relative rounded-[4px] border p-5"
        >
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8B95AA]">
            SQUAD
          </p>
          <p className="mt-2 font-display text-4xl leading-none tracking-wide text-[#E8ECF4] tabular-nums">
            {mySquad.length}
            <span className="text-2xl text-[#8B95AA]">/{room.squad_max}</span>
          </p>
          <p className="mt-2 font-mono text-[11px] text-[#8B95AA]">
            Minimum required: {room.squad_min}
          </p>
        </div>

        {/* Overseas Count */}
        <div
          style={{
            borderColor: `${theme.primary}66`,
            backgroundColor: '#0E1524',
          }}
          className="relative rounded-[4px] border p-5"
        >
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8B95AA]">
            OVERSEAS
          </p>
          <p
            style={{ color: theme.highlight }}
            className="mt-2 font-display text-4xl leading-none tracking-wide tabular-nums"
          >
            {myOverseas}
            <span className="text-2xl text-[#8B95AA]">/{room.overseas_max}</span>
          </p>
          <p className="mt-2 font-mono text-[11px] text-[#8B95AA]">
            XI limit: {room.xi_overseas_max ?? room.overseas_max}
          </p>
        </div>
      </section>

      {/* 3. Auction Status + Checklist + Playing XI Status */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (7 cols): Auction Status + Squad Checklist + Spend By Role */}
        <div className="space-y-6 lg:col-span-7">
          {/* Auction Status Panel */}
          <div
            style={{
              borderColor: theme.primary,
              boxShadow: `0 0 24px ${theme.glow}`,
            }}
            className="relative rounded-[4px] border bg-[#0E1524] p-5 sm:p-6"
          >
            <CornerBrackets tone="cyan" size="sm" />

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <Gavel className="h-4 w-4" style={{ color: theme.highlight }} />
                  <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
                    AUCTION ROOM STATUS
                  </h2>
                  <Badge tone={room.auction_open ? 'cyan' : 'danger'}>
                    {room.auction_open ? 'OPEN' : 'LOCKED'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[#8B95AA]">
                  {room.auction_open
                    ? 'The bidding floor is live. Enter the auction room to place bids.'
                    : 'The host currently has the auction floor locked.'}
                </p>
              </div>

              <Link to={`/play/${roomId}/auction`} className="shrink-0">
                <button
                  type="button"
                  style={{
                    backgroundColor: theme.primary,
                    color: theme.accent,
                    borderColor: theme.secondary,
                  }}
                  className="inline-flex h-12 items-center justify-center gap-2.5 rounded-[4px] border px-6 font-mono text-xs font-bold uppercase tracking-[0.08em] transition-transform hover:brightness-110 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE]"
                >
                  <Gavel className="h-4 w-4 shrink-0" />
                  <span>Enter auction room</span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </button>
              </Link>
            </div>

            {setProgress && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-[4px] border border-white/[0.08] bg-[#070B14] px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="rounded-[2px] border border-[#22D3EE]/40 bg-[#0E1524] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#22D3EE]">
                    SET {setProgress.setNo}
                  </span>
                  <span className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#E8ECF4]">
                    {setProgress.setLabel}
                  </span>
                </div>

                <span className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#F5B921] tabular-nums">
                  {setProgress.remaining === 0 && setProgress.total > 0
                    ? 'SET COMPLETE'
                    : `${setProgress.remaining} ${setProgress.remaining === 1 ? 'PLAYER' : 'PLAYERS'} LEFT IN SET`}
                </span>
              </div>
            )}

            {isLotLive && currentLotPlayer && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[#22D3EE]/35 bg-[#070B14] px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#22D3EE] motion-safe:animate-pulse" />
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#22D3EE]">
                      {auctionState?.phase === 'paused' ? 'PAUSED LOT' : 'LIVE LOT'} ·{' '}
                      {currentLotPlayer.player_code}
                    </span>
                  </div>
                  <p className="mt-1 font-display text-2xl leading-none tracking-wide text-[#E8ECF4] truncate">
                    {currentLotPlayer.first_name} {currentLotPlayer.last_name}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase text-[#8B95AA]">
                    {currentLotPlayer.skill} · {currentLotPlayer.nationality}
                  </p>
                </div>

                <div className="text-right font-mono tabular-nums">
                  <p className="text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                    {auctionState?.current_bid_team_id ? 'CURRENT BID' : 'BASE PRICE'}
                  </p>
                  <p className="font-display text-3xl leading-none text-[#F5B921]">
                    {formatLakhs(
                      auctionState?.current_bid_team_id
                        ? auctionState.current_bid_lakhs
                        : currentLot?.base_price_lakhs ?? 0,
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Squad Checklist */}
          <Card
            className="p-5"
            style={{ borderColor: `${theme.primary}55` }}
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" style={{ color: theme.highlight }} />
                <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
                  SQUAD CHECKLIST
                </h2>
              </div>
              <Badge tone={checks.every((c) => c.ok) ? 'cyan' : 'gold'}>
                {checks.filter((c) => c.ok).length}/{checks.length} PASSED
              </Badge>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {checks.map((rule) => (
                <div
                  key={rule.label}
                  className={`flex items-center justify-between gap-2 rounded-[3px] border px-3.5 py-2.5 font-mono text-xs ${
                    rule.ok
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-[#E8ECF4]'
                      : 'border-red-500/35 bg-red-500/10 text-red-200'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {rule.ok ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                    )}
                    <span className="truncate">{rule.label}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-[#8B95AA]">
                    {rule.have}/{rule.need}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Spend by Role Horizontal Bar Chart */}
          <Card
            className="p-5"
            style={{ borderColor: `${theme.primary}55` }}
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#F5B921]" />
                <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
                  SPEND BY ROLE
                </h2>
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA]">
                TOTAL {finance ? formatLakhs(finance.spent_lakhs) : '₹0 L'}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {spendByRole.map((item, idx) => {
                const barColors = [
                  theme.primary,
                  '#22D3EE',
                  '#F5B921',
                  theme.secondary === '#1F1F1F' || theme.secondary === '#111827'
                    ? '#FB7185'
                    : theme.secondary,
                ];
                const barColor = barColors[idx % barColors.length];
                return (
                  <div key={item.skill} className="space-y-1">
                    <div className="flex items-center justify-between font-mono text-xs">
                      <span className="text-[#E8ECF4]">{item.plural}</span>
                      <span className="font-semibold text-[#F5B921] tabular-nums">
                        {formatLakhs(item.spent)}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-[2px] border border-white/[0.08] bg-[#070B14]">
                      <div
                        style={{
                          width: `${item.pct}%`,
                          backgroundColor: barColor,
                        }}
                        className="h-full transition-all duration-300"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right Column (5 cols): Playing XI Status + Live Activity + Notices */}
        <div className="space-y-6 lg:col-span-5">
          {/* Playing XI Status Card */}
          <Card
            brackets
            bracketTone="gold"
            className="p-5 space-y-4"
            style={{
              borderColor: `${theme.primary}77`,
              boxShadow: `0 0 20px ${theme.glow}`,
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" style={{ color: theme.highlight }} />
                <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
                  PLAYING XI STATUS
                </h2>
              </div>

              {xiLocked ? (
                <Badge tone="danger">
                  <Lock className="h-3 w-3" />
                  <span>LOCKED BY HOST</span>
                </Badge>
              ) : hasSavedXi ? (
                <Badge tone="cyan">SAVED</Badge>
              ) : (
                <Badge tone="gold">NOT SAVED</Badge>
              )}
            </div>

            {hasSavedXi && myPlayingXi ? (
              <div className="space-y-3">
                <p className="font-mono text-[11px] text-[#8B95AA]">
                  Last saved {formatDateTime12h(myPlayingXi.updated_at)}
                </p>
                <GroundView
                  players={xiGroundPlayers}
                  captainId={myPlayingXi.captain_room_player_id}
                  accent={theme.primary}
                  size="sm"
                  showEmptySlots
                />
              </div>
            ) : (
              <div className="rounded-[4px] border border-dashed border-white/15 bg-[#070B14] px-4 py-6 text-center">
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-[#8B95AA]">
                  {xiLocked
                    ? 'The host locked Playing XI submissions before a lineup was saved.'
                    : mySquad.length < 11
                      ? `Sign ${11 - mySquad.length} more player${11 - mySquad.length === 1 ? '' : 's'} to unlock your Playing XI.`
                      : 'Your squad has 11+ players. Select your Starting XI and Captain.'}
                </p>
              </div>
            )}

            <Link to={`/play/${roomId}/xi`} className="block">
              <Button variant="outline" size="md" className="w-full justify-between">
                <span>
                  {xiLocked
                    ? 'View Playing XI'
                    : hasSavedXi
                      ? 'Edit Playing XI'
                      : 'Open XI Builder'}
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </Card>

          {/* Live Activity (Last 8 room sales) */}
          <Card
            className="p-5"
            style={{ borderColor: `${theme.primary}55` }}
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
                LIVE ACTIVITY
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#22D3EE]">
                LAST 8 SALES
              </span>
            </div>

            {recentSales.length === 0 ? (
              <p className="py-6 text-center font-mono text-xs uppercase tracking-[0.08em] text-[#8B95AA]">
                No players sold yet in this room
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-white/[0.06]">
                {recentSales.map((rp) => {
                  const p = rp.players;
                  const buyer = rp.sold_to_team_id
                    ? teamById.get(rp.sold_to_team_id) ?? null
                    : null;
                  if (!p) return null;
                  const isMine = rp.sold_to_team_id === team.id;

                  return (
                    <li
                      key={rp.id}
                      className="flex items-center justify-between gap-3 py-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {buyer && (
                          <TeamCrest shortCode={buyer.short_code} size="sm" />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-[#E8ECF4] truncate">
                            {p.first_name} {p.last_name}
                          </p>
                          <p className="font-mono text-[10px] text-[#8B95AA]">
                            {buyer?.short_code || 'TEAM'}
                            {isMine ? ' (YOU)' : ''} ·{' '}
                            {formatRelativeTime(rp.sold_at, nowMs)}
                          </p>
                        </div>
                      </div>

                      <span className="shrink-0 font-mono text-xs font-bold text-[#F5B921] tabular-nums">
                        {formatLakhs(rp.sold_price_lakhs ?? 0)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Latest 3 Notices */}
          <Card
            className="p-5"
            style={{ borderColor: `${theme.primary}55` }}
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-[#F5B921]" />
                <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
                  HOST NOTICES
                </h2>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                LATEST 3
              </span>
            </div>

            {latestNotices.length === 0 ? (
              <p className="py-6 text-center font-mono text-xs uppercase tracking-[0.08em] text-[#8B95AA]">
                No announcements from the host yet
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {latestNotices.map((notice) => (
                  <li
                    key={notice.id}
                    className="rounded-[3px] border border-white/[0.08] bg-[#070B14] p-3 text-xs space-y-1.5"
                  >
                    <p className="leading-relaxed text-[#E8ECF4]">{notice.message}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-[#8B95AA]">
                      <span>Posted {formatDateTime12h(notice.created_at)}</span>
                      {notice.opens_at && (
                        <span className="inline-flex items-center gap-1 text-[#F5B921]">
                          <Clock className="h-3 w-3" />
                          <span>Opens {formatDateTime12h(notice.opens_at)}</span>
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* 4. MY SQUAD (Grouped by Role, Grid / List Toggle) */}
      <Card
        brackets
        bracketTone="cyan"
        className="p-5 sm:p-6 space-y-5"
        style={{
          borderColor: `${theme.primary}77`,
          boxShadow: `0 0 24px ${theme.glow}`,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-3xl tracking-wide text-[#E8ECF4]">
              MY SQUAD
            </h2>
            <Badge tone="cyan">
              {mySquad.length} / {room.squad_max} PLAYERS
            </Badge>
          </div>

          <div
            role="group"
            aria-label="Squad view toggle"
            className="inline-flex rounded-[3px] border border-white/15 bg-[#070B14] p-0.5"
          >
            <button
              type="button"
              onClick={() => setSquadViewMode('grid')}
              className={`inline-flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors ${
                squadViewMode === 'grid'
                  ? 'bg-[var(--team-primary)] text-[var(--team-accent)]'
                  : 'text-[#8B95AA] hover:text-[#E8ECF4]'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Card grid</span>
            </button>
            <button
              type="button"
              onClick={() => setSquadViewMode('list')}
              className={`inline-flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors ${
                squadViewMode === 'list'
                  ? 'bg-[var(--team-primary)] text-[var(--team-accent)]'
                  : 'text-[#8B95AA] hover:text-[#E8ECF4]'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Compact list</span>
            </button>
          </div>
        </div>

        {mySquad.length === 0 ? (
          <div className="rounded-[4px] border border-dashed border-white/15 bg-[#070B14] py-12 text-center">
            <p className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              No players bought yet
            </p>
            <p className="mt-1 font-mono text-xs text-[#8B95AA]">
              Win bids in the auction room to assemble your squad.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {ROLE_ORDER.map(({ skill, plural }) => {
              const rolePlayers = mySquad.filter((rp) => rp.players?.skill === skill);
              const skillInfo = getSkillInfo(skill);

              return (
                <div key={skill} className="space-y-3">
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-[2px] border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${
                          skillInfo?.chipClass ?? 'border-white/15 text-[#E8ECF4]'
                        }`}
                      >
                        {plural}
                      </span>
                      <span className="font-mono text-xs text-[#8B95AA] tabular-nums">
                        ({rolePlayers.length})
                      </span>
                    </div>
                  </div>

                  {rolePlayers.length === 0 ? (
                    <p className="font-mono text-xs text-[#8B95AA]">
                      No {plural.toLowerCase()} signed yet.
                    </p>
                  ) : squadViewMode === 'grid' ? (
                    <div className="flex flex-wrap gap-4">
                      {rolePlayers.map((rp) => {
                        const p = rp.players;
                        if (!p) return null;
                        return (
                          <div
                            key={rp.id}
                            className="flex w-28 sm:w-32 flex-col items-center rounded-[4px] border border-white/[0.08] bg-[#070B14] p-2.5"
                          >
                            <PlayerCard
                              player={p}
                              size="sm"
                              basePriceLakhs={rp.base_price_lakhs}
                            />
                            <p className="mt-2 w-full truncate text-center font-sans text-xs font-semibold text-[#E8ECF4]">
                              {p.first_name} {p.last_name}
                            </p>
                            <div className="mt-1 flex items-center justify-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-[#F5B921] tabular-nums">
                                {formatLakhs(rp.sold_price_lakhs ?? 0)}
                              </span>
                              {p.is_overseas && (
                                <span className="rounded-[2px] border border-[#22D3EE]/45 bg-[#0E1524] px-1 py-[1px] font-mono text-[9px] font-bold text-[#22D3EE]">
                                  OS
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-[4px] border border-white/[0.08] bg-[#070B14]">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-white/[0.08] font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                            <th className="px-3 py-2">Code</th>
                            <th className="px-3 py-2">Player</th>
                            <th className="px-3 py-2">Nationality</th>
                            <th className="px-3 py-2 text-right">MAT</th>
                            <th className="px-3 py-2 text-right">RUNS</th>
                            <th className="px-3 py-2 text-right">WKTS</th>
                            <th className="px-3 py-2 text-right">Price Paid</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                          {rolePlayers.map((rp) => {
                            const p = rp.players;
                            if (!p) return null;
                            return (
                              <tr key={rp.id} className="hover:bg-[#141C2F]/50">
                                <td className="px-3 py-2 font-mono text-[#22D3EE]">
                                  {p.player_code}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-[#E8ECF4]">
                                      {p.first_name} {p.last_name}
                                    </span>
                                    {p.is_overseas && (
                                      <span className="rounded-[2px] border border-[#22D3EE]/45 bg-[#0E1524] px-1 py-[1px] font-mono text-[9px] font-bold text-[#22D3EE]">
                                        OS
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-[#8B95AA]">
                                  {p.nationality}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-[#E8ECF4]">
                                  {p.matches}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-[#E8ECF4]">
                                  {p.runs}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-[#E8ECF4]">
                                  {p.wickets}
                                </td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-[#F5B921] tabular-nums">
                                  {formatLakhs(rp.sold_price_lakhs ?? 0)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
