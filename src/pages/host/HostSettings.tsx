import { AlertTriangle, KeyRound, Loader2, Save, Shield, User } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { EnforcementControl } from '../../components/host/EnforcementControl';
import { FullResetModal } from '../../components/host/FullResetModal';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FormField, INPUT_BASE_CLASS } from '../../components/ui/FormField';
import { formatLakhs } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/auth';
import { useHostRoom } from '../../store/hostRoom';
import { useToastStore } from '../../store/toast';

export default function HostSettings() {
  const room = useHostRoom((s) => s.room);
  const refreshRoom = useHostRoom((s) => s.refreshRoom);
  const refreshTeamsAndFinances = useHostRoom((s) => s.refreshTeamsAndFinances);
  const refreshRoomPlayers = useHostRoom((s) => s.refreshRoomPlayers);

  const profile = useAuthStore((s) => s.profile);
  const updateProfileName = useAuthStore((s) => s.updateProfileName);
  const showToast = useToastStore((s) => s.showToast);

  // Room Settings form state
  const [roomName, setRoomName] = useState('');
  const [purseCrores, setPurseCrores] = useState('120');
  const [squadMax, setSquadMax] = useState('15');
  const [squadMin, setSquadMin] = useState('11');
  const [overseasMax, setOverseasMax] = useState('5');
  const [bidTimer, setBidTimer] = useState('20');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Password form state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Host Profile form state
  const [fullName, setFullName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Full auction reset modal
  const [fullResetOpen, setFullResetOpen] = useState(false);

  useEffect(() => {
    if (!room) return;
    setRoomName(room.name);
    setPurseCrores(String(room.starting_purse_lakhs / 100));
    setSquadMax(String(room.squad_max));
    setSquadMin(String(room.squad_min));
    setOverseasMax(String(room.overseas_max));
    setBidTimer(String(room.bid_timer_seconds));
  }, [room]);

  useEffect(() => {
    if (profile?.full_name) {
      setFullName(profile.full_name);
    }
  }, [profile?.full_name]);

  if (!room) return null;

  const parsedCrores = Number(purseCrores);
  const previewLakhs =
    Number.isFinite(parsedCrores) && parsedCrores >= 10 && parsedCrores <= 500
      ? Math.round(parsedCrores * 100)
      : null;

  const handleSaveRoomSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);

    const trimmedName = roomName.trim();
    const cr = Number(purseCrores);
    const maxSq = Number(squadMax);
    const minSq = Number(squadMin);
    const maxOs = Number(overseasMax);
    const timer = Number(bidTimer);

    if (!trimmedName || trimmedName.length < 3) {
      setSettingsError('Room name must be at least 3 characters.');
      return;
    }
    if (!Number.isFinite(cr) || cr < 10 || cr > 500) {
      setSettingsError('Starting purse must be between 10 Cr and 500 Cr.');
      return;
    }
    if (!Number.isFinite(minSq) || !Number.isFinite(maxSq) || minSq < 1 || maxSq < minSq) {
      setSettingsError('Ensure squad min is at least 1 and squad max >= squad min.');
      return;
    }
    if (!Number.isFinite(maxOs) || maxOs < 0 || maxOs > maxSq) {
      setSettingsError('Max overseas must be between 0 and squad max.');
      return;
    }
    if (!Number.isFinite(timer) || timer < 5 || timer > 120) {
      setSettingsError('Bid timer must be between 5 and 120 seconds.');
      return;
    }

    if (!supabase) return;
    setSavingSettings(true);

    try {
      const { error } = await supabase.rpc('update_room_settings', {
        p_room: room.id,
        p_name: trimmedName,
        p_purse_lakhs: Math.round(cr * 100),
        p_squad_max: Math.round(maxSq),
        p_squad_min: Math.round(minSq),
        p_overseas_max: Math.round(maxOs),
        p_bid_timer: Math.round(timer),
      });

      if (error) {
        setSettingsError(error.message || 'Could not update room settings.');
        return;
      }

      await Promise.all([refreshRoom(), refreshTeamsAndFinances()]);
      showToast({
        title: 'Room settings saved',
        description: `${trimmedName} configuration updated.`,
        tone: 'success',
      });
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : 'Unexpected error updating settings.',
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (!newPassword || newPassword.length < 4) {
      setPasswordError('New room password must be at least 4 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    if (!supabase) return;
    setSavingPassword(true);

    try {
      const { error } = await supabase.rpc('change_room_password', {
        p_room: room.id,
        p_new_password: newPassword,
      });

      if (error) {
        setPasswordError(error.message || 'Could not update room password.');
        return;
      }

      setNewPassword('');
      setConfirmPassword('');
      showToast({
        title: 'Room password updated',
        description: 'Share the new room password with entering teams.',
        tone: 'success',
      });
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : 'Unexpected error changing password.',
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);

    const trimmed = fullName.trim();
    if (!trimmed || trimmed.length < 2) {
      setProfileError('Full name must be at least 2 characters.');
      return;
    }

    setSavingProfile(true);
    try {
      await updateProfileName(trimmed);
      showToast({
        title: 'Profile updated',
        description: `Display name set to ${trimmed}.`,
        tone: 'success',
      });
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : 'Unable to update profile name.',
      );
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-white/[0.08] pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#22D3EE]">
          ROOM CONFIGURATION // HOST PROFILE
        </p>
        <h1 className="mt-1.5 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
          SETTINGS
        </h1>
      </div>

      {/* Room Settings Form */}
      <Card brackets bracketTone="gold" className="p-6 sm:p-8">
        <div className="border-b border-white/[0.08] pb-4">
          <h2 className="font-display text-2xl tracking-wide text-[#F5B921]">
            ROOM SETTINGS
          </h2>
          <p className="mt-1 text-xs text-[#8B95AA]">
            Adjust room name, salary cap, squad limits, and shot clock parameters.
          </p>
        </div>

        <form onSubmit={handleSaveRoomSettings} noValidate className="mt-6 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField id="settings-room-name" label="Room name" required>
              <input
                id="settings-room-name"
                type="text"
                value={roomName}
                disabled={savingSettings}
                onChange={(e) => setRoomName(e.target.value)}
                className={INPUT_BASE_CLASS}
              />
            </FormField>

            <FormField
              id="settings-purse"
              label="Starting purse (Cr)"
              hint={previewLakhs !== null ? formatLakhs(previewLakhs) : '10–500 CR'}
              required
            >
              <input
                id="settings-purse"
                type="number"
                min={10}
                max={500}
                step={5}
                value={purseCrores}
                disabled={savingSettings}
                onChange={(e) => setPurseCrores(e.target.value)}
                className={`${INPUT_BASE_CLASS} font-mono tabular-nums`}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <FormField id="settings-squad-max" label="Squad max" required>
              <input
                id="settings-squad-max"
                type="number"
                min={1}
                value={squadMax}
                disabled={savingSettings}
                onChange={(e) => setSquadMax(e.target.value)}
                className={`${INPUT_BASE_CLASS} font-mono tabular-nums`}
              />
            </FormField>

            <FormField id="settings-squad-min" label="Squad min" required>
              <input
                id="settings-squad-min"
                type="number"
                min={1}
                value={squadMin}
                disabled={savingSettings}
                onChange={(e) => setSquadMin(e.target.value)}
                className={`${INPUT_BASE_CLASS} font-mono tabular-nums`}
              />
            </FormField>

            <FormField id="settings-overseas-max" label="Max overseas" required>
              <input
                id="settings-overseas-max"
                type="number"
                min={0}
                value={overseasMax}
                disabled={savingSettings}
                onChange={(e) => setOverseasMax(e.target.value)}
                className={`${INPUT_BASE_CLASS} font-mono tabular-nums`}
              />
            </FormField>

            <FormField id="settings-bid-timer" label="Bid timer (sec)" required>
              <input
                id="settings-bid-timer"
                type="number"
                min={5}
                max={120}
                value={bidTimer}
                disabled={savingSettings}
                onChange={(e) => setBidTimer(e.target.value)}
                className={`${INPUT_BASE_CLASS} font-mono tabular-nums`}
              />
            </FormField>
          </div>

          {settingsError && (
            <div
              role="alert"
              className="rounded-[4px] border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300"
            >
              {settingsError}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="gold"
              size="md"
              disabled={savingSettings}
            >
              {savingSettings ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Save room settings</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Change Room Password */}
        <Card brackets bracketTone="cyan" className="p-6">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <h2 className="font-display text-2xl tracking-wide text-[#22D3EE]">
              CHANGE ROOM PASSWORD
            </h2>
            <KeyRound className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
          </div>

          <form onSubmit={handleChangePassword} noValidate className="mt-5 space-y-4">
            <FormField id="settings-new-password" label="New password" required>
              <input
                id="settings-new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                disabled={savingPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new room password"
                className={INPUT_BASE_CLASS}
              />
            </FormField>

            <FormField id="settings-confirm-password" label="Confirm password" required>
              <input
                id="settings-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                disabled={savingPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter room password"
                className={INPUT_BASE_CLASS}
              />
            </FormField>

            {passwordError && (
              <div
                role="alert"
                className="rounded-[4px] border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300"
              >
                {passwordError}
              </div>
            )}

            <Button
              type="submit"
              variant="cyan"
              size="md"
              disabled={savingPassword}
            >
              {savingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <span>Update password</span>
              )}
            </Button>
          </form>
        </Card>

        {/* Host Profile */}
        <Card brackets bracketTone="subtle" className="p-6">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              HOST PROFILE
            </h2>
            <User className="h-4 w-4 text-[#8B95AA]" aria-hidden="true" />
          </div>

          <form onSubmit={handleSaveProfile} noValidate className="mt-5 space-y-4">
            <FormField id="settings-profile-email" label="Account email">
              <input
                id="settings-profile-email"
                type="email"
                value={profile?.email || ''}
                disabled
                className={INPUT_BASE_CLASS}
              />
            </FormField>

            <FormField id="settings-profile-name" label="Full name" required>
              <input
                id="settings-profile-name"
                type="text"
                value={fullName}
                disabled={savingProfile}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Host full name"
                className={INPUT_BASE_CLASS}
              />
            </FormField>

            {profileError && (
              <div
                role="alert"
                className="rounded-[4px] border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300"
              >
                {profileError}
              </div>
            )}

            <Button
              type="submit"
              variant="outline"
              size="md"
              disabled={savingProfile}
            >
              {savingProfile ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save profile</span>
              )}
            </Button>
          </form>
        </Card>
      </div>

      {/* Anti-Cheat Enforcement */}
      <Card brackets bracketTone="cyan" className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-2.5">
            <Shield className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
            <h2 className="font-display text-2xl tracking-wide text-[#22D3EE]">
              ANTI-CHEAT ENFORCEMENT
            </h2>
          </div>
          <Badge tone={(room.anticheat_enabled ?? true) ? 'cyan' : 'gold'}>
            {(room.anticheat_enabled ?? true) ? 'ANTI-CHEAT ON' : 'ANTI-CHEAT OFF'}
          </Badge>
        </div>

        <div className="mt-5">
          <EnforcementControl
            roomId={room.id}
            enabled={room.anticheat_enabled ?? true}
          />
        </div>
      </Card>

      {/* Danger Panel */}
      <Card className="border-red-500/35 bg-red-500/5 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <div>
              <h2 className="font-display text-2xl tracking-wide text-red-300">
                DANGER ZONE
              </h2>
              <p className="mt-1 text-xs text-[#8B95AA]">
                Wipe all sales, bids, and restore purses back to Set 1 standby. Teams and members remain intact.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="md"
            onClick={() => setFullResetOpen(true)}
            className="border-red-500/50 text-red-300 hover:border-red-400 hover:bg-red-500/15 hover:text-red-200"
          >
            Full auction reset
          </Button>
        </div>
      </Card>

      <FullResetModal
        open={fullResetOpen}
        onClose={() => setFullResetOpen(false)}
        roomId={room.id}
        onSuccess={async () => {
          await Promise.all([
            refreshRoom(),
            refreshTeamsAndFinances(),
            refreshRoomPlayers(),
          ]);
        }}
      />
    </div>
  );
}
