import { Crown, Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatLakhs } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useToastStore } from '../../store/toast';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { FormField, INPUT_BASE_CLASS } from '../ui/FormField';

export function CreateRoomPanel() {
  const navigate = useNavigate();
  const showToast = useToastStore((s) => s.showToast);

  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [purseCrores, setPurseCrores] = useState('120');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const parsedCrores = Number(purseCrores);
  const isPurseValid =
    Number.isFinite(parsedCrores) && parsedCrores >= 10 && parsedCrores <= 500;
  const previewLakhs = isPurseValid ? Math.round(parsedCrores * 100) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const errors: Record<string, string> = {};
    const trimmedName = roomName.trim();

    if (!trimmedName) {
      errors.roomName = 'Room name is required.';
    } else if (trimmedName.length < 3) {
      errors.roomName = 'Room name must be at least 3 characters.';
    }

    if (!password) {
      errors.password = 'Room password is required.';
    } else if (password.length < 4) {
      errors.password = 'Room password must be at least 4 characters.';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Confirm the room password.';
    } else if (confirmPassword !== password) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (!purseCrores.trim() || !Number.isFinite(parsedCrores)) {
      errors.purseCrores = 'Enter a valid starting purse in Cr.';
    } else if (parsedCrores < 10 || parsedCrores > 500) {
      errors.purseCrores = 'Starting purse must be between 10 Cr and 500 Cr.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    if (!supabase) {
      setServerError('Supabase client is not configured.');
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    try {
      const purseLakhs = Math.round(parsedCrores * 100);
      const { data, error } = await supabase.rpc('create_room', {
        p_name: trimmedName,
        p_password: password,
        p_purse_lakhs: purseLakhs,
      });

      if (error) {
        setServerError(error.message || 'Could not create room.');
        return;
      }

      const roomId =
        typeof data === 'string'
          ? data
          : typeof data === 'object' && data !== null && 'id' in data
            ? String((data as { id: unknown }).id)
            : typeof data === 'object' && data !== null && 'room_id' in data
              ? String((data as { room_id: unknown }).room_id)
              : '';

      if (!roomId) {
        setServerError('Room was created, but no room ID was returned.');
        return;
      }

      showToast({
        title: 'Room created',
        description: `${trimmedName} initialized with ${formatLakhs(purseLakhs)} purse.`,
        tone: 'success',
      });
      navigate(`/host/${roomId}`);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : 'Unexpected error creating room.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card brackets bracketTone="gold" className="flex flex-col justify-between p-6 sm:p-8">
      <div>
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div>
            <Badge tone="gold">HOST PROTOCOL</Badge>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl tracking-wide text-[#F5B921]">
              CREATE ROOM
            </h2>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] border border-[#F5B921]/35 bg-[#F5B921]/10 text-[#F5B921]">
            <Crown className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-[#8B95AA]">
          Launch a new multiplayer auction hall as the event host. Ten single-use franchise
          codes and a starting purse cap will be provisioned for your room.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          <FormField
            id="create-room-name"
            label="Room name"
            required
            error={fieldErrors.roomName}
          >
            <input
              id="create-room-name"
              type="text"
              value={roomName}
              disabled={submitting}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="TechFest-IPL-2026"
              aria-invalid={Boolean(fieldErrors.roomName)}
              className={INPUT_BASE_CLASS}
            />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              id="create-room-password"
              label="Room password"
              required
              error={fieldErrors.password}
            >
              <input
                id="create-room-password"
                type="password"
                autoComplete="new-password"
                value={password}
                disabled={submitting}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Shared room secret"
                aria-invalid={Boolean(fieldErrors.password)}
                className={INPUT_BASE_CLASS}
              />
            </FormField>

            <FormField
              id="create-room-confirm"
              label="Confirm password"
              required
              error={fieldErrors.confirmPassword}
            >
              <input
                id="create-room-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                disabled={submitting}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                className={INPUT_BASE_CLASS}
              />
            </FormField>
          </div>

          <FormField
            id="create-room-purse"
            label="Starting purse (Cr)"
            hint={isPurseValid ? `STORED AS ${formatLakhs(previewLakhs)}` : 'RANGE 10–500 CR'}
            required
            error={fieldErrors.purseCrores}
          >
            <div className="relative">
              <input
                id="create-room-purse"
                type="number"
                min={10}
                max={500}
                step={5}
                value={purseCrores}
                disabled={submitting}
                onChange={(e) => setPurseCrores(e.target.value)}
                aria-invalid={Boolean(fieldErrors.purseCrores)}
                className={`${INPUT_BASE_CLASS} pr-16 font-mono tabular-nums`}
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-xs uppercase text-[#F5B921]">
                CRORE
              </span>
            </div>
          </FormField>

          {serverError && (
            <div
              role="alert"
              className="rounded-[4px] border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300"
            >
              {serverError}
            </div>
          )}

          <div className="pt-2">
            <Button
              type="submit"
              variant="gold"
              size="lg"
              disabled={submitting}
              className="w-full"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Provisioning room...</span>
                </>
              ) : (
                <span>Create room &amp; open host desk</span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
