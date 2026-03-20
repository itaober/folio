import {
  useEffect,
  useMemo,
  useState,
  type ReactElement
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ExternalLink,
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
import {
  nextStatus,
  statusBadgeClass,
  statusIcon,
  statusToLabel
} from '../shared/ui/itemStatus';
import { renderHighlightedText } from '../shared/ui/renderHighlightedText';
import { TextField } from '../shared/ui/TextField';
import { commit, getStore } from '../core/repository';
import {
  matchesItemKeyword,
  selectItemByUrl,
  selectRecentItems
} from '../core/selectors';
import type { FolioItem, FolioStatus } from '../core/types';

interface ActivePage {
  url: string;
  title: string;
  favicon: string;
}

type PopupFilter = 'all' | FolioStatus;

export default function App(): ReactElement {
  const { t } = useTranslation();

  const [activePage, setActivePage] = useState<ActivePage | null>(null);
  const [currentItem, setCurrentItem] = useState<FolioItem | null>(null);
  const [recentItems, setRecentItems] = useState<FolioItem[]>([]);
  const [theme, setTheme] = useState<FolioTheme>(DEFAULT_THEME);
  const [popupFilter, setPopupFilter] = useState<PopupFilter>('unread');
  const [searchTerm, setSearchTerm] = useState('');

  const canSave = Boolean(activePage?.url);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);

  async function load(): Promise<FolioItem | null> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ?? '';

    if (!url) {
      setActivePage(null);
      setCurrentItem(null);
      setRecentItems([]);
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

    if (result.ok) {
      await load();
      return;
    }

    await load();
  }

  async function handleRemoveCurrentPage(): Promise<void> {
    if (!currentItem) {
      return;
    }

    const result = await commit({
      type: 'deleteItem',
      payload: { id: currentItem.id }
    });

    if (!result.ok) {
      return;
    }

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
      return;
    }

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
      items = items.filter((item) => matchesItemKeyword(item, keyword, true));
    }

    return items;
  }, [popupFilter, recentItems, searchTerm]);
  const iconVariant = getThemeIconVariant(theme);

  return (
    <main className="relative flex h-[450px] w-[320px] flex-col bg-bg-base text-text-primary">
      <section className="space-y-2 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FolioMark variant={iconVariant} size={17} />
            <span className="font-display text-[14px] font-semibold tracking-[-0.01em]">{t('popup.title')}</span>
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
                  onClick={() => setPopupFilter(status)}
                >
                  {status === 'all' ? t('common.all') : statusToLabel(status, t)}
                </button>
              );
            })}
          </div>
        </div>

        <p className="mb-0 font-mono text-[9px] uppercase text-text-muted">{t('popup.recent')}</p>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
          {filteredRecentItems.map((item) => {
            return (
              <div
                key={item.id}
                className="flex items-center gap-1.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-bg-surface"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 bg-transparent p-0 text-left"
                  onClick={() => void handleOpenRecentItem(item)}
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
                      <span className="block min-w-0 flex-1 truncate text-[13px] text-text-primary">
                        {renderHighlightedText(item.title, searchTerm)}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 min-w-0">
                      <span className="block truncate font-mono text-[10px] text-text-muted">
                        {renderHighlightedText(item.domain, searchTerm)}
                      </span>
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-(--border) ${statusBadgeClass(item.status)} hover:border-(--accent-border)`}
                  onClick={() => void handleStatusChange(item, nextStatus(item.status))}
                  title={`${statusToLabel(item.status, t)} → ${statusToLabel(nextStatus(item.status), t)}`}
                  aria-label={`${statusToLabel(item.status, t)} → ${statusToLabel(nextStatus(item.status), t)}`}
                >
                  {statusIcon(item.status)}
                </button>
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
