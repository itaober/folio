import { BookOpen, CheckCheck, Clock3 } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { FolioStatus } from '../../core/types';

interface StatusPillProps {
  status: FolioStatus;
  size?: 'sm' | 'md';
  /** Hide the leading icon (label only). */
  hideIcon?: boolean;
  className?: string;
}

const STATUS_META: Record<
  FolioStatus,
  { cls: string; labelKey: string; Icon: typeof Clock3 }
> = {
  unread: { cls: 'fz-status-unread', labelKey: 'common.unread', Icon: Clock3 },
  reading: { cls: 'fz-status-reading', labelKey: 'common.reading', Icon: BookOpen },
  done: { cls: 'fz-status-done', labelKey: 'common.done', Icon: CheckCheck }
};

/**
 * Reading-status chip (unread / reading / done). Uses the hued faiz status
 * tokens via the `fz-status` component classes; localized label from i18n.
 */
export function StatusPill({
  status,
  size = 'md',
  hideIcon = false,
  className
}: StatusPillProps): ReactElement {
  const { t } = useTranslation();
  const { cls, labelKey, Icon } = STATUS_META[status];
  const iconPx = size === 'sm' ? 11 : 13;

  return (
    <span
      className={`fz-status ${cls} ${className ?? ''}`.trim()}
      style={size === 'sm' ? { padding: '2px 7px', fontSize: 11 } : undefined}
    >
      {hideIcon ? null : (
        <Icon size={iconPx} strokeWidth={2.2} aria-hidden="true" />
      )}
      {t(labelKey)}
    </span>
  );
}
