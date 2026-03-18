import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../shared/i18n';
import { isSupportedLocale, readStoredLocale, type SupportedLocale } from '../shared/i18n/localeStore';
import { commit, getStore } from '../core/repository';
import { selectAllItems, selectFilteredItems, selectItemsByStatus } from '../core/selectors';
import type { FolioItem, FolioStatus, FolioStore } from '../core/types';

type ViewKey = 'all' | FolioStatus | 'settings';

function statusText(status: FolioStatus, t: (key: string) => string): string {
  if (status === 'unread') return t('common.unread');
  if (status === 'reading') return t('common.reading');
  return t('common.done');
}

export default function App(): ReactElement {
  const { t } = useTranslation();
  const [store, setStore] = useState<FolioStore | null>(null);
  const [view, setView] = useState<ViewKey>('all');
  const [search, setSearch] = useState('');
  const [locale, setLocale] = useState<SupportedLocale>('en');

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

  async function handleSetStatus(item: FolioItem, status: FolioStatus): Promise<void> {
    await commit({ type: 'setStatus', payload: { id: item.id, status } });
    await refresh();
  }

  async function handleDelete(item: FolioItem): Promise<void> {
    await commit({ type: 'deleteItem', payload: { id: item.id } });
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
          <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 font-display text-3xl">{t('options.title')}</h2>
              <p className="m-0 font-mono text-sm text-text-muted">{t('options.totalCount', { count: counts.all })}</p>
            </div>
            <input
              className="folio-input max-w-sm"
              placeholder={t('options.searchPlaceholder')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </header>

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
            <section className="space-y-2">
              {displayItems.map((item) => (
                <article key={item.id} className="folio-card flex items-start justify-between gap-3 p-3">
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
                    <button type="button" className="folio-btn-outline py-1 text-xs" onClick={() => void handleDelete(item)}>
                      {t('common.delete')}
                    </button>
                    <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px] text-text-secondary">
                      {statusText(item.status, t)}
                    </span>
                  </div>
                </article>
              ))}

              {displayItems.length === 0 ? (
                <div className="folio-card p-6">
                  <p className="m-0 font-display text-xl">{t('options.emptyTitle')}</p>
                  <p className="mb-0 mt-2 text-sm text-text-secondary">{t('options.emptyText')}</p>
                </div>
              ) : null}
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
