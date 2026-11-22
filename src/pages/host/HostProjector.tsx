import { Check, Copy, ExternalLink, Info, Monitor, Tv } from 'lucide-react';
import { useState } from 'react';
import {
  openProjectorWindow,
  ProjectorControlCard,
} from '../../components/host/ProjectorControlCard';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useHostRoom } from '../../store/hostRoom';
import { useToastStore } from '../../store/toast';
import type { ProjectorMode } from '../../types/database';

export default function HostProjector() {
  const room = useHostRoom((s) => s.room);
  const showToast = useToastStore((s) => s.showToast);

  const [copiedUrl, setCopiedUrl] = useState(false);

  if (!room) return null;

  const currentMode: ProjectorMode = room.projector_mode ?? 'auction';
  const projectorPath = `/projector/${room.id}`;
  const fullProjectorUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${projectorPath}`
      : projectorPath;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullProjectorUrl);
      setCopiedUrl(true);
      showToast({
        title: 'Projector link copied',
        description: fullProjectorUrl,
        tone: 'success',
      });
      window.setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      showToast({
        title: 'Clipboard unavailable',
        description: 'Copy the URL manually from the field.',
        tone: 'warning',
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#22D3EE]">
            VENUE DISPLAY // 1920x1080 BROADCAST FEED
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
              PROJECTOR ROOM
            </h1>
            <Badge tone="cyan">MODE: {currentMode.toUpperCase()}</Badge>
          </div>
        </div>

        <Button
          variant="gold"
          size="lg"
          onClick={() => openProjectorWindow(room.id)}
        >
          <ExternalLink className="h-4 w-4" />
          <span>Open projector window</span>
        </Button>
      </div>

      {/* Mode Switch + Shareable Link */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card brackets bracketTone="cyan" className="p-6 lg:col-span-7 space-y-5">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <div className="flex items-center gap-2.5">
              <Tv className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
              <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
                LIVE DISPLAY MODE
              </h2>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#22D3EE]">
              SYNCED IN REALTIME
            </span>
          </div>

          <ProjectorControlCard roomId={room.id} currentMode={currentMode} />

          <div className="space-y-2 border-t border-white/[0.08] pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
              DIRECT PROJECTOR URL
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={fullProjectorUrl}
                aria-label="Projector window URL"
                onClick={(e) => e.currentTarget.select()}
                className="w-full rounded-[4px] border border-white/15 bg-[#070B14] px-3 py-2 font-mono text-xs text-[#E8ECF4] focus:border-[#22D3EE] focus:outline-none"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCopyLink()}
                className="shrink-0"
              >
                {copiedUrl ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
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
          </div>
        </Card>

        {/* Instructions */}
        <Card brackets bracketTone="gold" className="p-6 lg:col-span-5 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-white/[0.08] pb-3">
            <Info className="h-4 w-4 text-[#F5B921]" aria-hidden="true" />
            <h2 className="font-display text-2xl tracking-wide text-[#F5B921]">
              PROJECTOR SETUP GUIDE
            </h2>
          </div>

          <ul className="space-y-2.5 text-sm text-[#E8ECF4]">
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#22D3EE]" />
              <span>
                Sign in with the <strong className="text-[#F5B921]">host account</strong> on the projector laptop before opening the link.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#22D3EE]" />
              <span>
                Press the top-bar <strong className="text-[#E8ECF4]">fullscreen button (F)</strong> or <strong className="text-[#E8ECF4]">F11</strong> to fill the hall display.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#22D3EE]" />
              <span>
                Keep the projector laptop awake and plugged into power throughout the auction.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#22D3EE]" />
              <span>
                Account device limit is <strong className="text-[#F5B921]">5 active sessions</strong> per account.
              </span>
            </li>
          </ul>
        </Card>
      </div>

      {/* Live 40% Scale Preview */}
      <Card brackets bracketTone="subtle" className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2.5">
            <Monitor className="h-4 w-4 text-[#F5B921]" aria-hidden="true" />
            <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              LIVE PREVIEW (40% SCALE)
            </h2>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA]">
            Sound only plays in the real projector window
          </span>
        </div>

        <div className="overflow-x-auto pb-1">
          <div
            style={{ width: 768, height: 432 }}
            className="relative mx-auto overflow-hidden rounded-[4px] border border-white/15 bg-[#070B14]"
          >
            <iframe
              title="Live Projector Preview"
              src={projectorPath}
              style={{
                width: 1920,
                height: 1080,
                transform: 'scale(0.4)',
                transformOrigin: 'top left',
              }}
              className="pointer-events-none border-0 bg-[#070B14]"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
