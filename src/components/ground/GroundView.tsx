import { useMemo, useState } from 'react';
import type { PlayerSkill } from '../../data/categories';
import type { RoomPlayerWithPlayer } from '../../types/database';

export interface GroundPlayer {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  skill: PlayerSkill | string;
  isOverseas: boolean;
  cardImageUrl: string | null;
  playerCode: string;
}

export interface GroundViewProps {
  players: GroundPlayer[];
  captainId?: string | null;
  accent?: string;
  size?: 'sm' | 'lg';
  onPlayerClick?: (id: string) => void;
  selectedId?: string | null;
  showEmptySlots?: boolean;
}

interface Point {
  x: number;
  y: number;
}

type RoleBucket = 'Wicketkeeper' | 'Batter' | 'All-Rounder' | 'Bowler';

const FIELD_W = 900;
const FIELD_H = 620;

const ROLE_SHORT_LABEL: Record<RoleBucket, string> = {
  Wicketkeeper: 'WK',
  Batter: 'BAT',
  'All-Rounder': 'AR',
  Bowler: 'BOWL',
};

function normalizeRoleBucket(skill: string): RoleBucket {
  if (skill === 'Wicketkeeper') return 'Wicketkeeper';
  if (skill === 'Batter') return 'Batter';
  if (skill === 'All-Rounder') return 'All-Rounder';
  if (skill === 'Bowler') return 'Bowler';
  return 'Batter';
}

function getInitials(firstName: string, lastName: string, name: string): string {
  const f = firstName.trim();
  const l = lastName.trim();
  if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (parts[0] || 'PL').slice(0, 2).toUpperCase();
}

function computeLinePositions(
  count: number,
  xMin: number,
  xMax: number,
  yBase: number,
  arcDepth: number,
  avoidCenterWidth = 0,
): Point[] {
  if (count <= 0) return [];
  if (count === 1) {
    return [
      {
        x: avoidCenterWidth > 0 ? 450 - avoidCenterWidth * 0.72 : 450,
        y: yBase,
      },
    ];
  }

  const pts: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1); // 0..1
    let x = xMin + t * (xMax - xMin);

    if (avoidCenterWidth > 0) {
      // Push points cleanly to left/right wings around the central pitch
      const half = Math.ceil(count / 2);
      if (i < half) {
        const leftSpan = Math.max(1, half - 1);
        const lt = half === 1 ? 0.5 : i / leftSpan;
        x = xMin + lt * (450 - avoidCenterWidth / 2 - xMin);
      } else {
        const rightCount = count - half;
        const rightSpan = Math.max(1, rightCount - 1);
        const rt = rightCount === 1 ? 0.5 : (i - half) / rightSpan;
        x = 450 + avoidCenterWidth / 2 + rt * (xMax - (450 + avoidCenterWidth / 2));
      }
    }

    // Smooth parabolic arc centered at x = 450
    const normalized = (t - 0.5) * 2; // -1..1
    const y = yBase + arcDepth * (1 - normalized * normalized);
    pts.push({ x, y });
  }
  return pts;
}

function computeWicketkeeperPositions(count: number): Point[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 450, y: 122 }];
  return computeLinePositions(count, 355, 545, 122, -10);
}

function computeBatterPositions(count: number): Point[] {
  return computeLinePositions(count, 165, 735, 226, -34, count === 1 ? 0 : 120);
}

function computeAllRounderPositions(count: number): Point[] {
  return computeLinePositions(count, 145, 755, 344, 18, 175);
}

function computeBowlerPositions(count: number): Point[] {
  return computeLinePositions(count, 195, 705, 464, 48, count === 1 ? 0 : 115);
}

