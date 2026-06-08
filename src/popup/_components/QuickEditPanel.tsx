import { X } from 'lucide-react';
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { getItemPreferredDomain, getItemPreferredTitle } from '../../core/selectors';
import type { FolioItem, FolioStatus } from '../../core/types';
import { Button } from '../../shared/ui/Button';
import { IconButton } from '../../shared/ui/IconButton';
import { Favicon } from '../../shared/ui/Favicon';
import { RemoteFavicon } from '../../shared/ui/RemoteFavicon';
import { Segmented, type SegmentedOption } from '../../shared/ui/Segmented';
import { TagInputField } from '../../shared/ui/TagInputField';
import { faviconKeyForItem } from './faviconKey';

interface QuickEditPanelProps {
  item: FolioItem;
  note: string;
  tags: string[];
  tagInput: string;
  saving: boolean;
  onNoteChange: (value: string) => void;
  onTagInputChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (index: number) => void;
  onStatusChange: (status: FolioStatus) => void;
  onDone: () => void;
  onBack: () => void;
}

/**
 * Inline quick editor that replaces the list in place. Chromeless fields on the
 * faiz tokens: favicon header, a status segmented control (same idiom as the
 * filter), a note textarea, and removable tag chips. Done writes note/tags;
 * status applies immediately like the row status cycle.
 */
export function QuickEditPanel({
  item,
  note,
  tags,
  tagInput,
  saving,
  onNoteChange,
  onTagInputChange,
  onAddTag,
  onRemoveTag,
  onStatusChange,
  onDone,
  onBack
}: QuickEditPanelProps): ReactElement {
  const { t } = useTranslation();

  const statusOptions: SegmentedOption<FolioStatus>[] = [
    { value: 'unread', label: t('common.unread') },
    { value: 'reading', label: t('common.reading') },
    { value: 'done', label: t('common.done') }
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-2 pb-2.5 pt-1">
        <IconButton
          size="sm"
          title={t('popup.quickEditDismiss')}
          aria-label={t('popup.quickEditDismiss')}
          onClick={onBack}
        >
          <X size={18} strokeWidth={2.2} />
        </IconButton>
        <span className="fz-h flex-1" style={{ fontWeight: 600 }}>
          {t('popup.quickEditHeading')}
        </span>
        {saving ? (
          <span className="fz-xs inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="fz-dot fz-dot-sync" />
            {t('popup.saving')}
          </span>
        ) : (
          <Button variant="brand" size="sm" onClick={onDone}>
            {t('popup.quickEditApply')}
          </Button>
        )}
      </div>

      <div className="fz-scroll flex-1 overflow-y-auto px-2 pb-2">
        <div className="fz-card px-3.5 py-3">
          <div className="flex items-start gap-2.5">
            <RemoteFavicon
              key={item.id}
              src={item.favicon}
              className="h-5 w-5 rounded-[5px] bg-surface object-cover"
              fallback={<Favicon site={faviconKeyForItem(item)} size={20} />}
            />
            <div className="min-w-0 flex-1">
              <div className="fz-h" style={{ fontWeight: 600, fontSize: 13.5 }}>
                {getItemPreferredTitle(item)}
              </div>
              <div className="fz-xs mt-0.5 text-muted-foreground">
                {getItemPreferredDomain(item)}
              </div>
            </div>
          </div>

          <div className="my-3 h-px bg-border" />

          <div className="fz-field-label mb-2">{t('options.status')}</div>
          <Segmented
            options={statusOptions}
            value={item.status}
            onChange={onStatusChange}
            ariaLabel={t('options.status')}
          />

          <div className="fz-field-label mb-2 mt-3.5">{t('options.note')}</div>
          <textarea
            className="fz-sm w-full resize-none rounded-md border border-border bg-[var(--surface-2)] px-3 py-2.5 text-foreground outline-none transition-[border-color,box-shadow] duration-[var(--dur-normal)] ease-[var(--ease)] placeholder:text-muted-foreground/70 focus:border-accent focus:shadow-[0_0_0_3px_var(--brand-tint)]"
            style={{ lineHeight: 1.55 }}
            rows={3}
            placeholder={t('popup.quickEditNote')}
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
          />

          <div className="fz-field-label mb-2 mt-3.5">{t('options.tags')}</div>
          <TagInputField
            tags={tags}
            inputValue={tagInput}
            placeholder={t('popup.quickEditTags')}
            removeButtonTitle={t('common.delete')}
            removeButtonLabel={(tag) => t('options.removeTagAria', { tag })}
            onInputChange={onTagInputChange}
            onAddTag={onAddTag}
            onRemoveTag={onRemoveTag}
          />
        </div>
      </div>
    </div>
  );
}
