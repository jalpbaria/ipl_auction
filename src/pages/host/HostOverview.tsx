import { useMemo } from 'react';
import { TeamCrest } from '../../components/host/TeamCrest';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { CornerBrackets } from '../../components/ui/CornerBrackets';
import { PLAYER_SKILLS, type PlayerSkill } from '../../data/categories';
import { formatLakhs } from '../../lib/format';
import { useHostRoom } from '../../store/hostRoom';
import type { TeamStatus } from '../../types/database';

function getTeamStatusChip(status: TeamStatus): {
  label: string;
  tone: 'neutral' | 'cyan' | 'danger';
} {
  if (status === 'active') return { label: 'ACTIVE', tone: 'cyan' };
  if (status === 'removed') return { label: 'REMOVED', tone: 'danger' };
  return { label: 'OPEN SEAT', tone: 'neutral' };
}

export default function HostOverview() {
  const room = useHostRoom((s) => s.room);
  const teams = useHostRoom((s) => s.teams);
  const teamFinances = useHostRoom((s) => s.teamFinances);
  const roomPlayers = useHostRoom((s) => s.roomPlayers);

  const playerStats = useMemo(() => {
    let indian = 0;
    let overseas = 0;
    const bySkill: Record<PlayerSkill, number> = {
      Batter: 0,
      'All-Rounder': 0,
      Wicketkeeper: 0,
      Bowler: 0,
    };
    for (const rp of roomPlayers) {
      const p = rp.players;
      if (!p) continue;
      if (p.is_overseas) {
        overseas += 1;
      } else {
        indian += 1;
      }
      if (p.skill in bySkill) {
        bySkill[p.skill] += 1;
      }
    }
    return { total: roomPlayers.length, indian, overseas, bySkill };
  }, [roomPlayers]);

  const activeTeamsCount = useMemo(
    () => teams.filter((t) => t.status === 'active').length,
    [teams],
  );

  const financeByTeam = useMemo(() => {
    const map = new Map<string, { left: number; spent: number }>();
    for (const f of teamFinances) {
      map.set(f.team_id, {
        left: f.purse_left_lakhs,
        spent: f.spent_lakhs,
      });
    }
    return map;
  }, [teamFinances]);

  const squadCountByTeam = useMemo(() => {
    const map = new Map<string, number>();
    for (const rp of roomPlayers) {
      if (rp.sold_to_team_id) {
        map.set(rp.sold_to_team_id, (map.get(rp.sold_to_team_id) ?? 0) + 1);
      }
    }
    return map;
  }, [roomPlayers]);

  if (!room) return null;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="border-b border-white/[0.08] pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#22D3EE]">
          HOST OVERVIEW // ROOM TELEMETRY
        </p>
        <h1 className="mt-1.5 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
          COMMAND OVERVIEW
        </h1>
      </div>

      {/* 4 Broadcast Stat Panels */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card brackets bracketTone="cyan" className="p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B95AA]">
            REGISTERED PLAYERS
          </p>
          <p className="mt-2 font-display text-4xl tracking-wide text-[#E8ECF4] tabular-nums">
            {playerStats.total}
          </p>
          <p className="mt-2 font-mono text-[11px] text-[#22D3EE] tabular-nums">
            {playerStats.indian} Indian · {playerStats.overseas} Overseas
          </p>
          <div className="mt-3 space-y-1 border-t border-white/[0.08] pt-2.5">
            {PLAYER_SKILLS.map((role) => (
              <div
                key={role.value}
                className="flex items-center justify-between font-mono text-[11px] text-[#8B95AA] tabular-nums"
              >
                <span>{role.pluralLabel}</span>
                <span className="text-[#E8ECF4]">{playerStats.bySkill[role.value]}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card brackets bracketTone="gold" className="p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B95AA]">
            TEAMS JOINED
          </p>
          <p className="mt-2 font-display text-4xl tracking-wide text-[#F5B921] tabular-nums">
            {activeTeamsCount} / 10
          </p>
          <p className="mt-2 font-mono text-[11px] text-[#8B95AA] tabular-nums">
            {10 - activeTeamsCount} Open or removed seats
          </p>
        </Card>

        <Card
          brackets
          bracketTone={room.auction_open ? 'cyan' : 'gold'}
          className="p-5"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B95AA]">
            AUCTION ROOM
          </p>
          <p
            className={`mt-2 font-display text-4xl tracking-wide ${
              room.auction_open ? 'text-emerald-400' : 'text-[#F5B921]'
            }`}
          >
            {room.auction_open ? 'OPEN' : 'LOCKED'}
          </p>
          <p className="mt-2 font-mono text-[11px] text-[#8B95AA]">
            {room.auction_open
              ? 'Participants can enter console'
              : 'Waiting for host unlock'}
          </p>
        </Card>

        <Card brackets bracketTone="subtle" className="p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B95AA]">
            SQUAD LIMITS
          </p>
          <p className="mt-2 font-display text-4xl tracking-wide text-[#E8ECF4] tabular-nums">
            {room.squad_max} MAX
          </p>
          <p className="mt-2 font-mono text-[11px] text-[#8B95AA] tabular-nums">
            Max {room.overseas_max} overseas, min squad {room.squad_min}
          </p>
        </Card>
      </div>

      {/* 10 Franchise Tables Main Panel */}
      <Card brackets bracketTone="gold" className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#F5B921]">
              LIVE FRANCHISE STANDINGS
            </p>
            <h2 className="mt-1 font-display text-3xl tracking-wide text-[#E8ECF4]">
              10 FRANCHISE TABLES
            </h2>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#8B95AA] tabular-nums">
            STARTING PURSE {formatLakhs(room.starting_purse_lakhs)}
          </span>
        </div>

        {teams.length === 0 ? (
          <p className="py-10 text-center font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
            NO FRANCHISE TABLES PROVISIONED FOR THIS ROOM
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
            {teams.map((team) => {
              const chip = getTeamStatusChip(team.status);
              const finance = financeByTeam.get(team.id) ?? {
                left: room.starting_purse_lakhs,
                spent: 0,
              };
              const squadCount = squadCountByTeam.get(team.id) ?? 0;
              const purseRatio =
                room.starting_purse_lakhs > 0
                  ? Math.min(
                      100,
                      Math.max(0, (finance.left / room.starting_purse_lakhs) * 100),
                    )
                  : 0;

              return (
                <div
                  key={team.id}
                  className="relative flex flex-col justify-between rounded-[4px] border border-white/[0.08] bg-[#070B14] p-4"
                >
                  <CornerBrackets
                    tone={team.status === 'active' ? 'cyan' : 'subtle'}
                    size="sm"
                  />

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <TeamCrest shortCode={team.short_code} size="sm" />
                        <span className="font-mono text-xs font-bold text-[#E8ECF4]">
                          {team.short_code}
                        </span>
                      </div>
                      <Badge tone={chip.tone}>{chip.label}</Badge>
                    </div>

                    <p className="mt-2.5 truncate text-xs font-medium text-[#E8ECF4]" title={team.name}>
                      {team.name}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.06em] text-[#8B95AA]">
                      {team.leader_name ? team.leader_name : 'Unclaimed seat'}
                    </p>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-[10px] uppercase text-[#8B95AA]">
                        Purse left
                      </span>
                      <span className="font-mono font-semibold text-[#F5B921] tabular-nums">
                        {formatLakhs(finance.left)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-[10px] uppercase text-[#8B95AA]">
                        Spent
                      </span>
                      <span className="font-mono text-[#E8ECF4] tabular-nums">
                        {formatLakhs(finance.spent)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-[10px] uppercase text-[#8B95AA]">
                        Squad
                      </span>
                      <span className="font-mono text-[#22D3EE] tabular-nums">
                        {squadCount}/{room.squad_max}
                      </span>
                    </div>

                    {/* Thin purse bar */}
                    <div className="pt-1">
                      <div className="h-1 w-full overflow-hidden rounded-[1px] bg-[#141C2F]">
                        <div
                          className="h-full bg-gradient-to-r from-[#22D3EE] to-[#F5B921] transition-all duration-300"
                          style={{ width: `${purseRatio}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
