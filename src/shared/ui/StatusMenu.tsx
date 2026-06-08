import { Check } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { FolioStatus } from '../../core/types';
import { StatusPill } from './StatusPill';

const STATUSES: readonly FolioStatus[] = ['unread', 'reading', 'done'];

interface StatusMenuProps {
  status: FolioStatus;
  onChange: (status: FolioStatus) => void;
  size?: 'sm' | 'md';
}

/**
 * A status pill that doubles as a one-click status switcher: clicking it opens a
 * small menu of the three statuses (current one checked). Used in both the popup
 * and options rows so changing status never requires opening the full editor.
 */
export function StatusMenu({ status, onChange, size = 'sm' }: StatusMenuProps): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="flex items-center rounded-md focus-ring"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('common.changeStatus')}
        title={t('common.changeStatus')}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <StatusPill status={status} size={size} />
      </button>
      {open ? (
        <div
          role="menu"
          className="fz-card absolute right-0 top-[calc(100%+6px)] z-30 w-[156px] rounded-[10px] p-1.5 shadow-[var(--shadow-lg)]"
        >
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={s === status}
              className="pressable flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left focus-ring hover:bg-muted/60"
              onClick={(event) => {
                event.stopPropagation();
                onChange(s);
                setOpen(false);
              }}
            >
              <StatusPill status={s} size="sm" />
              {s === status ? <Check size={15} className="ml-auto text-accent" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
