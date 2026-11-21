import { Loader2, Lock, Send, Unlock } from 'lucide-react';
import React, { useState } from 'react';
import { ConfirmModal } from '../../components/host/ConfirmModal';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FormField, INPUT_BASE_CLASS } from '../../components/ui/FormField';
import { supabase } from '../../lib/supabase';
import { useHostRoom } from '../../store/hostRoom';
import { useToastStore } from '../../store/toast';

function formatTimestamp(iso: string): string {
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

export default function HostNotices() {
  const room = useHostRoom((s) => s.room);
  const notices = useHostRoom((s) => s.notices);
  const refreshRoom = useHostRoom((s) => s.refreshRoom);
  const refreshNotices = useHostRoom((s) => s.refreshNotices);
  const showToast = useToastStore((s) => s.showToast);

  const [togglingLock, setTogglingLock] = useState(false);
  const [confirmOpenModal, setConfirmOpenModal] = useState(false);

  const [message, setMessage] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [sendingNotice, setSendingNotice] = useState(false);
  const [noticeError, setNoticeError] = useState<string | null>(null);

  if (!room) return null;

  const setAuctionOpen = async (nextOpen: boolean) => {
    if (!supabase) return;
    setTogglingLock(true);

    try {
      const { error } = await supabase.rpc('set_auction_open', {
        p_room: room.id,
        p_open: nextOpen,
      });

      if (error) {
        showToast({
          title: 'Could not update room lock',
          description: error.message,
          tone: 'error',
        });
        return;
      }

      await refreshRoom();
      showToast({
        title: nextOpen ? 'Auction room opened' : 'Auction room locked',
        description: nextOpen
          ? 'Participants can now enter the auction room.'
          : 'Entry is locked for participants.',
        tone: nextOpen ? 'success' : 'warning',
      });
    } catch (err) {
      showToast({
        title: 'Error updating room lock',
        description: err instanceof Error ? err.message : 'Request failed.',
        tone: 'error',
      });
    } finally {
      setTogglingLock(false);
      setConfirmOpenModal(false);
    }
  };

  const handleToggleLockClick = () => {
    if (room.auction_open) {
      void setAuctionOpen(false);
    } else {
      setConfirmOpenModal(true);
    }
  };

  const handleSendNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    setNoticeError(null);

    const trimmed = message.trim();
    if (!trimmed) {
      setNoticeError('Notice message is required.');
      return;
    }
    if (trimmed.length > 280) {
      setNoticeError('Notice must be 280 characters or fewer.');
      return;
    }

    if (!supabase) return;
    setSendingNotice(true);

    try {
      const opensAtIso = opensAt ? new Date(opensAt).toISOString() : null;
      const { error } = await supabase.from('notices').insert({
        room_id: room.id,
        message: trimmed,
        opens_at: opensAtIso,
      });

      if (error) {
        setNoticeError(error.message || 'Could not send notice.');
        return;
      }

      setMessage('');
      setOpensAt('');
      await refreshNotices();
      showToast({
        title: 'Notice published',
        description: 'All participants in this room can view the announcement.',
        tone: 'success',
      });
    } catch (err) {
      setNoticeError(
        err instanceof Error ? err.message : 'Unexpected error sending notice.',
      );
    } finally {
      setSendingNotice(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-white/[0.08] pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#22D3EE]">
          PARTICIPANT GATE // BROADCAST NOTICES
        </p>
        <h1 className="mt-1.5 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
          NOTICES AND ROOM LOCK
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Auction Room Access Panel */}
        <Card
          brackets
          bracketTone={room.auction_open ? 'cyan' : 'gold'}
          className="flex flex-col justify-between p-6 lg:col-span-5"
        >
          <div>
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
                Auction room access
              </h2>
              <Badge tone={room.auction_open ? 'cyan' : 'gold'}>
                {room.auction_open ? 'OPEN' : 'LOCKED'}
              </Badge>
            </div>

            <div className="mt-6 flex items-center gap-4 rounded-[4px] border border-white/[0.08] bg-[#070B14] p-5">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] border ${
                  room.auction_open
                    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-400'
                    : 'border-[#F5B921]/40 bg-[#F5B921]/10 text-[#F5B921]'
                }`}
              >
                {room.auction_open ? (
                  <Unlock className="h-6 w-6" />
                ) : (
                  <Lock className="h-6 w-6" />
                )}
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                  CURRENT STATE
                </p>
                <p
                  className={`font-display text-4xl tracking-wider ${
                    room.auction_open ? 'text-emerald-400' : 'text-[#F5B921]'
                  }`}
                >
                  {room.auction_open ? 'OPEN' : 'LOCKED'}
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-[#8B95AA]">
              Participants cannot enter the live auction console while the room is locked.
              Use this gate to synchronize all ten franchise desks before starting Lot 1.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-white/[0.08]">
            <Button
              variant={room.auction_open ? 'gold' : 'cyan'}
              size="lg"
              disabled={togglingLock}
              onClick={handleToggleLockClick}
              className="w-full"
            >
              {togglingLock ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : room.auction_open ? (
                <>
                  <Lock className="h-4 w-4" />
                  <span>Lock auction room</span>
                </>
              ) : (
                <>
                  <Unlock className="h-4 w-4" />
                  <span>Open auction room</span>
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Send a Notice Form */}
        <Card brackets bracketTone="cyan" className="p-6 lg:col-span-7">
          <div className="border-b border-white/[0.08] pb-4">
            <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
              Send a notice
            </h2>
            <p className="mt-1 text-xs text-[#8B95AA]">
              Broadcast announcements or scheduled start times to all joined franchises.
            </p>
          </div>

          <form onSubmit={handleSendNotice} noValidate className="mt-5 space-y-4">
            <FormField
              id="notice-message"
              label="Message"
              hint={`${message.length} / 280`}
              required
              error={noticeError ?? undefined}
            >
              <textarea
                id="notice-message"
                rows={4}
                maxLength={280}
                value={message}
                disabled={sendingNotice}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Auction begins at 11:30 AM sharp. Keep fullscreen armed."
                className={`${INPUT_BASE_CLASS} resize-none`}
              />
            </FormField>

            <FormField
              id="notice-opens-at"
              label="Auction room opens at"
              hint="OPTIONAL"
            >
              <input
                id="notice-opens-at"
                type="datetime-local"
                value={opensAt}
                disabled={sendingNotice}
                onChange={(e) => setOpensAt(e.target.value)}
                className={`${INPUT_BASE_CLASS} font-mono`}
              />
            </FormField>

            <Button
              type="submit"
              variant="cyan"
              size="md"
              disabled={sendingNotice}
            >
              {sendingNotice ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Send</span>
                </>
              )}
            </Button>
          </form>
        </Card>
      </div>

      {/* Previous Notices */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl tracking-wide text-[#E8ECF4]">
          PREVIOUS NOTICES ({notices.length})
        </h2>

        {notices.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#8B95AA]">
              NO NOTICES PUBLISHED YET
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-white/[0.06]">
            {notices.map((notice) => (
              <div key={notice.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8B95AA] tabular-nums">
                    SENT {formatTimestamp(notice.created_at)}
                  </span>
                  {notice.opens_at && (
                    <Badge tone="gold">
                      OPENS AT {formatTimestamp(notice.opens_at)}
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[#E8ECF4]">
                  {notice.message}
                </p>
              </div>
            ))}
          </Card>
        )}
      </section>

      <ConfirmModal
        open={confirmOpenModal}
        onClose={() => setConfirmOpenModal(false)}
        onConfirm={() => void setAuctionOpen(true)}
        eyebrow="ROOM ACCESS"
        title="OPEN AUCTION ROOM"
        message="Participants will be able to enter the auction room"
        confirmLabel="Open room"
        confirmTone="cyan"
        loading={togglingLock}
      />
    </div>
  );
}
