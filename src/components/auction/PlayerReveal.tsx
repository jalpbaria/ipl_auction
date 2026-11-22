import { Plane, Shield } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getCategoryInfo, getSkillInfo } from '../../data/categories';
import {
  formatStatValue,
  getSetCategoryInfo,
  type SetProgress,
} from '../../lib/auction';
import { formatLakhs } from '../../lib/format';
import {
  playRevealBasePriceSlam,
  playRevealCountdownTick,
  playRevealOpenHorn,
  playRevealStatTick,
  playRevealWhoosh,
} from '../../lib/sound';
import type { RoomPlayerWithPlayer } from '../../types/database';
import { CornerBrackets } from '../ui/CornerBrackets';
import { PlayerCard } from './PlayerCard';

export interface PlayerRevealProps {
  lot: RoomPlayerWithPlayer | null;
  setProgress: SetProgress | null;
  durationMs: number;
  elapsedMs: number;
  variant: 'projector' | 'team';
  teamColors?: { primary: string; secondary: string };
  soundOn: boolean;
}

function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

function animTiming(
  startFrac: number,
  endFrac: number,
  durationMs: number,
  anchorElapsedMs: number,
) {
  const startMs = startFrac * durationMs;
  const segDurationMs = Math.max(80, (endFrac - startFrac) * durationMs);
  return {
    animationDuration: `${Math.round(segDurationMs)}ms`,
    animationDelay: `${Math.round(startMs - anchorElapsedMs)}ms`,
    animationFillMode: 'both' as const,
  };
}

