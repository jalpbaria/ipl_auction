import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type {
  AuctionPhase,
  DbNotice,
  DbPlayer,
  DbRejoinRequest,
  DbRoom,
  DbTeam,
  DbTeamCode,
  DbTeamFinance,
  DbTeamMember,
  RoomPlayerStatus,
  RoomPlayerWithPlayer,
} from '../types/database';

interface RawRoomPlayerRow {
  id: string;
  base_price_lakhs: number;
  set_no: number;
  sort_order: number;
  status: RoomPlayerStatus;
  sold_to_team_id: string | null;
  sold_price_lakhs: number | null;
  sold_at: string | null;
  players: DbPlayer | DbPlayer[] | null;
}

function normalizeRoomPlayer(row: RawRoomPlayerRow): RoomPlayerWithPlayer {
  const player = Array.isArray(row.players) ? (row.players[0] ?? null) : row.players;
  return {
    id: row.id,
    base_price_lakhs: row.base_price_lakhs,
    set_no: row.set_no,
    sort_order: row.sort_order ?? 0,
    status: row.status,
    sold_to_team_id: row.sold_to_team_id,
    sold_price_lakhs: row.sold_price_lakhs,
    sold_at: row.sold_at ?? null,
    players: player,
  };
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const next = list.slice();
  next[idx] = item;
  return next;
}

export interface RecentCodeEntry {
  code: string;
  expiresAt: number;
}

interface HostRoomState {
  roomId: string | null;
  room: DbRoom | null;
  teams: DbTeam[];
  teamFinances: DbTeamFinance[];
  teamCodes: DbTeamCode[];
  teamMembers: DbTeamMember[];
  rejoinRequests: DbRejoinRequest[];
  roomPlayers: RoomPlayerWithPlayer[];
  notices: DbNotice[];
  auctionPhase: AuctionPhase | null;
  recentPlainCodes: Record<string, RecentCodeEntry>;
  loading: boolean;
  error: string | null;

  loadHostRoom: (roomId: string, currentUserId: string) => Promise<void>;
  subscribeRealtime: (
    roomId: string,
    onNewRejoinRequest: (teamName: string) => void,
  ) => () => void;
  setRecentPlainCode: (teamId: string, code: string) => void;
  refreshRoom: () => Promise<void>;
  refreshTeamsAndFinances: () => Promise<void>;
  refreshTeamCodes: () => Promise<void>;
  refreshTeamMembers: (teamIds?: string[]) => Promise<void>;
  refreshRejoinRequests: () => Promise<void>;
  refreshRoomPlayers: () => Promise<void>;
  refreshNotices: () => Promise<void>;
  reset: () => void;
}

const codeTimers = new Map<string, number>();

