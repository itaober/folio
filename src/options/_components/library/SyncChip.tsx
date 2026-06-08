import { Github } from 'lucide-react';
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
}

const CHIP_META: Record<GitHubSyncState, ChipMeta> = {
  'not-connected': { dot: null, labelKey: 'sync.chipNotConnected' },
  idle: { dot: 'fz-dot-ok', labelKey: 'sync.chipConnected' },
  syncing: { dot: 'fz-dot-sync', labelKey: 'sync.chipSyncing' },
  synced: { dot: 'fz-dot-ok', labelKey: 'sync.chipInSync' },
  error: { dot: 'fz-dot-error', labelKey: 'sync.chipError' },
  diverged: { dot: 'fz-dot-dirty', labelKey: 'sync.chipDiverged' },
  'rate-limited': { dot: 'fz-dot-dirty', labelKey: 'sync.chipRateLimited' },
  offline: { dot: 'fz-dot-idle', labelKey: 'sync.chipOffline' }
};

/**
 * The always-on sync truth pinned at the bottom of the nav (8 states). Styled as
 * a twin of the sidebar's NavItem — a borderless ghost row whose colored dot
 * carries the state (the same dot+label idiom the Unread/Reading/Done items use),
 * with the relative time / action hint in the trailing "count" slot — so the
 * footer reads as two consistent rows with the Settings item below it. State hue
 * lives only in the dot, keeping the row ink-first like every other nav row.
 */
export function SyncChip({ status, onClick }: SyncChipProps): ReactElement {
  const { t } = useTranslation();
  const state: GitHubSyncState = status?.state ?? 'not-connected';
  const meta = CHIP_META[state];

  // Trailing meta = NavItem's count slot: a relative timestamp for the steady
  // states, a short status / action word for the rest.
  function trailing(): string {
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
      aria-label={`${t(meta.labelKey)} — ${trailing()}`}
      className="pressable flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-ring"
    >
      {meta.dot ? (
        <span className={`fz-dot ${meta.dot}`} style={{ width: 8, height: 8 }} aria-hidden="true" />
      ) : (
        <Github size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate text-[13.5px] leading-none">{t(meta.labelKey)}</span>
      {state === 'not-connected' ? (
        // Not connected → a small static amber dot in place of a timestamp: a
        // quiet "needs connecting" nudge, no extra copy required.
        <span
          className="fz-dot fz-dot-dirty shrink-0"
          style={{ width: 8, height: 8 }}
          aria-hidden="true"
        />
      ) : (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{trailing()}</span>
      )}
    </button>
  );
}
