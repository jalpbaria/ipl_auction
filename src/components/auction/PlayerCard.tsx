import { useEffect, useState } from 'react';
import { getCategoryInfo, getSkillInfo } from '../../data/categories';
import { formatStatValue } from '../../lib/auction';
import { formatLakhs } from '../../lib/format';
import type { DbPlayer } from '../../types/database';
import { CornerBrackets } from '../ui/CornerBrackets';

export interface PlayerCardProps {
  player: DbPlayer | null;
  size?: 'sm' | 'md' | 'lg';
  basePriceLakhs?: number;
  className?: string;
}

const WIDTH_CLASSES: Record<NonNullable<PlayerCardProps['size']>, string> = {
  sm: 'w-24 sm:w-28',
  md: 'w-36 sm:w-44',
  lg: 'w-48 sm:w-60',
};

const NAME_CLASSES: Record<NonNullable<PlayerCardProps['size']>, string> = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-3xl',
};

const STAT_TEXT_CLASSES: Record<NonNullable<PlayerCardProps['size']>, string> = {
  sm: 'text-[9px]',
  md: 'text-[10px]',
  lg: 'text-[11px]',
};

export function PlayerCard({
  player,
  size = 'md',
  basePriceLakhs,
  className = '',
}: PlayerCardProps) {
  const imageUrl = player?.card_image_url?.trim() || '';
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [player?.id, imageUrl]);

  const fullName = player
    ? `${player.first_name} ${player.last_name}`.trim()
    : 'STANDBY';
  const showFallback = !player || !imageUrl || imgFailed;
  const categoryInfo = getCategoryInfo(player?.category);
  const skillInfo = getSkillInfo(player?.skill);

  return (
    <div
      className={`relative aspect-[687/1024] shrink-0 overflow-hidden rounded-[4px] border border-[#F5B921]/70 bg-[#070B14] ${WIDTH_CLASSES[size]} ${className}`}
    >
      {!showFallback ? (
        <img
          src={imageUrl}
          alt={fullName}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className={`relative flex h-full w-full flex-col justify-between bg-[#070B14] hero-gold-diagonal ${
            size === 'sm' ? 'p-2' : 'p-3'
          }`}
        >
          <CornerBrackets tone="gold" size="sm" />

          {/* Header */}
          <div className="flex items-center justify-between gap-1 border-b border-white/[0.08] pb-1.5">
            <span className="truncate font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#F5B921]">
              {player?.player_code || 'NO LOT'}
            </span>
            {size !== 'sm' && (
              <span
                className={`truncate font-mono text-[9px] uppercase tracking-[0.08em] ${
                  categoryInfo?.textClass ?? 'text-[#22D3EE]'
                }`}
              >
                {categoryInfo?.label ?? player?.category ?? 'POOL'}
              </span>
            )}
          </div>

          {/* Center Identity */}
          <div className="my-auto flex flex-col items-center py-1 text-center">
            <p
              className={`font-display leading-none tracking-wide text-[#E8ECF4] ${NAME_CLASSES[size]}`}
            >
              {fullName}
            </p>
            {player?.skill && (
              <span
                className={`mt-1.5 inline-flex items-center rounded-[2px] border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] ${
                  skillInfo?.chipClass ?? 'border-white/15 bg-[#0E1524] text-[#8B95AA]'
                }`}
              >
                {player.skill}
              </span>
            )}
            {basePriceLakhs !== undefined && size !== 'sm' && (
              <span className="mt-1.5 font-mono text-[10px] font-semibold text-[#F5B921] tabular-nums">
                BASE {formatLakhs(basePriceLakhs)}
              </span>
            )}
          </div>

          {/* Stats Footer */}
          <div
            className={`grid grid-cols-2 gap-x-2 gap-y-1 border-t border-white/[0.08] pt-1.5 font-mono tabular-nums ${STAT_TEXT_CLASSES[size]}`}
          >
            <div className="flex justify-between">
              <span className="text-[#8B95AA]">MAT</span>
              <span className="text-[#E8ECF4]">{player?.matches ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8B95AA]">RUN</span>
              <span className="text-[#E8ECF4]">{player?.runs ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8B95AA]">WKT</span>
              <span className="text-[#E8ECF4]">{player?.wickets ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8B95AA]">SR</span>
              <span className="text-[#E8ECF4]">
                {formatStatValue(player?.strike_rate)}
              </span>
            </div>
            {size !== 'sm' && (
              <div className="col-span-2 flex justify-between border-t border-white/[0.06] pt-1">
                <span className="text-[#8B95AA]">ECON</span>
                <span className="text-[#F5B921]">
                  {formatStatValue(player?.economy)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
