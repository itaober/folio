import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../shared/i18n';
import { isSupportedLocale, readStoredLocale, type SupportedLocale } from '../shared/i18n/localeStore';
import { commit, getStore } from '../core/repository';
import { selectAllItems, selectFilteredItems, selectItemsByStatus } from '../core/selectors';
import { toCsv, toJson, toMarkdown } from '../core/exportFormats';
import { downloadTextFile } from '../core/exporters';
import { computeStats } from '../core/stats';
import type { FolioItem, FolioMutation, FolioStatus, FolioStore } from '../core/types';

type ViewKey = 'all' | FolioStatus | 'settings';

interface EditDraft {
  title: string;
  url: string;
  note: string;
  tags: string;
  status: FolioStatus;
}

function statusText(status: FolioStatus, t: (key: string) => string): string {
  if (status === 'unread') return t('common.unread');
  if (status === 'reading') return t('common.reading');
  return t('common.done');
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
  const [message, setMessage] = useState('');

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

  async function refresh(): Promise<void> {
    const nextStore = await getStore();
    setStore(nextStore);
  }

  const displayItems = useMemo(() => {
    if (!store) return [];

    if (search.trim()) {
      return selectFilteredItems(store, search);
    }

    if (view === 'all') return selectAllItems(store);
    if (view === 'settings') return [];
    return selectItemsByStatus(store, view);
  }, [store, search, view]);

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
    setMessage(t('options.updateSuccess'));
    await refresh();
  }

  async function handleDelete(item: FolioItem): Promise<void> {
    await commit({ type: 'deleteItem', payload: { id: item.id } });
    setMessage(t('options.updateSuccess'));
    setSelectedIds((previous) => previous.filter((id) => id !== item.id));
    if (editingId === item.id) {
      setEditingId(null);
      setEditDraft(null);
    }
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

    setMessage(t('options.updateSuccess'));
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
      setMessage('Failed to update');
      return;
    }

    setMessage(t('options.updateSuccess'));
    setEditingId(null);
    setEditDraft(null);
    await refresh();
  }

  return (
    <main className="min-h-screen bg-bg-base text-text-primary">
      <div className="mx-auto flex min-h-screen max-w-[1200px]">
        <aside className="w-56 border-r border-[var(--border)] bg-bg-surface p-4">
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

          {message ? <p className="mb-3 mt-0 text-sm text-text-secondary">{message}</p> : null}

          {view === 'settings' ? (
            <section className="folio-card max-w-xl space-y-3 p-4">
              <h3 className="m-0 text-base font-medium">{t('common.settings')}</h3>
              <label className="block text-sm text-text-secondary">{t('settings.language')}</label>
              <select className="folio-input" value={locale} onChange={(event) => void handleLocaleChange(event.target.value)}>
                <option value="en">{t('settings.english')}</option>
                <option value="zh-CN">{t('settings.zhCN')}</option>
              </select>
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
                  className="rounded-md border border-[var(--border)] bg-bg-elevated px-2 py-1 text-xs"
                  defaultValue=""
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
                <button type="button" className="folio-btn-outline text-xs" onClick={() => void handleBatchApplyTag()}>
                  {t('options.applyTag')}
                </button>
                <button type="button" className="folio-btn-outline text-xs" onClick={() => void handleBatchDelete()}>
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
                                className="rounded-full border border-[var(--border)] bg-bg-elevated px-2 py-0.5 text-[10px] text-text-secondary"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          className="rounded-md border border-[var(--border)] bg-bg-elevated px-2 py-1 text-xs"
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

                        <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px] text-text-secondary">
                          {statusText(item.status, t)}
                        </span>
                      </div>
                    </div>

                    {editingId === item.id && editDraft ? (
                      <div className="mt-3 grid gap-2 border-t border-[var(--border)] pt-3">
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