function computeEmptyFormationSlots(
  filledCounts: Record<RoleBucket, number>,
  totalFilled: number,
): Array<{ role: RoleBucket; point: Point }> {
  const remaining = Math.max(0, 11 - totalFilled);
  if (remaining === 0) return [];

  const targetCounts: Record<RoleBucket, number> = {
    Wicketkeeper: 1,
    Batter: 4,
    'All-Rounder': 2,
    Bowler: 4,
  };

  const extraNeeded: Record<RoleBucket, number> = {
    Wicketkeeper: 0,
    Batter: 0,
    'All-Rounder': 0,
    Bowler: 0,
  };

  let assigned = 0;
  const order: RoleBucket[] = ['Wicketkeeper', 'Batter', 'All-Rounder', 'Bowler'];

  // First satisfy standard 1-4-2-4 deficits
  for (const role of order) {
    if (assigned >= remaining) break;
    const deficit = Math.max(0, targetCounts[role] - filledCounts[role]);
    const take = Math.min(deficit, remaining - assigned);
    extraNeeded[role] += take;
    assigned += take;
  }

  // Distribute any remaining slots evenly if team over-indexed a role
  let cursor = 0;
  while (assigned < remaining) {
    const role = order[cursor % order.length];
    extraNeeded[role] += 1;
    assigned += 1;
    cursor += 1;
  }

  const slots: Array<{ role: RoleBucket; point: Point }> = [];
  const roleComputers: Record<RoleBucket, (n: number) => Point[]> = {
    Wicketkeeper: computeWicketkeeperPositions,
    Batter: computeBatterPositions,
    'All-Rounder': computeAllRounderPositions,
    Bowler: computeBowlerPositions,
  };

  for (const role of order) {
    const totalInBand = filledCounts[role] + extraNeeded[role];
    if (extraNeeded[role] === 0) continue;
    const allPts = roleComputers[role](totalInBand);
    for (let idx = filledCounts[role]; idx < allPts.length; idx += 1) {
      slots.push({ role, point: allPts[idx] });
    }
  }

  return slots;
}

