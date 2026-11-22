import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useHostRoom } from '../../store/hostRoom';
import { useToastStore } from '../../store/toast';
import { ConfirmModal } from './ConfirmModal';

interface EnforcementControlProps {
  roomId: string;
  enabled: boolean;
  compact?: boolean;
}

export function EnforcementControl({
  roomId,
  enabled,
  compact = false,
}: EnforcementControlProps) {
  const refreshRoom = useHostRoom((s) => s.refreshRoom);
  const showToast = useToastStore((s) => s.showToast);

  const [saving, setSaving] = useState(false);
  const [confirmOffOpen, setConfirmOffOpen] = useState(false);

  const applyToggle = async (nextEnabled: boolean) => {
    if (!supabase || saving) return;
    setSaving(true);

    try {
      const { error } = await supabase.rpc('set_anticheat', {
        p_room: roomId,
        p_enabled: nextEnabled,
      });

      if (error) {
        showToast({
          title: 'Failed to update enforcement',
          description: error.message,
          tone: 'error',
        });
        return;
      }

      await refreshRoom();
      showToast({
        title: nextEnabled ? 'Anti-cheat enabled' : 'Anti-cheat disabled',
        description: nextEnabled
          ? 'Fullscreen and tab-switch enforcement is now active.'
          : 'Teams will not be automatically removed during testing.',
        tone: nextEnabled ? 'success' : 'warning',
      });
      setConfirmOffOpen(false);
    } catch (err) {
      showToast({
        title: 'Error updating enforcement',
        description: err instanceof Error ? err.message : 'Request failed.',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleClick = () => {
    if (saving) return;
    if (enabled) {
      setConfirmOffOpen(true);
    } else {
      void applyToggle(true);
    }
  };

  return (
    <>
      <div
        className={`flex items-center justify-between gap-4 rounded-[4px] border border-white/10 bg-[#070B14] ${
          compact ? 'px-3.5 py-2.5' : 'px-4 py-3.5'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {enabled ? (
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          ) : (
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#E8ECF4]">
              Fullscreen and tab-switch enforcement
            </p>
            {!compact && (
              <p className="mt-0.5 text-xs text-[#8B95AA]">
                {enabled
                  ? 'Active teams are removed automatically on fullscreen exit or tab switch.'
                  : 'Enforcement paused. Violations are not triggering automatic removals.'}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Fullscreen and tab-switch enforcement"
          disabled={saving}
          onClick={handleToggleClick}
          className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-[2px] border px-1 font-mono text-[10px] font-bold uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE] disabled:opacity-60 ${
            enabled
              ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-300'
              : 'border-white/15 bg-[#141C2F] text-[#8B95AA]'
          }`}
        >
          {saving ? (
            <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <span
                className={`inline-block h-4 w-4 rounded-[2px] transition-transform ${
                  enabled
                    ? 'translate-x-7 bg-emerald-400'
                    : 'translate-x-0 bg-[#8B95AA]'
                }`}
              />
              <span
                className={`pointer-events-none absolute font-mono text-[9px] tracking-[0.08em] ${
                  enabled ? 'left-1.5 text-emerald-300' : 'right-1.5 text-[#8B95AA]'
                }`}
              >
                {enabled ? 'ON' : 'OFF'}
              </span>
            </>
          )}
        </button>
      </div>

      <ConfirmModal
        open={confirmOffOpen}
        onClose={() => setConfirmOffOpen(false)}
        onConfirm={() => void applyToggle(false)}
        eyebrow="ANTI-CHEAT OVERRIDE"
        title="DISABLE ENFORCEMENT"
        message="Teams will no longer be removed for leaving fullscreen or switching tabs. Use this for testing only."
        confirmLabel="Turn off enforcement"
        confirmTone="danger"
        loading={saving}
      />
    </>
  );
}
