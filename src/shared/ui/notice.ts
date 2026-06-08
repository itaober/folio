export type NoticeLevel = 'success' | 'error' | 'info';

export function noticeClass(level: NoticeLevel): string {
  if (level === 'error') {
    return 'border border-danger/40 bg-(--danger-tint) text-danger';
  }
  if (level === 'success') {
    return 'border border-border bg-surface text-foreground';
  }
  return 'border border-border bg-surface text-foreground';
}
