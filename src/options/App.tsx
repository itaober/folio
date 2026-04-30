import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpDown,
  FolderOpen,
  Download,
  FileJson2,
  FileSpreadsheet,
  FileText,
  Globe2,
  Info,
  Pencil,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2
} from 'lucide-react';
import { changeLanguage } from '../shared/i18n';
import { isSupportedLocale, type SupportedLocale } from '../shared/i18n/localeStore';
import {
  applyDocumentTheme,
  DEFAULT_THEME,
  FOLIO_THEME_OPTIONS,
  FOLIO_THEME_META,
  getThemeIconVariant,
  isFolioTheme,
  resolveFolioTheme,
  type FolioTheme
} from '../shared/theme';
import { FolioMark } from '../shared/ui/FolioMark';
import {
  nextStatus,
  statusBadgeClass,
  statusIcon,
  statusToLabel
} from '../shared/ui/itemStatus';
import type { NoticeLevel } from '../shared/ui/notice';
import { renderHighlightedText } from '../shared/ui/renderHighlightedText';
import { SelectField } from '../shared/ui/SelectField';
import { TagInputField } from '../shared/ui/TagInputField';
import { TextField } from '../shared/ui/TextField';
import { useAutoDismissNotice } from '../shared/ui/useAutoDismissNotice';
import { commit, getStore, importStoreFromJson, syncBackupNow } from '../core/repository';
import {
  getItemPreferredDomain,
  getItemPreferredTitle,
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
import {
  isDefaultViewMode,
  isSavedView,
  isSortMode,
  type DefaultViewMode,
  type FolioItem,
  type FolioMutation,
  type FolioStatus,
  type FolioStore,
  type SavedView
} from '../core/types';

type ViewKey = 'all' | FolioStatus | 'settings';

interface EditDraft {
  title: string;
  url: string;
  note: string;
  tags: string[];
  status: FolioStatus;
}

type ExportScope = 'current' | 'all';

interface NoticeState {
  level: NoticeLevel;
  text: string;
}

function normalizeTag(input: string): string {
  return input.trim().replace(/^#+/, '').replace(/\s+/g, ' ');
}

function formatCreatedAtLabel(timestamp: number, locale: SupportedLocale): {
  short: string;
  full: string;
} {
  const localeTag = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
  const date = new Date(timestamp);

  return {
    short: date.toLocaleDateString(localeTag, { month: 'short', day: 'numeric' }),
    full: date.toLocaleString(localeTag)
  };
}

type DangerAction = 'clearSyncDirectory' | 'deleteTag';
const DELETE_HOLD_DURATION_MS = 1200;
const exportMenuId = 'options-export-menu';

export default function App(): ReactElement {
  const { t } = useTranslation();
  const [store, setStore] = useState<FolioStore | null>(null);
  const [view, setView] = useState<ViewKey>('unread');
  const [search, setSearch] = useState('');
  const [locale, setLocale] = useState<SupportedLocale>('en');
  const [themeInput, setThemeInput] = useState<FolioTheme>(DEFAULT_THEME);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchTag, setBatchTag] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editTagInput, setEditTagInput] = useState('');
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>('current');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('saved_desc');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [tagActionTarget, setTagActionTarget] = useState('');
  const [tagRenameValue, setTagRenameValue] = useState('');
  const [defaultStatusInput, setDefaultStatusInput] = useState<'unread' | 'reading'>(
    'unread'
  );
  const [optionsDefaultViewModeInput, setOptionsDefaultViewModeInput] =
    useState<DefaultViewMode>('last');
  const [optionsFixedViewInput, setOptionsFixedViewInput] =
    useState<SavedView>('unread');
  const [popupDefaultViewModeInput, setPopupDefaultViewModeInput] =
    useState<DefaultViewMode>('last');
  const [popupFixedViewInput, setPopupFixedViewInput] =
    useState<SavedView>('unread');
  const [undoItems, setUndoItems] = useState<FolioItem[]>([]);
  const [isEditPanelExpanded, setIsEditPanelExpanded] = useState(false);
  const [pendingDangerAction, setPendingDangerAction] = useState<DangerAction | null>(null);
  const [deleteHoldItemId, setDeleteHoldItemId] = useState<string | null>(null);
  const [deleteHoldProgress, setDeleteHoldProgress] = useState(0);
  const undoTimerRef = useRef<number | null>(null);
  const dangerConfirmTimerRef = useRef<number | null>(null);
  const deleteHoldRafRef = useRef<number | null>(null);
  const deleteHoldStartRef = useRef(0);
  const deleteHoldTargetRef = useRef<FolioItem | null>(null);
  const editPanelTimerRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const initialViewResolvedRef = useRef(false);
  const optionsLastViewCommitRef = useRef(Promise.resolve());

  useAutoDismissNotice(notice, setNotice, 3000);

  useEffect(() => {
    void refresh();
    const initialSearch = new URLSearchParams(window.location.search).get(
      'search'
    );
    if (initialSearch) {
      setSearch(initialSearch);
    }

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: chrome.storage.AreaName
    ): void => {
      if (areaName !== 'local') return;
      if (!changes['folio-store']) return;
      void refresh();
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
      }
      if (dangerConfirmTimerRef.current !== null) {
        window.clearTimeout(dangerConfirmTimerRef.current);
      }
      if (deleteHoldRafRef.current !== null) {
        window.cancelAnimationFrame(deleteHoldRafRef.current);
      }
      if (editPanelTimerRef.current !== null) {
        window.clearTimeout(editPanelTimerRef.current);
      }
    };
  }, []);

  function armDangerAction(action: DangerAction): void {
    if (dangerConfirmTimerRef.current !== null) {
      window.clearTimeout(dangerConfirmTimerRef.current);
    }

    setPendingDangerAction(action);
    dangerConfirmTimerRef.current = window.setTimeout(() => {
      setPendingDangerAction(null);
      dangerConfirmTimerRef.current = null;
    }, 3000);
  }

  function clearDangerAction(): void {
    if (dangerConfirmTimerRef.current !== null) {
      window.clearTimeout(dangerConfirmTimerRef.current);
      dangerConfirmTimerRef.current = null;
    }
    setPendingDangerAction(null);
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
          void handleDelete(target);
        }
        return;
      }

      deleteHoldRafRef.current = window.requestAnimationFrame(step);
    };

    deleteHoldRafRef.current = window.requestAnimationFrame(step);
  }

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

        await commit({
          type: 'updateSettings',
          payload: {
            optionsLastView: nextView
          }
        });
      })
      .catch(() => undefined);
  }

  function showExportNotice(): void {
    setNotice({ level: 'success', text: t('options.exported') });
  }

  function closeInlineEditor(): void {
    if (editPanelTimerRef.current !== null) {
      window.clearTimeout(editPanelTimerRef.current);
    }
    setIsEditPanelExpanded(false);
    editPanelTimerRef.current = window.setTimeout(() => {
      setEditingId(null);
      setEditDraft(null);
      setEditTagInput('');
      editPanelTimerRef.current = null;
    }, 220);
  }

  function handleAddEditTag(): void {
    const normalized = normalizeTag(editTagInput);
    if (!normalized) {
      return;
    }

    setEditDraft((previous) => {
      if (!previous) {
        return previous;
      }

      const exists = previous.tags.some(
        (tag) => tag.toLowerCase() === normalized.toLowerCase()
      );
      if (exists) {
        return previous;
      }

      return {
        ...previous,
        tags: [...previous.tags, normalized]
      };
    });
    setEditTagInput('');
  }

  function handleRemoveEditTag(targetIndex: number): void {
    setEditDraft((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        tags: previous.tags.filter((_tag, index) => index !== targetIndex)
      };
    });
  }

  async function refresh(): Promise<void> {
    const nextStore = await getStore();
    const nextTheme = resolveFolioTheme(nextStore.settings.theme);
    const nextLocale = isSupportedLocale(nextStore.settings.locale)
      ? nextStore.settings.locale
      : 'en';

    setStore(nextStore);
    setLocale(nextLocale);
    setThemeInput(nextTheme);
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
    applyDocumentTheme(nextTheme);
  }

  async function handleSortModeChange(value: string): Promise<void> {
    if (!isSortMode(value)) {
      return;
    }

    if (value === sortMode) {
      return;
    }

    setSortMode(value);
    const settingsResult = await commit({
      type: 'updateSettings',
      payload: {
        sortMode: value
      }
    });

    if (!settingsResult.ok) {
      setNotice({ level: 'error', text: t('options.updateFailed') });
      await refresh();
    }
  }

  const displayItems = useMemo(() => {
    if (!store) return [];

    let items: FolioItem[] = [];

    if (search.trim()) {
      items = selectFilteredItems(store, search);
    } else if (view === 'all') {
      items = selectAllItems(store);
    } else if (view === 'settings') {
      items = [];
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
    if (!store) {
      return [];
    }

    if (exportScope === 'current') {
      return displayItems;
    }

    return sortItems(selectAllItems(store), sortMode);
  }, [displayItems, exportScope, sortMode, store]);

  async function handleSetStatus(item: FolioItem, status: FolioStatus): Promise<void> {
    const result = await commit({
      type: 'setStatus',
      payload: { id: item.id, status }
    });
    if (!result.ok) {
      setNotice({ level: 'error', text: t('options.updateFailed') });
      return;
    }
    setNotice({ level: 'success', text: t('options.updateSuccess') });
    await refresh();
  }

  async function handleDelete(item: FolioItem): Promise<void> {
    stopDeleteHold();
    const result = await commit({ type: 'deleteItem', payload: { id: item.id } });
    if (!result.ok) {
      setNotice({ level: 'error', text: t('options.deleteFailed') });
      return;
    }
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
    }
    setUndoItems([item]);
    undoTimerRef.current = window.setTimeout(() => {
      setUndoItems([]);
    }, 3000);
    setSelectedIds((previous) => previous.filter((id) => id !== item.id));
    if (editingId === item.id) {
      setEditingId(null);
      setEditDraft(null);
    }
    await refresh();
  }

  function handleDeletePointerDown(item: FolioItem): void {
    startDeleteHold(item);
  }

  function handleDeletePointerStop(): void {
    stopDeleteHold();
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
      const result = await commit({
        type: 'restoreItem',
        payload: {
          item
        }
      });

      if (result.ok) {
        successCount += 1;
      } else {
        failedCount += 1;
      }
    }

    setUndoItems([]);

    if (failedCount === 0) {
      setNotice({
        level: 'success',
        text: t('options.batchSuccess', { count: successCount })
      });
    } else if (successCount === 0) {
      setNotice({ level: 'error', text: t('options.undoFailed') });
    } else {
      setNotice({
        level: 'error',
        text: t('options.batchPartial', { ok: successCount, failed: failedCount })
      });
    }
    await refresh();
  }

  async function handleLocaleChange(value: string): Promise<void> {
    if (!isSupportedLocale(value)) {
      return;
    }

    if (value === locale) {
      return;
    }

    const localeResult = await commit({
      type: 'setLocale',
      payload: { locale: value }
    });

    if (!localeResult.ok) {
      setNotice({ level: 'error', text: t('options.updateFailed') });
      await refresh();
      return;
    }

    await changeLanguage(value);
    setLocale(value);
    await refresh();
  }

  async function handleThemeChange(value: string): Promise<void> {
    if (!isFolioTheme(value)) {
      return;
    }

    if (value === themeInput) {
      return;
    }

    setThemeInput(value);
    applyDocumentTheme(value);

    const settingsResult = await commit({
      type: 'updateSettings',
      payload: {
        theme: value
      }
    });

    if (!settingsResult.ok) {
      setNotice({ level: 'error', text: t('options.updateFailed') });
      await refresh();
      return;
    }

    await refresh();
  }

  async function handleDefaultStatusChange(value: string): Promise<void> {
    if (value !== 'unread' && value !== 'reading') {
      return;
    }

    if (value === defaultStatusInput) {
      return;
    }

    setDefaultStatusInput(value);

    const settingsResult = await commit({
      type: 'updateSettings',
      payload: {
        defaultStatus: value
      }
    });

    if (!settingsResult.ok) {
      setNotice({ level: 'error', text: t('options.updateFailed') });
      await refresh();
      return;
    }

    await refresh();
  }

  async function handleOptionsDefaultViewModeChange(value: string): Promise<void> {
    if (!isDefaultViewMode(value) || value === optionsDefaultViewModeInput) {
      return;
    }

    setOptionsDefaultViewModeInput(value);
    const result = await commit({
      type: 'updateSettings',
      payload: {
        optionsDefaultViewMode: value
      }
    });

    if (!result.ok) {
      setNotice({ level: 'error', text: t('options.updateFailed') });
      await refresh();
    }
  }

  async function handleOptionsFixedViewChange(value: string): Promise<void> {
    if (!isSavedView(value) || value === optionsFixedViewInput) {
      return;
    }

    setOptionsFixedViewInput(value);
    const result = await commit({
      type: 'updateSettings',
      payload: {
        optionsFixedView: value
      }
    });

    if (!result.ok) {
      setNotice({ level: 'error', text: t('options.updateFailed') });
      await refresh();
    }
  }

  async function handlePopupDefaultViewModeChange(value: string): Promise<void> {
    if (!isDefaultViewMode(value) || value === popupDefaultViewModeInput) {
      return;
    }

    setPopupDefaultViewModeInput(value);
    const result = await commit({
      type: 'updateSettings',
      payload: {
        popupDefaultViewMode: value
      }
    });

    if (!result.ok) {
      setNotice({ level: 'error', text: t('options.updateFailed') });
      await refresh();
    }
  }

  async function handlePopupFixedViewChange(value: string): Promise<void> {
    if (!isSavedView(value) || value === popupFixedViewInput) {
      return;
    }

    setPopupFixedViewInput(value);
    const result = await commit({
      type: 'updateSettings',
      payload: {
        popupFixedView: value
      }
    });

    if (!result.ok) {
      setNotice({ level: 'error', text: t('options.updateFailed') });
      await refresh();
    }
  }

  async function handleChooseSyncDirectory(): Promise<void> {
    const showDirectoryPicker = (
      window as Window & {
        showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker;

    if (typeof showDirectoryPicker !== 'function') {
      setNotice({ level: 'error', text: t('settings.syncUnavailable') });
      return;
    }

    try {
      const handle = await showDirectoryPicker();
      await saveBackupDirectoryHandle(handle);

      await commit({
        type: 'setSyncDirectory',
        payload: {
          name: handle.name
        }
      });

      await handleSyncNow();
      await refresh();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      const text = error instanceof Error ? error.message : 'unknown_error';
      setNotice({
        level: 'error',
        text: t('settings.syncFailed', { error: text })
      });
    }
  }

  async function handleClearSyncDirectory(): Promise<void> {
    await clearBackupDirectoryHandle();
    await commit({
      type: 'setSyncDirectory',
      payload: {
        name: null
      }
    });
    await refresh();
  }

  async function handleDangerClearSyncDirectory(): Promise<void> {
    if (pendingDangerAction !== 'clearSyncDirectory') {
      armDangerAction('clearSyncDirectory');
      return;
    }

    clearDangerAction();
    await handleClearSyncDirectory();
  }

  async function handleSyncNow(): Promise<void> {
    setIsSyncing(true);
    try {
      const result = await syncBackupNow();
      if (result.ok) {
        setNotice({ level: 'success', text: t('settings.syncSuccess') });
      } else {
        setNotice({
          level: 'error',
          text: t('settings.syncFailed', {
            error: result.error ?? 'unknown_error'
          })
        });
      }
      await refresh();
    } finally {
      setIsSyncing(false);
    }
  }

  function handleImportClick(): void {
    importInputRef.current?.click();
  }

  async function handleImportFileChange(
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
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
        setNotice({
          level: 'error',
          text: t('settings.importFailed', { error: result.error ?? 'unknown_error' })
        });
        return;
      }

      await changeLanguage(result.store.settings.locale);
      setLocale(result.store.settings.locale);
      setNotice({
        level: 'success',
        text: t('settings.importSuccess', {
          count: Object.keys(result.store.items).length
        })
      });
      setView('all');
      setSearch('');
      setActiveTagFilter(null);
      setSelectedIds([]);
      setEditingId(null);
      setEditDraft(null);
      await refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'invalid_json';
      setNotice({
        level: 'error',
        text: t('settings.importFailed', { error: text })
      });
    }
  }

  async function handleRenameTag(): Promise<void> {
    if (!store || !tagActionTarget) {
      return;
    }

    const newTag = tagRenameValue.trim();
    if (!newTag) {
      return;
    }

    let successCount = 0;
    let failedCount = 0;

    for (const item of Object.values(store.items)) {
      if (!item.tags.includes(tagActionTarget)) {
        continue;
      }

      const nextTags = item.tags.map((tag) =>
        tag === tagActionTarget ? newTag : tag
      );

      const result = await commit({
        type: 'updateItem',
        payload: {
          id: item.id,
          tags: [...new Set(nextTags)]
        }
      });

      if (result.ok) {
        successCount += 1;
      } else {
        failedCount += 1;
      }
    }

    if (failedCount === 0) {
      setNotice({
        level: 'success',
        text: t('options.batchSuccess', { count: successCount })
      });
    } else {
      setNotice({
        level: 'error',
        text: t('options.batchPartial', { ok: successCount, failed: failedCount })
      });
    }
    setTagActionTarget('');
    setTagRenameValue('');
    setActiveTagFilter(null);
    await refresh();
  }

  async function handleDeleteTag(): Promise<void> {
    if (!store || !tagActionTarget) {
      return;
    }

    let successCount = 0;
    let failedCount = 0;

    for (const item of Object.values(store.items)) {
      if (!item.tags.includes(tagActionTarget)) {
        continue;
      }

      const nextTags = item.tags.filter((tag) => tag !== tagActionTarget);
      const result = await commit({
        type: 'updateItem',
        payload: {
          id: item.id,
          tags: nextTags
        }
      });

      if (result.ok) {
        successCount += 1;
      } else {
        failedCount += 1;
      }
    }

    if (failedCount === 0) {
      setNotice({
        level: 'success',
        text: t('options.batchSuccess', { count: successCount })
      });
    } else {
      setNotice({
        level: 'error',
        text: t('options.batchPartial', { ok: successCount, failed: failedCount })
      });
    }
    setTagActionTarget('');
    setTagRenameValue('');
    if (activeTagFilter === tagActionTarget) {
      setActiveTagFilter(null);
    }
    await refresh();
  }

  async function handleDangerDeleteTag(): Promise<void> {
    if (pendingDangerAction !== 'deleteTag') {
      armDangerAction('deleteTag');
      return;
    }

    clearDangerAction();
    await handleDeleteTag();
  }

  function handleToggleSelect(id: string): void {
    setSelectedIds((previous) => {
      if (previous.includes(id)) {
        return previous.filter((entry) => entry !== id);
      }
      return [...previous, id];
    });
  }

  function handleSelectAllCurrent(): void {
    const allVisibleIds = displayItems.map((item) => item.id);
    const allSelected = allVisibleIds.every((id) => selectedIds.includes(id));

    if (allSelected) {
      setSelectedIds((previous) => previous.filter((id) => !allVisibleIds.includes(id)));
      return;
    }

    setSelectedIds((previous) => [...new Set([...previous, ...allVisibleIds])]);
  }

  async function runBatchMutation(createMutation: (item: FolioItem) => FolioMutation | null): Promise<void> {
    if (!store || selectedIds.length === 0) {
      return;
    }

    let successCount = 0;
    let failedCount = 0;

    for (const id of selectedIds) {
      const item = store.items[id];
      if (!item) {
        failedCount += 1;
        continue;
      }

      const mutation = createMutation(item);
      if (!mutation) {
        failedCount += 1;
        continue;
      }

      const result = await commit(mutation);
      if (result.ok) {
        successCount += 1;
      } else {
        failedCount += 1;
      }
    }

    if (failedCount === 0) {
      setNotice({
        level: 'success',
        text: t('options.batchSuccess', { count: successCount })
      });
    } else {
      setNotice({
        level: 'error',
        text: t('options.batchPartial', { ok: successCount, failed: failedCount })
      });
    }
    setSelectedIds([]);
    await refresh();
  }

  async function handleBatchSetStatus(status: FolioStatus): Promise<void> {
    await runBatchMutation((item) => ({ type: 'setStatus', payload: { id: item.id, status } }));
  }

  async function handleBatchDelete(): Promise<void> {
    if (!store || selectedIds.length === 0) {
      return;
    }

    let successCount = 0;
    let failedCount = 0;
    const deletedItems: FolioItem[] = [];

    for (const id of selectedIds) {
      const item = store.items[id];
      if (!item) {
        failedCount += 1;
        continue;
      }

      const result = await commit({ type: 'deleteItem', payload: { id: item.id } });
      if (result.ok) {
        successCount += 1;
        deletedItems.push(item);
      } else {
        failedCount += 1;
      }
    }

    if (deletedItems.length > 0) {
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
      }
      setUndoItems(deletedItems);
      undoTimerRef.current = window.setTimeout(() => {
        setUndoItems([]);
      }, 3000);
    }

    if (failedCount === 0) {
      setNotice({
        level: 'success',
        text: t('options.batchSuccess', { count: successCount })
      });
    } else {
      setNotice({
        level: 'error',
        text: t('options.batchPartial', { ok: successCount, failed: failedCount })
      });
    }

    setSelectedIds([]);
    if (editingId && deletedItems.some((item) => item.id === editingId)) {
      setEditingId(null);
      setEditDraft(null);
    }
    await refresh();
  }

  async function handleBatchApplyTag(): Promise<void> {
    const tag = batchTag.trim();
    if (!tag) {
      return;
    }

    await runBatchMutation((item) => ({
      type: 'updateItem',
      payload: {
        id: item.id,
        tags: [...new Set([...item.tags, tag])]
      }
    }));

    setBatchTag('');
  }

  function exportDateToken(): string {
    return new Date().toISOString().slice(0, 10);
  }

  function exportScopeToken(): string {
    return exportScope === 'all' ? 'all' : 'current';
  }

  function handleExportJson(): void {
    if (!store) {
      return;
    }

    if (exportScope === 'all') {
      downloadTextFile(
        `folio-${exportDateToken()}-${exportScopeToken()}.json`,
        toJson(store),
        'application/json;charset=utf-8'
      );
      setIsExportMenuOpen(false);
      showExportNotice();
      return;
    }

    const scopedItems: Record<string, FolioItem> = {};
    for (const item of displayItems) {
      scopedItems[item.id] = item;
    }

    const scopedTags = [...new Set(displayItems.flatMap((item) => item.tags))].sort();
    const scopedStore: FolioStore = {
      ...store,
      items: scopedItems,
      tags: scopedTags
    };

    downloadTextFile(
      `folio-${exportDateToken()}-${exportScopeToken()}.json`,
      toJson(scopedStore),
      'application/json;charset=utf-8'
    );
    setIsExportMenuOpen(false);
    showExportNotice();
  }

  function handleExportCsv(): void {
    downloadTextFile(
      `folio-${exportDateToken()}-${exportScopeToken()}.csv`,
      toCsv(exportItems),
      'text/csv;charset=utf-8'
    );
    setIsExportMenuOpen(false);
    showExportNotice();
  }

  function handleExportMarkdown(): void {
    downloadTextFile(
      `folio-${exportDateToken()}-${exportScopeToken()}.md`,
      toMarkdown(exportItems),
      'text/markdown;charset=utf-8'
    );
    setIsExportMenuOpen(false);
    showExportNotice();
  }

  function handleExportMenuKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') {
      setIsExportMenuOpen(false);
    }
  }

  function handleStartEdit(item: FolioItem): void {
    if (editingId === item.id && isEditPanelExpanded) {
      closeInlineEditor();
      return;
    }

    if (editPanelTimerRef.current !== null) {
      window.clearTimeout(editPanelTimerRef.current);
      editPanelTimerRef.current = null;
    }
    setIsEditPanelExpanded(false);
    setEditingId(item.id);
    setEditDraft({
      title: item.title,
      url: item.url,
      note: item.note,
      tags: [...item.tags],
      status: item.status
    });
    setEditTagInput('');
    window.requestAnimationFrame(() => {
      setIsEditPanelExpanded(true);
    });
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
      setNotice({ level: 'error', text: t('options.updateFailed') });
      return;
    }

    setNotice({ level: 'success', text: t('options.updateSuccess') });
    closeInlineEditor();
    await refresh();
  }

  function navItemClass(active: boolean): string {
    if (active) {
      return 'folio-pressable group relative flex h-9 w-full items-center justify-between rounded-lg border border-(--border) bg-bg-surface px-2.5 text-accent shadow-[0_1px_2px_var(--shadow-soft)]';
    }
    return 'folio-pressable group relative flex h-9 w-full items-center justify-between rounded-lg border border-transparent bg-transparent px-2.5 text-text-secondary hover:border-(--border) hover:bg-bg-surface hover:text-text-primary';
  }

  function navIconClass(active: boolean): string {
    if (active) {
      return 'text-accent';
    }
    return 'text-text-muted group-hover:text-text-secondary';
  }

  function navCountClass(active: boolean): string {
    return `min-w-6 text-right font-mono text-[11px] leading-none tabular-nums ${
      active ? 'text-accent' : 'text-text-muted'
    }`;
  }

  function getViewTitle(): string {
    if (view === 'settings') {
      return t('common.settings');
    }
    if (activeTagFilter) {
      return `${t('options.tagsSection')} · ${activeTagFilter}`;
    }
    if (view === 'all') {
      return t('common.all');
    }
    return statusToLabel(view, t);
  }

  function optionsToastClass(level: NoticeLevel): string {
    if (level === 'error') {
      return 'border border-[#d07a4f]/55 bg-black/68 text-white';
    }
    return 'border border-white/15 bg-black/62 text-white';
  }

  const iconVariantInput = getThemeIconVariant(themeInput);

  return (
    <main className="min-h-screen bg-bg-base text-text-primary">
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 w-max max-w-[min(92vw,560px)] -translate-x-1/2 space-y-2">
        {notice ? (
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={`folio-panel pointer-events-auto m-0 rounded-lg px-4 py-2.5 text-xs shadow-[0_12px_28px_rgba(0,0,0,0.24)] backdrop-blur-[2px] ${optionsToastClass(notice.level)}`}
          >
            {notice.text}
          </p>
        ) : null}
        {undoItems.length > 0 ? (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="folio-panel pointer-events-auto flex items-center gap-2 rounded-lg border border-white/15 bg-black/62 px-4 py-2.5 text-xs text-white shadow-[0_12px_28px_rgba(0,0,0,0.24)] backdrop-blur-[2px]"
          >
            <span>
              {undoItems.length > 1
                ? t('options.removedUndoCount', { count: undoItems.length })
                : t('options.removedUndo')}
            </span>
            <button
              type="button"
              className="folio-pressable text-xs text-white/90 underline underline-offset-2 hover:text-white"
              onClick={() => void handleUndoDelete()}
            >
              {t('options.undo')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-screen w-full">
        <aside className="sticky top-0 h-screen w-60 shrink-0 self-start border-r border-(--border) bg-bg-elevated px-3 py-4">
          <div className="flex items-center gap-2 px-2">
            <FolioMark variant={iconVariantInput} size={30} className="h-[30px] w-[30px]" />
            <div>
              <h1 className="m-0 font-display text-[28px] leading-[28px] font-semibold">Folio</h1>
              <p className="m-0 mt-0.5 font-mono text-[11px] tracking-wide text-text-muted">
                {t('options.readingList')}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <nav className="space-y-1">
              <button type="button" className={navItemClass(view === 'unread')} onClick={() => handleChangeView('unread')}>
                <span className="flex min-w-0 items-center gap-2">
                  <svg viewBox="0 0 24 24" className={`h-[15px] w-[15px] shrink-0 ${navIconClass(view === 'unread')}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="8.5" />
                    <path d="M12 7.5v5l3.3 1.9" />
                  </svg>
                  <span className={`whitespace-nowrap text-[13px] leading-none ${view === 'unread' ? 'font-medium' : ''}`}>{t('common.unread')}</span>
                </span>
                <span className={navCountClass(view === 'unread')}>{counts.unread}</span>
              </button>

              <button type="button" className={navItemClass(view === 'reading')} onClick={() => handleChangeView('reading')}>
                <span className="flex min-w-0 items-center gap-2">
                  <svg viewBox="0 0 24 24" className={`h-[15px] w-[15px] shrink-0 ${navIconClass(view === 'reading')}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6.5c2.6 0 4.2.6 6 1.9 1.8-1.3 3.4-1.9 6-1.9h3v12h-3c-2.6 0-4.2.6-6 1.9-1.8-1.3-3.4-1.9-6-1.9H1v-12Z" />
                    <path d="M10 8.4v12" />
                  </svg>
                  <span className={`whitespace-nowrap text-[13px] leading-none ${view === 'reading' ? 'font-medium' : ''}`}>{t('common.reading')}</span>
                </span>
                <span className={navCountClass(view === 'reading')}>{counts.reading}</span>
              </button>

              <button type="button" className={navItemClass(view === 'done')} onClick={() => handleChangeView('done')}>
                <span className="flex min-w-0 items-center gap-2">
                  <svg viewBox="0 0 24 24" className={`h-[15px] w-[15px] shrink-0 ${navIconClass(view === 'done')}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5.5 12.3 4.1 4.1 8.9-8.9" />
                  </svg>
                  <span className={`whitespace-nowrap text-[13px] leading-none ${view === 'done' ? 'font-medium' : ''}`}>{t('common.done')}</span>
                </span>
                <span className={navCountClass(view === 'done')}>{counts.done}</span>
              </button>

              <button type="button" className={navItemClass(view === 'all')} onClick={() => handleChangeView('all')}>
                <span className="flex min-w-0 items-center gap-2">
                  <svg viewBox="0 0 24 24" className={`h-[15px] w-[15px] shrink-0 ${navIconClass(view === 'all')}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 10.5 12 3l9 7.5" />
                    <path d="M6 9.5V20h12V9.5" />
                  </svg>
                  <span className={`whitespace-nowrap text-[13px] leading-none ${view === 'all' ? 'font-medium' : ''}`}>{t('common.all')}</span>
                </span>
                <span className={navCountClass(view === 'all')}>{counts.all}</span>
              </button>
            </nav>

            <div className="h-px bg-(--border)" />

            <div>
              <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-wide text-text-muted">
                {t('options.tagsSection')}
              </p>
              <div className="space-y-1">
                {(store?.tags ?? []).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={navItemClass(activeTagFilter === tag)}
                    onClick={() => {
                      handleChangeView('all');
                      setActiveTagFilter(tag);
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <svg viewBox="0 0 24 24" className={`h-[15px] w-[15px] shrink-0 ${navIconClass(activeTagFilter === tag)}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m20 12.5-7.5 7.5a2 2 0 0 1-2.8 0L2.5 12.8a2 2 0 0 1 0-2.8L10 2.5A2 2 0 0 1 11.4 2h7.8A2.8 2.8 0 0 1 22 4.8v7.8a2 2 0 0 1-.6 1.4Z" />
                        <circle cx="16.2" cy="7.8" r="1.2" />
                      </svg>
                      <span className={`truncate text-[13px] leading-none ${activeTagFilter === tag ? 'font-medium' : ''}`}>{tag}</span>
                    </span>
                    <span className={navCountClass(activeTagFilter === tag)}>{tagCounts[tag] ?? 0}</span>
                  </button>
                ))}
                {(store?.tags ?? []).length === 0 ? (
                  <p className="m-0 px-2 py-1 text-[11px] text-text-muted">{t('options.tagsEmpty')}</p>
                ) : null}
                {activeTagFilter ? (
                  <button
                    type="button"
                    className="folio-pressable h-8 w-full rounded-lg border border-transparent px-2.5 text-left text-[11px] text-text-muted hover:border-(--border) hover:bg-bg-surface hover:text-text-secondary"
                    onClick={() => setActiveTagFilter(null)}
                  >
                    {t('options.clearTagFilter')}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-auto pt-4">
            <div className="mb-2 h-px bg-(--border)" />
              <button
              type="button"
              className={navItemClass(view === 'settings')}
              onClick={() => handleChangeView('settings')}
            >
              <span className="flex min-w-0 items-center gap-2">
                <svg viewBox="0 0 24 24" className={`h-[15px] w-[15px] shrink-0 ${navIconClass(view === 'settings')}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 2h4l.7 2.2c.5.1 1 .3 1.5.6l2.1-1 2.8 2.8-1 2.1c.3.5.5 1 .6 1.5L23 10v4l-2.2.7c-.1.5-.3 1-.6 1.5l1 2.1-2.8 2.8-2.1-1c-.5.3-1 .5-1.5.6L14 23h-4l-.7-2.2c-.5-.1-1-.3-1.5-.6l-2.1 1-2.8-2.8 1-2.1c-.3-.5-.5-1-.6-1.5L1 14v-4l2.2-.7c.1-.5.3-1 .6-1.5l-1-2.1L5.6 3l2.1 1c.5-.3 1-.5 1.5-.6L10 2Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span className={`whitespace-nowrap text-[13px] leading-none ${view === 'settings' ? 'font-medium' : ''}`}>{t('common.settings')}</span>
              </span>
              <span className="min-w-6" />
            </button>
          </div>
        </aside>

        <section className="flex h-screen min-h-0 flex-1 flex-col p-6">
          <div className="flex h-full min-h-0 w-full flex-col">
          <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="m-0 font-display text-3xl font-semibold">{getViewTitle()}</h2>
              {view !== 'settings' ? (
                <p className="m-0 font-mono text-sm text-text-muted">
                  {t('options.totalCount', { count: displayItems.length })}
                </p>
              ) : null}
            </div>

            {view !== 'settings' ? (
              <div className="flex flex-wrap items-center gap-2">
                <TextField
                  id="options-search"
                  aria-label={t('options.searchPlaceholder')}
                  className="h-10 w-[min(40vw,392px)] min-w-[220px]"
                  leftIcon={<Search className="h-4 w-4" strokeWidth={1.9} />}
                  placeholder={t('options.searchPlaceholder')}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <SelectField
                  id="options-sort"
                  aria-label={t('options.sortLabel')}
                  className="h-10 text-xs"
                  wrapperClassName="w-[min(22vw,180px)] min-w-[140px]"
                  leftIcon={<ArrowUpDown className="h-4 w-4" strokeWidth={1.9} />}
                  value={sortMode}
                  onChange={(event) => void handleSortModeChange(event.target.value)}
                >
                    <option value="saved_desc">{t('options.sortNewest')}</option>
                    <option value="saved_asc">{t('options.sortOldest')}</option>
                    <option value="domain_asc">{t('options.sortDomain')}</option>
                    <option value="title_asc">{t('options.sortTitle')}</option>
                    <option value="status">{t('options.sortStatus')}</option>
                </SelectField>

                <div className="relative">
                  <button
                    type="button"
                    className="folio-pressable inline-flex h-10 items-center gap-1.5 rounded-md border border-(--border) bg-bg-surface px-3 text-xs text-text-secondary hover:border-(--accent-border) hover:bg-bg-elevated hover:text-text-primary"
                    onClick={() => setIsExportMenuOpen((prev) => !prev)}
                    onKeyDown={handleExportMenuKeyDown}
                    aria-haspopup="menu"
                    aria-expanded={isExportMenuOpen}
                    aria-controls={isExportMenuOpen ? exportMenuId : undefined}
                  >
                    <Download className="h-4 w-4" strokeWidth={1.9} />
                    {t('options.export')}
                  </button>
                  {isExportMenuOpen ? (
                    <div
                      id={exportMenuId}
                      role="menu"
                      onKeyDown={handleExportMenuKeyDown}
                      className="folio-menu absolute right-0 z-20 mt-2 w-44 rounded-lg border border-(--border) bg-bg-surface p-2 shadow-[0_12px_32px_var(--shadow-soft)]"
                    >
                      <p className="m-0 mb-1 px-2 text-[11px] text-text-muted">{t('options.exportScope')}</p>
                      <div className="mb-2 flex gap-1">
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={exportScope === 'current'}
                          className={
                            exportScope === 'current'
                              ? 'folio-pressable flex-1 rounded-md bg-bg-base px-2 py-1 text-[11px] text-text-primary shadow-[0_1px_2px_var(--shadow-soft)]'
                              : 'folio-pressable flex-1 rounded-md px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                          }
                          onClick={() => setExportScope('current')}
                        >
                          {t('options.exportScopeCurrent')}
                        </button>
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={exportScope === 'all'}
                          className={
                            exportScope === 'all'
                              ? 'folio-pressable flex-1 rounded-md bg-bg-base px-2 py-1 text-[11px] text-text-primary shadow-[0_1px_2px_var(--shadow-soft)]'
                              : 'folio-pressable flex-1 rounded-md px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                          }
                          onClick={() => setExportScope('all')}
                        >
                          {t('options.exportScopeAll')}
                        </button>
                      </div>
                      <button type="button" role="menuitem" className="folio-pressable flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary" onClick={handleExportJson}>
                        <FileJson2 className="h-3.5 w-3.5 text-text-muted" strokeWidth={2} />
                        <span>{t('options.exportJson')}</span>
                      </button>
                      <button type="button" role="menuitem" className="folio-pressable flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary" onClick={handleExportCsv}>
                        <FileSpreadsheet className="h-3.5 w-3.5 text-text-muted" strokeWidth={2} />
                        <span>{t('options.exportCsv')}</span>
                      </button>
                      <button type="button" role="menuitem" className="folio-pressable flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary" onClick={handleExportMarkdown}>
                        <FileText className="h-3.5 w-3.5 text-text-muted" strokeWidth={2} />
                        <span>{t('options.exportMarkdown')}</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </header>

          {view === 'settings' ? (
            <div className="folio-scrollbar min-h-0 flex-1 overflow-y-auto pr-5">
              <section className="max-w-[1280px] space-y-4">
              <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <div className="space-y-4">
                  <article className="rounded-lg border border-(--border) bg-bg-surface p-5 shadow-[0_1px_2px_var(--shadow-soft)]">
                    <h3 className="m-0 flex items-center gap-2 text-base font-medium">
                      <SlidersHorizontal className="h-4 w-4 text-accent" strokeWidth={1.9} />
                      {t('settings.preferencesTitle')}
                    </h3>
                    <p className="m-0 mt-1.5 text-xs leading-5 text-text-secondary">
                      {t('settings.preferencesHint')}
                    </p>

                    <div className="mt-4 space-y-4">
                      <div className="space-y-2">
                        <label htmlFor="settings-language" className="text-xs text-text-secondary">
                          {t('settings.language')}
                        </label>
                        <SelectField
                          id="settings-language"
                          leftIcon={<Globe2 className="h-4 w-4" strokeWidth={1.9} />}
                          value={locale}
                          onChange={(event) => void handleLocaleChange(event.target.value)}
                        >
                          <option value="en">{t('settings.english')}</option>
                          <option value="zh-CN">{t('settings.zhCN')}</option>
                        </SelectField>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="settings-theme" className="text-xs text-text-secondary">
                          {t('settings.theme')}
                        </label>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-(--border) bg-bg-elevated">
                            <FolioMark variant={iconVariantInput} size={18} />
                          </span>
                          <SelectField
                            id="settings-theme"
                            wrapperClassName="flex-1"
                            className="text-sm"
                            value={themeInput}
                            onChange={(event) => void handleThemeChange(event.target.value)}
                          >
                            {FOLIO_THEME_OPTIONS.map((themeId) => (
                              <option key={themeId} value={themeId}>
                                {t(FOLIO_THEME_META[themeId].labelKey)}
                              </option>
                            ))}
                          </SelectField>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="settings-default-status" className="text-xs text-text-secondary">
                          {t('options.defaultStatusHint')}
                        </label>
                        <SelectField
                          id="settings-default-status"
                          className="text-sm"
                          value={defaultStatusInput}
                          onChange={(event) => void handleDefaultStatusChange(event.target.value)}
                        >
                          <option value="unread">{t('common.unread')}</option>
                          <option value="reading">{t('common.reading')}</option>
                        </SelectField>
                      </div>

                      <div className="space-y-2">
                        <p className="m-0 text-xs text-text-secondary">
                          {t('settings.optionsDefaultView')}
                        </p>
                        <p className="m-0 text-[11px] leading-5 text-text-muted">
                          {t('settings.optionsDefaultViewHint')}
                        </p>
                        <SelectField
                          id="settings-options-default-view-mode"
                          className="text-sm"
                          value={optionsDefaultViewModeInput}
                          onChange={(event) =>
                            void handleOptionsDefaultViewModeChange(event.target.value)
                          }
                        >
                          <option value="last">{t('settings.rememberLastView')}</option>
                          <option value="fixed">{t('settings.fixedViewMode')}</option>
                        </SelectField>
                        {optionsDefaultViewModeInput === 'fixed' ? (
                          <SelectField
                            id="settings-options-fixed-view"
                            className="text-sm"
                            value={optionsFixedViewInput}
                            onChange={(event) =>
                              void handleOptionsFixedViewChange(event.target.value)
                            }
                          >
                            <option value="unread">{t('common.unread')}</option>
                            <option value="reading">{t('common.reading')}</option>
                            <option value="done">{t('common.done')}</option>
                            <option value="all">{t('common.all')}</option>
                          </SelectField>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <p className="m-0 text-xs text-text-secondary">
                          {t('settings.popupDefaultView')}
                        </p>
                        <p className="m-0 text-[11px] leading-5 text-text-muted">
                          {t('settings.popupDefaultViewHint')}
                        </p>
                        <SelectField
                          id="settings-popup-default-view-mode"
                          className="text-sm"
                          value={popupDefaultViewModeInput}
                          onChange={(event) =>
                            void handlePopupDefaultViewModeChange(event.target.value)
                          }
                        >
                          <option value="last">{t('settings.rememberLastView')}</option>
                          <option value="fixed">{t('settings.fixedViewMode')}</option>
                        </SelectField>
                        {popupDefaultViewModeInput === 'fixed' ? (
                          <SelectField
                            id="settings-popup-fixed-view"
                            className="text-sm"
                            value={popupFixedViewInput}
                            onChange={(event) =>
                              void handlePopupFixedViewChange(event.target.value)
                            }
                          >
                            <option value="unread">{t('common.unread')}</option>
                            <option value="reading">{t('common.reading')}</option>
                            <option value="done">{t('common.done')}</option>
                            <option value="all">{t('common.all')}</option>
                          </SelectField>
                        ) : null}
                      </div>
                    </div>
                  </article>

                  <article className="rounded-lg border border-(--border) bg-bg-surface p-5 shadow-[0_1px_2px_var(--shadow-soft)]">
                    <h3 className="m-0 flex items-center gap-2 text-base font-medium">
                      <Tag className="h-4 w-4 text-accent" strokeWidth={1.9} />
                      {t('options.tagManagerTitle')}
                    </h3>
                    <p className="m-0 mt-1.5 text-xs leading-5 text-text-secondary">
                      {t('options.tagManagerHint')}
                    </p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                      <label htmlFor="tag-action-target" className="sr-only">
                        {t('options.tagManagerTitle')}
                      </label>
                      <SelectField
                        id="tag-action-target"
                        aria-label={t('options.tagManagerTitle')}
                        value={tagActionTarget}
                        onChange={(event) => {
                          setTagActionTarget(event.target.value);
                          if (pendingDangerAction === 'deleteTag') {
                            clearDangerAction();
                          }
                        }}
                      >
                        <option value="">-</option>
                        {(store?.tags ?? []).map((tag) => (
                          <option key={tag} value={tag}>
                            {tag}
                          </option>
                        ))}
                      </SelectField>
                      <label htmlFor="tag-rename-value" className="sr-only">
                        {t('options.tagNewName')}
                      </label>
                      <input
                        id="tag-rename-value"
                        aria-label={t('options.tagNewName')}
                        className="folio-input"
                        value={tagRenameValue}
                        onChange={(event) => setTagRenameValue(event.target.value)}
                        placeholder={t('options.tagNewName')}
                      />
                      <button
                        type="button"
                        className="folio-pressable h-9 rounded-md bg-bg-elevated px-3 text-xs text-text-secondary hover:bg-bg-sunken hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-55"
                        onClick={() => void handleRenameTag()}
                        disabled={!tagActionTarget || !tagRenameValue.trim()}
                      >
                        {t('options.renameTag')}
                      </button>
                      <button
                        type="button"
                        className="folio-pressable h-9 rounded-md bg-bg-elevated px-3 text-xs text-danger hover:bg-bg-sunken disabled:cursor-not-allowed disabled:opacity-55"
                        onClick={() => void handleDangerDeleteTag()}
                        disabled={!tagActionTarget}
                      >
                        {pendingDangerAction === 'deleteTag'
                          ? t('options.deleteTagConfirm')
                          : t('options.deleteTag')}
                      </button>
                    </div>
                  </article>
                </div>

                <article className="rounded-lg border border-(--border) bg-bg-surface p-5 shadow-[0_1px_2px_var(--shadow-soft)]">
                  <div>
                    <h3 className="m-0 flex items-center gap-2 text-base font-medium">
                      <FolderOpen className="h-4 w-4 text-accent" strokeWidth={1.9} />
                      {t('settings.dataAndBackupTitle')}
                    </h3>
                    <p className="m-0 mt-1.5 text-xs leading-5 text-text-secondary">
                      {t('settings.dataAndBackupHint')}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="folio-pressable mt-4 flex h-[170px] w-full flex-col items-center justify-center gap-2.5 rounded-lg border border-(--accent-border) bg-accent-subtle px-4 text-center hover:bg-bg-elevated hover:shadow-[0_4px_14px_var(--shadow-soft)]"
                    onClick={() => void handleChooseSyncDirectory()}
                  >
                    <FolderOpen className="h-8 w-8 text-accent" strokeWidth={1.9} />
                    <span className="text-sm font-medium text-text-primary">
                      {store?.settings.syncDirectory
                        ? t('settings.changeDirectory')
                        : t('settings.chooseDirectory')}
                    </span>
                    <span className="max-w-[90%] truncate font-mono text-xs text-text-secondary">
                      {store?.settings.syncDirectory ?? t('settings.notConfigured')}
                    </span>
                  </button>

                  <div className="mt-4 space-y-1.5">
                    <p className="m-0 flex items-start gap-1.5 text-xs leading-5 text-text-muted">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
                      <span>{t('settings.syncDirectoryHelpPrimary')}</span>
                    </p>
                    <p className="m-0 flex items-start gap-1.5 text-xs leading-5 text-text-muted">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
                      <span>{t('settings.syncDirectoryHelpSecondary')}</span>
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="folio-pressable h-9 rounded-md bg-bg-elevated px-3 text-xs text-text-secondary hover:bg-bg-sunken hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-55"
                      onClick={() => void handleDangerClearSyncDirectory()}
                      disabled={!store?.settings.syncDirectory}
                    >
                      {pendingDangerAction === 'clearSyncDirectory'
                        ? t('settings.clearDirectoryConfirm')
                        : t('settings.clearDirectory')}
                    </button>
                    <button
                      type="button"
                      className="folio-pressable h-9 rounded-md bg-accent px-3 text-xs text-on-accent shadow-[0_1px_2px_var(--shadow-soft)] hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-55"
                      onClick={() => void handleSyncNow()}
                      disabled={!store?.settings.syncDirectory || isSyncing}
                    >
                      {isSyncing ? '...' : t('settings.syncNow')}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-1.5">
                    <p className="m-0 text-xs text-text-muted">
                      {t('settings.lastSyncedAt')}:&nbsp;
                      {store?.settings.lastSyncedAt
                        ? new Date(store.settings.lastSyncedAt).toLocaleString(
                            locale === 'zh-CN' ? 'zh-CN' : 'en-US'
                          )
                        : '-'}
                    </p>
                    <p className="m-0 text-xs text-text-muted">
                      {t('settings.lastSyncError')}:&nbsp;
                      {store?.settings.lastSyncError ?? '-'}
                    </p>
                  </div>

                  <div className="my-4 h-px bg-(--border)" />

                  <div className="space-y-2">
                    <p className="m-0 text-sm text-text-secondary">{t('settings.importTitle')}</p>
                    <p className="m-0 text-xs leading-5 text-text-muted">{t('settings.importHint')}</p>
                    <input
                      ref={importInputRef}
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(event) => void handleImportFileChange(event)}
                    />
                    <button
                      type="button"
                      className="folio-pressable h-9 rounded-md bg-bg-elevated px-3 text-xs text-text-secondary hover:bg-bg-sunken hover:text-text-primary"
                      onClick={handleImportClick}
                    >
                      {t('settings.importJson')}
                    </button>
                  </div>
                </article>
              </div>
              </section>
            </div>
          ) : (
            <section className="folio-scrollbar min-h-0 flex-1 overflow-y-auto pr-5">
              {displayItems.map((item) => {
                const createdAtLabel = formatCreatedAtLabel(item.createdAt, locale);
                const isEditingRow = editingId === item.id && editDraft !== null;
                return (
                  <div key={item.id}>
                    <article className="group max-w-[1280px] border-b border-(--border) py-3">
                      <div className="flex items-start gap-3">
                        {item.favicon ? (
                          <img
                            src={item.favicon}
                            alt=""
                            className="mt-1 h-5 w-5 rounded-sm bg-bg-surface object-cover"
                          />
                        ) : (
                          <span className="mt-1 flex h-5 w-5 items-center justify-center rounded-sm bg-bg-surface">
                            <FolioMark variant={iconVariantInput} size={16} />
                          </span>
                        )}

                        <div className="min-w-0 flex-1">
                          <a
                            href={getItemPreferredUrl(item)}
                            target="_blank"
                            rel="noreferrer"
                            className="line-clamp-2 min-w-0 text-sm font-medium text-text-primary no-underline transition-colors duration-150 ease-[var(--ease-out)] hover:text-text-link"
                          >
                            {renderHighlightedText(getItemPreferredTitle(item), search)}
                          </a>
                          <div className="mt-1 flex items-center gap-1.5 overflow-hidden">
                            <p className="m-0 shrink-0 truncate font-mono text-[11px] text-text-muted">
                              {getItemPreferredDomain(item)}
                            </p>
                            {item.tags.length > 0 ? (
                              <div className="min-w-0 flex items-center gap-1 overflow-hidden">
                                {item.tags.map((tag) => (
                                  <span
                                    key={`${item.id}-${tag}`}
                                    className="truncate rounded-md bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-muted"
                                    title={tag}
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          {item.note ? (
                            <p className="m-0 mt-1 truncate text-xs font-light text-text-muted">
                              {renderHighlightedText(item.note, search)}
                            </p>
                          ) : null}
                        </div>

                        <div className="ml-2 flex flex-col items-end gap-1">
                          <div className="flex w-[92px] items-center justify-end gap-1">
                            <button
                              type="button"
                              className="folio-pressable inline-flex h-7 w-7 items-center justify-center rounded-md bg-bg-surface text-text-secondary opacity-0 pointer-events-none hover:bg-bg-elevated hover:text-text-primary group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
                              onClick={() => handleStartEdit(item)}
                              title={t('options.edit')}
                              aria-label={t('options.edit')}
                            >
                              <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                            <button
                              type="button"
                              className={`folio-pressable relative inline-flex h-7 w-7 items-center justify-center rounded-md text-danger transition-[opacity,transform] duration-150 ease-[var(--ease-out)] ${
                                deleteHoldItemId === item.id
                                  ? 'opacity-100 pointer-events-auto'
                                  : 'opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100'
                              }`}
                              onPointerDown={() => handleDeletePointerDown(item)}
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
                                    className="absolute inset-0 rounded-md"
                                    style={{
                                      background: `conic-gradient(var(--accent) ${
                                        deleteHoldProgress * 360
                                      }deg, transparent 0deg)`
                                    }}
                                  />
                                  <span className="absolute inset-[1.5px] rounded-[6px] bg-bg-surface" />
                                </>
                              ) : (
                                <span className="absolute inset-0 rounded-md bg-bg-surface transition-colors duration-150 ease-[var(--ease-out)] hover:bg-bg-elevated" />
                              )}
                              <Trash2 className="relative z-[2] h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                            <button
                              type="button"
                              className={`folio-pressable inline-flex h-7 w-7 items-center justify-center rounded-md border border-(--border) ${statusBadgeClass(item.status)} hover:border-(--accent-border)`}
                              onClick={() => void handleSetStatus(item, nextStatus(item.status))}
                              title={`${t('options.sortStatus')}: ${statusToLabel(nextStatus(item.status), t)}`}
                              aria-label={`${statusToLabel(item.status, t)} → ${statusToLabel(nextStatus(item.status), t)}`}
	                            >
	                              {statusIcon(item.status)}
	                            </button>
	                          </div>
	                          <span className="font-mono text-[10px] text-text-muted" title={createdAtLabel.full}>
	                            {createdAtLabel.short}
	                          </span>
	                        </div>
                      </div>

                      {isEditingRow ? (
                        <div
                          className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-[200ms] ease-[var(--ease-out)] ${
                            isEditPanelExpanded
                              ? 'mt-3 grid-rows-[1fr] opacity-100'
                              : 'mt-0 grid-rows-[0fr] opacity-0'
	                          }`}
	                        >
	                          <div className="overflow-hidden">
                            <div className="rounded-lg border border-(--border) bg-bg-elevated px-4 py-[14px]">
		                              <div className="grid gap-2">
                                <label className="flex items-center gap-3">
                                  <span className="w-[54px] text-xs text-text-secondary">
                                    {t('popup.quickEditTitle')}
                                  </span>
                                  <input
                                    className="folio-input h-[30px] flex-1 bg-bg-surface px-2.5 text-xs text-text-primary"
                                    value={editDraft.title}
                                    onChange={(event) =>
                                      setEditDraft((prev) =>
		                                        prev ? { ...prev, title: event.target.value } : prev
		                                      )
		                                    }
		                                  />
		                                </label>

                                <label className="flex items-center gap-3">
                                  <span className="w-[54px] text-xs text-text-secondary">{t('options.note')}</span>
                                  <input
                                    className="folio-input h-[30px] flex-1 bg-bg-surface px-2.5 text-xs text-text-primary"
                                    value={editDraft.note}
                                    onChange={(event) =>
                                      setEditDraft((prev) =>
		                                        prev ? { ...prev, note: event.target.value } : prev
		                                      )
		                                    }
		                                  />
		                                </label>

		                                <div className="flex items-center gap-3">
		                                  <span className="w-[54px] text-xs text-text-secondary">{t('options.tags')}</span>
		                                  <div className="flex-1">
                                    <TagInputField
                                      tags={editDraft.tags}
                                      inputValue={editTagInput}
                                      placeholder={t('options.tagInputPlaceholder')}
                                      removeButtonTitle={t('common.delete')}
                                      removeButtonLabel={(tag) =>
                                        t('options.removeTagAria', { tag })
                                      }
                                      onInputChange={setEditTagInput}
                                      onAddTag={handleAddEditTag}
                                      onRemoveTag={handleRemoveEditTag}
		                                    />
		                                  </div>
		                                </div>

		                                <div className="mt-1 flex justify-end gap-2">
		                                  <button
		                                    type="button"
		                                    className="folio-pressable h-[30px] rounded-md bg-bg-surface px-3 text-xs text-text-secondary hover:bg-bg-sunken hover:text-text-primary"
		                                    onClick={closeInlineEditor}
		                                  >
		                                    {t('common.cancel')}
		                                  </button>
                                  <button
                                    type="button"
                                    className="folio-pressable h-[30px] rounded-md bg-accent px-3 text-xs text-on-accent shadow-[0_1px_2px_var(--shadow-soft)] hover:bg-accent-hover"
                                    onClick={() => void handleSaveEdit()}
                                  >
                                    {t('common.save')}
		                                  </button>
		                                </div>
		                              </div>
		                            </div>
	                          </div>
	                        </div>
	                      ) : null}
	                    </article>
	                  </div>
		                );
		              })}

              {displayItems.length === 0 ? (
                <div className="flex w-full justify-center pt-24">
                  <div className="max-w-[360px] px-6 text-center">
                    <FileText className="mx-auto mb-3 h-5 w-5 text-text-muted" strokeWidth={1.8} />
                    <p className="m-0 text-base font-medium text-text-primary">
                      {t('options.emptyTitle')}
                    </p>
                    <p className="mb-0 mt-1.5 text-sm leading-6 text-text-secondary">
                      {t('options.emptyText')}
                    </p>
                  </div>
                </div>
              ) : null}
            </section>
          )}
          </div>
        </section>
      </div>
    </main>
  );
}
