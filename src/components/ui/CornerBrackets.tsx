import React from 'react';

interface CornerBracketsProps {
  tone?: 'gold' | 'cyan' | 'subtle';
  size?: 'sm' | 'md';
}

export function CornerBrackets({ tone = 'gold', size = 'md' }: CornerBracketsProps) {
  const colorClass =
    tone === 'gold'
      ? 'border-[#F5B921]/70'
      : tone === 'cyan'
        ? 'border-[#22D3EE]/70'
        : 'border-white/25';

  const dim = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';

  return (
    <>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-0 left-0 ${dim} border-t border-l ${colorClass}`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-0 right-0 ${dim} border-t border-r ${colorClass}`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-0 left-0 ${dim} border-b border-l ${colorClass}`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-0 right-0 ${dim} border-b border-r ${colorClass}`}
      />
    </>
  );
}
