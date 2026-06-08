import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement
} from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../shared/i18n';
import { isSupportedLocale, type SupportedLocale } from '../shared/i18n/localeStore';
import {
  applyThemeMode,
  readThemeMode,
  writeThemeMode,
  type ThemeMode
} from '../shared/theme';
import { statusToLabel } from '../shared/ui/itemStatus';
import { commit, getStore, importStoreFromJson, syncBackupNow } from '../core/repository';
import {
  getItemPreferredUrl,
  selectAllItems,
  selectFilteredItems,
  selectItemsByStatus,
  selectStatusCounts,
  sortItems,
  type SortMode
} from '../core/selectors';
import { toCsv, toJson, toMarkdown } from '../core/exportFormats';
import { downloadTextFile } from '../core/exporters';
import {
  clearBackupDirectoryHandle,
  saveBackupDirectoryHandle
} from '../core/sync/handleStore';
import type { GitHubSyncStatus } from '../core/sync/github/types';
import {
  isDefaultViewMode,
  isSavedView,
  isSortMode,
  type DefaultViewMode,
  type FolioItem,
  type FolioStore,
  type SavedView
} from '../core/types';
import { Sidebar } from './_components/library/Sidebar';
import { githubGetStatus } from './_components/syncClient';
import { Toolbar } from './_components/library/Toolbar';
import { ItemRow, type EditDraft } from './_components/library/ItemRow';
import { EmptyState } from './_components/library/EmptyState';
import { CommandPalette, type PaletteCommand } from './_components/library/CommandPalette';
import { ToastStack } from './_components/library/ToastStack';
import { PreferencesCard } from './_components/settings/PreferencesCard';
import { ManageTagsCard } from './_components/settings/ManageTagsCard';
import { LocalBackupCard } from './_components/settings/LocalBackupCard';
import { GitHubCard } from './_components/github/GitHubCard';
import { normalizeTag } from './_components/format';
import type { ExportScope, NoticeState, ViewKey } from './_components/types';

type DangerAction = 'clearSyncDirectory' | 'deleteTag';
const DELETE_HOLD_DURATION_MS = 1200;
const NOTICE_MS = 3000;
const UNDO_MS = 3000;

