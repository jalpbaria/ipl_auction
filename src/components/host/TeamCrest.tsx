import { IPL_TEAMS } from '../../data/ipl-teams';

export function getTeamPalette(shortCode: string): {
  primary: string;
  secondary: string;
} {
  const found = IPL_TEAMS.find(
    (team) => team.code.toUpperCase() === shortCode.toUpperCase(),
  );
  return found
    ? { primary: found.primary, secondary: found.secondary }
    : { primary: '#141C2F', secondary: '#F5B921' };
}

interface TeamCrestProps {
  shortCode: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<NonNullable<TeamCrestProps['size']>, string> = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-[11px]',
  lg: 'h-11 w-11 text-xs',
};

export function TeamCrest({ shortCode, size = 'md' }: TeamCrestProps) {
  const palette = getTeamPalette(shortCode);
  const darkText = shortCode.toUpperCase() === 'CSK';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[3px] border font-mono font-bold tracking-wider ${SIZE_CLASSES[size]}`}
      style={{
        backgroundColor: palette.primary,
        borderColor: palette.secondary,
        color: darkText ? '#070B14' : '#FFFFFF',
        boxShadow: `inset 0 -3px 0 0 ${palette.secondary}`,
      }}
    >
      {shortCode}
    </span>
  );
}
