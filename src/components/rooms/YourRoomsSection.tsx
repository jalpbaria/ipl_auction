import { ArrowRight, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/auth';
import type { DbRoom, DbTeam } from '../../types/database';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type HostedRoomRow = Pick<DbRoom, 'id' | 'name' | 'created_at' | 'status'>;

type JoinedTeamRow = Pick<DbTeam, 'id' | 'room_id' | 'short_code' | 'name' | 'status'> & {
  rooms: Pick<DbRoom, 'name'> | Pick<DbRoom, 'name'>[] | null;
};

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function getRoomName(rooms: JoinedTeamRow['rooms']): string {
  if (!rooms) return 'Auction Room';
  if (Array.isArray(rooms)) return rooms[0]?.name || 'Auction Room';
  return rooms.name || 'Auction Room';
}

export function YourRoomsSection() {
  const userId = useAuthStore((s) => s.session?.user.id);

  const [hostedRooms, setHostedRooms] = useState<HostedRoomRow[]>([]);
  const [joinedTeams, setJoinedTeams] = useState<JoinedTeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    if (!supabase || !userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [hostedRes, teamsRes] = await Promise.all([
        supabase
          .from('rooms')
          .select('id, name, created_at, status')
          .eq('host_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('teams')
          .select('id, room_id, short_code, name, status, rooms(name)')
          .eq('leader_id', userId)
          .eq('status', 'active'),
      ]);

      if (hostedRes.error) {
        throw new Error(hostedRes.error.message);
      }
      if (teamsRes.error) {
        throw new Error(teamsRes.error.message);
      }

      setHostedRooms((hostedRes.data as HostedRoomRow[]) ?? []);
      setJoinedTeams((teamsRes.data as JoinedTeamRow[]) ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load your rooms right now.',
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  return (
    <section className="mt-10 border-t border-white/[0.08] pt-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8B95AA]">
            ACTIVE ASSIGNMENTS
          </p>
          <h2 className="mt-1 font-display text-3xl sm:text-4xl tracking-wide text-[#E8ECF4]">
            YOUR ROOMS
          </h2>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void loadRooms()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between gap-4 rounded-[4px] border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300"
        >
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void loadRooms()}>
            Retry
          </Button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Hosted Rooms */}
        <Card brackets bracketTone="gold" className="p-6">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
            <h3 className="font-display text-2xl tracking-wide text-[#F5B921]">
              HOSTED ROOMS
            </h3>
            <span className="font-mono text-[11px] text-[#8B95AA] tabular-nums">
              {hostedRooms.length} TOTAL
            </span>
          </div>

          {loading ? (
            <div className="mt-4 space-y-2.5">
              <div className="h-14 animate-pulse rounded-[4px] bg-[#141C2F]" />
              <div className="h-14 animate-pulse rounded-[4px] bg-[#141C2F]" />
            </div>
          ) : hostedRooms.length === 0 ? (
            <p className="mt-6 py-4 text-center font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
              NO HOSTED ROOMS YET — CREATE ONE ABOVE
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-white/[0.06]">
              {hostedRooms.map((room) => (
                <li
                  key={room.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-1 last:pb-1"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <p className="truncate font-sans text-sm font-semibold text-[#E8ECF4]">
                        {room.name}
                      </p>
                      <Badge tone="gold">{room.status}</Badge>
                    </div>
                    <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA] tabular-nums">
                      CREATED {formatShortDate(room.created_at)}
                    </p>
                  </div>

                  <Link to={`/host/${room.id}`}>
                    <Button variant="outline" size="sm">
                      <span>Open</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Teams I belong to */}
        <Card brackets bracketTone="cyan" className="p-6">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
            <h3 className="font-display text-2xl tracking-wide text-[#22D3EE]">
              TEAMS I BELONG TO
            </h3>
            <span className="font-mono text-[11px] text-[#8B95AA] tabular-nums">
              {joinedTeams.length} ACTIVE
            </span>
          </div>

          {loading ? (
            <div className="mt-4 space-y-2.5">
              <div className="h-14 animate-pulse rounded-[4px] bg-[#141C2F]" />
              <div className="h-14 animate-pulse rounded-[4px] bg-[#141C2F]" />
            </div>
          ) : joinedTeams.length === 0 ? (
            <p className="mt-6 py-4 text-center font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
              NO ACTIVE TEAM ASSIGNMENTS YET
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-white/[0.06]">
              {joinedTeams.map((team) => (
                <li
                  key={team.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-1 last:pb-1"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-bold text-[#22D3EE]">
                        {team.short_code}
                      </span>
                      <p className="truncate font-sans text-sm font-semibold text-[#E8ECF4]">
                        {team.name}
                      </p>
                      <Badge tone="cyan">{team.status}</Badge>
                    </div>
                    <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA]">
                      ROOM: {getRoomName(team.rooms)}
                    </p>
                  </div>

                  <Link to={`/play/${team.room_id}`}>
                    <Button variant="cyan" size="sm">
                      <span>Resume</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </section>
  );
}
