import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  Gavel,
  Lock,
  Plane,
  RefreshCw,
  Search,
  Timer,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TeamCrest } from '../../components/host/TeamCrest';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { CornerBrackets } from '../../components/ui/CornerBrackets';
import { INPUT_BASE_CLASS } from '../../components/ui/FormField';
import { Tag } from '../../components/ui/Tag';
import {
  getCategoryInfo,
  getSkillInfo,
  PLAYER_SKILLS,
  type PlayerSkill,
} from '../../data/categories';
import { useAuction } from '../../hooks/useAuction';
import { formatLakhs } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/auth';
import { useToastStore } from '../../store/toast';
import type {
  DbAccelPick,
  DbTeam,
  RoomPlayerWithPlayer,
} from '../../types/database';
import { usePlayTheme } from './playTheme';

type MyTeamDetail = Pick<
  DbTeam,
  'id' | 'room_id' | 'short_code' | 'name' | 'leader_name' | 'status'
>;

type RoleFilter = 'All' | PlayerSkill;
type OriginFilter = 'all' | 'overseas' | 'indian';
type SortOption = 'default' | 'base_desc' | 'base_asc' | 'runs_desc' | 'wickets_desc';

function formatCountdownMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function TeamAccelerated() {
  const { roomId } = useParams<{ roomId: string }>();
  const session = useAuthStore((s) => s.session);
  const showToast = useToastStore((s) => s.showToast);
  const { theme } = usePlayTheme();

  const {
    room,
    teams,
    roomPlayers,
    offsetMs,
    accelStatus,
    accelSelectionEndsAt,
    accelProgress,
    refetchAccelProgress,
    loading: auctionLoading,
    error: auctionError,
    refetch,
  } = useAuction(roomId, { role: 'team' });

  const [myTeam, setMyTeam] = useState<MyTeamDetail | null>(null);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState<string | null>(null);

  const [myPicks, setMyPicks] = useState<DbAccelPick[]>([]);
  const [picksLoading, setPicksLoading] = useState(false);
  const [picksError, setPicksError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Filters & sort for selecting phase
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('All');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('default');

  const [nowMs, setNowMs] = useState(() => Date.now());
  const autoResolvedWindowRef = useRef<string | null>(null);

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
        err instanceof Error ? err.message : 'Unable to verify franchise seat.',
      );
    } finally {
      setTeamLoading(false);
    }
  }, [roomId, session?.user.id]);

  useEffect(() => {
    void loadMyTeam();
  }, [loadMyTeam]);

  const loadMyPicks = useCallback(
    async (silent = true) => {
      if (!supabase || !roomId || !myTeam?.id) return;
      if (!silent) setPicksLoading(true);
      try {
        const { data, error: err } = await supabase
          .from('accel_picks')
          .select('id, room_id, team_id, room_player_id, created_at')
          .eq('room_id', roomId)
          .eq('team_id', myTeam.id)
          .order('created_at', { ascending: true });

        if (err) {
          setPicksError(err.message);
          return;
        }
        setMyPicks((data as DbAccelPick[]) ?? []);
        setPicksError(null);
      } catch (err) {
        setPicksError(
          err instanceof Error ? err.message : 'Unable to load your picks.',
        );
      } finally {
        setPicksLoading(false);
      }
    },
    [roomId, myTeam?.id],
  );

  // Load picks + subscribe to my team's accel_picks rows
  useEffect(() => {
    if (!supabase || !roomId || !myTeam?.id) return;
    void loadMyPicks(false);

    const client = supabase;
    const channel = client
      .channel(`team-accel-picks-${roomId}-${myTeam.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'accel_picks',
          filter: `team_id=eq.${myTeam.id}`,
        },
        () => {
          void loadMyPicks(true);
          void refetchAccelProgress();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [roomId, myTeam?.id, loadMyPicks, refetchAccelProgress]);

  // 200ms ticker while selecting
  useEffect(() => {
    if (accelStatus !== 'selecting') return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 200);
    return () => window.clearInterval(id);
  }, [accelStatus]);

  const selectionRemainingMs = useMemo(() => {
    if (accelStatus !== 'selecting' || !accelSelectionEndsAt) return null;
    const endMs = Date.parse(accelSelectionEndsAt);
    if (Number.isNaN(endMs)) return null;
    return Math.max(0, endMs - (nowMs + offsetMs));
  }, [accelStatus, accelSelectionEndsAt, nowMs, offsetMs]);

  // Auto-resolve once when selection countdown reaches 0
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
          title: 'Selection close failed',
          description: rpcErr.message,
          tone: 'error',
        });
      }
      await Promise.all([refetch(), loadMyPicks(true)]);
    })();
  }, [
    roomId,
    accelStatus,
    accelSelectionEndsAt,
    selectionRemainingMs,
    refetch,
    loadMyPicks,
    showToast,
  ]);

  const teamMap = useMemo(() => {
    const map = new Map<string, DbTeam>();
    for (const t of teams) map.set(t.id, t);
    return map;
  }, [teams]);

  const roomPlayerMap = useMemo(() => {
    const map = new Map<string, RoomPlayerWithPlayer>();
    for (const rp of roomPlayers) map.set(rp.id, rp);
    return map;
  }, [roomPlayers]);

  const mySquad = useMemo(() => {
    if (!myTeam) return [];
    return roomPlayers.filter(
      (rp) => rp.status === 'sold' && rp.sold_to_team_id === myTeam.id,
    );
  }, [roomPlayers, myTeam]);

  const myOverseasCount = useMemo(
    () => mySquad.filter((rp) => rp.players?.is_overseas).length,
    [mySquad],
  );

  const unsoldPlayers = useMemo(
    () => roomPlayers.filter((rp) => rp.status === 'unsold' && rp.players),
    [roomPlayers],
  );

  const myPickIdSet = useMemo(
    () => new Set(myPicks.map((p) => p.room_player_id)),
    [myPicks],
  );

  const picksLimit = room?.accel_picks_per_team ?? accelProgress?.picks_limit ?? 5;
  const picksUsed = myPicks.length;
  const squadFull = Boolean(room && mySquad.length >= room.squad_max);
  const overseasAtLimit = Boolean(
    room && myOverseasCount >= room.overseas_max,
  );
  const limitReached = picksUsed >= picksLimit;

  const filteredUnsold = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = unsoldPlayers.filter((rp) => {
      const p = rp.players;
      if (!p) return false;
      if (roleFilter !== 'All' && p.skill !== roleFilter) return false;
      if (originFilter === 'overseas' && !p.is_overseas) return false;
      if (originFilter === 'indian' && p.is_overseas) return false;
      if (q) {
        const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
        const code = (p.player_code ?? '').toLowerCase();
        if (!fullName.includes(q) && !code.includes(q)) return false;
      }
      return true;
    });

    if (sortBy === 'base_desc') {
      return [...list].sort((a, b) => b.base_price_lakhs - a.base_price_lakhs);
    }
    if (sortBy === 'base_asc') {
      return [...list].sort((a, b) => a.base_price_lakhs - b.base_price_lakhs);
    }
    if (sortBy === 'runs_desc') {
      return [...list].sort(
        (a, b) => (b.players?.runs ?? 0) - (a.players?.runs ?? 0),
      );
    }
    if (sortBy === 'wickets_desc') {
      return [...list].sort(
        (a, b) => (b.players?.wickets ?? 0) - (a.players?.wickets ?? 0),
      );
    }
    return list;
  }, [unsoldPlayers, roleFilter, originFilter, searchQuery, sortBy]);

  const myPickedPlayers = useMemo(() => {
    return myPicks
      .map((pick) => ({
        pick,
        rp: roomPlayerMap.get(pick.room_player_id) ?? null,
      }))
      .filter((item) => item.rp && item.rp.players);
  }, [myPicks, roomPlayerMap]);

  const handleTogglePick = async (roomPlayerId: string, currentlyPicked: boolean) => {
    if (!supabase || !roomId || !myTeam || togglingId) return;
    if (squadFull) return;
    if (!currentlyPicked && limitReached) return;

    setTogglingId(roomPlayerId);
    try {
      const { error: rpcErr } = await supabase.rpc('accel_pick', {
        p_room: roomId,
        p_room_player_id: roomPlayerId,
        p_pick: !currentlyPicked,
      });

      if (rpcErr) {
        showToast({
          title: 'Could not update pick',
          description: rpcErr.message,
          tone: 'error',
        });
        return;
      }

      await Promise.all([loadMyPicks(true), refetchAccelProgress()]);
    } catch (err) {
      showToast({
        title: 'Could not update pick',
        description:
          err instanceof Error ? err.message : 'Unexpected network error.',
        tone: 'error',
      });
    } finally {
      setTogglingId(null);
    }
  };

  if (teamLoading || auctionLoading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] space-y-5 p-4 sm:p-6" aria-busy="true">
        <div className="h-32 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]" />
        <div className="h-16 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, idx) => (
            <div
              key={idx}
              className="h-36 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (teamError || auctionError || !room || !myTeam) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
        <Card brackets bracketTone="gold" className="p-8">
          <Badge tone="danger">ACCELERATED ROUND ERROR</Badge>
          <h1 className="mt-3 font-display text-4xl tracking-wide text-[#E8ECF4]">
            UNABLE TO LOAD ACCELERATED ROUND
          </h1>
          <p className="mt-2 text-sm text-red-300">
            {teamError || auctionError || 'Franchise access could not be verified.'}
          </p>
          <div className="mt-6 flex items-center gap-3">
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

  // STATUS: OFF
  if (accelStatus === 'off') {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 items-center justify-center px-4 py-14 sm:px-6">
        <div
          style={{ borderColor: theme.primary }}
          className="relative w-full rounded-[4px] border bg-[#0E1524] p-8 sm:p-10 text-center"
        >
          <CornerBrackets tone="gold" size="md" />
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[4px] border border-white/15 bg-[#070B14]">
            <Lock className="h-7 w-7 text-[#F5B921]" aria-hidden="true" />
          </div>
          <h1 className="mt-5 font-display text-4xl tracking-wide text-[#E8ECF4]">
            ACCELERATED ROUND LOCKED
          </h1>
          <p className="mt-2 text-sm text-[#8B95AA]">
            The accelerated round has not started
          </p>
          <div className="mt-6 flex justify-center">
            <Link to={`/play/${roomId}`}>
              <Button variant="outline" size="md">
                <span>Back to dashboard</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // STATUS: SELECTING
  if (accelStatus === 'selecting') {
    return (
      <div className="mx-auto w-full max-w-[1400px] space-y-5 p-4 sm:p-6">
        {/* Header with Big Countdown & Picks Counter */}
        <section
          style={{
            borderColor: theme.primary,
            boxShadow: `0 0 24px ${theme.glow}`,
          }}
          className="relative rounded-[4px] border bg-[#0E1524] p-5 sm:p-6"
        >
          <CornerBrackets tone="gold" size="md" />
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge tone="gold">
                  <Timer className="h-3 w-3" />
                  <span>SELECTION WINDOW OPEN</span>
                </Badge>
                <span className="font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
                  PRIVATE FRANCHISE NOMINATIONS
                </span>
              </div>

              <h1 className="mt-2 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
                ACCELERATED ROUND PICKS
              </h1>
              <p className="mt-1 text-sm text-[#E8ECF4]">
                You can choose up to{' '}
                <span className="font-mono font-bold text-[#F5B921]">
                  {picksLimit}
                </span>{' '}
                players from the unsold pool. Only your franchise can see your picks.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 shrink-0">
              <div
                style={{
                  borderColor: theme.primary,
                  backgroundColor: theme.surfaceTint,
                }}
                className="rounded-[4px] border bg-[#070B14] px-5 py-3 text-center"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                  PICKS USED
                </p>
                <p className="mt-1 font-display text-4xl leading-none text-[#F5B921] tabular-nums">
                  {picksUsed} / {picksLimit}
                </p>
              </div>

              <div className="rounded-[4px] border border-[#22D3EE]/50 bg-[#070B14] px-5 py-3 text-center">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#22D3EE]">
                  WINDOW CLOSES IN
                </p>
                <p className="mt-1 font-display text-5xl leading-none text-[#E8ECF4] tabular-nums">
                  {selectionRemainingMs !== null
                    ? formatCountdownMs(selectionRemainingMs)
                    : '00:00'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Squad Full Banner */}
        {squadFull && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-[4px] border border-red-500/60 bg-red-500/15 px-5 py-3.5 text-sm font-medium text-red-200"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
            <span>Your squad is full, you cannot pick players</span>
          </div>
        )}

        {/* Overseas Limit Hint */}
        {!squadFull && overseasAtLimit && (
          <div className="flex items-center gap-3 rounded-[4px] border border-[#F5B921]/45 bg-[#F5B921]/10 px-5 py-3 text-xs text-[#F5B921]">
            <Plane className="h-4 w-4 shrink-0" />
            <span>
              Overseas limit reached ({myOverseasCount}/{room.overseas_max} in squad). You can still nominate overseas players, though bidding enforces squad limits.
            </span>
          </div>
        )}

        {picksError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-[4px] border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200"
          >
            <span>{picksError}</span>
            <Button variant="cyan" size="sm" onClick={() => void loadMyPicks(false)}>
              Retry
            </Button>
          </div>
        )}

        {/* Filters & Sort Bar */}
        <Card className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B95AA]"
                aria-hidden="true"
              />
              <input
                type="text"
                aria-label="Search unsold players by name or code"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by player name or code..."
                className={`${INPUT_BASE_CLASS} pl-9 py-2 text-xs`}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Role filter */}
              <div
                role="group"
                aria-label="Filter by role"
                className="inline-flex flex-wrap rounded-[4px] border border-white/10 bg-[#070B14] p-0.5"
              >
                {(['All', ...PLAYER_SKILLS.map((s) => s.value)] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoleFilter(r)}
                    className={`rounded-[2px] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors ${
                      roleFilter === r
                        ? 'bg-[#22D3EE] font-semibold text-[#070B14]'
                        : 'text-[#8B95AA] hover:text-[#E8ECF4]'
                    }`}
                  >
                    {r === 'All-Rounder' ? 'AR' : r === 'Wicketkeeper' ? 'WK' : r}
                  </button>
                ))}
              </div>

              {/* Overseas / Indian filter */}
              <div
                role="group"
                aria-label="Filter by origin"
                className="inline-flex rounded-[4px] border border-white/10 bg-[#070B14] p-0.5"
              >
                {(
                  [
                    { key: 'all', label: 'All' },
                    { key: 'overseas', label: 'Overseas' },
                    { key: 'indian', label: 'Indian' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setOriginFilter(opt.key)}
                    className={`rounded-[2px] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors ${
                      originFilter === opt.key
                        ? 'bg-[#F5B921] font-semibold text-[#070B14]'
                        : 'text-[#8B95AA] hover:text-[#E8ECF4]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Sort */}
              <select
                aria-label="Sort unsold players"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="rounded-[4px] border border-white/15 bg-[#070B14] px-3 py-1.5 font-mono text-xs text-[#E8ECF4] focus:border-[#22D3EE] focus:outline-none"
              >
                <option value="default">Sort: Auction Order</option>
                <option value="base_desc">Base Price: High to Low</option>
                <option value="base_asc">Base Price: Low to High</option>
                <option value="runs_desc">Runs: High to Low</option>
                <option value="wickets_desc">Wickets: High to Low</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Unsold Players Grid */}
        {picksLoading && myPicks.length === 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, idx) => (
              <div
                key={idx}
                className="h-40 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]"
              />
            ))}
          </div>
        ) : filteredUnsold.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
              {unsoldPlayers.length === 0
                ? 'There are no unsold players available.'
                : 'No unsold players match your current filters.'}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {filteredUnsold.map((rp) => {
              const p = rp.players;
              if (!p) return null;
              const isPicked = myPickIdSet.has(rp.id);
              const isToggling = togglingId === rp.id;
              const disablePick =
                squadFull || (!isPicked && limitReached) || Boolean(togglingId);
              const skillInfo = getSkillInfo(p.skill);
              const catInfo = getCategoryInfo(p.category);

              return (
                <div
                  key={rp.id}
                  style={
                    isPicked
                      ? {
                          borderColor: theme.primary,
                          backgroundColor: theme.surfaceTint,
                          boxShadow: `0 0 18px ${theme.glow}`,
                        }
                      : undefined
                  }
                  className={`flex flex-col justify-between gap-3 rounded-[4px] border p-4 transition-colors ${
                    isPicked
                      ? ''
                      : 'border-white/[0.08] bg-[#0E1524] hover:border-white/20'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[11px] font-bold text-[#22D3EE]">
                            {p.player_code}
                          </span>
                          {catInfo && (
                            <span
                              className={`inline-flex items-center rounded-[2px] border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] ${catInfo.chipClass}`}
                            >
                              {catInfo.label}
                            </span>
                          )}
                          {skillInfo && (
                            <span
                              className={`inline-flex items-center rounded-[2px] border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] ${skillInfo.chipClass}`}
                            >
                              {skillInfo.value}
                            </span>
                          )}
                        </div>

                        <h3 className="mt-1 truncate font-display text-2xl leading-none tracking-wide text-[#E8ECF4]">
                          {p.first_name} {p.last_name}
                        </h3>

                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase text-[#8B95AA]">
                          <span>{p.nationality}</span>
                          {p.is_overseas && <Tag accent="gold">OVERSEAS</Tag>}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#8B95AA]">
                          BASE
                        </p>
                        <p className="font-mono text-sm font-bold text-[#F5B921] tabular-nums">
                          {formatLakhs(rp.base_price_lakhs)}
                        </p>
                      </div>
                    </div>

                    {/* Key Stats */}
                    <div className="grid grid-cols-3 gap-2 rounded-[3px] border border-white/[0.06] bg-[#070B14] px-3 py-2 font-mono tabular-nums">
                      <div>
                        <p className="text-[9px] text-[#8B95AA]">MAT</p>
                        <p className="text-xs font-bold text-[#E8ECF4]">
                          {p.matches}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-[#8B95AA]">RUNS</p>
                        <p className="text-xs font-bold text-[#E8ECF4]">
                          {p.runs}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-[#8B95AA]">WKTS</p>
                        <p className="text-xs font-bold text-[#E8ECF4]">
                          {p.wickets}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Toggle Pick Button */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {!isPicked && !squadFull && limitReached ? (
                      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[#F5B921]">
                        Limit reached
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[#8B95AA]">
                        {isPicked ? 'Selected for round' : 'Available'}
                      </span>
                    )}

                    <button
                      type="button"
                      disabled={disablePick}
                      onClick={() => void handleTogglePick(rp.id, isPicked)}
                      style={
                        isPicked
                          ? {
                              backgroundColor: theme.primary,
                              color: theme.accent,
                              borderColor: theme.secondary,
                            }
                          : undefined
                      }
                      className={`inline-flex h-9 min-w-[110px] items-center justify-center gap-1.5 rounded-[3px] border px-3.5 font-mono text-xs font-bold uppercase tracking-[0.08em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE] ${
                        isPicked
                          ? 'hover:brightness-110'
                          : 'border-[#22D3EE]/50 bg-[#070B14] text-[#22D3EE] hover:bg-[#22D3EE]/15'
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      {isToggling ? (
                        <span>Saving...</span>
                      ) : isPicked ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>PICKED</span>
                        </>
                      ) : (
                        <span>PICK</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // STATUS: LIVE or DONE
  const queueTotal = accelProgress?.queue_total ?? 0;
  const queueRemaining = accelProgress?.queue_remaining ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 p-4 sm:p-6">
      <section
        style={{
          borderColor: accelStatus === 'live' ? '#EF4444' : theme.primary,
        }}
        className="relative rounded-[4px] border bg-[#0E1524] p-6 sm:p-8"
      >
        <CornerBrackets
          tone={accelStatus === 'live' ? 'gold' : 'cyan'}
          size="md"
        />

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              {accelStatus === 'live' ? (
                <Badge tone="danger">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 motion-safe:animate-pulse" />
                  <span>ACCELERATED ROUND LIVE</span>
                </Badge>
              ) : (
                <Badge tone="cyan">ACCELERATED ROUND FINISHED</Badge>
              )}
            </div>

            <h1 className="mt-2 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
              {accelStatus === 'live'
                ? 'ACCELERATED AUCTION IN PROGRESS'
                : 'ACCELERATED ROUND FINISHED'}
            </h1>

            <p className="mt-2 font-mono text-sm text-[#22D3EE] tabular-nums">
              {accelStatus === 'live'
                ? `Selection closed. ${queueTotal} players are in the accelerated round, ${queueRemaining} left`
                : 'Final results for your nominated players are shown below.'}
            </p>
          </div>

          {accelStatus === 'live' && (
            <Link to={`/play/${roomId}/auction`} className="shrink-0">
              <button
                type="button"
                style={{
                  backgroundColor: theme.primary,
                  color: theme.accent,
                  borderColor: theme.secondary,
                }}
                className="inline-flex h-12 items-center gap-2.5 rounded-[4px] border px-6 font-mono text-xs font-bold uppercase tracking-[0.08em] transition-transform hover:brightness-110"
              >
                <Gavel className="h-4 w-4" />
                <span>Go to auction room</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
          )}
        </div>
      </section>

      {/* My Picks & Results */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#141C2F]/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#F5B921]" aria-hidden="true" />
            <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              MY PICKS &amp; RESULTS
            </h2>
          </div>
          <span className="font-mono text-xs text-[#8B95AA] tabular-nums">
            {myPickedPlayers.length} PICKED
          </span>
        </div>

        {myPickedPlayers.length === 0 ? (
          <div className="p-10 text-center font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
            Your franchise did not nominate any players in this accelerated round.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {myPickedPlayers.map(({ pick, rp }) => {
              if (!rp || !rp.players) return null;
              const p = rp.players;
              const isSold = rp.status === 'sold';
              const sTeam = rp.sold_to_team_id
                ? teamMap.get(rp.sold_to_team_id)
                : null;
              const isWaiting =
                accelStatus === 'live' && (rp.status === 'unsold' || rp.status === 'live');

              return (
                <div
                  key={pick.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#22D3EE]">
                        {p.player_code}
                      </span>
                      <span className="font-display text-2xl leading-none tracking-wide text-[#E8ECF4]">
                        {p.first_name} {p.last_name}
                      </span>
                      {p.is_overseas && <Tag accent="gold">OVERSEAS</Tag>}
                    </div>
                    <p className="mt-1 font-mono text-[11px] uppercase text-[#8B95AA]">
                      {p.skill} · {p.nationality} · BASE {formatLakhs(rp.base_price_lakhs)}
                    </p>
                  </div>

                  <div className="shrink-0">
                    {isSold ? (
                      <div className="inline-flex items-center gap-2 rounded-[4px] border border-[#F5B921]/45 bg-[#F5B921]/10 px-3 py-1.5 font-mono text-xs font-semibold text-[#F5B921]">
                        {sTeam && (
                          <TeamCrest shortCode={sTeam.short_code} size="sm" />
                        )}
                        <span>
                          SOLD to {sTeam?.short_code || 'Team'} for{' '}
                          {formatLakhs(rp.sold_price_lakhs ?? 0)}
                        </span>
                      </div>
                    ) : isWaiting ? (
                      <Badge tone="cyan">
                        <Clock className="h-3 w-3" />
                        <span>
                          {rp.status === 'live' ? 'ON BLOCK' : 'WAITING'}
                        </span>
                      </Badge>
                    ) : (
                      <Badge tone="danger">UNSOLD</Badge>
                    )}
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
