export type NoticeLevel = 'success' | 'error' | 'info';

export function noticeClass(level: NoticeLevel): string {
  if (level === 'success') {
    return 'border border-(--border) bg-bg-surface text-text-secondary';
  }
  if (level === 'error') {
    return 'border border-(--accent-border) bg-accent-subtle text-accent';
  }
  return 'border border-(--border) bg-bg-surface text-text-secondary';
}
