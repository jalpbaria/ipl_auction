import { motion } from 'framer-motion';
import { Monitor, Radio, ShieldAlert, Terminal } from 'lucide-react';
import { CornerBrackets } from '../ui/CornerBrackets';
import { CardCarousel } from './CardCarousel';

const INFO_TILES = [
  {
    code: '01',
    title: 'Live auction room',
    detail: '20s resetting shot clock with real-time synced bids',
    icon: Radio,
  },
  {
    code: '02',
    title: 'Franchise console',
    detail: 'Purse guardrails, role counters & overseas cap tracker',
    icon: Terminal,
  },
  {
    code: '03',
    title: '16:9 projector stage',
    detail: 'Dedicated hall display feed for live college auditoriums',
    icon: Monitor,
  },
  {
    code: '04',
    title: 'Admin command',
    detail: 'Host-triggered player sets, re-entry approvals & gavel',
    icon: ShieldAlert,
  },
];

const STAT_TILES = [
  { value: '10', label: 'Franchises', accent: 'text-[#E8ECF4]' },
  { value: 'Fixed', label: 'Player pool', accent: 'text-[#22D3EE]' },
  { value: '₹120 Cr', label: 'Purse', accent: 'text-[#F5B921]' },
  { value: '15-man', label: 'Squad', accent: 'text-[#E8ECF4]' },
];

export function Hero() {
  return (
    <section
      id="top"
      className="relative border-b border-white/[0.08] bg-[#070B14] hero-gold-diagonal"
    >
      <div className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Hero Left */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col justify-between lg:col-span-6"
          >
            <div>
              {/* Small mono label */}
              <div className="inline-flex items-center gap-2 rounded-[2px] border border-[#F5B921]/35 bg-[#0E1524] px-2.5 py-1">
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#F5B921]">
                  AUCTION CORE
                </span>
                <span className="text-white/20" aria-hidden="true">
                  /
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#8B95AA]">
                  MULTIPLAYER ARENA
                </span>
              </div>

              {/* Display Heading */}
              <h1 className="mt-5 font-display text-[clamp(3.25rem,5.2vw,5.25rem)] leading-[0.93] tracking-[0.02em] text-[#E8ECF4] text-balance">
                BUILD YOUR{' '}
                <span className="bg-gradient-to-r from-[#22D3EE] to-[#F5B921] bg-clip-text text-transparent">
                  CHAMPIONSHIP
                </span>{' '}
                XI
              </h1>

              {/* 3-line description */}
              <p className="mt-4 max-w-xl text-[15px] leading-[1.6] text-[#8B95AA]">
                Step into a synchronized broadcast auction hall engineered for high-stakes
                college tournaments. Command one of ten franchises, outbid rivals under a
                strict 20-second shot clock, and balance overseas caps within your ₹120 Cr purse.
              </p>

              {/* Four small info tiles */}
              <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {INFO_TILES.map((tile) => {
                  const Icon = tile.icon;
                  return (
                    <div
                      key={tile.code}
                      className="relative rounded-[4px] border border-white/[0.08] bg-[#0E1524] p-3.5"
                    >
                      <CornerBrackets tone="subtle" size="sm" />
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#F5B921]">
                          SYS {tile.code}
                        </span>
                        <Icon className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
                      </div>
                      <p className="mt-1.5 font-sans text-sm font-semibold text-[#E8ECF4]">
                        {tile.title}
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-[#8B95AA]">
                        {tile.detail}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Four stat tiles */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STAT_TILES.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[4px] border border-white/[0.08] bg-[#141C2F] px-3.5 py-3"
                >
                  <p
                    className={`font-display text-2xl sm:text-[28px] leading-none tracking-wide tabular-nums ${stat.accent}`}
                  >
                    {stat.value}
                  </p>
                  <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Hero Right: Auto-scrolling Player Card Carousel */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col justify-center lg:col-span-6"
          >
            <CardCarousel />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
