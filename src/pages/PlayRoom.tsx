import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { formatLakhs } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';

interface MyTeamDetail {
  id: string;
  code: string;
  name: string;
  status: string;
  room_id: string;
  rooms: { name: string } | { name: string }[] | null;
}

function getRoomName(rooms: MyTeamDetail['rooms']): string {
  if (!rooms) return 'Auction Room';
  if (Array.isArray(rooms)) return rooms[0]?.name || 'Auction Room';
  return rooms.name || 'Auction Room';
}

export default function PlayRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const userId = useAuthStore((s) => s.session?.user.id);

  const [team, setTeam] = useState<MyTeamDetail | null>(null);
  const [purseLeftLakhs, setPurseLeftLakhs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPlayData = useCallback(async () => {
    if (!supabase || !roomId || !userId) {
      setError('Missing room or session details.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: teamData, error: teamErr } = await supabase
        .from('teams')
        .select('id, code, name, status, room_id, rooms(name)')
        .eq('room_id', roomId)
        .eq('leader_id', userId)
        .single();

      if (teamErr || !teamData) {
        throw new Error(
          teamErr?.message || 'No active team found for your account in this room.',
        );
      }

      const typedTeam = teamData as MyTeamDetail;
      setTeam(typedTeam);

      const { data: financeData, error: financeErr } = await supabase
        .from('team_finance')
        .select('purse_left_lakhs')
        .eq('team_id', typedTeam.id)
        .single();

      if (financeErr) {
        throw new Error(
          financeErr.message || 'Unable to load franchise purse telemetry.',
        );
      }

      setPurseLeftLakhs(
        typeof financeData?.purse_left_lakhs === 'number'
          ? financeData.purse_left_lakhs
          : 0,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load franchise desk.',
      );
    } finally {
      setLoading(false);
    }
  }, [roomId, userId]);

  useEffect(() => {
    void loadPlayData();
  }, [loadPlayData]);

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

      <main className="mx-auto flex max-w-3xl flex-col px-4 py-12 sm:px-6 lg:px-8">
        {loading ? (
          <Card brackets bracketTone="cyan" className="p-10 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#22D3EE]" />
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.12em] text-[#8B95AA]">
              LOADING FRANCHISE CONSOLE...
            </p>
          </Card>
        ) : error ? (
          <Card brackets bracketTone="cyan" className="p-8">
            <Badge tone="danger">FRANCHISE ACCESS ERROR</Badge>
            <h1 className="mt-3 font-display text-3xl tracking-wide text-[#E8ECF4]">
              UNABLE TO LOAD TEAM CONSOLE
            </h1>
            <p className="mt-2 text-sm text-red-300">{error}</p>
            <div className="mt-6 flex items-center gap-3">
              <Button variant="cyan" size="sm" onClick={() => void loadPlayData()}>
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
          <Card brackets bracketTone="cyan" className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-2.5">
                <Badge tone="cyan">FRANCHISE CONSOLE PLACEHOLDER</Badge>
                {team?.status && <Badge tone="gold">{team.status}</Badge>}
              </div>
              <span className="font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
                {getRoomName(team?.rooms ?? null)}
              </span>
            </div>

            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#22D3EE]">
                  FRANCHISE CODE // {team?.code}
                </p>
                <h1 className="mt-1 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
                  {team?.name}
                </h1>
              </div>

              <div className="rounded-[4px] border border-[#F5B921]/35 bg-[#070B14] px-5 py-3.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                  PURSE REMAINING
                </p>
                <p className="mt-1 font-display text-4xl tracking-wide text-[#F5B921] tabular-nums">
                  {purseLeftLakhs !== null ? formatLakhs(purseLeftLakhs) : '—'}
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#8B95AA]">
                LIVE BIDDING &amp; FULLSCREEN LOCK COMING IN PHASE 3
              </p>
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => void loadPlayData()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Refresh</span>
                </Button>
                <Link to="/rooms">
                  <Button variant="outline" size="sm">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back</span>
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
