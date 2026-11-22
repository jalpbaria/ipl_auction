import { useEffect, useState } from 'react';
import { getReveal, remainingMs } from '../../lib/auction';
import type { DbAuctionState } from '../../types/database';

export interface CountdownProps {
  state: DbAuctionState | null;
  totalSeconds?: number;
  offsetMs: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  revealActive?: boolean;
}

const SIZE_MAP = {
  sm: {
    box: 'h-20 w-20',
    value: 'text-2xl',
    sub: 'text-[9px]',
  },
  md: {
    box: 'h-28 w-28',
    value: 'text-4xl',
    sub: 'text-[10px]',
  },
  lg: {
    box: 'h-36 w-36',
    value: 'text-5xl',
    sub: 'text-[11px]',
  },
  xl: {
    box: 'h-56 w-56',
    value: 'text-[88px]',
    sub: 'text-sm',
  },
} as const;

export function Countdown({
  state,
  totalSeconds = 20,
  offsetMs,
  size = 'md',
  revealActive,
}: CountdownProps) {
  const [msLeft, setMsLeft] = useState<number | null>(() =>
    remainingMs(state, offsetMs),
  );
  const [, setRevealTick] = useState(0);

  useEffect(() => {
    setMsLeft(remainingMs(state, offsetMs));

    if (!state || state.phase !== 'bidding' || !state.timer_ends_at) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setMsLeft(remainingMs(state, offsetMs));
      if (revealActive === undefined) {
        setRevealTick((t) => t + 1);
      }
    }, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [state, offsetMs, revealActive]);

  const isRevealActive =
    revealActive !== undefined
      ? revealActive
      : getReveal(state, null, offsetMs).active;

  const isPaused = state?.phase === 'paused';
  const totalMs = Math.max(1000, totalSeconds * 1000);
  const clampedMsLeft =
    msLeft !== null ? Math.min(totalMs, Math.max(0, msLeft)) : null;

  const isBidding =
    state?.phase === 'bidding' && !isRevealActive && clampedMsLeft !== null;

  const secondsDisplay = isRevealActive
    ? totalSeconds
    : clampedMsLeft !== null
      ? Math.max(0, Math.ceil(clampedMsLeft / 1000))
      : null;

  const isUrgent = isBidding && clampedMsLeft !== null && clampedMsLeft < 5000;

  const progress = isRevealActive
    ? 1
    : clampedMsLeft !== null
      ? Math.min(1, Math.max(0, clampedMsLeft / totalMs))
      : 0;

  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = isRevealActive
    ? 0
    : clampedMsLeft !== null
      ? circumference * (1 - progress)
      : circumference;

  const strokeColor = isRevealActive
    ? 'rgba(255,255,255,0.14)'
    : isPaused
      ? '#F5B921'
      : isUrgent
        ? '#EF4444'
        : isBidding
          ? '#22D3EE'
          : 'rgba(255,255,255,0.16)';

  const textColorClass = isRevealActive
    ? 'text-[#8B95AA]/70'
    : isPaused
      ? 'text-[#F5B921]'
      : isUrgent
        ? 'text-red-400'
        : isBidding
          ? 'text-[#E8ECF4]'
          : 'text-[#8B95AA]';

  const subLabel = isRevealActive
    ? 'GET READY'
    : isPaused
      ? 'PAUSED'
      : isUrgent
        ? 'GOING'
        : isBidding
          ? 'SECONDS'
          : 'CLOCK';

  const sizing = SIZE_MAP[size];

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center rounded-[4px] border bg-[#070B14] p-2 ${
        isRevealActive
          ? 'border-white/[0.12]'
          : isUrgent
            ? 'border-red-500/60'
            : isPaused
              ? 'border-[#F5B921]/45'
              : isBidding
                ? 'border-[#22D3EE]/35'
                : 'border-white/[0.08]'
      }`}
      aria-live="off"
    >
      <div className={`relative flex items-center justify-center ${sizing.box}`}>
        <svg
          viewBox="0 0 120 120"
          className="h-full w-full -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="7"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="7"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="butt"
            className="transition-[stroke-dashoffset,stroke] duration-100 ease-linear motion-reduce:transition-none"
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span
            className={`font-display leading-none tracking-wide tabular-nums ${sizing.value} ${textColorClass}`}
          >
            {secondsDisplay !== null ? secondsDisplay : '--'}
          </span>
          <span
            className={`mt-0.5 font-mono uppercase tracking-[0.12em] ${sizing.sub} ${
              isRevealActive
                ? 'text-[#F5B921]/75'
                : isPaused
                  ? 'text-[#F5B921]'
                  : isUrgent
                    ? 'text-red-400'
                    : 'text-[#8B95AA]'
            }`}
          >
            {subLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
