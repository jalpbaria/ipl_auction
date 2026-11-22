import { createContext, useContext } from 'react';
import { DEFAULT_TEAM_THEME, type TeamTheme } from '../../data/ipl-teams';

export interface PlayThemeContextValue {
  roomId: string;
  teamId: string | null;
  shortCode: string | null;
  teamName: string | null;
  theme: TeamTheme;
  purseLeftLakhs: number | null;
  spentLakhs: number | null;
  refreshPurse: () => Promise<void>;
}

export const PlayThemeContext = createContext<PlayThemeContextValue>({
  roomId: '',
  teamId: null,
  shortCode: null,
  teamName: null,
  theme: DEFAULT_TEAM_THEME,
  purseLeftLakhs: null,
  spentLakhs: null,
  refreshPurse: async () => {},
});

export function usePlayTheme(): PlayThemeContextValue {
  return useContext(PlayThemeContext);
}
