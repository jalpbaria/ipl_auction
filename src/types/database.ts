export interface DbRoom {
  id: string;
  host_id: string;
  name: string;
  starting_purse_lakhs: number;
  squad_max: number;
  squad_min: number;
  overseas_max: number;
  bid_timer_seconds: number;
  auction_open: boolean;
  status: string;
  created_at: string;
}

export interface DbTeam {
  id: string;
  room_id: string;
  short_code: string;
  name: string;
  leader_id: string | null;
  leader_name: string | null;
  status: string;
  joined_at: string | null;
}

export interface DbTeamFinance {
  team_id: string;
  room_id: string;
  purse_left_lakhs: number;
  spent_lakhs: number;
}

export interface DbProfile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  rules_accepted_at: string | null;
  created_at: string;
}

export interface DbRejoinRequest {
  id: string;
  room_id: string;
  team_id: string;
  requested_by: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}
