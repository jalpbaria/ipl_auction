import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IPL_TEAMS } from '../../data/ipl-teams';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/auth';
import { useToastStore } from '../../store/toast';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { FormField, INPUT_BASE_CLASS } from '../ui/FormField';

const PICKER_ORDER = ['CSK', 'MI', 'RCB', 'KKR', 'DC', 'PBKS', 'RR', 'SRH', 'GT', 'LSG'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MEMBERS = 6;

interface MemberRow {
  id: string;
  name: string;
  email: string;
}

type RejoinStatus = 'idle' | 'requesting' | 'pending' | 'approved' | 'rejected';

function makeMemberRow(): MemberRow {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, name: '', email: '' };
}

export function JoinRoomPanel() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const showToast = useToastStore((s) => s.showToast);

  const orderedTeams = useMemo(() => {
    const map = new Map(IPL_TEAMS.map((t) => [t.code, t]));
    return PICKER_ORDER.map((code) => map.get(code)!).filter(Boolean);
  }, []);

  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [selectedTeamCode, setSelectedTeamCode] = useState<string>('');
  const [teamCode, setTeamCode] = useState('');
  const [leaderName, setLeaderName] = useState('');
  const [leaderEdited, setLeaderEdited] = useState(false);
  const [members, setMembers] = useState<MemberRow[]>([makeMemberRow()]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [codeAlreadyUsed, setCodeAlreadyUsed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Rejoin request workflow state
  const [rejoinRequestId, setRejoinRequestId] = useState<string | null>(null);
  const [rejoinStatus, setRejoinStatus] = useState<RejoinStatus>('idle');
  const [rejoinError, setRejoinError] = useState<string | null>(null);

  // Prefill leader name from profile once available
  useEffect(() => {
    if (!leaderEdited && profile?.full_name) {
      setLeaderName(profile.full_name);
    }
  }, [profile?.full_name, leaderEdited]);

  // Poll rejoin_requests table every 5 seconds while pending
  useEffect(() => {
    if (rejoinStatus !== 'pending' || !rejoinRequestId || !supabase) {
      return;
    }

    let cancelled = false;

    const pollStatus = async () => {
      if (!supabase || cancelled) return;
      const { data, error } = await supabase
        .from('rejoin_requests')
        .select('status')
        .eq('id', rejoinRequestId)
        .maybeSingle();

      if (cancelled || error || !data) return;

      const status = String(data.status || '').toLowerCase();
      if (status === 'approved') {
        setRejoinStatus('approved');
        showToast({
          title: 'Re-entry approved',
          description: 'Request your new one-time code from the host.',
          tone: 'success',
        });
      } else if (status === 'rejected' || status === 'declined') {
        setRejoinStatus('rejected');
        showToast({
          title: 'Re-entry declined',
          description: 'The host declined your re-entry request.',
          tone: 'error',
        });
      }
    };

    const intervalId = window.setInterval(() => {
      void pollStatus();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [rejoinStatus, rejoinRequestId, showToast]);

  const handleSelectTeam = (code: string) => {
    setSelectedTeamCode(code);
    setTeamCode(`${code}-`);
    setCodeAlreadyUsed(false);
    setRejoinStatus('idle');
    setRejoinRequestId(null);
    setRejoinError(null);
  };

  const handleAddMember = () => {
    if (members.length >= MAX_MEMBERS) return;
    setMembers((prev) => [...prev, makeMemberRow()]);
  };

  const handleRemoveMember = (id: string) => {
    setMembers((prev) => prev.filter((row) => row.id !== id));
  };

  const handleMemberChange = (id: string, field: 'name' | 'email', value: string) => {
    setMembers((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setCodeAlreadyUsed(false);
    setRejoinError(null);

    const errors: Record<string, string> = {};
    const trimmedRoom = roomName.trim();
    const trimmedCode = teamCode.trim().toUpperCase();
    const trimmedLeader = leaderName.trim();

    if (!trimmedRoom) {
      errors.roomName = 'Room name is required.';
    }
    if (!password) {
      errors.password = 'Room password is required.';
    }
    if (!trimmedCode || trimmedCode.endsWith('-')) {
      errors.teamCode = 'Enter your full one-time team code.';
    }
    if (!trimmedLeader) {
      errors.leaderName = 'Team leader name is required.';
    }

    const cleanedMembers: { name: string; email: string }[] = [];

    members.forEach((row, index) => {
      const mName = row.name.trim();
      const mEmail = row.email.trim();
      const hasAny = mName.length > 0 || mEmail.length > 0;
      if (!hasAny) return;

      if (!mName) {
        errors[`member-name-${index}`] = 'Member name is required.';
      }
      if (!mEmail) {
        errors[`member-email-${index}`] = 'Member email is required.';
      } else if (!EMAIL_REGEX.test(mEmail)) {
        errors[`member-email-${index}`] = 'Enter a valid email address.';
      }

      if (mName && mEmail && EMAIL_REGEX.test(mEmail)) {
        cleanedMembers.push({ name: mName, email: mEmail });
      }
    });

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

    // Attempt fullscreen inside user gesture click/submit flow
    const triggerFullscreen = () => {
      try {
        const el = document.documentElement;
        if (el && typeof el.requestFullscreen === 'function' && !document.fullscreenElement) {
          void el.requestFullscreen().catch(() => {});
        }
      } catch {
        // Ignore fullscreen denial in restricted iframes/browsers
      }
    };

    try {
      const { data, error } = await supabase.rpc('join_room', {
        p_room_name: trimmedRoom,
        p_password: password,
        p_team_code: trimmedCode,
        p_leader_name: trimmedLeader,
        p_members: cleanedMembers,
      });

      if (error) {
        const msg = error.message || 'Could not join room.';
        setServerError(msg);
        if (msg.toLowerCase().includes('already been used')) {
          setCodeAlreadyUsed(true);
        }
        return;
      }

      const roomId =
        typeof data === 'string'
          ? data
          : typeof data === 'object' && data !== null && 'room_id' in data
            ? String((data as { room_id: unknown }).room_id)
            : typeof data === 'object' && data !== null && 'id' in data
              ? String((data as { id: unknown }).id)
              : '';

      if (!roomId) {
        setServerError('Joined room, but no room ID was returned.');
        return;
      }

      triggerFullscreen();
      showToast({
        title: 'Franchise seat claimed',
        description: `Entered ${trimmedRoom} with code ${trimmedCode}.`,
        tone: 'success',
      });
      navigate(`/play/${roomId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error joining room.';
      setServerError(msg);
      if (msg.toLowerCase().includes('already been used')) {
        setCodeAlreadyUsed(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestRejoin = async () => {
    if (!supabase) return;
    setRejoinError(null);
    setRejoinStatus('requesting');

    try {
      const { data, error } = await supabase.rpc('request_rejoin', {
        p_room_name: roomName.trim(),
        p_password: password,
        p_team_code: teamCode.trim().toUpperCase(),
      });

      if (error) {
        setRejoinStatus('idle');
        setRejoinError(error.message || 'Could not submit re-entry request.');
        return;
      }

      const requestId =
        typeof data === 'string'
          ? data
          : typeof data === 'object' && data !== null && 'id' in data
            ? String((data as { id: unknown }).id)
            : '';

      if (!requestId) {
        setRejoinStatus('idle');
        setRejoinError('Request submitted, but no tracking ID was returned.');
        return;
      }

      setRejoinRequestId(requestId);
      setRejoinStatus('pending');
      showToast({
        title: 'Re-entry requested',
        description: 'Waiting for host approval...',
        tone: 'info',
      });
    } catch (err) {
      setRejoinStatus('idle');
      setRejoinError(
        err instanceof Error ? err.message : 'Failed to submit re-entry request.',
      );
    }
  };

  return (
    <Card brackets bracketTone="cyan" className="p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
        <div>
          <Badge tone="cyan">FRANCHISE PROTOCOL</Badge>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl tracking-wide text-[#22D3EE]">
            JOIN ROOM
          </h2>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] border border-[#22D3EE]/35 bg-[#22D3EE]/10 text-[#22D3EE]">
          <Shield className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-[#8B95AA]">
        Enter your room credentials and single-use franchise code. Selecting a crest
        pre-fills your code prefix—your final team assignment is determined by the code.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            id="join-room-name"
            label="Room name"
            required
            error={fieldErrors.roomName}
          >
            <input
              id="join-room-name"
              type="text"
              value={roomName}
              disabled={submitting}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="TechFest-IPL-2026"
              aria-invalid={Boolean(fieldErrors.roomName)}
              className={INPUT_BASE_CLASS}
            />
          </FormField>

          <FormField
            id="join-room-password"
            label="Room password"
            required
            error={fieldErrors.password}
          >
            <input
              id="join-room-password"
              type="password"
              value={password}
              disabled={submitting}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Shared room secret"
              aria-invalid={Boolean(fieldErrors.password)}
              className={INPUT_BASE_CLASS}
            />
          </FormField>
        </div>

        {/* 10 Team Crests Picker */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#E8ECF4]">
              Team picker
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#8B95AA]">
              PREFILLS CODE PREFIX
            </span>
          </div>

          <div
            role="radiogroup"
            aria-label="Select franchise crest"
            className="grid grid-cols-5 gap-2"
          >
            {orderedTeams.map((team) => {
              const isSelected = selectedTeamCode === team.code;
              return (
                <button
                  key={team.code}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={submitting}
                  onClick={() => handleSelectTeam(team.code)}
                  title={team.name}
                  className={`group relative flex flex-col items-center justify-center rounded-[4px] border px-2 py-2.5 transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE] ${
                    isSelected
                      ? 'border-[#22D3EE] bg-[#141C2F]'
                      : 'border-white/10 bg-[#070B14] hover:border-white/25'
                  }`}
                >
                  {/* Styled Crest Badge using team primary & secondary colors */}
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-[2px] border font-mono text-[10px] font-bold tracking-wider"
                    style={{
                      backgroundColor: team.primary,
                      borderColor: team.secondary,
                      color:
                        team.code === 'CSK' ? '#070B14' : '#FFFFFF',
                      boxShadow: `inset 0 -3px 0 0 ${team.secondary}`,
                    }}
                  >
                    {team.code}
                  </span>
                  <span
                    className={`mt-1.5 font-mono text-[10px] tracking-[0.06em] ${
                      isSelected ? 'text-[#22D3EE]' : 'text-[#8B95AA]'
                    }`}
                  >
                    {team.code}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            id="join-team-code"
            label="One-time team code"
            required
            error={fieldErrors.teamCode}
          >
            <input
              id="join-team-code"
              type="text"
              value={teamCode}
              disabled={submitting}
              onChange={(e) => {
                setTeamCode(e.target.value.toUpperCase());
                setCodeAlreadyUsed(false);
              }}
              placeholder="CSK-8492"
              aria-invalid={Boolean(fieldErrors.teamCode)}
              className={`${INPUT_BASE_CLASS} font-mono uppercase tracking-[0.08em]`}
            />
          </FormField>

          <FormField
            id="join-leader-name"
            label="Team leader name"
            required
            error={fieldErrors.leaderName}
          >
            <input
              id="join-leader-name"
              type="text"
              value={leaderName}
              disabled={submitting}
              onChange={(e) => {
                setLeaderEdited(true);
                setLeaderName(e.target.value);
              }}
              placeholder="Full name"
              aria-invalid={Boolean(fieldErrors.leaderName)}
              className={INPUT_BASE_CLASS}
            />
          </FormField>
        </div>

        {/* Members List (up to 6 rows) */}
        <div className="space-y-3 rounded-[4px] border border-white/[0.08] bg-[#070B14] p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#E8ECF4]">
                Squad members
              </span>
              <span className="ml-2 font-mono text-[11px] text-[#22D3EE] tabular-nums">
                {members.length} of {MAX_MEMBERS}
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting || members.length >= MAX_MEMBERS}
              onClick={handleAddMember}
              className="h-8 px-2.5 text-[11px]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add member</span>
            </Button>
          </div>

          {members.length === 0 ? (
            <p className="py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA]">
              NO ADDITIONAL MEMBERS LISTED — CLICK ADD MEMBER IF NEEDED
            </p>
          ) : (
            <div className="space-y-2.5">
              {members.map((member, index) => (
                <div
                  key={member.id}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
                >
                  <div>
                    <label htmlFor={`member-name-${index}`} className="sr-only">
                      Member {index + 1} name
                    </label>
                    <input
                      id={`member-name-${index}`}
                      type="text"
                      value={member.name}
                      disabled={submitting}
                      onChange={(e) =>
                        handleMemberChange(member.id, 'name', e.target.value)
                      }
                      placeholder={`Member ${index + 1} name`}
                      aria-invalid={Boolean(fieldErrors[`member-name-${index}`])}
                      className={`${INPUT_BASE_CLASS} py-2 text-xs`}
                    />
                    {fieldErrors[`member-name-${index}`] && (
                      <p className="mt-1 text-[11px] text-red-400">
                        {fieldErrors[`member-name-${index}`]}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor={`member-email-${index}`} className="sr-only">
                      Member {index + 1} email
                    </label>
                    <input
                      id={`member-email-${index}`}
                      type="email"
                      value={member.email}
                      disabled={submitting}
                      onChange={(e) =>
                        handleMemberChange(member.id, 'email', e.target.value)
                      }
                      placeholder={`member${index + 1}@college.edu`}
                      aria-invalid={Boolean(fieldErrors[`member-email-${index}`])}
                      className={`${INPUT_BASE_CLASS} py-2 text-xs`}
                    />
                    {fieldErrors[`member-email-${index}`] && (
                      <p className="mt-1 text-[11px] text-red-400">
                        {fieldErrors[`member-email-${index}`]}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleRemoveMember(member.id)}
                    aria-label={`Remove member ${index + 1}`}
                    className="inline-flex h-[34px] w-full sm:w-[34px] items-center justify-center rounded-[4px] border border-white/10 bg-[#0E1524] text-[#8B95AA] transition-colors hover:border-red-500/40 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-[#22D3EE]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {serverError && (
          <div
            role="alert"
            className="rounded-[4px] border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300"
          >
            {serverError}
          </div>
        )}

        {/* Code Already Used -> Re-entry Request Highlighted Panel */}
        {codeAlreadyUsed && (
          <div className="rounded-[4px] border border-[#F5B921]/50 bg-[#F5B921]/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F5B921]" />
              <div className="flex-1 space-y-3">
                <p className="text-xs leading-relaxed text-[#E8ECF4]">
                  This code was already used. If your team was removed from the room, you
                  can ask the host for permission to re-enter.
                </p>

                {rejoinError && (
                  <p className="text-xs text-red-300">{rejoinError}</p>
                )}

                {rejoinStatus === 'idle' || rejoinStatus === 'requesting' ? (
                  <Button
                    type="button"
                    variant="gold"
                    size="sm"
                    disabled={rejoinStatus === 'requesting'}
                    onClick={handleRequestRejoin}
                  >
                    {rejoinStatus === 'requesting' ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Sending request...</span>
                      </>
                    ) : (
                      <span>Request re-entry</span>
                    )}
                  </Button>
                ) : rejoinStatus === 'pending' ? (
                  <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#F5B921]">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>PENDING HOST APPROVAL (CHECKING EVERY 5S)...</span>
                  </div>
                ) : rejoinStatus === 'approved' ? (
                  <div className="flex items-start gap-2 rounded-[2px] border border-emerald-400/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      The host approved your request. Ask the host for your new one-time
                      code, then enter it above.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-[2px] border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-300">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>The host declined your request.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <Button
          type="submit"
          variant="cyan"
          size="lg"
          disabled={submitting}
          className="w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Entering auction room...</span>
            </>
          ) : (
            <span>Join room &amp; enter fullscreen</span>
          )}
        </Button>
      </form>
    </Card>
  );
}
