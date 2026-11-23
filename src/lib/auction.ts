import { PLAYER_CATEGORIES, type PlayerCategoryInfo } from '../data/categories';
import type {
  AccelProgress,
  AccelStatus,
  AuctionPhase,
  DbAuctionState,
  DbRoom,
} from '../types/database';

export const PHASE_LABEL: Record<AuctionPhase, string> = {
  idle: 'STANDBY',
  bidding: 'BIDDING LIVE',
  sold: 'SOLD',
  unsold: 'UNSOLD',
  paused: 'PAUSED',
};

export interface RevealState {
  active: boolean;
  elapsedMs: number;
  remainingMs: number;
  durationMs: number;
}

export interface SetProgress {
  setNo: number;
  setLabel: string;
  total: number;
  remaining: number;
  done: number;
}

export interface SetOverviewItem {
  setNo: number;
  label: string;
  total: number;
  remaining: number;
  done: number;
}

export function normalizeAccelProgress(
  data: unknown,
  fallbackRoom?: Pick<
    DbRoom,
    'accel_status' | 'accel_picks_per_team' | 'accel_selection_ends_at'
  > | null,
): AccelProgress {
  const row = Array.isArray(data) ? data[0] : data;
  const r =
    row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
  const rawStatus = String(
    r?.status ?? fallbackRoom?.accel_status ?? 'off',
  ) as AccelStatus;
  const status: AccelStatus =
    rawStatus === 'selecting' ||
    rawStatus === 'live' ||
    rawStatus === 'done'
      ? rawStatus
      : 'off';

  return {
    status,
    ends_at:
      r?.ends_at !== undefined
        ? r.ends_at
          ? String(r.ends_at)
          : null
        : (fallbackRoom?.accel_selection_ends_at ?? null),
    picks_limit: Math.max(
      1,
      Number(r?.picks_limit ?? fallbackRoom?.accel_picks_per_team ?? 5),
    ),
    unsold_total: Math.max(0, Number(r?.unsold_total ?? 0)),
    queue_total: Math.max(0, Number(r?.queue_total ?? 0)),
    queue_remaining: Math.max(0, Number(r?.queue_remaining ?? 0)),
    my_picks: Math.max(0, Number(r?.my_picks ?? 0)),
  };
}

export function normalizeSetProgress(
  data: unknown,
  fallbackSetNo?: number | null,
): SetProgress | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const rawSetNo = Number(r.set_no ?? fallbackSetNo ?? 1);
  const setNo = Number.isFinite(rawSetNo) && rawSetNo >= 1 ? rawSetNo : 1;
  const catInfo = getSetCategoryInfo(setNo);
  return {
    setNo,
    setLabel: catInfo?.label ?? `Set ${setNo}`,
    total: Math.max(0, Number(r.total ?? 0)),
    remaining: Math.max(0, Number(r.remaining ?? 0)),
    done: Math.max(0, Number(r.done ?? 0)),
  };
}

export function normalizeSetsOverview(data: unknown): SetOverviewItem[] {
  const rows = Array.isArray(data) ? data : [];
  const bySetNo = new Map<number, Record<string, unknown>>();
  for (const item of rows) {
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const setNo = Number(rec.set_no);
      if (Number.isFinite(setNo) && setNo >= 1) {
        bySetNo.set(setNo, rec);
      }
    }
  }

  return PLAYER_CATEGORIES.map((cat) => {
    const raw = bySetNo.get(cat.setNo);
    const total = Math.max(0, Number(raw?.total ?? 0));
    const remaining = Math.max(0, Number(raw?.remaining ?? 0));
    const done = Math.max(0, Number(raw?.done ?? 0));
    return {
      setNo: cat.setNo,
      label: cat.label,
      total,
      remaining,
      done,
    };
  });
}

/**
 * Computes whether the pre-bid Player Reveal Preview is currently running
 * using server-synced clock offset.
 */
export function getReveal(
  state: Pick<DbAuctionState, 'phase' | 'bidding_opens_at'> | null,
  room: Pick<DbRoom, 'preview_seconds'> | null,
  serverOffsetMs: number,
): RevealState {
  if (!state || state.phase !== 'bidding' || !state.bidding_opens_at) {
    return { active: false, elapsedMs: 0, remainingMs: 0, durationMs: 0 };
  }

  const opensAtMs = Date.parse(state.bidding_opens_at);
  if (Number.isNaN(opensAtMs)) {
    return { active: false, elapsedMs: 0, remainingMs: 0, durationMs: 0 };
  }

  const serverNowMs = Date.now() + serverOffsetMs;
  const rem = opensAtMs - serverNowMs;
  if (rem <= 0) {
    return { active: false, elapsedMs: 0, remainingMs: 0, durationMs: 0 };
  }

  const previewSec = room?.preview_seconds ?? 30;
  const baseDurationMs = (previewSec > 0 ? previewSec : 30) * 1000;
  const durationMs = Math.max(rem, baseDurationMs);
  const elapsedMs = Math.max(0, durationMs - rem);

  return {
    active: true,
    elapsedMs,
    remainingMs: rem,
    durationMs,
  };
}

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
