import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement
} from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../shared/i18n';
import { isSupportedLocale, readStoredLocale, type SupportedLocale } from '../shared/i18n/localeStore';
import { commit, getStore, syncBackupNow } from '../core/repository';
import {
  selectAllItems,
  selectFilteredItems,
  selectItemsByStatus,
  sortItems,
  type SortMode
} from '../core/selectors';
import { toCsv, toJson, toMarkdown } from '../core/exportFormats';
import { downloadTextFile } from '../core/exporters';
import { computeStats } from '../core/stats';
import {
  clearBackupDirectoryHandle,
  saveBackupDirectoryHandle
} from '../core/sync/handleStore';
import type { FolioItem, FolioMutation, FolioStatus, FolioStore } from '../core/types';

type ViewKey = 'all' | FolioStatus | 'settings';

interface EditDraft {
  title: string;
  url: string;
  note: string;
  tags: string;
  status: FolioStatus;
}

type NoticeLevel = 'success' | 'error' | 'info';

interface NoticeState {
  level: NoticeLevel;
  text: string;
}

function statusText(status: FolioStatus, t: (key: string) => string): string {
  if (status === 'unread') return t('common.unread');
  if (status === 'reading') return t('common.reading');
  return t('common.done');
}

function noticeClass(level: NoticeLevel): string {
  if (level === 'success') {
    return 'border-(--status-done-border) bg-(--status-done-bg) text-(--status-done-text)';
  }
  if (level === 'error') {
    return 'border-(--status-unread-border) bg-(--status-unread-bg) text-(--status-unread-text)';
  }
  return 'border-(--border) bg-bg-elevated text-text-secondary';
}

