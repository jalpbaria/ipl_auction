import { Lock, Minus, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { TeamCrest } from '../../components/host/TeamCrest';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { formatLakhs } from '../../lib/format';
import { useHostRoom } from '../../store/hostRoom';

export default function HostPurseControl() {
  const room = useHostRoom((s) => s.room);
  const teams = useHostRoom((s) => s.teams);
  const teamFinances = useHostRoom((s) => s.teamFinances);

  const financeByTeam = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of teamFinances) {
      map.set(f.team_id, f.purse_left_lakhs);
    }
    return map;
  }, [teamFinances]);

  if (!room) return null;

  return (
    <div className="space-y-6">
      <div className="border-b border-white/[0.08] pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#F5B921]">
          FINANCE OVERRIDE // READ-ONLY
        </p>
        <h1 className="mt-1.5 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
          PURSE CONTROL
        </h1>
      </div>

      {/* Locked Feature Banner */}
      <div
        role="status"
        className="flex items-center gap-3.5 rounded-[4px] border border-[#F5B921]/50 bg-[#F5B921]/10 px-5 py-4"
      >
        <Lock className="h-5 w-5 shrink-0 text-[#F5B921]" aria-hidden="true" />
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#F5B921]">
            LOCKED FEATURE
          </p>
          <p className="mt-0.5 text-sm text-[#E8ECF4]">
            Purse control is a premium feature and is not enabled yet
          </p>
        </div>
      </div>

      {/* Read-only 10 Teams Purse Table */}
      <Card brackets bracketTone="subtle" className="overflow-hidden">
        <div className="divide-y divide-white/[0.06]">
          {teams.map((team) => {
            const currentPurse =
              financeByTeam.get(team.id) ?? room.starting_purse_lakhs;

            return (
              <div
                key={team.id}
                className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TeamCrest shortCode={team.short_code} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#E8ECF4]">
                        {team.short_code}
                      </span>
                      <Badge tone="neutral">{team.status.toUpperCase()}</Badge>
                    </div>
                    <p className="truncate text-sm text-[#8B95AA]">{team.name}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-[110px]">
                    <p className="font-mono text-[10px] uppercase text-[#8B95AA]">
                      CURRENT PURSE
                    </p>
                    <p className="font-mono text-base font-semibold text-[#F5B921] tabular-nums">
                      {formatLakhs(currentPurse)}
                    </p>
                  </div>

                  {/* Disabled Add & Subtract Controls */}
                  <div className="flex items-center gap-2 opacity-50">
                    <div className="flex items-center">
                      <input
                        type="number"
                        disabled
                        placeholder="0 L"
                        aria-label={`Add lakhs to ${team.short_code} (locked)`}
                        className="w-20 cursor-not-allowed rounded-l-[4px] border border-white/15 bg-[#070B14] px-2.5 py-1.5 font-mono text-xs text-[#8B95AA]"
                      />
                      <button
                        type="button"
                        disabled
                        aria-label="Add funds (locked)"
                        className="inline-flex h-[30px] cursor-not-allowed items-center gap-1 rounded-r-[4px] border border-l-0 border-white/15 bg-[#141C2F] px-2.5 font-mono text-[10px] uppercase text-[#8B95AA]"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Add</span>
                      </button>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="number"
                        disabled
                        placeholder="0 L"
                        aria-label={`Subtract lakhs from ${team.short_code} (locked)`}
                        className="w-20 cursor-not-allowed rounded-l-[4px] border border-white/15 bg-[#070B14] px-2.5 py-1.5 font-mono text-xs text-[#8B95AA]"
                      />
                      <button
                        type="button"
                        disabled
                        aria-label="Subtract funds (locked)"
                        className="inline-flex h-[30px] cursor-not-allowed items-center gap-1 rounded-r-[4px] border border-l-0 border-white/15 bg-[#141C2F] px-2.5 font-mono text-[10px] uppercase text-[#8B95AA]"
                      >
                        <Minus className="h-3 w-3" />
                        <span>Sub</span>
                      </button>
                    </div>

                    <Lock className="h-4 w-4 text-[#8B95AA]" aria-hidden="true" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
