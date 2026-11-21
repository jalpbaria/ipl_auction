import { useAuctionStore } from '../../store/useAuctionStore';

export function Footer() {
  const rulesAccepted = useAuctionStore((s) => s.rulesAccepted);
  const openRuleBook = useAuctionStore((s) => s.openRuleBook);

  return (
    <footer className="bg-[#070B14] py-10">
      <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div>
          <p className="font-display text-2xl tracking-[0.06em] text-[#E8ECF4]">
            IPL <span className="text-[#F5B921]">AUCTION</span>
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[#8B95AA]">
            [ EVENT NAME PLACEHOLDER — ANNUAL COLLEGE CRICKET AUCTION ]
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <a
            href="#about"
            className="font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA] transition-colors hover:text-[#E8ECF4]"
          >
            About
          </a>
          <a
            href="#format"
            className="font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA] transition-colors hover:text-[#E8ECF4]"
          >
            Format
          </a>
          <a
            href="#rules"
            className="font-mono text-xs uppercase tracking-[0.1em] text-[#8B95AA] transition-colors hover:text-[#E8ECF4]"
          >
            Rules
          </a>
          <button
            type="button"
            onClick={openRuleBook}
            className="font-mono text-xs uppercase tracking-[0.1em] text-[#F5B921] transition-colors hover:text-[#F7C74B]"
          >
            {rulesAccepted ? 'Rule Book (Accepted)' : 'Open Rule Book'}
          </button>
        </div>
      </div>
    </footer>
  );
}
