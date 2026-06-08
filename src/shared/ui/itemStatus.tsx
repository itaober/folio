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
