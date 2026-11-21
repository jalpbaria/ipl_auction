import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CornerBrackets } from '../ui/CornerBrackets';

interface CardSlot {
  id: number;
  src: string;
  slotLabel: string;
  setHint: string;
}

const CARD_SLOTS: CardSlot[] = [
  { id: 1, src: '/cards/card-1.png', slotLabel: 'CARD SLOT 1', setHint: 'MARQUEE SET' },
  { id: 2, src: '/cards/card-2.png', slotLabel: 'CARD SLOT 2', setHint: 'LEGENDS SET' },
  { id: 3, src: '/cards/card-3.png', slotLabel: 'CARD SLOT 3', setHint: 'BATTER SET' },
  { id: 4, src: '/cards/card-4.png', slotLabel: 'CARD SLOT 4', setHint: 'BOWLER SET' },
  { id: 5, src: '/cards/card-5.png', slotLabel: 'CARD SLOT 5', setHint: 'ALLROUNDER SET' },
];

// Duplicate list twice for seamless CSS marquee loop
const LOOP_CARDS = [...CARD_SLOTS, ...CARD_SLOTS];

export function CardCarousel() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});
  const [isHovered, setIsHovered] = useState(false);
  const [isManualPaused, setIsManualPaused] = useState(false);
  const [manualStep, setManualStep] = useState(0);
  const [centerIndex, setCenterIndex] = useState(1);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const handleImageError = useCallback((slotId: number) => {
    setFailedImages((prev) => {
      if (prev[slotId]) return prev;
      return { ...prev, [slotId]: true };
    });
  }, []);

  const updateCenterCard = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const viewportRect = viewport.getBoundingClientRect();
    const viewportCenter = viewportRect.left + viewportRect.width / 2;

    let closestIdx = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    itemRefs.current.forEach((el, idx) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cardCenter = rect.left + rect.width / 2;
      const distance = Math.abs(cardCenter - viewportCenter);
      if (distance < minDistance) {
        minDistance = distance;
        closestIdx = idx;
      }
    });

    setCenterIndex(closestIdx % CARD_SLOTS.length);
  }, []);

  // Poll center card smoothly during continuous CSS scroll
  useEffect(() => {
    updateCenterCard();

    if (prefersReducedMotion || isHovered || isManualPaused) {
      return;
    }

    let rafId = 0;
    let lastTick = 0;

    const tick = (now: number) => {
      if (now - lastTick >= 90) {
        updateCenterCard();
        lastTick = now;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [prefersReducedMotion, isHovered, isManualPaused, manualStep, updateCenterCard]);

  // Also update when window resizes
  useEffect(() => {
    window.addEventListener('resize', updateCenterCard);
    return () => window.removeEventListener('resize', updateCenterCard);
  }, [updateCenterCard]);

  const handlePrev = () => {
    setIsManualPaused(true);
    setManualStep((prev) => {
      const next = prev - 1;
      const wrapped = ((next % CARD_SLOTS.length) + CARD_SLOTS.length) % CARD_SLOTS.length;
      setCenterIndex(wrapped);
      return next;
    });
  };

  const handleNext = () => {
    setIsManualPaused(true);
    setManualStep((prev) => {
      const next = prev + 1;
      const wrapped = ((next % CARD_SLOTS.length) + CARD_SLOTS.length) % CARD_SLOTS.length;
      setCenterIndex(wrapped);
      return next;
    });
  };

  const activeSlotNumber = (centerIndex % CARD_SLOTS.length) + 1;
  const progressPercent = (activeSlotNumber / CARD_SLOTS.length) * 100;
  const isPaused = isHovered || isManualPaused || prefersReducedMotion;

  // Step translation used when stepping manually or in reduced motion
  const stepShiftPx = -(((manualStep % CARD_SLOTS.length) + CARD_SLOTS.length) % CARD_SLOTS.length) * 212;

  return (
    <div className="relative rounded-[4px] border border-white/[0.08] bg-[#0E1524] p-4 sm:p-5">
      <CornerBrackets tone="cyan" size="md" />

      {/* Broadcast Telemetry Header */}
      <div className="mb-4 flex items-center justify-between gap-4 border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-[1px] bg-[#22D3EE]" aria-hidden="true" />
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#22D3EE]">
            LIVE TELEMETRY
          </span>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#8B95AA] tabular-nums">
          SLOT 0{activeSlotNumber} / 0{CARD_SLOTS.length}
        </span>
      </div>

      {/* Carousel Viewport */}
      <div
        ref={viewportRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative overflow-hidden py-5"
        aria-label="Player auction card carousel"
      >
        {/* Edge fades matching surface #0E1524 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-20 w-10 bg-gradient-to-r from-[#0E1524] to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-20 w-10 bg-gradient-to-l from-[#0E1524] to-transparent"
        />

        {/* Manual step container */}
        <div
          className="transition-transform duration-300 ease-out"
          style={{
            transform: isManualPaused || prefersReducedMotion
              ? `translate3d(${stepShiftPx}px, 0, 0)`
              : 'translate3d(0, 0, 0)',
          }}
        >
          {/* Continuous CSS transform marquee track */}
          <div
            className={`flex w-max items-center gap-4 ${
              !isManualPaused && !prefersReducedMotion ? 'carousel-track-animate' : ''
            } ${isPaused ? 'carousel-track-paused' : ''}`}
          >
            {LOOP_CARDS.map((card, idx) => {
              const slotIndex = idx % CARD_SLOTS.length;
              const isCentered = slotIndex === centerIndex;
              const hasFailed = Boolean(failedImages[card.id]);

              return (
                <div
                  key={`${card.id}-${idx}`}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  className={`relative w-[176px] sm:w-[196px] shrink-0 transition-all duration-300 ease-out ${
                    isCentered
                      ? 'z-10 scale-[1.06] opacity-100'
                      : 'scale-[0.94] opacity-75'
                  }`}
                >
                  <div
                    className={`relative aspect-[687/1024] w-full overflow-hidden rounded-[4px] border bg-[#070B14] transition-shadow duration-300 ${
                      isCentered
                        ? 'border-[#F5B921] shadow-[0_0_26px_rgba(245,185,33,0.22),0_0_14px_rgba(34,211,238,0.14)]'
                        : 'border-[#F5B921]/45'
                    }`}
                  >
                    {!hasFailed ? (
                      <img
                        src={card.src}
                        alt={card.slotLabel}
                        referrerPolicy="no-referrer"
                        onError={() => handleImageError(card.id)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="relative flex h-full w-full flex-col justify-between bg-[#070B14] p-3.5 hero-gold-diagonal">
                        <CornerBrackets tone={isCentered ? 'gold' : 'subtle'} size="sm" />

                        <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B95AA]">
                            687:1024
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#22D3EE]">
                            0{card.id}
                          </span>
                        </div>

                        <div className="my-auto flex flex-col items-center text-center">
                          <div className="mb-2.5 h-10 w-10 rounded-[2px] border border-[#F5B921]/45 bg-[#141C2F] flex items-center justify-center">
                            <span className="font-display text-xl text-[#F5B921]">
                              0{card.id}
                            </span>
                          </div>
                          <p className="font-display text-2xl tracking-wider text-[#F5B921]">
                            {card.slotLabel}
                          </p>
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                            /public/cards/card-{card.id}.png
                          </p>
                        </div>

                        <div className="border-t border-white/[0.08] pt-2 flex items-center justify-between">
                          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                            {card.setHint}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#F5B921]">
                            READY
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Controls & Progress Bar */}
      <div className="mt-3 border-t border-white/[0.08] pt-3.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous player card"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] border border-white/15 bg-[#141C2F] text-[#E8ECF4] transition-colors hover:border-[#22D3EE] hover:text-[#22D3EE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next player card"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] border border-white/15 bg-[#141C2F] text-[#E8ECF4] transition-colors hover:border-[#22D3EE] hover:text-[#22D3EE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {!prefersReducedMotion && (
              <button
                type="button"
                onClick={() => setIsManualPaused((p) => !p)}
                aria-label={isManualPaused ? 'Resume auto-scroll' : 'Pause auto-scroll'}
                className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-white/10 bg-[#141C2F] px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#8B95AA] transition-colors hover:border-white/25 hover:text-[#E8ECF4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE]"
              >
                {isManualPaused ? (
                  <>
                    <Play className="h-3 w-3 text-[#22D3EE]" />
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="h-3 w-3 text-[#F5B921]" />
                    <span>{isHovered ? 'Paused' : 'Auto'}</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex-1 max-w-[200px]">
            <div className="h-1.5 w-full overflow-hidden rounded-[2px] bg-[#070B14] border border-white/[0.08]">
              <div
                className="h-full bg-gradient-to-r from-[#22D3EE] to-[#F5B921] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
