import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type {
  DbAuctionState,
  DbBid,
  DbNotice,
  DbPlayer,
  DbRoom,
  DbTeam,
  DbTeamFinance,
  RoomPlayerStatus,
  RoomPlayerWithPlayer,
} from '../types/database';

export type AuctionConnectionStatus = 'connecting' | 'live' | 'reconnecting';

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

function sortRoomPlayers(list: RoomPlayerWithPlayer[]): RoomPlayerWithPlayer[] {
  return [...list].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return (a.players?.serial ?? 0) - (b.players?.serial ?? 0);
  });
}

const ROOM_PLAYER_SELECT =
  'id, base_price_lakhs, set_no, sort_order, status, sold_to_team_id, sold_price_lakhs, sold_at, players(id, serial, player_code, first_name, last_name, category, skill, nationality, is_overseas, ipl_season, ipl_team, matches, runs, strike_rate, economy, wickets, base_price_lakhs, card_image_url)';

const ROOM_SELECT =
  'id, host_id, name, starting_purse_lakhs, squad_max, squad_min, overseas_max, bid_timer_seconds, auction_open, status, created_at';

const AUCTION_STATE_SELECT =
  'room_id, current_room_player_id, phase, current_bid_lakhs, current_bid_team_id, timer_ends_at, bid_seq, current_set_no, paused_remaining_ms, updated_at';

