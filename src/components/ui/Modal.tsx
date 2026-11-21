import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { CornerBrackets } from './CornerBrackets';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClass?: string;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  eyebrow,
  children,
  footer,
  maxWidthClass = 'max-w-3xl',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Solid dark scrim without glassmorphism */}
      <div
        className="fixed inset-0 bg-[#070B14]/90"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`relative z-10 w-full ${maxWidthClass} rounded-[4px] border border-white/15 bg-[#0E1524] shadow-[0_24px_64px_rgba(0,0,0,0.75)]`}
      >
        <CornerBrackets tone="gold" size="md" />

        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-6 py-4">
          <div className="min-w-0">
            {eyebrow && (
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#F5B921]">
                {eyebrow}
              </p>
            )}
            <h2
              id="modal-title"
              className="mt-0.5 font-display text-3xl tracking-wide text-[#E8ECF4]"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-sm text-[#8B95AA]">{subtitle}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] border border-white/10 bg-[#141C2F] text-[#8B95AA] transition-colors hover:border-white/25 hover:text-[#E8ECF4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5">{children}</div>

        {footer && (
          <div className="border-t border-white/[0.08] bg-[#0B111E] px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
