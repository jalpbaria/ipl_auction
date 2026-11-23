import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Lock,
  RefreshCw,
  Save,
  Search,
  Star,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  GroundView,
  roomPlayerToGroundPlayer,
} from '../../components/ground/GroundView';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import {
  getSkillInfo,
  PLAYER_SKILLS,
  type PlayerSkill,
} from '../../data/categories';
import { formatLakhs } from '../../lib/format';
import { overseasCount, roleCounts, toSquadPlayers } from '../../lib/squadRules';
import { supabase } from '../../lib/supabase';
import { formatDateTime12h } from '../../lib/time';
import { useAuthStore } from '../../store/auth';
import { useToastStore } from '../../store/toast';
import type {
  DbPlayer,
  DbPlayingXi,
  DbRoom,
  DbTeam,
  RoomPlayerStatus,
  RoomPlayerWithPlayer,
} from '../../types/database';
import { usePlayTheme } from './playTheme';

type MyTeamDetail = Pick<
  DbTeam,
  'id' | 'room_id' | 'short_code' | 'name' | 'leader_name' | 'status'
>;

type RoleFilter = 'All' | PlayerSkill;

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

interface StoredXiDraft {
  ids: string[];
  captainId: string | null;
}

interface XiCheckRule {
  id: string;
  label: string;
  ok: boolean;
  have: number;
  need: number;
  unitText?: string;
}

const ROOM_SELECT =
  'id, host_id, name, starting_purse_lakhs, squad_max, squad_min, overseas_max, xi_overseas_max, xi_locked, bid_timer_seconds, auction_open, trade_status, trade_ends_at, status, created_at';

const ROOM_PLAYER_SELECT =
  'id, base_price_lakhs, set_no, sort_order, status, sold_to_team_id, sold_price_lakhs, sold_at, players(id, serial, player_code, first_name, last_name, category, skill, nationality, is_overseas, ipl_season, ipl_team, matches, runs, strike_rate, economy, wickets, base_price_lakhs, card_image_url)';

function draftStorageKey(roomId: string): string {
  return `ipl_xi_draft_${roomId}`;
}

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

function readDraft(roomId: string): StoredXiDraft | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(roomId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredXiDraft>;
    if (!Array.isArray(parsed.ids)) return null;
    const ids = parsed.ids.filter((id): id is string => typeof id === 'string');
    const captainId =
      typeof parsed.captainId === 'string' ? parsed.captainId : null;
    return { ids, captainId };
  } catch {
    return null;
  }
}

function writeDraft(roomId: string, draft: StoredXiDraft) {
  try {
    localStorage.setItem(draftStorageKey(roomId), JSON.stringify(draft));
  } catch {
    // Ignore storage quota errors
  }
}

function clearDraft(roomId: string) {
  try {
    localStorage.removeItem(draftStorageKey(roomId));
  } catch {
    // Ignore storage errors
  }
}

function sameIdSelection(
  aIds: readonly string[],
  aCap: string | null,
  bIds: readonly string[],
  bCap: string | null,
): boolean {
  if (aCap !== bCap) return false;
  if (aIds.length !== bIds.length) return false;
  const setA = new Set(aIds);
  for (const id of bIds) {
    if (!setA.has(id)) return false;
  }
  return true;
}

function PlayingXiSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-[1440px] space-y-6 p-4 sm:p-6"
      aria-busy="true"
    >
      <div className="h-20 motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524]" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="h-[540px] motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524] xl:col-span-4" />
        <div className="h-[540px] motion-safe:animate-pulse rounded-[4px] border border-white/[0.08] bg-[#0E1524] xl:col-span-8" />
      </div>
    </div>
  );
}

