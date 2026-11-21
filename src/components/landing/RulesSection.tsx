import { BookOpen, Check } from 'lucide-react';
import { RULE_SECTIONS } from '../../data/rules';
import { useAuctionStore } from '../../store/useAuctionStore';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export function RulesSection() {
  const rulesAccepted = useAuctionStore((s) => s.rulesAccepted);
  const openRuleBook = useAuctionStore((s) => s.openRuleBook);

  return (
    <section
      id="rules"
      className="border-b border-white/[0.08] bg-[#070B14] py-14 sm:py-18"
    >
      <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge tone="gold">REGULATIONS</Badge>
            <h2 className="mt-3 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
              OFFICIAL AUCTION RULES
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[#8B95AA]">
              Every franchise must review and accept the complete rule book before entering
              the auction lobby.
            </p>
          </div>

          <div className="shrink-0">
            <Button
              variant={rulesAccepted ? 'outline' : 'gold'}
              size="md"
              onClick={openRuleBook}
            >
              {rulesAccepted ? (
                <>
                  <Check className="h-4 w-4 text-[#F5B921]" />
                  <span>Rules Accepted — Review</span>
                </>
              ) : (
                <>
                  <BookOpen className="h-4 w-4" />
                  <span>Open Rule Book</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Rule Section Cards */}
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
          {RULE_SECTIONS.map((section) => (
            <Card key={section.id} brackets bracketTone="gold" className="p-6">
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#22D3EE]">
                    {section.code}
                  </span>
                  <h3 className="mt-1 font-display text-3xl tracking-wide text-[#E8ECF4]">
                    {section.title}
                  </h3>
                </div>
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#8B95AA] tabular-nums">
                  {section.items.length} {section.items.length === 1 ? 'CLAUSE' : 'CLAUSES'}
                </span>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-[#8B95AA]">
                {section.summary}
              </p>

              <dl className="mt-5 space-y-3.5">
                {section.items.map((item) => (
                  <div
                    key={item.id}
                    className="border-t border-white/[0.06] pt-3 first:border-t-0 first:pt-0"
                  >
                    <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#F5B921]">
                      {item.label}
                    </dt>
                    <dd className="mt-1 text-sm leading-relaxed text-[#E8ECF4]">
                      {item.detail}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
