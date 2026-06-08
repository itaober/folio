import { List, Settings, Tag } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { GitHubSyncStatus } from '../../../core/sync/github/types';
import { FolioMark } from '../../../shared/ui/FolioMark';
import type { ViewKey } from '../types';
import { SyncChip } from './SyncChip';

interface SidebarProps {
  view: ViewKey;
  activeTagFilter: string | null;
  counts: { all: number; unread: number; reading: number; done: number };
  tags: string[];
  tagCounts: Record<string, number>;
  syncStatus: GitHubSyncStatus | null;
  onChangeView: (view: ViewKey) => void;
  onSelectTag: (tag: string) => void;
  onOpenSync: () => void;
}

interface NavItemProps {
  label: ReactNode;
  count?: number;
  active: boolean;
  icon?: ReactNode;
  dotColor?: string;
  onClick: () => void;
}

function NavItem({ label, count, active, icon, dotColor, onClick }: NavItemProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left focus-ring ${
        active
          ? 'bg-muted font-semibold text-foreground'
          : 'font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      }`}
    >
      {dotColor ? (
        <span className="fz-dot" style={{ background: dotColor, width: 8, height: 8 }} />
      ) : (
        icon
      )}
      <span className="min-w-0 flex-1 truncate text-[13.5px] leading-none">{label}</span>
      {count != null ? (
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">{count}</span>
      ) : null}
    </button>
  );
}

export function Sidebar({
  view,
  activeTagFilter,
  counts,
  tags,
  tagCounts,
  syncStatus,
  onChangeView,
  onSelectTag,
  onOpenSync
}: SidebarProps): ReactElement {
  const { t } = useTranslation();

  return (
    <aside className="flex h-screen w-[234px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2.5 px-[18px] pb-3.5 pt-[18px]">
        <FolioMark size={22} />
        <span className="text-lg font-bold tracking-[-0.3px]">Folio</span>
      </div>

      <div className="folio-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-1">
        <NavItem
          label={t('common.all')}
          count={counts.all}
          active={view === 'all' && !activeTagFilter}
          icon={<List size={16} className="text-muted-foreground" aria-hidden="true" />}
          onClick={() => onChangeView('all')}
        />
        <NavItem
          label={t('common.unread')}
          count={counts.unread}
          active={view === 'unread'}
          dotColor="var(--amber)"
          onClick={() => onChangeView('unread')}
        />
        <NavItem
          label={t('common.reading')}
          count={counts.reading}
          active={view === 'reading'}
          dotColor="var(--brand)"
          onClick={() => onChangeView('reading')}
        />
        <NavItem
          label={t('common.done')}
          count={counts.done}
          active={view === 'done'}
          dotColor="var(--success)"
          onClick={() => onChangeView('done')}
        />

        <div className="fz-field-label px-2.5 pb-2 pt-4">{t('options.tagsSection')}</div>
        {tags.length === 0 ? (
          <p className="m-0 px-2.5 py-1 text-[13px] text-muted-foreground">
            {t('options.tagsEmpty')}
          </p>
        ) : (
          tags.map((tag) => (
            <NavItem
              key={tag}
              label={tag}
              count={tagCounts[tag] ?? 0}
              active={activeTagFilter === tag}
              icon={<Tag size={16} className="text-muted-foreground" aria-hidden="true" />}
              onClick={() => onSelectTag(tag)}
            />
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border p-3">
        <SyncChip status={syncStatus} onClick={onOpenSync} />
        <NavItem
          label={t('common.settings')}
          active={view === 'settings'}
          icon={<Settings size={16} className="text-muted-foreground" aria-hidden="true" />}
          onClick={() => onChangeView('settings')}
        />
      </div>
    </aside>
  );
}
