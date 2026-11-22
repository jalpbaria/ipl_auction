import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  ShieldAlert,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  GroundView,
  roomPlayerToGroundPlayer,
} from '../../components/ground/GroundView';
import { getTeamPalette, TeamCrest } from '../../components/host/TeamCrest';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import {
  getCategoryInfo,
  PLAYER_CATEGORIES,
  type PlayerSkill,
} from '../../data/categories';
import { formatLakhs } from '../../lib/format';
import {
  isSquadValid,
  MIN_ROLES,
  overseasCount,
  roleCounts,
  squadChecks,
  toSquadPlayers,
} from '../../lib/squadRules';
import { formatDateTime12h } from '../../lib/time';
import { useHostRoom } from '../../store/hostRoom';
import type { RoomPlayerWithPlayer } from '../../types/database';

const ROLE_ORDER: readonly { skill: PlayerSkill; plural: string }[] = [
  { skill: 'Wicketkeeper', plural: 'Wicketkeepers' },
  { skill: 'Batter', plural: 'Batters' },
  { skill: 'All-Rounder', plural: 'All-Rounders' },
  { skill: 'Bowler', plural: 'Bowlers' },
];

type SupplySeverity = 'shortage' | 'tight' | 'healthy';

export default function HostAnalysis() {
  const room = useHostRoom((s) => s.room);
  const teams = useHostRoom((s) => s.teams);
  const teamFinances = useHostRoom((s) => s.teamFinances);
  const roomPlayers = useHostRoom((s) => s.roomPlayers);
  const playingXis = useHostRoom((s) => s.playingXis);

  const [inspectedTeamId, setInspectedTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (!inspectedTeamId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInspectedTeamId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inspectedTeamId]);

  const financeByTeamId = useMemo(() => {
    const map = new Map<string, { purseLeft: number; spent: number }>();
    for (const f of teamFinances) {
      map.set(f.team_id, {
        purseLeft: f.purse_left_lakhs,
        spent: f.spent_lakhs,
      });
    }
    return map;
  }, [teamFinances]);

  const roomPlayerById = useMemo(() => {
    const map = new Map<string, RoomPlayerWithPlayer>();
    for (const rp of roomPlayers) {
      map.set(rp.id, rp);
    }
    return map;
  }, [roomPlayers]);

  const xiByTeamId = useMemo(() => {
    const map = new Map<string, (typeof playingXis)[number]>();
    for (const xi of playingXis) {
      map.set(xi.team_id, xi);
    }
    return map;
  }, [playingXis]);

  const teamAnalyses = useMemo(() => {
    if (!room) return [];
    return teams.map((team) => {
      const squad = toSquadPlayers(roomPlayers, team.id);
      const roles = roleCounts(squad);
      const overseas = overseasCount(squad);
      const checks = squadChecks(squad, room);
      const valid = isSquadValid(squad, room);
      const failedLabels = checks.filter((c) => !c.ok).map((c) => c.label);
      const finance = financeByTeamId.get(team.id);

      return {
        team,
        squad,
        roles,
        overseas,
        checks,
        valid,
        failedLabels,
        purseLeft: finance?.purseLeft ?? room.starting_purse_lakhs,
        spent: finance?.spent ?? 0,
      };
    });
  }, [room, teams, roomPlayers, financeByTeamId]);

  const supplyTiles = useMemo(() => {
    const activeAnalyses = teamAnalyses.filter((t) => t.team.status === 'active');

    return ROLE_ORDER.map(({ skill, plural }) => {
      const available = roomPlayers.filter(
        (rp) =>
          rp.players?.skill === skill &&
          (rp.status === 'pending' || rp.status === 'unsold' || rp.status === 'live'),
      ).length;

      let needed = 0;
      for (const entry of activeAnalyses) {
        needed += Math.max(0, MIN_ROLES[skill] - entry.roles[skill]);
      }

      const surplus = available - needed;
      let severity: SupplySeverity = 'healthy';
      if (surplus < 0) {
        severity = 'shortage';
      } else if (surplus <= Math.ceil(needed * 0.25)) {
        severity = 'tight';
      }

      return {
        skill,
        plural,
        available,
        needed,
        surplus,
        severity,
      };
    });
  }, [roomPlayers, teamAnalyses]);

  const poolByCategory = useMemo(() => {
    return PLAYER_CATEGORIES.map((cat) => {
      let pending = 0;
      let sold = 0;
      let unsold = 0;

      for (const rp of roomPlayers) {
        if (rp.players?.category !== cat.value) continue;
        if (rp.status === 'sold') {
          sold += 1;
        } else if (rp.status === 'unsold') {
          unsold += 1;
        } else {
          pending += 1;
        }
      }

      return {
        category: cat,
        pending,
        sold,
        unsold,
        total: pending + sold + unsold,
      };
    });
  }, [roomPlayers]);

  const inspectedAnalysis = useMemo(() => {
    if (!inspectedTeamId) return null;
    return teamAnalyses.find((a) => a.team.id === inspectedTeamId) ?? null;
  }, [inspectedTeamId, teamAnalyses]);

  const inspectedXi = useMemo(() => {
    if (!inspectedAnalysis) return null;
    return xiByTeamId.get(inspectedAnalysis.team.id) ?? null;
  }, [inspectedAnalysis, xiByTeamId]);

  const inspectedXiPlayers = useMemo(() => {
    if (!inspectedXi) return [];
    const list = [];
    for (const id of inspectedXi.room_player_ids) {
      const rp = roomPlayerById.get(id);
      if (!rp) continue;
      const gp = roomPlayerToGroundPlayer(rp);
      if (gp) list.push(gp);
    }
    return list;
  }, [inspectedXi, roomPlayerById]);

  if (!room) return null;

  const xiOverseasLimit = room.xi_overseas_max ?? room.overseas_max;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-white/[0.08] pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#22D3EE]">
          TOURNAMENT ANALYTICS // ROLE QUOTAS &amp; POOL DEPTH
        </p>
        <h1 className="mt-1.5 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
          SQUAD COMPOSITION AND SUPPLY MATRIX
        </h1>
        <p className="mt-1.5 text-sm text-[#8B95AA]">
          Cross-franchise role distribution, overseas quotas and auction supply warnings
        </p>
      </div>

      {/* Supply Warning Tiles */}
      <section aria-label="Role supply matrix" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {supplyTiles.map((tile) => {
          const isShortage = tile.severity === 'shortage';
          const isTight = tile.severity === 'tight';

          const chipLabel = isShortage
            ? 'SHORTAGE'
            : isTight
              ? 'TIGHT SUPPLY'
              : 'HEALTHY';

          const chipClass = isShortage
            ? 'border-red-500/40 bg-red-500/15 text-red-300'
            : isTight
              ? 'border-[#F5B921]/40 bg-[#F5B921]/15 text-[#F5B921]'
              : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';

          const borderTone = isShortage
            ? 'border-red-500/35'
            : isTight
              ? 'border-[#F5B921]/30'
              : 'border-white/[0.08]';

          return (
            <Card
              key={tile.skill}
              brackets
              bracketTone={isShortage ? 'gold' : isTight ? 'gold' : 'cyan'}
              className={`p-5 ${borderTone}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8B95AA]">
                  {tile.plural}
                </p>
                <span
                  className={`inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] ${chipClass}`}
                >
                  {isShortage && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
                  {chipLabel}
                </span>
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-4xl leading-none tracking-wide text-[#E8ECF4] tabular-nums">
                  {tile.available}
                </span>
                <span className="font-mono text-xs text-[#8B95AA] tabular-nums">
                  / {tile.needed} needed
                </span>
              </div>

              <p className="mt-2 font-mono text-[11px] text-[#8B95AA] tabular-nums">
                Net tournament surplus:{' '}
                <span
                  className={
                    isShortage
                      ? 'font-semibold text-red-400'
                      : isTight
                        ? 'font-semibold text-[#F5B921]'
                        : 'font-semibold text-emerald-400'
                  }
                >
                  {tile.surplus >= 0 ? `+${tile.surplus}` : tile.surplus}
                </span>
              </p>
            </Card>
          );
        })}
      </section>

      {/* 10-Franchise Tactical Comparison Table */}
      <Card brackets bracketTone="cyan" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Users className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
            <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              FRANCHISE TACTICAL COMPARISON
            </h2>
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA]">
            Min requirements: WK {MIN_ROLES.Wicketkeeper} · BAT {MIN_ROLES.Batter} · AR{' '}
            {MIN_ROLES['All-Rounder']} · BOWL {MIN_ROLES.Bowler} · Squad {room.squad_min}–
            {room.squad_max} · OS max {room.overseas_max}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-white/[0.08] bg-[#070B14]/80 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                <th className="px-4 py-3">Franchise</th>
                <th className="px-3 py-3 text-right">Purse Left</th>
                <th className="px-3 py-3 text-right">Total Spent</th>
                <th className="px-3 py-3 text-center">Squad</th>
                <th className="px-3 py-3 text-center">Overseas</th>
                <th className="px-3 py-3 text-center">Keepers</th>
                <th className="px-3 py-3 text-center">Batters</th>
                <th className="px-3 py-3 text-center">All-Rounders</th>
                <th className="px-3 py-3 text-center">Bowlers</th>
                <th className="px-3 py-3 text-center">Valid</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-sm">
              {teamAnalyses.map((row) => {
                const { team, squad, roles, overseas, valid, failedLabels, purseLeft, spent } =
                  row;
                const isOpen = team.status === 'open';
                const isRemoved = team.status === 'removed';

                return (
                  <tr
                    key={team.id}
                    className={`transition-colors hover:bg-[#141C2F]/60 ${
                      isOpen ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <TeamCrest shortCode={team.short_code} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[#E8ECF4] truncate">
                              {team.name}
                            </span>
                            {isRemoved && (
                              <Badge tone="danger">REMOVED</Badge>
                            )}
                            {isOpen && (
                              <Badge tone="neutral">OPEN</Badge>
                            )}
                          </div>
                          <p className="font-mono text-[10px] text-[#8B95AA] truncate">
                            {team.leader_name || 'Unassigned leader'}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-[#F5B921] tabular-nums whitespace-nowrap">
                      {formatLakhs(purseLeft)}
                    </td>

                    <td className="px-3 py-3 text-right font-mono text-xs text-[#E8ECF4] tabular-nums whitespace-nowrap">
                      {formatLakhs(spent)}
                    </td>

                    <td
                      className={`px-3 py-3 text-center font-mono text-xs tabular-nums ${
                        squad.length < room.squad_min || squad.length > room.squad_max
                          ? 'text-red-400 font-semibold'
                          : 'text-[#E8ECF4]'
                      }`}
                    >
                      {squad.length}/{room.squad_max}
                    </td>

                    <td
                      className={`px-3 py-3 text-center font-mono text-xs tabular-nums ${
                        overseas > room.overseas_max
                          ? 'text-red-400 font-semibold'
                          : 'text-[#22D3EE]'
                      }`}
                    >
                      {overseas}/{room.overseas_max}
                    </td>

                    <td
                      className={`px-3 py-3 text-center font-mono text-xs font-semibold tabular-nums ${
                        roles.Wicketkeeper < MIN_ROLES.Wicketkeeper
                          ? 'text-red-400'
                          : 'text-[#E8ECF4]'
                      }`}
                    >
                      {roles.Wicketkeeper}
                    </td>

                    <td
                      className={`px-3 py-3 text-center font-mono text-xs font-semibold tabular-nums ${
                        roles.Batter < MIN_ROLES.Batter
                          ? 'text-red-400'
                          : 'text-[#E8ECF4]'
                      }`}
                    >
                      {roles.Batter}
                    </td>

                    <td
                      className={`px-3 py-3 text-center font-mono text-xs font-semibold tabular-nums ${
                        roles['All-Rounder'] < MIN_ROLES['All-Rounder']
                          ? 'text-red-400'
                          : 'text-[#E8ECF4]'
                      }`}
                    >
                      {roles['All-Rounder']}
                    </td>

                    <td
                      className={`px-3 py-3 text-center font-mono text-xs font-semibold tabular-nums ${
                        roles.Bowler < MIN_ROLES.Bowler
                          ? 'text-red-400'
                          : 'text-[#E8ECF4]'
                      }`}
                    >
                      {roles.Bowler}
                    </td>

                    <td className="px-3 py-3 text-center">
                      {valid ? (
                        <span
                          title="All squad rules satisfied"
                          className="inline-flex items-center justify-center text-emerald-400"
                        >
                          <CheckCircle2 className="h-4 w-4" aria-label="Valid squad" />
                        </span>
                      ) : (
                        <span
                          title={`Missing/invalid: ${failedLabels.join('; ')}`}
                          className="inline-flex items-center justify-center text-red-400 cursor-help"
                        >
                          <XCircle className="h-4 w-4" aria-label="Invalid squad" />
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setInspectedTeamId(team.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>INSPECT</span>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Players Left in Pool Mini Table */}
      <Card brackets bracketTone="gold" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-4 w-4 text-[#F5B921]" aria-hidden="true" />
            <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              PLAYERS LEFT IN THE POOL
            </h2>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA]">
            BY AUCTION SET
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-white/[0.08] bg-[#070B14]/80 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                <th className="px-5 py-3">Set</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Pending</th>
                <th className="px-4 py-3 text-right">Sold</th>
                <th className="px-4 py-3 text-right">Unsold</th>
                <th className="px-5 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-sm">
              {poolByCategory.map((row) => {
                const info = getCategoryInfo(row.category.value);
                return (
                  <tr
                    key={row.category.value}
                    className="transition-colors hover:bg-[#141C2F]/50"
                  >
                    <td className="px-5 py-2.5 font-mono text-xs text-[#8B95AA] tabular-nums">
                      SET {row.category.setNo}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-[2px] border px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em] ${
                          info?.chipClass ?? 'border-white/15 text-[#E8ECF4]'
                        }`}
                      >
                        {row.category.value}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-[#22D3EE] tabular-nums">
                      {row.pending}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-emerald-400 tabular-nums">
                      {row.sold}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-[#F5B921] tabular-nums">
                      {row.unsold}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs text-[#8B95AA] tabular-nums">
                      {row.total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* INSPECT Right-Side Drawer */}
      {inspectedAnalysis && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inspect-drawer-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setInspectedTeamId(null);
            }
          }}
        >
          <div className="flex h-full w-full max-w-4xl flex-col border-l border-white/15 bg-[#0E1524] text-[#E8ECF4]">
            {/* Drawer Header */}
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] bg-[#070B14] px-6 py-5">
              <div className="flex items-center gap-4 min-w-0">
                <TeamCrest shortCode={inspectedAnalysis.team.short_code} size="lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id="inspect-drawer-title"
                      className="font-display text-3xl tracking-wide text-[#E8ECF4] truncate"
                    >
                      {inspectedAnalysis.team.name}
                    </h2>
                    <Badge
                      tone={
                        inspectedAnalysis.team.status === 'active'
                          ? 'cyan'
                          : inspectedAnalysis.team.status === 'removed'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {inspectedAnalysis.team.status.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-[#8B95AA]">
                    Leader:{' '}
                    <span className="text-[#E8ECF4]">
                      {inspectedAnalysis.team.leader_name || 'Unassigned'}
                    </span>{' '}
                    · Purse left:{' '}
                    <span className="text-[#F5B921] font-semibold">
                      {formatLakhs(inspectedAnalysis.purseLeft)}
                    </span>{' '}
                    · Spent:{' '}
                    <span className="text-[#E8ECF4]">
                      {formatLakhs(inspectedAnalysis.spent)}
                    </span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectedTeamId(null)}
                aria-label="Close inspection drawer"
                className="rounded-[4px] border border-white/15 bg-[#0E1524] p-2 text-[#8B95AA] transition-colors hover:border-white/30 hover:text-[#E8ECF4] focus-visible:outline-2 focus-visible:outline-[#22D3EE]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Rule Checklist */}
              <div className="rounded-[4px] border border-white/[0.08] bg-[#070B14] p-4">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                  <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#22D3EE]">
                    SQUAD RULE CHECKLIST
                  </h3>
                  <Badge tone={inspectedAnalysis.valid ? 'cyan' : 'danger'}>
                    {inspectedAnalysis.valid ? 'COMPLIANT' : 'INCOMPLETE'}
                  </Badge>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {inspectedAnalysis.checks.map((check) => (
                    <div
                      key={check.label}
                      className={`flex items-center justify-between gap-2 rounded-[3px] border px-3 py-2 font-mono text-xs ${
                        check.ok
                          ? 'border-emerald-500/25 bg-emerald-500/5 text-[#E8ECF4]'
                          : 'border-red-500/35 bg-red-500/10 text-red-200'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {check.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                        )}
                        <span className="truncate">{check.label}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-[11px] text-[#8B95AA]">
                        {check.have}/{check.need}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Playing XI Ground View */}
              <div className="rounded-[4px] border border-white/[0.08] bg-[#070B14] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-2.5">
                  <div>
                    <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#F5B921]">
                      PLAYING XI FORMATION
                    </h3>
                    {inspectedXi && (
                      <p className="mt-0.5 font-mono text-[11px] text-[#8B95AA]">
                        Saved {formatDateTime12h(inspectedXi.updated_at)} ·{' '}
                        {inspectedXiPlayers.length}/11 players · Overseas{' '}
                        {inspectedXiPlayers.filter((p) => p.isOverseas).length}/
                        {xiOverseasLimit}
                      </p>
                    )}
                  </div>
                  {inspectedXi?.captain_room_player_id && (
                    <Badge tone="gold">
                      C:{' '}
                      {roomPlayerById.get(inspectedXi.captain_room_player_id)?.players
                        ? `${roomPlayerById.get(inspectedXi.captain_room_player_id)!.players!.first_name} ${roomPlayerById.get(inspectedXi.captain_room_player_id)!.players!.last_name}`
                        : 'Assigned'}
                    </Badge>
                  )}
                </div>

                {inspectedXi && inspectedXiPlayers.length > 0 ? (
                  <GroundView
                    players={inspectedXiPlayers}
                    captainId={inspectedXi.captain_room_player_id}
                    accent={getTeamPalette(inspectedAnalysis.team.short_code).primary}
                    size="lg"
                    showEmptySlots
                  />
                ) : (
                  <div className="rounded-[4px] border border-dashed border-white/15 bg-[#0E1524] px-4 py-10 text-center">
                    <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
                      No playing XI saved yet
                    </p>
                  </div>
                )}
              </div>

              {/* Squad Grouped by Role */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                  <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E8ECF4]">
                    FULL SQUAD BY ROLE ({inspectedAnalysis.squad.length} PLAYERS)
                  </h3>
                  <span className="font-mono text-[11px] text-[#8B95AA]">
                    Overseas: {inspectedAnalysis.overseas}/{room.overseas_max}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {ROLE_ORDER.map(({ skill, plural }) => {
                    const rolePlayers = inspectedAnalysis.squad.filter(
                      (rp) => rp.players?.skill === skill,
                    );
                    const minNeeded = MIN_ROLES[skill];

                    return (
                      <div
                        key={skill}
                        className="rounded-[4px] border border-white/[0.08] bg-[#070B14] p-4"
                      >
                        <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                          <span className="font-mono text-xs font-semibold uppercase tracking-[0.1em] text-[#E8ECF4]">
                            {plural}
                          </span>
                          <span
                            className={`font-mono text-xs tabular-nums ${
                              rolePlayers.length < minNeeded
                                ? 'text-red-400 font-semibold'
                                : 'text-[#22D3EE]'
                            }`}
                          >
                            {rolePlayers.length} (min {minNeeded})
                          </span>
                        </div>

                        {rolePlayers.length === 0 ? (
                          <p className="py-4 text-center font-mono text-xs text-[#8B95AA]">
                            No {plural.toLowerCase()} signed yet.
                          </p>
                        ) : (
                          <ul className="mt-2.5 divide-y divide-white/[0.06]">
                            {rolePlayers.map((rp) => {
                              const p = rp.players;
                              if (!p) return null;
                              return (
                                <li
                                  key={rp.id}
                                  className="flex items-center justify-between gap-3 py-2 text-xs"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-medium text-[#E8ECF4] truncate">
                                        {p.first_name} {p.last_name}
                                      </span>
                                      {p.is_overseas && (
                                        <span className="rounded-[2px] border border-[#22D3EE]/40 bg-[#0E1524] px-1 py-[1px] font-mono text-[9px] font-bold text-[#22D3EE]">
                                          OS
                                        </span>
                                      )}
                                    </div>
                                    <p className="font-mono text-[10px] text-[#8B95AA]">
                                      {p.nationality} · {p.player_code}
                                    </p>
                                  </div>
                                  <span className="shrink-0 font-mono text-xs font-semibold text-[#F5B921] tabular-nums">
                                    {formatLakhs(rp.sold_price_lakhs ?? rp.base_price_lakhs)}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
