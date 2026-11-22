import {
  AlertTriangle,
  Loader2,
  Maximize2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  MyTeamStatus,
  ReportViolationResult,
  ViolationType,
} from '../../types/database';
import { supabase } from '../../lib/supabase';
import { useToastStore } from '../../store/toast';
import { TeamCrest } from '../host/TeamCrest';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { CornerBrackets } from '../ui/CornerBrackets';

type GuardMode = 'gate' | 'armed' | 'violation';

export interface FullscreenGuardProps {
  roomId: string;
  team: {
    id: string | null;
    short_code: string | null;
    name: string | null;
  };
  anticheatEnabled: boolean;
  onRemoved: (status: MyTeamStatus | null, fallbackType?: ViolationType) => void;
  onAnticheatDisabled: () => void;
  children: React.ReactNode;
}

interface PendingViolation {
  type: ViolationType;
  details: string | null;
}

const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 1500;
const RPC_TIMEOUT_MS = 8000;
const BLUR_FILTER_MS = 500;

function normalizeReportResult(data: unknown): ReportViolationResult {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    return { removed: false };
  }
  const r = row as Record<string, unknown>;
  return {
    removed: Boolean(r.removed),
    enforced: typeof r.enforced === 'boolean' ? r.enforced : undefined,
  };
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

async function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error('Request timed out'));
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

