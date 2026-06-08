import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement
} from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import type { NoticeLevel } from '../shared/ui/notice';
import { IconButton } from '../shared/ui/IconButton';
import { Segmented, type SegmentedOption } from '../shared/ui/Segmented';
import { statusToLabel } from '../shared/ui/itemStatus';
import { useAutoDismissNotice } from '../shared/ui/useAutoDismissNotice';
import { commit, getStore } from '../core/repository';
import {
  matchesItemKeyword,
  selectReadingItemByUrlFallback,
  selectItemByUrl,
  selectRecentItems
} from '../core/selectors';
import type { FolioItem, FolioStatus } from '../core/types';
import type { RuntimeMessageResponse } from '../shared/runtimeMessages';
import { PopupHeader, type HeaderMode } from './_components/PopupHeader';
import { ItemRow } from './_components/ItemRow';
import { QuickEditPanel } from './_components/QuickEditPanel';
import { EmptyCold, EmptyFiltered, NoResults } from './_components/EmptyStates';
import { PopupNotice } from './_components/Notices';

interface ActivePage {
  url: string;
  title: string;
  favicon: string;
}

type PopupFilter = 'all' | FolioStatus;

interface Notice {
  level: NoticeLevel;
  text: string;
}

const DELETE_HOLD_DURATION_MS = 1000;

