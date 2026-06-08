import { Pencil, Target, X } from 'lucide-react';
import type { PointerEvent, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getItemPreferredDomain,
  getItemPreferredTitle
} from '../../core/selectors';
import type { FolioItem, FolioStatus } from '../../core/types';
import { DeleteProgressRing } from '../../shared/ui/DeleteProgressRing';
import { Favicon } from '../../shared/ui/Favicon';
import { IconButton } from '../../shared/ui/IconButton';
import { RemoteFavicon } from '../../shared/ui/RemoteFavicon';
import { StatusMenu } from '../../shared/ui/StatusMenu';
import { renderHighlightedText } from '../../shared/ui/renderHighlightedText';
import { faviconKeyForItem } from './faviconKey';
import { formatRelativeDate } from './relativeTime';

interface ItemRowProps {
  item: FolioItem;
  searchTerm: string;
  /** This row is the active tab's matching Reading item → offer Save-spot. */
  canSaveProgress: boolean;
  savingProgress: boolean;
  /** The delete-hold conic ring is filling for this row, with [0..1] progress. */
  deleteHoldProgress: number | null;
  onOpen: (item: FolioItem) => void;
  onTitle: (item: FolioItem) => void;
  onSaveProgress: (item: FolioItem) => void;
  onDeletePointerDown: (event: PointerEvent<HTMLButtonElement>, item: FolioItem) => void;
  onDeletePointerStop: (event: PointerEvent<HTMLButtonElement>) => void;
  onSetStatus: (id: string, status: FolioStatus) => void;
}

/** Real favicon image when the item carries one, else the CSS-only fallback chip. */
function RowFavicon({ item }: { item: FolioItem }): ReactElement {
  return (
    <RemoteFavicon
      src={item.favicon}
      className="h-[18px] w-[18px] rounded-[5px] bg-surface object-cover"
      fallback={<Favicon site={faviconKeyForItem(item)} size={18} />}
    />
  );
}

/**
 * One recent-list row: favicon · title · (domain · date + a hover edit icon) ·
 * status pill, with a hold-to-confirm corner-× to remove it. The Save-spot
 * action and a resume hint appear when the row is the active tab's Reading item;
 * a brand dot on the favicon marks a saved resume snapshot.
 */
export function ItemRow({
  item,
  searchTerm,
  canSaveProgress,
  savingProgress,
  deleteHoldProgress,
  onOpen,
  onTitle,
  onSaveProgress,
  onDeletePointerDown,
  onDeletePointerStop,
  onSetStatus
}: ItemRowProps): ReactElement {
  const { t, i18n } = useTranslation();
  const arming = deleteHoldProgress !== null;
  const hasResume = Boolean(item.resumeSnapshot);

  return (
    <div className="group/item relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors duration-[var(--dur-normal)] ease-[var(--ease)] hover:bg-[var(--muted)] focus-within:bg-[var(--muted)]">
      <button
        type="button"
        className="relative flex-none rounded-[5px] outline-none"
        onClick={() => onOpen(item)}
        title={t('popup.openItem')}
        aria-label={t('popup.openItem')}
      >
        <RowFavicon item={item} />
        {hasResume ? (
          <span
            title={t('popup.resumeSnapshot')}
            className="absolute -bottom-[3px] -right-[3px] h-[9px] w-[9px] rounded-pill border-[1.5px] border-surface bg-accent"
          />
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          className="block w-full bg-transparent p-0 text-left outline-none"
          onClick={() => onOpen(item)}
          title={getItemPreferredTitle(item)}
        >
          <span className="fz-h block truncate" style={{ fontSize: 13.5, fontWeight: 600 }}>
            {renderHighlightedText(getItemPreferredTitle(item), searchTerm)}
          </span>
        </button>
        <div className="fz-xs mt-0.5 flex items-center gap-1.5 text-muted-foreground">
          <span className="truncate">
            {renderHighlightedText(getItemPreferredDomain(item), searchTerm)}
          </span>
          <span className="opacity-50">·</span>
          <span className="flex-none">{formatRelativeDate(item.createdAt, i18n.language)}</span>
          {/* Edit sits right after the date as a quiet hover affordance, so it
              never competes with opening the page (favicon + title do that).
              Reserves its slot via visibility so the date line doesn't reflow. */}
          <button
            type="button"
            className="invisible ml-1.5 inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] text-muted-foreground transition-[background-color,color] duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-[var(--border)] hover:text-foreground focus-ring group-hover/item:visible group-focus-within/item:visible"
            aria-label={t('popup.quickEditHeading')}
            onClick={() => onTitle(item)}
          >
            <Pencil size={13} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        {canSaveProgress ? (
          <span
            className="fz-xs mt-1 inline-flex items-center gap-1.5 font-semibold"
            style={{ color: 'var(--brand-hover)' }}
          >
            <Target size={12} strokeWidth={2.2} />
            {t('popup.resumeReading')}
          </span>
        ) : null}
      </div>

      <div className="flex flex-none items-center gap-0.5">
        {/* Save-spot only appears for the active Reading row, so it can reveal on
            hover without reserving width for every row. */}
        {canSaveProgress ? (
          <IconButton
            size="sm"
            className="invisible group-hover/item:visible group-focus-within/item:visible"
            aria-label={t('popup.saveProgress')}
            disabled={savingProgress}
            onClick={() => onSaveProgress(item)}
          >
            <Target size={15} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        ) : null}
        <StatusMenu status={item.status} onChange={(next) => onSetStatus(item.id, next)} />
      </div>

      {/* Remove: a small badge straddling the top-right corner (half outside the
          card), so it never eats into the row's content width. Hold to confirm —
          there is no undo in the popup. */}
      <button
        type="button"
        className={`absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-[var(--danger)] shadow-[0_1px_4px_rgba(35,28,20,0.18)] hover:bg-[var(--danger-tint)] ${
          arming
            ? 'visible'
            : 'invisible group-hover/item:visible group-focus-within/item:visible'
        }`}
        aria-label={t('common.delete')}
        onPointerDown={(event) => onDeletePointerDown(event, item)}
        onPointerUp={onDeletePointerStop}
        onPointerLeave={onDeletePointerStop}
        onPointerCancel={onDeletePointerStop}
        onContextMenu={(event) => event.preventDefault()}
      >
        {arming ? <DeleteProgressRing progress={deleteHoldProgress ?? 0} size={20} /> : null}
        <X size={11} strokeWidth={2.6} className="relative z-[1]" />
      </button>
    </div>
  );
}
