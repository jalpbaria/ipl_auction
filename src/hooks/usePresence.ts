import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { DbTeamPresence } from '../types/database';

const POLL_INTERVAL_MS = 8_000;
const ONLINE_WINDOW_MS = 20_000;
const CLOCK_SYNC_INTERVAL_MS = 60_000;

export interface UsePresenceResult {
  presenceByTeamId: Map<string, string>;
  isTeamOnline: (teamId: string) => boolean;
  getLastSeenAt: (teamId: string) => string | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Polls `team_presence` every 8 seconds for the room (non-realtime table).
 * A team is considered ONLINE if `last_seen_at` is within the last 20 seconds
 * using the server clock offset from `get_server_time()` (falling back to device clock).
 */
export function usePresence(roomId: string | undefined): UsePresenceResult {
  const [rows, setRows] = useState<DbTeamPresence[]>([]);
  const [offsetMs, setOffsetMs] = useState<number>(0);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const initialDoneRef = useRef(false);

  const syncServerClock = useCallback(async () => {
    if (!supabase) return;
    try {
      const t0 = Date.now();
      const { data, error: rpcErr } = await supabase.rpc('get_server_time');
      const t1 = Date.now();
      if (!mountedRef.current || rpcErr || !data) return;

      const serverMs = Date.parse(String(data));
      if (!Number.isNaN(serverMs)) {
        const midpoint = (t0 + t1) / 2;
        setOffsetMs(serverMs - midpoint);
      }
    } catch {
      // Fallback to device clock (offsetMs remains 0 or last good value)
    }
  }, []);

  const fetchPresence = useCallback(async () => {
    if (!roomId || !supabase) {
      if (mountedRef.current) setLoading(false);
      return;
    }

    try {
      const { data, error: queryErr } = await supabase
        .from('team_presence')
        .select('team_id, room_id, last_seen_at')
        .eq('room_id', roomId);

      if (!mountedRef.current) return;

      if (queryErr) {
        if (!initialDoneRef.current) {
          setError(queryErr.message || 'Unable to load team presence.');
        }
        return;
      }

      setRows((data as DbTeamPresence[]) ?? []);
      setNowTick(Date.now());
      setError(null);
      initialDoneRef.current = true;
    } catch (err) {
      if (!mountedRef.current) return;
      if (!initialDoneRef.current) {
        setError(err instanceof Error ? err.message : 'Unable to load team presence.');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [roomId]);

  const refetch = useCallback(async () => {
    await Promise.all([fetchPresence(), syncServerClock()]);
  }, [fetchPresence, syncServerClock]);

  useEffect(() => {
    mountedRef.current = true;
    initialDoneRef.current = false;

    if (!roomId || !supabase) {
      setLoading(false);
      return;
    }

    void syncServerClock();
    void fetchPresence();

    let pollTimer: number | null = null;
    let tickTimer: number | null = null;
    let clockTimer: number | null = null;

    const startTimers = () => {
      if (pollTimer === null) {
        pollTimer = window.setInterval(() => {
          if (document.visibilityState === 'hidden') return;
          void fetchPresence();
        }, POLL_INTERVAL_MS);
      }
      if (tickTimer === null) {
        tickTimer = window.setInterval(() => {
          if (document.visibilityState === 'hidden') return;
          setNowTick(Date.now());
        }, 4_000);
      }
      if (clockTimer === null) {
        clockTimer = window.setInterval(() => {
          if (document.visibilityState === 'hidden') return;
          void syncServerClock();
        }, CLOCK_SYNC_INTERVAL_MS);
      }
    };

    const stopTimers = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
      if (tickTimer !== null) {
        window.clearInterval(tickTimer);
        tickTimer = null;
      }
      if (clockTimer !== null) {
        window.clearInterval(clockTimer);
        clockTimer = null;
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'hidden') {
        stopTimers();
        return;
      }
      startTimers();
      void refetch();
    };

    if (document.visibilityState !== 'hidden') {
      startTimers();
    }

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      mountedRef.current = false;
      stopTimers();
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [roomId, fetchPresence, syncServerClock, refetch]);

  const presenceByTeamId = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.team_id, row.last_seen_at);
    }
    return map;
  }, [rows]);

  const isTeamOnline = useCallback(
    (teamId: string): boolean => {
      const lastSeen = presenceByTeamId.get(teamId);
      if (!lastSeen) return false;
      const lastSeenMs = Date.parse(lastSeen);
      if (Number.isNaN(lastSeenMs)) return false;
      const serverNowMs = nowTick + offsetMs;
      return serverNowMs - lastSeenMs <= ONLINE_WINDOW_MS;
    },
    [presenceByTeamId, nowTick, offsetMs],
  );

  const getLastSeenAt = useCallback(
    (teamId: string): string | null => {
      return presenceByTeamId.get(teamId) ?? null;
    },
    [presenceByTeamId],
  );

  return {
    presenceByTeamId,
    isTeamOnline,
    getLastSeenAt,
    loading,
    error,
    refetch,
  };
}
