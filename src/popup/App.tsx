import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../shared/i18n';
import {
  isSupportedLocale,
  readStoredLocale,
  type SupportedLocale
} from '../shared/i18n/localeStore';
import { commit, getStore } from '../core/repository';
import { selectItemByUrl, selectRecentItems } from '../core/selectors';
import type { FolioItem, FolioStatus } from '../core/types';

interface ActivePage {
  url: string;
  title: string;
  favicon: string;
}

const STATUS_ORDER: FolioStatus[] = ['unread', 'reading', 'done'];

function statusToLabel(status: FolioStatus, t: (key: string) => string): string {
  if (status === 'unread') return t('common.unread');
  if (status === 'reading') return t('common.reading');
  return t('common.done');
}

export default function App(): ReactElement {
  const { t } = useTranslation();

  const [activePage, setActivePage] = useState<ActivePage | null>(null);
  const [currentItem, setCurrentItem] = useState<FolioItem | null>(null);
  const [recentItems, setRecentItems] = useState<FolioItem[]>([]);
  const [message, setMessage] = useState<string>('');
  const [locale, setLocale] = useState<SupportedLocale>('en');
  const [backlogCount, setBacklogCount] = useState(0);
  const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
  const [quickEditTitle, setQuickEditTitle] = useState('');
  const [quickEditTags, setQuickEditTags] = useState('');
  const [quickEditNote, setQuickEditNote] = useState('');
  const quickEditTimerRef = useRef<number | null>(null);

  const canSave = Boolean(activePage?.url);

  useEffect(() => {
    void load();
    void readStoredLocale().then((saved) => setLocale(saved));
  }, []);

  useEffect(() => {
    return () => {
      if (quickEditTimerRef.current !== null) {
        window.clearTimeout(quickEditTimerRef.current);
      }
    };
  }, []);

  function scheduleQuickEditAutoClose(): void {
    if (quickEditTimerRef.current !== null) {
      window.clearTimeout(quickEditTimerRef.current);
    }

    quickEditTimerRef.current = window.setTimeout(() => {
      setIsQuickEditOpen(false);
    }, 3000);
  }

  function openQuickEdit(item: FolioItem): void {
    setQuickEditTitle(item.title);
    setQuickEditTags(item.tags.join(', '));
    setQuickEditNote(item.note);
    setIsQuickEditOpen(true);
    scheduleQuickEditAutoClose();
  }

  async function load(): Promise<FolioItem | null> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ?? '';

    if (!url) {
      setActivePage(null);
      setCurrentItem(null);
      setRecentItems([]);
      setMessage(t('popup.noActiveTab'));
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
    setRecentItems(selectRecentItems(store, 5));
    setBacklogCount(unreadCount > threshold ? unreadCount : 0);
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
      setMessage(
        result.item
          ? t('popup.alreadySavedWithStatus', { status: statusLabel })
          : t('popup.alreadySaved')
      );
    } else if (!result.ok) {
      setMessage('Failed to save');
    } else {
      setMessage(t('popup.saved'));
      const savedItem = await load();
      if (savedItem) {
        openQuickEdit(savedItem);
      }
      return;
    }

    await load();
  }

  async function handleStatusChange(status: FolioStatus): Promise<void> {
    if (!currentItem) return;

    await commit({
      type: 'setStatus',
      payload: {
        id: currentItem.id,
        status
      }
    });

    await load();
  }

  async function handleOpenOptions(): Promise<void> {
    await chrome.runtime.openOptionsPage();
  }

  async function handleOpenRecentItem(item: FolioItem): Promise<void> {
    await chrome.tabs.create({ url: item.url });
    await commit({ type: 'touchOpenedAt', payload: { id: item.id } });
  }

  async function handleLocaleChange(value: string): Promise<void> {
    if (!isSupportedLocale(value)) {
      return;
    }

    await commit({
      type: 'setLocale',
      payload: {
        locale: value
      }
    });

    await changeLanguage(value);
    setLocale(value);
    setMessage('');
  }

  async function handleApplyQuickEdit(): Promise<void> {
    if (!currentItem) {
      return;
    }

    const tags = quickEditTags
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    const result = await commit({
      type: 'updateItem',
      payload: {
        id: currentItem.id,
        title: quickEditTitle.trim() || currentItem.title,
        tags,
        note: quickEditNote
      }
    });

    if (!result.ok) {
      setMessage('Failed to update');
      return;
    }

    setMessage(t('popup.saved'));
    setIsQuickEditOpen(false);
    await load();
  }

  const statusButtons = useMemo(() => {
    return STATUS_ORDER.map((status) => {
      const isActive = currentItem?.status === status;
      return (
        <button
          key={status}
          type="button"
          className={
            isActive
              ? 'rounded-md border border-(--accent-border) bg-accent-subtle px-2 py-1 text-xs text-accent'
              : 'rounded-md border border-(--border) bg-transparent px-2 py-1 text-xs text-text-secondary hover:bg-bg-elevated'
          }
          onClick={() => void handleStatusChange(status)}
        >
          {statusToLabel(status, t)}
        </button>
      );
    });
  }, [currentItem?.status, t]);

  return (
    <main className="h-[520px] w-[360px] overflow-y-auto bg-bg-base text-text-primary">
      <header className="flex h-12 items-center justify-between border-b border-(--border) bg-bg-surface px-4">
        <div>
          <p className="m-0 font-display text-base italic">{t('popup.title')}</p>
          <p className="m-0 text-[11px] text-text-muted">{t('popup.subtitle')}</p>
        </div>
        <button type="button" className="folio-btn-outline py-1 text-xs" onClick={() => void handleOpenOptions()}>
          {t('popup.openDashboard')}
        </button>
      </header>

      <section className="border-b border-(--border) p-4">
        <label className="mb-1 block font-mono text-[11px] uppercase text-text-muted">
          {t('popup.language')}
        </label>
        <select className="folio-input" value={locale} onChange={(event) => void handleLocaleChange(event.target.value)}>
          <option value="en">{t('settings.english')}</option>
          <option value="zh-CN">{t('settings.zhCN')}</option>
        </select>
      </section>

      <section className="space-y-3 p-4">
        {backlogCount > 0 ? (
          <p className="m-0 rounded-md border border-(--status-unread-border) bg-(--status-unread-bg) px-2 py-1 text-xs text-(--status-unread-text)">
            {t('popup.backlogHint', { count: backlogCount })}
          </p>
        ) : null}

        {!currentItem ? (
          <button type="button" className="folio-btn-primary w-full" disabled={!canSave} onClick={() => void handleSaveCurrentPage()}>
            {t('popup.saveCurrentPage')}
          </button>
        ) : (
          <div className="folio-card space-y-3 p-3">
            <div className="space-y-1">
              <p className="m-0 line-clamp-1 text-sm font-medium text-text-primary">{currentItem.title}</p>
              <p className="m-0 font-mono text-xs text-text-muted">{currentItem.domain}</p>
            </div>
            <div className="flex gap-1">{statusButtons}</div>
          </div>
        )}

        {message ? <p className="m-0 text-xs text-text-secondary">{message}</p> : null}

        {currentItem && isQuickEditOpen ? (
          <div className="folio-card space-y-2 p-3">
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">{t('popup.quickEditTitle')}</span>
              <input
                className="folio-input"
                value={quickEditTitle}
                onChange={(event) => {
                  setQuickEditTitle(event.target.value);
                  scheduleQuickEditAutoClose();
                }}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">{t('popup.quickEditTags')}</span>
              <input
                className="folio-input"
                value={quickEditTags}
                onChange={(event) => {
                  setQuickEditTags(event.target.value);
                  scheduleQuickEditAutoClose();
                }}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">{t('popup.quickEditNote')}</span>
              <input
                className="folio-input"
                value={quickEditNote}
                onChange={(event) => {
                  setQuickEditNote(event.target.value);
                  scheduleQuickEditAutoClose();
                }}
              />
            </label>

            <div className="flex items-center gap-2">
              <button type="button" className="folio-btn-primary flex-1" onClick={() => void handleApplyQuickEdit()}>
                {t('popup.quickEditApply')}
              </button>
              <button type="button" className="folio-btn-outline flex-1" onClick={() => setIsQuickEditOpen(false)}>
                {t('popup.quickEditDismiss')}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="p-4 pt-0">
        <p className="mb-2 font-mono text-[10px] uppercase text-text-muted">{t('popup.recent')}</p>
        <div className="space-y-1">
          {recentItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-center justify-between rounded-md border border-transparent px-2 py-2 text-left hover:border-(--border) hover:bg-bg-elevated"
              onClick={() => void handleOpenRecentItem(item)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text-primary">{item.title}</span>
                <span className="block truncate font-mono text-[11px] text-text-muted">{item.domain}</span>
              </span>
              <span className="ml-2 rounded-full border border-(--border) px-2 py-0.5 text-[10px] text-text-secondary">
                {statusToLabel(item.status, t)}
              </span>
            </button>
          ))}
          {recentItems.length === 0 ? (
            <p className="m-0 rounded-md border border-dashed border-(--border) px-3 py-4 text-xs text-text-muted">
              {t('options.emptyText')}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
