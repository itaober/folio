import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Check,
  CheckCheck,
  Clock3,
  ExternalLink,
  Plus,
  Search,
  X
} from 'lucide-react';
import {
  DEFAULT_ICON_VARIANT,
  type FolioIconVariant
} from '../shared/icons';
import { FolioMark } from '../shared/ui/FolioMark';
import { TextField } from '../shared/ui/TextField';
import { commit, getStore } from '../core/repository';
import { selectItemByUrl, selectRecentItems } from '../core/selectors';
import type { FolioItem, FolioStatus } from '../core/types';

interface ActivePage {
  url: string;
  title: string;
  favicon: string;
}

type NoticeLevel = 'success' | 'error' | 'info';
type PopupFilter = 'all' | FolioStatus;

interface NoticeState {
  level: NoticeLevel;
  text: string;
}

function statusToLabel(status: FolioStatus, t: (key: string) => string): string {
  if (status === 'unread') return t('common.unread');
  if (status === 'reading') return t('common.reading');
  return t('common.done');
}

function nextStatus(status: FolioStatus): FolioStatus {
  if (status === 'unread') return 'reading';
  if (status === 'reading') return 'done';
  return 'unread';
}

function noticeClass(level: NoticeLevel): string {
  if (level === 'success') {
    return 'border border-(--border) bg-bg-surface text-text-secondary';
  }
  if (level === 'error') {
    return 'border border-(--accent-border) bg-accent-subtle text-accent';
  }
  return 'border border-(--border) bg-bg-surface text-text-secondary';
}

function listBadgeClass(status: FolioStatus): string {
  if (status === 'unread') {
    return 'bg-(--status-unread-bg) text-(--status-unread-text)';
  }
  if (status === 'reading') {
    return 'bg-(--status-reading-bg) text-(--status-reading-text)';
  }
  return 'bg-(--status-done-bg) text-(--status-done-text)';
}

function statusIcon(status: FolioStatus): ReactElement {
  if (status === 'unread') {
    return <Clock3 className="h-3.5 w-3.5" strokeWidth={2} />;
  }
  if (status === 'reading') {
    return <BookOpen className="h-3.5 w-3.5" strokeWidth={2} />;
  }
  return <CheckCheck className="h-3.5 w-3.5" strokeWidth={2} />;
}

