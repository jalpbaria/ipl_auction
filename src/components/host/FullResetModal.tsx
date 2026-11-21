import { AlertTriangle, Loader2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useToastStore } from '../../store/toast';
import { Button } from '../ui/Button';
import { FormField, INPUT_BASE_CLASS } from '../ui/FormField';
import { Modal } from '../ui/Modal';

export interface FullResetModalProps {
  open: boolean;
  onClose: () => void;
  roomId: string;
  onSuccess?: () => void | Promise<void>;
}

export function FullResetModal({
  open,
  onClose,
  roomId,
  onSuccess,
}: FullResetModalProps) {
  const showToast = useToastStore((s) => s.showToast);

  const [confirmInput, setConfirmInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setConfirmInput('');
      setError(null);
    }
  }, [open]);

  const isConfirmed = confirmInput.trim() === 'RESET';

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfirmed || !supabase || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const { error: rpcError } = await supabase.rpc('host_full_reset', {
        p_room: roomId,
        p_confirm: 'RESET',
      });

      if (rpcError) {
        const message = rpcError.message || 'Could not reset the auction room.';
        setError(message);
        showToast({
          title: 'Auction reset failed',
          description: message,
          tone: 'error',
        });
        return;
      }

      if (onSuccess) {
        await onSuccess();
      }

      showToast({
        title: 'Auction fully reset',
        description: 'All sales, bids, and purses have been restored to Set 1.',
        tone: 'success',
      });
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unexpected error resetting auction.';
      setError(message);
      showToast({
        title: 'Auction reset failed',
        description: message,
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      eyebrow="DANGER ZONE // IRREVERSIBLE ACTION"
      title="FULL AUCTION RESET"
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleConfirmReset} className="space-y-4">
        <div className="flex items-start gap-3 rounded-[4px] border border-red-500/40 bg-red-500/10 p-3.5 text-xs leading-relaxed text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="space-y-1">
            <p className="font-semibold text-red-300">
              All auction progress will be wiped:
            </p>
            <ul className="list-disc space-y-0.5 pl-4 text-red-200/90">
              <li>Every player sale and unsold mark returns to PENDING</li>
              <li>All bid history for this room is cleared</li>
              <li>All 10 team purses reset to the room starting purse</li>
              <li>Auction clock returns to Set 1 standby</li>
            </ul>
            <p className="pt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[#22D3EE]">
              Teams, team codes, and registered squad members will remain.
            </p>
          </div>
        </div>

        <FormField
          id="full-reset-confirm"
          label="Type RESET to confirm"
          hint="CASE SENSITIVE"
          required
        >
          <input
            id="full-reset-confirm"
            type="text"
            value={confirmInput}
            disabled={submitting}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder="RESET"
            autoComplete="off"
            className={`${INPUT_BASE_CLASS} font-mono tracking-[0.14em] uppercase`}
          />
        </FormField>

        {error && (
          <div
            role="alert"
            className="rounded-[4px] border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300"
          >
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={submitting}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={!isConfirmed || submitting}
            className="border-red-500 bg-red-500 text-white hover:border-red-400 hover:bg-red-400 hover:text-white disabled:opacity-40"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Resetting...</span>
              </>
            ) : (
              <span>Confirm full reset</span>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
