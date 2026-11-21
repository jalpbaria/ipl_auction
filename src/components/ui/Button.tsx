import React from 'react';

export type ButtonVariant = 'cyan' | 'gold' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  cyan:
    'bg-[#22D3EE] text-[#070B14] border border-[#22D3EE] font-semibold hover:bg-[#38E0FA] active:bg-[#06B6D4] disabled:bg-[#141C2F] disabled:text-[#8B95AA] disabled:border-white/10',
  gold:
    'bg-[#F5B921] text-[#070B14] border border-[#F5B921] font-semibold hover:bg-[#F7C74B] active:bg-[#D99E0F] disabled:bg-[#141C2F] disabled:text-[#8B95AA] disabled:border-white/10',
  outline:
    'bg-[#0E1524] text-[#E8ECF4] border border-white/15 hover:border-[#F5B921]/70 hover:text-[#F5B921] active:bg-[#141C2F] disabled:opacity-50',
  ghost:
    'bg-transparent text-[#8B95AA] border border-transparent hover:text-[#E8ECF4] hover:bg-[#141C2F] disabled:opacity-50',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-xs',
  md: 'h-10 px-5 text-sm',
  lg: 'h-11 px-6 text-sm',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'outline', size = 'md', type = 'button', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={`inline-flex items-center justify-center gap-2 rounded-[4px] font-mono uppercase tracking-[0.06em] whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE] disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
