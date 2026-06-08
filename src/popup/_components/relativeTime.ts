/**
 * Compact relative date for popup item rows (e.g. "2m", "1h", "Yesterday",
 * "Tue", "Mar 4"). Mirrors the redesign prototype's terse meta line. Word tokens
 * and the Intl date parts follow the app locale (NOT the OS locale).
 */
export function formatRelativeDate(
  timestamp: number,
  locale: string = 'en',
  now = Date.now()
): string {
  const zh = locale === 'zh-CN';
  const diffMs = now - timestamp;
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return zh ? '刚刚' : 'now';
  }

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return zh ? '刚刚' : 'now';
  }
  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)}m`;
  }
  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}h`;
  }
  if (diffMs < 2 * day) {
    return zh ? '昨天' : 'Yesterday';
  }

  const tag = zh ? 'zh-CN' : 'en-US';
  const date = new Date(timestamp);
  if (diffMs < 7 * day) {
    return date.toLocaleDateString(tag, { weekday: 'short' });
  }
  return date.toLocaleDateString(tag, { month: 'short', day: 'numeric' });
}