function GroundPlayerCard({
  player,
  point,
  isCaptain,
  isSelected,
  accent,
  size,
  onClick,
}: {
  player: GroundPlayer;
  point: Point;
  isCaptain: boolean;
  isSelected: boolean;
  accent: string;
  size: 'sm' | 'lg';
  onClick?: (id: string) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const roleBucket = normalizeRoleBucket(player.skill);
  const initials = getInitials(player.firstName, player.lastName, player.name);

  const leftPct = (point.x / FIELD_W) * 100;
  const topPct = (point.y / FIELD_H) * 100;

  const isSmall = size === 'sm';
  const cardWidthClass = isSmall ? 'w-[34px] sm:w-[38px]' : 'w-[58px] sm:w-[66px]';
  const displayName =
    player.lastName.trim() || player.firstName.trim() || player.name;

  return (
    <div
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
      }}
      className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
    >
      <button
        type="button"
        onClick={onClick ? () => onClick(player.id) : undefined}
        disabled={!onClick}
        aria-label={`${player.name} (${player.skill}${player.playerCode ? `, ${player.playerCode}` : ''})`}
        style={{
          boxShadow: isSelected
            ? `0 0 0 2px #22D3EE, 0 0 20px ${accent}`
            : `0 0 16px ${accent}55`,
          borderColor: isSelected
            ? '#22D3EE'
            : isCaptain
              ? '#F5B921'
              : 'rgba(245, 185, 33, 0.55)',
        }}
        className={`relative aspect-[687/1024] overflow-hidden rounded-[3px] border bg-[#0E1524] transition-transform duration-150 ${cardWidthClass} ${
          onClick
            ? 'cursor-pointer hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE]'
            : 'cursor-default'
        }`}
      >
        {player.cardImageUrl && !imgFailed ? (
          <img
            src={player.cardImageUrl}
            alt={player.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-[#0E1524] p-1 text-center">
            <span
              className={`font-display leading-none tracking-wide text-[#F5B921] ${
                isSmall ? 'text-xs' : 'text-xl'
              }`}
            >
              {initials}
            </span>
            <span
              className={`mt-0.5 font-mono uppercase tracking-[0.06em] text-[#8B95AA] ${
                isSmall ? 'text-[7px]' : 'text-[9px]'
              }`}
            >
              {ROLE_SHORT_LABEL[roleBucket]}
            </span>
          </div>
        )}

        {/* Captain Gold Badge */}
        {isCaptain && (
          <span
            title="Captain"
            className={`absolute left-0.5 top-0.5 inline-flex items-center justify-center rounded-[2px] border border-[#070B14] bg-[#F5B921] font-mono font-extrabold text-[#070B14] leading-none ${
              isSmall ? 'h-3.5 w-3.5 text-[8px]' : 'h-5 w-5 text-[10px]'
            }`}
          >
            C
          </span>
        )}

        {/* Overseas Tag */}
        {player.isOverseas && (
          <span
            title="Overseas Player"
            className={`absolute right-0.5 top-0.5 inline-flex items-center justify-center rounded-[2px] border border-[#22D3EE]/50 bg-[#070B14]/90 font-mono font-bold text-[#22D3EE] leading-none ${
              isSmall ? 'px-0.5 py-[1px] text-[7px]' : 'px-1 py-0.5 text-[8px]'
            }`}
          >
            OS
          </span>
        )}
      </button>

      {/* Player Name Label */}
      <span
        className={`mt-1 max-w-[92px] truncate rounded-[2px] border border-white/10 bg-[#070B14]/95 px-1.5 py-[1px] font-mono font-semibold text-[#E8ECF4] ${
          isSmall ? 'text-[8px] max-w-[58px]' : 'text-[10px]'
        }`}
      >
        {displayName}
      </span>

      {/* Hover Tooltip with Role & Player Code */}
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-[3px] border border-[#F5B921]/50 bg-[#070B14] px-2.5 py-1.5 text-left shadow-lg group-hover:block group-focus-within:block"
      >
        <p className="font-sans text-[11px] font-semibold text-[#E8ECF4]">
          {player.name}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-[#22D3EE]">
          {player.skill}
          {player.playerCode ? ` · ${player.playerCode}` : ''}
        </p>
      </div>
    </div>
  );
}

export function GroundView({
  players,
  captainId,
  accent = '#F5B921',
  size = 'lg',
  onPlayerClick,
  selectedId,
  showEmptySlots = false,
}: GroundViewProps) {
  const layout = useMemo(() => {
    const byRole: Record<RoleBucket, GroundPlayer[]> = {
      Wicketkeeper: [],
      Batter: [],
      'All-Rounder': [],
      Bowler: [],
    };

    for (const player of players) {
      byRole[normalizeRoleBucket(player.skill)].push(player);
    }

    const filledCounts: Record<RoleBucket, number> = {
      Wicketkeeper: byRole.Wicketkeeper.length,
      Batter: byRole.Batter.length,
      'All-Rounder': byRole['All-Rounder'].length,
      Bowler: byRole.Bowler.length,
    };

    const emptySlots = showEmptySlots
      ? computeEmptyFormationSlots(filledCounts, players.length)
      : [];

    const extraByRole: Record<RoleBucket, number> = {
      Wicketkeeper: emptySlots.filter((s) => s.role === 'Wicketkeeper').length,
      Batter: emptySlots.filter((s) => s.role === 'Batter').length,
      'All-Rounder': emptySlots.filter((s) => s.role === 'All-Rounder').length,
      Bowler: emptySlots.filter((s) => s.role === 'Bowler').length,
    };

    const wkPts = computeWicketkeeperPositions(
      filledCounts.Wicketkeeper + extraByRole.Wicketkeeper,
    );
    const batPts = computeBatterPositions(filledCounts.Batter + extraByRole.Batter);
    const arPts = computeAllRounderPositions(
      filledCounts['All-Rounder'] + extraByRole['All-Rounder'],
    );
    const bowlPts = computeBowlerPositions(
      filledCounts.Bowler + extraByRole.Bowler,
    );

    const placed: Array<{ player: GroundPlayer; point: Point }> = [];
    byRole.Wicketkeeper.forEach((p, idx) =>
      placed.push({ player: p, point: wkPts[idx] }),
    );
    byRole.Batter.forEach((p, idx) =>
      placed.push({ player: p, point: batPts[idx] }),
    );
    byRole['All-Rounder'].forEach((p, idx) =>
      placed.push({ player: p, point: arPts[idx] }),
    );
    byRole.Bowler.forEach((p, idx) =>
      placed.push({ player: p, point: bowlPts[idx] }),
    );

    return { placed, emptySlots };
  }, [players, showEmptySlots]);

  const containerSizeClass =
    size === 'sm'
      ? 'w-full max-w-[460px] aspect-[460/320]'
      : 'w-full max-w-[900px] aspect-[900/620]';

  const isSmall = size === 'sm';

  return (
    <div
      className={`relative mx-auto select-none overflow-hidden rounded-[4px] border border-white/15 bg-[#070B14] ${containerSizeClass}`}
    >
      {/* Cricket Ground SVG */}
      <svg
        viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
        className="h-full w-full block"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={`outfield-clip-${size}`}>
            <ellipse cx="450" cy="310" rx="428" ry="290" />
          </clipPath>
        </defs>

        {/* Stadium Surround */}
        <rect x="0" y="0" width={FIELD_W} height={FIELD_H} fill="#070B14" />

        {/* Base Green Oval */}
        <ellipse cx="450" cy="310" rx="428" ry="290" fill="#0B3D24" />

        {/* Mown Turf Alternating Stripes clipped to Oval */}
        <g clipPath={`url(#outfield-clip-${size})`}>
          {Array.from({ length: 18 }, (_, i) => (
            <rect
              key={i}
              x={i * 50}
              y="0"
              width="25"
              height={FIELD_H}
              fill="#0E4B2D"
              opacity="0.55"
            />
          ))}
        </g>

        {/* Outfield Boundary Rope */}
        <ellipse
          cx="450"
          cy="310"
          rx="412"
          ry="275"
          fill="none"
          stroke="#E8ECF4"
          strokeOpacity="0.45"
          strokeWidth="2.5"
        />

        {/* Inner 30-Yard Dashed Circle */}
        <ellipse
          cx="450"
          cy="310"
          rx="208"
          ry="152"
          fill="none"
          stroke="#E8ECF4"
          strokeOpacity="0.42"
          strokeWidth="2"
          strokeDasharray="8 6"
        />

        {/* Centered Cricket Pitch Rectangle */}
        <rect
          x="420"
          y="222"
          width="60"
          height="176"
          rx="2"
          fill="#C2A36B"
          stroke="#8B6F3E"
          strokeWidth="1.5"
        />

        {/* Crease Lines */}
        <line
          x1="414"
          y1="242"
          x2="486"
          y2="242"
          stroke="#FFFFFF"
          strokeOpacity="0.8"
          strokeWidth="1.5"
        />
        <line
          x1="414"
          y1="378"
          x2="486"
          y2="378"
          stroke="#FFFFFF"
          strokeOpacity="0.8"
          strokeWidth="1.5"
        />

        {/* Top Stumps (3 wickets) */}
        <circle cx="444" cy="233" r="1.8" fill="#070B14" />
        <circle cx="450" cy="233" r="1.8" fill="#070B14" />
        <circle cx="456" cy="233" r="1.8" fill="#070B14" />

        {/* Bottom Stumps (3 wickets) */}
        <circle cx="444" cy="387" r="1.8" fill="#070B14" />
        <circle cx="450" cy="387" r="1.8" fill="#070B14" />
        <circle cx="456" cy="387" r="1.8" fill="#070B14" />
      </svg>

      {/* Empty Dashed Slots (optional) */}
      {layout.emptySlots.map((slot, idx) => (
        <div
          key={`empty-${slot.role}-${idx}`}
          style={{
            left: `${(slot.point.x / FIELD_W) * 100}%`,
            top: `${(slot.point.y / FIELD_H) * 100}%`,
          }}
          className="pointer-events-none absolute z-0 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
        >
          <div
            className={`aspect-[687/1024] rounded-[3px] border border-dashed border-white/35 bg-[#070B14]/45 flex items-center justify-center ${
              isSmall ? 'w-[34px] sm:w-[38px]' : 'w-[58px] sm:w-[66px]'
            }`}
          >
            <span
              className={`font-mono uppercase text-white/45 ${
                isSmall ? 'text-[7px]' : 'text-[9px]'
              }`}
            >
              {ROLE_SHORT_LABEL[slot.role]}
            </span>
          </div>
        </div>
      ))}

      {/* Player Portrait Cards */}
      {layout.placed.map(({ player, point }) => (
        <GroundPlayerCard
          key={player.id}
          player={player}
          point={point}
          isCaptain={captainId === player.id}
          isSelected={selectedId === player.id}
          accent={accent}
          size={size}
          onClick={onPlayerClick}
        />
      ))}
    </div>
  );
}

export function roomPlayerToGroundPlayer(
  rp: RoomPlayerWithPlayer,
): GroundPlayer | null {
  const p = rp.players;
  if (!p) return null;
  return {
    id: rp.id,
    name: `${p.first_name} ${p.last_name}`.trim(),
    firstName: p.first_name,
    lastName: p.last_name,
    skill: p.skill,
    isOverseas: p.is_overseas,
    cardImageUrl: p.card_image_url,
    playerCode: p.player_code,
  };
}
