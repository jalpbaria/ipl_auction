import { IPL_TEAMS } from '../../data/ipl-teams';
import { formatLakhs } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { CornerBrackets } from '../ui/CornerBrackets';

export function FranchiseRoster() {
  return (
    <section
      id="about"
      className="border-b border-white/[0.08] bg-[#070B14] py-14 sm:py-18"
    >
      <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8">
        {/* Section Header + Auction Increment Telemetry */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <Badge tone="cyan">FRANCHISE LINEUP</Badge>
            <h2 className="mt-3 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
              TEN FRANCHISES. ONE LIVE STAGE.
            </h2>
            <p className="mt-2.5 text-sm sm:text-[15px] leading-relaxed text-[#8B95AA]">
              Every room seats up to ten college squads under official franchise banners.
              Each table starts with {formatLakhs(12000)} and competes across curated sets
              with strict {formatLakhs(20)} and {formatLakhs(25)} automated bid steps.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 shrink-0">
            <div className="rounded-[4px] border border-white/[0.08] bg-[#0E1524] px-4 py-2.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                BELOW {formatLakhs(100)}
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-[#22D3EE] tabular-nums">
                +{formatLakhs(20)} STEP
              </p>
            </div>
            <div className="rounded-[4px] border border-white/[0.08] bg-[#0E1524] px-4 py-2.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                FROM {formatLakhs(100)} UP
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-[#F5B921] tabular-nums">
                +{formatLakhs(25)} STEP
              </p>
            </div>
            <div className="rounded-[4px] border border-white/[0.08] bg-[#0E1524] px-4 py-2.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                SHOT CLOCK
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-[#E8ECF4] tabular-nums">
                20 SEC RESET
              </p>
            </div>
          </div>
        </div>

        {/* 10 Franchise Grid */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {IPL_TEAMS.map((team, index) => (
            <div
              key={team.code}
              className="group relative rounded-[4px] border border-white/[0.08] bg-[#0E1524] p-4 transition-colors duration-150 hover:border-white/20"
            >
              <CornerBrackets tone="subtle" size="sm" />

              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold tracking-[0.1em] text-[#E8ECF4]">
                  {team.code}
                </span>
                <span className="font-mono text-[10px] text-[#8B95AA] tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>

              {/* Dual-tone team colour stripe */}
              <div className="mt-2.5 flex h-1 w-full overflow-hidden rounded-[1px]">
                <span
                  className="h-full w-2/3"
                  style={{ backgroundColor: team.primary }}
                />
                <span
                  className="h-full w-1/3"
                  style={{ backgroundColor: team.secondary }}
                />
              </div>

              <p className="mt-3 text-xs font-medium leading-snug text-[#E8ECF4]">
                {team.name}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#8B95AA] tabular-nums">
                PURSE {formatLakhs(12000)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
