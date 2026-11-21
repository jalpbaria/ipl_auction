import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RULE_BOOK_VERSION, RULE_SECTIONS } from '../../data/rules';
import { useAuthStore } from '../../store/auth';
import { useToastStore } from '../../store/toast';
import { useAuctionStore } from '../../store/useAuctionStore';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export function RuleBookModal() {
  const open = useAuctionStore((s) => s.ruleBookOpen);
  const rulesAccepted = useAuctionStore((s) => s.rulesAccepted);
  const closeRuleBook = useAuctionStore((s) => s.closeRuleBook);
  const acceptRules = useAuctionStore((s) => s.acceptRules);

  const session = useAuthStore((s) => s.session);
  const syncRulesAcceptedAt = useAuthStore((s) => s.syncRulesAcceptedAt);
  const showToast = useToastStore((s) => s.showToast);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  const evaluateScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 4) {
      setScrollPercent(100);
      setScrolledToBottom(true);
      return;
    }

    const ratio = Math.min(1, Math.max(0, el.scrollTop / maxScroll));
    setScrollPercent(Math.round(ratio * 100));

    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
      setScrolledToBottom(true);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setScrolledToBottom(false);
      setScrollPercent(0);
      setChecked(rulesAccepted);
      setSaving(false);
      return;
    }

    setChecked(rulesAccepted);
    const timer = window.setTimeout(() => {
      evaluateScroll();
    }, 40);

    window.addEventListener('resize', evaluateScroll);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', evaluateScroll);
    };
  }, [open, rulesAccepted, evaluateScroll]);

  const handleConfirmAccept = async () => {
    if (!scrolledToBottom || !checked || saving) return;

    setSaving(true);
    try {
      acceptRules();
      if (session) {
        await syncRulesAcceptedAt();
      }
      showToast({
        title: 'Rule book accepted',
        description: session
          ? 'Start Game is now unlocked for your account.'
          : 'Start Game is now unlocked. Sign in to enter a room.',
        tone: 'success',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={closeRuleBook}
      eyebrow={`AUCTION RULE BOOK // REV ${RULE_BOOK_VERSION}`}
      title="TOURNAMENT RULES & CONDUCT"
      subtitle="Read every regulation carefully and scroll to the end to unlock acceptance."
      maxWidthClass="max-w-3xl"
      footer={
        <div className="space-y-4">
          {/* Scroll gate status + progress */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {scrolledToBottom ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#22D3EE]">
                  <Check className="h-3.5 w-3.5" />
                  END OF DOCUMENT REACHED
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#F5B921]">
                  <ChevronDown className="h-3.5 w-3.5" />
                  SCROLL TO THE BOTTOM TO ENABLE ACCEPTANCE
                </span>
              )}
            </div>
            <span className="font-mono text-[11px] text-[#8B95AA] tabular-nums">
              {scrollPercent}% READ
            </span>
          </div>

          <div className="h-1 w-full overflow-hidden rounded-[2px] bg-[#070B14]">
            <div
              className="h-full bg-gradient-to-r from-[#22D3EE] to-[#F5B921] transition-all duration-150"
              style={{ width: `${scrollPercent}%` }}
            />
          </div>

          {/* Checkbox + Actions */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <label
              className={`flex items-start gap-3 select-none ${
                scrolledToBottom ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!scrolledToBottom || saving}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded-[2px] border border-white/25 bg-[#070B14] accent-[#22D3EE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE]"
              />
              <span className="text-sm text-[#E8ECF4]">
                I have read and accept the terms and conditions
              </span>
            </label>

            <div className="flex items-center justify-end gap-3 shrink-0">
              <Button variant="ghost" size="sm" onClick={closeRuleBook}>
                Close
              </Button>
              <Button
                variant="cyan"
                size="sm"
                disabled={!scrolledToBottom || !checked || saving}
                onClick={handleConfirmAccept}
              >
                {saving ? 'Saving...' : 'Accept'}
              </Button>
            </div>
          </div>
        </div>
      }
    >
      {/* Scrollable Rule Book Body */}
      <div
        ref={scrollContainerRef}
        onScroll={evaluateScroll}
        tabIndex={0}
        aria-label="Auction rule book terms and conditions"
        className="broadcast-scroll max-h-[50vh] space-y-6 overflow-y-auto rounded-[4px] border border-white/[0.08] bg-[#070B14] p-5 focus-visible:outline-2 focus-visible:outline-[#22D3EE]"
      >
        {RULE_SECTIONS.map((section) => (
          <section
            key={section.id}
            className="border-b border-white/[0.08] pb-5 last:border-b-0 last:pb-0"
          >
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="font-display text-2xl tracking-wide text-[#F5B921]">
                {section.title}
              </h3>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                {section.code}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#8B95AA]">{section.summary}</p>

            <ul className="mt-3.5 space-y-2.5">
              {section.items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-[4px] border border-white/[0.06] bg-[#0E1524] px-4 py-3"
                >
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#22D3EE]">
                    {item.label}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[#E8ECF4]">
                    {item.detail}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* Explicit end-of-document acknowledgment marker so scroll-to-bottom is unmistakable */}
        <div className="rounded-[4px] border border-[#F5B921]/25 bg-[#0E1524] px-4 py-3 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#F5B921]">
            END OF RULE BOOK — CONFIRM ACCEPTANCE BELOW
          </p>
        </div>
      </div>
    </Modal>
  );
}
