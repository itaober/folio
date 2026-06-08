import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../../shared/ui/IconButton';
import type { NoticeLevel } from '../../shared/ui/notice';

interface NoticeProps {
  level: NoticeLevel;
  text: string;
  onDismiss: () => void;
}

function NoticeIcon({ level }: { level: NoticeLevel }): ReactElement {
  if (level === 'error') return <TriangleAlert size={15} strokeWidth={2} />;
  if (level === 'success') return <CircleCheck size={16} strokeWidth={2} />;
  return <Info size={16} strokeWidth={2} />;
}

/**
 * Success / info notice: a surface toast card anchored at the bottom inside the
 * panel root (not the viewport), per the redesign. Auto-dismissed upstream.
 */
function Toast({ level, text }: { level: NoticeLevel; text: string }): ReactElement {
  const color = level === 'success' ? 'var(--success)' : 'var(--foreground)';
  return (
    <div className="absolute inset-x-3 bottom-3 z-10">
      <div
        className="fz-card flex items-center gap-2.5 px-3 py-2.5"
        style={{ borderRadius: 10, boxShadow: 'var(--shadow-md)' }}
      >
        <span style={{ color }}>
          <NoticeIcon level={level} />
        </span>
        <span className="fz-sm flex-1" style={{ fontWeight: 500 }}>
          {text}
        </span>
      </div>
    </div>
  );
}

/**
 * Error notice: a tinted inline banner that persists until dismissed, anchored
 * below the filter row inside the panel.
 */
function Banner({ text, onDismiss }: { text: string; onDismiss: () => void }): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="px-3 pb-2">
      <div
        className="flex items-center gap-2.5 px-3 py-2.5"
        style={{
          borderRadius: 9,
          background: 'var(--danger-tint)',
          color: 'var(--danger)'
        }}
      >
        <NoticeIcon level="error" />
        <span className="fz-xs flex-1" style={{ fontWeight: 600 }}>
          {text}
        </span>
        <IconButton
          size="sm"
          style={{ width: 22, height: 22, color: 'var(--danger)' }}
          title={t('common.cancel')}
          aria-label={t('common.cancel')}
          onClick={onDismiss}
        >
          <X size={13} strokeWidth={2.2} />
        </IconButton>
      </div>
    </div>
  );
}

/** Routes a notice to the toast (success/info) or persistent banner (error). */
export function PopupNotice({ level, text, onDismiss }: NoticeProps): ReactElement {
  if (level === 'error') {
    return <Banner text={text} onDismiss={onDismiss} />;
  }
  return <Toast level={level} text={text} />;
}
