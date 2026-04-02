import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  ExternalLink,
  Goal,
  Plus,
  Search,
  X
} from 'lucide-react';
import {
  DEFAULT_THEME,
  applyDocumentTheme,
  getThemeIconVariant,
  resolveFolioTheme,
  type FolioTheme
} from '../shared/theme';
import { FolioMark } from '../shared/ui/FolioMark';
import { noticeClass, type NoticeLevel } from '../shared/ui/notice';
import {
  nextStatus,
  statusBadgeClass,
  statusIcon,
  statusToLabel
} from '../shared/ui/itemStatus';
import { renderHighlightedText } from '../shared/ui/renderHighlightedText';
import { TagInputField } from '../shared/ui/TagInputField';
import { TextField } from '../shared/ui/TextField';
import { useAutoDismissNotice } from '../shared/ui/useAutoDismissNotice';
import { commit, getStore } from '../core/repository';
import {
  getItemPreferredDomain,
  getItemPreferredTitle,
  matchesItemKeyword,
  selectItemByUrl,
  selectRecentItems
} from '../core/selectors';
import type { FolioItem, FolioStatus } from '../core/types';
import type { RuntimeMessageResponse } from '../shared/runtimeMessages';

interface ActivePage {
  url: string;
  title: string;
  favicon: string;
}

type PopupFilter = 'all' | FolioStatus;

interface PopupNotice {
  level: NoticeLevel;
  text: string;
}

const DELETE_HOLD_DURATION_MS = 1000;

