import { Badge } from '../ui/Badge';
import { CornerBrackets } from '../ui/CornerBrackets';

interface BlueprintStep {
  step: string;
  phase: string;
  title: string;
  description: string;
}

const BLUEPRINT_STEPS: BlueprintStep[] = [
  {
    step: '01',
    phase: 'INITIALIZE',
    title: 'Create or join a room',
    description:
      'The event host spins up a live auction room and projects the 16:9 stage feed for the entire hall.',
  },
  {
    step: '02',
    phase: 'AUTHENTICATE',
    title: 'Enter with a team code',
    description:
      'Each squad enters using its single-use franchise access code with fullscreen lock armed.',
  },
  {
    step: '03',
    phase: 'COMPETE',
    title: 'Bid live',
    description:
      'Race the 20-second shot clock across Legends, Marquee, and specialist sets with real-time purse checks.',
  },
  {
    step: '04',
    phase: 'FINALIZE',
    title: 'Build your playing XI',
    description:
      'Lock 11 to 15 players meeting every role minimum and submit your squad for leaderboard scoring.',
  },
];

export function StrategicBlueprint() {
  return (
    <section
      id="format"
      className="border-b border-white/[0.08] bg-[#0B111E] py-14 sm:py-18"
    >
      <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge tone="gold">AUCTION FLOW</Badge>
            <h2 className="mt-3 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
              STRATEGIC BLUEPRINT
            </h2>
          </div>
          <p className="max-w-md text-sm text-[#8B95AA]">
            Four synchronized phases take ten competing tables from room entry to final
            squad evaluation.
          </p>
        </div>

        {/* Horizontal Timeline */}
        <div className="relative mt-10">
          {/* Connecting timeline rail on desktop */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-6 left-0 right-0 hidden h-px bg-white/10 lg:block"
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {BLUEPRINT_STEPS.map((item, idx) => (
              <div key={item.step} className="relative flex flex-col">
                {/* Timeline node row */}
                <div className="relative z-10 mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] border border-[#F5B921]/50 bg-[#0E1524] font-mono text-base font-bold text-[#F5B921] tabular-nums">
                    {item.step}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#22D3EE]">
                      {item.phase}
                    </span>
                    <span className="font-mono text-[11px] text-[#8B95AA]">
                      STAGE {idx + 1} OF 4
                    </span>
                  </div>
                </div>

                {/* Step Card */}
                <div className="relative flex-1 rounded-[4px] border border-white/[0.08] bg-[#0E1524] p-5">
                  <CornerBrackets tone="subtle" size="sm" />
                  <h3 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#8B95AA]">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