export const useHostRoom = create<HostRoomState>((set, get) => ({
  roomId: null,
  room: null,
  teams: [],
  teamFinances: [],
  teamCodes: [],
  teamMembers: [],
  rejoinRequests: [],
  roomPlayers: [],
  notices: [],
  auctionPhase: null,
  recentPlainCodes: {},
  loading: true,
  error: null,

  setRecentPlainCode: (teamId: string, code: string) => {
    const prevTimer = codeTimers.get(teamId);
    if (prevTimer !== undefined) {
      window.clearTimeout(prevTimer);
    }

    const expiresAt = Date.now() + 20_000;
    set((state) => ({
      recentPlainCodes: {
        ...state.recentPlainCodes,
        [teamId]: { code, expiresAt },
      },
    }));

    const timerId = window.setTimeout(() => {
      codeTimers.delete(teamId);
      set((state) => {
        const current = state.recentPlainCodes[teamId];
        if (!current || current.expiresAt > Date.now() + 50) {
          return state;
        }
        const next = { ...state.recentPlainCodes };
        delete next[teamId];
        return { recentPlainCodes: next };
      });
    }, 20_000);

    codeTimers.set(teamId, timerId);
  },

  loadHostRoom: async (roomId: string, currentUserId: string) => {
    if (!supabase) {
      set({
        roomId,
        loading: false,
        error: 'Supabase client is not configured.',
      });
      return;
    }

    set({ roomId, loading: true, error: null });

    try {
      const { data: roomData, error: roomErr } = await supabase
        .from('rooms')
        .select(
          'id, host_id, name, starting_purse_lakhs, squad_max, squad_min, overseas_max, bid_timer_seconds, auction_open, status, created_at',
        )
        .eq('id', roomId)
        .maybeSingle();

      if (roomErr) {
        throw new Error(roomErr.message || 'Unable to load room.');
      }

      if (!roomData) {
        throw new Error('Auction room not found.');
      }

      const typedRoom = roomData as DbRoom;
      if (typedRoom.host_id !== currentUserId) {
        throw new Error('Access denied: only the room host can open the command console.');
      }

      const [
        teamsRes,
        financeRes,
        codesRes,
        rejoinRes,
        playersRes,
        noticesRes,
        auctionStateRes,
      ] = await Promise.all([
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
          .from('team_codes')
          .select('id, room_id, team_id, code, used, used_by, used_at, created_at')
          .eq('room_id', roomId)
          .order('created_at', { ascending: false }),
        supabase
          .from('rejoin_requests')
          .select(
            'id, room_id, team_id, requested_by, status, created_at, resolved_at',
          )
          .eq('room_id', roomId)
          .order('created_at', { ascending: false }),
        supabase
          .from('room_players')
          .select(
            'id, base_price_lakhs, set_no, sort_order, status, sold_to_team_id, sold_price_lakhs, sold_at, players(id, serial, player_code, first_name, last_name, category, skill, nationality, is_overseas, ipl_season, ipl_team, matches, runs, strike_rate, economy, wickets, base_price_lakhs, card_image_url)',
          )
          .eq('room_id', roomId)
          .range(0, 999),
        supabase
          .from('notices')
          .select('id, room_id, message, opens_at, created_at')
          .eq('room_id', roomId)
          .order('created_at', { ascending: false }),
        supabase
          .from('auction_state')
          .select('phase')
          .eq('room_id', roomId)
          .maybeSingle(),
      ]);

      if (teamsRes.error) throw new Error(teamsRes.error.message);
      if (financeRes.error) throw new Error(financeRes.error.message);
      if (codesRes.error) throw new Error(codesRes.error.message);
      if (rejoinRes.error) throw new Error(rejoinRes.error.message);
      if (playersRes.error) throw new Error(playersRes.error.message);
      if (noticesRes.error) throw new Error(noticesRes.error.message);

      const loadedTeams = (teamsRes.data as DbTeam[]) ?? [];
      const teamIds = loadedTeams.map((t) => t.id);

      let loadedMembers: DbTeamMember[] = [];
      if (teamIds.length > 0) {
        const membersRes = await supabase
          .from('team_members')
          .select('id, team_id, name, email, is_leader, created_at')
          .in('team_id', teamIds);

        if (!membersRes.error && membersRes.data) {
          loadedMembers = membersRes.data as DbTeamMember[];
        }
      }

      const rawPlayers = (playersRes.data as RawRoomPlayerRow[]) ?? [];
      const normalizedPlayers = rawPlayers
        .map(normalizeRoomPlayer)
        .sort((a, b) => (a.players?.serial ?? 0) - (b.players?.serial ?? 0));

      const phaseRow = auctionStateRes.data as { phase?: AuctionPhase } | null;

      set({
        room: typedRoom,
        teams: loadedTeams,
        teamFinances: (financeRes.data as DbTeamFinance[]) ?? [],
        teamCodes: (codesRes.data as DbTeamCode[]) ?? [],
        teamMembers: loadedMembers,
        rejoinRequests: (rejoinRes.data as DbRejoinRequest[]) ?? [],
        roomPlayers: normalizedPlayers,
        notices: (noticesRes.data as DbNotice[]) ?? [],
        auctionPhase: phaseRow?.phase ?? null,
        loading: false,
        error: null,
      });
    } catch (err) {
      set({
        loading: false,
        error:
          err instanceof Error ? err.message : 'Unable to load host command console.',
      });
    }
  },

  subscribeRealtime: (roomId: string, onNewRejoinRequest) => {
    if (!supabase) return () => {};

    const client = supabase;
    const channel = client
      .channel(`host-room-${roomId}`)
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
            set({ room: payload.new as DbRoom });
          }
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
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new as DbTeam;
            set((state) => ({ teams: upsertById(state.teams, row) }));
            void get().refreshTeamMembers();
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const oldId = (payload.old as { id: string }).id;
            set((state) => ({
              teams: state.teams.filter((t) => t.id !== oldId),
            }));
          }
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
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new as DbTeamFinance;
            set((state) => {
              const idx = state.teamFinances.findIndex((f) => f.team_id === row.team_id);
              if (idx === -1) return { teamFinances: [...state.teamFinances, row] };
              const next = state.teamFinances.slice();
              next[idx] = row;
              return { teamFinances: next };
            });
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const oldTeamId = (payload.old as { team_id: string }).team_id;
            set((state) => ({
              teamFinances: state.teamFinances.filter((f) => f.team_id !== oldTeamId),
            }));
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_codes',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new as DbTeamCode;
            set((state) => ({
              teamCodes: upsertById(state.teamCodes, row).sort(
                (a, b) =>
                  new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
              ),
            }));
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const oldId = (payload.old as { id: string }).id;
            set((state) => ({
              teamCodes: state.teamCodes.filter((c) => c.id !== oldId),
            }));
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rejoin_requests',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            const row = payload.new as DbRejoinRequest;
            const existed = get().rejoinRequests.some((r) => r.id === row.id);
            set((state) => ({
              rejoinRequests: upsertById(state.rejoinRequests, row).sort(
                (a, b) =>
                  new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
              ),
            }));
            if (!existed && row.status === 'pending') {
              const team = get().teams.find((t) => t.id === row.team_id);
              onNewRejoinRequest(team?.name || team?.short_code || 'A team');
            }
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const row = payload.new as DbRejoinRequest;
            set((state) => ({
              rejoinRequests: upsertById(state.rejoinRequests, row),
            }));
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const oldId = (payload.old as { id: string }).id;
            set((state) => ({
              rejoinRequests: state.rejoinRequests.filter((r) => r.id !== oldId),
            }));
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
        (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new) {
            const updated = payload.new as {
              id: string;
              base_price_lakhs: number;
              set_no: number;
              sort_order: number;
              status: RoomPlayerStatus;
              sold_to_team_id: string | null;
              sold_price_lakhs: number | null;
              sold_at: string | null;
            };
            set((state) => ({
              roomPlayers: state.roomPlayers.map((rp) =>
                rp.id === updated.id
                  ? {
                      ...rp,
                      base_price_lakhs: updated.base_price_lakhs,
                      set_no: updated.set_no,
                      sort_order: updated.sort_order ?? rp.sort_order,
                      status: updated.status,
                      sold_to_team_id: updated.sold_to_team_id,
                      sold_price_lakhs: updated.sold_price_lakhs,
                      sold_at: updated.sold_at ?? rp.sold_at,
                    }
                  : rp,
              ),
            }));
          } else if (payload.eventType === 'INSERT') {
            void get().refreshRoomPlayers();
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const oldId = (payload.old as { id: string }).id;
            set((state) => ({
              roomPlayers: state.roomPlayers.filter((rp) => rp.id !== oldId),
            }));
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
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new as DbNotice;
            set((state) => ({
              notices: upsertById(state.notices, row).sort(
                (a, b) =>
                  new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
              ),
            }));
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const oldId = (payload.old as { id: string }).id;
            set((state) => ({
              notices: state.notices.filter((n) => n.id !== oldId),
            }));
          }
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
            const row = payload.new as { phase?: AuctionPhase };
            if (row.phase) {
              set({ auctionPhase: row.phase });
            }
          }
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  },

  refreshRoom: async () => {
    const { roomId } = get();
    if (!supabase || !roomId) return;
    const { data, error } = await supabase
      .from('rooms')
      .select(
        'id, host_id, name, starting_purse_lakhs, squad_max, squad_min, overseas_max, bid_timer_seconds, auction_open, status, created_at',
      )
      .eq('id', roomId)
      .maybeSingle();
    if (!error && data) {
      set({ room: data as DbRoom });
    }
  },

  refreshTeamsAndFinances: async () => {
    const { roomId } = get();
    if (!supabase || !roomId) return;
    const [teamsRes, financeRes] = await Promise.all([
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
    ]);

    if (!teamsRes.error && teamsRes.data) {
      set({ teams: teamsRes.data as DbTeam[] });
    }
    if (!financeRes.error && financeRes.data) {
      set({ teamFinances: financeRes.data as DbTeamFinance[] });
    }
  },

  refreshTeamCodes: async () => {
    const { roomId } = get();
    if (!supabase || !roomId) return;
    const { data, error } = await supabase
      .from('team_codes')
      .select('id, room_id, team_id, code, used, used_by, used_at, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });
    if (!error && data) {
      set({ teamCodes: data as DbTeamCode[] });
    }
  },

  refreshTeamMembers: async (teamIdsArg?: string[]) => {
    const teamIds = teamIdsArg ?? get().teams.map((t) => t.id);
    if (!supabase || teamIds.length === 0) return;
    const { data, error } = await supabase
      .from('team_members')
      .select('id, team_id, name, email, is_leader, created_at')
      .in('team_id', teamIds);
    if (!error && data) {
      set({ teamMembers: data as DbTeamMember[] });
    }
  },

  refreshRejoinRequests: async () => {
    const { roomId } = get();
    if (!supabase || !roomId) return;
    const { data, error } = await supabase
      .from('rejoin_requests')
      .select('id, room_id, team_id, requested_by, status, created_at, resolved_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });
    if (!error && data) {
      set({ rejoinRequests: data as DbRejoinRequest[] });
    }
  },

  refreshRoomPlayers: async () => {
    const { roomId } = get();
    if (!supabase || !roomId) return;
    const { data, error } = await supabase
      .from('room_players')
      .select(
        'id, base_price_lakhs, set_no, sort_order, status, sold_to_team_id, sold_price_lakhs, sold_at, players(id, serial, player_code, first_name, last_name, category, skill, nationality, is_overseas, ipl_season, ipl_team, matches, runs, strike_rate, economy, wickets, base_price_lakhs, card_image_url)',
      )
      .eq('room_id', roomId)
      .range(0, 999);
    if (!error && data) {
      const normalized = (data as RawRoomPlayerRow[])
        .map(normalizeRoomPlayer)
        .sort((a, b) => (a.players?.serial ?? 0) - (b.players?.serial ?? 0));
      set({ roomPlayers: normalized });
    }
  },

  refreshNotices: async () => {
    const { roomId } = get();
    if (!supabase || !roomId) return;
    const { data, error } = await supabase
      .from('notices')
      .select('id, room_id, message, opens_at, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });
    if (!error && data) {
      set({ notices: data as DbNotice[] });
    }
  },

  reset: () => {
    codeTimers.forEach((timerId) => window.clearTimeout(timerId));
    codeTimers.clear();
    set({
      roomId: null,
      room: null,
      teams: [],
      teamFinances: [],
      teamCodes: [],
      teamMembers: [],
      rejoinRequests: [],
      roomPlayers: [],
      notices: [],
      auctionPhase: null,
      recentPlainCodes: {},
      loading: true,
      error: null,
    });
  },
}));
