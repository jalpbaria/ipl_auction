import { motion, useReducedMotion } from 'framer-motion';
import { RefreshCw, RotateCcw, Trophy } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { LeaderboardRow } from '../../types/database';
import { getTeamPalette, TeamCrest } from '../host/TeamCrest';
import { Button } from '../ui/Button';
import { CornerBrackets } from '../ui/CornerBrackets';
import { ProjectorConfetti } from './ProjectorConfetti';

interface ProjectorLeaderboardViewProps {
  roomId: string;
  mouseActive: boolean;
}

function AnimatedScore({ target }: { target: number }) {
  const prefersReducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(() => (prefersReducedMotion ? target : 0));

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplay(target);
      return;
    }

    const start = performance.now();
    const duration = 700;
    let rafId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(target * eased));
      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [target, prefersReducedMotion]);

  return <span className="tabular-nums">{display}</span>;
}

export function ProjectorLeaderboardView({
  roomId,
  mouseActive,
}: ProjectorLeaderboardViewProps) {
  const prefersReducedMotion = useReducedMotion();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);
  const [showWinnerFinale, setShowWinnerFinale] = useState(false);
  const [replaySeed, setReplaySeed] = useState(0);

  const loadLeaderboard = useCallback(async () => {
    if (!supabase) {
      setUnavailable(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setUnavailable(false);

    try {
      const { data, error } = await supabase.rpc('get_leaderboard', {
        p_room: roomId,
      });

      if (error || !Array.isArray(data) || data.length === 0) {
        setRows([]);
        setUnavailable(true);
        return;
      }

      const sorted = [...(data as LeaderboardRow[])].sort((a, b) => a.pos - b.pos);
      setRows(sorted);
      setUnavailable(false);
    } catch {
      setRows([]);
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard]);

  // Sequence reveal from LAST place up to 2nd place (1.2s apart), then Rank #1 finale
  useEffect(() => {
    if (loading || unavailable || rows.length === 0) {
      setRevealedCount(0);
      setShowWinnerFinale(false);
      return;
    }

    setRevealedCount(0);
    setShowWinnerFinale(false);

    const nonWinnersCount = Math.max(0, rows.length - 1);
    const timers: number[] = [];

    for (let i = 1; i <= nonWinnersCount; i += 1) {
      const timerId = window.setTimeout(() => {
        setRevealedCount(i);
      }, i * 1200);
      timers.push(timerId);
    }

    const finaleTimerId = window.setTimeout(() => {
      setShowWinnerFinale(true);
    }, (nonWinnersCount + 1) * 1200);
    timers.push(finaleTimerId);

    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [loading, unavailable, rows, replaySeed]);

  const handleReplay = () => {
    setReplaySeed((s) => s + 1);
  };

  if (loading) {
    return (
      <div className="flex flex-1 flex-col justify-center bg-[#070B14] px-14 py-10 space-y-4">
        <div className="h-16 w-96 animate-pulse rounded-[4px] bg-[#0E1524]" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-20 w-full animate-pulse rounded-[4px] border border-white/10 bg-[#0E1524]"
          />
        ))}
      </div>
    );
  }

  if (unavailable || rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#070B14] broadcast-grid px-12">
        <div className="relative rounded-[4px] border border-white/15 bg-[#0E1524] px-20 py-14 text-center">
          <CornerBrackets tone="gold" size="md" />
          <Trophy className="mx-auto h-16 w-16 text-[#F5B921]/70" />
          <h1 className="mt-5 font-display text-6xl tracking-wide text-[#E8ECF4]">
            Leaderboard not available yet
          </h1>
          <p className="mt-3 font-sans text-2xl text-[#8B95AA]">
            Standings will appear once squads and evaluations are finalized.
          </p>
          <div className="mt-8">
            <Button variant="cyan" size="lg" onClick={() => void loadLeaderboard()}>
              <RefreshCw className="h-5 w-5" />
              <span>Retry</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const winner = rows[0] ?? null;
  const nonWinnersAsc = rows.slice(1); // positions 2..N
  // Reveal order: last place first -> position 2 last
  const revealedStartIdx = Math.max(0, nonWinnersAsc.length - revealedCount);
  const revealedPositions = new Set(
    nonWinnersAsc.slice(revealedStartIdx).map((r) => r.pos),
  );

  const winnerPalette = winner
    ? getTeamPalette(winner.short_code)
    : { primary: '#F5B921', secondary: '#22D3EE' };

  return (
    <div className="relative flex flex-1 min-h-0 flex-col bg-[#070B14] broadcast-grid px-14 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <p className="font-mono text-base uppercase tracking-[0.18em] text-[#22D3EE]">
            POST-AUCTION EVALUATION // SCOREBOARD
          </p>
          <h1 className="mt-1 font-display text-[76px] leading-none tracking-wide text-[#F5B921]">
            FINAL STANDINGS
          </h1>
        </div>

        <div
          className={`transition-opacity duration-200 ${
            mouseActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <Button variant="outline" size="md" onClick={handleReplay}>
            <RotateCcw className="h-4 w-4" />
            <span>Replay reveal</span>
          </Button>
        </div>
      </div>

      {/* Rankings Grid (positions 1..N placeholders, populated bottom-to-top) */}
      <div className="grid flex-1 min-h-0 grid-cols-1 gap-3 content-start">
        {rows.map((row) => {
          const isWinnerRow = row.pos === 1;
          const isVisible = isWinnerRow
            ? showWinnerFinale
            : revealedPositions.has(row.pos);
          const palette = getTeamPalette(row.short_code);

          if (!isVisible) {
            return (
              <div
                key={`slot-${row.pos}`}
                className="flex h-[74px] items-center justify-between rounded-[4px] border border-dashed border-white/10 bg-[#0E1524]/35 px-7"
              >
                <span className="font-display text-4xl text-[#8B95AA]/40 tabular-nums">
                  #{row.pos}
                </span>
                <span className="font-mono text-xl uppercase tracking-[0.16em] text-[#8B95AA]/35">
                  AWAITING REVEAL
                </span>
              </div>
            );
          }

          return (
            <motion.div
              key={`${row.team_id}-${replaySeed}`}
              initial={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, x: -44 }
              }
              animate={
                prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }
              }
              transition={{ duration: 0.45, ease: 'easeOut' }}
              style={{
                borderLeftWidth: '8px',
                borderLeftColor: palette.primary,
              }}
              className="flex h-[74px] items-center justify-between rounded-[4px] border border-white/15 bg-[#0E1524] px-7"
            >
              <div className="flex items-center gap-6 min-w-0">
                <span className="w-16 font-display text-5xl leading-none text-[#F5B921] tabular-nums">
                  #{row.pos}
                </span>
                <TeamCrest shortCode={row.short_code} size="md" />
                <div className="min-w-0">
                  <p className="truncate font-display text-4xl leading-none tracking-wide text-[#E8ECF4]">
                    {row.team_name}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-10 shrink-0">
                <span className="font-mono text-[20px] uppercase tracking-[0.08em] text-[#8B95AA] tabular-nums">
                  SQUAD {row.squad}
                </span>
                <div className="min-w-[140px] text-right">
                  <span className="font-mono text-xs uppercase tracking-[0.12em] text-[#22D3EE] mr-3">
                    SCORE
                  </span>
                  <span className="font-display text-5xl leading-none text-[#F5B921]">
                    <AnimatedScore target={row.score} />
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Rank 1 Dramatic Winner Finale Overlay */}
      {showWinnerFinale && winner && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#070B14]/96">
          <ProjectorConfetti
            primaryColor={winnerPalette.primary}
            secondaryColor={winnerPalette.secondary}
            count={44}
          />

          <div
            className={`absolute right-12 top-8 z-20 transition-opacity duration-200 ${
              mouseActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <Button variant="outline" size="md" onClick={handleReplay}>
              <RotateCcw className="h-4 w-4" />
              <span>Replay reveal</span>
            </Button>
          </div>

          <motion.div
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.9 }
            }
            animate={
              prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }
            }
            transition={{ duration: 0.45, ease: 'easeOut' }}
            style={{ borderColor: winnerPalette.secondary }}
            className="relative z-10 w-full max-w-[1160px] rounded-[4px] border-2 bg-[#0E1524] px-16 py-14 text-center shadow-[0_32px_96px_rgba(0,0,0,0.9)]"
          >
            <CornerBrackets tone="gold" size="md" />
            <p className="font-mono text-xl uppercase tracking-[0.24em] text-[#22D3EE]">
              RANK #1 // AUCTION WINNERS
            </p>
            <h2 className="mt-3 font-display text-[116px] leading-none tracking-[0.08em] text-[#F5B921]">
              CHAMPIONS
            </h2>

            <div className="mt-8 flex items-center justify-center gap-6">
              <div className="scale-[1.8] mx-5">
                <TeamCrest shortCode={winner.short_code} size="lg" />
              </div>
              <p className="font-display text-[76px] leading-none tracking-wide text-[#E8ECF4]">
                {winner.team_name}
              </p>
            </div>

            <div className="mt-9 inline-flex items-baseline gap-6 rounded-[4px] border border-[#F5B921]/45 bg-[#070B14] px-12 py-5">
              <span className="font-mono text-2xl uppercase tracking-[0.14em] text-[#8B95AA]">
                FINAL SCORE
              </span>
              <span className="font-display text-[96px] leading-none text-[#F5B921]">
                <AnimatedScore target={winner.score} />
              </span>
              <span className="font-mono text-2xl uppercase tracking-[0.1em] text-[#22D3EE] tabular-nums">
                · {winner.squad} PLAYERS
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
