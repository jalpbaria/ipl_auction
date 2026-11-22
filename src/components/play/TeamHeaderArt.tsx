import type { TeamPatternId } from '../../data/ipl-teams';

interface TeamHeaderArtProps {
  patternId: TeamPatternId;
  primary: string;
  secondary: string;
}

export function TeamHeaderArt({
  patternId,
  primary,
  secondary,
}: TeamHeaderArtProps) {
  return (
    <svg
      viewBox="0 0 1200 220"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <defs>
        {patternId === 'csk-stripes' && (
          <pattern
            id="pat-csk-stripes"
            width="44"
            height="44"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-32)"
          >
            <rect width="44" height="44" fill="#0E1524" />
            <rect x="0" y="0" width="18" height="44" fill={primary} opacity="0.22" />
            <rect x="26" y="0" width="4" height="44" fill={secondary} opacity="0.35" />
          </pattern>
        )}

        {patternId === 'kkr-checker' && (
          <pattern
            id="pat-kkr-checker"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <rect width="40" height="40" fill="#0E1524" />
            <rect x="0" y="0" width="20" height="20" fill={primary} opacity="0.45" />
            <rect x="20" y="20" width="20" height="20" fill={primary} opacity="0.45" />
            <rect x="20" y="0" width="20" height="20" fill={secondary} opacity="0.16" />
            <rect x="0" y="20" width="20" height="20" fill={secondary} opacity="0.16" />
          </pattern>
        )}

        {patternId === 'gt-hexgrid' && (
          <pattern
            id="pat-gt-hexgrid"
            width="56"
            height="48.5"
            patternUnits="userSpaceOnUse"
          >
            <polygon
              points="28,2 52,14 52,35 28,47 4,35 4,14"
              fill={primary}
              fillOpacity="0.26"
              stroke={secondary}
              strokeOpacity="0.32"
              strokeWidth="1.2"
            />
          </pattern>
        )}
      </defs>

      {/* Base dark navy canvas */}
      <rect width="1200" height="220" fill="#0B111E" />

      {/* CSK: Yellow with bold diagonal stripes */}
      {patternId === 'csk-stripes' && (
        <g>
          <rect width="1200" height="220" fill="url(#pat-csk-stripes)" />
          <polygon points="780,0 1200,0 1200,220 650,220" fill={primary} opacity="0.2" />
          <polygon points="860,0 890,0 760,220 730,220" fill={primary} opacity="0.5" />
          <polygon points="920,0 936,0 806,220 790,220" fill={secondary} opacity="0.65" />
        </g>
      )}

      {/* MI: Deep blue with flowing wave lines */}
      {patternId === 'mi-waves' && (
        <g>
          <rect width="1200" height="220" fill={primary} opacity="0.24" />
          {[0, 1, 2, 3, 4, 5].map((idx) => {
            const y = 35 + idx * 28;
            return (
              <path
                key={idx}
                d={`M -40 ${y} C 220 ${y - 42}, 440 ${y + 42}, 700 ${y} S 1020 ${y - 38}, 1240 ${y + 16}`}
                fill="none"
                stroke={idx % 2 === 0 ? '#60A5FA' : secondary}
                strokeOpacity={idx % 2 === 0 ? 0.35 : 0.45}
                strokeWidth={idx === 2 ? '3' : '1.6'}
              />
            );
          })}
        </g>
      )}

      {/* RCB: Red and black with sharp chevrons */}
      {patternId === 'rcb-chevrons' && (
        <g>
          <rect width="1200" height="220" fill="#090B10" />
          <polygon points="620,0 1200,0 1200,220 520,220" fill={primary} opacity="0.24" />
          {[0, 1, 2, 3, 4, 5, 6].map((idx) => {
            const offset = 520 + idx * 105;
            return (
              <polyline
                key={idx}
                points={`${offset},0 ${offset + 70},110 ${offset},220`}
                fill="none"
                stroke={idx % 2 === 0 ? primary : '#D4AF37'}
                strokeOpacity={idx % 2 === 0 ? 0.55 : 0.32}
                strokeWidth={idx % 2 === 0 ? '8' : '3'}
              />
            );
          })}
        </g>
      )}

      {/* KKR: Purple and gold with a checker band */}
      {patternId === 'kkr-checker' && (
        <g>
          <rect width="1200" height="220" fill={primary} opacity="0.28" />
          <rect x="640" y="0" width="560" height="220" fill="url(#pat-kkr-checker)" />
          <line
            x1="640"
            y1="0"
            x2="640"
            y2="220"
            stroke={secondary}
            strokeOpacity="0.6"
            strokeWidth="3"
          />
          <rect x="0" y="196" width="1200" height="6" fill={secondary} opacity="0.45" />
        </g>
      )}

      {/* DC: Blue and red with vertical racing stripes */}
      {patternId === 'dc-racing' && (
        <g>
          <rect width="1200" height="220" fill={primary} opacity="0.16" />
          {[680, 740, 800, 860, 920, 980, 1040, 1100].map((x, idx) => (
            <g key={x}>
              <rect
                x={x}
                y="0"
                width={idx % 2 === 0 ? 28 : 16}
                height="220"
                fill={idx % 2 === 0 ? primary : secondary}
                opacity={idx % 2 === 0 ? 0.36 : 0.42}
              />
              <rect
                x={x + 32}
                y="0"
                width="3"
                height="220"
                fill="#E8ECF4"
                opacity="0.18"
              />
            </g>
          ))}
        </g>
      )}

      {/* PBKS: Red with a zigzag band */}
      {patternId === 'pbks-zigzag' && (
        <g>
          <rect width="1200" height="220" fill={primary} opacity="0.18" />
          <polygon
            points="0,165 80,120 160,165 240,120 320,165 400,120 480,165 560,120 640,165 720,120 800,165 880,120 960,165 1040,120 1120,165 1200,120 1200,220 0,220"
            fill={primary}
            opacity="0.28"
          />
          <polyline
            points="0,145 80,100 160,145 240,100 320,145 400,100 480,145 560,100 640,145 720,100 800,145 880,100 960,145 1040,100 1120,145 1200,100"
            fill="none"
            stroke={secondary}
            strokeOpacity="0.5"
            strokeWidth="4"
          />
          <polyline
            points="0,162 80,117 160,162 240,117 320,162 400,117 480,162 560,117 640,162 720,117 800,162 880,117 960,162 1040,117 1120,162 1200,117"
            fill="none"
            stroke={primary}
            strokeOpacity="0.7"
            strokeWidth="3"
          />
        </g>
      )}

      {/* RR: Pink and royal blue with concentric arcs */}
      {patternId === 'rr-arcs' && (
        <g>
          <rect width="1200" height="220" fill={secondary} opacity="0.28" />
          {[90, 150, 210, 270, 330, 390, 450].map((r, idx) => (
            <circle
              key={r}
              cx="1040"
              cy="110"
              r={r}
              fill="none"
              stroke={idx % 2 === 0 ? primary : '#60A5FA'}
              strokeOpacity={idx % 2 === 0 ? 0.48 : 0.35}
              strokeWidth={idx % 2 === 0 ? '4' : '2'}
            />
          ))}
        </g>
      )}

      {/* SRH: Orange and black with sunburst rays */}
      {patternId === 'srh-sunburst' && (
        <g>
          <rect width="1200" height="220" fill="#090C12" />
          {Array.from({ length: 14 }, (_, idx) => {
            const a1 = -75 + idx * 11;
            const a2 = a1 + 5.5;
            const rad1 = (a1 * Math.PI) / 180;
            const rad2 = (a2 * Math.PI) / 180;
            const cx = 1020;
            const cy = 200;
            const dist = 1250;
            const x1 = cx - Math.cos(rad1) * dist;
            const y1 = cy - Math.sin(rad1) * dist;
            const x2 = cx - Math.cos(rad2) * dist;
            const y2 = cy - Math.sin(rad2) * dist;
            return (
              <polygon
                key={idx}
                points={`${cx},${cy} ${x1},${y1} ${x2},${y2}`}
                fill={primary}
                opacity={idx % 2 === 0 ? 0.36 : 0.18}
              />
            );
          })}
          <circle cx="1020" cy="200" r="88" fill={primary} opacity="0.22" />
        </g>
      )}

      {/* GT: Navy and gold with a hexagon grid */}
      {patternId === 'gt-hexgrid' && (
        <g>
          <rect width="1200" height="220" fill={primary} opacity="0.45" />
          <rect width="1200" height="220" fill="url(#pat-gt-hexgrid)" />
          <polygon points="840,0 1200,0 1200,220 740,220" fill={secondary} opacity="0.1" />
        </g>
      )}

      {/* LSG: Teal and orange with a diagonal split */}
      {patternId === 'lsg-split' && (
        <g>
          <polygon points="0,0 820,0 640,220 0,220" fill={primary} opacity="0.28" />
          <polygon points="820,0 1200,0 1200,220 640,220" fill={secondary} opacity="0.26" />
          <line
            x1="820"
            y1="0"
            x2="640"
            y2="220"
            stroke={secondary}
            strokeOpacity="0.85"
            strokeWidth="5"
          />
          <line
            x1="842"
            y1="0"
            x2="662"
            y2="220"
            stroke={primary}
            strokeOpacity="0.85"
            strokeWidth="3"
          />
        </g>
      )}

      {/* Left-to-right readability vignette so foreground text always has >= 7:1 contrast */}
      <defs>
        <linearGradient id={`scrim-${patternId}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#070B14" stopOpacity="0.82" />
          <stop offset="55%" stopColor="#070B14" stopOpacity="0.58" />
          <stop offset="100%" stopColor="#070B14" stopOpacity="0.34" />
        </linearGradient>
      </defs>
      <rect width="1200" height="220" fill={`url(#scrim-${patternId})`} />
    </svg>
  );
}
