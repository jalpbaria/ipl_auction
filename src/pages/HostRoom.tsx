import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { CornerBrackets } from '../components/ui/CornerBrackets';
import { formatLakhs } from '../lib/format';
import { supabase } from '../lib/supabase';

interface RoomDetail {
  id: string;
  name: string;
  status: string;
  purse_lakhs?: number | null;
}

interface TeamRow {
  id: string;
  code: string;
  name: string;
  status: string;
  leader_name?: string | null;
}

export default function HostRoom() {
  const { roomId } = useParams<{ roomId: string }>();

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHostData = useCallback(async () => {
    if (!supabase || !roomId) {
      setError('Missing room identifier.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [roomRes, teamsRes] = await Promise.all([
        supabase
          .from('rooms')
          .select('id, name, status, purse_lakhs')
          .eq('id', roomId)
          .single(),
        supabase
          .from('teams')
          .select('id, code, name, status, leader_name')
          .eq('room_id', roomId)
          .order('code', { ascending: true }),
      ]);

      if (roomRes.error) {
        throw new Error(roomRes.error.message || 'Unable to load room details.');
      }
      if (teamsRes.error) {
        throw new Error(teamsRes.error.message || 'Unable to load room teams.');
      }

      setRoom(roomRes.data as RoomDetail);
      setTeams((teamsRes.data as TeamRow[]) ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch host room data.',
      );
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void loadHostData();
  }, [loadHostData]);

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
              <span>Back to Rooms</span>
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6 lg:px-8">
        {loading ? (
          <Card brackets bracketTone="gold" className="p-10 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#F5B921]" />
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.12em] text-[#8B95AA]">
              LOADING HOST ROOM TELEMETRY...
            </p>
          </Card>
        ) : error ? (
          <Card brackets bracketTone="gold" className="p-8">
            <Badge tone="danger">ACCESS ERROR</Badge>
            <h1 className="mt-3 font-display text-3xl tracking-wide text-[#E8ECF4]">
              UNABLE TO LOAD HOST ROOM
            </h1>
            <p className="mt-2 text-sm text-red-300">{error}</p>
            <div className="mt-6 flex items-center gap-3">
              <Button variant="gold" size="sm" onClick={() => void loadHostData()}>
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry</span>
              </Button>
              <Link to="/rooms">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back</span>
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Room Header Card */}
            <Card brackets bracketTone="gold" className="p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    <Badge tone="gold">HOST CONSOLE PLACEHOLDER</Badge>
                    {room?.status && <Badge tone="cyan">{room.status}</Badge>}
                  </div>
                  <h1 className="mt-3 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
                    {room?.name || 'AUCTION ROOM'}
                  </h1>
                  <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
                    ROOM ID: {room?.id}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  {typeof room?.purse_lakhs === 'number' && (
                    <div className="rounded-[4px] border border-white/[0.08] bg-[#070B14] px-4 py-2.5">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                        STARTING PURSE
                      </p>
                      <p className="mt-1 font-mono text-base font-semibold text-[#F5B921] tabular-nums">
                        {formatLakhs(room.purse_lakhs)}
                      </p>
                    </div>
                  )}
                  <Button variant="outline" size="sm" onClick={() => void loadHostData()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Refresh</span>
                  </Button>
                </div>
              </div>
            </Card>

            {/* 10 Teams List */}
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-3xl tracking-wide text-[#E8ECF4]">
                  FRANCHISE ROSTER ({teams.length})
                </h2>
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#8B95AA]">
                  HOST DASHBOARD CONTROLS COMING IN PHASE 3
                </span>
              </div>

              {teams.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
                    NO TEAMS FOUND FOR THIS ROOM
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {teams.map((team) => {
                    const isActive = team.status.toLowerCase() === 'active';
                    return (
                      <div
                        key={team.id}
                        className="relative rounded-[4px] border border-white/[0.08] bg-[#0E1524] p-4"
                      >
                        <CornerBrackets
                          tone={isActive ? 'cyan' : 'subtle'}
                          size="sm"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm font-bold text-[#F5B921]">
                            {team.code}
                          </span>
                          <Badge tone={isActive ? 'cyan' : 'neutral'}>
                            {team.status}
                          </Badge>
                        </div>
                        <p className="mt-2.5 text-sm font-semibold text-[#E8ECF4]">
                          {team.name}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-[#8B95AA]">
                          {team.leader_name
                            ? `LEADER: ${team.leader_name}`
                            : 'UNCLAIMED SEAT'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
