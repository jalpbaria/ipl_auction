import React from 'react';

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  accent?: 'gold' | 'cyan' | 'muted';
}

const ACCENT_CLASSES: Record<NonNullable<TagProps['accent']>, string> = {
  gold: 'border-[#F5B921]/30 text-[#F5B921] bg-[#0E1524]',
  cyan: 'border-[#22D3EE]/30 text-[#22D3EE] bg-[#0E1524]',
  muted: 'border-white/10 text-[#8B95AA] bg-[#0E1524]',
};

export function Tag({ accent = 'muted', className = '', children, ...props }: TagProps) {
  return (
    <span
      className={`inline-flex items-center rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] whitespace-nowrap shrink-0 ${ACCENT_CLASSES[accent]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
