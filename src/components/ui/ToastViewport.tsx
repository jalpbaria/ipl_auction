import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { type ToastItem, type ToastTone, useToastStore } from '../../store/toast';

const TONE_STYLES: Record<
  ToastTone,
  { border: string; accent: string; Icon: typeof Info }
> = {
  info: {
    border: 'border-[#22D3EE]/40',
    accent: 'text-[#22D3EE]',
    Icon: Info,
  },
  success: {
    border: 'border-emerald-400/40',
    accent: 'text-emerald-400',
    Icon: CheckCircle2,
  },
  warning: {
    border: 'border-[#F5B921]/50',
    accent: 'text-[#F5B921]',
    Icon: TriangleAlert,
  },
  error: {
    border: 'border-red-500/50',
    accent: 'text-red-400',
    Icon: AlertCircle,
  },
};

function ToastStack({
  items,
  positionClass,
  dismissToast,
}: {
  items: ToastItem[];
  positionClass: string;
  dismissToast: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className={`pointer-events-none fixed z-50 flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0 ${positionClass}`}
    >
      {items.map((toast) => {
        const style = TONE_STYLES[toast.tone];
        const Icon = style.Icon;

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-[4px] border bg-[#0E1524] p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.65)] ${style.border}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.accent}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.06em] text-[#E8ECF4]">
                {toast.title}
              </p>
              {toast.description && (
                <p className="mt-1 text-xs leading-relaxed text-[#8B95AA]">
                  {toast.description}
                </p>
              )}
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    dismissToast(toast.id);
                  }}
                  className="mt-2 inline-flex items-center rounded-[2px] border border-[#F5B921]/50 bg-[#F5B921]/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#F5B921] transition-colors hover:bg-[#F5B921] hover:text-[#070B14] focus-visible:outline-2 focus-visible:outline-[#22D3EE]"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] text-[#8B95AA] transition-colors hover:bg-[#141C2F] hover:text-[#E8ECF4] focus-visible:outline-2 focus-visible:outline-[#22D3EE]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  const topRight = toasts.filter((t) => t.position === 'top-right');
  const bottomRight = toasts.filter((t) => t.position !== 'top-right');

  return (
    <>
      <ToastStack
        items={topRight}
        positionClass="top-20 right-5"
        dismissToast={dismissToast}
      />
      <ToastStack
        items={bottomRight}
        positionClass="bottom-5 right-5"
        dismissToast={dismissToast}
      />
    </>
  );
}
