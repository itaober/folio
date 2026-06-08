import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { noticeClass } from '../../../shared/ui/notice';
import type { FolioItem } from '../../../core/types';
import type { NoticeState } from '../types';

interface ToastStackProps {
  notice: NoticeState | null;
  undoItems: FolioItem[];
  onUndo: () => void;
}

export function ToastStack({ notice, undoItems, onUndo }: ToastStackProps): ReactElement {
  const { t } = useTranslation();

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-40 flex w-max max-w-[min(92vw,560px)] -translate-x-1/2 flex-col items-center gap-2">
      {notice ? (
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={`pointer-events-auto m-0 rounded-md px-3.5 py-2.5 text-[13px] shadow-[var(--shadow-md)] ${noticeClass(notice.level)}`}
        >
          {notice.text}
        </p>
      ) : null}
      {undoItems.length > 0 ? (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="pointer-events-auto flex items-center gap-3 rounded-md border border-border bg-surface px-3.5 py-2.5 text-[13px] text-foreground shadow-[var(--shadow-md)]"
        >
          <span>
            {undoItems.length > 1
              ? t('options.removedUndoCount', { count: undoItems.length })
              : t('options.removedUndo')}
          </span>
          <Button variant="ghost" size="sm" onClick={onUndo}>
            {t('options.undo')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
