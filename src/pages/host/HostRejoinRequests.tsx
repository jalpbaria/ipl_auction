import { Check, Copy, Loader2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { TeamCrest } from '../../components/host/TeamCrest';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { supabase } from '../../lib/supabase';
import { useHostRoom } from '../../store/hostRoom';
import { useToastStore } from '../../store/toast';
import type { DbRejoinRequest } from '../../types/database';

function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000),
  );
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function HostRejoinRequests() {
  const teams = useHostRoom((s) => s.teams);
  const rejoinRequests = useHostRoom((s) => s.rejoinRequests);
  const refreshRejoinRequests = useHostRoom((s) => s.refreshRejoinRequests);
  const refreshTeamCodes = useHostRoom((s) => s.refreshTeamCodes);
  const showToast = useToastStore((s) => s.showToast);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [approvedModal, setApprovedModal] = useState<{
    teamName: string;
    code: string;
  } | null>(null);

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const pendingRequests = useMemo(
    () => rejoinRequests.filter((r) => r.status === 'pending'),
    [rejoinRequests],
  );

  const historyRequests = useMemo(
    () => rejoinRequests.filter((r) => r.status !== 'pending'),
    [rejoinRequests],
  );

  const handleApprove = async (req: DbRejoinRequest) => {
    if (!supabase) return;
    setBusyId(req.id);

    try {
      const { data, error } = await supabase.rpc('approve_rejoin', {
        p_request_id: req.id,
      });

      if (error) {
        showToast({
          title: 'Could not approve request',
          description: error.message,
          tone: 'error',
        });
        return;
      }

      const newCode = typeof data === 'string' ? data : String(data ?? '');
      const team = teamMap.get(req.team_id);

      await Promise.all([refreshRejoinRequests(), refreshTeamCodes()]);

      setApprovedModal({
        teamName: team?.name || team?.short_code || 'Franchise',
        code: newCode,
      });
    } catch (err) {
      showToast({
        title: 'Error approving request',
        description: err instanceof Error ? err.message : 'Request failed.',
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (req: DbRejoinRequest) => {
    if (!supabase) return;
    setBusyId(req.id);

    try {
      const { error } = await supabase.rpc('reject_rejoin', {
        p_request_id: req.id,
      });

      if (error) {
        showToast({
          title: 'Could not reject request',
          description: error.message,
          tone: 'error',
        });
        return;
      }

      await refreshRejoinRequests();
      showToast({
        title: 'Request rejected',
        description: 'The re-entry request has been declined.',
        tone: 'info',
      });
    } catch (err) {
      showToast({
        title: 'Error rejecting request',
        description: err instanceof Error ? err.message : 'Request failed.',
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleCopyApprovedCode = async () => {
    if (!approvedModal?.code) return;
    try {
      await navigator.clipboard.writeText(approvedModal.code);
      showToast({
        title: 'Code copied',
        description: `${approvedModal.code} copied to clipboard.`,
        tone: 'success',
      });
    } catch {
      showToast({
        title: 'Clipboard unavailable',
        description: 'Copy the code manually.',
        tone: 'warning',
      });
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-white/[0.08] pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#F5B921]">
          RE-ENTRY QUEUE // FULLSCREEN RECOVERY
        </p>
        <h1 className="mt-1.5 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
          RE-ENTRY REQUESTS
        </h1>
      </div>

      {/* Pending Requests */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
            PENDING APPROVAL ({pendingRequests.length})
          </h2>
        </div>

        {pendingRequests.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#8B95AA]">
              No pending requests
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {pendingRequests.map((req) => {
              const team = teamMap.get(req.team_id);
              const isBusy = busyId === req.id;

              return (
                <Card key={req.id} brackets bracketTone="gold" className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <TeamCrest
                        shortCode={team?.short_code || 'TM'}
                        size="lg"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-display text-2xl tracking-wide text-[#E8ECF4]">
                          {team?.name || 'Unknown Team'}
                        </p>
                        <p className="font-mono text-xs text-[#8B95AA]">
                          Leader: {team?.leader_name || 'Unknown'}
                        </p>
                      </div>
                    </div>

                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#F5B921] tabular-nums shrink-0">
                      {formatRelativeTime(req.created_at)}
                    </span>
                  </div>

                  <div className="mt-5 flex items-center justify-end gap-2.5 border-t border-white/[0.08] pt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => void handleReject(req)}
                      className="border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Reject</span>
                    </Button>

                    <Button
                      variant="cyan"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => void handleApprove(req)}
                    >
                      {isBusy ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Approving...</span>
                        </>
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Approve</span>
                        </>
                      )}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* History List */}
      <section className="space-y-4 border-t border-white/[0.08] pt-6">
        <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
          History
        </h2>

        {historyRequests.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#8B95AA]">
              NO RESOLVED REQUESTS YET
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-white/[0.06]">
            {historyRequests.map((req) => {
              const team = teamMap.get(req.team_id);
              const isApproved = req.status === 'approved';
              return (
                <div
                  key={req.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <TeamCrest shortCode={team?.short_code || 'TM'} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#E8ECF4]">
                        {team?.name || 'Franchise'}
                      </p>
                      <p className="font-mono text-[11px] text-[#8B95AA]">
                        Leader: {team?.leader_name || '—'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-[11px] text-[#8B95AA] tabular-nums">
                      Resolved {formatDateTime(req.resolved_at || req.created_at)}
                    </span>
                    <Badge tone={isApproved ? 'cyan' : 'danger'}>
                      {req.status}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      {/* Approved Code Modal */}
      <Modal
        open={Boolean(approvedModal)}
        onClose={() => setApprovedModal(null)}
        eyebrow="RE-ENTRY APPROVED"
        title={approvedModal ? `${approvedModal.teamName} — NEW CODE` : 'NEW CODE'}
        maxWidthClass="max-w-md"
        footer={
          <div className="flex justify-end">
            <Button variant="cyan" size="sm" onClick={() => setApprovedModal(null)}>
              Done
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-center">
          <p className="text-sm text-[#8B95AA]">
            Give this code to the team. It works once.
          </p>

          <div className="rounded-[4px] border border-[#F5B921]/50 bg-[#070B14] px-6 py-5">
            <p className="font-mono text-3xl sm:text-4xl font-bold tracking-[0.14em] text-[#F5B921] select-all">
              {approvedModal?.code}
            </p>
          </div>

          <Button
            variant="gold"
            size="md"
            onClick={() => void handleCopyApprovedCode()}
            className="w-full"
          >
            <Copy className="h-4 w-4" />
            <span>Copy</span>
          </Button>
        </div>
      </Modal>
    </div>
  );
}
