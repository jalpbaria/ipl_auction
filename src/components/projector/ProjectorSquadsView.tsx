import { useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef } from 'react';
import { formatLakhs } from '../../lib/format';
import type { DbRoom, DbTeam, RoomPlayerWithPlayer } from '../../types/database';
import { getTeamPalette, TeamCrest } from '../host/TeamCrest';
import { CornerBrackets } from '../ui/CornerBrackets';

interface ProjectorSquadsViewProps {
  room: DbRoom;
  teams: DbTeam[];
  roomPlayers: RoomPlayerWithPlayer[];
}

function AutoScrollSquadList({
  players,
}: {
  players: RoomPlayerWithPlayer[];
}) {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || prefersReducedMotion) return;

    let rafId = 0;
    let direction = 1;
    let pauseUntil = performance.now() + 1800;
    let lastTime = performance.now();

    const step = (now: number) => {
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 4) {
        el.scrollTop = 0;
        rafId = window.requestAnimationFrame(step);
        return;
      }

      const dt = Math.min(50, now - lastTime);
      lastTime = now;

      if (now >= pauseUntil) {
        el.scrollTop += direction * (dt * 0.022);
        if (direction === 1 && el.scrollTop >= maxScroll - 1) {
          el.scrollTop = maxScroll;
          direction = -1;
          pauseUntil = now + 1800;
        } else if (direction === -1 && el.scrollTop <= 1) {
          el.scrollTop = 0;
          direction = 1;
          pauseUntil = now + 1800;
        }
      }

      rafId = window.requestAnimationFrame(step);
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [players.length, prefersReducedMotion]);

  if (players.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-mono text-lg uppercase tracking-[0.12em] text-[#8B95AA]/70">
          NO SIGNINGS YET
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-hidden pr-1 space-y-1.5"
    >
      {players.map((rp) => {
        const p = rp.players;
        if (!p) return null;
        const name = `${p.first_name} ${p.last_name}`.trim();
        return (
          <div
            key={rp.id}
            className="flex items-center justify-between gap-2 rounded-[2px] border border-white/[0.06] bg-[#070B14] px-2.5 py-1.5"
          >
            <span className="truncate font-sans text-[20px] font-medium text-[#E8ECF4]">
              {name}
            </span>
            <span className="shrink-0 font-mono text-[20px] font-bold text-[#F5B921] tabular-nums">
              {formatLakhs(rp.sold_price_lakhs ?? 0)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ProjectorSquadsView({
  room,
  teams,
  roomPlayers,
}: ProjectorSquadsViewProps) {
  const orderedSquads = useMemo(() => {
    const playersByTeam = new Map<string, RoomPlayerWithPlayer[]>();
    for (const t of teams) playersByTeam.set(t.id, []);

    for (const rp of roomPlayers) {
      if (rp.status === 'sold' && rp.sold_to_team_id) {
        const arr = playersByTeam.get(rp.sold_to_team_id);
        if (arr) arr.push(rp);
      }
    }

    return teams
      .map((team) => {
        const squad = (playersByTeam.get(team.id) ?? []).sort(
          (a, b) => (b.sold_price_lakhs ?? 0) - (a.sold_price_lakhs ?? 0),
        );
        const overseas = squad.filter((rp) => rp.players?.is_overseas).length;
        return {
          team,
          squad,
          overseas,
        };
      })
      .sort((a, b) => {
        if (b.squad.length !== a.squad.length) {
          return b.squad.length - a.squad.length;
        }
        return a.team.name.localeCompare(b.team.name);
      });
  }, [teams, roomPlayers]);

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#070B14] px-8 py-6">
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
        <div>
          <p className="font-mono text-sm uppercase tracking-[0.16em] text-[#22D3EE]">
            FRANCHISE ROSTER BOARD // ORDERED BY SQUAD SIZE
          </p>
          <h1 className="font-display text-5xl leading-none tracking-wide text-[#E8ECF4]">
            TEAM SQUADS
          </h1>
        </div>
        <span className="font-mono text-xl uppercase tracking-[0.1em] text-[#8B95AA] tabular-nums">
          MAX SQUAD {room.squad_max} · MAX OVERSEAS {room.overseas_max}
        </span>
      </div>

      {/* 5x2 Grid */}
      <div className="grid flex-1 min-h-0 grid-cols-5 grid-rows-2 gap-4">
        {orderedSquads.map(({ team, squad, overseas }) => {
          const isOpenSeat = !team.leader_id || team.status === 'open';
          const palette = getTeamPalette(team.short_code);

          return (
            <div
              key={team.id}
              style={{
                borderTopWidth: '3px',
                borderTopColor: palette.primary,
              }}
              className={`relative flex flex-col min-h-0 rounded-[4px] border border-white/15 bg-[#0E1524] p-4 ${
                isOpenSeat ? 'opacity-45' : ''
              }`}
            >
              <CornerBrackets tone={isOpenSeat ? 'subtle' : 'cyan'} size="sm" />

              <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <TeamCrest shortCode={team.short_code} size="md" />
                  <div className="min-w-0">
                    <p className="truncate font-display text-[28px] leading-none tracking-wide text-[#E8ECF4]">
                      {team.name}
                    </p>
                    <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
                      {isOpenSeat ? 'OPEN SEAT' : team.short_code}
                    </p>
                  </div>
                </div>
              </div>

              <div className="my-2.5 flex items-center justify-between font-mono text-[20px] font-bold tabular-nums">
                <span className="text-[#22D3EE]">
                  {squad.length}/{room.squad_max}
                </span>
                <span className="text-[#F5B921]">
                  OS {overseas}/{room.overseas_max}
                </span>
              </div>

              {isOpenSeat ? (
                <div className="flex flex-1 items-center justify-center rounded-[4px] border border-dashed border-white/10 bg-[#070B14]/60">
                  <span className="font-mono text-xl uppercase tracking-[0.16em] text-[#8B95AA]">
                    OPEN SEAT
                  </span>
                </div>
              ) : (
                <AutoScrollSquadList players={squad} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