export default function TeamPlayingXi() {
  const { roomId } = useParams<{ roomId: string }>();
  const session = useAuthStore((s) => s.session);
  const showToast = useToastStore((s) => s.showToast);
  const { theme } = usePlayTheme();

  const [team, setTeam] = useState<MyTeamDetail | null>(null);
  const [room, setRoom] = useState<DbRoom | null>(null);
  const [mySquad, setMySquad] = useState<RoomPlayerWithPlayer[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedCaptainId, setSavedCaptainId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const [roleFilter, setRoleFilter] = useState<RoleFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasAcceptedTrade, setHasAcceptedTrade] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initializedSelectionRef = useRef(false);
  const requestSeqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset initialization flag if room changes
  useEffect(() => {
    initializedSelectionRef.current = false;
  }, [roomId]);

  const loadXiData = useCallback(
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
        if (teamErr) throw new Error(teamErr.message);

        if (!teamData) {
          setTeam(null);
          setError('You are not an active member of this room.');
          return;
        }

        const myTeam = teamData as MyTeamDetail;
        setTeam(myTeam);

        const [roomRes, playersRes, xiRes, tradesRes] = await Promise.all([
          supabase.from('rooms').select(ROOM_SELECT).eq('id', roomId).maybeSingle(),
          supabase
            .from('room_players')
            .select(ROOM_PLAYER_SELECT)
            .eq('room_id', roomId)
            .eq('status', 'sold')
            .eq('sold_to_team_id', myTeam.id)
            .order('sort_order', { ascending: true })
            .range(0, 999),
          supabase
            .from('playing_xi')
            .select('team_id, room_id, room_player_ids, captain_room_player_id, updated_at')
            .eq('room_id', roomId)
            .eq('team_id', myTeam.id)
            .maybeSingle(),
          supabase
            .from('trades')
            .select('id')
            .eq('room_id', roomId)
            .eq('status', 'accepted')
            .or(`from_team_id.eq.${myTeam.id},to_team_id.eq.${myTeam.id}`)
            .limit(1),
        ]);

        if (!mountedRef.current || seq !== requestSeqRef.current) return;

        if (roomRes.error) throw new Error(roomRes.error.message);
        if (!roomRes.data) throw new Error('Auction room not found.');
        if (playersRes.error) throw new Error(playersRes.error.message);
        if (xiRes.error) throw new Error(xiRes.error.message);

        const nextRoom = roomRes.data as DbRoom;
        const normalizedAll = ((playersRes.data as RawRoomPlayerRow[]) ?? []).map(
          normalizeRoomPlayer,
        );
        const squad = toSquadPlayers(normalizedAll, myTeam.id);
        const validIdSet = new Set(squad.map((rp) => rp.id));

        setRoom(nextRoom);
        setMySquad(squad);
        setHasAcceptedTrade(
          !tradesRes.error && Array.isArray(tradesRes.data) && tradesRes.data.length > 0,
        );

        const rawXi = xiRes.data as DbPlayingXi | null;
        const dbIds = rawXi && Array.isArray(rawXi.room_player_ids)
          ? rawXi.room_player_ids.filter((id) => validIdSet.has(id))
          : [];
        const dbCaptain =
          rawXi?.captain_room_player_id &&
          dbIds.includes(rawXi.captain_room_player_id)
            ? rawXi.captain_room_player_id
            : null;
        const dbUpdatedAt = rawXi && dbIds.length > 0 ? rawXi.updated_at : null;

        setSavedIds(dbIds);
        setSavedCaptainId(dbCaptain);
        setSavedAt(dbUpdatedAt);

        if (!initializedSelectionRef.current) {
          initializedSelectionRef.current = true;
          if (dbIds.length > 0) {
            setSelectedIds(dbIds);
            setCaptainId(dbCaptain);
          } else if (!nextRoom.xi_locked) {
            const draft = readDraft(roomId);
            if (draft) {
              const validDraftIds = Array.from(
                new Set(draft.ids.filter((id) => validIdSet.has(id))),
              ).slice(0, 11);
              const validDraftCaptain =
                draft.captainId && validDraftIds.includes(draft.captainId)
                  ? draft.captainId
                  : null;
              setSelectedIds(validDraftIds);
              setCaptainId(validDraftCaptain);
            } else {
              setSelectedIds([]);
              setCaptainId(null);
            }
          } else {
            setSelectedIds([]);
            setCaptainId(null);
          }
        } else {
          // Prune any players no longer owned by this team (e.g. host voided a sale)
          setSelectedIds((prev) => prev.filter((id) => validIdSet.has(id)));
          setCaptainId((prev) => (prev && validIdSet.has(prev) ? prev : null));
          setFocusedId((prev) => (prev && validIdSet.has(prev) ? prev : null));
        }
      } catch (err) {
        if (!mountedRef.current || seq !== requestSeqRef.current) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load Playing XI builder.',
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
    void loadXiData(false);
  }, [loadXiData]);

  // Realtime sync on rooms (for xi_locked), room_players, and playing_xi
  const myTeamId = team?.id;
  useEffect(() => {
    if (!supabase || !roomId || !myTeamId) return;
    const client = supabase;

    const channel = client
      .channel(`play-xi-${roomId}-${myTeamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
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
          table: 'room_players',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void loadXiData(true);
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
            const ids = Array.isArray(row.room_player_ids)
              ? row.room_player_ids
              : [];
            setSavedIds(ids);
            setSavedCaptainId(row.captain_room_player_id);
            setSavedAt(ids.length > 0 ? row.updated_at : null);
          } else if (payload.eventType === 'DELETE') {
            setSavedIds([]);
            setSavedCaptainId(null);
            setSavedAt(null);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void loadXiData(true);
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [roomId, myTeamId, loadXiData]);

  // Persist localStorage draft while no XI has been saved yet and room is unlocked
  useEffect(() => {
    if (!roomId || loading || !room) return;
    if (savedIds.length > 0 || room.xi_locked) return;
    writeDraft(roomId, { ids: selectedIds, captainId });
  }, [roomId, loading, room, savedIds.length, selectedIds, captainId]);

  const squadById = useMemo(() => {
    const map = new Map<string, RoomPlayerWithPlayer>();
    for (const rp of mySquad) {
      map.set(rp.id, rp);
    }
    return map;
  }, [mySquad]);

  const selectedPlayers = useMemo(() => {
    return selectedIds
      .map((id) => squadById.get(id))
      .filter((rp): rp is RoomPlayerWithPlayer => Boolean(rp));
  }, [selectedIds, squadById]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedGroundPlayers = useMemo(() => {
    return selectedPlayers
      .map(roomPlayerToGroundPlayer)
      .filter((gp): gp is NonNullable<typeof gp> => Boolean(gp));
  }, [selectedPlayers]);

  const filteredSquad = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return mySquad.filter((rp) => {
      const p = rp.players;
      if (!p) return false;
      if (roleFilter !== 'All' && p.skill !== roleFilter) return false;
      if (!q) return true;
      const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
      return (
        fullName.includes(q) ||
        p.player_code.toLowerCase().includes(q) ||
        p.nationality.toLowerCase().includes(q)
      );
    });
  }, [mySquad, roleFilter, searchQuery]);

  const xiOverseasLimit = room ? (room.xi_overseas_max ?? room.overseas_max) : 4;

  const validationRules = useMemo<XiCheckRule[]>(() => {
    const roles = roleCounts(selectedPlayers);
    const overseas = overseasCount(selectedPlayers);
    const hasCaptain = Boolean(captainId && selectedIdSet.has(captainId));

    return [
      {
        id: 'exact-11',
        label: 'Exactly 11 players selected',
        ok: selectedPlayers.length === 11,
        have: selectedPlayers.length,
        need: 11,
      },
      {
        id: 'min-wk',
        label: 'At least 1 Wicketkeeper',
        ok: roles.Wicketkeeper >= 1,
        have: roles.Wicketkeeper,
        need: 1,
      },
      {
        id: 'min-bat',
        label: 'At least 3 Batters',
        ok: roles.Batter >= 3,
        have: roles.Batter,
        need: 3,
      },
      {
        id: 'min-bowl',
        label: 'At least 3 Bowlers',
        ok: roles.Bowler >= 3,
        have: roles.Bowler,
        need: 3,
      },
      {
        id: 'max-os',
        label: `Overseas max ${xiOverseasLimit}`,
        ok: overseas <= xiOverseasLimit,
        have: overseas,
        need: xiOverseasLimit,
      },
      {
        id: 'captain',
        label: 'Captain chosen',
        ok: hasCaptain,
        have: hasCaptain ? 1 : 0,
        need: 1,
      },
    ];
  }, [selectedPlayers, captainId, selectedIdSet, xiOverseasLimit]);

  const allChecksPass = useMemo(
    () => validationRules.every((rule) => rule.ok),
    [validationRules],
  );

  const hasSavedXi = savedIds.length > 0;
  const xiLocked = Boolean(room?.xi_locked);
  const insufficientSquad = mySquad.length < 11;
  const canEdit = !xiLocked && !insufficientSquad;

  const hasUnsavedChanges = useMemo(() => {
    if (xiLocked) return false;
    if (!hasSavedXi && selectedIds.length === 0 && !captainId) return false;
    return !sameIdSelection(selectedIds, captainId, savedIds, savedCaptainId);
  }, [xiLocked, hasSavedXi, selectedIds, captainId, savedIds, savedCaptainId]);

  const focusedRoomPlayer =
    focusedId && selectedIdSet.has(focusedId)
      ? squadById.get(focusedId) ?? null
      : null;

  const handleTogglePlayer = (rpId: string) => {
    if (!canEdit) return;
    if (selectedIdSet.has(rpId)) {
      setSelectedIds((prev) => prev.filter((id) => id !== rpId));
      if (captainId === rpId) {
        setCaptainId(null);
      }
      if (focusedId === rpId) {
        setFocusedId(null);
      }
      return;
    }

    if (selectedIds.length >= 11) {
      showToast({
        title: '11 players already selected',
        description: 'Remove a player before adding another to your Playing XI.',
        tone: 'warning',
      });
      return;
    }

    setSelectedIds((prev) => [...prev, rpId]);
  };

  const handleSetCaptain = (rpId: string) => {
    if (!canEdit) return;
    if (!selectedIdSet.has(rpId)) {
      if (selectedIds.length >= 11) {
        showToast({
          title: 'Select player in XI first',
          description: 'Playing XI is full (11/11). Remove someone before adding this captain.',
          tone: 'warning',
        });
        return;
      }
      setSelectedIds((prev) => [...prev, rpId]);
    }
    setCaptainId(rpId);
  };

  const handleClearSelection = () => {
    if (!canEdit) return;
    setSelectedIds([]);
    setCaptainId(null);
    setFocusedId(null);
  };

  const handleResetToSaved = () => {
    if (!canEdit || !hasSavedXi) return;
    setSelectedIds(savedIds);
    setCaptainId(savedCaptainId);
    setFocusedId(null);
  };

  const handleSaveXi = async () => {
    if (!supabase || !roomId || !canEdit || !allChecksPass || !captainId) return;
    setSaving(true);
    try {
      const { error: rpcErr } = await supabase.rpc('save_playing_xi', {
        p_room: roomId,
        p_ids: selectedIds,
        p_captain: captainId,
      });

      if (rpcErr) {
        showToast({
          title: 'Unable to save Playing XI',
          description: rpcErr.message || 'Server rejected Playing XI.',
          tone: 'error',
        });
        return;
      }

      const nowIso = new Date().toISOString();
      clearDraft(roomId);
      setSavedIds(selectedIds);
      setSavedCaptainId(captainId);
      setSavedAt(nowIso);

      showToast({
        title: 'Playing XI saved',
        description: 'Your 11 players and captain have been submitted.',
        tone: 'success',
      });
    } catch (err) {
      showToast({
        title: 'Unable to save Playing XI',
        description:
          err instanceof Error ? err.message : 'Unexpected error saving XI.',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PlayingXiSkeleton />;
  }

  if (error || !team || !room) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-12 sm:px-6">
        <Card brackets bracketTone="gold" className="p-8">
          <Badge tone="danger">PLAYING XI ERROR</Badge>
          <h1 className="mt-3 font-display text-4xl tracking-wide text-[#E8ECF4]">
            UNABLE TO LOAD XI BUILDER
          </h1>
          <p className="mt-2 text-sm text-red-300">
            {error || 'Room or franchise squad could not be loaded.'}
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Button variant="cyan" size="sm" onClick={() => void loadXiData(false)}>
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const captainPlayer = captainId ? squadById.get(captainId)?.players ?? null : null;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 p-4 sm:p-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 border-b border-white/[0.08] pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p
            style={{ color: theme.highlight }}
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em]"
          >
            {team.short_code} // STARTING XI FORMATION
          </p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl leading-none tracking-wide text-[#E8ECF4]">
            PLAYING XI BUILDER
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {hasUnsavedChanges && (
            <Badge tone="gold">Unsaved changes</Badge>
          )}
          {savedAt ? (
            <Badge tone="cyan">
              Saved {formatDateTime12h(savedAt)}
            </Badge>
          ) : (
            <Badge tone="neutral">Not saved yet</Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void loadXiData(true)}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? 'motion-safe:animate-spin' : ''}`}
            />
            <span>{refreshing ? 'Syncing...' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {/* Host Lock Banner */}
      {xiLocked && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-[4px] border border-red-500/45 bg-red-500/10 px-4 py-3 text-xs text-red-200"
        >
          <Lock className="h-4 w-4 shrink-0 text-red-400" />
          <span className="font-mono uppercase tracking-[0.06em]">
            The host has locked the playing XI. Editing is disabled.
          </span>
        </div>
      )}

      {/* Cleared-by-trade Banner */}
      {!hasSavedXi && hasAcceptedTrade && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-[4px] border border-[#22D3EE]/50 bg-[#22D3EE]/10 px-4 py-3 text-xs text-[#E8ECF4]"
        >
          <ArrowLeftRight className="h-4 w-4 shrink-0 text-[#22D3EE]" />
          <span className="font-mono uppercase tracking-[0.06em]">
            Your saved playing XI was cleared after a completed trade. Rebuild and save your starting 11 and captain.
          </span>
        </div>
      )}

      {/* Insufficient Squad Banner */}
      {insufficientSquad && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-[4px] border border-[#F5B921]/45 bg-[#F5B921]/10 px-4 py-3 text-xs text-[#F5B921]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-mono uppercase tracking-[0.06em]">
            You need at least 11 players to build a playing XI (currently{' '}
            {mySquad.length}/11 signed).
          </span>
        </div>
      )}

      {/* Main Split Builder: Left ~35% Squad Picker | Right ~65% Ground + Checklist */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left Panel (4 cols ~33%): Squad Picker */}
        <Card
          brackets
          bracketTone="subtle"
          className="flex flex-col overflow-hidden xl:col-span-4"
          style={{ borderColor: `${theme.primary}66` }}
        >
          <div className="border-b border-white/[0.08] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" style={{ color: theme.highlight }} />
                <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
                  MY SQUAD
                </h2>
              </div>
              <span
                style={{
                  borderColor: theme.primary,
                  backgroundColor: theme.surfaceTint,
                  color: theme.highlight,
                }}
                className="rounded-[3px] border px-2.5 py-1 font-mono text-xs font-bold tabular-nums"
              >
                {selectedIds.length} / 11 selected
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8B95AA]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, code, country..."
                aria-label="Search squad players"
                className="h-9 w-full rounded-[3px] border border-white/15 bg-[#070B14] pl-8 pr-3 font-sans text-xs text-[#E8ECF4] placeholder:text-[#8B95AA]/70 focus:border-[#22D3EE] focus:outline-none"
              />
            </div>

            {/* Role Filter Tabs */}
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by role">
              {(['All', ...PLAYER_SKILLS.map((s) => s.value)] as RoleFilter[]).map(
                (tab) => {
                  const active = roleFilter === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setRoleFilter(tab)}
                      style={
                        active
                          ? {
                              backgroundColor: theme.primary,
                              color: theme.accent,
                              borderColor: theme.primary,
                            }
                          : undefined
                      }
                      className={`rounded-[2px] border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                        active
                          ? ''
                          : 'border-white/15 bg-[#070B14] text-[#8B95AA] hover:text-[#E8ECF4]'
                      }`}
                    >
                      {tab}
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {/* Squad List */}
          <div className="flex-1 overflow-y-auto max-h-[620px] p-3 space-y-2">
            {mySquad.length === 0 ? (
              <div className="py-12 text-center">
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-[#8B95AA]">
                  No players bought yet.
                </p>
              </div>
            ) : filteredSquad.length === 0 ? (
              <div className="py-10 text-center">
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-[#8B95AA]">
                  No squad players match the current filter.
                </p>
              </div>
            ) : (
              filteredSquad.map((rp) => {
                const p = rp.players;
                if (!p) return null;
                const isSelected = selectedIdSet.has(rp.id);
                const isCaptain = captainId === rp.id;
                const skillInfo = getSkillInfo(p.skill);

                return (
                  <div
                    key={rp.id}
                    style={
                      isSelected
                        ? {
                            borderColor: theme.primary,
                            backgroundColor: theme.surfaceTint,
                          }
                        : undefined
                    }
                    className={`flex items-center justify-between gap-2 rounded-[4px] border p-2.5 transition-colors ${
                      isSelected
                        ? ''
                        : 'border-white/[0.08] bg-[#070B14] hover:border-white/25'
                    } ${!canEdit ? 'opacity-80' : ''}`}
                  >
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => handleTogglePlayer(rp.id)}
                      className={`flex flex-1 items-center gap-2.5 text-left min-w-0 ${
                        canEdit ? 'cursor-pointer' : 'cursor-not-allowed'
                      }`}
                    >
                      <span
                        style={
                          isSelected
                            ? {
                                backgroundColor: theme.primary,
                                borderColor: theme.primary,
                                color: theme.accent,
                              }
                            : undefined
                        }
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] border font-mono text-[10px] font-bold ${
                          isSelected
                            ? ''
                            : 'border-white/20 bg-[#0E1524] text-[#8B95AA]'
                        }`}
                      >
                        {isSelected ? '✓' : '+'}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-sans text-xs font-semibold text-[#E8ECF4]">
                            {p.first_name} {p.last_name}
                          </span>
                          {p.is_overseas && (
                            <span className="shrink-0 rounded-[2px] border border-[#22D3EE]/45 bg-[#0E1524] px-1 py-[1px] font-mono text-[9px] font-bold text-[#22D3EE]">
                              OS
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-[2px] border px-1.5 py-[1px] font-mono text-[9px] uppercase ${
                              skillInfo?.chipClass ?? 'border-white/15 text-[#8B95AA]'
                            }`}
                          >
                            {p.skill}
                          </span>
                          <span className="font-mono text-[10px] text-[#8B95AA]">
                            {p.player_code}
                          </span>
                          <span className="font-mono text-[10px] font-semibold text-[#F5B921] tabular-nums">
                            {formatLakhs(rp.sold_price_lakhs ?? 0)}
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Captain Star Button */}
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => handleSetCaptain(rp.id)}
                      title={isCaptain ? 'Team Captain' : 'Set as Captain'}
                      aria-label={
                        isCaptain
                          ? `${p.first_name} ${p.last_name} is captain`
                          : `Make ${p.first_name} ${p.last_name} captain`
                      }
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
                        isCaptain
                          ? 'border-[#F5B921] bg-[#F5B921] text-[#070B14]'
                          : 'border-white/15 bg-[#0E1524] text-[#8B95AA] hover:border-[#F5B921]/60 hover:text-[#F5B921]'
                      } ${!canEdit ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${isCaptain ? 'fill-current' : ''}`}
                      />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {canEdit && (selectedIds.length > 0 || hasSavedXi) && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] bg-[#070B14]/60 px-4 py-2.5">
              <button
                type="button"
                onClick={handleClearSelection}
                disabled={selectedIds.length === 0}
                className="font-mono text-[11px] uppercase tracking-[0.06em] text-[#8B95AA] hover:text-red-300 disabled:opacity-40"
              >
                Clear XI
              </button>
              {hasSavedXi && hasUnsavedChanges && (
                <button
                  type="button"
                  onClick={handleResetToSaved}
                  className="font-mono text-[11px] uppercase tracking-[0.06em] text-[#22D3EE] hover:underline"
                >
                  Revert to saved
                </button>
              )}
            </div>
          )}
        </Card>

        {/* Right Panel (8 cols ~67%): GroundView + Action Bar + Validation + Save */}
        <div className="space-y-5 xl:col-span-8">
          <Card
            brackets
            bracketTone="gold"
            className="p-4 sm:p-5 space-y-4"
            style={{
              borderColor: `${theme.primary}77`,
              boxShadow: `0 0 24px ${theme.glow}`,
            }}
          >
            {/* Ground Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
                <span className="text-[#8B95AA]">
                  SELECTED:{' '}
                  <strong className="text-[#E8ECF4] tabular-nums">
                    {selectedIds.length}/11
                  </strong>
                </span>
                <span className="text-[#8B95AA]">
                  CAPTAIN:{' '}
                  <strong className="text-[#F5B921]">
                    {captainPlayer
                      ? `${captainPlayer.first_name} ${captainPlayer.last_name}`
                      : 'Not chosen'}
                  </strong>
                </span>
              </div>

              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#8B95AA]">
                Click any player on the field to set captain or remove
              </span>
            </div>

            {/* Ground View */}
            <GroundView
              players={selectedGroundPlayers}
              captainId={captainId}
              accent={theme.primary}
              size="lg"
              onPlayerClick={(id) =>
                setFocusedId((prev) => (prev === id ? null : id))
              }
              selectedId={focusedId}
              showEmptySlots
            />

            {/* Focused Player Action Strip */}
            {focusedRoomPlayer && focusedRoomPlayer.players && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[#22D3EE]/45 bg-[#070B14] px-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#22D3EE]">
                    {focusedRoomPlayer.players.skill} ·{' '}
                    {focusedRoomPlayer.players.player_code}
                    {focusedRoomPlayer.players.is_overseas ? ' · OVERSEAS' : ''}
                  </p>
                  <p className="font-display text-2xl leading-none tracking-wide text-[#E8ECF4]">
                    {focusedRoomPlayer.players.first_name}{' '}
                    {focusedRoomPlayer.players.last_name}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={captainId === focusedRoomPlayer.id ? 'gold' : 'cyan'}
                    size="sm"
                    disabled={!canEdit || captainId === focusedRoomPlayer.id}
                    onClick={() => handleSetCaptain(focusedRoomPlayer.id)}
                  >
                    <Star className="h-3.5 w-3.5" />
                    <span>
                      {captainId === focusedRoomPlayer.id
                        ? 'Captain'
                        : 'Make captain'}
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canEdit}
                    onClick={() => handleTogglePlayer(focusedRoomPlayer.id)}
                    className="border-red-500/45 text-red-300 hover:border-red-400 hover:text-red-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove from XI</span>
                  </Button>
                </div>
              </div>
            )}

            {/* Live Validation Checklist */}
            <div className="border-t border-white/[0.08] pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl tracking-wide text-[#E8ECF4]">
                  PLAYING XI CHECKLIST
                </h3>
                <Badge tone={allChecksPass ? 'cyan' : 'gold'}>
                  {validationRules.filter((r) => r.ok).length}/
                  {validationRules.length} VALID
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {validationRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`flex items-center justify-between gap-2 rounded-[3px] border px-3 py-2 font-mono text-xs ${
                      rule.ok
                        ? 'border-emerald-500/30 bg-emerald-500/5 text-[#E8ECF4]'
                        : 'border-red-500/35 bg-red-500/10 text-red-200'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {rule.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                      )}
                      <span className="truncate">{rule.label}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-[#8B95AA]">
                      {rule.have}/{rule.need}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Save Bar */}
            <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-mono text-xs text-[#8B95AA]">
                {xiLocked ? (
                  <span className="text-red-300">
                    Playing XI submissions are locked by the host.
                  </span>
                ) : savedAt ? (
                  <span>
                    Saved {formatDateTime12h(savedAt)}
                    {hasUnsavedChanges ? ' (unsaved edits pending)' : ''}
                  </span>
                ) : (
                  <span>Draft auto-saved locally until submitted.</span>
                )}
              </div>

              <button
                type="button"
                disabled={!canEdit || !allChecksPass || saving}
                onClick={() => void handleSaveXi()}
                style={
                  canEdit && allChecksPass
                    ? {
                        backgroundColor: theme.primary,
                        color: theme.accent,
                        borderColor: theme.secondary,
                      }
                    : undefined
                }
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[4px] border border-white/15 bg-[#141C2F] px-6 font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#E8ECF4] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE]"
              >
                <Save className="h-4 w-4 shrink-0" />
                <span>
                  {saving
                    ? 'Saving Playing XI...'
                    : xiLocked
                      ? 'Locked by Host'
                      : 'Save Playing XI'}
                </span>
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