export default function App(): ReactElement {
  const { t } = useTranslation();

  const [activePage, setActivePage] = useState<ActivePage | null>(null);
  const [currentItem, setCurrentItem] = useState<FolioItem | null>(null);
  const [recentItems, setRecentItems] = useState<FolioItem[]>([]);
  const [theme, setTheme] = useState<FolioTheme>(DEFAULT_THEME);
  const [popupFilter, setPopupFilter] = useState<PopupFilter>('unread');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [popupEditNote, setPopupEditNote] = useState('');
  const [popupEditTags, setPopupEditTags] = useState<string[]>([]);
  const [popupTagInput, setPopupTagInput] = useState('');
  const [notice, setNotice] = useState<PopupNotice | null>(null);
  const [deleteHoldItemId, setDeleteHoldItemId] = useState<string | null>(null);
  const [deleteHoldProgress, setDeleteHoldProgress] = useState(0);
  const initialFilterResolvedRef = useRef(false);
  const popupLastViewCommitRef = useRef(Promise.resolve());
  const deleteHoldRafRef = useRef<number | null>(null);
  const deleteHoldStartRef = useRef(0);
  const deleteHoldTargetRef = useRef<FolioItem | null>(null);

  const canSave = Boolean(activePage?.url);
  useAutoDismissNotice(notice, setNotice, 3000);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);

  useEffect(() => {
    return () => {
      stopDeleteHold();
    };
  }, []);

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

    setActivePage(page);
    setCurrentItem(item);
    setTheme(resolveFolioTheme(store.settings.theme));
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
    if (item.id !== currentItem?.id || item.status !== 'reading') {
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
    setPopupFilter(nextFilter);
    if (nextFilter === popupFilter) {
      return;
    }
    persistPopupLastView(nextFilter);
  }

  function handleToggleExpanded(item: FolioItem): void {
    if (expandedItemId === item.id) {
      closePopupEditor(item);
      return;
    }

    openPopupEditor(item);
  }

  function handleRowKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    item: FolioItem
  ): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    handleToggleExpanded(item);
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
  }

  function handleCancelPopupEdit(): void {
    const source =
      recentItems.find((item) => item.id === expandedItemId) ??
      (currentItem?.id === expandedItemId ? currentItem : null);

    closePopupEditor(source);
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

  function handleDeletePointerStop(
    event: PointerEvent<HTMLButtonElement>
  ): void {
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

  useEffect(() => {
    if (!expandedItemId) {
      return;
    }

    if (!filteredRecentItems.some((item) => item.id === expandedItemId)) {
      closePopupEditor(null);
    }
  }, [expandedItemId, filteredRecentItems]);

  const iconVariant = getThemeIconVariant(theme);

  return (
    <main className="relative flex h-[450px] w-[320px] flex-col bg-bg-base text-text-primary">
      <section className="space-y-2 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FolioMark variant={iconVariant} size={17} />
            <span className="font-display text-[14px] font-semibold tracking-[-0.01em]">
              {t('popup.title')}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2 text-[11px] font-medium text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-55"
              disabled={!canSave}
              onClick={() =>
                void (currentItem
                  ? handleRemoveCurrentPage()
                  : handleSaveCurrentPage())
              }
            >
              {currentItem ? (
                <X className="h-3 w-3" strokeWidth={2.2} />
              ) : (
                <Plus className="h-3 w-3" strokeWidth={2.2} />
              )}
              <span>
                {currentItem ? t('popup.removeCurrent') : t('popup.saveShort')}
              </span>
            </button>

            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-(--border) bg-bg-elevated px-2 text-[11px] text-text-secondary hover:bg-bg-sunken"
              onClick={() => void handleOpenOptions()}
            >
              <ExternalLink className="h-3 w-3" strokeWidth={2} />
              {t('popup.openDashboard')}
            </button>
          </div>
        </div>

        <TextField
          id="popup-search"
          aria-label={t('popup.searchAction')}
          leftIcon={<Search className="h-[11px] w-[11px]" strokeWidth={2} />}
          className="h-8 px-2.5 pl-8 text-[11px]"
          placeholder={t('popup.searchPlaceholder')}
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </section>

      <div className="mx-2.5 h-px bg-(--border)" />

      <section className="flex min-h-0 flex-1 flex-col space-y-2 p-2.5">
        {notice ? (
          <p className={`m-0 rounded-[10px] px-2.5 py-2 text-[11px] ${noticeClass(notice.level)}`}>
            {notice.text}
          </p>
        ) : null}

        <div className="rounded-full bg-bg-surface p-0.5">
          <div className="grid grid-cols-4 gap-0.5">
            {(['unread', 'reading', 'done', 'all'] as PopupFilter[]).map((status) => {
              const active = popupFilter === status;
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={active}
                  className={
                    active
                      ? 'rounded-full border border-(--accent-border) bg-accent-subtle px-1.5 py-1 text-[11px] font-semibold text-accent'
                      : 'rounded-full border border-transparent px-1.5 py-1 text-[11px] text-text-muted hover:border-(--border) hover:bg-bg-base hover:text-text-secondary'
                  }
                  onClick={() => handlePopupFilterChange(status)}
                >
                  {status === 'all' ? t('common.all') : statusToLabel(status, t)}
                </button>
              );
            })}
          </div>
        </div>

        <p className="mb-1.5 font-mono text-[9px] uppercase text-text-muted">
          {t('popup.recent')}
        </p>
        <div className="folio-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 pr-3 pt-2">
          {filteredRecentItems.map((item) => {
            const isExpanded = expandedItemId === item.id;
            const canSaveProgress =
              item.id === currentItem?.id && item.status === 'reading';

            return (
              <div
                key={item.id}
                className={`group/item relative overflow-visible rounded-md transition-colors ${
                  isExpanded ? 'bg-bg-surface' : 'hover:bg-bg-surface'
                }`}
              >
                <div className="flex items-center gap-1 px-1.5 py-1.5">
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-[10px] px-0.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-(--accent-border)"
                    onClick={() => handleToggleExpanded(item)}
                    onKeyDown={(event) => handleRowKeyDown(event, item)}
                    aria-expanded={isExpanded}
                  >
                    {item.favicon ? (
                      <img
                        src={item.favicon}
                        alt=""
                        className="h-[18px] w-[18px] rounded-[4px] bg-bg-surface object-cover"
                      />
                    ) : (
                      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] bg-bg-surface">
                        <FolioMark variant={iconVariant} size={15} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1">
                        <button
                          type="button"
                          className="block min-w-0 max-w-full cursor-pointer truncate bg-transparent p-0 text-left text-[13px] text-text-primary hover:text-accent hover:underline underline-offset-2"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleOpenRecentItem(item);
                          }}
                        >
                          {renderHighlightedText(getItemPreferredTitle(item), searchTerm)}
                        </button>
                      </span>
                      <span className="block truncate font-mono text-[10px] text-text-muted">
                        {renderHighlightedText(getItemPreferredDomain(item), searchTerm)}
                      </span>
                    </span>
                  </div>

                  <button
                    type="button"
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-(--border) ${statusBadgeClass(item.status)} hover:border-(--accent-border)`}
                    onClick={() => void handleStatusChange(item, nextStatus(item.status))}
                    title={`${statusToLabel(item.status, t)} → ${statusToLabel(nextStatus(item.status), t)}`}
                    aria-label={`${statusToLabel(item.status, t)} → ${statusToLabel(nextStatus(item.status), t)}`}
                  >
                    <span className="scale-[0.95]">{statusIcon(item.status)}</span>
                  </button>
                </div>

                <button
                  type="button"
                  className={`group/delete absolute -right-1.5 -top-1.5 z-[3] inline-flex h-4.5 w-4.5 items-center justify-center rounded-full text-danger transition-opacity duration-150 ${
                    deleteHoldItemId === item.id
                      ? 'opacity-100 pointer-events-auto'
                      : 'opacity-0 pointer-events-none group-hover/item:pointer-events-auto group-hover/item:opacity-100'
                  }`}
                  onPointerDown={(event) => handleDeletePointerDown(event, item)}
                  onPointerUp={handleDeletePointerStop}
                  onPointerLeave={handleDeletePointerStop}
                  onPointerCancel={handleDeletePointerStop}
                  onContextMenu={(event) => event.preventDefault()}
                  title={t('common.delete')}
                  aria-label={t('common.delete')}
                >
                  {deleteHoldItemId === item.id ? (
                    <>
                      <span
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: `conic-gradient(var(--accent) ${
                            deleteHoldProgress * 360
                          }deg, transparent 0deg)`
                        }}
                      />
                      <span className="absolute inset-[1px] rounded-full bg-bg-base" />
                    </>
                  ) : (
                    <span className="absolute inset-0 rounded-full border border-(--border) bg-bg-base shadow-none transition-all duration-150 group-hover/delete:bg-bg-elevated group-hover/delete:shadow-[0_1px_2px_rgba(0,0,0,0.12)]" />
                  )}
                  <X className="relative z-[2] h-2.25 w-2.25" strokeWidth={2.1} />
                </button>

                {isExpanded ? (
                  <div className="mx-1.5 mb-1.5 rounded-[10px] bg-bg-surface px-2.5 py-2.5">
                    <div className="grid gap-2">
                      <TextField
                        aria-label={t('popup.quickEditNote')}
                        className="h-8 px-2.5 text-[11px]"
                        placeholder={t('popup.quickEditNote')}
                        value={popupEditNote}
                        onChange={(event) => setPopupEditNote(event.target.value)}
                      />
                      <TagInputField
                        tags={popupEditTags}
                        inputValue={popupTagInput}
                        placeholder={t('popup.quickEditTags')}
                        removeButtonTitle={t('common.delete')}
                        removeButtonLabel={(tag) => t('options.removeTagAria', { tag })}
                        onInputChange={setPopupTagInput}
                        onAddTag={handlePopupAddTag}
                        onRemoveTag={handlePopupRemoveTag}
                      />
                      <div className="flex items-center justify-end gap-1.5">
                        {canSaveProgress ? (
                          <button
                            type="button"
                            className="inline-flex h-7 items-center gap-1 rounded-md bg-bg-elevated px-2 text-[11px] text-text-secondary hover:bg-bg-sunken disabled:cursor-not-allowed disabled:opacity-55"
                            onClick={() => void handleSaveProgress(item)}
                            disabled={isSavingProgress}
                          >
                            <Goal className="h-3.5 w-3.5" strokeWidth={2} />
                            {t('popup.saveProgress')}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="inline-flex h-7 items-center rounded-md bg-bg-elevated px-2 text-[11px] text-text-secondary hover:bg-bg-sunken"
                          onClick={handleCancelPopupEdit}
                        >
                          {t('popup.quickEditDismiss')}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-7 items-center rounded-md bg-accent px-2 text-[11px] font-medium text-on-accent hover:bg-accent-hover"
                          onClick={() => void handleConfirmPopupEdit()}
                        >
                          {t('popup.quickEditApply')}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          {filteredRecentItems.length === 0 ? (
            <p className="m-0 rounded-md bg-bg-surface px-2.5 py-3 text-[11px] text-text-muted">
              {t('options.emptyText')}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
