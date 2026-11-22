export type TeamPatternId =
  | 'csk-stripes'
  | 'mi-waves'
  | 'rcb-chevrons'
  | 'kkr-checker'
  | 'dc-racing'
  | 'pbks-zigzag'
  | 'rr-arcs'
  | 'srh-sunburst'
  | 'gt-hexgrid'
  | 'lsg-split';

export interface TeamTheme {
  primary: string;
  secondary: string;
  accent: string;
  highlight: string;
  surfaceTint: string;
  glow: string;
  patternId: TeamPatternId;
}

export interface IplTeam {
  code: string;
  name: string;
  primary: string;
  secondary: string;
  theme: TeamTheme;
}

export const DEFAULT_TEAM_THEME: TeamTheme = {
  primary: '#22D3EE',
  secondary: '#F5B921',
  accent: '#070B14',
  highlight: '#22D3EE',
  surfaceTint: 'rgba(34, 211, 238, 0.08)',
  glow: 'rgba(34, 211, 238, 0.22)',
  patternId: 'gt-hexgrid',
};

export const IPL_TEAMS: IplTeam[] = [
  {
    code: 'CSK',
    name: 'Chennai Super Kings',
    primary: '#F9CD05',
    secondary: '#1D4ED8',
    theme: {
      primary: '#F9CD05',
      secondary: '#1D4ED8',
      accent: '#070B14',
      highlight: '#F9CD05',
      surfaceTint: 'rgba(249, 205, 5, 0.08)',
      glow: 'rgba(249, 205, 5, 0.24)',
      patternId: 'csk-stripes',
    },
  },
  {
    code: 'MI',
    name: 'Mumbai Indians',
    primary: '#004BA0',
    secondary: '#D1AB3E',
    theme: {
      primary: '#004BA0',
      secondary: '#D1AB3E',
      accent: '#FFFFFF',
      highlight: '#60A5FA',
      surfaceTint: 'rgba(0, 75, 160, 0.16)',
      glow: 'rgba(59, 130, 246, 0.28)',
      patternId: 'mi-waves',
    },
  },
  {
    code: 'RCB',
    name: 'Royal Challengers Bengaluru',
    primary: '#EC1C24',
    secondary: '#1F1F1F',
    theme: {
      primary: '#EC1C24',
      secondary: '#1F1F1F',
      accent: '#FFFFFF',
      highlight: '#F87171',
      surfaceTint: 'rgba(236, 28, 36, 0.12)',
      glow: 'rgba(236, 28, 36, 0.28)',
      patternId: 'rcb-chevrons',
    },
  },
  {
    code: 'KKR',
    name: 'Kolkata Knight Riders',
    primary: '#4B2878',
    secondary: '#D4AF37',
    theme: {
      primary: '#4B2878',
      secondary: '#D4AF37',
      accent: '#FFFFFF',
      highlight: '#E2C044',
      surfaceTint: 'rgba(75, 40, 120, 0.18)',
      glow: 'rgba(212, 175, 55, 0.24)',
      patternId: 'kkr-checker',
    },
  },
  {
    code: 'SRH',
    name: 'Sunrisers Hyderabad',
    primary: '#F26522',
    secondary: '#111827',
    theme: {
      primary: '#F26522',
      secondary: '#111827',
      accent: '#070B14',
      highlight: '#FB923C',
      surfaceTint: 'rgba(242, 101, 34, 0.12)',
      glow: 'rgba(242, 101, 34, 0.28)',
      patternId: 'srh-sunburst',
    },
  },
  {
    code: 'RR',
    name: 'Rajasthan Royals',
    primary: '#EA1A85',
    secondary: '#004BA0',
    theme: {
      primary: '#EA1A85',
      secondary: '#004BA0',
      accent: '#FFFFFF',
      highlight: '#F472B6',
      surfaceTint: 'rgba(234, 26, 133, 0.12)',
      glow: 'rgba(234, 26, 133, 0.28)',
      patternId: 'rr-arcs',
    },
  },
  {
    code: 'DC',
    name: 'Delhi Capitals',
    primary: '#0078BC',
    secondary: '#EF1B23',
    theme: {
      primary: '#0078BC',
      secondary: '#EF1B23',
      accent: '#FFFFFF',
      highlight: '#38BDF8',
      surfaceTint: 'rgba(0, 120, 188, 0.14)',
      glow: 'rgba(0, 120, 188, 0.28)',
      patternId: 'dc-racing',
    },
  },
  {
    code: 'PBKS',
    name: 'Punjab Kings',
    primary: '#ED1B24',
    secondary: '#D1D5DB',
    theme: {
      primary: '#ED1B24',
      secondary: '#D1D5DB',
      accent: '#FFFFFF',
      highlight: '#FB7185',
      surfaceTint: 'rgba(237, 27, 36, 0.12)',
      glow: 'rgba(237, 27, 36, 0.26)',
      patternId: 'pbks-zigzag',
    },
  },
  {
    code: 'GT',
    name: 'Gujarat Titans',
    primary: '#1E2D4D',
    secondary: '#C9A85C',
    theme: {
      primary: '#1E2D4D',
      secondary: '#C9A85C',
      accent: '#FFFFFF',
      highlight: '#E2C275',
      surfaceTint: 'rgba(30, 45, 77, 0.22)',
      glow: 'rgba(201, 168, 92, 0.24)',
      patternId: 'gt-hexgrid',
    },
  },
  {
    code: 'LSG',
    name: 'Lucknow Super Giants',
    primary: '#0D9488',
    secondary: '#F58220',
    theme: {
      primary: '#0D9488',
      secondary: '#F58220',
      accent: '#FFFFFF',
      highlight: '#2DD4BF',
      surfaceTint: 'rgba(13, 148, 136, 0.13)',
      glow: 'rgba(13, 148, 136, 0.28)',
      patternId: 'lsg-split',
    },
  },
];

export function getTeamTheme(shortCode?: string | null): TeamTheme {
  if (!shortCode) return DEFAULT_TEAM_THEME;
  const found = IPL_TEAMS.find(
    (team) => team.code.toUpperCase() === shortCode.trim().toUpperCase(),
  );
  return found ? found.theme : DEFAULT_TEAM_THEME;
}
