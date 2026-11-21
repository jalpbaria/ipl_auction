import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Gavel,
  Loader2,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FormField, INPUT_BASE_CLASS } from '../components/ui/FormField';
import { Modal } from '../components/ui/Modal';
import { formatLakhs } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import { useToastStore } from '../store/toast';
import type { DbTeam, DbTeamFinance } from '../types/database';

type MyTeamDetail = Pick<
  DbTeam,
  'id' | 'room_id' | 'short_code' | 'name' | 'leader_name' | 'status'
>;

type MyTeamFinance = Pick<DbTeamFinance, 'purse_left_lakhs' | 'spent_lakhs'>;

type RejoinStatus = 'idle' | 'requesting' | 'pending' | 'approved' | 'rejected';

function PlayRoomSkeleton() {
  return (
    <Card brackets bracketTone="cyan" className="p-6 sm:p-8" aria-busy="true">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-44 animate-pulse rounded-[2px] bg-[#141C2F]" />
          <div className="h-5 w-16 animate-pulse rounded-[2px] bg-[#141C2F]" />
        </div>
        <div className="h-4 w-32 animate-pulse rounded-[2px] bg-[#141C2F]" />
      </div>

      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2.5">
          <div className="h-3.5 w-36 animate-pulse rounded-[2px] bg-[#141C2F]" />
          <div className="h-10 w-64 animate-pulse rounded-[2px] bg-[#141C2F]" />
          <div className="h-3.5 w-44 animate-pulse rounded-[2px] bg-[#141C2F]" />
        </div>

        <div className="w-full sm:w-52 rounded-[4px] border border-white/[0.08] bg-[#070B14] px-5 py-3.5">
          <div className="h-3 w-28 animate-pulse rounded-[2px] bg-[#141C2F]" />
          <div className="mt-2 h-9 w-24 animate-pulse rounded-[2px] bg-[#141C2F]" />
          <div className="mt-2 h-3 w-20 animate-pulse rounded-[2px] bg-[#141C2F]" />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-5">
        <div className="h-3.5 w-60 animate-pulse rounded-[2px] bg-[#141C2F]" />
        <div className="flex items-center gap-3">
          <div className="h-8 w-20 animate-pulse rounded-[4px] bg-[#141C2F]" />
          <div className="h-8 w-20 animate-pulse rounded-[4px] bg-[#141C2F]" />
        </div>
      </div>
    </Card>
  );
}

export default function PlayRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const session = useAuthStore((s) => s.session);
  const showToast = useToastStore((s) => s.showToast);

  const [team, setTeam] = useState<MyTeamDetail | null>(null);
  const [finance, setFinance] = useState<MyTeamFinance | null>(null);
  const [financeMissing, setFinanceMissing] = useState(false);
  const [roomName, setRoomName] = useState<string>('Auction Room');
  const [noTeamFound, setNoTeamFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Re-entry request modal state (used when user is not an active member of this room)
  const [rejoinModalOpen, setRejoinModalOpen] = useState(false);
  const [rejoinRoomName, setRejoinRoomName] = useState('');
  const [rejoinPassword, setRejoinPassword] = useState('');
  const [rejoinCode, setRejoinCode] = useState('');
  const [rejoinStatus, setRejoinStatus] = useState<RejoinStatus>('idle');
  const [rejoinRequestId, setRejoinRequestId] = useState<string | null>(null);
  const [rejoinError, setRejoinError] = useState<string | null>(null);

  const requestSeqRef = useRef(0);

  const loadPlayData = useCallback(async () => {
    const requestSeq = ++requestSeqRef.current;

    if (!supabase || !roomId || !session?.user.id) {
      setTeam(null);
      setFinance(null);
      setFinanceMissing(false);
      setNoTeamFound(false);
      setError('Missing room or session details.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setNoTeamFound(false);
    setFinanceMissing(false);

    try {
      const { data: teamData, error: teamErr } = await supabase
        .from('teams')
        .select('id, room_id, short_code, name, leader_name, status')
        .eq('room_id', roomId)
        .eq('leader_id', session.user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (requestSeq !== requestSeqRef.current) return;

      if (teamErr) {
        setTeam(null);
        setFinance(null);
        setError(teamErr.message);
        return;
      }

      if (!teamData) {
        setTeam(null);
        setFinance(null);
        setNoTeamFound(true);

        // Best-effort room name lookup to pre-fill the re-entry modal if accessible
        const { data: roomLookup } = await supabase
          .from('rooms')
          .select('name')
          .eq('id', roomId)
          .maybeSingle();

        if (requestSeq !== requestSeqRef.current) return;
        if (roomLookup?.name) {
          setRoomName(roomLookup.name);
          setRejoinRoomName((prev) => prev || roomLookup.name);
        }
        return;
      }

      const myTeam = teamData as MyTeamDetail;
      setTeam(myTeam);

      const [financeRes, roomRes] = await Promise.all([
        supabase
          .from('team_finance')
          .select('purse_left_lakhs, spent_lakhs')
          .eq('team_id', myTeam.id)
          .maybeSingle(),
        supabase.from('rooms').select('name').eq('id', roomId).maybeSingle(),
      ]);

      if (requestSeq !== requestSeqRef.current) return;

      if (!roomRes.error && roomRes.data?.name) {
        setRoomName(roomRes.data.name);
      }

      if (financeRes.error) {
        setFinance(null);
        setFinanceMissing(false);
        setError(financeRes.error.message);
        return;
      }

      if (!financeRes.data) {
        setFinance(null);
        setFinanceMissing(true);
        return;
      }

      setFinance(financeRes.data as MyTeamFinance);
      setFinanceMissing(false);
    } catch (err) {
      if (requestSeq !== requestSeqRef.current) return;
      setError(err instanceof Error ? err.message : 'Unable to load franchise desk.');
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [roomId, session?.user.id]);

  useEffect(() => {
    void loadPlayData();
  }, [loadPlayData]);

  // Poll rejoin_requests every 5s while waiting for host approval
  useEffect(() => {
    if (rejoinStatus !== 'pending' || !rejoinRequestId || !supabase) {
      return;
    }

    let cancelled = false;

    const pollStatus = async () => {
      if (!supabase || cancelled) return;
      const { data, error: pollErr } = await supabase
        .from('rejoin_requests')
        .select('status')
        .eq('id', rejoinRequestId)
        .maybeSingle();

      if (cancelled || pollErr || !data) return;

      const status = String(data.status || '').toLowerCase();
      if (status === 'approved') {
        setRejoinStatus('approved');
        showToast({
          title: 'Re-entry approved',
          description: 'Ask the host for your new code, then join from Rooms.',
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

  const handleOpenRejoinModal = () => {
    setRejoinError(null);
    if (!rejoinRoomName && roomName !== 'Auction Room') {
      setRejoinRoomName(roomName);
    }
    setRejoinModalOpen(true);
  };

  const handleSubmitRejoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    const trimmedRoom = rejoinRoomName.trim();
    const trimmedCode = rejoinCode.trim().toUpperCase();

    if (!trimmedRoom || !rejoinPassword || !trimmedCode) {
      setRejoinError('Enter the room name, room password, and your team code.');
      return;
    }

    setRejoinError(null);
    setRejoinStatus('requesting');

    try {
      const { data, error: rpcErr } = await supabase.rpc('request_rejoin', {
        p_room_name: trimmedRoom,
        p_password: rejoinPassword,
        p_team_code: trimmedCode,
      });

      if (rpcErr) {
        setRejoinStatus('idle');
        setRejoinError(rpcErr.message || 'Could not submit re-entry request.');
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
    <div className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid">
      <header className="border-b border-white/[0.08] bg-[#070B14]">
        <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="font-display text-2xl tracking-[0.06em] text-[#E8ECF4]"
          >
            IPL <span className="text-[#F5B921]">AUCTION</span>
          </Link>

          <Link to="/rooms">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to rooms</span>
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col px-4 py-12 sm:px-6 lg:px-8">
        {loading ? (
          <PlayRoomSkeleton />
        ) : error ? (
          <Card brackets bracketTone="cyan" className="p-8">
            <Badge tone="danger">FRANCHISE ACCESS ERROR</Badge>
            <h1 className="mt-3 font-display text-3xl tracking-wide text-[#E8ECF4]">
              UNABLE TO LOAD TEAM CONSOLE
            </h1>
            <p className="mt-2 text-sm text-red-300">{error}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button variant="cyan" size="sm" onClick={() => void loadPlayData()}>
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry</span>
              </Button>
              <Link to="/rooms">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to rooms</span>
                </Button>
              </Link>
            </div>
          </Card>
        ) : noTeamFound || !team ? (
          <Card brackets bracketTone="gold" className="p-8">
            <Badge tone="gold">NO ACTIVE FRANCHISE SEAT</Badge>
            <h1 className="mt-3 font-display text-3xl tracking-wide text-[#E8ECF4]">
              ROOM ACCESS REQUIRED
            </h1>
            <p className="mt-2 text-sm text-[#8B95AA]">
              You are not an active member of this room
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link to="/rooms">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to rooms</span>
                </Button>
              </Link>
              <Button variant="gold" size="sm" onClick={handleOpenRejoinModal}>
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Request re-entry</span>
              </Button>
            </div>
          </Card>
        ) : (
          <Card brackets bracketTone="cyan" className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-2.5">
                <Badge tone="cyan">FRANCHISE CONSOLE</Badge>
                <Badge tone="gold">{team.status}</Badge>
              </div>
              <span className="font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
                {roomName}
              </span>
            </div>

            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#22D3EE]">
                  FRANCHISE CODE // {team.short_code}
                </p>
                <h1 className="mt-1 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
                  {team.name}
                </h1>
                {team.leader_name && (
                  <p className="mt-1.5 font-mono text-xs uppercase tracking-[0.08em] text-[#8B95AA]">
                    LEADER: {team.leader_name}
                  </p>
                )}
              </div>

              <div className="rounded-[4px] border border-[#F5B921]/35 bg-[#070B14] px-5 py-3.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                  PURSE REMAINING
                </p>
                {financeMissing || !finance ? (
                  <div className="mt-1.5 space-y-2">
                    <div className="flex items-center gap-2 font-mono text-sm font-semibold text-red-300">
                      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>Unavailable</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void loadPlayData()}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Retry</span>
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="mt-1 font-display text-4xl tracking-wide text-[#F5B921] tabular-nums">
                      {formatLakhs(finance.purse_left_lakhs)}
                    </p>
                    <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA] tabular-nums">
                      SPENT {formatLakhs(finance.spent_lakhs)}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#8B95AA]">
                FRANCHISE CONSOLE READY
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link to={`/play/${roomId}/auction`}>
                  <Button variant="gold" size="sm">
                    <Gavel className="h-3.5 w-3.5" />
                    <span>Enter auction room</span>
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => void loadPlayData()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Refresh</span>
                </Button>
                <Link to="/rooms">
                  <Button variant="outline" size="sm">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back to rooms</span>
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        )}
      </main>

      {/* Request Re-entry Modal */}
      <Modal
        open={rejoinModalOpen}
        onClose={() => rejoinStatus !== 'requesting' && setRejoinModalOpen(false)}
        eyebrow="REMOVED TEAM RECOVERY"
        title="REQUEST RE-ENTRY"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSubmitRejoin} className="space-y-4">
          <p className="text-sm text-[#8B95AA]">
            If your franchise was removed from this room, submit your previous code to
            request host approval for a new one-time code.
          </p>

          <FormField id="rejoin-room-name" label="Room name" required>
            <input
              id="rejoin-room-name"
              type="text"
              value={rejoinRoomName}
              disabled={rejoinStatus === 'requesting' || rejoinStatus === 'pending'}
              onChange={(e) => setRejoinRoomName(e.target.value)}
              placeholder="TechFest-IPL-2026"
              className={INPUT_BASE_CLASS}
            />
          </FormField>

          <FormField id="rejoin-room-password" label="Room password" required>
            <input
              id="rejoin-room-password"
              type="password"
              value={rejoinPassword}
              disabled={rejoinStatus === 'requesting' || rejoinStatus === 'pending'}
              onChange={(e) => setRejoinPassword(e.target.value)}
              placeholder="Shared room secret"
              className={INPUT_BASE_CLASS}
            />
          </FormField>

          <FormField id="rejoin-team-code" label="Previous team code" required>
            <input
              id="rejoin-team-code"
              type="text"
              value={rejoinCode}
              disabled={rejoinStatus === 'requesting' || rejoinStatus === 'pending'}
              onChange={(e) => setRejoinCode(e.target.value.toUpperCase())}
              placeholder="CSK-8492"
              className={`${INPUT_BASE_CLASS} font-mono uppercase tracking-[0.08em]`}
            />
          </FormField>

          {rejoinError && (
            <p role="alert" className="text-xs text-red-400">
              {rejoinError}
            </p>
          )}

          {rejoinStatus === 'pending' && (
            <div className="flex items-center gap-2 rounded-[4px] border border-[#F5B921]/35 bg-[#F5B921]/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#F5B921]">
              <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
              <span>PENDING HOST APPROVAL (CHECKING EVERY 5S)...</span>
            </div>
          )}

          {rejoinStatus === 'approved' && (
            <div className="flex items-start gap-2 rounded-[4px] border border-emerald-400/40 bg-emerald-500/10 p-3 text-xs text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                The host approved your request. Get your new one-time code from the host
                and join again from the Rooms page.
              </span>
            </div>
          )}

          {rejoinStatus === 'rejected' && (
            <div className="flex items-start gap-2 rounded-[4px] border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>The host declined your re-entry request.</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={rejoinStatus === 'requesting'}
              onClick={() => setRejoinModalOpen(false)}
            >
              Close
            </Button>
            {rejoinStatus !== 'pending' && rejoinStatus !== 'approved' && (
              <Button
                type="submit"
                variant="gold"
                size="sm"
                disabled={rejoinStatus === 'requesting'}
              >
                {rejoinStatus === 'requesting' ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>Send request</span>
                )}
              </Button>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