export default function App(): ReactElement {
  const { t } = useTranslation();

  const [activePage, setActivePage] = useState<ActivePage | null>(null);
  const [currentItem, setCurrentItem] = useState<FolioItem | null>(null);
  const [readingTargetItem, setReadingTargetItem] = useState<FolioItem | null>(null);
  const [recentItems, setRecentItems] = useState<FolioItem[]>([]);
  const [popupFilter, setPopupFilter] = useState<PopupFilter>('unread');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [isApplyingEdit, setIsApplyingEdit] = useState(false);
  const [popupEditNote, setPopupEditNote] = useState('');
  const [popupEditTags, setPopupEditTags] = useState<string[]>([]);
  const [popupTagInput, setPopupTagInput] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [deleteHoldItemId, setDeleteHoldItemId] = useState<string | null>(null);
  const [deleteHoldProgress, setDeleteHoldProgress] = useState(0);
  const initialFilterResolvedRef = useRef(false);
  const popupLastViewCommitRef = useRef(Promise.resolve());
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const deleteHoldRafRef = useRef<number | null>(null);
  const deleteHoldStartRef = useRef(0);
  const deleteHoldTargetRef = useRef<FolioItem | null>(null);

  const canSave = Boolean(activePage?.url);
  useAutoDismissNotice(notice, setNotice, 3000);

  useEffect(() => {
    // Loads the active tab + store once when the popup opens (mount-only).
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      stopDeleteHold();
    };
  }, []);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  function normalizeTag(input: string): string {
    return input.trim().replace(/^#+/, '').replace(/\s+/g, ' ');
  }

  function syncDraftFromItem(item: FolioItem | null): void {
    setPopupEditNote(item?.note ?? '');
    setPopupEditTags(item ? [...item.tags] : []);
    setPopupTagInput('');
  }

  function openPopupEditor(item: FolioItem): void {
    setExpandedItemId(item.id);
    syncDraftFromItem(item);
  }

  function closePopupEditor(nextSource?: FolioItem | null): void {
    setExpandedItemId(null);
    syncDraftFromItem(nextSource ?? null);
  }

  async function load(): Promise<FolioItem | null> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ?? '';

    if (!url) {
      setActivePage(null);
      setCurrentItem(null);
      setReadingTargetItem(null);
      setRecentItems([]);
      closePopupEditor(null);
      return null;
    }

    const page: ActivePage = {
      url,
      title: tab.title ?? url,
      favicon: tab.favIconUrl ?? ''
    };

    const store = await getStore();
    const item = selectItemByUrl(store, url) ?? null;
    const readingItem = selectReadingItemByUrlFallback(store, url) ?? null;

    setActivePage(page);
    setCurrentItem(item);
    setReadingTargetItem(readingItem);
    setRecentItems(selectRecentItems(store, 60));
    if (!initialFilterResolvedRef.current) {
      setPopupFilter(
        store.settings.popupDefaultViewMode === 'fixed'
          ? store.settings.popupFixedView
          : store.settings.popupLastView
      );
      initialFilterResolvedRef.current = true;
    }
    return item;
  }

  function persistPopupLastView(nextFilter: PopupFilter): void {
    popupLastViewCommitRef.current = popupLastViewCommitRef.current
      .then(async () => {
        const latestStore = await getStore();
        if (latestStore.settings.popupLastView === nextFilter) {
          return;
        }

        await commit({
          type: 'updateSettings',
          payload: {
            popupLastView: nextFilter
          }
        });
      })
      .catch(() => undefined);
  }

  async function handleSaveCurrentPage(): Promise<void> {
    if (!activePage) {
      return;
    }

    const result = await commit({
      type: 'savePage',
      payload: {
        url: activePage.url,
        title: activePage.title,
        favicon: activePage.favicon
      }
    });

    if (!result.ok) {
      setNotice({ level: 'error', text: t('popup.saveFailed') });
      return;
    }

    setPopupFilter(result.store.settings.defaultStatus);
    persistPopupLastView(result.store.settings.defaultStatus);
    const savedItem = await load();
    if (savedItem) {
      openPopupEditor(savedItem);
      setNotice({
        level: 'success',
        text: t('popup.savedNotice', {
          status: statusToLabel(savedItem.status, t)
        })
      });
    }
  }

  async function handleDeleteItem(item: FolioItem): Promise<void> {
    const result = await commit({
      type: 'deleteItem',
      payload: { id: item.id }
    });

    if (!result.ok) {
      setNotice({ level: 'error', text: t('options.deleteFailed') });
      return;
    }

    stopDeleteHold();
    if (expandedItemId === item.id) {
      closePopupEditor(null);
    }
    await load();
  }

  async function handleRemoveCurrentPage(): Promise<void> {
    if (!currentItem) {
      return;
    }

    await handleDeleteItem(currentItem);
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

    await load();
  }

  async function handleOpenOptions(): Promise<void> {
    await chrome.runtime.openOptionsPage();
  }

  async function handleOpenRecentItem(item: FolioItem): Promise<void> {
    const result = (await chrome.runtime.sendMessage({
      type: 'openPopupItem',
      itemId: item.id
    })) as RuntimeMessageResponse;

    if (!result?.ok) {
      await chrome.tabs.create({ url: item.resumeSnapshot?.url ?? item.url });
      await commit({ type: 'touchOpenedAt', payload: { id: item.id } });
    }
  }

  async function handleSaveProgress(item: FolioItem): Promise<void> {
    if (item.id !== readingTargetItem?.id || item.status !== 'reading') {
      return;
    }

    setIsSavingProgress(true);
    try {
      const result = (await chrome.runtime.sendMessage({
        type: 'captureResumeSnapshot',
        itemId: item.id
      })) as RuntimeMessageResponse;
      if (!result?.ok) {
        setNotice({ level: 'error', text: t('popup.updateFailed') });
        return;
      }
      await load();
    } finally {
      setIsSavingProgress(false);
    }
  }

  function handlePopupFilterChange(nextFilter: PopupFilter): void {
    if (nextFilter === popupFilter) {
      return;
    }
    setPopupFilter(nextFilter);
    persistPopupLastView(nextFilter);
  }

  function openSearch(): void {
    setSearchOpen(true);
  }

  function clearSearch(): void {
    setSearchTerm('');
    setSearchOpen(false);
  }

  function handleOpenItem(item: FolioItem): void {
    void handleOpenRecentItem(item);
  }

  function handleEditItem(item: FolioItem): void {
    openPopupEditor(item);
  }

  function handlePopupAddTag(): void {
    const normalized = normalizeTag(popupTagInput);
    if (!normalized) {
      return;
    }

    const exists = popupEditTags.some(
      (tag) => tag.toLowerCase() === normalized.toLowerCase()
    );
    if (exists) {
      setPopupTagInput('');
      return;
    }

    setPopupEditTags((previous) => [...previous, normalized]);
    setPopupTagInput('');
  }

  function handlePopupRemoveTag(index: number): void {
    setPopupEditTags((previous) =>
      previous.filter((_tag, currentIndex) => currentIndex !== index)
    );
  }

  async function handleConfirmPopupEdit(): Promise<void> {
    if (!expandedItemId) {
      return;
    }

    setIsApplyingEdit(true);
    try {
      const result = await commit({
        type: 'updateItem',
        payload: {
          id: expandedItemId,
          note: popupEditNote,
          tags: popupEditTags
        }
      });

      if (!result.ok) {
        setNotice({ level: 'error', text: t('popup.updateFailed') });
        return;
      }

      closePopupEditor(null);
      await load();
    } finally {
      setIsApplyingEdit(false);
    }
  }

  function handleCancelPopupEdit(): void {
    const source =
      recentItems.find((item) => item.id === expandedItemId) ??
      (currentItem?.id === expandedItemId ? currentItem : null);

    closePopupEditor(source);
  }

  async function handleQuickEditStatusChange(status: FolioStatus): Promise<void> {
    const editing = expandedItem;
    if (!editing) {
      return;
    }

    await handleStatusChange(editing, status);
  }

  function stopDeleteHold(): void {
    if (deleteHoldRafRef.current !== null) {
      window.cancelAnimationFrame(deleteHoldRafRef.current);
      deleteHoldRafRef.current = null;
    }
    setDeleteHoldItemId(null);
    setDeleteHoldProgress(0);
    deleteHoldTargetRef.current = null;
  }

  function startDeleteHold(item: FolioItem): void {
    stopDeleteHold();
    setDeleteHoldItemId(item.id);
    setDeleteHoldProgress(0);
    deleteHoldTargetRef.current = item;
    deleteHoldStartRef.current = performance.now();

    const step = (timestamp: number): void => {
      const elapsed = timestamp - deleteHoldStartRef.current;
      const progress = Math.min(elapsed / DELETE_HOLD_DURATION_MS, 1);
      setDeleteHoldProgress(progress);

      if (progress >= 1) {
        const target = deleteHoldTargetRef.current;
        stopDeleteHold();
        if (target) {
          void handleDeleteItem(target);
        }
        return;
      }

      deleteHoldRafRef.current = window.requestAnimationFrame(step);
    };

    deleteHoldRafRef.current = window.requestAnimationFrame(step);
  }

  function handleDeletePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    item: FolioItem
  ): void {
    event.preventDefault();
    event.stopPropagation();
    startDeleteHold(item);
  }

  function handleDeletePointerStop(event: PointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    stopDeleteHold();
  }

  const filteredRecentItems = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    let items =
      popupFilter === 'all'
        ? recentItems
        : recentItems.filter((item) => item.status === popupFilter);

    if (keyword) {
      items = items.filter((item) => matchesItemKeyword(item, keyword, true));
    }

    return items;
  }, [popupFilter, recentItems, searchTerm]);

  // The quick-edit panel is a full-surface view decoupled from the filtered
  // list, so it stays open across status/filter changes; only a genuinely gone
  // item (deleted) closes it.
  useEffect(() => {
    if (!expandedItemId) {
      return;
    }

    if (!recentItems.some((item) => item.id === expandedItemId)) {
      closePopupEditor(null);
    }
    // closePopupEditor is a stable setter wrapper; deps track the gone-item check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedItemId, recentItems]);

  const expandedItem = useMemo(
    () => recentItems.find((item) => item.id === expandedItemId) ?? null,
    [recentItems, expandedItemId]
  );

  const headerMode: HeaderMode = !canSave
    ? 'disabled'
    : currentItem
      ? 'saved'
      : 'save';

  const trimmedSearch = searchTerm.trim();
  const showingSearch = searchOpen || trimmedSearch.length > 0;

  const filterCounts: Record<PopupFilter, number> = {
    all: recentItems.length,
    unread: recentItems.filter((item) => item.status === 'unread').length,
    reading: recentItems.filter((item) => item.status === 'reading').length,
    done: recentItems.filter((item) => item.status === 'done').length
  };
  const filterLabel = (text: string, count: number) => (
    <span className="inline-flex items-center gap-1">
      {text}
      <span className="text-[10px] font-semibold tabular-nums opacity-55">{count}</span>
    </span>
  );
  const filterOptions: SegmentedOption<PopupFilter>[] = [
    { value: 'all', label: filterLabel(t('common.all'), filterCounts.all), ariaLabel: t('common.all') },
    { value: 'unread', label: filterLabel(t('common.unread'), filterCounts.unread), ariaLabel: t('common.unread') },
    { value: 'reading', label: filterLabel(t('common.reading'), filterCounts.reading), ariaLabel: t('common.reading') },
    { value: 'done', label: filterLabel(t('common.done'), filterCounts.done), ariaLabel: t('common.done') }
  ];

  const isEmpty = recentItems.length === 0;
  const isFilteredEmpty = filteredRecentItems.length === 0;

  return (
    <main className="fz fz-surface relative flex h-[520px] w-[360px] flex-col">
      <PopupHeader
        mode={headerMode}
        onSave={() => void handleSaveCurrentPage()}
        onRemove={() => void handleRemoveCurrentPage()}
        onOpenLibrary={() => void handleOpenOptions()}
      />

      {notice && notice.level === 'error' ? (
        <PopupNotice
          level={notice.level}
          text={notice.text}
          onDismiss={() => setNotice(null)}
        />
      ) : null}

      {expandedItem ? (
        <QuickEditPanel
          item={expandedItem}
          note={popupEditNote}
          tags={popupEditTags}
          tagInput={popupTagInput}
          saving={isApplyingEdit}
          onNoteChange={setPopupEditNote}
          onTagInputChange={setPopupTagInput}
          onAddTag={handlePopupAddTag}
          onRemoveTag={handlePopupRemoveTag}
          onStatusChange={(status) => void handleQuickEditStatusChange(status)}
          onDone={() => void handleConfirmPopupEdit()}
          onBack={handleCancelPopupEdit}
        />
      ) : (
        <>
          <div className="px-3 pb-2.5">
            {showingSearch ? (
              <div className="fz-token-field" style={{ height: 38, paddingLeft: 12 }}>
                <Search size={15} strokeWidth={2} className="text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  className="fz-input"
                  style={{ fontSize: 13.5 }}
                  placeholder={t('popup.searchPlaceholder')}
                  aria-label={t('popup.searchAction')}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      clearSearch();
                    }
                  }}
                />
                <IconButton
                  size="sm"
                  title={t('popup.clearSearch')}
                  aria-label={t('popup.clearSearch')}
                  onClick={clearSearch}
                >
                  <X size={14} strokeWidth={2.2} />
                </IconButton>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Segmented
                  options={filterOptions}
                  value={popupFilter}
                  onChange={handlePopupFilterChange}
                  tight
                  className="flex-1"
                  ariaLabel={t('popup.recent')}
                />
                <IconButton
                  size="sm"
                  title={t('popup.searchAction')}
                  aria-label={t('popup.searchAction')}
                  onClick={openSearch}
                >
                  <Search size={16} strokeWidth={2} />
                </IconButton>
              </div>
            )}
          </div>

          <div className="fz-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 pb-2 pt-2">
            {isEmpty ? (
              <EmptyCold />
            ) : trimmedSearch && isFilteredEmpty ? (
              <NoResults query={trimmedSearch} onClear={clearSearch} />
            ) : isFilteredEmpty && popupFilter !== 'all' ? (
              <EmptyFiltered status={popupFilter} />
            ) : (
              <div className="flex flex-col gap-px">
                {filteredRecentItems.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    searchTerm={searchTerm}
                    canSaveProgress={
                      item.id === readingTargetItem?.id && item.status === 'reading'
                    }
                    savingProgress={isSavingProgress}
                    deleteHoldProgress={
                      deleteHoldItemId === item.id ? deleteHoldProgress : null
                    }
                    onSetStatus={(id, status) => {
                      const target = recentItems.find((entry) => entry.id === id);
                      if (target) {
                        void handleStatusChange(target, status);
                      }
                    }}
                    onOpen={handleOpenItem}
                    onTitle={handleEditItem}
                    onSaveProgress={(target) => void handleSaveProgress(target)}
                    onDeletePointerDown={handleDeletePointerDown}
                    onDeletePointerStop={handleDeletePointerStop}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {notice && notice.level !== 'error' ? (
        <PopupNotice
          level={notice.level}
          text={notice.text}
          onDismiss={() => setNotice(null)}
        />
      ) : null}
    </main>
  );
}
