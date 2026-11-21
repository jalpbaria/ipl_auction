import { BookOpen, Check, LogOut, Menu, Play, User, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
import { useToastStore } from '../../store/toast';
import { useAuctionStore } from '../../store/useAuctionStore';
import { Button } from '../ui/Button';

const NAV_LINKS = [
  { label: 'About', href: '#about' },
  { label: 'Format', href: '#format' },
  { label: 'Rules', href: '#rules' },
];

export function Navbar() {
  const navigate = useNavigate();
  const rulesAccepted = useAuctionStore((s) => s.rulesAccepted);
  const openRuleBook = useAuctionStore((s) => s.openRuleBook);

  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const logout = useAuthStore((s) => s.logout);
  const showToast = useToastStore((s) => s.showToast);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const displayName =
    profile?.full_name || session?.user.email?.split('@')[0] || 'Manager';

  const handleStartGame = () => {
    if (!rulesAccepted) return;
    navigate(session ? '/rooms' : '/login');
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      showToast({
        title: 'Signed out',
        description: 'Your device session has been closed.',
        tone: 'info',
      });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#070B14]">
      <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="#top"
          className="font-display text-2xl sm:text-[28px] tracking-[0.06em] text-[#E8ECF4] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#22D3EE]"
        >
          IPL <span className="text-[#F5B921]">AUCTION</span>
        </a>

        {/* Zone 2: Navigation Links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-8"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="relative py-1 font-mono text-xs uppercase tracking-[0.12em] text-[#8B95AA] whitespace-nowrap shrink-0 transition-colors duration-150 hover:text-[#E8ECF4] after:absolute after:bottom-0 after:left-0 after:h-[1px] after:w-0 after:bg-[#F5B921] after:transition-all after:duration-150 hover:after:w-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#22D3EE]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Zone 3: User Session + Rule Book + Start Game */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          {session && (
            <div className="flex items-center gap-2 border-r border-white/10 pr-3">
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#E8ECF4] max-w-[140px] truncate">
                <User className="h-3.5 w-3.5 shrink-0 text-[#22D3EE]" aria-hidden="true" />
                <span className="truncate">{displayName}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={loggingOut}
                onClick={handleLogout}
                aria-label="Logout"
                className="px-2.5 text-[#8B95AA] hover:text-[#E8ECF4]"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{loggingOut ? 'Exiting...' : 'Logout'}</span>
              </Button>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={openRuleBook}
            className={
              rulesAccepted
                ? 'border-[#F5B921]/50 text-[#F5B921]'
                : 'border-white/20 text-[#E8ECF4]'
            }
          >
            {rulesAccepted ? (
              <Check className="h-3.5 w-3.5 text-[#F5B921]" />
            ) : (
              <BookOpen className="h-3.5 w-3.5 text-[#F5B921]" />
            )}
            <span>Rule Book</span>
          </Button>

          {/* Tooltip wrapper so disabled button still displays tooltip on hover/focus */}
          <div className="group relative inline-flex">
            <Button
              variant="cyan"
              size="sm"
              disabled={!rulesAccepted}
              onClick={handleStartGame}
              title={
                !rulesAccepted
                  ? 'Accept the rule book first'
                  : session
                    ? 'Select entry protocol'
                    : 'Sign in to start'
              }
              aria-describedby={!rulesAccepted ? 'start-game-tooltip' : undefined}
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Start Game</span>
            </Button>

            {!rulesAccepted && (
              <div
                id="start-game-tooltip"
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full mt-2 w-max rounded-[4px] border border-[#F5B921]/40 bg-[#141C2F] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[#F5B921] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                Accept the rule book first
              </div>
            )}
          </div>
        </div>

        {/* Mobile menu button (<640px) */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
          className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-white/10 bg-[#0E1524] text-[#E8ECF4] sm:hidden"
        >
          {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {/* Mobile collapsible menu */}
      {mobileMenuOpen && (
        <div className="border-t border-white/[0.08] bg-[#0E1524] px-4 py-4 sm:hidden">
          {session && (
            <div className="mb-3 flex items-center justify-between border-b border-white/[0.08] pb-3">
              <span className="inline-flex items-center gap-2 font-mono text-xs text-[#E8ECF4]">
                <User className="h-3.5 w-3.5 text-[#22D3EE]" />
                <span>{displayName}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={loggingOut}
                onClick={handleLogout}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Logout</span>
              </Button>
            </div>
          )}

          <nav className="flex flex-col gap-3 border-b border-white/[0.08] pb-4">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="font-mono text-xs uppercase tracking-[0.12em] text-[#E8ECF4] py-1"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="mt-4 flex flex-col gap-2.5">
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setMobileMenuOpen(false);
                openRuleBook();
              }}
              className="w-full"
            >
              <BookOpen className="h-4 w-4 text-[#F5B921]" />
              <span>{rulesAccepted ? 'Rule Book (Accepted)' : 'Rule Book'}</span>
            </Button>
            <Button
              variant="cyan"
              size="md"
              disabled={!rulesAccepted}
              onClick={() => {
                setMobileMenuOpen(false);
                handleStartGame();
              }}
              title={!rulesAccepted ? 'Accept the rule book first' : 'Start Game'}
              className="w-full"
            >
              <Play className="h-4 w-4 fill-current" />
              <span>Start Game</span>
            </Button>
            {!rulesAccepted && (
              <p className="text-center font-mono text-[11px] uppercase tracking-[0.06em] text-[#F5B921]">
                Accept the rule book first
              </p>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
