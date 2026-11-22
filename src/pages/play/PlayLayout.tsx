import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { FullscreenGuard } from '../../components/anticheat/FullscreenGuard';
import { RemovedScreen } from '../../components/anticheat/RemovedScreen';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';
import { useToastStore } from '../../store/toast';
import type {
  HeartbeatStatus,
  MyTeamStatus,
  ViolationType,
} from '../../types/database';

const HEARTBEAT_INTERVAL_MS = 5_000;
const LOAD_TIMEOUT_MS = 10_000;

function normalizeTeamStatus(data: unknown): MyTeamStatus | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  return {
    status: (r.status as HeartbeatStatus) ?? 'none',
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

export default function PlayLayout() {
  const { roomId } = useParams<{ roomId: string }>();
  const showToast = useToastStore((s) => s.showToast);

  const [teamStatus, setTeamStatus] = useState<MyTeamStatus | null>(null);
  const [anticheatEnabled, setAnticheatEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef<boolean>(true);
  const requestSeqRef = useRef<number>(0);
  const lastHeartbeatErrRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadStatus = useCallback(async () => {
    const seq = ++requestSeqRef.current;

    if (!supabase || !roomId) {
      setTeamStatus(null);
      setError('Missing room or Supabase configuration.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcErr } = await withTimeout(
        supabase.rpc('get_my_team_status', { p_room: roomId }),
        LOAD_TIMEOUT_MS,
        'Team verification',
      );

      if (!mountedRef.current || seq !== requestSeqRef.current) return;

      if (rpcErr) {
        showToast({
          title: 'Team status error',
          description: rpcErr.message,
          tone: 'error',
        });
        setError(rpcErr.message);
        return;
      }

      const parsed = normalizeTeamStatus(data) ?? {
        status: 'none',
        team_id: null,
        short_code: null,
        name: null,
        request_id: null,
        request_status: null,
        last_violation_type: null,
      };

      if (parsed.status === 'active') {
        const { data: roomRow, error: roomErr } = await withTimeout(
          supabase
            .from('rooms')
            .select('anticheat_enabled')
            .eq('id', roomId)
            .maybeSingle(),
          LOAD_TIMEOUT_MS,
          'Room settings lookup',
        );

        if (!mountedRef.current || seq !== requestSeqRef.current) return;

        if (roomErr) {
          showToast({
            title: 'Room settings error',
            description: roomErr.message,
            tone: 'error',
          });
          setError(roomErr.message);
          return;
        }

        const enabled =
          typeof roomRow?.anticheat_enabled === 'boolean'
            ? roomRow.anticheat_enabled
            : true;
        setAnticheatEnabled(enabled);
      }

      setTeamStatus(parsed);
    } catch (err) {
      if (!mountedRef.current || seq !== requestSeqRef.current) return;
      const msg =
        err instanceof Error ? err.message : 'Unable to load franchise status.';
      setError(msg);
    } finally {
      if (mountedRef.current && seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [roomId, showToast]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // 5-second team_heartbeat while status === 'active' (pauses offline, resumes immediately online)
  useEffect(() => {
    if (!supabase || !roomId || teamStatus?.status !== 'active') {
      return;
    }

    const client = supabase;
    let cancelled = false;
    let inFlight = false;

    const runHeartbeat = async () => {
      if (cancelled || inFlight) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return;
      }

      inFlight = true;
      try {
        const { data, error: hbErr } = await client.rpc('team_heartbeat', {
          p_room: roomId,
        });

        if (cancelled || !mountedRef.current) return;

        if (hbErr) {
          if (lastHeartbeatErrRef.current !== hbErr.message) {
            lastHeartbeatErrRef.current = hbErr.message;
            showToast({
              title: 'Heartbeat error',
              description: hbErr.message,
              tone: 'error',
            });
          }
          return;
        }

        lastHeartbeatErrRef.current = null;
        const nextStatus = String(data ?? '') as HeartbeatStatus;

        if (nextStatus === 'removed') {
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

          let updatedStatus: MyTeamStatus | null = null;
          try {
            const { data: statusData, error: statusErr } = await client.rpc(
              'get_my_team_status',
              { p_room: roomId },
            );
            if (!statusErr) {
              updatedStatus = normalizeTeamStatus(statusData);
            }
          } catch {
            // Fallback below
          }

          if (cancelled || !mountedRef.current) return;
          setTeamStatus((prev) =>
            updatedStatus ?? {
              status: 'removed',
              team_id: prev?.team_id ?? null,
              short_code: prev?.short_code ?? null,
              name: prev?.name ?? null,
              request_id: prev?.request_id ?? null,
              request_status: prev?.request_status ?? null,
              last_violation_type: prev?.last_violation_type ?? null,
            },
          );
          return;
        }

        if (nextStatus === 'none' || nextStatus === 'open') {
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

          setTeamStatus((prev) => ({
            status: nextStatus,
            team_id: prev?.team_id ?? null,
            short_code: prev?.short_code ?? null,
            name: prev?.name ?? null,
            request_id: prev?.request_id ?? null,
            request_status: prev?.request_status ?? null,
            last_violation_type: prev?.last_violation_type ?? null,
          }));
          return;
        }

        if (nextStatus === 'active') {
          const { data: roomRow } = await client
            .from('rooms')
            .select('anticheat_enabled')
            .eq('id', roomId)
            .maybeSingle();

          if (cancelled || !mountedRef.current) return;
          if (typeof roomRow?.anticheat_enabled === 'boolean') {
            setAnticheatEnabled(roomRow.anticheat_enabled);
          }
        }
      } finally {
        inFlight = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void runHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    const handleOnline = () => {
      void runHeartbeat();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
    };
  }, [roomId, teamStatus?.status, showToast]);

  const handleViolationRemoved = useCallback(
    (freshStatus: MyTeamStatus | null, fallbackType?: ViolationType) => {
      setTeamStatus((prev) =>
        freshStatus ?? {
          status: 'removed',
          team_id: prev?.team_id ?? null,
          short_code: prev?.short_code ?? null,
          name: prev?.name ?? null,
          request_id: prev?.request_id ?? null,
          request_status: prev?.request_status ?? null,
          last_violation_type: fallbackType ?? prev?.last_violation_type ?? null,
        },
      );
    },
    [],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6">
        <Card brackets bracketTone="cyan" className="w-full max-w-md p-8 text-center">
          <div className="mx-auto h-7 w-7 rounded-full border-2 border-[#22D3EE] border-t-transparent motion-safe:animate-spin" />
          <p className="mt-4 font-display text-3xl tracking-wide text-[#E8ECF4]">
            VERIFYING FRANCHISE SEAT
          </p>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-[#8B95AA]">
            CHECKING ROOM ACCESS &amp; ANTI-CHEAT STATUS...
          </p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6">
        <Card brackets bracketTone="gold" className="w-full max-w-lg p-8">
          <Badge tone="danger">FRANCHISE ACCESS ERROR</Badge>
          <h1 className="mt-3 font-display text-4xl tracking-wide text-[#E8ECF4]">
            UNABLE TO ENTER ROOM
          </h1>
          <p className="mt-2 text-sm text-red-300">{error}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="cyan" size="md" onClick={() => void loadStatus()}>
              <RefreshCw className="h-4 w-4" />
              <span>Retry</span>
            </Button>
            <Link to="/rooms">
              <Button variant="outline" size="md">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to rooms</span>
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!roomId || !teamStatus || teamStatus.status === 'none' || teamStatus.status === 'open') {
    return (
      <div className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6">
        <Card brackets bracketTone="gold" className="w-full max-w-lg p-8">
          <Badge tone="gold">NO ACTIVE FRANCHISE SEAT</Badge>
          <h1 className="mt-3 font-display text-4xl tracking-wide text-[#E8ECF4]">
            ROOM ACCESS REQUIRED
          </h1>
          <p className="mt-2 text-sm text-[#8B95AA]">
            You are not an active member of this room
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Link to="/rooms">
              <Button variant="outline" size="md">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to rooms</span>
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (teamStatus.status === 'removed') {
    return (
      <RemovedScreen
        roomId={roomId}
        teamStatus={teamStatus}
        onStatusUpdate={setTeamStatus}
        onRejoined={loadStatus}
      />
    );
  }

  return (
    <FullscreenGuard
      roomId={roomId}
      team={{
        id: teamStatus.team_id,
        short_code: teamStatus.short_code,
        name: teamStatus.name,
      }}
      anticheatEnabled={anticheatEnabled}
      onRemoved={handleViolationRemoved}
      onAnticheatDisabled={() => setAnticheatEnabled(false)}
    >
      <Outlet />
    </FullscreenGuard>
  );
}
