import type { PlayerCategory, PlayerSkill } from '../data/categories';

export type ProjectorMode = 'auction' | 'squads' | 'leaderboard';

export interface DbRoom {
  id: string;
  host_id: string;
  name: string;
  starting_purse_lakhs: number;
  squad_max: number;
  squad_min: number;
  overseas_max: number;
  bid_timer_seconds: number;
  preview_seconds?: number;
  auction_open: boolean;
  anticheat_enabled?: boolean;
  projector_mode?: ProjectorMode;
  leaderboard_public?: boolean;
  xi_overseas_max?: number;
  xi_locked?: boolean;
  status: string;
  created_at: string;
}

export type TeamStatus = 'open' | 'active' | 'removed';

export interface DbTeam {
  id: string;
  room_id: string;
  short_code: string;
  name: string;
  leader_id: string | null;
  leader_name: string | null;
  status: TeamStatus;
  joined_at: string | null;
}

export interface DbTeamFinance {
  team_id: string;
  room_id: string;
  purse_left_lakhs: number;
  spent_lakhs: number;
}

export interface DbTeamCode {
  id: string;
  room_id: string;
  team_id: string;
  code: string;
  used: boolean;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}

export interface DbTeamMember {
  id: string;
  team_id: string;
  name: string;
  email: string;
  is_leader: boolean;
  created_at: string;
}

export type { PlayerCategory, PlayerSkill };

export interface DbPlayer {
  id: string;
  serial: number;
  player_code: string;
  first_name: string;
  last_name: string;
  category: PlayerCategory;
  skill: PlayerSkill;
  nationality: string;
  is_overseas: boolean;
  ipl_season: string | null;
  ipl_team: string | null;
  matches: number;
  runs: number;
  strike_rate: number;
  economy: number;
  wickets: number;
  base_price_lakhs: number;
  card_image_url: string | null;
}

export type RoomPlayerStatus = 'pending' | 'live' | 'sold' | 'unsold';

export interface DbRoomPlayer {
  id: string;
  room_id: string;
  player_id: string;
  base_price_lakhs: number;
  set_no: number;
  sort_order: number;
  status: RoomPlayerStatus;
  sold_to_team_id: string | null;
  sold_price_lakhs: number | null;
  sold_at: string | null;
}

export interface RoomPlayerWithPlayer {
  id: string;
  base_price_lakhs: number;
  set_no: number;
  sort_order: number;
  status: RoomPlayerStatus;
  sold_to_team_id: string | null;
  sold_price_lakhs: number | null;
  sold_at: string | null;
  players: DbPlayer | null;
}

export type AuctionPhase = 'idle' | 'bidding' | 'sold' | 'unsold' | 'paused';

export interface DbAuctionState {
  room_id: string;
  current_room_player_id: string | null;
  phase: AuctionPhase;
  current_bid_lakhs: number;
  current_bid_team_id: string | null;
  timer_ends_at: string | null;
  bidding_opens_at: string | null;
  bid_seq: number;
  current_set_no: number;
  paused_remaining_ms: number | null;
  updated_at: string;
}

export interface DbBid {
  id: string;
  room_id: string;
  room_player_id: string;
  team_id: string;
  amount_lakhs: number;
  voided: boolean;
  created_at: string;
}

export interface DbViolation {
  id: string;
  room_id: string;
  team_id: string;
  type: string;
  details: string | null;
  created_at: string;
}

export type RejoinRequestStatus = 'pending' | 'approved' | 'rejected';

export interface DbRejoinRequest {
  id: string;
  room_id: string;
  team_id: string;
  requested_by: string;
  status: RejoinRequestStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface DbNotice {
  id: string;
  room_id: string;
  message: string;
  opens_at: string | null;
  created_at: string;
}

export interface DbProfile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  rules_accepted_at: string | null;
  created_at: string;
}

export type ViolationType = 'tab_switch' | 'esc_fullscreen';

export type AllViolationType =
  | 'tab_switch'
  | 'esc_fullscreen'
  | 'multiple_login'
  | 'other';

export interface ViolationTeamRef {
  short_code: string;
  name: string;
}

export interface ViolationWithTeam {
  id: string;
  team_id: string;
  type: AllViolationType | string;
  details: string | null;
  created_at: string;
  teams: ViolationTeamRef | null;
}

export interface DbTeamPresence {
  team_id: string;
  room_id: string;
  last_seen_at: string;
}

export type HeartbeatStatus = 'active' | 'removed' | 'open' | 'none';

export interface MyTeamStatus {
  status: HeartbeatStatus;
  team_id: string | null;
  short_code: string | null;
  name: string | null;
  request_id: string | null;
  request_status: RejoinRequestStatus | null;
  last_violation_type: string | null;
}

export interface ReportViolationResult {
  removed: boolean;
  enforced?: boolean;
}

export interface RejoinWithCodeResult {
  team_id: string;
  room_id: string;
}

export interface LeaderboardRow {
  pos: number;
  team_id: string;
  short_code: string;
  team_name: string;
  score: number;
  squad: number;
}

export interface DbPlayingXi {
  team_id: string;
  room_id: string;
  room_player_ids: string[];
  captain_room_player_id: string | null;
  updated_at: string;
}

export interface RpcSetProgressRow {
  set_no: number;
  total: number;
  remaining: number;
  done: number;
}
