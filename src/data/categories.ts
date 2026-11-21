export type PlayerCategory =
  | 'Marquee'
  | 'Legends'
  | 'Batsman'
  | 'Allrounder'
  | 'Wicketkeeper'
  | 'Bowler'
  | 'Uncapped'
  | 'Additional';

export type PlayerSkill = 'Batter' | 'All-Rounder' | 'Wicketkeeper' | 'Bowler';

export interface PlayerCategoryInfo {
  value: PlayerCategory;
  label: string;
  setNo: number;
  accent: string;
  chipClass: string;
  textClass: string;
  activeTabClass: string;
}

export const PLAYER_CATEGORIES: readonly PlayerCategoryInfo[] = [
  {
    value: 'Marquee',
    label: 'Marquee',
    setNo: 1,
    accent: '#F5B921',
    chipClass: 'border-[#F5B921]/35 bg-[#F5B921]/10 text-[#F5B921]',
    textClass: 'text-[#F5B921]',
    activeTabClass: 'border-[#F5B921] bg-[#F5B921] text-[#070B14]',
  },
  {
    value: 'Legends',
    label: 'Legends',
    setNo: 2,
    accent: '#FB923C',
    chipClass: 'border-orange-400/35 bg-orange-400/10 text-orange-300',
    textClass: 'text-orange-300',
    activeTabClass: 'border-orange-400 bg-orange-400 text-[#070B14]',
  },
  {
    value: 'Batsman',
    label: 'Batsmen',
    setNo: 3,
    accent: '#22D3EE',
    chipClass: 'border-[#22D3EE]/35 bg-[#22D3EE]/10 text-[#22D3EE]',
    textClass: 'text-[#22D3EE]',
    activeTabClass: 'border-[#22D3EE] bg-[#22D3EE] text-[#070B14]',
  },
  {
    value: 'Allrounder',
    label: 'All-Rounders',
    setNo: 4,
    accent: '#34D399',
    chipClass: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300',
    textClass: 'text-emerald-300',
    activeTabClass: 'border-emerald-400 bg-emerald-400 text-[#070B14]',
  },
  {
    value: 'Wicketkeeper',
    label: 'Wicketkeepers',
    setNo: 5,
    accent: '#38BDF8',
    chipClass: 'border-sky-400/35 bg-sky-400/10 text-sky-300',
    textClass: 'text-sky-300',
    activeTabClass: 'border-sky-400 bg-sky-400 text-[#070B14]',
  },
  {
    value: 'Bowler',
    label: 'Bowlers',
    setNo: 6,
    accent: '#FB7185',
    chipClass: 'border-rose-400/35 bg-rose-400/10 text-rose-300',
    textClass: 'text-rose-300',
    activeTabClass: 'border-rose-400 bg-rose-400 text-[#070B14]',
  },
  {
    value: 'Uncapped',
    label: 'Uncapped',
    setNo: 7,
    accent: '#CBD5E1',
    chipClass: 'border-slate-400/35 bg-slate-400/10 text-slate-300',
    textClass: 'text-slate-300',
    activeTabClass: 'border-slate-300 bg-slate-300 text-[#070B14]',
  },
  {
    value: 'Additional',
    label: 'Additional',
    setNo: 8,
    accent: '#8B95AA',
    chipClass: 'border-white/15 bg-[#141C2F] text-[#8B95AA]',
    textClass: 'text-[#8B95AA]',
    activeTabClass: 'border-[#E8ECF4] bg-[#E8ECF4] text-[#070B14]',
  },
] as const;

export const PLAYER_CATEGORY_MAP: Record<PlayerCategory, PlayerCategoryInfo> =
  PLAYER_CATEGORIES.reduce(
    (acc, item) => {
      acc[item.value] = item;
      return acc;
    },
    {} as Record<PlayerCategory, PlayerCategoryInfo>,
  );

export function getCategoryInfo(
  category: string | null | undefined,
): PlayerCategoryInfo | undefined {
  if (!category) return undefined;
  return PLAYER_CATEGORY_MAP[category as PlayerCategory];
}

export interface PlayerSkillInfo {
  value: PlayerSkill;
  pluralLabel: string;
  chipClass: string;
}

export const PLAYER_SKILLS: readonly PlayerSkillInfo[] = [
  {
    value: 'Batter',
    pluralLabel: 'Batters',
    chipClass: 'border-[#22D3EE]/30 bg-[#0E1524] text-[#22D3EE]',
  },
  {
    value: 'All-Rounder',
    pluralLabel: 'All-Rounders',
    chipClass: 'border-emerald-400/30 bg-[#0E1524] text-emerald-300',
  },
  {
    value: 'Wicketkeeper',
    pluralLabel: 'Wicketkeepers',
    chipClass: 'border-sky-400/30 bg-[#0E1524] text-sky-300',
  },
  {
    value: 'Bowler',
    pluralLabel: 'Bowlers',
    chipClass: 'border-rose-400/30 bg-[#0E1524] text-rose-300',
  },
] as const;

export const PLAYER_SKILL_MAP: Record<PlayerSkill, PlayerSkillInfo> =
  PLAYER_SKILLS.reduce(
    (acc, item) => {
      acc[item.value] = item;
      return acc;
    },
    {} as Record<PlayerSkill, PlayerSkillInfo>,
  );

export function getSkillInfo(skill: string | null | undefined): PlayerSkillInfo | undefined {
  if (!skill) return undefined;
  return PLAYER_SKILL_MAP[skill as PlayerSkill];
}
