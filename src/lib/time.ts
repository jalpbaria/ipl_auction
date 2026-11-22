/**
 * Formats an ISO timestamp string into local 12-hour time (e.g. "2:45:12 PM").
 */
export function formatTime12h(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  return new Date(ms).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/**
 * Formats an ISO timestamp string into local short date + 12-hour time.
 */
export function formatDateTime12h(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  return new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/**
 * Formats a concise human-readable relative time (e.g. "12s ago", "4m ago", "2h ago").
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';

  const diffSec = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

/**
 * Maps a violation type to a clear human-readable reason string.
 */
export function formatViolationReason(type: string): string {
  switch (type) {
    case 'tab_switch':
      return 'Switched tab or window';
    case 'esc_fullscreen':
      return 'Left fullscreen (Esc)';
    case 'multiple_login':
      return 'Multiple login';
    case 'other':
      return 'Removed by host';
    default:
      return type;
  }
}
