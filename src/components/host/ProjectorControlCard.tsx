import { ExternalLink, Gavel, Loader2, Trophy, Users } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useHostRoom } from '../../store/hostRoom';
import { useToastStore } from '../../store/toast';
import type { ProjectorMode } from '../../types/database';
import { Button } from '../ui/Button';

interface ProjectorControlCardProps {
  roomId: string;
  currentMode: ProjectorMode;
  compact?: boolean;
  onModeChanged?: () => Promise<void> | void;
}

const MODE_OPTIONS: Array<{
  mode: ProjectorMode;
  label: string;
  icon: typeof Gavel;
}> = [
  { mode: 'auction', label: 'Auction (live)', icon: Gavel },
  { mode: 'squads', label: 'Squads', icon: Users },
  { mode: 'leaderboard', label: 'Leaderboard reveal', icon: Trophy },
];

export function openProjectorWindow(roomId: string) {
  window.open(`/projector/${roomId}`, 'ipl-projector', 'noopener');
}

export function ProjectorControlCard({
  roomId,
  currentMode,
  compact = false,
  onModeChanged,
}: ProjectorControlCardProps) {
  const refreshRoom = useHostRoom((s) => s.refreshRoom);
  const showToast = useToastStore((s) => s.showToast);
  const [busyMode, setBusyMode] = useState<ProjectorMode | null>(null);

  const handleSelectMode = async (mode: ProjectorMode) => {
    if (!supabase || busyMode || mode === currentMode) return;
    setBusyMode(mode);

    try {
      const { error } = await supabase.rpc('set_projector_mode', {
        p_room: roomId,
        p_mode: mode,
      });

      if (error) {
        showToast({
          title: 'Failed to switch projector mode',
          description: error.message,
          tone: 'error',
        });
        return;
      }

      await Promise.all([refreshRoom(), Promise.resolve(onModeChanged?.())]);
      showToast({
        title: 'Projector updated',
        description: `Screen switched to ${
          MODE_OPTIONS.find((m) => m.mode === mode)?.label ?? mode
        }.`,
        tone: 'success',
        durationMs: 2500,
      });
    } catch (err) {
      showToast({
        title: 'Error updating projector',
        description: err instanceof Error ? err.message : 'Request failed.',
        tone: 'error',
      });
    } finally {
      setBusyMode(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8B95AA]">
          PROJECTOR SHOWS
        </p>
        {compact && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => openProjectorWindow(roomId)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Open projector</span>
          </Button>
        )}
      </div>

      <div
        role="group"
        aria-label="Projector shows"
        className={`grid gap-2 rounded-[4px] border border-white/10 bg-[#070B14] p-1.5 ${
          compact ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'
        }`}
      >
        {MODE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = currentMode === option.mode;
          const isBusy = busyMode === option.mode;

          return (
            <button
              key={option.mode}
              type="button"
              disabled={busyMode !== null}
              aria-pressed={isActive}
              onClick={() => void handleSelectMode(option.mode)}
              className={`inline-flex items-center justify-center gap-2 rounded-[3px] border px-3 py-2 font-mono text-xs font-semibold uppercase tracking-[0.06em] transition-colors focus-visible:outline-2 focus-visible:outline-[#22D3EE] disabled:opacity-60 ${
                isActive
                  ? 'border-[#22D3EE] bg-[#22D3EE] text-[#070B14]'
                  : 'border-transparent bg-[#0E1524] text-[#8B95AA] hover:border-white/15 hover:text-[#E8ECF4]'
              }`}
            >
              {isBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
