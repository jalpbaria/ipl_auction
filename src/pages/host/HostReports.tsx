import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Filter,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  UserX,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmModal } from '../../components/host/ConfirmModal';
import { EnforcementControl } from '../../components/host/EnforcementControl';
import { TeamCrest } from '../../components/host/TeamCrest';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { INPUT_BASE_CLASS } from '../../components/ui/FormField';
import { Modal } from '../../components/ui/Modal';
import { Tag } from '../../components/ui/Tag';
import { usePresence } from '../../hooks/usePresence';
import { formatLakhs } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import {
  formatDateTime12h,
  formatRelativeTime,
  formatTime12h,
  formatViolationReason,
} from '../../lib/time';
import { useHostRoom } from '../../store/hostRoom';
import { useToastStore } from '../../store/toast';
import type { DbTeam, TeamStatus } from '../../types/database';

type TimeWindowFilter = 'all' | '15m' | '1h';

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsvFile(filename: string, headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  const csvContent = `\uFEFF${lines.join('\r\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getTeamStatusChip(status: TeamStatus): {
  label: string;
  tone: 'neutral' | 'cyan' | 'danger';
} {
  if (status === 'active') return { label: 'ACTIVE', tone: 'cyan' };
  if (status === 'removed') return { label: 'REMOVED', tone: 'danger' };
  return { label: 'OPEN SEAT', tone: 'neutral' };
}

function getViolationTypeChip(type: string): {
  label: string;
  classes: string;
} {
  switch (type) {
    case 'tab_switch':
      return {
        label: 'TAB_SWITCH',
        classes: 'border-red-500/40 bg-red-500/15 text-red-300',
      };
    case 'esc_fullscreen':
      return {
        label: 'ESC_FULLSCREEN',
        classes: 'border-amber-400/40 bg-amber-500/15 text-amber-300',
      };
    case 'multiple_login':
      return {
        label: 'MULTIPLE_LOGIN',
        classes: 'border-white/20 bg-white/10 text-[#E8ECF4]',
      };
    case 'other':
    default:
      return {
        label: type.toUpperCase(),
        classes: 'border-white/15 bg-white/5 text-[#8B95AA]',
      };
  }
}

export default function HostReports() {
  const room = useHostRoom((s) => s.room);
  const teams = useHostRoom((s) => s.teams);
  const roomPlayers = useHostRoom((s) => s.roomPlayers);
  const violations = useHostRoom((s) => s.violations);
  const violationsLoading = useHostRoom((s) => s.violationsLoading);
  const violationsError = useHostRoom((s) => s.violationsError);
  const refreshViolations = useHostRoom((s) => s.refreshViolations);
  const refreshTeamsAndFinances = useHostRoom((s) => s.refreshTeamsAndFinances);
  const refreshTeamCodes = useHostRoom((s) => s.refreshTeamCodes);
  const setRecentPlainCode = useHostRoom((s) => s.setRecentPlainCode);
  const markReportsSeen = useHostRoom((s) => s.markReportsSeen);
  const markHostRemoval = useHostRoom((s) => s.markHostRemoval);

  const showToast = useToastStore((s) => s.showToast);

  const { isTeamOnline } = usePresence(room?.id);

  // Relative time ticker
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);

  // Mark seen on mount
  useEffect(() => {
    if (room?.id) {
      markReportsSeen(room.id, Date.now());
    }
  }, [room?.id, markReportsSeen]);

  // Log Filters
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [timeWindow, setTimeWindow] = useState<TimeWindowFilter>('all');

  const logSectionRef = useRef<HTMLDivElement | null>(null);

  // Remove team modal
  const [removeTarget, setRemoveTarget] = useState<DbTeam | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [removing, setRemoving] = useState(false);

  // Generate new code modal
  const [generatingTeamId, setGeneratingTeamId] = useState<string | null>(null);
  const [generatedCodeModal, setGeneratedCodeModal] = useState<{
    team: DbTeam;
    code: string;
  } | null>(null);
  const [copiedGeneratedCode, setCopiedGeneratedCode] = useState(false);

  const anticheatEnabled = room?.anticheat_enabled ?? true;

  const teamById = useMemo(() => {
    const map = new Map<string, DbTeam>();
    for (const t of teams) {
      map.set(t.id, t);
    }
    return map;
  }, [teams]);

  const activeTeams = useMemo(
    () => teams.filter((t) => t.status === 'active'),
    [teams],
  );

  const removedTeamsCount = useMemo(
    () => teams.filter((t) => t.status === 'removed').length,
    [teams],
  );

  const onlineActiveTeamsCount = useMemo(
    () => activeTeams.filter((t) => isTeamOnline(t.id)).length,
    [activeTeams, isTeamOnline],
  );

  const latestViolation = violations[0] ?? null;

  // Per-team violation aggregation
  const teamStatsById = useMemo(() => {
    const map = new Map<
      string,
      {
        tabSwitch: number;
        escFullscreen: number;
        other: number;
        total: number;
        lastAt: string | null;
      }
    >();

    for (const v of violations) {
      const current = map.get(v.team_id) ?? {
        tabSwitch: 0,
        escFullscreen: 0,
        other: 0,
        total: 0,
        lastAt: null,
      };

      if (v.type === 'tab_switch') {
        current.tabSwitch += 1;
      } else if (v.type === 'esc_fullscreen') {
        current.escFullscreen += 1;
      } else {
        current.other += 1;
      }
      current.total += 1;

      if (
        !current.lastAt ||
        Date.parse(v.created_at) > Date.parse(current.lastAt)
      ) {
        current.lastAt = v.created_at;
      }

      map.set(v.team_id, current);
    }

    return map;
  }, [violations]);

  // Filtered violation log (newest first)
  const filteredViolations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cutoffMs =
      timeWindow === '15m'
        ? nowMs - 15 * 60 * 1000
        : timeWindow === '1h'
          ? nowMs - 60 * 60 * 1000
          : 0;

    return violations.filter((v) => {
      if (teamFilter !== 'all' && v.team_id !== teamFilter) return false;
      if (typeFilter !== 'all' && v.type !== typeFilter) return false;

      if (cutoffMs > 0) {
        const ms = Date.parse(v.created_at);
        if (Number.isNaN(ms) || ms < cutoffMs) return false;
      }

      if (q) {
        const team = teamById.get(v.team_id);
        const haystack = [
          v.teams?.name,
          v.teams?.short_code,
          team?.name,
          team?.short_code,
          v.type,
          formatViolationReason(v.type),
          v.details,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [violations, teamFilter, typeFilter, searchQuery, timeWindow, nowMs, teamById]);

  const soldPlayers = useMemo(
    () =>
      roomPlayers
        .filter((rp) => rp.status === 'sold')
        .sort((a, b) => {
          const aMs = a.sold_at ? Date.parse(a.sold_at) : 0;
          const bMs = b.sold_at ? Date.parse(b.sold_at) : 0;
          if (bMs !== aMs) return bMs - aMs;
          return (a.players?.serial ?? 0) - (b.players?.serial ?? 0);
        }),
    [roomPlayers],
  );

  const handleViewTeamLog = (teamId: string) => {
    setTeamFilter(teamId);
    logSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleConfirmRemoveTeam = async () => {
    if (!supabase || !removeTarget) return;
    setRemoving(true);
    markHostRemoval();

    try {
      const { error } = await supabase.rpc('remove_team', {
        p_team_id: removeTarget.id,
        p_reason: removeReason.trim() || null,
      });

      if (error) {
        showToast({
          title: 'Could not remove team',
          description: error.message,
          tone: 'error',
        });
        return;
      }

      await Promise.all([
        refreshTeamsAndFinances(),
        refreshTeamCodes(),
        refreshViolations(),
      ]);

      showToast({
        title: `${removeTarget.short_code} removed`,
        description: 'Franchise removed and logged.',
        tone: 'info',
      });
      setRemoveTarget(null);
      setRemoveReason('');
    } catch (err) {
      showToast({
        title: 'Error removing team',
        description: err instanceof Error ? err.message : 'Request failed.',
        tone: 'error',
      });
    } finally {
      setRemoving(false);
    }
  };

  const handleGenerateNewCode = async (team: DbTeam) => {
    if (!supabase) return;
    setGeneratingTeamId(team.id);

    try {
      const { data, error } = await supabase.rpc('generate_team_code', {
        p_team_id: team.id,
      });

      if (error) {
        showToast({
          title: 'Failed to generate code',
          description: error.message,
          tone: 'error',
        });
        return;
      }

      const code = typeof data === 'string' ? data : '';
      if (code) {
        setRecentPlainCode(team.id, code);
        setGeneratedCodeModal({ team, code });
        setCopiedGeneratedCode(false);
      }

      await Promise.all([refreshTeamCodes(), refreshTeamsAndFinances()]);
      showToast({
        title: `New code ready for ${team.short_code}`,
        description: code
          ? `Share this one-time code with ${team.name}.`
          : 'New access code generated.',
        tone: 'success',
      });
    } catch (err) {
      showToast({
        title: 'Error generating code',
        description: err instanceof Error ? err.message : 'Request failed.',
        tone: 'error',
      });
    } finally {
      setGeneratingTeamId(null);
    }
  };

  const handleCopyGeneratedCode = async () => {
    if (!generatedCodeModal?.code) return;
    try {
      await navigator.clipboard.writeText(generatedCodeModal.code);
      setCopiedGeneratedCode(true);
      showToast({
        title: 'Code copied',
        description: `${generatedCodeModal.code} copied to clipboard.`,
        tone: 'success',
      });
    } catch {
      showToast({
        title: 'Clipboard unavailable',
        description: 'Copy the code manually from the modal.',
        tone: 'warning',
      });
    }
  };

  const handleExportViolationsCsv = () => {
    if (!room) return;
    const safeRoom = room.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const rows = violations.map((v) => {
      const team = teamById.get(v.team_id);
      const teamLabel =
        v.teams?.name || team?.name || v.teams?.short_code || team?.short_code || v.team_id;
      return [
        formatDateTime12h(v.created_at),
        teamLabel,
        v.type,
        v.details ?? '',
      ];
    });
    downloadCsvFile(
      `${safeRoom}-violations.csv`,
      ['time', 'team', 'type', 'details'],
      rows,
    );
    showToast({
      title: 'Violations CSV exported',
      description: `Downloaded ${rows.length} violation ${rows.length === 1 ? 'record' : 'records'}.`,
      tone: 'success',
    });
  };

  const handleExportSoldPlayersCsv = () => {
    if (!room) return;
    const safeRoom = room.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const rows = soldPlayers.map((rp) => {
      const p = rp.players;
      const fullName = p ? `${p.first_name} ${p.last_name}`.trim() : 'Unknown Player';
      const buyer = rp.sold_to_team_id ? teamById.get(rp.sold_to_team_id) : undefined;
      const lakhs = rp.sold_price_lakhs ?? 0;

      return [
        p?.player_code ?? '',
        fullName,
        p?.category ?? '',
        p?.skill ?? '',
        p?.nationality ?? '',
        p?.is_overseas ? 'Yes' : 'No',
        buyer ? `${buyer.short_code} - ${buyer.name}` : '',
        lakhs,
        formatLakhs(lakhs),
      ];
    });
    downloadCsvFile(
      `${safeRoom}-sold-players.csv`,
      [
        'player_code',
        'name',
        'category',
        'role',
        'nationality',
        'overseas',
        'team',
        'sold_price_lakhs',
        'sold_price_display',
      ],
      rows,
    );
    showToast({
      title: 'Sold players CSV exported',
      description: `Downloaded ${rows.length} sold ${rows.length === 1 ? 'player' : 'players'}.`,
      tone: 'success',
    });
  };

  if (!room) return null;

  const latestTeamName = latestViolation
    ? latestViolation.teams?.short_code ||
      teamById.get(latestViolation.team_id)?.short_code ||
      latestViolation.teams?.name ||
      'Team'
    : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-5 border-b border-white/[0.08] pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#22D3EE]">
              ANTI-CHEAT TELEMETRY // CSV EXPORTS
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
                REPORTS AND EXPORT
              </h1>
              <Badge tone={anticheatEnabled ? 'cyan' : 'gold'}>
                {anticheatEnabled ? 'ANTI-CHEAT ON' : 'ANTI-CHEAT OFF'}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportViolationsCsv}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export violations (CSV)</span>
            </Button>
            <Button
              variant="gold"
              size="sm"
              onClick={handleExportSoldPlayersCsv}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export sold players (CSV)</span>
            </Button>
          </div>
        </div>

        {/* Enforcement Switch */}
        <EnforcementControl
          roomId={room.id}
          enabled={anticheatEnabled}
          compact
        />
      </div>

      {/* (a) 4 Stat Panels */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card brackets bracketTone="gold" className="p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B95AA]">
            TOTAL VIOLATIONS
          </p>
          <p className="mt-2 font-display text-4xl tracking-wide text-[#E8ECF4] tabular-nums">
            {violations.length}
          </p>
          <p className="mt-2 font-mono text-[11px] text-[#8B95AA]">
            All events recorded in room
          </p>
        </Card>

        <Card brackets bracketTone="subtle" className="p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B95AA]">
            TEAMS REMOVED RIGHT NOW
          </p>
          <p
            className={`mt-2 font-display text-4xl tracking-wide tabular-nums ${
              removedTeamsCount > 0 ? 'text-red-400' : 'text-[#E8ECF4]'
            }`}
          >
            {removedTeamsCount}
          </p>
          <p className="mt-2 font-mono text-[11px] text-[#8B95AA]">
            Awaiting code or host approval
          </p>
        </Card>

        <Card brackets bracketTone="cyan" className="p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B95AA]">
            TEAMS ONLINE NOW
          </p>
          <p className="mt-2 font-display text-4xl tracking-wide text-emerald-400 tabular-nums">
            {onlineActiveTeamsCount}{' '}
            <span className="text-2xl text-[#8B95AA]">/ {activeTeams.length}</span>
          </p>
          <p className="mt-2 font-mono text-[11px] text-[#8B95AA]">
            Heartbeat within last 20s
          </p>
        </Card>

        <Card brackets bracketTone="subtle" className="p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B95AA]">
            LATEST VIOLATION
          </p>
          <p className="mt-2 font-display text-3xl tracking-wide text-[#F5B921] truncate">
            {latestViolation
              ? `${latestTeamName} · ${formatRelativeTime(latestViolation.created_at, nowMs)}`
              : 'NONE'}
          </p>
          <p className="mt-2 font-mono text-[11px] text-[#8B95AA] tabular-nums truncate">
            {latestViolation
              ? `${formatViolationReason(latestViolation.type)} · ${formatTime12h(latestViolation.created_at)}`
              : 'Clean room session'}
          </p>
        </Card>
      </div>

      {/* (b) TEAM SUMMARY Table */}
      <Card brackets bracketTone="cyan" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#22D3EE]">
              FRANCHISE INTEGRITY MATRIX
            </p>
            <h2 className="mt-1 font-display text-2xl tracking-wide text-[#E8ECF4]">
              TEAM SUMMARY
            </h2>
          </div>

          <Link
            to={`/host/${room.id}/rejoin`}
            className="inline-flex items-center gap-1.5 rounded-[4px] border border-white/15 bg-[#070B14] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#F5B921] transition-colors hover:border-[#F5B921]"
          >
            <span>Re-entry Requests</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/[0.08] bg-[#141C2F] font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                <th className="px-4 py-3">Franchise</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Presence</th>
                <th className="px-4 py-3 text-right">Tab Switch</th>
                <th className="px-4 py-3 text-right">Esc / Exit FS</th>
                <th className="px-4 py-3 text-right">Other</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Last Violation</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-sm">
              {teams.map((team) => {
                const chip = getTeamStatusChip(team.status);
                const online = team.status === 'active' && isTeamOnline(team.id);
                const stats = teamStatsById.get(team.id) ?? {
                  tabSwitch: 0,
                  escFullscreen: 0,
                  other: 0,
                  total: 0,
                  lastAt: null,
                };
                const isGenerating = generatingTeamId === team.id;

                return (
                  <tr
                    key={team.id}
                    className="transition-colors hover:bg-[#141C2F]/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <TeamCrest shortCode={team.short_code} size="sm" />
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-bold text-[#E8ECF4]">
                            {team.short_code}
                          </p>
                          <p className="truncate text-xs text-[#8B95AA]">
                            {team.name}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <Badge tone={chip.tone}>{chip.label}</Badge>
                    </td>

                    <td className="px-4 py-3">
                      {team.status === 'active' ? (
                        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em]">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              online ? 'bg-emerald-400' : 'bg-[#8B95AA]/50'
                            }`}
                            aria-hidden="true"
                          />
                          <span
                            className={
                              online ? 'text-emerald-400' : 'text-[#8B95AA]'
                            }
                          >
                            {online ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-[#8B95AA]">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-[#E8ECF4]">
                      {stats.tabSwitch}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-[#E8ECF4]">
                      {stats.escFullscreen}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-[#E8ECF4]">
                      {stats.other}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums text-[#F5B921]">
                      {stats.total}
                    </td>

                    <td className="px-4 py-3 font-mono text-xs text-[#8B95AA] tabular-nums">
                      {stats.lastAt ? formatTime12h(stats.lastAt) : '—'}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewTeamLog(team.id)}
                        >
                          <span>View log</span>
                        </Button>

                        {team.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRemoveTarget(team);
                              setRemoveReason('');
                            }}
                            className="border border-red-500/30 text-red-400 hover:border-red-400 hover:bg-red-500/10 hover:text-red-300"
                          >
                            <UserX className="h-3.5 w-3.5" />
                            <span>Remove team</span>
                          </Button>
                        )}

                        {team.status === 'removed' && (
                          <Button
                            variant="gold"
                            size="sm"
                            disabled={isGenerating}
                            onClick={() => void handleGenerateNewCode(team)}
                          >
                            {isGenerating ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <KeyRound className="h-3.5 w-3.5" />
                            )}
                            <span>Generate new code</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* (c) VIOLATION LOG */}
      <div ref={logSectionRef} id="violation-log-section">
        <Card brackets bracketTone="gold" className="overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-white/[0.08] px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#F5B921]">
                  LIVE REALTIME STREAM // NEWEST FIRST
                </p>
                <h2 className="mt-1 font-display text-2xl tracking-wide text-[#E8ECF4]">
                  VIOLATION LOG
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <Tag accent="cyan" className="tabular-nums">
                  {filteredViolations.length} SHOWN
                </Tag>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void refreshViolations()}
                  disabled={violationsLoading}
                  className="border border-white/10"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${violationsLoading ? 'animate-spin' : ''}`}
                  />
                  <span>Refresh</span>
                </Button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label
                  htmlFor="log-filter-team"
                  className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]"
                >
                  <Filter className="h-3 w-3" />
                  <span>Team</span>
                </label>
                <select
                  id="log-filter-team"
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value)}
                  className={INPUT_BASE_CLASS}
                >
                  <option value="all">All teams</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.short_code} — {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="log-filter-type"
                  className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]"
                >
                  Violation Type
                </label>
                <select
                  id="log-filter-type"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className={INPUT_BASE_CLASS}
                >
                  <option value="all">All types</option>
                  <option value="tab_switch">tab_switch</option>
                  <option value="esc_fullscreen">esc_fullscreen</option>
                  <option value="multiple_login">multiple_login</option>
                  <option value="other">other</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="log-filter-window"
                  className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]"
                >
                  Time Window
                </label>
                <select
                  id="log-filter-window"
                  value={timeWindow}
                  onChange={(e) => setTimeWindow(e.target.value as TimeWindowFilter)}
                  className={INPUT_BASE_CLASS}
                >
                  <option value="all">All time</option>
                  <option value="15m">Last 15 minutes</option>
                  <option value="1h">Last hour</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="log-filter-search"
                  className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]"
                >
                  <Search className="h-3 w-3" />
                  <span>Search</span>
                </label>
                <input
                  id="log-filter-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Team or details..."
                  className={INPUT_BASE_CLASS}
                />
              </div>
            </div>
          </div>

          {violationsLoading && violations.length === 0 ? (
            <div className="space-y-3 p-6">
              {[0, 1, 2, 3].map((rowIdx) => (
                <div
                  key={rowIdx}
                  className="h-12 w-full animate-pulse rounded-[4px] border border-white/[0.06] bg-[#141C2F]/60"
                />
              ))}
            </div>
          ) : violationsError ? (
            <div className="p-8 text-center">
              <ShieldAlert className="mx-auto h-7 w-7 text-red-400" />
              <p className="mt-3 font-mono text-xs uppercase tracking-[0.1em] text-red-300">
                {violationsError}
              </p>
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshViolations()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry</span>
                </Button>
              </div>
            </div>
          ) : filteredViolations.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#8B95AA]">
                No violations recorded
              </p>
              {(teamFilter !== 'all' ||
                typeFilter !== 'all' ||
                timeWindow !== 'all' ||
                searchQuery.trim() !== '') && (
                <button
                  type="button"
                  onClick={() => {
                    setTeamFilter('all');
                    setTypeFilter('all');
                    setTimeWindow('all');
                    setSearchQuery('');
                  }}
                  className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[#22D3EE] hover:underline"
                >
                  Clear active filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-[#141C2F] font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-sm">
                  {filteredViolations.map((v) => {
                    const team = teamById.get(v.team_id);
                    const shortCode = v.teams?.short_code || team?.short_code || 'TEAM';
                    const teamName = v.teams?.name || team?.name || 'Unknown Franchise';
                    const typeChip = getViolationTypeChip(v.type);

                    return (
                      <tr
                        key={v.id}
                        className="transition-colors hover:bg-[#141C2F]/40"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-mono text-xs text-[#E8ECF4] tabular-nums">
                            {formatDateTime12h(v.created_at)}
                          </p>
                          <p className="font-mono text-[10px] text-[#8B95AA] tabular-nums">
                            {formatRelativeTime(v.created_at, nowMs)}
                          </p>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <TeamCrest shortCode={shortCode} size="sm" />
                            <div className="min-w-0">
                              <p className="font-mono text-xs font-bold text-[#E8ECF4]">
                                {shortCode}
                              </p>
                              <p className="truncate text-xs text-[#8B95AA]">
                                {teamName}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-[2px] border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${typeChip.classes}`}
                          >
                            {typeChip.label}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-xs text-[#E8ECF4]">
                          {v.details || formatViolationReason(v.type)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Remove Team Confirm Modal */}
      <ConfirmModal
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => void handleConfirmRemoveTeam()}
        eyebrow="FAIR PLAY ENFORCEMENT"
        title={`REMOVE ${removeTarget?.short_code ?? ''} FROM ROOM`}
        message={`Removing ${removeTarget?.name ?? 'this team'} revokes their active session. They will need host approval and a new one-time code to re-enter.`}
        confirmLabel="Remove team"
        confirmTone="danger"
        loading={removing}
      >
        <div className="space-y-1.5">
          <label
            htmlFor="reports-remove-reason"
            className="block font-mono text-[11px] uppercase tracking-[0.1em] text-[#8B95AA]"
          >
            Reason (optional)
          </label>
          <input
            id="reports-remove-reason"
            type="text"
            value={removeReason}
            disabled={removing}
            onChange={(e) => setRemoveReason(e.target.value)}
            placeholder="e.g. Multiple tab switches during bidding"
            className={INPUT_BASE_CLASS}
          />
        </div>
      </ConfirmModal>

      {/* Generated Code Modal */}
      <Modal
        open={Boolean(generatedCodeModal)}
        onClose={() => setGeneratedCodeModal(null)}
        eyebrow="RE-ENTRY ACCESS CREDENTIAL"
        title={`NEW CODE // ${generatedCodeModal?.team.short_code ?? ''}`}
        subtitle={generatedCodeModal?.team.name}
        maxWidthClass="max-w-md"
        footer={
          <div className="flex items-center justify-between gap-3">
            <Link
              to={`/host/${room.id}/rejoin`}
              onClick={() => setGeneratedCodeModal(null)}
              className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#22D3EE] hover:underline"
            >
              <span>Open Re-entry Requests</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGeneratedCodeModal(null)}
            >
              Done
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[#8B95AA]">
          Share this one-time access code with the franchise leader so they can rejoin the auction room.
        </p>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-[4px] border border-[#F5B921]/40 bg-[#070B14] px-4 py-3">
          <span className="font-mono text-lg font-bold tracking-[0.14em] text-[#F5B921] tabular-nums">
            {generatedCodeModal?.code}
          </span>
          <Button
            variant="gold"
            size="sm"
            onClick={() => void handleCopyGeneratedCode()}
          >
            {copiedGeneratedCode ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