export default function App(): ReactElement {
  const { t } = useTranslation();

  const [activePage, setActivePage] = useState<ActivePage | null>(null);
  const [currentItem, setCurrentItem] = useState<FolioItem | null>(null);
  const [recentItems, setRecentItems] = useState<FolioItem[]>([]);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [iconVariant, setIconVariant] = useState<FolioIconVariant>(
    DEFAULT_ICON_VARIANT
  );
  const [backlogCount, setBacklogCount] = useState(0);
  const [popupFilter, setPopupFilter] = useState<PopupFilter>('all');
  const [isRemoveHover, setIsRemoveHover] = useState(false);
  const [undoRemovedItem, setUndoRemovedItem] = useState<FolioItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const undoRemoveTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const canSave = Boolean(activePage?.url);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    return () => {
      if (undoRemoveTimerRef.current !== null) {
        window.clearTimeout(undoRemoveTimerRef.current);
      }
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }

    if (!notice || notice.level === 'error') {
      return;
    }

    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 2500);
  }, [notice]);

  function clearUndoRemoveTimer(): void {
    if (undoRemoveTimerRef.current !== null) {
      window.clearTimeout(undoRemoveTimerRef.current);
      undoRemoveTimerRef.current = null;
    }
  }

  async function load(): Promise<FolioItem | null> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ?? '';

    if (!url) {
      setActivePage(null);
      setCurrentItem(null);
      setRecentItems([]);
      setNotice({ level: 'info', text: t('popup.noActiveTab') });
      return null;
    }

    const page: ActivePage = {
      url,
      title: tab.title ?? url,
      favicon: tab.favIconUrl ?? ''
    };

    const store = await getStore();
    const item = selectItemByUrl(store, url) ?? null;
    const unreadCount = Object.values(store.items).filter(
      (entry) => entry.status === 'unread'
    ).length;
    const threshold = store.settings.backlogThreshold;

    setActivePage(page);
    setCurrentItem(item);
    setIconVariant(store.settings.iconVariant);
    setRecentItems(selectRecentItems(store, 60));
    setBacklogCount(store.settings.backlogEnabled && unreadCount > threshold ? unreadCount : 0);
    return item;
  }

  async function handleSaveCurrentPage(): Promise<void> {
    if (!activePage) return;

    const result = await commit({
      type: 'savePage',
      payload: {
        url: activePage.url,
        title: activePage.title,
        favicon: activePage.favicon
      }
    });

    if (!result.ok && result.code === 'already_exists') {
      const statusLabel = result.item ? statusToLabel(result.item.status, t) : '';
      setNotice({
        level: 'info',
        text:
          result.item
            ? t('popup.alreadySavedWithStatus', { status: statusLabel })
            : t('popup.alreadySaved')
      });
    } else if (!result.ok) {
      setNotice({ level: 'error', text: t('popup.saveFailed') });
    } else {
      setNotice({ level: 'success', text: t('popup.saved') });
      await load();
      return;
    }

    await load();
  }

  async function handleRemoveCurrentPage(): Promise<void> {
    if (!currentItem) {
      return;
    }

    const removed = currentItem;
    const result = await commit({
      type: 'deleteItem',
      payload: { id: removed.id }
    });

    if (!result.ok) {
      setNotice({ level: 'error', text: t('options.deleteFailed') });
      return;
    }

    clearUndoRemoveTimer();
    setUndoRemovedItem(removed);
    undoRemoveTimerRef.current = window.setTimeout(() => {
      setUndoRemovedItem(null);
    }, 3000);

    setIsRemoveHover(false);
    setNotice(null);
    await load();
  }

  async function handleUndoRemove(): Promise<void> {
    if (!undoRemovedItem) {
      return;
    }

    clearUndoRemoveTimer();
    const result = await commit({
      type: 'restoreItem',
      payload: {
        item: undoRemovedItem
      }
    });

    if (!result.ok) {
      setNotice({ level: 'error', text: t('options.undoFailed') });
      return;
    }

    setUndoRemovedItem(null);
    setNotice({ level: 'success', text: t('options.updateSuccess') });
    await load();
  }

  async function handleStatusChange(item: FolioItem, status: FolioStatus): Promise<void> {
    const result = await commit({
      type: 'setStatus',
      payload: {
        id: item.id,
        status
      }
    });

    if (!result.ok) {
      setNotice({ level: 'error', text: t('popup.statusUpdateFailed') });
      return;
    }

    setNotice({ level: 'success', text: t('popup.statusUpdated') });
    await load();
  }

  async function handleOpenOptions(): Promise<void> {
    await chrome.runtime.openOptionsPage();
  }

  async function handleOpenRecentItem(item: FolioItem): Promise<void> {
    await chrome.tabs.create({ url: item.url });
    await commit({ type: 'touchOpenedAt', payload: { id: item.id } });
  }

  const filteredRecentItems = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    let items =
      popupFilter === 'all'
        ? recentItems
        : recentItems.filter((item) => item.status === popupFilter);

    if (keyword) {
      items = items.filter((item) => {
        return (
          item.title.toLowerCase().includes(keyword) ||
          item.domain.toLowerCase().includes(keyword) ||
          item.url.toLowerCase().includes(keyword) ||
          item.note.toLowerCase().includes(keyword)
        );
      });
    }

    if (currentItem) {
      const currentIndex = items.findIndex((item) => item.id === currentItem.id);
      if (currentIndex > 0) {
        const [head] = items.splice(currentIndex, 1);
        items = [head, ...items];
      }
    }

    return items;
  }, [currentItem, popupFilter, recentItems, searchTerm]);

  const saveButtonMeta = useMemo(() => {
    if (!currentItem) {
      return { mode: 'save' as const, text: t('popup.saveShort') };
    }
    if (isRemoveHover) {
      return { mode: 'remove' as const, text: t('popup.removeCurrent') };
    }
    return { mode: 'saved' as const, text: t('popup.savedShort') };
  }, [currentItem, isRemoveHover, t]);

  return (
    <main className="relative h-[520px] w-[360px] overflow-y-auto bg-bg-base text-text-primary">
      <div className="pointer-events-none absolute left-1/2 top-3 z-20 w-max max-w-[332px] -translate-x-1/2 space-y-2">
        {notice ? (
          <p className={`pointer-events-auto m-0 rounded-[6px] px-3 py-2 text-xs shadow-[0_6px_14px_rgba(26,20,16,0.1)] ${noticeClass(notice.level)}`}>
            {notice.text}
          </p>
        ) : null}
        {undoRemovedItem ? (
          <div className="pointer-events-auto flex items-center gap-2 rounded-[6px] border border-(--border) bg-bg-surface px-3 py-2 text-xs text-text-secondary shadow-[0_6px_14px_rgba(26,20,16,0.1)]">
            <span>{t('options.removedUndo')}</span>
            <button
              type="button"
              className="text-xs text-text-link underline underline-offset-2"
              onClick={() => void handleUndoRemove()}
            >
              {t('options.undo')}
            </button>
          </div>
        ) : null}
      </div>

      <section className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FolioMark variant={iconVariant} size={20} />
            <span className="font-display text-base italic">{t('popup.title')}</span>
          </div>

	          <div className="flex items-center gap-1.5">
	            <button
	              type="button"
	              className={
	                !currentItem
	                  ? 'inline-flex h-[30px] items-center gap-1 rounded-md bg-accent px-2.5 text-xs font-medium text-[#fff8f2] hover:bg-accent-hover'
	                  : isRemoveHover
	                    ? 'inline-flex h-[30px] items-center gap-1 rounded-md bg-accent-subtle px-2.5 text-xs font-medium text-accent'
	                    : 'inline-flex h-[30px] items-center gap-1 rounded-md bg-bg-surface px-2.5 text-xs font-medium text-text-secondary hover:bg-bg-elevated'
	              }
              disabled={!canSave}
              onMouseEnter={() => {
                if (currentItem) {
                  setIsRemoveHover(true);
                }
              }}
              onMouseLeave={() => setIsRemoveHover(false)}
              onClick={() => void (currentItem ? handleRemoveCurrentPage() : handleSaveCurrentPage())}
	            >
	              {saveButtonMeta.mode === 'save' ? (
	                <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
	              ) : null}
	              {saveButtonMeta.mode === 'saved' ? (
	                <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
	              ) : null}
	              {saveButtonMeta.mode === 'remove' ? (
	                <X className="h-3.5 w-3.5" strokeWidth={2.2} />
	              ) : null}
	              <span>{saveButtonMeta.text}</span>
	            </button>

	            <button
	              type="button"
	              className="inline-flex h-[30px] items-center gap-1 rounded-md bg-bg-surface px-2.5 text-xs text-text-secondary hover:bg-bg-elevated"
	              onClick={() => void handleOpenOptions()}
	            >
	              <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
	              {t('popup.openDashboard')}
	            </button>
	          </div>
	        </div>

	        <TextField
	          leftIcon={<Search className="h-3.5 w-3.5" strokeWidth={2} />}
	          placeholder={t('popup.searchPlaceholder')}
	          value={searchTerm}
	          onChange={(event) => setSearchTerm(event.target.value)}
	        />

        {backlogCount > 0 ? (
          <p className="m-0 rounded-md border border-(--status-unread-border) bg-(--status-unread-bg) px-2 py-1 text-xs text-(--status-unread-text)">
            {t('popup.backlogHint', { count: backlogCount })}
          </p>
        ) : null}

      </section>

	      <div className="mx-4 h-px bg-(--border)" />

	      <section className="space-y-3 p-4">
	        <div className="rounded-full bg-bg-surface p-1">
	          <div className="grid grid-cols-4 gap-1">
            {(['all', 'unread', 'reading', 'done'] as PopupFilter[]).map((status) => {
              const active = popupFilter === status;
              return (
                <button
                  key={status}
                  type="button"
                  className={
                    active
                      ? 'rounded-full bg-white px-2 py-1 text-xs font-semibold text-text-primary shadow-sm'
                      : 'rounded-full px-2 py-1 text-xs text-text-muted hover:text-text-secondary'
                  }
                  onClick={() => setPopupFilter(status)}
                >
                  {status === 'all' ? t('common.all') : statusToLabel(status, t)}
                </button>
              );
            })}
          </div>
        </div>

        <p className="mb-0 font-mono text-[10px] uppercase text-text-muted">{t('popup.recent')}</p>
        <div className="max-h-[268px] space-y-1.5 overflow-y-auto pr-1">
          {filteredRecentItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 rounded-md px-2 py-2 hover:bg-bg-surface ${
                currentItem?.id === item.id ? 'bg-bg-surface' : ''
              }`}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 bg-transparent p-0 text-left"
                onClick={() => void handleOpenRecentItem(item)}
              >
                {item.favicon ? (
                  <img
                    src={item.favicon}
                    alt=""
                    className="h-4 w-4 rounded-[3px] bg-bg-surface object-cover"
                  />
                ) : (
                  <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-bg-surface">
                    <FolioMark variant={iconVariant} size={14} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  {currentItem?.id === item.id ? (
                    <span className="mb-0.5 block font-mono text-[10px] uppercase tracking-wide text-text-muted">
                      {t('popup.currentPage')}
                    </span>
                  ) : null}
                  <span className="block truncate text-sm text-text-primary">{item.title}</span>
                  <span className="block truncate font-mono text-[11px] text-text-muted">{item.domain}</span>
                </span>
              </button>

              <button
                type="button"
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-(--border) ${listBadgeClass(item.status)} hover:border-(--accent-border)`}
                onClick={() => void handleStatusChange(item, nextStatus(item.status))}
                title={`${statusToLabel(item.status, t)} → ${statusToLabel(nextStatus(item.status), t)}`}
                aria-label={`${statusToLabel(item.status, t)} → ${statusToLabel(nextStatus(item.status), t)}`}
              >
                {statusIcon(item.status)}
              </button>
            </div>
          ))}

          {filteredRecentItems.length === 0 ? (
            <p className="m-0 rounded-md bg-bg-surface px-3 py-4 text-xs text-text-muted">
              {t('options.emptyText')}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
