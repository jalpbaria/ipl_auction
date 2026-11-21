import React from 'react';
import { CornerBrackets } from './CornerBrackets';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  brackets?: boolean;
  bracketTone?: 'gold' | 'cyan' | 'subtle';
}

export function Card({
  elevated = false,
  brackets = false,
  bracketTone = 'gold',
  className = '',
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={`relative rounded-[4px] border border-white/[0.08] ${
        elevated ? 'bg-[#141C2F]' : 'bg-[#0E1524]'
      } ${className}`}
      {...props}
    >
      {brackets && <CornerBrackets tone={bracketTone} />}
      {children}
    </div>
  );
}