export interface UseAuctionResult {
  room: DbRoom | null;
  state: DbAuctionState | null;
  lot: RoomPlayerWithPlayer | null;
  teams: DbTeam[];
  finance: DbTeamFinance[];
  lotBids: DbBid[];
  soldLog: RoomPlayerWithPlayer[];
  queue: RoomPlayerWithPlayer[];
  roomPlayers: RoomPlayerWithPlayer[];
  notices: DbNotice[];
  latestNotice: DbNotice | null;
  connectionStatus: AuctionConnectionStatus;
  offsetMs: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAuction(roomId: string | undefined): UseAuctionResult {
  const [room, setRoom] = useState<DbRoom | null>(null);
  const [state, setState] = useState<DbAuctionState | null>(null);
  const [teams, setTeams] = useState<DbTeam[]>([]);
  const [finance, setFinance] = useState<DbTeamFinance[]>([]);
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayerWithPlayer[]>([]);
  const [bids, setBids] = useState<DbBid[]>([]);
  const [notices, setNotices] = useState<DbNotice[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<AuctionConnectionStatus>('connecting');
  const [offsetMs, setOffsetMs] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef<boolean>(true);
  const requestSeqRef = useRef<number>(0);
  const currentLotIdRef = useRef<string | null>(null);
  const initialFetchCompletedRef = useRef<boolean>(false);
  const lastFocusRefetchRef = useRef<number>(0);

  const syncServerClock = useCallback(async () => {
    if (!supabase) return;
    try {
      const t0 = Date.now();
      const { data, error: rpcErr } = await supabase.rpc('get_server_time');
      const t1 = Date.now();
      if (!mountedRef.current || rpcErr || !data) return;

      const serverMs = Date.parse(String(data));
      if (!Number.isNaN(serverMs)) {
        const midpoint = (t0 + t1) / 2;
        setOffsetMs(serverMs - midpoint);
      }
    } catch {
      // Keep existing offset if transient network failure occurs
    }
  }, []);

  const fetchBidsForLot = useCallback(
    async (lotId: string | null) => {
      if (!supabase || !roomId) return;
      if (!lotId) {
        if (mountedRef.current) setBids([]);
        return;
      }

      const { data, error: bidsErr } = await supabase
        .from('bids')
        .select(
          'id, room_id, room_player_id, team_id, amount_lakhs, voided, created_at',
        )
        .eq('room_id', roomId)
        .eq('room_player_id', lotId)
        .eq('voided', false)
        .order('created_at', { ascending: false });

      if (!mountedRef.current) return;
      if (!bidsErr && data) {
        setBids(data as DbBid[]);
      }
    },
    [roomId],
  );

  const fetchRoomOnly = useCallback(async () => {
    if (!supabase || !roomId) return;
    const { data, error: roomErr } = await supabase
      .from('rooms')
      .select(ROOM_SELECT)
      .eq('id', roomId)
      .maybeSingle();
    if (!mountedRef.current) return;
    if (!roomErr && data) {
      setRoom(data as DbRoom);
    }
  }, [roomId]);

  const fetchAuctionStateOnly = useCallback(async () => {
    if (!supabase || !roomId) return;
    const { data, error: stateErr } = await supabase
      .from('auction_state')
      .select(AUCTION_STATE_SELECT)
      .eq('room_id', roomId)
      .maybeSingle();

    if (!mountedRef.current || stateErr) return;

    const nextState = (data as DbAuctionState | null) ?? null;
    const nextLotId = nextState?.current_room_player_id ?? null;
    const lotChanged = nextLotId !== currentLotIdRef.current;

    currentLotIdRef.current = nextLotId;
    setState(nextState);

    if (lotChanged) {
      await fetchBidsForLot(nextLotId);
    }
  }, [roomId, fetchBidsForLot]);

  const fetchTeamsOnly = useCallback(async () => {
    if (!supabase || !roomId) return;
    const { data, error: teamsErr } = await supabase
      .from('teams')
      .select(
        'id, room_id, short_code, name, leader_id, leader_name, status, joined_at',
      )
      .eq('room_id', roomId)
      .order('short_code', { ascending: true });
    if (!mountedRef.current) return;
    if (!teamsErr && data) {
      setTeams(data as DbTeam[]);
    }
  }, [roomId]);

  const fetchFinanceOnly = useCallback(async () => {
    if (!supabase || !roomId) return;
    const { data, error: finErr } = await supabase
      .from('team_finance')
      .select('team_id, room_id, purse_left_lakhs, spent_lakhs')
      .eq('room_id', roomId);
    if (!mountedRef.current) return;
    if (!finErr && data) {
      setFinance(data as DbTeamFinance[]);
    }
  }, [roomId]);

  const fetchRoomPlayersOnly = useCallback(async () => {
    if (!supabase || !roomId) return;
    const { data, error: playersErr } = await supabase
      .from('room_players')
      .select(ROOM_PLAYER_SELECT)
      .eq('room_id', roomId)
      .order('sort_order', { ascending: true })
      .range(0, 999);
    if (!mountedRef.current) return;
    if (!playersErr && data) {
      const normalized = sortRoomPlayers(
        (data as RawRoomPlayerRow[]).map(normalizeRoomPlayer),
      );
      setRoomPlayers(normalized);
    }
  }, [roomId]);

  const fetchNoticesOnly = useCallback(async () => {
    if (!supabase || !roomId) return;
    const { data, error: noticesErr } = await supabase
      .from('notices')
      .select('id, room_id, message, opens_at, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });
    if (!mountedRef.current) return;
    if (!noticesErr && data) {
      setNotices(data as DbNotice[]);
    }
  }, [roomId]);

  const fetchAll = useCallback(
    async (silent = false) => {
      if (!roomId) {
        if (mountedRef.current) {
          setLoading(false);
          setError('Missing room identifier.');
        }
        return;
      }

      if (!supabase) {
        if (mountedRef.current) {
          setLoading(false);
          setError('Supabase client is not configured.');
        }
        return;
      }

      const seq = ++requestSeqRef.current;

      if (!silent && mountedRef.current) {
        setLoading(true);
        setError(null);
      }

      try {
        const [roomRes, stateRes, teamsRes, financeRes, playersRes, noticesRes] =
          await Promise.all([
            supabase
              .from('rooms')
              .select(ROOM_SELECT)
              .eq('id', roomId)
              .maybeSingle(),
            supabase
              .from('auction_state')
              .select(AUCTION_STATE_SELECT)
              .eq('room_id', roomId)
              .maybeSingle(),
            supabase
              .from('teams')
              .select(
                'id, room_id, short_code, name, leader_id, leader_name, status, joined_at',
              )
              .eq('room_id', roomId)
              .order('short_code', { ascending: true }),
            supabase
              .from('team_finance')
              .select('team_id, room_id, purse_left_lakhs, spent_lakhs')
              .eq('room_id', roomId),
            supabase
              .from('room_players')
              .select(ROOM_PLAYER_SELECT)
              .eq('room_id', roomId)
              .order('sort_order', { ascending: true })
              .range(0, 999),
            supabase
              .from('notices')
              .select('id, room_id, message, opens_at, created_at')
              .eq('room_id', roomId)
              .order('created_at', { ascending: false }),
          ]);

        if (!mountedRef.current || seq !== requestSeqRef.current) return;

        if (roomRes.error) throw new Error(roomRes.error.message);
        if (!roomRes.data) throw new Error('Auction room not found.');
        if (stateRes.error) throw new Error(stateRes.error.message);
        if (teamsRes.error) throw new Error(teamsRes.error.message);
        if (financeRes.error) throw new Error(financeRes.error.message);
        if (playersRes.error) throw new Error(playersRes.error.message);

        const nextState = (stateRes.data as DbAuctionState | null) ?? null;
        const nextLotId = nextState?.current_room_player_id ?? null;
        currentLotIdRef.current = nextLotId;

        let nextBids: DbBid[] = [];
        if (nextLotId) {
          const bidsRes = await supabase
            .from('bids')
            .select(
              'id, room_id, room_player_id, team_id, amount_lakhs, voided, created_at',
            )
            .eq('room_id', roomId)
            .eq('room_player_id', nextLotId)
            .eq('voided', false)
            .order('created_at', { ascending: false });

          if (!mountedRef.current || seq !== requestSeqRef.current) return;
          if (bidsRes.error) throw new Error(bidsRes.error.message);
          nextBids = (bidsRes.data as DbBid[]) ?? [];
        }

        const normalizedPlayers = sortRoomPlayers(
          ((playersRes.data as RawRoomPlayerRow[]) ?? []).map(
            normalizeRoomPlayer,
          ),
        );

        setRoom(roomRes.data as DbRoom);
        setState(nextState);
        setTeams((teamsRes.data as DbTeam[]) ?? []);
        setFinance((financeRes.data as DbTeamFinance[]) ?? []);
        setRoomPlayers(normalizedPlayers);
        setBids(nextBids);
        if (!noticesRes.error && noticesRes.data) {
          setNotices(noticesRes.data as DbNotice[]);
        }
        setError(null);
        initialFetchCompletedRef.current = true;
      } catch (err) {
        if (!mountedRef.current || seq !== requestSeqRef.current) return;
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to load auction room state.';
        if (!silent) {
          setError(message);
        }
      } finally {
        if (mountedRef.current && seq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [roomId],
  );

  const refetch = useCallback(async () => {
    await Promise.all([fetchAll(true), syncServerClock()]);
  }, [fetchAll, syncServerClock]);

  useEffect(() => {
    mountedRef.current = true;
    initialFetchCompletedRef.current = false;
    currentLotIdRef.current = null;

    if (!roomId) {
      setLoading(false);
      setError('Missing room identifier.');
      return;
    }

    void fetchAll(false);
    void syncServerClock();

    if (!supabase) return;
    const client = supabase;

    const channel = client
      .channel(`auction-room-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auction_state',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void fetchAuctionStateOnly();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bids',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void fetchBidsForLot(currentLotIdRef.current);
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
          void fetchRoomPlayersOnly();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_finance',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void fetchFinanceOnly();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teams',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void fetchTeamsOnly();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        () => {
          void fetchRoomOnly();
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
        () => {
          void fetchNoticesOnly();
        },
      )
      .subscribe((status) => {
        if (!mountedRef.current) return;
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('live');
          if (initialFetchCompletedRef.current) {
            void fetchAll(true);
          }
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          setConnectionStatus('reconnecting');
        }
      });

    const handleTabResume = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastFocusRefetchRef.current < 1500) return;
      lastFocusRefetchRef.current = now;
      void refetch();
    };

    window.addEventListener('focus', handleTabResume);
    document.addEventListener('visibilitychange', handleTabResume);

    const safetyIntervalId = window.setInterval(() => {
      void fetchAll(true);
    }, 10_000);

    const clockIntervalId = window.setInterval(() => {
      void syncServerClock();
    }, 60_000);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('focus', handleTabResume);
      document.removeEventListener('visibilitychange', handleTabResume);
      window.clearInterval(safetyIntervalId);
      window.clearInterval(clockIntervalId);
      void client.removeChannel(channel);
    };
  }, [
    roomId,
    fetchAll,
    syncServerClock,
    refetch,
    fetchAuctionStateOnly,
    fetchBidsForLot,
    fetchRoomPlayersOnly,
    fetchFinanceOnly,
    fetchTeamsOnly,
    fetchRoomOnly,
    fetchNoticesOnly,
  ]);

  const lot = useMemo(() => {
    const lotId = state?.current_room_player_id;
    if (!lotId) return null;
    return roomPlayers.find((rp) => rp.id === lotId) ?? null;
  }, [roomPlayers, state?.current_room_player_id]);

  const lotBids = useMemo(() => {
    const lotId = state?.current_room_player_id;
    if (!lotId) return [];
    return bids
      .filter((b) => b.room_player_id === lotId && !b.voided)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
  }, [bids, state?.current_room_player_id]);

  const soldLog = useMemo(() => {
    return roomPlayers
      .filter((rp) => rp.status === 'sold')
      .sort((a, b) => {
        const aTime = a.sold_at ? Date.parse(a.sold_at) : 0;
        const bTime = b.sold_at ? Date.parse(b.sold_at) : 0;
        if (bTime !== aTime) return bTime - aTime;
        return b.sort_order - a.sort_order;
      });
  }, [roomPlayers]);

  const queue = useMemo(() => {
    const setNo = state?.current_set_no ?? 1;
    return roomPlayers
      .filter((rp) => rp.set_no === setNo && rp.status === 'pending')
      .slice(0, 6);
  }, [roomPlayers, state?.current_set_no]);

  const latestNotice = useMemo(() => notices[0] ?? null, [notices]);

  return {
    room,
    state,
    lot,
    teams,
    finance,
    lotBids,
    soldLog,
    queue,
    roomPlayers,
    notices,
    latestNotice,
    connectionStatus,
    offsetMs,
    loading,
    error,
    refetch,
  };
}