export function PlayerReveal({
  lot,
  setProgress,
  durationMs,
  elapsedMs,
  variant,
  teamColors,
  soundOn,
}: PlayerRevealProps) {
  const reducedMotion = usePrefersReducedMotion();
  const safeDurationMs = Math.max(1000, durationMs);
  const clampedElapsed = Math.min(safeDurationMs, Math.max(0, elapsedMs));
  const progress = clampedElapsed / safeDurationMs;
  const remMs = Math.max(0, safeDurationMs - clampedElapsed);

  const isProjector = variant === 'projector';
  const accentPrimary = teamColors?.primary ?? '#F5B921';
  const accentSecondary = teamColors?.secondary ?? '#22D3EE';

  // Anchor CSS animation delays once per lot/duration so 100ms state ticks never jitter CSS keyframes.
  const anchorRef = useRef<{ key: string; elapsed: number }>({
    key: '',
    elapsed: 0,
  });
  const lotKey = `${lot?.id ?? 'none'}:${safeDurationMs}`;
  if (
    anchorRef.current.key !== lotKey ||
    Math.abs(clampedElapsed - anchorRef.current.elapsed) > 12000
  ) {
    anchorRef.current = { key: lotKey, elapsed: clampedElapsed };
  }
  const anchorElapsed = anchorRef.current.elapsed;

  // Audio stage triggers — fire forward only, never replay missed stages on mid-reveal join.
  const audioStageRef = useRef<{
    lotId: string;
    whoosh: boolean;
    stat1: boolean;
    stat2: boolean;
    stat3: boolean;
    slam: boolean;
    lastCountdownSec: number | null;
    horn: boolean;
  }>({
    lotId: '',
    whoosh: false,
    stat1: false,
    stat2: false,
    stat3: false,
    slam: false,
    lastCountdownSec: null,
    horn: false,
  });

  useEffect(() => {
    const id = lot?.id ?? 'none';
    if (audioStageRef.current.lotId !== id) {
      audioStageRef.current = {
        lotId: id,
        whoosh: progress > 0.14,
        stat1: progress > 0.42,
        stat2: progress > 0.48,
        stat3: progress > 0.54,
        slam: progress > 0.76,
        lastCountdownSec: remMs <= 3000 ? Math.ceil(remMs / 1000) : null,
        horn: progress > 0.98,
      };
    }

    if (!soundOn || !lot?.players) return;

    const st = audioStageRef.current;
    if (!st.whoosh && progress >= 0.08) {
      st.whoosh = true;
      playRevealWhoosh();
    }
    if (!st.stat1 && progress >= 0.38) {
      st.stat1 = true;
      playRevealStatTick();
    }
    if (!st.stat2 && progress >= 0.44) {
      st.stat2 = true;
      playRevealStatTick();
    }
    if (!st.stat3 && progress >= 0.5) {
      st.stat3 = true;
      playRevealStatTick();
    }
    if (!st.slam && progress >= 0.7) {
      st.slam = true;
      playRevealBasePriceSlam();
    }
    if (remMs > 0 && remMs <= 3000) {
      const sec = Math.min(3, Math.max(1, Math.ceil(remMs / 1000)));
      if (st.lastCountdownSec !== sec) {
        st.lastCountdownSec = sec;
        playRevealCountdownTick();
      }
    }
    if (!st.horn && progress >= 0.96) {
      st.horn = true;
      playRevealOpenHorn();
    }
  }, [lot?.id, lot?.players, progress, remMs, soundOn]);

  const player = lot?.players ?? null;

  // Staggered stat rows across 0.38 -> 0.75 (declared before early return to satisfy Rules of Hooks)
  const statRows = useMemo(() => {
    const srVal =
      player?.strike_rate && player.strike_rate > 0 ? player.strike_rate : 0;
    const econVal =
      player?.economy && player.economy > 0 ? player.economy : 0;

    return [
      {
        key: 'matches',
        label: 'MATCHES',
        target: player?.matches ?? 0,
        cap: 260,
        isRate: false,
        startFrac: 0.38,
      },
      {
        key: 'runs',
        label: 'RUNS',
        target: player?.runs ?? 0,
        cap: 8000,
        isRate: false,
        startFrac: 0.44,
      },
      {
        key: 'wickets',
        label: 'WICKETS',
        target: player?.wickets ?? 0,
        cap: 200,
        isRate: false,
        startFrac: 0.5,
      },
      {
        key: 'sr',
        label: 'STRIKE RATE',
        target: srVal,
        cap: 200,
        isRate: true,
        startFrac: 0.56,
      },
      {
        key: 'econ',
        label: 'ECONOMY',
        target: econVal,
        cap: 12,
        isRate: true,
        startFrac: 0.62,
      },
    ];
  }, [
    player?.matches,
    player?.runs,
    player?.wickets,
    player?.strike_rate,
    player?.economy,
  ]);

  // Loading skeleton when lot data hasn't arrived yet
  if (!lot || !player) {
    return (
      <div
        className={`relative flex w-full flex-col justify-between overflow-hidden rounded-[4px] border border-[#F5B921]/35 bg-[#070B14] broadcast-grid ${
          isProjector ? 'h-full p-10' : 'min-h-[480px] p-5'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="h-8 w-56 animate-pulse rounded-[2px] bg-[#0E1524]" />
          <div className="h-8 w-36 animate-pulse rounded-[2px] bg-[#0E1524]" />
        </div>
        <div className="my-auto grid grid-cols-12 items-center gap-8">
          <div
            className={`col-span-5 mx-auto aspect-[687/1024] animate-pulse rounded-[4px] border border-white/10 bg-[#0E1524] ${
              isProjector ? 'w-[420px]' : 'w-[240px]'
            }`}
          />
          <div className="col-span-7 space-y-4">
            <div className="h-14 w-3/4 animate-pulse rounded-[4px] bg-[#0E1524]" />
            <div className="h-6 w-1/2 animate-pulse rounded-[4px] bg-[#0E1524]" />
            <div className="h-36 w-full animate-pulse rounded-[4px] bg-[#0E1524]" />
          </div>
        </div>
        <div className="h-1.5 w-full bg-[#0E1524]" />
      </div>
    );
  }

  const categoryInfo = getCategoryInfo(player.category);
  const skillInfo = getSkillInfo(player.skill);
  const setCategoryInfo = getSetCategoryInfo(setProgress?.setNo ?? lot.set_no);

  const setLabelText =
    setProgress?.setLabel || setCategoryInfo?.label || player.category || 'POOL';
  const setNumberText = setProgress?.setNo ?? lot.set_no;

  // Letter-by-letter name reveal across 0.24 -> 0.44
  const fullFirst = player.first_name || '';
  const fullLast = player.last_name || '';
  const totalNameChars = fullFirst.length + fullLast.length;
  const nameRevealFrac = reducedMotion
    ? 1
    : progress < 0.24
      ? 0
      : Math.min(1, (progress - 0.24) / 0.2);
  const visibleChars = Math.max(
    reducedMotion ? totalNameChars : 0,
    Math.ceil(nameRevealFrac * totalNameChars),
  );
  const visibleFirstCount = Math.min(fullFirst.length, visibleChars);
  const visibleLastCount = Math.max(
    0,
    Math.min(fullLast.length, visibleChars - fullFirst.length),
  );

  const countdownSec =
    remMs > 0 ? Math.min(3, Math.max(1, Math.ceil(remMs / 1000))) : 0;
  const showClosingCountdown = remMs <= 3000 || progress >= 0.8;
  const isFinalMoment = progress >= 0.84;

  const remainingRatio = Math.max(0, Math.min(1, 1 - progress));

  return (
    <div
      style={
        reducedMotion
          ? undefined
          : {
              animationName: 'reveal-backdrop-in, reveal-exit-up',
              animationDuration: `${Math.round(safeDurationMs * 0.12)}ms, ${Math.round(
                safeDurationMs * 0.06,
              )}ms`,
              animationDelay: `${Math.round(-anchorElapsed)}ms, ${Math.round(
                safeDurationMs * 0.95 - anchorElapsed,
              )}ms`,
              animationFillMode: 'both, forwards',
            }
      }
      className={`relative flex w-full flex-col justify-between overflow-hidden bg-[#070B14]/95 broadcast-grid select-none ${
        isProjector
          ? 'h-full px-12 pt-6 pb-4'
          : 'min-h-[500px] rounded-[4px] border border-[#F5B921]/45 px-4 pt-4 pb-3 sm:px-6 sm:pt-5'
      }`}
    >
      {/* Top-center gold spotlight cone (no glassmorphism blur) */}
      <div
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 58% 65% at 50% 0%, rgba(245, 185, 33, 0.22) 0%, rgba(34, 211, 238, 0.06) 45%, transparent 78%)',
          transformOrigin: 'top center',
          ...(reducedMotion
            ? {}
            : {
                animationName: 'reveal-spotlight-in',
                ...animTiming(0, 0.14, safeDurationMs, anchorElapsed),
              }),
        }}
        className="pointer-events-none absolute inset-x-0 top-0 h-[78%]"
      />

      {/* STAGE 1 HEADER: NEXT UP / SET / LOT POSITION / PLAYER CODE */}
      <div
        style={
          reducedMotion
            ? undefined
            : {
                animationName: 'reveal-slide-down',
                ...animTiming(0, 0.12, safeDurationMs, anchorElapsed),
              }
        }
        className={`relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 ${
          isProjector ? 'pb-4' : 'pb-3'
        }`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-[2px] border border-[#F5B921] bg-[#F5B921] font-display tracking-[0.1em] text-[#070B14] ${
              isProjector ? 'px-5 py-1 text-3xl' : 'px-3 py-0.5 text-lg'
            }`}
          >
            NEXT UP
          </span>

          <span
            className={`rounded-[2px] border border-[#22D3EE]/50 bg-[#0E1524] font-mono font-bold uppercase tracking-[0.14em] text-[#22D3EE] ${
              isProjector ? 'px-4 py-1.5 text-xl' : 'px-2.5 py-1 text-[11px]'
            }`}
          >
            SET {setNumberText} - {setLabelText.toUpperCase()}
          </span>

          {setProgress && (
            <span
              className={`rounded-[2px] border border-white/15 bg-[#0E1524] font-mono uppercase tracking-[0.12em] text-[#E8ECF4] tabular-nums ${
                isProjector ? 'px-4 py-1.5 text-xl' : 'px-2.5 py-1 text-[11px]'
              }`}
            >
              {setProgress.remaining} LEFT IN SET
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {player.player_code && (
            <span
              className={`rounded-[2px] border border-[#F5B921]/45 bg-[#0E1524] font-mono font-bold uppercase tracking-[0.14em] text-[#F5B921] ${
                isProjector ? 'px-4 py-1.5 text-xl' : 'px-2.5 py-1 text-xs'
              }`}
            >
              {player.player_code}
            </span>
          )}
        </div>
      </div>

      {/* MAIN REVEAL STAGE */}
      <div
        style={
          reducedMotion
            ? undefined
            : {
                animationName: 'reveal-micro-shake',
                ...animTiming(0.75, 0.84, safeDurationMs, anchorElapsed),
              }
        }
        className={`relative z-10 my-auto grid items-center ${
          isProjector
            ? 'grid-cols-12 gap-12 py-4'
            : 'grid-cols-1 gap-5 py-4 md:grid-cols-12 md:gap-6'
        }`}
      >
        {/* LEFT: 3D FLIPPING CARD STAGE (STAGE 2: 0.08 -> 0.30) */}
        <div
          className={`relative flex items-center justify-center ${
            isProjector ? 'col-span-5' : 'md:col-span-5'
          }`}
        >
          {/* Gold Glow Burst behind card on flip completion */}
          <div
            aria-hidden="true"
            style={{
              background:
                'radial-gradient(circle at center, rgba(245, 185, 33, 0.45) 0%, rgba(34, 211, 238, 0.16) 45%, transparent 72%)',
              ...(reducedMotion
                ? {}
                : {
                    animationName: 'reveal-glow-burst',
                    ...animTiming(0.2, 0.42, safeDurationMs, anchorElapsed),
                  }),
            }}
            className={`pointer-events-none absolute rounded-full ${
              isProjector ? 'h-[580px] w-[580px]' : 'h-[320px] w-[320px]'
            }`}
          />

          {/* Arrival + Gentle Bob Wrapper */}
          <div
            style={
              reducedMotion
                ? undefined
                : {
                    animationName: 'reveal-card-arrive',
                    ...animTiming(0.08, 0.22, safeDurationMs, anchorElapsed),
                  }
            }
            className="relative"
          >
            <div
              style={
                reducedMotion
                  ? undefined
                  : {
                      animationName: 'reveal-card-bob',
                      animationDuration: '3.2s',
                      animationDelay: `${Math.round(
                        safeDurationMs * 0.3 - anchorElapsed,
                      )}ms`,
                      animationTimingFunction: 'ease-in-out',
                      animationIterationCount: 'infinite',
                    }
              }
              className="reveal-perspective reveal-motion-bob"
            >
              <div
                className={`relative aspect-[687/1024] reveal-preserve-3d ${
                  isProjector
                    ? 'w-[515px]'
                    : 'w-[225px] sm:w-[255px] lg:w-[275px]'
                }`}
              >
                {/* CARD BACK FACE ("IPL | SUPERTEAM" navy & gold) */}
                <div
                  style={
                    reducedMotion
                      ? undefined
                      : {
                          animationName: 'reveal-card-flip-back',
                          ...animTiming(0.14, 0.3, safeDurationMs, anchorElapsed),
                          animationTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                        }
                  }
                  className="reveal-backface-hidden reveal-motion-flip-back absolute inset-0 overflow-hidden rounded-[6px] border-2 border-[#F5B921] bg-[#0E1524] reveal-diag-pattern p-5 shadow-[0_24px_60px_rgba(0,0,0,0.85)]"
                >
                  <CornerBrackets tone="gold" size="md" />
                  <div className="flex h-full w-full flex-col items-center justify-between border border-[#F5B921]/35 bg-[#070B14]/85 p-5 text-center">
                    <span className="font-mono text-xs uppercase tracking-[0.22em] text-[#22D3EE]">
                      OFFICIAL PLAYER LOT
                    </span>

                    <div className="flex flex-col items-center gap-3">
                      <div
                        className={`flex items-center justify-center rounded-[4px] border-2 border-[#F5B921] bg-[#0E1524] ${
                          isProjector ? 'h-28 w-28' : 'h-16 w-16'
                        }`}
                      >
                        <Shield
                          className={`text-[#F5B921] ${
                            isProjector ? 'h-14 w-14' : 'h-8 w-8'
                          }`}
                        />
                      </div>
                      <p
                        className={`font-display leading-none tracking-[0.12em] text-[#E8ECF4] ${
                          isProjector ? 'text-5xl' : 'text-3xl'
                        }`}
                      >
                        IPL <span className="text-[#F5B921]">|</span> SUPERTEAM
                      </p>
                      <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#8B95AA]">
                        AUCTION SEASON
                      </p>
                    </div>

                    <span className="font-mono text-xs uppercase tracking-[0.18em] text-[#F5B921]">
                      {player.player_code}
                    </span>
                  </div>
                </div>

                {/* CARD FRONT FACE */}
                <div
                  style={
                    reducedMotion
                      ? undefined
                      : {
                          animationName: 'reveal-card-flip-front',
                          ...animTiming(0.14, 0.3, safeDurationMs, anchorElapsed),
                          animationTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                        }
                  }
                  className="reveal-backface-hidden reveal-motion-flip-front relative h-full w-full overflow-hidden rounded-[6px] shadow-[0_24px_64px_rgba(0,0,0,0.85)]"
                >
                  <PlayerCard
                    player={player}
                    size="lg"
                    basePriceLakhs={lot.base_price_lakhs}
                    className="!w-full h-full border-2 border-[#F5B921]"
                  />

                  {/* Diagonal Specular Shine Sweep */}
                  {!reducedMotion && (
                    <div
                      aria-hidden="true"
                      style={{
                        background:
                          'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.34) 50%, transparent 100%)',
                        animationName: 'reveal-card-shine',
                        ...animTiming(0.26, 0.42, safeDurationMs, anchorElapsed),
                      }}
                      className="reveal-motion-shine pointer-events-none absolute inset-y-0 left-0 w-1/2"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: NAME, CHIPS, STAGGERED STATS, BASE PRICE SLAM, COUNTDOWN */}
        <div
          className={`flex min-w-0 flex-col justify-between ${
            isProjector ? 'col-span-7 gap-5' : 'md:col-span-7 gap-3.5'
          }`}
        >
          {/* STAGE 3 (0.24 -> 0.50): LETTER-BY-LETTER NAME + CHIPS */}
          <div className={isProjector ? 'space-y-4' : 'space-y-2.5'}>
            <div className="flex flex-wrap items-center gap-2">
              {categoryInfo && (
                <span
                  style={
                    reducedMotion
                      ? undefined
                      : {
                          animationName: 'reveal-fade-up',
                          ...animTiming(0.28, 0.38, safeDurationMs, anchorElapsed),
                        }
                  }
                  className={`inline-flex items-center rounded-[2px] border font-mono uppercase tracking-[0.1em] ${
                    categoryInfo.chipClass
                  } ${isProjector ? 'px-3.5 py-1 text-xl' : 'px-2 py-0.5 text-[11px]'}`}
                >
                  {categoryInfo.label}
                </span>
              )}

              {skillInfo && (
                <span
                  style={
                    reducedMotion
                      ? undefined
                      : {
                          animationName: 'reveal-fade-up',
                          ...animTiming(0.32, 0.42, safeDurationMs, anchorElapsed),
                        }
                  }
                  className={`inline-flex items-center rounded-[2px] border font-mono font-semibold uppercase tracking-[0.1em] ${
                    skillInfo.chipClass
                  } ${isProjector ? 'px-3.5 py-1 text-xl' : 'px-2 py-0.5 text-[11px]'}`}
                >
                  {skillInfo.value}
                </span>
              )}

              <span
                style={
                  reducedMotion
                    ? undefined
                    : {
                        animationName: 'reveal-fade-up',
                        ...animTiming(0.36, 0.46, safeDurationMs, anchorElapsed),
                      }
                }
                className={`inline-flex items-center rounded-[2px] border border-white/15 bg-[#0E1524] font-mono uppercase tracking-[0.1em] text-[#E8ECF4] ${
                  isProjector ? 'px-3.5 py-1 text-xl' : 'px-2 py-0.5 text-[11px]'
                }`}
              >
                {player.nationality}
              </span>

              {player.is_overseas ? (
                <span
                  style={
                    reducedMotion
                      ? undefined
                      : {
                          animationName: 'reveal-fade-up',
                          ...animTiming(0.4, 0.5, safeDurationMs, anchorElapsed),
                        }
                  }
                  className={`inline-flex items-center gap-1.5 rounded-[2px] border border-[#F5B921]/50 bg-[#F5B921]/15 font-mono font-bold uppercase tracking-[0.1em] text-[#F5B921] ${
                    isProjector ? 'px-3.5 py-1 text-xl' : 'px-2 py-0.5 text-[11px]'
                  }`}
                >
                  <Plane className={isProjector ? 'h-5 w-5' : 'h-3 w-3'} />
                  <span>OVERSEAS</span>
                </span>
              ) : (
                <span
                  style={
                    reducedMotion
                      ? undefined
                      : {
                          animationName: 'reveal-fade-up',
                          ...animTiming(0.4, 0.5, safeDurationMs, anchorElapsed),
                        }
                  }
                  className={`inline-flex items-center rounded-[2px] border border-[#22D3EE]/35 bg-[#22D3EE]/10 font-mono font-semibold uppercase tracking-[0.1em] text-[#22D3EE] ${
                    isProjector ? 'px-3.5 py-1 text-xl' : 'px-2 py-0.5 text-[11px]'
                  }`}
                >
                  INDIAN
                </span>
              )}
            </div>

            {/* Letter-by-letter Name Reveal */}
            <div className="min-w-0">
              <h2
                aria-label={`${fullFirst} ${fullLast}`.trim()}
                className={`font-display leading-[0.9] tracking-[0.03em] ${
                  isProjector ? 'text-[92px]' : 'text-4xl sm:text-5xl'
                }`}
              >
                <span className="block truncate text-[#E8ECF4]">
                  {fullFirst.split('').map((ch, idx) => (
                    <span
                      key={`f-${idx}`}
                      className={`inline-block transition-opacity duration-75 ${
                        idx < visibleFirstCount ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      {ch === ' ' ? '\u00A0' : ch}
                    </span>
                  ))}
                </span>
                <span className="block truncate text-[#F5B921]">
                  {fullLast
                    ? fullLast.split('').map((ch, idx) => (
                        <span
                          key={`l-${idx}`}
                          className={`inline-block transition-opacity duration-75 ${
                            idx < visibleLastCount ? 'opacity-100' : 'opacity-0'
                          }`}
                        >
                          {ch === ' ' ? '\u00A0' : ch}
                        </span>
                      ))
                    : '\u00A0'}
                </span>
              </h2>
            </div>

            {(player.ipl_season || player.ipl_team) && (
              <div
                style={
                  reducedMotion
                    ? undefined
                    : {
                        animationName: 'reveal-fade-up',
                        ...animTiming(0.42, 0.52, safeDurationMs, anchorElapsed),
                      }
                }
                className={`flex flex-wrap items-center gap-2 font-mono uppercase tracking-[0.1em] text-[#8B95AA] ${
                  isProjector ? 'text-xl' : 'text-xs'
                }`}
              >
                {player.ipl_team && (
                  <span className="rounded-[2px] border border-white/10 bg-[#0E1524] px-2.5 py-0.5 text-[#E8ECF4]">
                    IPL TEAM: {player.ipl_team}
                  </span>
                )}
                {player.ipl_season && (
                  <span className="rounded-[2px] border border-white/10 bg-[#0E1524] px-2.5 py-0.5 text-[#22D3EE]">
                    SEASON: {player.ipl_season}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* STAGE 4 (0.38 -> 0.75): STAGGERED STAT BARS WITH EASE-OUT COUNT-UP */}
          <div
            className={`relative rounded-[4px] border border-white/15 bg-[#0E1524] ${
              isProjector ? 'p-6 space-y-3.5' : 'p-3.5 space-y-2'
            }`}
          >
            <CornerBrackets tone="cyan" size="sm" />

            {statRows.map((row) => {
              const rowDurFrac = 0.14;
              const rawT = reducedMotion
                ? 1
                : (progress - row.startFrac) / rowDurFrac;
              const eased = easeOutCubic(rawT);
              const isRowVisible = reducedMotion || progress >= row.startFrac;

              const currentVal = row.target * eased;
              const displayText =
                row.isRate && row.target <= 0
                  ? '-'
                  : row.isRate
                    ? formatStatValue(currentVal)
                    : String(Math.round(currentVal).toLocaleString('en-IN'));

              const barRatio =
                row.target > 0
                  ? Math.min(1, (row.target / row.cap) * eased)
                  : 0;

              return (
                <div
                  key={row.key}
                  style={
                    reducedMotion
                      ? undefined
                      : {
                          animationName: 'reveal-fade-up',
                          ...animTiming(
                            row.startFrac,
                            row.startFrac + 0.08,
                            safeDurationMs,
                            anchorElapsed,
                          ),
                        }
                  }
                  className={isRowVisible ? 'opacity-100' : 'opacity-0'}
                >
                  <div
                    className={`flex items-center justify-between font-mono tabular-nums ${
                      isProjector ? 'text-xl mb-1.5' : 'text-xs mb-1'
                    }`}
                  >
                    <span className="uppercase tracking-[0.12em] text-[#8B95AA]">
                      {row.label}
                    </span>
                    <span
                      className={`font-bold ${
                        row.isRate && row.target <= 0
                          ? 'text-[#8B95AA]'
                          : 'text-[#E8ECF4]'
                      }`}
                    >
                      {displayText}
                    </span>
                  </div>

                  <div
                    className={`w-full overflow-hidden rounded-[2px] bg-[#070B14] border border-white/[0.06] ${
                      isProjector ? 'h-3' : 'h-2'
                    }`}
                  >
                    <div
                      style={{
                        transform: `scaleX(${barRatio})`,
                        transformOrigin: 'left center',
                        backgroundColor: isProjector ? '#22D3EE' : accentSecondary,
                      }}
                      className="h-full w-full transition-transform duration-75 ease-out motion-reduce:transition-none"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* STAGE 5 & 6 (0.70 -> 1.00): BASE PRICE SLAM + BIDDING OPENS IN 3, 2, 1 */}
          <div
            className={`grid items-stretch gap-4 ${
              isProjector ? 'grid-cols-12' : 'grid-cols-1 sm:grid-cols-12'
            }`}
          >
            {/* Base Price Slam */}
            <div
              style={
                reducedMotion
                  ? undefined
                  : {
                      animationName: 'reveal-base-slam',
                      ...animTiming(0.7, 0.84, safeDurationMs, anchorElapsed),
                    }
              }
              className={`relative flex items-center justify-between rounded-[4px] border-2 border-[#F5B921] bg-[#0E1524] ${
                isProjector
                  ? 'col-span-7 px-7 py-4'
                  : 'sm:col-span-7 px-4 py-2.5'
              }`}
            >
              {/* Gold Ring Pulse on slam */}
              {!reducedMotion && (
                <div
                  aria-hidden="true"
                  style={{
                    animationName: 'reveal-ring-pulse',
                    ...animTiming(0.74, 0.9, safeDurationMs, anchorElapsed),
                  }}
                  className="reveal-motion-ring pointer-events-none absolute inset-0 rounded-[4px] border-2 border-[#F5B921]"
                />
              )}

              <div>
                <p
                  className={`font-mono uppercase tracking-[0.16em] text-[#22D3EE] ${
                    isProjector ? 'text-lg' : 'text-[10px]'
                  }`}
                >
                  BASE PRICE
                </p>
                <p
                  className={`font-display leading-none tracking-wide text-[#F5B921] tabular-nums ${
                    isProjector ? 'mt-1 text-[68px]' : 'mt-0.5 text-3xl sm:text-4xl'
                  }`}
                >
                  {formatLakhs(lot.base_price_lakhs)}
                </p>
              </div>
            </div>

            {/* Stage 6 Countdown: BIDDING OPENS IN 3, 2, 1 */}
            <div
              style={{
                borderColor: showClosingCountdown
                  ? accentPrimary
                  : 'rgba(255,255,255,0.12)',
              }}
              className={`flex items-center justify-between gap-3 rounded-[4px] border bg-[#0E1524] transition-colors ${
                isProjector
                  ? 'col-span-5 px-6 py-4'
                  : 'sm:col-span-5 px-4 py-2.5'
              } ${isFinalMoment ? 'bg-[#141C2F]' : ''}`}
            >
              <div className="min-w-0">
                <p
                  className={`font-mono uppercase tracking-[0.12em] ${
                    showClosingCountdown ? 'text-[#22D3EE]' : 'text-[#8B95AA]'
                  } ${isProjector ? 'text-lg' : 'text-[10px]'}`}
                >
                  {showClosingCountdown ? 'BIDDING OPENS IN' : 'PREVIEW'}
                </p>
                <p
                  className={`font-display leading-none text-[#E8ECF4] tabular-nums ${
                    isProjector ? 'mt-1 text-5xl' : 'mt-0.5 text-2xl'
                  }`}
                >
                  {showClosingCountdown
                    ? countdownSec > 0
                      ? countdownSec
                      : 'GO'
                    : `${Math.max(1, Math.ceil(remMs / 1000))}S`}
                </p>
              </div>

              <div
                className={`relative flex shrink-0 items-center justify-center rounded-full border-2 font-display tabular-nums ${
                  showClosingCountdown
                    ? 'border-[#22D3EE] text-[#22D3EE]'
                    : 'border-white/20 text-[#8B95AA]'
                } ${isProjector ? 'h-16 w-16 text-4xl' : 'h-10 w-10 text-xl'}`}
              >
                {Math.max(1, Math.ceil(remMs / 1000))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM GOLD PROGRESS BAR (scaleX only — zero layout shift) */}
      <div className="relative z-10 mt-1">
        <div
          className={`w-full overflow-hidden rounded-[2px] bg-[#0E1524] border border-white/10 ${
            isProjector ? 'h-2.5' : 'h-1.5'
          }`}
        >
          <div
            style={{
              transform: `scaleX(${remainingRatio})`,
              transformOrigin: 'left center',
            }}
            className="h-full w-full bg-[#F5B921] transition-transform duration-100 ease-linear motion-reduce:transition-none"
          />
        </div>
      </div>
    </div>
  );
}
