import { BookOpen, CheckCheck, Clock3 } from 'lucide-react';
import type { ReactElement } from 'react';
import type { FolioStatus } from '../../core/types';

export function statusToLabel(
  status: FolioStatus,
  t: (key: string) => string
): string {
  if (status === 'unread') return t('common.unread');
  if (status === 'reading') return t('common.reading');
  return t('common.done');
}

export function nextStatus(status: FolioStatus): FolioStatus {
  if (status === 'unread') return 'reading';
  if (status === 'reading') return 'done';
  return 'unread';
}

export function statusBadgeClass(status: FolioStatus): string {
  if (status === 'unread') {
    return 'bg-(--status-unread-bg) text-(--status-unread-text)';
  }
  if (status === 'reading') {
    return 'bg-(--status-reading-bg) text-(--status-reading-text)';
  }
  return 'bg-(--status-done-bg) text-(--status-done-text)';
}

export function statusIcon(status: FolioStatus): ReactElement {
  if (status === 'unread') {
    return <Clock3 className="h-3.5 w-3.5" strokeWidth={2} />;
  }
  if (status === 'reading') {
    return <BookOpen className="h-3.5 w-3.5" strokeWidth={2} />;
  }
  return <CheckCheck className="h-3.5 w-3.5" strokeWidth={2} />;
}
