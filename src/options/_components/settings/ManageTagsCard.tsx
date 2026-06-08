import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { SettingsCard } from './SettingsCard';

interface ManageTagsCardProps {
  tags: string[];
  selectedTag: string;
  renameValue: string;
  deleteArmed: boolean;
  onSelectTag: (tag: string) => void;
  onRenameValueChange: (value: string) => void;
  onRename: () => void;
  onDelete: () => void;
}

export function ManageTagsCard({
  tags,
  selectedTag,
  renameValue,
  deleteArmed,
  onSelectTag,
  onRenameValueChange,
  onRename,
  onDelete
}: ManageTagsCardProps): ReactElement {
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
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <SettingsCard title={t('options.tagManagerTitle')} sub={t('options.tagManagerHint')}>
      {tags.length === 0 ? (
        <p className="m-0 text-[13px] text-muted-foreground">{t('options.tagsEmpty')}</p>
      ) : (
        <div className="flex items-center gap-2.5">
          <div className="relative" ref={ref}>
            <Button
              variant="outline"
              size="sm"
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label={t('options.tagSelect')}
              onClick={() => setOpen((prev) => !prev)}
            >
              {selectedTag || t('options.tagSelect')}
              <ChevronDown size={13} aria-hidden="true" />
            </Button>
            {open ? (
              <div
                role="menu"
                className="fz-card folio-scrollbar absolute left-0 top-[calc(100%+6px)] z-20 max-h-64 w-44 overflow-y-auto rounded-[10px] p-1.5 shadow-[var(--shadow-lg)]"
              >
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    role="menuitem"
                    className="pressable flex w-full items-center truncate rounded-[7px] px-2.5 py-2 text-left text-[13px] font-medium text-foreground hover:bg-muted/60 focus-ring"
                    onClick={() => {
                      onSelectTag(tag);
                      onRenameValueChange(tag);
                      setOpen(false);
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="fz-token-field h-[38px] flex-1">
            <input
              className="fz-input text-[13.5px]"
              aria-label={t('options.tagNewName')}
              placeholder={t('options.tagNewName')}
              value={renameValue}
              disabled={!selectedTag}
              onChange={(event) => onRenameValueChange(event.target.value)}
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            disabled={!selectedTag || !renameValue.trim()}
            onClick={onRename}
          >
            {t('options.renameTag')}
          </Button>
          <Button variant="danger" size="sm" disabled={!selectedTag} onClick={onDelete}>
            {deleteArmed ? t('options.deleteTagConfirm') : t('options.deleteTag')}
          </Button>
        </div>
      )}
    </SettingsCard>
  );
}