export function FullscreenGuard({
  roomId,
  team,
  anticheatEnabled,
  onRemoved,
  onAnticheatDisabled,
  children,
}: FullscreenGuardProps) {
  const showToast = useToastStore((s) => s.showToast);

  const [mode, setMode] = useState<GuardMode>(() => {
    if (!anticheatEnabled) return 'armed';
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      return 'armed';
    }
    return 'gate';
  });

  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [enteringFullscreen, setEnteringFullscreen] = useState(false);

  const [pendingViolation, setPendingViolation] =
    useState<PendingViolation | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [isReportingNow, setIsReportingNow] = useState(false);

  const modeRef = useRef<GuardMode>(mode);
  const violationLockRef = useRef<boolean>(false);
  const blurTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const mountedRef = useRef<boolean>(true);
  const lastToastedErrRef = useRef<string | null>(null);
  const activeRunTokenRef = useRef<number>(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRunTokenRef.current += 1;
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  // Sync mode when anticheatEnabled changes dynamically
  useEffect(() => {
    if (!anticheatEnabled) {
      violationLockRef.current = false;
      activeRunTokenRef.current += 1;
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setPendingViolation(null);
      setConnectionLost(false);
      setIsReportingNow(false);
      modeRef.current = 'armed';
      setMode('armed');
      return;
    }

    if (modeRef.current !== 'violation') {
      const nextMode: GuardMode =
        typeof document !== 'undefined' && document.fullscreenElement
          ? 'armed'
          : 'gate';
      modeRef.current = nextMode;
      setMode(nextMode);
    }
  }, [anticheatEnabled]);

  const reportViolationSequence = useCallback(
    async (violation: PendingViolation) => {
      if (!supabase || !roomId) return;

      const runToken = ++activeRunTokenRef.current;
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      setConnectionLost(
        typeof navigator !== 'undefined' && navigator.onLine === false,
      );
      setIsReportingNow(true);

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        if (!mountedRef.current || activeRunTokenRef.current !== runToken) {
          return;
        }

        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          setConnectionLost(true);
          setIsReportingNow(false);
          return;
        }

        try {
          const { data, error } = await withTimeout(
            supabase.rpc('report_violation', {
              p_room: roomId,
              p_type: violation.type,
              p_details: violation.details,
            }),
            RPC_TIMEOUT_MS,
          );

          if (!mountedRef.current || activeRunTokenRef.current !== runToken) {
            return;
          }

          if (error) {
            const msg = error.message || 'Failed to report violation.';
            if (lastToastedErrRef.current !== msg) {
              lastToastedErrRef.current = msg;
              showToast({
                title: 'Violation report error',
                description: msg,
                tone: 'error',
              });
            }
            throw new Error(msg);
          }

          const result = normalizeReportResult(data);

          // Server reports anti-cheat is disabled and team was not removed -> back to gate
          if (result.enforced === false && !result.removed) {
            violationLockRef.current = false;
            setPendingViolation(null);
            setConnectionLost(false);
            setIsReportingNow(false);
            modeRef.current = 'gate';
            setMode('gate');
            onAnticheatDisabled();
            return;
          }

          if (result.removed) {
            // Exit fullscreen cleanly before showing RemovedScreen
            try {
              if (
                document.fullscreenElement &&
                typeof document.exitFullscreen === 'function'
              ) {
                void document.exitFullscreen().catch(() => {});
              }
            } catch {
              // ignore fullscreen exit error
            }

            let freshStatus: MyTeamStatus | null = null;
            try {
              const statusRes = await withTimeout(
                supabase.rpc('get_my_team_status', { p_room: roomId }),
                RPC_TIMEOUT_MS,
              );
              if (!statusRes.error) {
                freshStatus = normalizeTeamStatus(statusRes.data);
              }
            } catch {
              // Fallback handled by PlayLayout using fallbackType
            }

            if (!mountedRef.current || activeRunTokenRef.current !== runToken) {
              return;
            }
            onRemoved(freshStatus, violation.type);
            return;
          }

          // Fallback: if neither removed nor disabled, return to gate cleanly
          violationLockRef.current = false;
          setPendingViolation(null);
          setConnectionLost(false);
          setIsReportingNow(false);
          modeRef.current = 'gate';
          setMode('gate');
          return;
        } catch {
          if (!mountedRef.current || activeRunTokenRef.current !== runToken) {
            return;
          }
          setConnectionLost(true);

          if (attempt < MAX_RETRIES) {
            await new Promise<void>((resolve) => {
              retryTimerRef.current = window.setTimeout(() => {
                retryTimerRef.current = null;
                resolve();
              }, RETRY_DELAY_MS);
            });
          }
        }
      }

      if (mountedRef.current && activeRunTokenRef.current === runToken) {
        setConnectionLost(true);
        setIsReportingNow(false);
      }
    },
    [roomId, onRemoved, onAnticheatDisabled, showToast],
  );

  const triggerViolation = useCallback(
    (type: ViolationType, details: string | null) => {
      if (violationLockRef.current || modeRef.current !== 'armed') {
        return;
      }

      violationLockRef.current = true;
      modeRef.current = 'violation';

      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }

      const violation: PendingViolation = { type, details };
      lastToastedErrRef.current = null;
      setPendingViolation(violation);
      setMode('violation');
      void reportViolationSequence(violation);
    },
    [reportViolationSequence],
  );

  // Retry violation reporting automatically when browser comes back online or periodically if stuck reconnecting
  useEffect(() => {
    if (mode !== 'violation' || !pendingViolation) return;

    const handleOnline = () => {
      void reportViolationSequence(pendingViolation);
    };
    window.addEventListener('online', handleOnline);

    const reconnectIntervalId = window.setInterval(() => {
      if (
        connectionLost &&
        !isReportingNow &&
        (typeof navigator === 'undefined' || navigator.onLine !== false)
      ) {
        void reportViolationSequence(pendingViolation);
      }
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.clearInterval(reconnectIntervalId);
    };
  }, [
    mode,
    pendingViolation,
    connectionLost,
    isReportingNow,
    reportViolationSequence,
  ]);

  // Register anti-cheat listeners ONLY while anticheatEnabled && mode === 'armed'
  useEffect(() => {
    if (!anticheatEnabled || mode !== 'armed') {
      return;
    }

    const handleFullscreenChange = () => {
      if (modeRef.current !== 'armed' || violationLockRef.current) return;
      if (!document.fullscreenElement) {
        triggerViolation('esc_fullscreen', null);
      }
    };

    const handleVisibilityChange = () => {
      if (modeRef.current !== 'armed' || violationLockRef.current) return;
      if (document.visibilityState === 'hidden') {
        triggerViolation('tab_switch', null);
      }
    };

    const handleWindowBlur = () => {
      if (modeRef.current !== 'armed' || violationLockRef.current) return;
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }
      blurTimerRef.current = window.setTimeout(() => {
        blurTimerRef.current = null;
        if (modeRef.current !== 'armed' || violationLockRef.current) return;
        if (!document.hasFocus()) {
          triggerViolation('tab_switch', 'window lost focus');
        }
      }, BLUR_FILTER_MS);
    };

    const handleWindowFocus = () => {
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    // Guard against exiting fullscreen between state commit and effect attach
    if (!document.fullscreenElement) {
      triggerViolation('esc_fullscreen', null);
    }

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
    };
  }, [anticheatEnabled, mode, triggerViolation]);

  const handleEnterFullscreen = async () => {
    if (enteringFullscreen) return;
    setFullscreenError(null);
    setEnteringFullscreen(true);

    try {
      const el = document.documentElement;
      if (!el || typeof el.requestFullscreen !== 'function') {
        setFullscreenError(
          'Fullscreen mode is not supported in this browser.',
        );
        return;
      }

      await el.requestFullscreen();

      if (!mountedRef.current) return;

      if (document.fullscreenElement) {
        violationLockRef.current = false;
        modeRef.current = 'armed';
        setMode('armed');
      } else {
        setFullscreenError(
          'Fullscreen did not activate. Click the button again to continue.',
        );
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'The browser blocked fullscreen mode.';
      setFullscreenError(msg);
    } finally {
      if (mountedRef.current) {
        setEnteringFullscreen(false);
      }
    }
  };

  // Practice mode when anti-cheat is off
  if (!anticheatEnabled) {
    return (
      <>
        <div
          role="status"
          className="border-b border-[#F5B921]/40 bg-[#F5B921]/10 px-4 py-1.5 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#F5B921]"
        >
          PRACTICE MODE: anti-cheat is off
        </div>
        {children}
      </>
    );
  }

  // VIOLATION state: lock screen immediately, hide all page content
  if (mode === 'violation') {
    return (
      <div className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6">
        <div
          role="alert"
          className="relative w-full max-w-lg rounded-[4px] border-2 border-red-500 bg-[#0E1524] p-8 text-center"
        >
          <CornerBrackets tone="gold" size="md" />

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[4px] border border-red-500/60 bg-red-500/15 text-red-400">
            <ShieldAlert className="h-7 w-7" aria-hidden="true" />
          </div>

          <h1 className="mt-5 font-display text-4xl sm:text-5xl tracking-wide text-red-400">
            VIOLATION DETECTED
          </h1>

          <p className="mt-3 font-mono text-sm uppercase tracking-[0.08em] text-[#E8ECF4]">
            {connectionLost
              ? 'No connection. Reconnecting...'
              : 'Reporting to host...'}
          </p>

          <p className="mt-2 text-xs text-[#8B95AA]">
            {pendingViolation?.type === 'esc_fullscreen'
              ? 'Fullscreen mode was exited during an active session.'
              : 'Tab or window focus left the auction screen.'}
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            {isReportingNow ? (
              <div className="inline-flex items-center gap-2 rounded-[4px] border border-red-500/35 bg-red-500/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.08em] text-red-300">
                <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
                <span>Syncing with host...</span>
              </div>
            ) : (
              pendingViolation && (
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => void reportViolationSequence(pendingViolation)}
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Retry connection</span>
                </Button>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  // GATE state: hide all page content until user clicks to enter fullscreen
  if (mode === 'gate') {
    return (
      <div className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6">
        <div className="relative w-full max-w-xl rounded-[4px] border border-[#22D3EE]/50 bg-[#0E1524] p-7 sm:p-9">
          <CornerBrackets tone="cyan" size="md" />

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
            <Badge tone="cyan">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>FULLSCREEN SECURITY GATE</span>
            </Badge>
            {team.short_code && (
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#8B95AA]">
                FRANCHISE // {team.short_code}
              </span>
            )}
          </div>

          {/* Team Badge & Name */}
          <div className="mt-6 flex items-center gap-4">
            {team.short_code && (
              <TeamCrest shortCode={team.short_code} size="lg" />
            )}
            <div className="min-w-0">
              <h1 className="truncate font-display text-4xl sm:text-5xl leading-none tracking-wide text-[#E8ECF4]">
                {team.name || 'FRANCHISE CONSOLE'}
              </h1>
              <p className="mt-1.5 font-mono text-xs uppercase tracking-[0.08em] text-[#22D3EE]">
                ANTI-CHEAT ARMED ON ENTRY
              </p>
            </div>
          </div>

          {/* 4 Rules */}
          <ul className="mt-6 space-y-2.5 rounded-[4px] border border-white/[0.08] bg-[#070B14] p-5 text-sm text-[#E8ECF4]">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 font-mono text-xs font-bold text-[#F5B921]">
                01
              </span>
              <span>Stay in fullscreen</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 font-mono text-xs font-bold text-[#F5B921]">
                02
              </span>
              <span>Do not press Esc</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 font-mono text-xs font-bold text-[#F5B921]">
                03
              </span>
              <span>Do not switch tabs or windows</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 font-mono text-xs font-bold text-[#F5B921]">
                04
              </span>
              <span>
                Leaving removes your team immediately and needs host approval to
                re-enter
              </span>
            </li>
          </ul>

          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA]">
            F11 browser fullscreen does not count, only this button.
          </p>

          {fullscreenError && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-[4px] border border-red-500/40 bg-red-500/10 p-3.5 text-xs text-red-300"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <div className="space-y-1">
                <p className="font-semibold">{fullscreenError}</p>
                <p className="text-[#E8ECF4]/80">
                  Tip: Use a desktop Chrome or Edge browser and click the button
                  directly.
                </p>
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="cyan"
            size="lg"
            disabled={enteringFullscreen}
            onClick={() => void handleEnterFullscreen()}
            className="mt-6 h-14 w-full text-sm sm:text-base"
          >
            {enteringFullscreen ? (
              <>
                <Loader2 className="h-5 w-5 motion-safe:animate-spin" />
                <span>ACTIVATING FULLSCREEN...</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-5 w-5" />
                <span>ENTER FULLSCREEN AND CONTINUE</span>
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ARMED state: render wrapped play content
  return <>{children}</>;
}
