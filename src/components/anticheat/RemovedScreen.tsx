import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MyTeamStatus, RejoinWithCodeResult } from '../../types/database';
import { supabase } from '../../lib/supabase';
import { useToastStore } from '../../store/toast';
import { TeamCrest } from '../host/TeamCrest';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { CornerBrackets } from '../ui/CornerBrackets';
import { FormField, INPUT_BASE_CLASS } from '../ui/FormField';

export interface RemovedScreenProps {
  roomId: string;
  teamStatus: MyTeamStatus;
  onStatusUpdate: (next: MyTeamStatus) => void;
  onRejoined: () => Promise<void>;
}

const REQUEST_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 4_000;

function getViolationReasonLine(lastViolationType: string | null): string {
  if (lastViolationType === 'tab_switch') {
    return 'You switched tab or window';
  }
  if (lastViolationType === 'esc_fullscreen') {
    return 'You left fullscreen';
  }
  return 'The host removed your team';
}

function normalizeTeamStatus(data: unknown): MyTeamStatus | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  return {
    status: (r.status as MyTeamStatus['status']) ?? 'none',
    team_id: r.team_id ? String(r.team_id) : null,
    short_code: r.short_code ? String(r.short_code) : null,
    name: r.name ? String(r.name) : null,
    request_id: r.request_id ? String(r.request_id) : null,
    request_status:
      (r.request_status as MyTeamStatus['request_status']) ?? null,
    last_violation_type: r.last_violation_type
      ? String(r.last_violation_type)
      : null,
  };
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out. Please retry.`));
    }, ms);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

export function RemovedScreen({
  roomId,
  teamStatus,
  onStatusUpdate,
  onRejoined,
}: RemovedScreenProps) {
  const navigate = useNavigate();
  const showToast = useToastStore((s) => s.showToast);

  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const [rejoinCode, setRejoinCode] = useState('');
  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!supabase || !roomId) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    try {
      const { data, error } = await withTimeout(
        supabase.rpc('get_my_team_status', { p_room: roomId }),
        REQUEST_TIMEOUT_MS,
        'Status check',
      );
      if (!mountedRef.current) return;
      if (error) {
        showToast({
          title: 'Status check error',
          description: error.message,
          tone: 'error',
        });
        return;
      }

      const parsed = normalizeTeamStatus(data);
      if (!parsed) return;

      if (parsed.status === 'active') {
        await onRejoined();
        return;
      }
      onStatusUpdate(parsed);
    } catch {
      // Silent retry on next interval while pending
    }
  }, [roomId, onStatusUpdate, onRejoined, showToast]);

  // Poll get_my_team_status every 4s while request_status === 'pending'
  useEffect(() => {
    if (teamStatus.request_status !== 'pending') return;

    const intervalId = window.setInterval(() => {
      void refreshStatus();
    }, POLL_INTERVAL_MS);

    const handleOnline = () => {
      void refreshStatus();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
    };
  }, [teamStatus.request_status, refreshStatus]);

  const handleRequestRejoin = async () => {
    if (!supabase || !roomId || requesting) return;
    setRequesting(true);
    setRequestError(null);

    try {
      const { data, error } = await withTimeout(
        supabase.rpc('request_my_rejoin', { p_room: roomId }),
        REQUEST_TIMEOUT_MS,
        'Re-entry request',
      );

      if (!mountedRef.current) return;

      if (error) {
        const msg = error.message || 'Could not submit re-entry request.';
        if (msg.toLowerCase().includes('a request is already pending')) {
          onStatusUpdate({
            ...teamStatus,
            request_status: 'pending',
          });
          void refreshStatus();
          return;
        }

        setRequestError(msg);
        showToast({
          title: 'Re-entry request failed',
          description: msg,
          tone: 'error',
        });
        return;
      }

      const newRequestId =
        typeof data === 'string'
          ? data
          : typeof data === 'object' && data !== null && 'id' in data
            ? String((data as { id: unknown }).id)
            : teamStatus.request_id;

      onStatusUpdate({
        ...teamStatus,
        request_id: newRequestId,
        request_status: 'pending',
      });

      showToast({
        title: 'Re-entry requested',
        description: 'Waiting for host approval...',
        tone: 'info',
      });
    } catch (err) {
      if (!mountedRef.current) return;
      const msg =
        err instanceof Error ? err.message : 'Unable to send re-entry request.';
      setRequestError(msg);
      showToast({
        title: 'Re-entry request error',
        description: msg,
        tone: 'error',
      });
    } finally {
      if (mountedRef.current) {
        setRequesting(false);
      }
    }
  };

  const handleEnterRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !roomId || entering) return;

    const cleanCode = rejoinCode.trim().toUpperCase();
    if (!cleanCode) {
      setEnterError('Enter the new one-time code from the host.');
      return;
    }

    // Attempt fullscreen synchronously inside the SAME click handler before awaiting RPC
    try {
      const el = document.documentElement;
      if (
        el &&
        typeof el.requestFullscreen === 'function' &&
        !document.fullscreenElement
      ) {
        void el.requestFullscreen().catch(() => {});
      }
    } catch {
      // FullscreenGuard on /play/:roomId handles fallback if browser blocks fullscreen
    }

    setEntering(true);
    setEnterError(null);

    try {
      const { data, error } = await withTimeout(
        supabase.rpc('rejoin_with_code', {
          p_room: roomId,
          p_code: cleanCode,
        }),
        REQUEST_TIMEOUT_MS,
        'Rejoin room',
      );

      if (!mountedRef.current) return;

      if (error) {
        const msg = error.message || 'Invalid or expired re-entry code.';
        setEnterError(msg);
        showToast({
          title: 'Could not enter room',
          description: msg,
          tone: 'error',
        });
        return;
      }

      const raw = (Array.isArray(data) ? data[0] : data) as
        | RejoinWithCodeResult
        | null
        | undefined;
      const targetRoomId = raw?.room_id ? String(raw.room_id) : roomId;

      showToast({
        title: 'Re-entry confirmed',
        description: 'Franchise seat restored.',
        tone: 'success',
      });

      await onRejoined();
      if (mountedRef.current) {
        navigate(`/play/${targetRoomId}`, { replace: true });
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const msg =
        err instanceof Error ? err.message : 'Unable to enter room with code.';
      setEnterError(msg);
      showToast({
        title: 'Re-entry error',
        description: msg,
        tone: 'error',
      });
    } finally {
      if (mountedRef.current) {
        setEntering(false);
      }
    }
  };

  const handleBackToRooms = () => {
    try {
      if (
        document.fullscreenElement &&
        typeof document.exitFullscreen === 'function'
      ) {
        void document.exitFullscreen().catch(() => {});
      }
    } catch {
      // Ignore fullscreen exit failure
    }
    navigate('/rooms');
  };

  const reasonLine = getViolationReasonLine(teamStatus.last_violation_type);
  const reqStatus = teamStatus.request_status;

  return (
    <div className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6">
      <div className="relative w-full max-w-xl rounded-[4px] border border-red-500/60 bg-[#0E1524] p-7 sm:p-9">
        <CornerBrackets tone="gold" size="md" />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
          <Badge tone="danger">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            <span>REMOVED FROM THE ROOM</span>
          </Badge>

          {teamStatus.short_code && (
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#8B95AA]">
              SEAT // {teamStatus.short_code}
            </span>
          )}
        </div>

        {/* Team Badge & Name */}
        <div className="mt-6 flex items-center gap-4">
          {teamStatus.short_code ? (
            <TeamCrest shortCode={teamStatus.short_code} size="lg" />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[3px] border border-red-500/40 bg-red-500/10 text-red-400">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-display text-4xl sm:text-5xl leading-none tracking-wide text-[#E8ECF4]">
              {teamStatus.name || 'FRANCHISE SEAT LOCKED'}
            </h1>
            <p className="mt-2 font-mono text-xs uppercase tracking-[0.08em] text-red-300">
              {reasonLine}
            </p>
          </div>
        </div>

        {/* Re-entry Status Section */}
        <div className="mt-7 rounded-[4px] border border-white/[0.08] bg-[#070B14] p-5">
          {reqStatus === null && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-[#8B95AA]">
                Your franchise has been disconnected from the live auction. Request host
                approval to receive a new one-time re-entry code.
              </p>

              {requestError && (
                <p role="alert" className="text-xs text-red-300">
                  {requestError}
                </p>
              )}

              <Button
                type="button"
                variant="gold"
                size="lg"
                disabled={requesting}
                onClick={() => void handleRequestRejoin()}
                className="w-full"
              >
                {requesting ? (
                  <>
                    <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
                    <span>Sending request...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    <span>REQUEST RE-ENTRY</span>
                  </>
                )}
              </Button>
            </div>
          )}

          {reqStatus === 'pending' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-[4px] border border-[#F5B921]/35 bg-[#F5B921]/10 px-4 py-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#F5B921] motion-safe:animate-pulse" />
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-[#F5B921]">
                  Waiting for the host to approve...
                </p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#8B95AA]">
                  Checking automatically every 4s
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void refreshStatus()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Check now</span>
                </Button>
              </div>
            </div>
          )}

          {reqStatus === 'approved' && (
            <form onSubmit={handleEnterRoom} className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-[4px] border border-emerald-400/40 bg-emerald-500/10 px-3.5 py-3 text-xs text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Approved. Ask the host for your new one-time code.</span>
              </div>

              <FormField
                id="rejoin-new-code"
                label="New one-time code"
                required
                error={enterError || undefined}
              >
                <input
                  id="rejoin-new-code"
                  type="text"
                  value={rejoinCode}
                  disabled={entering}
                  onChange={(e) => setRejoinCode(e.target.value.toUpperCase())}
                  placeholder={
                    teamStatus.short_code
                      ? `${teamStatus.short_code}-XXXX`
                      : 'TEAM-XXXX'
                  }
                  autoComplete="off"
                  className={`${INPUT_BASE_CLASS} font-mono uppercase tracking-[0.12em]`}
                />
              </FormField>

              <Button
                type="submit"
                variant="cyan"
                size="lg"
                disabled={entering}
                className="w-full"
              >
                {entering ? (
                  <>
                    <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
                    <span>Entering room...</span>
                  </>
                ) : (
                  <span>ENTER ROOM</span>
                )}
              </Button>
            </form>
          )}

          {reqStatus === 'rejected' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-[4px] border border-red-500/40 bg-red-500/10 px-3.5 py-3 text-xs text-red-300">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>The host declined your request.</span>
              </div>

              {requestError && (
                <p role="alert" className="text-xs text-red-300">
                  {requestError}
                </p>
              )}

              <Button
                type="button"
                variant="gold"
                size="md"
                disabled={requesting}
                onClick={() => void handleRequestRejoin()}
                className="w-full"
              >
                {requesting ? (
                  <>
                    <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
                    <span>Sending request...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    <span>Ask again</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Always visible Back to rooms button */}
        <div className="mt-6 flex items-center justify-between border-t border-white/[0.08] pt-5">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
            NO FULLSCREEN REQUIRED TO EXIT
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleBackToRooms}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to rooms</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
