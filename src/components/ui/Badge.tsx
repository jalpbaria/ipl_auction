import React from 'react';

export type BadgeTone = 'gold' | 'cyan' | 'neutral' | 'danger';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  gold: 'bg-[#F5B921]/10 text-[#F5B921] border-[#F5B921]/35',
  cyan: 'bg-[#22D3EE]/10 text-[#22D3EE] border-[#22D3EE]/35',
  neutral: 'bg-[#141C2F] text-[#8B95AA] border-white/10',
  danger: 'bg-red-500/10 text-red-400 border-red-500/35',
};

export function Badge({ tone = 'neutral', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] whitespace-nowrap shrink-0 ${TONE_CLASSES[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
