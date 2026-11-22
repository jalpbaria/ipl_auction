import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';

interface ProjectorConfettiProps {
  primaryColor?: string;
  secondaryColor?: string;
  count?: number;
}

interface ConfettiPiece {
  id: number;
  xPercent: number;
  delay: number;
  duration: number;
  width: number;
  height: number;
  rotateStart: number;
  rotateEnd: number;
  driftX: number;
  colorIndex: number;
}

export function ProjectorConfetti({
  primaryColor = '#F5B921',
  secondaryColor = '#22D3EE',
  count = 40,
}: ProjectorConfettiProps) {
  const prefersReducedMotion = useReducedMotion();

  const pieces = useMemo<ConfettiPiece[]>(() => {
    return Array.from({ length: count }, (_, idx) => {
      const seed = (idx * 73 + 19) % 100;
      const seed2 = (idx * 37 + 41) % 100;
      return {
        id: idx,
        xPercent: (idx * (100 / count) + (seed % 7)) % 98,
        delay: (seed2 % 18) * 0.06,
        duration: 2.2 + (seed % 16) * 0.12,
        width: 10 + (seed % 8),
        height: 16 + (seed2 % 14),
        rotateStart: (seed * 3.6) % 360,
        rotateEnd: ((seed * 3.6) % 360) + (idx % 2 === 0 ? 320 : -320),
        driftX: ((seed2 % 20) - 10) * 6,
        colorIndex: idx % 4,
      };
    });
  }, [count]);

  const palette = [primaryColor, secondaryColor, '#F5B921', '#E8ECF4'];

  if (prefersReducedMotion) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden opacity-35"
      >
        {pieces.slice(0, 20).map((p) => (
          <span
            key={p.id}
            style={{
              left: `${p.xPercent}%`,
              top: `${12 + (p.id % 5) * 18}%`,
              width: `${p.width}px`,
              height: `${p.height}px`,
              backgroundColor: palette[p.colorIndex],
            }}
            className="absolute rounded-[1px]"
          />
        ))}
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{
            y: -40,
            x: 0,
            opacity: 0,
            rotate: p.rotateStart,
          }}
          animate={{
            y: 1120,
            x: p.driftX,
            opacity: [0, 1, 1, 0],
            rotate: p.rotateEnd,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            repeatDelay: 0.4,
            ease: 'linear',
          }}
          style={{
            left: `${p.xPercent}%`,
            width: `${p.width}px`,
            height: `${p.height}px`,
            backgroundColor: palette[p.colorIndex],
          }}
          className="absolute top-0 rounded-[1px]"
        />
      ))}
    </div>
  );
}