export default function App(): ReactElement {
  const { t } = useTranslation();
  const [store, setStore] = useState<FolioStore | null>(null);
  const [view, setView] = useState<ViewKey>('unread');
  const [search, setSearch] = useState('');
  const [locale, setLocale] = useState<SupportedLocale>('en');
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editTagInput, setEditTagInput] = useState('');
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>('current');
  const [sortMode, setSortMode] = useState<SortMode>('saved_desc');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [tagActionTarget, setTagActionTarget] = useState('');
  const [tagRenameValue, setTagRenameValue] = useState('');
  const [defaultStatusInput, setDefaultStatusInput] = useState<'unread' | 'reading'>('unread');
  const [optionsDefaultViewModeInput, setOptionsDefaultViewModeInput] = useState<DefaultViewMode>('last');
  const [optionsFixedViewInput, setOptionsFixedViewInput] = useState<SavedView>('unread');
  const [popupDefaultViewModeInput, setPopupDefaultViewModeInput] = useState<DefaultViewMode>('last');
  const [popupFixedViewInput, setPopupFixedViewInput] = useState<SavedView>('unread');
  const [undoItems, setUndoItems] = useState<FolioItem[]>([]);
  const [pendingDangerAction, setPendingDangerAction] = useState<DangerAction | null>(null);
  const [deleteHoldItemId, setDeleteHoldItemId] = useState<string | null>(null);
  const [deleteHoldProgress, setDeleteHoldProgress] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<GitHubSyncStatus | null>(null);
  const [syncRefreshToken, setSyncRefreshToken] = useState(0);

  const noticeTimerRef = useRef<number | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const dangerConfirmTimerRef = useRef<number | null>(null);
  const deleteHoldRafRef = useRef<number | null>(null);
  const deleteHoldStartRef = useRef(0);
  const deleteHoldTargetRef = useRef<FolioItem | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const initialViewResolvedRef = useRef(false);
  const optionsLastViewCommitRef = useRef(Promise.resolve());

  function pushNotice(next: NoticeState): void {
    setNotice(next);
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  }

  useEffect(() => {
    void refresh();
    void readThemeMode().then(setThemeMode);

    const initialSearch = new URLSearchParams(window.location.search).get('search');
    if (initialSearch) {
      setSearch(initialSearch);
    }

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: chrome.storage.AreaName
    ): void => {
      if (areaName !== 'local') return;
      if (changes['folio-store']) {
        void refresh();
      }
      if (changes['folio-store'] || changes['folio-github-credentials']) {
        setSyncRefreshToken((prev) => prev + 1);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // The nav sync chip is the always-on sync truth — fetch status on mount and
  // whenever the store / credentials change, independent of the settings view.
  useEffect(() => {
    let cancelled = false;
    void githubGetStatus().then((status) => {
      if (!cancelled) {
        setSyncStatus(status);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [syncRefreshToken]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      [noticeTimerRef, undoTimerRef, dangerConfirmTimerRef].forEach((ref) => {
        if (ref.current !== null) {
          window.clearTimeout(ref.current);
        }
      });
      if (deleteHoldRafRef.current !== null) {
        window.cancelAnimationFrame(deleteHoldRafRef.current);
      }
    };
  }, []);

  async function refresh(): Promise<void> {
    const nextStore = await getStore();
    const nextLocale = isSupportedLocale(nextStore.settings.locale) ? nextStore.settings.locale : 'en';

    setStore(nextStore);
    setLocale(nextLocale);
    setDefaultStatusInput(nextStore.settings.defaultStatus);
    setSortMode(nextStore.settings.sortMode);
    setOptionsDefaultViewModeInput(nextStore.settings.optionsDefaultViewMode);
    setOptionsFixedViewInput(nextStore.settings.optionsFixedView);
    setPopupDefaultViewModeInput(nextStore.settings.popupDefaultViewMode);
    setPopupFixedViewInput(nextStore.settings.popupFixedView);
    if (!initialViewResolvedRef.current) {
      setView(
        nextStore.settings.optionsDefaultViewMode === 'fixed'
          ? nextStore.settings.optionsFixedView
          : nextStore.settings.optionsLastView
      );
      initialViewResolvedRef.current = true;
    }
  }

  // ---- danger arm/disarm ----
  function armDangerAction(action: DangerAction): void {
    if (dangerConfirmTimerRef.current !== null) {
      window.clearTimeout(dangerConfirmTimerRef.current);
    }
    setPendingDangerAction(action);
    dangerConfirmTimerRef.current = window.setTimeout(() => {
      setPendingDangerAction(null);
      dangerConfirmTimerRef.current = null;
    }, NOTICE_MS);
  }

  function clearDangerAction(): void {
    if (dangerConfirmTimerRef.current !== null) {
      window.clearTimeout(dangerConfirmTimerRef.current);
      dangerConfirmTimerRef.current = null;
    }
    setPendingDangerAction(null);
  }

  // ---- delete-hold ----
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
          void handleDelete(target);
        }
        return;
      }
      deleteHoldRafRef.current = window.requestAnimationFrame(step);
    };
    deleteHoldRafRef.current = window.requestAnimationFrame(step);
  }

  // ---- view / sort ----
  function handleChangeView(nextView: ViewKey): void {
    setView(nextView);
    setActiveTagFilter(null);
    if (nextView === 'settings' || store?.settings.optionsLastView === nextView) {
      return;
    }
    optionsLastViewCommitRef.current = optionsLastViewCommitRef.current
      .then(async () => {
        const latestStore = await getStore();
        if (latestStore.settings.optionsLastView === nextView) {
          return;
        }
        await commit({ type: 'updateSettings', payload: { optionsLastView: nextView } });
      })
      .catch(() => undefined);
  }

  function handleSelectTag(tag: string): void {
    handleChangeView('all');
    setActiveTagFilter(tag);
  }

  async function handleSortModeChange(value: SortMode): Promise<void> {
    if (!isSortMode(value) || value === sortMode) {
      return;
    }
    setSortMode(value);
    const result = await commit({ type: 'updateSettings', payload: { sortMode: value } });
    if (!result.ok) {
      pushNotice({ level: 'error', text: t('options.updateFailed') });
      await refresh();
    }
  }

  // ---- derived ----
  const displayItems = useMemo(() => {
    if (!store) return [];
    let items: FolioItem[];
    if (search.trim()) {
      items = selectFilteredItems(store, search);
    } else if (view === 'all' || view === 'settings') {
      items = view === 'settings' ? [] : selectAllItems(store);
    } else {
      items = selectItemsByStatus(store, view);
    }
    if (activeTagFilter) {
      items = items.filter((item) => item.tags.includes(activeTagFilter));
    }
    return sortItems(items, sortMode);
  }, [store, search, view, activeTagFilter, sortMode]);

  const counts = useMemo(() => {
    if (!store) {
      return { all: 0, unread: 0, reading: 0, done: 0 };
    }
    const statusCounts = selectStatusCounts(store);
    return {
      all: statusCounts.total,
      unread: statusCounts.unread,
      reading: statusCounts.reading,
      done: statusCounts.done
    };
  }, [store]);

  const tagCounts = useMemo(() => {
    if (!store) {
      return {} as Record<string, number>;
    }
    const result: Record<string, number> = {};
    for (const item of Object.values(store.items)) {
      for (const tag of item.tags) {
        result[tag] = (result[tag] ?? 0) + 1;
      }
    }
    return result;
  }, [store]);


  const exportItems = useMemo(() => {
    if (!store) return [];
    return exportScope === 'current' ? displayItems : sortItems(selectAllItems(store), sortMode);
  }, [displayItems, exportScope, sortMode, store]);

  // ---- item mutations ----
  async function handleDelete(item: FolioItem): Promise<void> {
    stopDeleteHold();
    const result = await commit({ type: 'deleteItem', payload: { id: item.id } });
    if (!result.ok) {
      pushNotice({ level: 'error', text: t('options.deleteFailed') });
      return;
    }
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
    }
    setUndoItems([item]);
    undoTimerRef.current = window.setTimeout(() => setUndoItems([]), UNDO_MS);
    if (editingId === item.id) {
      setEditingId(null);
      setEditDraft(null);
    }
    await refresh();
  }

  async function handleUndoDelete(): Promise<void> {
    if (undoItems.length === 0) {
      return;
    }
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
    }
    let successCount = 0;
    let failedCount = 0;
    for (const item of undoItems) {
      const result = await commit({ type: 'restoreItem', payload: { item } });
      if (result.ok) {
        successCount += 1;
      } else {
        failedCount += 1;
      }
    }
    setUndoItems([]);
    if (failedCount === 0) {
      pushNotice({ level: 'success', text: t('options.batchSuccess', { count: successCount }) });
    } else if (successCount === 0) {
      pushNotice({ level: 'error', text: t('options.undoFailed') });
    } else {
      pushNotice({ level: 'error', text: t('options.batchPartial', { ok: successCount, failed: failedCount }) });
    }
    await refresh();
  }

  // ---- inline edit ----
  function handleStartEdit(item: FolioItem): void {
    if (editingId === item.id) {
      setEditingId(null);
      setEditDraft(null);
      setEditTagInput('');
      return;
    }
    setEditingId(item.id);
    setEditDraft({
      title: item.title,
      url: item.url,
      note: item.note,
      tags: [...item.tags],
      status: item.status
    });
    setEditTagInput('');
  }

  function handleEditDraftChange(next: Partial<EditDraft>): void {
    setEditDraft((previous) => (previous ? { ...previous, ...next } : previous));
  }

  function handleAddEditTag(): void {
    const normalized = normalizeTag(editTagInput);
    if (!normalized) {
      return;
    }
    setEditDraft((previous) => {
      if (!previous) return previous;
      if (previous.tags.some((tag) => tag.toLowerCase() === normalized.toLowerCase())) {
        return previous;
      }
      return { ...previous, tags: [...previous.tags, normalized] };
    });
    setEditTagInput('');
  }

  function handleRemoveEditTag(targetIndex: number): void {
    setEditDraft((previous) =>
      previous ? { ...previous, tags: previous.tags.filter((_tag, index) => index !== targetIndex) } : previous
    );
  }

  function closeInlineEditor(): void {
    setEditingId(null);
    setEditDraft(null);
    setEditTagInput('');
  }

  async function handleSaveEdit(): Promise<void> {
    if (!editingId || !editDraft) {
      return;
    }
    const pendingTag = normalizeTag(editTagInput);
    const nextTags = [...editDraft.tags];
    if (pendingTag && !nextTags.some((tag) => tag.toLowerCase() === pendingTag.toLowerCase())) {
      nextTags.push(pendingTag);
    }
    const result = await commit({
      type: 'updateItem',
      payload: {
        id: editingId,
        title: editDraft.title,
        url: editDraft.url,
        note: editDraft.note,
        tags: nextTags,
        status: editDraft.status
      }
    });
    if (!result.ok) {
      pushNotice({ level: 'error', text: t('options.updateFailed') });
      return;
    }
    pushNotice({ level: 'success', text: t('options.updateSuccess') });
    closeInlineEditor();
    await refresh();
  }

  // ---- settings: preferences ----
  async function handleLocaleChange(value: SupportedLocale): Promise<void> {
    if (!isSupportedLocale(value) || value === locale) {
      return;
    }
    const result = await commit({ type: 'setLocale', payload: { locale: value } });
    if (!result.ok) {
      pushNotice({ level: 'error', text: t('options.updateFailed') });
      await refresh();
      return;
    }
    await changeLanguage(value);
    setLocale(value);
    await refresh();
  }

  async function handleThemeModeChange(mode: ThemeMode): Promise<void> {
    // ThemeModeToggle already applied + persisted; keep state + storage consistent.
    setThemeMode(mode);
    applyThemeMode(mode);
    await writeThemeMode(mode);
  }

  async function handleDefaultStatusChange(value: 'unread' | 'reading'): Promise<void> {
    if (value === defaultStatusInput) {
      return;
    }
    setDefaultStatusInput(value);
    const result = await commit({ type: 'updateSettings', payload: { defaultStatus: value } });
    if (!result.ok) {
      pushNotice({ level: 'error', text: t('options.updateFailed') });
      await refresh();
    }
  }

  async function handleOptionsDefaultViewModeChange(value: DefaultViewMode): Promise<void> {
    if (!isDefaultViewMode(value) || value === optionsDefaultViewModeInput) {
      return;
    }
    setOptionsDefaultViewModeInput(value);
    const result = await commit({ type: 'updateSettings', payload: { optionsDefaultViewMode: value } });
    if (!result.ok) {
      pushNotice({ level: 'error', text: t('options.updateFailed') });
      await refresh();
    }
  }

  async function handleOptionsFixedViewChange(value: SavedView): Promise<void> {
    if (!isSavedView(value) || value === optionsFixedViewInput) {
      return;
    }
    setOptionsFixedViewInput(value);
    const result = await commit({ type: 'updateSettings', payload: { optionsFixedView: value } });
    if (!result.ok) {
      pushNotice({ level: 'error', text: t('options.updateFailed') });
      await refresh();
    }
  }

  async function handlePopupDefaultViewModeChange(value: DefaultViewMode): Promise<void> {
    if (!isDefaultViewMode(value) || value === popupDefaultViewModeInput) {
      return;
    }
    setPopupDefaultViewModeInput(value);
    const result = await commit({ type: 'updateSettings', payload: { popupDefaultViewMode: value } });
    if (!result.ok) {
      pushNotice({ level: 'error', text: t('options.updateFailed') });
      await refresh();
    }
  }

  async function handlePopupFixedViewChange(value: SavedView): Promise<void> {
    if (!isSavedView(value) || value === popupFixedViewInput) {
      return;
    }
    setPopupFixedViewInput(value);
    const result = await commit({ type: 'updateSettings', payload: { popupFixedView: value } });
    if (!result.ok) {
      pushNotice({ level: 'error', text: t('options.updateFailed') });
      await refresh();
    }
  }

  // ---- settings: local backup ----
  async function handleChooseSyncDirectory(): Promise<void> {
    const showDirectoryPicker = (
      window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
    ).showDirectoryPicker;

    if (typeof showDirectoryPicker !== 'function') {
      pushNotice({ level: 'error', text: t('settings.syncUnavailable') });
      return;
    }

    try {
      const handle = await showDirectoryPicker();
      await saveBackupDirectoryHandle(handle);
      await commit({ type: 'setSyncDirectory', payload: { name: handle.name } });
      await handleSyncNow();
      await refresh();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      const text = error instanceof Error ? error.message : 'unknown_error';
      pushNotice({ level: 'error', text: t('settings.syncFailed', { error: text }) });
    }
  }

  async function handleClearSyncDirectory(): Promise<void> {
    if (pendingDangerAction !== 'clearSyncDirectory') {
      armDangerAction('clearSyncDirectory');
      return;
    }
    clearDangerAction();
    await clearBackupDirectoryHandle();
    await commit({ type: 'setSyncDirectory', payload: { name: null } });
    await refresh();
  }

  async function handleSyncNow(): Promise<void> {
    setIsSyncing(true);
    try {
      const result = await syncBackupNow();
      if (result.ok) {
        pushNotice({ level: 'success', text: t('settings.syncSuccess') });
      } else {
        pushNotice({ level: 'error', text: t('settings.syncFailed', { error: result.error ?? 'unknown_error' }) });
      }
      await refresh();
    } finally {
      setIsSyncing(false);
    }
  }

  function handleImportClick(): void {
    importInputRef.current?.click();
  }

  async function handleImportFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    try {
      const rawText = await file.text();
      const raw = JSON.parse(rawText) as unknown;
      const result = await importStoreFromJson(raw);
      if (!result.ok) {
        pushNotice({ level: 'error', text: t('settings.importFailed', { error: result.error ?? 'unknown_error' }) });
        return;
      }
      await changeLanguage(result.store.settings.locale);
      setLocale(result.store.settings.locale);
      pushNotice({
        level: 'success',
        text: t('settings.importSuccess', { count: Object.keys(result.store.items).length })
      });
      setView('all');
      setSearch('');
      setActiveTagFilter(null);
      closeInlineEditor();
      await refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'invalid_json';
      pushNotice({ level: 'error', text: t('settings.importFailed', { error: text }) });
    }
  }

  // ---- settings: tag management ----
  async function handleRenameTag(): Promise<void> {
    if (!store || !tagActionTarget) {
      return;
    }
    const newTag = tagRenameValue.trim();
    if (!newTag) {
      return;
    }
    const result = await commit({ type: 'renameTag', payload: { from: tagActionTarget, to: newTag } });
    pushNotice(
      result.ok
        ? { level: 'success', text: t('options.tagRenamed') }
        : { level: 'error', text: t('options.updateFailed') }
    );
    setTagActionTarget('');
    setTagRenameValue('');
    setActiveTagFilter(null);
    await refresh();
  }

  async function handleDeleteTag(): Promise<void> {
    if (!store || !tagActionTarget) {
      return;
    }
    if (pendingDangerAction !== 'deleteTag') {
      armDangerAction('deleteTag');
      return;
    }
    clearDangerAction();
    const target = tagActionTarget;
    const result = await commit({ type: 'deleteTag', payload: { tag: target } });
    pushNotice(
      result.ok
        ? { level: 'success', text: t('options.tagDeleted') }
        : { level: 'error', text: t('options.updateFailed') }
    );
    if (activeTagFilter === target) {
      setActiveTagFilter(null);
    }
    setTagActionTarget('');
    setTagRenameValue('');
    await refresh();
  }

  // ---- export ----
  function exportDateToken(): string {
    return new Date().toISOString().slice(0, 10);
  }

  function handleExport(format: 'json' | 'csv' | 'markdown'): void {
    if (!store) {
      return;
    }
    const name = `folio-${exportDateToken()}-${exportScope}`;

    if (format === 'json') {
      let target = store;
      if (exportScope === 'current') {
        const scopedItems: Record<string, FolioItem> = {};
        for (const item of displayItems) {
          scopedItems[item.id] = item;
        }
        const scopedTags = [...new Set(displayItems.flatMap((item) => item.tags))].sort();
        target = { ...store, items: scopedItems, tags: scopedTags };
      }
      downloadTextFile(`${name}.json`, toJson(target), 'application/json;charset=utf-8');
    } else if (format === 'csv') {
      downloadTextFile(`${name}.csv`, toCsv(exportItems), 'text/csv;charset=utf-8');
    } else {
      downloadTextFile(`${name}.md`, toMarkdown(exportItems), 'text/markdown;charset=utf-8');
    }
    pushNotice({ level: 'success', text: t('options.exported') });
  }

  // ---- command palette ----
  async function handlePaletteCommand(command: PaletteCommand): Promise<void> {
    setPaletteOpen(false);
    if (command === 'sync') {
      await chrome.runtime.sendMessage({ type: 'githubPushNow' });
      setSyncRefreshToken((prev) => prev + 1);
      pushNotice({ level: 'info', text: t('sync.chipSyncing') });
    } else {
      handleExport('json');
    }
  }

  function handlePaletteOpenItem(item: FolioItem): void {
    setPaletteOpen(false);
    window.open(getItemPreferredUrl(item), '_blank', 'noopener');
  }

  // ---- render ----
  const viewTitle = (() => {
    if (view === 'settings') return t('common.settings');
    if (activeTagFilter) return `${t('options.tagsSection')} · ${activeTagFilter}`;
    if (view === 'all') return t('common.all');
    return statusToLabel(view, t);
  })();

  const tags = store?.tags ?? [];

  const listEmpty = (() => {
    if (displayItems.length > 0) {
      return null;
    }
    if (search.trim()) {
      return <EmptyState variant="no-results" query={search} onClearSearch={() => setSearch('')} />;
    }
    if (activeTagFilter || view !== 'all') {
      return counts.all > 0 ? <EmptyState variant="filtered" /> : <EmptyState variant="cold" />;
    }
    return <EmptyState variant="cold" />;
  })();

  return (
    <main className="fz flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar
        view={view}
        activeTagFilter={activeTagFilter}
        counts={counts}
        tags={tags}
        tagCounts={tagCounts}
        syncStatus={syncStatus}
        onChangeView={handleChangeView}
        onSelectTag={handleSelectTag}
        onOpenSync={() => handleChangeView('settings')}
      />

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="folio-scrollbar h-full overflow-y-auto">
          <div className={`mx-auto w-full px-7 ${view === 'settings' ? 'max-w-[1040px]' : 'max-w-[880px]'}`}>
          {view === 'settings' ? (
            <>
              <div className="py-[18px] pt-[22px]">
                <div className="fz-display" style={{ fontSize: 23 }}>
                  {t('common.settings')}
                </div>
              </div>
              <div className="grid grid-cols-1 items-start gap-x-5 lg:grid-cols-2">
              <div className="min-w-0">
              <PreferencesCard
                locale={locale}
                defaultStatus={defaultStatusInput}
                optionsDefaultViewMode={optionsDefaultViewModeInput}
                optionsFixedView={optionsFixedViewInput}
                popupDefaultViewMode={popupDefaultViewModeInput}
                popupFixedView={popupFixedViewInput}
                themeMode={themeMode}
                onLocaleChange={(value) => void handleLocaleChange(value)}
                onDefaultStatusChange={(value) => void handleDefaultStatusChange(value)}
                onOptionsDefaultViewModeChange={(value) => void handleOptionsDefaultViewModeChange(value)}
                onOptionsFixedViewChange={(value) => void handleOptionsFixedViewChange(value)}
                onPopupDefaultViewModeChange={(value) => void handlePopupDefaultViewModeChange(value)}
                onPopupFixedViewChange={(value) => void handlePopupFixedViewChange(value)}
                onThemeModeChange={(mode) => void handleThemeModeChange(mode)}
              />
              <ManageTagsCard
                tags={tags}
                selectedTag={tagActionTarget}
                renameValue={tagRenameValue}
                deleteArmed={pendingDangerAction === 'deleteTag'}
                onSelectTag={(tag) => {
                  setTagActionTarget(tag);
                  if (pendingDangerAction === 'deleteTag') {
                    clearDangerAction();
                  }
                }}
                onRenameValueChange={setTagRenameValue}
                onRename={() => void handleRenameTag()}
                onDelete={() => void handleDeleteTag()}
              />
              </div>
              <div className="min-w-0">
              <LocalBackupCard
                directory={store?.settings.syncDirectory ?? null}
                lastSyncedAt={store?.settings.lastSyncedAt ?? null}
                lastSyncError={store?.settings.lastSyncError ?? null}
                isSyncing={isSyncing}
                clearArmed={pendingDangerAction === 'clearSyncDirectory'}
                onChooseDirectory={() => void handleChooseSyncDirectory()}
                onClearDirectory={() => void handleClearSyncDirectory()}
                onSyncNow={() => void handleSyncNow()}
                onImport={handleImportClick}
              />
              <GitHubCard
                refreshToken={syncRefreshToken}
                onStatusChange={setSyncStatus}
                onNotice={pushNotice}
              />
              </div>
              </div>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => void handleImportFileChange(event)}
              />
            </>
          ) : (
            <>
              <Toolbar
                title={viewTitle}
                count={displayItems.length}
                search={search}
                sortMode={sortMode}
                exportScope={exportScope}
                onSearchChange={setSearch}
                onSortChange={(mode) => void handleSortModeChange(mode)}
                onExportScopeChange={setExportScope}
                onExport={handleExport}
              />

              <div className="flex flex-col gap-0.5 pb-24">
                {displayItems.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    locale={locale}
                    search={search}
                    editing={editingId === item.id}
                    editDraft={editingId === item.id ? editDraft : null}
                    editTagInput={editTagInput}
                    deleteHoldProgress={deleteHoldItemId === item.id ? deleteHoldProgress : null}
                    onSetStatus={(id, status) => void commit({ type: 'setStatus', payload: { id, status } })}
                    onStartEdit={handleStartEdit}
                    onDeletePointerDown={startDeleteHold}
                    onDeletePointerStop={stopDeleteHold}
                    onEditDraftChange={handleEditDraftChange}
                    onEditTagInputChange={setEditTagInput}
                    onAddEditTag={handleAddEditTag}
                    onRemoveEditTag={handleRemoveEditTag}
                    onSaveEdit={() => void handleSaveEdit()}
                    onCancelEdit={closeInlineEditor}
                  />
                ))}
                {listEmpty}
              </div>
            </>
          )}
          </div>
        </div>
      </div>

      <ToastStack notice={notice} undoItems={undoItems} onUndo={() => void handleUndoDelete()} />

      {paletteOpen ? (
        <CommandPalette
          items={store ? selectAllItems(store) : []}
          syncConnected={syncStatus != null && syncStatus.state !== 'not-connected'}
          onClose={() => setPaletteOpen(false)}
          onRunCommand={(command) => void handlePaletteCommand(command)}
          onOpenItem={handlePaletteOpenItem}
        />
      ) : null}
    </main>
  );
}
