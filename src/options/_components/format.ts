import type { SupportedLocale } from '../../shared/i18n/localeStore';

export function localeTag(locale: SupportedLocale): string {
  return locale === 'zh-CN' ? 'zh-CN' : 'en-US';
}

export function formatCreatedAtLabel(
  timestamp: number,
  locale: SupportedLocale
): { short: string; full: string } {
  const tag = localeTag(locale);
  const date = new Date(timestamp);
  return {
    short: date.toLocaleDateString(tag, { month: 'short', day: 'numeric' }),
    full: date.toLocaleString(tag)
  };
}

/** "5m ago" / "2h ago" / "just now" relative label for sync timestamps. */
export function formatRelativeTime(
  timestamp: number | null,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  if (!timestamp) {
    return t('sync.never');
  }

  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);

  if (minutes < 1) {
    return t('sync.justNow');
  }
  if (minutes < 60) {
    return t('sync.minutesAgo', { count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t('sync.hoursAgo', { count: hours });
  }
  const days = Math.floor(hours / 24);
  return t('sync.daysAgo', { count: days });
}

export function normalizeTag(input: string): string {
  return input.trim().replace(/^#+/, '').replace(/\s+/g, ' ');
}
