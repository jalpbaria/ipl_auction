import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useToastStore } from '../../store/toast';

export const PREVIEW_LENGTH_OPTIONS = [0, 3, 5, 8, 10] as const;

interface PreviewLengthControlProps {
  roomId: string;
  currentSeconds: number;
  disabled?: boolean;
  compact?: boolean;
  onUpdated?: () => Promise<void> | void;
}

export function PreviewLengthControl({
  roomId,
  currentSeconds,
  disabled = false,
  compact = false,
  onUpdated,
}: PreviewLengthControlProps) {
  const showToast = useToastStore((s) => s.showToast);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (seconds: number) => {
    if (!supabase || saving || disabled || seconds === currentSeconds) return;
    setSaving(true);

    try {
      const { error } = await supabase.rpc('set_preview_seconds', {
        p_room: roomId,
        p_seconds: seconds,
      });

      if (error) {
        showToast({
          title: 'Could not update player reveal length',
          description: error.message || 'Server rejected preview length update.',
          tone: 'error',
        });
        return;
      }

      showToast({
        title:
          seconds === 0
            ? 'Player reveal disabled'
            : `Player reveal set to ${seconds}s`,
        tone: 'success',
        durationMs: 2500,
      });

      if (onUpdated) {
        await onUpdated();
      }
    } catch (err) {
      showToast({
        title: 'Could not update player reveal length',
        description:
          err instanceof Error ? err.message : 'Unexpected network error.',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
          PLAYER REVEAL LENGTH
        </span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#F5B921] tabular-nums">
          {currentSeconds === 0 ? 'OFF (0s)' : `${currentSeconds}s`}
        </span>
      </div>

      <div
        role="group"
        aria-label="Player reveal length in seconds"
        className="grid grid-cols-5 gap-1 rounded-[4px] border border-white/10 bg-[#070B14] p-1"
      >
        {PREVIEW_LENGTH_OPTIONS.map((sec) => {
          const active = currentSeconds === sec;
          return (
            <button
              key={sec}
              type="button"
              disabled={saving || disabled}
              onClick={() => void handleSelect(sec)}
              aria-pressed={active}
              className={`rounded-[2px] font-mono font-semibold uppercase tracking-wider transition-colors tabular-nums ${
                compact ? 'py-1 text-[10px]' : 'py-1.5 text-xs'
              } ${
                active
                  ? 'bg-[#F5B921] text-[#070B14]'
                  : 'text-[#8B95AA] hover:bg-[#141C2F] hover:text-[#E8ECF4]'
              } disabled:opacity-50`}
            >
              {sec === 0 ? 'OFF' : `${sec}s`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
