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
  DEFAULT_ICON_VARIANT,
  type FolioIconVariant
} from '../shared/icons';
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
  const [iconVariant, setIconVariant] = useState<FolioIconVariant>(
    DEFAULT_ICON_VARIANT
  );
  const [popupFilter, setPopupFilter] = useState<PopupFilter>('unread');
  const [searchTerm, setSearchTerm] = useState('');

  const canSave = Boolean(activePage?.url);

  useEffect(() => {
    void load();
  }, []);

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
    setIconVariant(store.settings.iconVariant);
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

  return (
    <main className="relative h-[520px] w-[360px] overflow-y-auto bg-bg-base text-text-primary">
      <section className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FolioMark variant={iconVariant} size={20} />
            <span className="font-display text-base italic">{t('popup.title')}</span>
          </div>

		          <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1 rounded-md bg-accent px-2.5 text-xs font-medium text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={!canSave}
                  onClick={() =>
                    void (currentItem
                      ? handleRemoveCurrentPage()
                      : handleSaveCurrentPage())
                  }
                >
                  {currentItem ? (
                    <X className="h-3.5 w-3.5" strokeWidth={2.2} />
                  ) : (
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                  )}
                  <span>
                    {currentItem ? t('popup.removeCurrent') : t('popup.saveShort')}
                  </span>
                </button>

		            <button
		              type="button"
		              className="inline-flex h-9 items-center gap-1 rounded-md bg-bg-surface px-2.5 text-xs text-text-secondary hover:bg-bg-elevated"
		              onClick={() => void handleOpenOptions()}
		            >
		              <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
		              {t('popup.openDashboard')}
		            </button>
		          </div>
	        </div>

		        <TextField
              id="popup-search"
              aria-label={t('popup.searchAction')}
		          leftIcon={<Search className="h-3.5 w-3.5" strokeWidth={2} />}
		          placeholder={t('popup.searchPlaceholder')}
		          value={searchTerm}
		          onChange={(event) => setSearchTerm(event.target.value)}
		        />

      </section>

	      <div className="mx-4 h-px bg-(--border)" />

	      <section className="space-y-3 p-4">
	        <div className="rounded-full bg-bg-surface p-1">
	          <div className="grid grid-cols-4 gap-1">
            {(['unread', 'reading', 'done', 'all'] as PopupFilter[]).map((status) => {
              const active = popupFilter === status;
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={active}
                  className={
                    active
                      ? 'rounded-full border border-(--accent-border) bg-accent-subtle px-2 py-1 text-xs font-semibold text-accent'
                      : 'rounded-full border border-transparent px-2 py-1 text-xs text-text-muted hover:border-(--border) hover:bg-bg-base hover:text-text-secondary'
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
          {filteredRecentItems.map((item) => {
            return (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-md border border-transparent px-2 py-2 transition-colors hover:border-(--border) hover:bg-bg-surface"
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
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="block min-w-0 flex-1 truncate text-sm text-text-primary">
                      {renderHighlightedText(item.title, searchTerm)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 min-w-0">
                    <span className="block truncate font-mono text-[11px] text-text-muted">
                      {renderHighlightedText(item.domain, searchTerm)}
                    </span>
                  </span>
                </span>
              </button>

              <button
                type="button"
                className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-(--border) ${statusBadgeClass(item.status)} hover:border-(--accent-border)`}
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
            <p className="m-0 rounded-md bg-bg-surface px-3 py-4 text-xs text-text-muted">
              {t('options.emptyText')}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
