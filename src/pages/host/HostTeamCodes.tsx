import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  UserX,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ConfirmModal } from '../../components/host/ConfirmModal';
import { TeamCrest } from '../../components/host/TeamCrest';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { INPUT_BASE_CLASS } from '../../components/ui/FormField';
import { Modal } from '../../components/ui/Modal';
import { Tag } from '../../components/ui/Tag';
import { supabase } from '../../lib/supabase';
import { useHostRoom } from '../../store/hostRoom';
import { useToastStore } from '../../store/toast';
import type { DbTeam, DbTeamCode, TeamStatus } from '../../types/database';

function getTeamChip(status: TeamStatus): {
  label: string;
  tone: 'neutral' | 'cyan' | 'danger';
} {
  if (status === 'active') return { label: 'ACTIVE', tone: 'cyan' };
  if (status === 'removed') return { label: 'REMOVED', tone: 'danger' };
  return { label: 'OPEN SEAT', tone: 'neutral' };
}

export default function HostTeamCodes() {
  const room = useHostRoom((s) => s.room);
  const teams = useHostRoom((s) => s.teams);
  const teamCodes = useHostRoom((s) => s.teamCodes);
  const teamMembers = useHostRoom((s) => s.teamMembers);
  const recentPlainCodes = useHostRoom((s) => s.recentPlainCodes);
  const setRecentPlainCode = useHostRoom((s) => s.setRecentPlainCode);
  const refreshTeamCodes = useHostRoom((s) => s.refreshTeamCodes);
  const refreshTeamsAndFinances = useHostRoom((s) => s.refreshTeamsAndFinances);
  const refreshTeamMembers = useHostRoom((s) => s.refreshTeamMembers);

  const showToast = useToastStore((s) => s.showToast);

  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [generatingAll, setGeneratingAll] = useState(false);
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Regenerate confirm modal state
  const [regenTarget, setRegenTarget] = useState<DbTeam | null>(null);

  // Remove team modal state
  const [removeTarget, setRemoveTarget] = useState<DbTeam | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [removing, setRemoving] = useState(false);

  // View members modal state
  const [membersTarget, setMembersTarget] = useState<DbTeam | null>(null);

  // Refresh countdown ticker every second while any 20s plain code is active
  const hasRecentCodes = Object.keys(recentPlainCodes).length > 0;
  useEffect(() => {
    if (!hasRecentCodes) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasRecentCodes]);

  // Latest code row per team
  const latestCodeByTeam = useMemo(() => {
    const map = new Map<string, DbTeamCode>();
    for (const row of teamCodes) {
      if (!map.has(row.team_id)) {
        map.set(row.team_id, row);
      }
    }
    return map;
  }, [teamCodes]);

  const memberCountByTeam = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of teamMembers) {
      map.set(m.team_id, (map.get(m.team_id) ?? 0) + 1);
    }
    return map;
  }, [teamMembers]);

  const codesGeneratedCount = useMemo(
    () => teams.filter((t) => latestCodeByTeam.has(t.id)).length,
    [teams, latestCodeByTeam],
  );

  const teamsJoinedCount = useMemo(
    () => teams.filter((t) => t.status === 'active').length,
    [teams],
  );

  const handleCopyCode = async (codeText: string) => {
    try {
      await navigator.clipboard.writeText(codeText);
      showToast({
        title: 'Code copied',
        description: `${codeText} copied to clipboard.`,
        tone: 'success',
      });
    } catch {
      showToast({
        title: 'Clipboard unavailable',
        description: 'Copy the code manually from the table.',
        tone: 'warning',
      });
    }
  };

  const handleGenerateCode = async (team: DbTeam) => {
    if (!supabase) return;
    setBusyTeamId(team.id);

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

      const generatedCode = typeof data === 'string' ? data : '';
      if (generatedCode) {
        setRecentPlainCode(team.id, generatedCode);
      }

      await Promise.all([refreshTeamCodes(), refreshTeamsAndFinances()]);
      showToast({
        title: `Code ready for ${team.short_code}`,
        description: generatedCode
          ? `Visible in plain text for 20s: ${generatedCode}`
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
      setBusyTeamId(null);
      setRegenTarget(null);
    }
  };

  const handleGenerateAllMissing = async () => {
    if (!supabase || !room) return;
    setGeneratingAll(true);

    try {
      const { data, error } = await supabase.rpc('generate_all_team_codes', {
        p_room: room.id,
      });

      if (error) {
        showToast({
          title: 'Bulk generation failed',
          description: error.message,
          tone: 'error',
        });
        return;
      }

      const count = typeof data === 'number' ? data : Number(data ?? 0);
      await refreshTeamCodes();
      showToast({
        title: 'Team codes generated',
        description: `Created ${Number.isFinite(count) ? count : 0} missing access codes.`,
        tone: 'success',
      });
    } catch (err) {
      showToast({
        title: 'Error generating codes',
        description: err instanceof Error ? err.message : 'Request failed.',
        tone: 'error',
      });
    } finally {
      setGeneratingAll(false);
    }
  };

  const handleRemoveTeam = async () => {
    if (!supabase || !removeTarget) return;
    setRemoving(true);

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

      await Promise.all([refreshTeamsAndFinances(), refreshTeamCodes()]);
      showToast({
        title: `${removeTarget.short_code} removed`,
        description: 'The franchise seat has been marked as removed.',
        tone: 'warning',
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

  const handleOpenMembers = (team: DbTeam) => {
    setMembersTarget(team);
    void refreshTeamMembers();
  };

  const selectedTeamMembers = useMemo(() => {
    if (!membersTarget) return [];
    return teamMembers
      .filter((m) => m.team_id === membersTarget.id)
      .sort((a, b) => Number(b.is_leader) - Number(a.is_leader));
  }, [membersTarget, teamMembers]);

  if (!room) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#22D3EE]">
            ACCESS CREDENTIALS // SINGLE-USE CODES
          </p>
          <h1 className="mt-1.5 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
            Team Codes Control
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="rounded-[2px] border border-white/10 bg-[#0E1524] px-3 py-1 font-mono text-xs text-[#E8ECF4] tabular-nums">
              Codes generated{' '}
              <span className="font-semibold text-[#F5B921]">{codesGeneratedCount}/10</span>
            </span>
            <span className="rounded-[2px] border border-white/10 bg-[#0E1524] px-3 py-1 font-mono text-xs text-[#E8ECF4] tabular-nums">
              Teams joined{' '}
              <span className="font-semibold text-[#22D3EE]">{teamsJoinedCount}/10</span>
            </span>
          </div>
        </div>

        <Button
          variant="gold"
          size="md"
          disabled={generatingAll}
          onClick={handleGenerateAllMissing}
        >
          {generatingAll ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <KeyRound className="h-4 w-4" />
              <span>Generate all missing codes</span>
            </>
          )}
        </Button>
      </div>

      {/* 10-Row Team Codes Table */}
      <Card brackets bracketTone="cyan" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/[0.08] bg-[#141C2F] font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                <th className="px-4 py-3">Franchise</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Access Code</th>
                <th className="px-4 py-3">Code State</th>
                <th className="px-4 py-3">Leader &amp; Members</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-sm">
              {teams.map((team) => {
                const chip = getTeamChip(team.status);
                const codeRow = latestCodeByTeam.get(team.id);
                const recent = recentPlainCodes[team.id];
                const secondsLeft =
                  recent && recent.expiresAt > nowTick
                    ? Math.ceil((recent.expiresAt - nowTick) / 1000)
                    : 0;
                const isRecentLive = secondsLeft > 0;
                const isRevealed = Boolean(revealedIds[team.id]) || isRecentLive;
                const displayCode = recent?.code || codeRow?.code || '';
                const memberCount = memberCountByTeam.get(team.id) ?? 0;
                const isBusy = busyTeamId === team.id;

                const codeStateLabel = !codeRow
                  ? 'NOT GENERATED'
                  : codeRow.used
                    ? 'USED'
                    : 'UNUSED';

                const codeStateTone = !codeRow
                  ? 'neutral'
                  : codeRow.used
                    ? 'gold'
                    : 'cyan';

                return (
                  <tr
                    key={team.id}
                    className="transition-colors hover:bg-[#141C2F]/40"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <TeamCrest shortCode={team.short_code} size="sm" />
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-bold text-[#E8ECF4]">
                            {team.short_code}
                          </p>
                          <p className="truncate text-xs text-[#8B95AA]">{team.name}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <Badge tone={chip.tone}>{chip.label}</Badge>
                    </td>

                    <td className="px-4 py-3.5">
                      {!codeRow && !recent ? (
                        <span className="font-mono text-xs text-[#8B95AA]">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono text-xs tracking-[0.08em] tabular-nums ${
                              isRecentLive
                                ? 'font-bold text-[#F5B921]'
                                : 'text-[#E8ECF4]'
                            }`}
                          >
                            {isRevealed ? displayCode : '••••-••••••'}
                          </span>

                          {isRecentLive && (
                            <Tag accent="gold" className="tabular-nums">
                              {secondsLeft}S
                            </Tag>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setRevealedIds((prev) => ({
                                ...prev,
                                [team.id]: !prev[team.id],
                              }))
                            }
                            aria-label={isRevealed ? 'Hide team code' : 'Reveal team code'}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-[2px] border border-white/10 bg-[#070B14] text-[#8B95AA] hover:border-white/25 hover:text-[#E8ECF4] focus-visible:outline-2 focus-visible:outline-[#22D3EE]"
                          >
                            {isRevealed ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleCopyCode(displayCode)}
                            aria-label="Copy team code"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-[2px] border border-white/10 bg-[#070B14] text-[#8B95AA] hover:border-[#22D3EE]/50 hover:text-[#22D3EE] focus-visible:outline-2 focus-visible:outline-[#22D3EE]"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <Badge tone={codeStateTone}>{codeStateLabel}</Badge>
                    </td>

                    <td className="px-4 py-3.5">
                      {team.leader_name ? (
                        <div>
                          <p className="text-xs font-medium text-[#E8ECF4]">
                            {team.leader_name}
                          </p>
                          <p className="font-mono text-[10px] uppercase text-[#8B95AA] tabular-nums">
                            {memberCount} {memberCount === 1 ? 'MEMBER' : 'MEMBERS'}
                          </p>
                        </div>
                      ) : (
                        <span className="font-mono text-[11px] uppercase text-[#8B95AA]">
                          —
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        {team.status === 'removed' ? (
                          <Button
                            variant="gold"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => void handleGenerateCode(team)}
                          >
                            {isBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            <span>Generate new code</span>
                          </Button>
                        ) : team.status === 'active' ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenMembers(team)}
                            >
                              <Users className="h-3.5 w-3.5" />
                              <span>View members</span>
                            </Button>
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
                          </>
                        ) : !codeRow ? (
                          <Button
                            variant="cyan"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => void handleGenerateCode(team)}
                          >
                            {isBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <KeyRound className="h-3.5 w-3.5" />
                            )}
                            <span>Generate</span>
                          </Button>
                        ) : !codeRow.used ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => setRegenTarget(team)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>Regenerate</span>
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => setRegenTarget(team)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>Regenerate</span>
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

      {/* Regenerate Confirm Modal */}
      <ConfirmModal
        open={Boolean(regenTarget)}
        onClose={() => setRegenTarget(null)}
        onConfirm={() => {
          if (regenTarget) void handleGenerateCode(regenTarget);
        }}
        eyebrow="CODE REGENERATION"
        title={`REGENERATE ${regenTarget?.short_code ?? ''} CODE`}
        message="The old code will stop working. Any participant holding the previous code will not be able to join with it."
        confirmLabel="Regenerate code"
        confirmTone="gold"
        loading={Boolean(regenTarget && busyTeamId === regenTarget.id)}
      />

      {/* Remove Team Confirm Modal */}
      <ConfirmModal
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => void handleRemoveTeam()}
        eyebrow="FAIR PLAY ENFORCEMENT"
        title={`REMOVE ${removeTarget?.short_code ?? ''} FROM ROOM`}
        message={`Removing ${removeTarget?.name ?? 'this team'} revokes their active session. They will need host approval and a new one-time code to re-enter.`}
        confirmLabel="Remove team"
        confirmTone="danger"
        loading={removing}
      >
        <div className="space-y-1.5">
          <label
            htmlFor="remove-team-reason"
            className="block font-mono text-[11px] uppercase tracking-[0.1em] text-[#8B95AA]"
          >
            Reason (optional)
          </label>
          <input
            id="remove-team-reason"
            type="text"
            value={removeReason}
            disabled={removing}
            onChange={(e) => setRemoveReason(e.target.value)}
            placeholder="e.g. Exited fullscreen or tab switch"
            className={INPUT_BASE_CLASS}
          />
        </div>
      </ConfirmModal>

      {/* View Members Modal */}
      <Modal
        open={Boolean(membersTarget)}
        onClose={() => setMembersTarget(null)}
        eyebrow={`FRANCHISE ROSTER // ${membersTarget?.short_code ?? ''}`}
        title={membersTarget?.name ?? 'TEAM MEMBERS'}
        maxWidthClass="max-w-xl"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setMembersTarget(null)}>
              Close
            </Button>
          </div>
        }
      >
        {selectedTeamMembers.length === 0 ? (
          <p className="py-6 text-center font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA]">
            NO MEMBERS RECORDED FOR THIS TEAM
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.08] rounded-[4px] border border-white/[0.08] bg-[#070B14]">
            {selectedTeamMembers.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-[#E8ECF4]">
                      {member.name}
                    </p>
                    {member.is_leader && <Tag accent="gold">LEADER</Tag>}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-xs text-[#8B95AA]">
                    {member.email}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
