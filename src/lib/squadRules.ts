import type { PlayerSkill } from '../data/categories';
import type { DbRoom, RoomPlayerWithPlayer } from '../types/database';

export const MIN_ROLES: Record<PlayerSkill, number> = {
  Wicketkeeper: 1,
  Batter: 3,
  'All-Rounder': 1,
  Bowler: 3,
};

export interface SquadPlayerLike {
  skill?: PlayerSkill | string | null;
  is_overseas?: boolean | null;
  players?: {
    skill?: PlayerSkill | string | null;
    is_overseas?: boolean | null;
  } | null;
}

export interface SquadCheckRule {
  label: string;
  ok: boolean;
  have: number;
  need: number;
}

export type RoleCounts = Record<PlayerSkill, number>;

function extractSkill(entry: SquadPlayerLike): string | null | undefined {
  return entry.players ? entry.players.skill : entry.skill;
}

function extractOverseas(entry: SquadPlayerLike): boolean {
  if (entry.players) {
    return Boolean(entry.players.is_overseas);
  }
  return Boolean(entry.is_overseas);
}

export function roleCounts(players: readonly SquadPlayerLike[]): RoleCounts {
  const counts: RoleCounts = {
    Wicketkeeper: 0,
    Batter: 0,
    'All-Rounder': 0,
    Bowler: 0,
  };

  for (const player of players) {
    const skill = extractSkill(player);
    if (
      skill === 'Wicketkeeper' ||
      skill === 'Batter' ||
      skill === 'All-Rounder' ||
      skill === 'Bowler'
    ) {
      counts[skill] += 1;
    }
  }

  return counts;
}

export function overseasCount(players: readonly SquadPlayerLike[]): number {
  let count = 0;
  for (const player of players) {
    if (extractOverseas(player)) {
      count += 1;
    }
  }
  return count;
}

export type SquadRuleRoomLimits = Pick<
  DbRoom,
  'squad_min' | 'squad_max' | 'overseas_max'
>;

export function squadChecks(
  players: readonly SquadPlayerLike[],
  room: SquadRuleRoomLimits,
): SquadCheckRule[] {
  const total = players.length;
  const overseas = overseasCount(players);
  const roles = roleCounts(players);

  return [
    {
      label: `Min squad size (${room.squad_min})`,
      ok: total >= room.squad_min,
      have: total,
      need: room.squad_min,
    },
    {
      label: `Max squad size (${room.squad_max})`,
      ok: total <= room.squad_max,
      have: total,
      need: room.squad_max,
    },
    {
      label: `Max overseas (${room.overseas_max})`,
      ok: overseas <= room.overseas_max,
      have: overseas,
      need: room.overseas_max,
    },
    {
      label: `Wicketkeepers (min ${MIN_ROLES.Wicketkeeper})`,
      ok: roles.Wicketkeeper >= MIN_ROLES.Wicketkeeper,
      have: roles.Wicketkeeper,
      need: MIN_ROLES.Wicketkeeper,
    },
    {
      label: `Batters (min ${MIN_ROLES.Batter})`,
      ok: roles.Batter >= MIN_ROLES.Batter,
      have: roles.Batter,
      need: MIN_ROLES.Batter,
    },
    {
      label: `All-Rounders (min ${MIN_ROLES['All-Rounder']})`,
      ok: roles['All-Rounder'] >= MIN_ROLES['All-Rounder'],
      have: roles['All-Rounder'],
      need: MIN_ROLES['All-Rounder'],
    },
    {
      label: `Bowlers (min ${MIN_ROLES.Bowler})`,
      ok: roles.Bowler >= MIN_ROLES.Bowler,
      have: roles.Bowler,
      need: MIN_ROLES.Bowler,
    },
  ];
}

export function isSquadValid(
  players: readonly SquadPlayerLike[],
  room: SquadRuleRoomLimits,
): boolean {
  return squadChecks(players, room).every((rule) => rule.ok);
}

export function toSquadPlayers(
  roomPlayers: readonly RoomPlayerWithPlayer[],
  teamId: string,
): RoomPlayerWithPlayer[] {
  return roomPlayers.filter(
    (rp) => rp.status === 'sold' && rp.sold_to_team_id === teamId,
  );
}
