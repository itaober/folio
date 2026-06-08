import { ChevronRight, Github } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  GitHubSyncState,
  GitHubSyncStatus
} from '../../../core/sync/github/types';
import { formatRelativeTime } from '../format';

interface SyncChipProps {
  status: GitHubSyncStatus | null;
  onClick: () => void;
}

interface ChipMeta {
  dot: string | null;
  labelKey: string;
  color: string;
}

const CHIP_META: Record<GitHubSyncState, ChipMeta> = {
  'not-connected': { dot: null, labelKey: 'sync.chipNotConnected', color: 'var(--muted-foreground)' },
  idle: { dot: 'fz-dot-ok', labelKey: 'sync.chipConnected', color: 'var(--muted-foreground)' },
  syncing: { dot: 'fz-dot-sync', labelKey: 'sync.chipSyncing', color: 'var(--brand-hover)' },
  synced: { dot: 'fz-dot-ok', labelKey: 'sync.chipInSync', color: 'var(--st-done-fg)' },
  error: { dot: 'fz-dot-error', labelKey: 'sync.chipError', color: 'var(--danger)' },
  diverged: { dot: 'fz-dot-dirty', labelKey: 'sync.chipDiverged', color: 'var(--amber)' },
  'rate-limited': { dot: 'fz-dot-dirty', labelKey: 'sync.chipRateLimited', color: 'var(--amber)' },
  offline: { dot: 'fz-dot-idle', labelKey: 'sync.chipOffline', color: 'var(--muted-foreground)' }
};

/** The always-on sync truth pinned at the bottom of the nav (8 states). */
export function SyncChip({ status, onClick }: SyncChipProps): ReactElement {
  const { t } = useTranslation();
  const state: GitHubSyncState = status?.state ?? 'not-connected';
  const meta = CHIP_META[state];

  function subLabel(): string {
    switch (state) {
      case 'not-connected':
        return t('sync.chipSetUp');
      case 'error':
        return t('sync.chipTapRetry');
      case 'diverged':
        return t('sync.chipNeedsReview');
      case 'offline':
        return t('sync.chipWillSyncLater');
      case 'rate-limited':
        return t('sync.chipResumesLater');
      case 'syncing':
        return t('sync.chipPushing');
      default:
        return formatRelativeTime(status?.lastSyncedAt ?? null, t);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-left hover:border-border-strong focus-ring"
    >
      {meta.dot ? (
        <span className={`fz-dot ${meta.dot}`} />
      ) : (
        <Github size={15} className="text-muted-foreground" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold" style={{ color: meta.color }}>
          {t(meta.labelKey)}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {subLabel()}
        </span>
      </span>
      <ChevronRight size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
