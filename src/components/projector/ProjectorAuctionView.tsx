import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getCategoryInfo } from '../../data/categories';
import {
  getSetCategoryInfo,
  nextBid,
  remainingMs,
  type SetOverviewItem,
  type SetProgress,
} from '../../lib/auction';
import { formatLakhs } from '../../lib/format';
import { formatDateTime12h } from '../../lib/time';
import type {
  AccelProgress,
  AccelStatus,
  DbAuctionState,
  DbBid,
  DbNotice,
  DbRoom,
  DbTeam,
  RoomPlayerWithPlayer,
} from '../../types/database';
import { Countdown } from '../auction/Countdown';
import { PlayerCard } from '../auction/PlayerCard';
import { getTeamPalette, TeamCrest } from '../host/TeamCrest';
import { CornerBrackets } from '../ui/CornerBrackets';
import { ProjectorConfetti } from './ProjectorConfetti';

interface ProjectorAuctionViewProps {
  room: DbRoom;
  state: DbAuctionState | null;
  lot: RoomPlayerWithPlayer | null;
  teams: DbTeam[];
  lotBids: DbBid[];
  roomPlayers: RoomPlayerWithPlayer[];
  latestNotice: DbNotice | null;
  offsetMs: number;
  setProgress: SetProgress | null;
  setsOverview: SetOverviewItem[];
  accelStatus?: AccelStatus;
  accelProgress?: AccelProgress | null;
}

