import { PLAYER_CATEGORIES, type PlayerCategoryInfo } from '../data/categories';
import type { AuctionPhase, DbAuctionState } from '../types/database';

export const PHASE_LABEL: Record<AuctionPhase, string> = {
  idle: 'STANDBY',
  bidding: 'BIDDING LIVE',
  sold: 'SOLD',
  unsold: 'UNSOLD',
  paused: 'PAUSED',
};

/**
 * Computes the next legal bid amount in lakhs:
 * - If no team currently holds the high bid, opening bid = base price.
 * - Below ₹1 Cr (100 L): +₹20 L increment.
 * - From ₹1 Cr (100 L) upwards: +₹25 L increment.
 */
export function nextBid(
  state: Pick<DbAuctionState, 'current_bid_lakhs' | 'current_bid_team_id'> | null,
  basePriceLakhs: number,
): number {
  if (!state || state.current_bid_team_id === null) {
    return basePriceLakhs;
  }
  const current = state.current_bid_lakhs;
  if (current < 100) {
    return current + 20;
  }
  return current + 25;
}

/**
 * Returns remaining countdown milliseconds on the auction shot clock,
 * or null if no timer is currently active.
 */
export function remainingMs(
  state: Pick<DbAuctionState, 'phase' | 'timer_ends_at' | 'paused_remaining_ms'> | null,
  serverOffsetMs: number,
): number | null {
  if (!state) return null;

  if (state.phase === 'paused') {
    return Math.max(0, state.paused_remaining_ms ?? 0);
  }

  if (state.phase !== 'bidding' || !state.timer_ends_at) {
    return null;
  }

  const endsAtMs = Date.parse(state.timer_ends_at);
  if (Number.isNaN(endsAtMs)) {
    return null;
  }

  const serverNowMs = Date.now() + serverOffsetMs;
  return Math.max(0, endsAtMs - serverNowMs);
}

/**
 * Formats rate stats (strike rate / economy), returning "-" when unset/zero.
 */
export function formatStatValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return '-';
  }
  return value.toFixed(2);
}

/**
 * Resolves set metadata from a numeric set_no (1..8).
 */
export function getSetCategoryInfo(setNo: number | null | undefined): PlayerCategoryInfo | undefined {
  if (!setNo) return undefined;
  return PLAYER_CATEGORIES.find((cat) => cat.setNo === setNo);
}