function parseTags(input: string): string[] {
  return input
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function App(): ReactElement {
  const { t } = useTranslation();
  const [store, setStore] = useState<FolioStore | null>(null);
  const [view, setView] = useState<ViewKey>('all');
  const [search, setSearch] = useState('');
  const [locale, setLocale] = useState<SupportedLocale>('en');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchTag, setBatchTag] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('saved_desc');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [tagActionTarget, setTagActionTarget] = useState('');
  const [tagRenameValue, setTagRenameValue] = useState('');
  const [backlogThresholdInput, setBacklogThresholdInput] = useState('20');
  const [staleThresholdInput, setStaleThresholdInput] = useState('30');
  const [defaultStatusInput, setDefaultStatusInput] = useState<'unread' | 'reading'>(
    'unread'
  );
  const [undoItem, setUndoItem] = useState<FolioItem | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void refresh();
    void readStoredLocale().then((saved) => setLocale(saved));

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
    };
  }, []);

  async function refresh(): Promise<void> {
    const nextStore = await getStore();
    setStore(nextStore);
    setBacklogThresholdInput(String(nextStore.settings.backlogThreshold));
    setStaleThresholdInput(String(nextStore.settings.staleThreshold));
    setDefaultStatusInput(nextStore.settings.defaultStatus);
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

    const items = selectAllItems(store);
    return {
      all: items.length,
      unread: items.filter((item) => item.status === 'unread').length,
      reading: items.filter((item) => item.status === 'reading').length,
      done: items.filter((item) => item.status === 'done').length
    };
  }, [store]);

  const stats = useMemo(() => {
    if (!store) {
      return {
        weeklyDone: 0,
        total: 0,
        unread: 0,
        topDomains: [] as Array<{ domain: string; count: number }>
      };
    }

    return computeStats(store);
  }, [store]);

  async function handleSetStatus(item: FolioItem, status: FolioStatus): Promise<void> {
    await commit({ type: 'setStatus', payload: { id: item.id, status } });
    setNotice({ level: 'success', text: t('options.updateSuccess') });
    await refresh();
  }

  async function handleDelete(item: FolioItem): Promise<void> {
    await commit({ type: 'deleteItem', payload: { id: item.id } });
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
    }
    setUndoItem(item);
    undoTimerRef.current = window.setTimeout(() => {
      setUndoItem(null);
    }, 3000);
    setSelectedIds((previous) => previous.filter((id) => id !== item.id));
    if (editingId === item.id) {
      setEditingId(null);
      setEditDraft(null);
    }
    await refresh();
  }

  async function handleUndoDelete(): Promise<void> {
    if (!undoItem) {
      return;
    }

    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
    }

    const result = await commit({
      type: 'restoreItem',
      payload: {
        item: undoItem
      }
    });

    if (!result.ok) {
      setNotice({ level: 'error', text: t('options.undoFailed') });
      return;
    }

    setUndoItem(null);
    setNotice({ level: 'success', text: t('options.updateSuccess') });
    await refresh();
  }

  async function handleLocaleChange(value: string): Promise<void> {
    if (!isSupportedLocale(value)) {
      return;
    }

    await commit({ type: 'setLocale', payload: { locale: value } });
    await changeLanguage(value);
    setLocale(value);
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

  async function handleRenameTag(): Promise<void> {
    if (!store || !tagActionTarget) {
      return;
    }

    const newTag = tagRenameValue.trim();
    if (!newTag) {
      return;
    }

    for (const item of Object.values(store.items)) {
      if (!item.tags.includes(tagActionTarget)) {
        continue;
      }

      const nextTags = item.tags.map((tag) =>
        tag === tagActionTarget ? newTag : tag
      );

      await commit({
        type: 'updateItem',
        payload: {
          id: item.id,
          tags: [...new Set(nextTags)]
        }
      });
    }

    setNotice({ level: 'success', text: t('options.updateSuccess') });
    setTagActionTarget('');
    setTagRenameValue('');
    setActiveTagFilter(null);
    await refresh();
  }

  async function handleDeleteTag(): Promise<void> {
    if (!store || !tagActionTarget) {
      return;
    }

    for (const item of Object.values(store.items)) {
      if (!item.tags.includes(tagActionTarget)) {
        continue;
      }

      const nextTags = item.tags.filter((tag) => tag !== tagActionTarget);
      await commit({
        type: 'updateItem',
        payload: {
          id: item.id,
          tags: nextTags
        }
      });
    }

    setNotice({ level: 'success', text: t('options.updateSuccess') });
    setTagActionTarget('');
    setTagRenameValue('');
    if (activeTagFilter === tagActionTarget) {
      setActiveTagFilter(null);
    }
    await refresh();
  }

  async function handleSaveThresholdSettings(): Promise<void> {
    const backlogThreshold = Number(backlogThresholdInput);
    const staleThreshold = Number(staleThresholdInput);
    if (!Number.isFinite(backlogThreshold) || !Number.isFinite(staleThreshold)) {
      setNotice({ level: 'error', text: t('options.updateFailed') });
      return;
    }

    const result = await commit({
      type: 'updateSettings',
      payload: {
        backlogThreshold,
        staleThreshold,
        defaultStatus: defaultStatusInput
      }
    });

    if (!result.ok) {
      setNotice({ level: 'error', text: t('options.updateFailed') });
      return;
    }

    setNotice({ level: 'success', text: t('options.updateSuccess') });
    await refresh();
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

    for (const id of selectedIds) {
      const item = store.items[id];
      if (!item) {
        continue;
      }

      const mutation = createMutation(item);
      if (!mutation) {
        continue;
      }

      await commit(mutation);
    }

    setNotice({ level: 'success', text: t('options.updateSuccess') });
    setSelectedIds([]);
    await refresh();
  }

  async function handleBatchSetStatus(status: FolioStatus): Promise<void> {
    await runBatchMutation((item) => ({ type: 'setStatus', payload: { id: item.id, status } }));
  }

  async function handleBatchDelete(): Promise<void> {
    await runBatchMutation((item) => ({ type: 'deleteItem', payload: { id: item.id } }));
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

  function handleExportJson(): void {
    if (!store) {
      return;
    }

    downloadTextFile(
      `folio-${exportDateToken()}.json`,
      toJson(store),
      'application/json;charset=utf-8'
    );
  }

  function handleExportCsv(): void {
    downloadTextFile(
      `folio-${exportDateToken()}.csv`,
      toCsv(displayItems),
      'text/csv;charset=utf-8'
    );
  }

  function handleExportMarkdown(): void {
    downloadTextFile(
      `folio-${exportDateToken()}.md`,
      toMarkdown(displayItems),
      'text/markdown;charset=utf-8'
    );
  }

  function handleStartEdit(item: FolioItem): void {
    setEditingId(item.id);
    setEditDraft({
      title: item.title,
      url: item.url,
      note: item.note,
      tags: item.tags.join(', '),
      status: item.status
    });
  }

  async function handleSaveEdit(): Promise<void> {
    if (!editingId || !editDraft) {
      return;
    }

    const result = await commit({
      type: 'updateItem',
      payload: {
        id: editingId,
        title: editDraft.title,
        url: editDraft.url,
        note: editDraft.note,
        tags: parseTags(editDraft.tags),
        status: editDraft.status
      }
    });

    if (!result.ok) {
      setNotice({ level: 'error', text: t('options.updateFailed') });
      return;
    }

    setNotice({ level: 'success', text: t('options.updateSuccess') });
    setEditingId(null);
    setEditDraft(null);
    await refresh();
  }

  return (
    <main className="min-h-screen bg-bg-base text-text-primary">
      <div className="mx-auto flex min-h-screen max-w-[1200px]">
        <aside className="w-56 border-r border-(--border) bg-bg-surface p-4">
          <h1 className="m-0 font-display text-xl italic">Folio</h1>
          <p className="mb-4 mt-1 font-mono text-[11px] text-text-muted">Reading List</p>

          <nav className="space-y-1">
            <button type="button" className="folio-btn-outline w-full justify-between" onClick={() => setView('all')}>
              <span>{t('common.all')}</span>
              <span className="font-mono text-xs">{counts.all}</span>
            </button>
            <button type="button" className="folio-btn-outline w-full justify-between" onClick={() => setView('unread')}>
              <span>{t('common.unread')}</span>
              <span className="font-mono text-xs">{counts.unread}</span>
            </button>
            <button type="button" className="folio-btn-outline w-full justify-between" onClick={() => setView('reading')}>
              <span>{t('common.reading')}</span>
              <span className="font-mono text-xs">{counts.reading}</span>
            </button>
            <button type="button" className="folio-btn-outline w-full justify-between" onClick={() => setView('done')}>
              <span>{t('common.done')}</span>
              <span className="font-mono text-xs">{counts.done}</span>
            </button>
          </nav>

          <button type="button" className="folio-btn-outline mt-4 w-full" onClick={() => setView('settings')}>
            {t('common.settings')}
          </button>

          <div className="mt-6">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-text-muted">
              {t('options.tagsSection')}
            </p>
            <div className="space-y-1">
              {(store?.tags ?? []).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={
                    activeTagFilter === tag
                      ? 'w-full rounded-md border border-(--accent-border) bg-accent-subtle px-2 py-1 text-left text-xs text-accent'
                      : 'w-full rounded-md border border-transparent px-2 py-1 text-left text-xs text-text-secondary hover:border-(--border) hover:bg-bg-elevated'
                  }
                  onClick={() => {
                    setView('all');
                    setActiveTagFilter(tag);
                  }}
                >
                  #{tag}
                </button>
              ))}
              {activeTagFilter ? (
                <button
                  type="button"
                  className="w-full rounded-md border border-(--border) px-2 py-1 text-left text-xs text-text-secondary hover:bg-bg-elevated"
                  onClick={() => setActiveTagFilter(null)}
                >
                  {t('options.clearTagFilter')}
                </button>
              ) : null}
            </div>
          </div>
        </aside>

        <section className="flex-1 p-6">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 font-display text-3xl">{t('options.title')}</h2>
              <p className="m-0 font-mono text-sm text-text-muted">{t('options.totalCount', { count: counts.all })}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="folio-input max-w-sm"
                placeholder={t('options.searchPlaceholder')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {view !== 'settings' ? (
                <select
                  className="rounded-md border border-(--border) bg-bg-elevated px-2 py-1 text-xs text-text-secondary"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                >
                  <option value="saved_desc">
                    {t('options.sortLabel')}: {t('options.sortNewest')}
                  </option>
                  <option value="saved_asc">
                    {t('options.sortLabel')}: {t('options.sortOldest')}
                  </option>
                  <option value="domain_asc">
                    {t('options.sortLabel')}: {t('options.sortDomain')}
                  </option>
                  <option value="title_asc">
                    {t('options.sortLabel')}: {t('options.sortTitle')}
                  </option>
                  <option value="status">
                    {t('options.sortLabel')}: {t('options.sortStatus')}
                  </option>
                </select>
              ) : null}
              {view !== 'settings' ? (
                <>
                  <button type="button" className="folio-btn-outline text-xs" onClick={handleExportJson}>
                    {t('options.exportJson')}
                  </button>
                  <button type="button" className="folio-btn-outline text-xs" onClick={handleExportCsv}>
                    {t('options.exportCsv')}
                  </button>
                  <button type="button" className="folio-btn-outline text-xs" onClick={handleExportMarkdown}>
                    {t('options.exportMarkdown')}
                  </button>
                </>
              ) : null}
            </div>
          </header>

          {undoItem ? (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-(--border) bg-bg-elevated px-3 py-2 text-sm text-text-secondary">
              <span>{t('options.removedUndo')}</span>
              <button
                type="button"
                className="folio-btn-outline py-1 text-xs"
                onClick={() => void handleUndoDelete()}
              >
                {t('options.undo')}
              </button>
            </div>
          ) : null}

          {notice ? (
            <p
              className={`mb-3 mt-0 rounded-md border px-3 py-2 text-sm ${noticeClass(
                notice.level
              )}`}
            >
              {notice.text}
            </p>
          ) : null}

          {view === 'settings' ? (
            <section className="folio-card max-w-xl space-y-3 p-4">
              <h3 className="m-0 text-base font-medium">{t('common.settings')}</h3>
              <label className="block text-sm text-text-secondary">{t('settings.language')}</label>
              <select className="folio-input" value={locale} onChange={(event) => void handleLocaleChange(event.target.value)}>
                <option value="en">{t('settings.english')}</option>
                <option value="zh-CN">{t('settings.zhCN')}</option>
              </select>

              <div className="h-px bg-(--border)" />

              <div className="space-y-2">
                <p className="m-0 text-sm text-text-secondary">
                  {t('options.thresholdsTitle')}
                </p>
                <label className="block text-xs text-text-muted">
                  {t('options.backlogThreshold')}
                </label>
                <input
                  className="folio-input"
                  type="number"
                  min={1}
                  value={backlogThresholdInput}
                  onChange={(event) =>
                    setBacklogThresholdInput(event.target.value)
                  }
                />
                <label className="block text-xs text-text-muted">
                  {t('options.staleThreshold')}
                </label>
                <input
                  className="folio-input"
                  type="number"
                  min={1}
                  value={staleThresholdInput}
                  onChange={(event) => setStaleThresholdInput(event.target.value)}
                />
                <label className="block text-xs text-text-muted">
                  {t('options.defaultStatus')}
                </label>
                <select
                  className="folio-input"
                  value={defaultStatusInput}
                  onChange={(event) =>
                    setDefaultStatusInput(event.target.value as 'unread' | 'reading')
                  }
                >
                  <option value="unread">{t('common.unread')}</option>
                  <option value="reading">{t('common.reading')}</option>
                </select>
                <button
                  type="button"
                  className="folio-btn-primary"
                  onClick={() => void handleSaveThresholdSettings()}
                >
                  {t('common.save')}
                </button>
              </div>

              <div className="h-px bg-(--border)" />

              <div className="space-y-2">
                <p className="m-0 text-sm text-text-secondary">{t('settings.syncDirectory')}</p>
                <p className="m-0 text-xs text-text-muted">
                  {store?.settings.syncDirectory ?? t('settings.notConfigured')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="folio-btn-outline"
                    onClick={() => void handleChooseSyncDirectory()}
                  >
                    {store?.settings.syncDirectory
                      ? t('settings.changeDirectory')
                      : t('settings.chooseDirectory')}
                  </button>
                  <button
                    type="button"
                    className="folio-btn-outline"
                    onClick={() => void handleClearSyncDirectory()}
                    disabled={!store?.settings.syncDirectory}
                  >
                    {t('settings.clearDirectory')}
                  </button>
                  <button
                    type="button"
                    className="folio-btn-primary"
                    onClick={() => void handleSyncNow()}
                    disabled={!store?.settings.syncDirectory || isSyncing}
                  >
                    {isSyncing ? '...' : t('settings.syncNow')}
                  </button>
                </div>
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

              <div className="h-px bg-(--border)" />

              <div className="space-y-2">
                <p className="m-0 text-sm text-text-secondary">
                  {t('options.tagManagerTitle')}
                </p>
                <label className="block text-xs text-text-muted">
                  {t('options.tagSelect')}
                </label>
                <select
                  className="folio-input"
                  value={tagActionTarget}
                  onChange={(event) => setTagActionTarget(event.target.value)}
                >
                  <option value="">-</option>
                  {(store?.tags ?? []).map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
                <label className="block text-xs text-text-muted">
                  {t('options.tagNewName')}
                </label>
                <input
                  className="folio-input"
                  value={tagRenameValue}
                  onChange={(event) => setTagRenameValue(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="folio-btn-outline"
                    onClick={() => void handleRenameTag()}
                    disabled={!tagActionTarget || !tagRenameValue.trim()}
                  >
                    {t('options.renameTag')}
                  </button>
                  <button
                    type="button"
                    className="folio-btn-outline"
                    onClick={() => void handleDeleteTag()}
                    disabled={!tagActionTarget}
                  >
                    {t('options.deleteTag')}
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className="mb-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
                <div className="folio-card p-3">
                  <p className="m-0 text-xs text-text-muted">{t('options.statsWeeklyDone')}</p>
                  <p className="m-0 mt-1 font-display text-2xl">{stats.weeklyDone}</p>
                </div>
                <div className="folio-card p-3">
                  <p className="m-0 text-xs text-text-muted">{t('options.statsTotal')}</p>
                  <p className="m-0 mt-1 font-display text-2xl">{stats.total}</p>
                </div>
                <div className="folio-card p-3">
                  <p className="m-0 text-xs text-text-muted">{t('options.statsUnread')}</p>
                  <p className="m-0 mt-1 font-display text-2xl">{stats.unread}</p>
                </div>
                <div className="folio-card p-3">
                  <p className="m-0 text-xs text-text-muted">{t('options.statsTopDomains')}</p>
                  <p className="m-0 mt-1 truncate text-sm text-text-secondary">
                    {stats.topDomains.length > 0
                      ? stats.topDomains.map((entry) => `${entry.domain}(${entry.count})`).join(', ')
                      : '-'}
                  </p>
                </div>
              </section>

              <section className="folio-card mb-4 flex flex-wrap items-center gap-2 p-3">
                <button type="button" className="folio-btn-outline text-xs" onClick={handleSelectAllCurrent}>
                  {t('options.selectAll')}
                </button>
                <span className="text-xs text-text-secondary">{t('options.batchSelected', { count: selectedIds.length })}</span>
                <select
                  className="rounded-md border border-(--border) bg-bg-elevated px-2 py-1 text-xs"
                  defaultValue=""
                  disabled={selectedIds.length === 0}
                  onChange={(event) => {
                    const value = event.target.value as FolioStatus | '';
                    if (!value) return;
                    void handleBatchSetStatus(value);
                    event.currentTarget.value = '';
                  }}
                >
                  <option value="">{t('options.status')}</option>
                  <option value="unread">{t('common.unread')}</option>
                  <option value="reading">{t('common.reading')}</option>
                  <option value="done">{t('common.done')}</option>
                </select>
                <input
                  className="folio-input max-w-40"
                  placeholder={t('options.batchTagPlaceholder')}
                  value={batchTag}
                  onChange={(event) => setBatchTag(event.target.value)}
                />
                <button
                  type="button"
                  className="folio-btn-outline text-xs"
                  onClick={() => void handleBatchApplyTag()}
                  disabled={selectedIds.length === 0 || !batchTag.trim()}
                >
                  {t('options.applyTag')}
                </button>
                <button
                  type="button"
                  className="folio-btn-outline text-xs"
                  onClick={() => void handleBatchDelete()}
                  disabled={selectedIds.length === 0}
                >
                  {t('options.batchDelete')}
                </button>
              </section>

              <section className="space-y-2">
                {displayItems.map((item) => (
                  <article key={item.id} className="folio-card p-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => handleToggleSelect(item.id)}
                        aria-label={`select-${item.id}`}
                      />

                      <div className="min-w-0 flex-1">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm font-medium text-text-link"
                        >
                          {item.title}
                        </a>
                        <p className="m-0 mt-1 font-mono text-xs text-text-muted">{item.domain}</p>

                        {item.tags.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {item.tags.map((tag) => (
                              <span
                                key={`${item.id}-${tag}`}
                                className="rounded-full border border-(--border) bg-bg-elevated px-2 py-0.5 text-[10px] text-text-secondary"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          className="rounded-md border border-(--border) bg-bg-elevated px-2 py-1 text-xs"
                          value={item.status}
                          onChange={(event) => void handleSetStatus(item, event.target.value as FolioStatus)}
                        >
                          <option value="unread">{t('common.unread')}</option>
                          <option value="reading">{t('common.reading')}</option>
                          <option value="done">{t('common.done')}</option>
                        </select>

                        <a href={item.url} target="_blank" rel="noreferrer" className="folio-btn-outline py-1 text-xs">
                          {t('options.open')}
                        </a>

                        <button type="button" className="folio-btn-outline py-1 text-xs" onClick={() => handleStartEdit(item)}>
                          {t('options.edit')}
                        </button>

                        <button type="button" className="folio-btn-outline py-1 text-xs" onClick={() => void handleDelete(item)}>
                          {t('common.delete')}
                        </button>

                        <span className="rounded-full border border-(--border) px-2 py-1 text-[10px] text-text-secondary">
                          {statusText(item.status, t)}
                        </span>
                        {item.status === 'unread' &&
                        Date.now() - item.savedAt >
                          (store?.settings.staleThreshold ?? 30) *
                            24 *
                            60 *
                            60 *
                            1000 ? (
                          <span className="rounded-full border border-(--status-unread-border) bg-(--status-unread-bg) px-2 py-1 text-[10px] text-(--status-unread-text)">
                            {t('options.staleUnread')}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {editingId === item.id && editDraft ? (
                      <div className="mt-3 grid gap-2 border-t border-(--border) pt-3">
                        <label>
                          <span className="mb-1 block text-xs text-text-secondary">Title</span>
                          <input
                            className="folio-input"
                            value={editDraft.title}
                            onChange={(event) =>
                              setEditDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))
                            }
                          />
                        </label>

                        <label>
                          <span className="mb-1 block text-xs text-text-secondary">{t('options.url')}</span>
                          <input
                            className="folio-input"
                            value={editDraft.url}
                            onChange={(event) =>
                              setEditDraft((prev) => (prev ? { ...prev, url: event.target.value } : prev))
                            }
                          />
                        </label>

                        <label>
                          <span className="mb-1 block text-xs text-text-secondary">{t('options.tags')}</span>
                          <input
                            className="folio-input"
                            value={editDraft.tags}
                            onChange={(event) =>
                              setEditDraft((prev) => (prev ? { ...prev, tags: event.target.value } : prev))
                            }
                          />
                        </label>

                        <label>
                          <span className="mb-1 block text-xs text-text-secondary">{t('options.note')}</span>
                          <input
                            className="folio-input"
                            value={editDraft.note}
                            onChange={(event) =>
                              setEditDraft((prev) => (prev ? { ...prev, note: event.target.value } : prev))
                            }
                          />
                        </label>

                        <div className="flex items-center gap-2">
                          <button type="button" className="folio-btn-primary" onClick={() => void handleSaveEdit()}>
                            {t('common.save')}
                          </button>
                          <button
                            type="button"
                            className="folio-btn-outline"
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft(null);
                            }}
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}

                {displayItems.length === 0 ? (
                  <div className="folio-card p-6">
                    <p className="m-0 font-display text-xl">{t('options.emptyTitle')}</p>
                    <p className="mb-0 mt-2 text-sm text-text-secondary">{t('options.emptyText')}</p>
                  </div>
                ) : null}
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