function formatCountdownToIso(targetIso: string | null | undefined, nowMs: number): string | null {
  if (!targetIso) return null;
  const targetMs = Date.parse(targetIso);
  if (Number.isNaN(targetMs)) return null;
  const diffSec = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  if (diffSec === 0) return '00:00';
  const hours = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function ProjectorAuctionView({
  room,
  state,
  lot,
  teams,
  lotBids,
  roomPlayers,
  latestNotice,
  offsetMs,
  setProgress,
  setsOverview,
  accelStatus = 'off',
  accelProgress = null,
}: ProjectorAuctionViewProps) {
  const prefersReducedMotion = useReducedMotion();
  const phase = state?.phase ?? 'idle';

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [soldOverlayActive, setSoldOverlayActive] = useState(false);
  const [unsoldOverlayActive, setUnsoldOverlayActive] = useState(false);
  const [completedBannerSet, setCompletedBannerSet] = useState<{
    setNo: number;
    label: string;
  } | null>(null);

  const prevSetRef = useRef<{
    setNo: number;
    remaining: number;
    label: string;
  } | null>(null);
  const completedTimerRef = useRef<number | null>(null);

  // Show "SET <n> COMPLETE" for 4 seconds when a set finishes or transitions after completion
  useEffect(() => {
    if (!setProgress) return;
    const prev = prevSetRef.current;

    if (prev) {
      const finishedSameSet =
        prev.setNo === setProgress.setNo &&
        prev.remaining > 0 &&
        setProgress.remaining === 0 &&
        setProgress.total > 0;
      const movedFromCompletedSet =
        prev.setNo !== setProgress.setNo &&
        (prev.remaining === 0 ||
          setsOverview.find((s) => s.setNo === prev.setNo)?.remaining === 0);

      if (finishedSameSet || movedFromCompletedSet) {
        if (completedTimerRef.current !== null) {
          window.clearTimeout(completedTimerRef.current);
        }
        setCompletedBannerSet({ setNo: prev.setNo, label: prev.label });
        completedTimerRef.current = window.setTimeout(() => {
          completedTimerRef.current = null;
          setCompletedBannerSet(null);
        }, 4_000);
      }
    }

    prevSetRef.current = {
      setNo: setProgress.setNo,
      remaining: setProgress.remaining,
      label: setProgress.setLabel,
    };
  }, [setProgress, setsOverview]);

  useEffect(() => {
    return () => {
      if (completedTimerRef.current !== null) {
        window.clearTimeout(completedTimerRef.current);
      }
    };
  }, []);

  // Live 1s ticker for locked countdown
  useEffect(() => {
    if (room.auction_open) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [room.auction_open]);

  // Trigger 6s full-screen SOLD overlay, then shrink to persistent banner
  useEffect(() => {
    if (phase !== 'sold' || !lot) {
      setSoldOverlayActive(false);
      return;
    }

    setSoldOverlayActive(true);
    const timer = window.setTimeout(() => {
      setSoldOverlayActive(false);
    }, 6_000);

    return () => window.clearTimeout(timer);
  }, [phase, lot?.id, state?.updated_at]);

  // Trigger 4s UNSOLD overlay
  useEffect(() => {
    if (phase !== 'unsold' || !lot) {
      setUnsoldOverlayActive(false);
      return;
    }

    setUnsoldOverlayActive(true);
    const timer = window.setTimeout(() => {
      setUnsoldOverlayActive(false);
    }, 4_000);

    return () => window.clearTimeout(timer);
  }, [phase, lot?.id, state?.updated_at]);

  const teamMap = useMemo(() => {
    const map = new Map<string, DbTeam>();
    for (const t of teams) map.set(t.id, t);
    return map;
  }, [teams]);

  const squadCountByTeam = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of teams) map.set(t.id, 0);
    for (const rp of roomPlayers) {
      if (rp.status === 'sold' && rp.sold_to_team_id) {
        map.set(rp.sold_to_team_id, (map.get(rp.sold_to_team_id) ?? 0) + 1);
      }
    }
    return map;
  }, [teams, roomPlayers]);

  const currentSetInfo = getSetCategoryInfo(state?.current_set_no ?? 1);

  const leadingTeam = state?.current_bid_team_id
    ? (teamMap.get(state.current_bid_team_id) ?? null)
    : null;

  const soldTeam = lot?.sold_to_team_id
    ? (teamMap.get(lot.sold_to_team_id) ?? leadingTeam)
    : leadingTeam;

  const leadingPalette = leadingTeam
    ? getTeamPalette(leadingTeam.short_code)
    : null;

  const soldPalette = soldTeam
    ? getTeamPalette(soldTeam.short_code)
    : { primary: '#F5B921', secondary: '#22D3EE' };

  const player = lot?.players ?? null;
  const fullName = player
    ? `${player.first_name} ${player.last_name}`.trim()
    : '';
  const categoryInfo = getCategoryInfo(player?.category);

  const hasBid = Boolean(state?.current_bid_team_id);
  const currentBidAmount = hasBid
    ? (state?.current_bid_lakhs ?? lot?.base_price_lakhs ?? 0)
    : (lot?.base_price_lakhs ?? 0);
  const nextAmount = lot ? nextBid(state, lot.base_price_lakhs) : 0;
  const nextDelta = hasBid ? Math.max(0, nextAmount - currentBidAmount) : 0;

  const frozenMs = phase === 'paused' ? remainingMs(state, offsetMs) : null;
  const frozenSec =
    frozenMs !== null ? Math.max(0, Math.ceil(frozenMs / 1000)) : 0;

  const recentDeliveries = lotBids.slice(0, 6);
  const opensCountdown = formatCountdownToIso(latestNotice?.opens_at, nowMs);

  const cardGlowColor = leadingPalette ? leadingPalette.primary : '#22D3EE';

  // Bottom 10 Franchise Crests Strip (never displays purse)
  const bottomStrip = (
    <div className="shrink-0 grid grid-cols-10 gap-3 border-t border-white/10 bg-[#0E1524] px-8 py-3.5">
      {teams.map((team) => {
        const count = squadCountByTeam.get(team.id) ?? 0;
        const isLeading =
          (phase === 'bidding' || phase === 'paused') &&
          state?.current_bid_team_id === team.id;
        const isSoldWinner = phase === 'sold' && soldTeam?.id === team.id;
        const isDimmed = team.status !== 'active';
        const palette = getTeamPalette(team.short_code);

        return (
          <div
            key={team.id}
            style={
              isLeading || isSoldWinner
                ? {
                    borderColor: palette.secondary,
                    boxShadow: `0 0 20px ${palette.primary}55`,
                  }
                : undefined
            }
            className={`flex items-center justify-between gap-2 rounded-[4px] border px-3 py-2 transition-colors ${
              isLeading || isSoldWinner
                ? 'bg-[#141C2F]'
                : 'border-white/10 bg-[#070B14]'
            } ${isDimmed ? 'opacity-35' : ''}`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamCrest shortCode={team.short_code} size="md" />
              <span className="truncate font-mono text-xl font-bold text-[#E8ECF4]">
                {team.short_code}
              </span>
            </div>
            <span className="font-mono text-xl font-bold text-[#22D3EE] tabular-nums">
              {count}/{room.squad_max}
            </span>
          </div>
        );
      })}
    </div>
  );

  // Room Locked View ("AUCTION STARTING SOON")
  if (!room.auction_open) {
    return (
      <div className="relative flex flex-1 min-h-0 flex-col justify-between bg-[#070B14] broadcast-grid">
        <div className="flex flex-1 items-center justify-center px-16 py-10">
          <div className="relative w-full max-w-[1280px] rounded-[4px] border border-[#F5B921]/45 bg-[#0E1524] p-14 text-center">
            <CornerBrackets tone="gold" size="md" />
            <p className="font-mono text-base uppercase tracking-[0.22em] text-[#22D3EE]">
              STADIUM BROADCAST FEED // STANDBY
            </p>
            <h1 className="mt-4 font-display text-[108px] leading-none tracking-[0.05em] text-[#F5B921]">
              AUCTION STARTING SOON
            </h1>

            {latestNotice ? (
              <div className="mx-auto mt-8 max-w-[960px] rounded-[4px] border border-white/15 bg-[#070B14] p-8">
                <p className="font-sans text-[32px] font-medium leading-snug text-[#E8ECF4]">
                  {latestNotice.message}
                </p>

                {latestNotice.opens_at && (
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-6 border-t border-white/10 pt-6">
                    <div>
                      <p className="font-mono text-sm uppercase tracking-[0.16em] text-[#8B95AA]">
                        SCHEDULED START
                      </p>
                      <p className="mt-1 font-mono text-[26px] font-semibold text-[#E8ECF4] tabular-nums">
                        {formatDateTime12h(latestNotice.opens_at)}
                      </p>
                    </div>
                    {opensCountdown && (
                      <div className="rounded-[4px] border border-[#22D3EE]/50 bg-[#0E1524] px-7 py-3">
                        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#22D3EE]">
                          COUNTDOWN
                        </p>
                        <p className="font-display text-6xl leading-none text-[#F5B921] tabular-nums">
                          {opensCountdown}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-8 font-sans text-[28px] text-[#8B95AA]">
                Franchises are taking their seats. Live auction begins shortly.
              </p>
            )}
          </div>
        </div>
        {bottomStrip}
      </div>
    );
  }

  // IDLE with Auction Open -> Accelerated Round OR Large "NEXT UP" set panel + 8-set timeline strip
  if (phase === 'idle' || !lot || !player) {
    if (accelStatus === 'live') {
      const accelTotal = accelProgress?.queue_total ?? 0;
      const accelRemaining = accelProgress?.queue_remaining ?? 0;
      const accelDone = Math.max(0, accelTotal - accelRemaining);
      const accelPct =
        accelTotal > 0
          ? Math.min(100, Math.round((accelDone / accelTotal) * 100))
          : 0;

      return (
        <div className="relative flex flex-1 min-h-0 flex-col justify-between bg-[#070B14] broadcast-grid">
          <div className="flex flex-1 flex-col justify-between px-14 py-9">
            <div className="flex items-end justify-between border-b border-white/10 pb-5">
              <div>
                <p className="font-mono text-lg uppercase tracking-[0.2em] text-red-400">
                  SECOND CHANCE AUCTION // NOMINATED POOL
                </p>
                <h1 className="mt-1 font-display text-[84px] leading-none tracking-[0.04em] text-[#E8ECF4]">
                  ACCELERATED <span className="text-[#F5B921]">ROUND</span>
                </h1>
              </div>
              <span className="rounded-[4px] border border-red-500/60 bg-red-500/15 px-6 py-2.5 font-mono text-xl font-bold uppercase tracking-[0.12em] text-red-300">
                AWAITING NEXT LOT
              </span>
            </div>

            <div className="my-auto py-4">
              <div className="relative rounded-[4px] border border-red-500/50 bg-[#0E1524] px-12 py-12">
                <CornerBrackets tone="gold" size="md" />

                <div className="flex items-center justify-between gap-8">
                  <div className="min-w-0">
                    <span className="inline-block rounded-[2px] border border-red-500/60 bg-red-500/15 px-4 py-1.5 font-mono text-xl font-bold uppercase tracking-[0.16em] text-red-300">
                      ACCELERATED ROUND
                    </span>

                    <h2 className="mt-5 font-display text-[116px] leading-[0.9] tracking-[0.04em] text-[#E8ECF4] tabular-nums">
                      {accelRemaining}{' '}
                      <span className="text-[#F5B921]">
                        {accelRemaining === 1 ? 'PLAYER' : 'PLAYERS'} LEFT
                      </span>
                    </h2>

                    <p className="mt-4 font-mono text-2xl uppercase tracking-[0.12em] text-[#8B95AA]">
                      THE HOST SELECTS THE ORDER OF REMAINING LOTS
                    </p>
                  </div>

                  <div className="shrink-0 rounded-[4px] border border-white/15 bg-[#070B14] px-10 py-6 text-right">
                    <p className="font-mono text-base uppercase tracking-[0.16em] text-[#8B95AA]">
                      ROUND PROGRESS
                    </p>
                    <p className="mt-2 font-display text-[84px] leading-none text-[#22D3EE] tabular-nums">
                      {accelDone}
                      <span className="text-[52px] text-[#8B95AA]">
                        /{accelTotal}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="mt-10 space-y-2.5">
                  <div className="h-6 w-full overflow-hidden rounded-[2px] border border-white/15 bg-[#070B14]">
                    <div
                      style={{ width: `${accelPct}%` }}
                      className="h-full bg-red-500 transition-all duration-300"
                    />
                  </div>
                  <div className="flex items-center justify-between font-mono text-lg uppercase tracking-[0.12em] text-[#8B95AA] tabular-nums">
                    <span>
                      {accelDone} RESOLVED · {accelRemaining} REMAINING
                    </span>
                    <span className="font-bold text-[#F5B921]">
                      {accelPct}% COMPLETE
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="h-8" />
          </div>
          {bottomStrip}
        </div>
      );
    }

    const activeSetNo = setProgress?.setNo ?? state?.current_set_no ?? 1;
    const activeLabel =
      setProgress?.setLabel ?? currentSetInfo?.label ?? `Set ${activeSetNo}`;
    const currentTotal = setProgress?.total ?? 0;
    const currentRemaining = setProgress?.remaining ?? 0;
    const currentDone = setProgress?.done ?? 0;
    const currentPct =
      currentTotal > 0
        ? Math.min(100, Math.round((currentDone / currentTotal) * 100))
        : 0;

    const allSetsDone =
      setsOverview.length > 0 && setsOverview.every((s) => s.remaining === 0);
    const currentSetComplete = currentTotal > 0 && currentRemaining === 0;
    const nextSet =
      setsOverview.find((s) => s.setNo === activeSetNo + 1) ?? null;

    return (
      <div className="relative flex flex-1 min-h-0 flex-col justify-between bg-[#070B14] broadcast-grid">
        <div className="flex flex-1 flex-col justify-between px-14 py-9">
          {/* Header Row */}
          <div className="flex items-end justify-between border-b border-white/10 pb-5">
            <div>
              <p className="font-mono text-lg uppercase tracking-[0.2em] text-[#22D3EE]">
                {completedBannerSet
                  ? `SET ${completedBannerSet.setNo} // COMPLETED`
                  : allSetsDone
                    ? 'ALL 8 SETS // CONCLUDED'
                    : `SET ${activeSetNo} OF 8 // PLAYER POOL`}
              </p>
              <h1 className="mt-1 font-display text-[84px] leading-none tracking-[0.04em] text-[#E8ECF4]">
                {completedBannerSet ? (
                  <>
                    SET {completedBannerSet.setNo}{' '}
                    <span className="text-[#F5B921]">COMPLETE</span>
                  </>
                ) : allSetsDone ? (
                  <>
                    AUCTION <span className="text-[#F5B921]">COMPLETE</span>
                  </>
                ) : (
                  <>
                    NEXT <span className="text-[#F5B921]">UP</span>
                  </>
                )}
              </h1>
            </div>
            <span className="rounded-[4px] border border-[#F5B921]/40 bg-[#0E1524] px-6 py-2.5 font-mono text-xl uppercase tracking-[0.12em] text-[#F5B921]">
              {completedBannerSet
                ? 'ADVANCING TO NEXT SET'
                : allSetsDone
                  ? 'ALL LOTS RESOLVED'
                  : 'AWAITING AUCTIONEER GAVEL'}
            </span>
          </div>

          {/* Center Feature Card */}
          <div className="my-auto py-4">
            {completedBannerSet ? (
              <div className="relative rounded-[4px] border-2 border-[#F5B921] bg-[#0E1524] px-14 py-12 text-center">
                <CornerBrackets tone="gold" size="md" />
                <div className="mx-auto inline-flex items-center gap-3 rounded-[4px] border border-emerald-400/50 bg-emerald-500/15 px-6 py-2 font-mono text-xl font-bold uppercase tracking-[0.16em] text-emerald-300">
                  <Check className="h-6 w-6" />
                  <span>SET {completedBannerSet.setNo} COMPLETE</span>
                </div>
                <h2 className="mt-6 font-display text-[112px] leading-none tracking-[0.05em] text-[#E8ECF4]">
                  {completedBannerSet.label.toUpperCase()}
                </h2>
                <p className="mt-4 font-mono text-2xl uppercase tracking-[0.14em] text-[#8B95AA]">
                  ALL LOTS IN THIS SET HAVE BEEN RESOLVED
                </p>
              </div>
            ) : (
              <div className="relative rounded-[4px] border border-[#22D3EE]/45 bg-[#0E1524] px-12 py-10">
                <CornerBrackets tone="gold" size="md" />

                <div className="flex items-center justify-between gap-8">
                  <div className="min-w-0">
                    <div className="flex items-center gap-4">
                      <span className="rounded-[2px] border border-[#22D3EE]/50 bg-[#070B14] px-4 py-1.5 font-mono text-xl font-bold uppercase tracking-[0.16em] text-[#22D3EE]">
                        SET {activeSetNo}
                      </span>
                      {currentSetComplete && !allSetsDone && (
                        <span className="rounded-[2px] border border-[#F5B921]/50 bg-[#F5B921]/15 px-4 py-1.5 font-mono text-xl font-bold uppercase tracking-[0.14em] text-[#F5B921]">
                          SET COMPLETE
                        </span>
                      )}
                    </div>

                    <h2 className="mt-4 font-display text-[116px] leading-[0.9] tracking-[0.04em] text-[#E8ECF4]">
                      {allSetsDone
                        ? 'AUCTION COMPLETE'
                        : activeLabel.toUpperCase()}
                    </h2>

                    <p className="mt-4 font-mono text-3xl font-bold uppercase tracking-[0.1em] text-[#F5B921] tabular-nums">
                      {allSetsDone
                        ? 'ALL PLAYER SETS CONCLUDED'
                        : currentSetComplete
                          ? nextSet
                            ? `SET ${activeSetNo} COMPLETE · NEXT UP: SET ${nextSet.setNo} ${nextSet.label.toUpperCase()}`
                            : 'FINAL SET COMPLETE'
                          : `${currentRemaining} ${currentRemaining === 1 ? 'PLAYER' : 'PLAYERS'} LEFT`}
                    </p>
                  </div>

                  <div className="shrink-0 rounded-[4px] border border-white/15 bg-[#070B14] px-10 py-6 text-right">
                    <p className="font-mono text-base uppercase tracking-[0.16em] text-[#8B95AA]">
                      SET PROGRESS
                    </p>
                    <p className="mt-2 font-display text-[84px] leading-none text-[#22D3EE] tabular-nums">
                      {currentDone}
                      <span className="text-[52px] text-[#8B95AA]">
                        /{currentTotal}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Big Progress Bar */}
                <div className="mt-8 space-y-2.5">
                  <div className="h-5 w-full overflow-hidden rounded-[2px] border border-white/15 bg-[#070B14]">
                    <div
                      style={{ width: `${currentPct}%` }}
                      className="h-full bg-[#22D3EE] transition-all duration-300"
                    />
                  </div>
                  <div className="flex items-center justify-between font-mono text-lg uppercase tracking-[0.12em] text-[#8B95AA] tabular-nums">
                    <span>
                      {currentDone} RESOLVED · {currentRemaining} REMAINING
                    </span>
                    <span className="text-[#F5B921] font-bold">
                      {currentPct}% COMPLETE
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 8-Set Timeline Strip */}
          <div className="space-y-3">
            <div className="flex items-center justify-between font-mono text-base uppercase tracking-[0.16em] text-[#8B95AA]">
              <span>8-SET AUCTION TIMELINE</span>
              <span>
                {activeSetNo >= 8
                  ? 'FINAL SET'
                  : nextSet
                    ? `FOLLOWING SET: SET ${nextSet.setNo} · ${nextSet.label.toUpperCase()} (${nextSet.total})`
                    : ''}
              </span>
            </div>

            <div className="grid grid-cols-8 gap-3">
              {setsOverview.map((s) => {
                const isDone = s.total > 0 && s.remaining === 0;
                const isActive = !allSetsDone && s.setNo === activeSetNo;
                const pct =
                  s.total > 0
                    ? Math.min(100, Math.round((s.done / s.total) * 100))
                    : 0;

                return (
                  <div
                    key={s.setNo}
                    className={`rounded-[4px] border px-4 py-3 transition-colors ${
                      isActive
                        ? 'border-[#F5B921] bg-[#141C2F]'
                        : isDone
                          ? 'border-white/10 bg-[#0E1524]/70 opacity-60'
                          : 'border-white/10 bg-[#0E1524]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-mono text-sm font-bold uppercase tracking-[0.1em] ${
                          isActive
                            ? 'text-[#F5B921]'
                            : isDone
                              ? 'text-emerald-400'
                              : 'text-[#8B95AA]'
                        }`}
                      >
                        SET {s.setNo}
                      </span>
                      {isDone ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <span className="font-mono text-sm text-[#8B95AA] tabular-nums">
                          {s.done}/{s.total}
                        </span>
                      )}
                    </div>

                    <p className="mt-1.5 truncate font-display text-2xl tracking-wide text-[#E8ECF4]">
                      {s.label.toUpperCase()}
                    </p>

                    <div className="mt-2 h-2 w-full overflow-hidden rounded-[2px] border border-white/[0.08] bg-[#070B14]">
                      <div
                        style={{
                          width: `${pct}%`,
                          backgroundColor: isActive
                            ? '#F5B921'
                            : isDone
                              ? '#34D399'
                              : '#22D3EE',
                        }}
                        className="h-full transition-all duration-300"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {bottomStrip}
      </div>
    );
  }

  // ACTIVE / RESOLVED LOT DISPLAY
  return (
    <div className="relative flex flex-1 min-h-0 flex-col justify-between bg-[#070B14]">
      {/* Persistent Gold SOLD Banner after the 6s full-screen overlay finishes */}
      {phase === 'sold' && !soldOverlayActive && (
        <div
          style={{
            borderColor: soldPalette.secondary,
            backgroundColor: '#141C2F',
          }}
          className="shrink-0 flex items-center justify-between border-b-2 px-10 py-3"
        >
          <div className="flex items-center gap-4">
            <span className="rounded-[2px] bg-[#F5B921] px-4 py-1 font-display text-3xl tracking-wider text-[#070B14]">
              SOLD
            </span>
            {soldTeam && <TeamCrest shortCode={soldTeam.short_code} size="md" />}
            <p className="font-display text-4xl tracking-wide text-[#E8ECF4]">
              {fullName}{' '}
              <span className="text-[#8B95AA]">TO</span>{' '}
              <span style={{ color: '#F5B921' }}>
                {soldTeam?.name || 'FRANCHISE'}
              </span>
            </p>
          </div>
          <p className="font-display text-5xl text-[#F5B921] tabular-nums">
            {formatLakhs(lot.sold_price_lakhs ?? state?.current_bid_lakhs ?? 0)}
          </p>
        </div>
      )}

      {/* Main 2-Column Stage */}
      <div className="flex flex-1 min-h-0 gap-7 px-8 py-6">
        {/* LEFT PANEL (~40%) */}
        <div className="relative flex w-[41%] shrink-0 flex-col justify-between rounded-[4px] border border-white/15 bg-[#0E1524] p-7">
          <CornerBrackets tone="gold" size="md" />

          {/* Top chips + Name */}
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-[2px] border border-[#22D3EE]/50 bg-[#22D3EE]/15 px-3 py-1 font-mono text-sm font-bold uppercase tracking-[0.14em] text-[#22D3EE]">
                AT THE CREASE
              </span>
              {player.player_code && (
                <span className="rounded-[2px] border border-white/15 bg-[#070B14] px-3 py-1 font-mono text-sm font-semibold uppercase tracking-[0.12em] text-[#E8ECF4]">
                  {player.player_code}
                </span>
              )}
              {categoryInfo && (
                <span
                  className={`rounded-[2px] border px-3 py-1 font-mono text-sm uppercase tracking-[0.1em] ${categoryInfo.chipClass}`}
                >
                  {categoryInfo.label}
                </span>
              )}
              {player.is_overseas && (
                <span className="rounded-[2px] border border-[#F5B921]/45 bg-[#F5B921]/10 px-3 py-1 font-mono text-sm font-semibold uppercase tracking-[0.1em] text-[#F5B921]">
                  OVERSEAS
                </span>
              )}
            </div>

            <p className="mt-4 font-mono text-[22px] font-semibold uppercase tracking-[0.1em] text-[#8B95AA]">
              {player.skill} - {player.nationality}
            </p>

            <div className="mt-2">
              <p className="truncate font-display text-[68px] leading-[0.88] tracking-wide text-[#E8ECF4]">
                {player.first_name}
              </p>
              <p className="truncate font-display text-[76px] leading-[0.9] tracking-wide text-[#F5B921]">
                {player.last_name || '\u00A0'}
              </p>
            </div>
          </div>

          {/* Player Card centered with dynamic team glow */}
          <div className="my-auto flex items-center justify-center py-2">
            <div
              className="rounded-[6px] transition-shadow duration-300"
              style={{
                boxShadow: `0 0 46px ${cardGlowColor}55, 0 0 18px ${cardGlowColor}40`,
              }}
            >
              <PlayerCard
                player={player}
                size="lg"
                basePriceLakhs={lot.base_price_lakhs}
                className="w-[290px]"
              />
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-3 border-t border-white/10 pt-4">
            <div className="rounded-[4px] border border-white/10 bg-[#070B14] px-3 py-2.5 text-center">
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#8B95AA]">
                MATCHES
              </p>
              <p className="mt-1 font-display text-4xl leading-none text-[#E8ECF4] tabular-nums">
                {player.matches}
              </p>
            </div>
            <div className="rounded-[4px] border border-white/10 bg-[#070B14] px-3 py-2.5 text-center">
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#8B95AA]">
                RUNS
              </p>
              <p className="mt-1 font-display text-4xl leading-none text-[#E8ECF4] tabular-nums">
                {player.runs}
              </p>
            </div>
            <div className="rounded-[4px] border border-white/10 bg-[#070B14] px-3 py-2.5 text-center">
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#8B95AA]">
                WICKETS
              </p>
              <p className="mt-1 font-display text-4xl leading-none text-[#E8ECF4] tabular-nums">
                {player.wickets}
              </p>
            </div>
            <div className="rounded-[4px] border border-[#F5B921]/35 bg-[#070B14] px-3 py-2.5 text-center">
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#F5B921]">
                BASE PRICE
              </p>
              <p className="mt-1 font-display text-3xl leading-none text-[#F5B921] tabular-nums">
                {formatLakhs(lot.base_price_lakhs)}
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL (~59%) */}
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-5">
          {/* Top Section: Current Highest Bid + Countdown */}
          <div className="relative flex items-center justify-between gap-6 rounded-[4px] border border-white/15 bg-[#0E1524] px-8 py-7">
            <CornerBrackets tone="cyan" size="md" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-base uppercase tracking-[0.16em] text-[#8B95AA]">
                CURRENT HIGHEST BID
              </p>

              <motion.div
                key={`${lot.id}-${state?.bid_seq ?? 0}-${currentBidAmount}-${hasBid}`}
                initial={
                  prefersReducedMotion ? { opacity: 0.6 } : { scale: 1.07, opacity: 0.85 }
                }
                animate={
                  prefersReducedMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }
                }
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="mt-2 origin-left"
              >
                {hasBid ? (
                  <p className="font-display text-[112px] leading-[0.88] tracking-wide text-[#F5B921] tabular-nums">
                    {formatLakhs(currentBidAmount)}
                  </p>
                ) : (
                  <p className="font-display text-[84px] leading-[0.92] tracking-wide text-[#E8ECF4] tabular-nums">
                    {formatLakhs(lot.base_price_lakhs)}{' '}
                    <span className="text-[42px] text-[#8B95AA]">OPENING</span>
                  </p>
                )}
              </motion.div>

              <div className="mt-4 inline-flex items-center rounded-[4px] border border-[#22D3EE]/45 bg-[#070B14] px-4 py-2">
                <span className="font-mono text-[22px] font-semibold uppercase tracking-[0.08em] text-[#22D3EE] tabular-nums">
                  NEXT STRIKE: {formatLakhs(nextAmount)} (+{formatLakhs(nextDelta)})
                </span>
              </div>
            </div>

            <div className="shrink-0">
              <Countdown
                state={state}
                totalSeconds={room.bid_timer_seconds}
                offsetMs={offsetMs}
                size="xl"
              />
            </div>
          </div>

          {/* Middle Section: Leading Franchise */}
          <div
            style={
              leadingPalette
                ? {
                    borderColor: leadingPalette.secondary,
                    borderLeftWidth: '6px',
                    borderLeftColor: leadingPalette.primary,
                  }
                : undefined
            }
            className="rounded-[4px] border border-white/15 bg-[#0E1524] px-8 py-6"
          >
            <p className="font-mono text-sm uppercase tracking-[0.16em] text-[#22D3EE]">
              LEADING FRANCHISE - AT THE CREASE
            </p>
            {leadingTeam ? (
              <div className="mt-3 flex items-center gap-5">
                <div className="scale-125 origin-left mr-2">
                  <TeamCrest shortCode={leadingTeam.short_code} size="lg" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-[60px] leading-none tracking-wide text-[#E8ECF4]">
                    {leadingTeam.name}
                  </p>
                  <p className="mt-1 font-mono text-xl uppercase tracking-[0.12em] text-[#F5B921]">
                    {leadingTeam.short_code} · HOLDING TOP PADDLE
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-4 font-sans text-[28px] italic text-[#8B95AA]">
                No bids yet. Opening base strike {formatLakhs(lot.base_price_lakhs)}
              </p>
            )}
          </div>

          {/* Bottom Section: Bid Over Tracker */}
          <div className="rounded-[4px] border border-white/15 bg-[#0E1524] px-8 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#8B95AA]">
                  BID OVER TRACKER
                </p>
                <p className="font-display text-3xl tracking-wide text-[#E8ECF4]">
                  LAST 6 DELIVERIES
                </p>
              </div>
              <span className="rounded-[4px] border border-[#F5B921]/40 bg-[#070B14] px-4 py-1.5 font-mono text-xl font-bold uppercase tracking-[0.1em] text-[#F5B921] tabular-nums">
                {lotBids.length} CALLS IN INNINGS
              </span>
            </div>

            <div className="mt-4 grid grid-cols-6 gap-3">
              {Array.from({ length: 6 }, (_, ballIdx) => {
                const bid = recentDeliveries[ballIdx];
                const bTeam = bid ? teamMap.get(bid.team_id) : null;
                const palette = bTeam ? getTeamPalette(bTeam.short_code) : null;
                const isLatestBall = ballIdx === 0 && Boolean(bid);

                return (
                  <div
                    key={bid ? bid.id : `dot-${ballIdx}`}
                    style={
                      palette && isLatestBall
                        ? {
                            borderColor: palette.secondary,
                            backgroundColor: '#141C2F',
                          }
                        : undefined
                    }
                    className={`flex flex-col items-center justify-center rounded-[4px] border py-3 text-center ${
                      bid
                        ? 'border-white/20 bg-[#070B14]'
                        : 'border-white/[0.07] bg-[#070B14]/60'
                    }`}
                  >
                    {bid && bTeam ? (
                      <>
                        <span className="font-mono text-xl font-bold text-[#E8ECF4]">
                          {bTeam.short_code}
                        </span>
                        <span className="mt-1 font-mono text-xl font-bold text-[#F5B921] tabular-nums">
                          {formatLakhs(bid.amount_lakhs)}
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-xl uppercase tracking-[0.14em] text-[#8B95AA]/50">
                        DOT
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {bottomStrip}

      {/* FULL-SCREEN SOLD OVERLAY (6 SECONDS) */}
      {phase === 'sold' && soldOverlayActive && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#070B14]/95">
          <ProjectorConfetti
            primaryColor={soldPalette.primary}
            secondaryColor={soldPalette.secondary}
            count={42}
          />
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            style={{ borderColor: soldPalette.secondary }}
            className="relative z-10 w-full max-w-[1160px] rounded-[4px] border-2 bg-[#0E1524] px-16 py-14 text-center shadow-[0_32px_96px_rgba(0,0,0,0.85)]"
          >
            <CornerBrackets tone="gold" size="md" />

            <motion.div
              initial={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { rotate: -14, scale: 1.35, opacity: 0 }
              }
              animate={
                prefersReducedMotion
                  ? { opacity: 1 }
                  : { rotate: -4, scale: 1, opacity: 1 }
              }
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="mx-auto inline-block rounded-[4px] border-4 border-[#F5B921] bg-[#F5B921] px-10 py-2"
            >
              <span className="font-display text-[92px] leading-none tracking-[0.1em] text-[#070B14]">
                SOLD
              </span>
            </motion.div>

            <h2 className="mt-7 font-display text-[88px] leading-none tracking-wide text-[#E8ECF4]">
              {fullName}
            </h2>

            <div className="mt-6 flex items-center justify-center gap-5">
              {soldTeam && (
                <div className="scale-125">
                  <TeamCrest shortCode={soldTeam.short_code} size="lg" />
                </div>
              )}
              <p
                className="font-display text-[64px] leading-none tracking-wide"
                style={{
                  color:
                    soldTeam?.short_code.toUpperCase() === 'GT'
                      ? soldPalette.secondary
                      : soldPalette.primary === '#1B2133'
                        ? soldPalette.secondary
                        : soldPalette.primary,
                }}
              >
                TO {soldTeam?.name || 'FRANCHISE'}
              </p>
            </div>

            <p className="mt-7 font-display text-[116px] leading-none tracking-wide text-[#F5B921] tabular-nums">
              {formatLakhs(
                lot.sold_price_lakhs ?? state?.current_bid_lakhs ?? 0,
              )}
            </p>
          </motion.div>
        </div>
      )}

      {/* FULL-SCREEN UNSOLD OVERLAY (4 SECONDS) */}
      {phase === 'unsold' && unsoldOverlayActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-30 flex items-center justify-center bg-[#070B14]/92"
        >
          <div className="relative w-full max-w-[960px] rounded-[4px] border-2 border-red-500 bg-[#0E1524] px-16 py-14 text-center">
            <CornerBrackets tone="gold" size="md" />
            <div className="inline-block rounded-[4px] border-4 border-red-500 bg-red-500/20 px-12 py-3">
              <span className="font-display text-[104px] leading-none tracking-[0.12em] text-red-400">
                UNSOLD
              </span>
            </div>
            <h2 className="mt-7 font-display text-[76px] leading-none tracking-wide text-[#E8ECF4]">
              {fullName}
            </h2>
            <p className="mt-4 font-mono text-[24px] uppercase tracking-[0.14em] text-[#8B95AA]">
              LOT PASSED · {player.skill} · BASE {formatLakhs(lot.base_price_lakhs)}
            </p>
          </div>
        </motion.div>
      )}

      {/* PAUSED OVERLAY */}
      {phase === 'paused' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#070B14]/88">
          <div className="relative rounded-[4px] border-2 border-[#F5B921] bg-[#0E1524] px-20 py-14 text-center">
            <CornerBrackets tone="gold" size="md" />
            <p className="font-mono text-lg uppercase tracking-[0.2em] text-[#22D3EE]">
              CLOCK FROZEN BY AUCTIONEER
            </p>
            <h2 className="mt-3 font-display text-[104px] leading-none tracking-[0.08em] text-[#F5B921]">
              AUCTION PAUSED
            </h2>
            <p className="mt-5 font-display text-[72px] leading-none text-[#E8ECF4] tabular-nums">
              {frozenSec} SECONDS REMAINING
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
