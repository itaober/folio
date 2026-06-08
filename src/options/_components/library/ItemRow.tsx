import { Pencil, Trash2 } from 'lucide-react';
import type { KeyboardEvent, PointerEvent, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getItemPreferredDomain,
  getItemPreferredTitle,
  getItemPreferredUrl
} from '../../../core/selectors';
import type { FolioItem, FolioStatus } from '../../../core/types';
import type { SupportedLocale } from '../../../shared/i18n/localeStore';
import { Button } from '../../../shared/ui/Button';
import { IconButton } from '../../../shared/ui/IconButton';
import { FolioMark } from '../../../shared/ui/FolioMark';
import { RemoteFavicon } from '../../../shared/ui/RemoteFavicon';
import { Segmented } from '../../../shared/ui/Segmented';
import { DeleteProgressRing } from '../../../shared/ui/DeleteProgressRing';
import { StatusMenu } from '../../../shared/ui/StatusMenu';
import { TagInputField } from '../../../shared/ui/TagInputField';
import { renderHighlightedText } from '../../../shared/ui/renderHighlightedText';
import { formatCreatedAtLabel } from '../format';

export interface EditDraft {
  title: string;
  url: string;
  note: string;
  tags: string[];
  status: FolioStatus;
}

interface ItemRowProps {
  item: FolioItem;
  locale: SupportedLocale;
  search: string;
  editing: boolean;
  editDraft: EditDraft | null;
  editTagInput: string;
  deleteHoldProgress: number | null;
  onSetStatus: (id: string, status: FolioStatus) => void;
  onStartEdit: (item: FolioItem) => void;
  onDeletePointerDown: (item: FolioItem) => void;
  onDeletePointerStop: () => void;
  onEditDraftChange: (next: Partial<EditDraft>) => void;
  onEditTagInputChange: (value: string) => void;
  onAddEditTag: () => void;
  onRemoveEditTag: (index: number) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}

function Favicon({ item }: { item: FolioItem }): ReactElement {
  return (
    <RemoteFavicon
      src={item.favicon}
      className="h-[22px] w-[22px] shrink-0 rounded-md bg-surface object-cover"
      fallback={
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-surface">
          <FolioMark size={16} />
        </span>
      }
    />
  );
}

export function ItemRow(props: ItemRowProps): ReactElement {
  const { t } = useTranslation();
  const {
    item,
    locale,
    search,
    editing,
    editDraft,
    editTagInput,
    deleteHoldProgress
  } = props;

  // Enter saves, Escape cancels — but not from the tag field, which consumes
  // Enter to add a tag (TagInputField handles its own keys).
  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      props.onCancelEdit();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      props.onSaveEdit();
    }
  }

  if (editing && editDraft) {
    return (
      <article className="fz-card px-[18px] py-4 shadow-[var(--shadow-sm)]">
        <div className="mb-3.5 flex items-center gap-3.5">
          <Favicon item={item} />
          <input
            className="fz-input text-[14.5px] font-semibold"
            value={editDraft.title}
            aria-label={t('popup.quickEditTitle')}
            onKeyDown={handleEditKeyDown}
            onChange={(event) => props.onEditDraftChange({ title: event.target.value })}
          />
        </div>
        <div className="grid grid-cols-[64px_1fr] items-start gap-x-3 gap-y-3.5">
          <div className="fz-field-label pt-1.5">{t('options.status')}</div>
          <div className="max-w-[320px]">
            <Segmented
              ariaLabel={t('options.status')}
              value={editDraft.status}
              onChange={(status) => props.onEditDraftChange({ status })}
              options={[
                { value: 'unread', label: t('common.unread') },
                { value: 'reading', label: t('common.reading') },
                { value: 'done', label: t('common.done') }
              ]}
            />
          </div>

          <div className="fz-field-label pt-1.5">{t('options.note')}</div>
          <input
            className="fz-input rounded-md border border-border bg-surface-2 px-3 py-2 text-[13px]"
            value={editDraft.note}
            placeholder={t('options.note')}
            onKeyDown={handleEditKeyDown}
            onChange={(event) => props.onEditDraftChange({ note: event.target.value })}
          />

          <div className="fz-field-label pt-1">{t('options.tags')}</div>
          <TagInputField
            tags={editDraft.tags}
            inputValue={editTagInput}
            placeholder={t('options.tagInputPlaceholder')}
            removeButtonTitle={t('common.delete')}
            removeButtonLabel={(tag) => t('options.removeTagAria', { tag })}
            onInputChange={props.onEditTagInputChange}
            onAddTag={props.onAddEditTag}
            onRemoveTag={props.onRemoveEditTag}
          />

          <div className="col-span-2 mt-1 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={props.onCancelEdit}>
              {t('common.cancel')}
            </Button>
            <Button variant="brand" size="sm" onClick={props.onSaveEdit}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </article>
    );
  }

  const deleting = deleteHoldProgress != null;

  function handleDeletePointerDown(event: PointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    props.onDeletePointerDown(item);
  }

  function handleDeletePointerStop(event: PointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    props.onDeletePointerStop();
  }

  const createdAt = formatCreatedAtLabel(item.createdAt, locale);

  return (
    <div className="group flex items-center gap-3.5 rounded-[10px] px-4 py-3.5 transition-colors duration-150 ease-[var(--ease-out)] hover:bg-muted">
      <Favicon item={item} />

      <a
        href={getItemPreferredUrl(item)}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 flex-1 no-underline"
      >
        <div className="truncate text-[14.5px] font-semibold text-foreground">
          {renderHighlightedText(getItemPreferredTitle(item), search)}
        </div>
        <div className="mt-0.5 flex items-center gap-2 overflow-hidden text-xs text-muted-foreground">
          <span className="shrink-0 truncate">{getItemPreferredDomain(item)}</span>
          <span className="opacity-40">·</span>
          <span className="shrink-0 whitespace-nowrap" title={createdAt.full}>
            {createdAt.short}
          </span>
          {item.tags.map((tag) => (
            <span key={tag} className="fz-badge fz-badge-secondary" style={{ padding: '1px 7px', fontSize: 11 }}>
              {tag}
            </span>
          ))}
        </div>
      </a>

      <div className="flex shrink-0 items-center gap-1">
        {/* Edit + delete reserve their space (toggled via visibility), so
            revealing them on hover never shifts the status pill — no jump. */}
        <span
          className={`flex items-center gap-1 ${
            deleting ? 'visible' : 'invisible group-hover:visible group-focus-within:visible'
          }`}
        >
          <IconButton
            size="sm"
            title={t('options.edit')}
            aria-label={t('options.edit')}
            onClick={() => props.onStartEdit(item)}
          >
            <Pencil size={15} aria-hidden="true" />
          </IconButton>
          <IconButton
            size="sm"
            tone="danger"
            className="relative"
            title={t('common.delete')}
            aria-label={t('common.delete')}
            onPointerDown={handleDeletePointerDown}
            onPointerUp={handleDeletePointerStop}
            onPointerLeave={handleDeletePointerStop}
            onPointerCancel={handleDeletePointerStop}
            onContextMenu={(event) => event.preventDefault()}
          >
            {deleting ? <DeleteProgressRing progress={deleteHoldProgress ?? 0} /> : null}
            <Trash2 size={15} className="relative z-[1]" aria-hidden="true" />
          </IconButton>
        </span>
        <StatusMenu status={item.status} onChange={(next) => props.onSetStatus(item.id, next)} />
      </div>
    </div>
  );
}
