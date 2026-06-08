import { Download, GitBranch, Github, Upload } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { GitHubSyncStatus } from '../../../core/sync/github/types';
import { Button } from '../../../shared/ui/Button';
import { formatRelativeTime } from '../format';
import { SettingRow } from '../settings/SettingsCard';

interface ConnectedStripProps {
  status: GitHubSyncStatus;
  busy: boolean;
  onSyncNow: () => void;
  onPull: () => void;
  onDisconnect: () => void;
  onRetry: () => void;
}

type StripTone = 'ok' | 'syncing' | 'error' | 'diverged' | 'pending';

const TONE_BG: Record<StripTone, string> = {
  ok: 'var(--success-tint)',
  syncing: 'var(--brand-tint)',
  error: 'var(--danger-tint)',
  diverged: 'var(--amber-tint)',
  pending: 'var(--amber-tint)'
};

const TONE_DOT: Record<StripTone, string> = {
  ok: 'fz-dot-ok',
  syncing: 'fz-dot-sync',
  error: 'fz-dot-error',
  diverged: 'fz-dot-dirty',
  pending: 'fz-dot-dirty'
};

const TONE_COLOR: Record<StripTone, string> = {
  ok: 'var(--st-done-fg)',
  syncing: 'var(--brand-hover)',
  error: 'var(--danger)',
  diverged: 'var(--amber)',
  pending: 'var(--amber)'
};

export function ConnectedStrip({
  status,
  busy,
  onSyncNow,
  onPull,
  onDisconnect,
  onRetry
}: ConnectedStripProps): ReactElement {
  const { t } = useTranslation();
  const connection = status.connection;

  let tone: StripTone = 'ok';
  let labelKey = 'sync.stripInSync';
  if (status.state === 'syncing') {
    tone = 'syncing';
    labelKey = 'sync.stripSyncing';
  } else if (status.state === 'diverged') {
    tone = 'diverged';
    labelKey = 'sync.stripDiverged';
  } else if (status.state === 'error' || status.state === 'rate-limited' || status.state === 'offline') {
    tone = 'error';
    labelKey = 'sync.stripFailed';
  } else if (status.pendingLocalChanges) {
    // Synced last time, but there are local edits not yet pushed.
    tone = 'pending';
    labelKey = 'sync.stripPending';
  }

  const sub =
    tone === 'error' && status.lastSyncError
      ? status.lastSyncError
      : `${t('settings.lastSyncedAt')} · ${formatRelativeTime(status.lastSyncedAt, t)}`;

  return (
    <div>
      <div className="flex items-center gap-3 px-1 pb-[18px] pt-1">
        <span className="fz-icon-circle" style={{ background: 'var(--foreground)', color: 'var(--background)' }}>
          <Github size={22} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="fz-h truncate text-[15px] font-bold">
            {connection ? `${connection.owner} / ${connection.repo}` : 'GitHub'}
          </div>
          <div className="mt-0.5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <GitBranch size={13} aria-hidden="true" />
            {connection ? t('sync.branchLabel', { branch: connection.branch }) : ''}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onDisconnect}>
          {t('sync.disconnect')}
        </Button>
      </div>

      <div
        className="mb-4 flex items-center gap-2.5 rounded-[10px] px-3.5 py-3"
        style={{ background: TONE_BG[tone] }}
      >
        <span className={`fz-dot ${TONE_DOT[tone]}`} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold" style={{ color: TONE_COLOR[tone] }}>
            {t(labelKey)}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>
        </div>
        {tone === 'error' ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('sync.retry')}
          </Button>
        ) : null}
      </div>

      <SettingRow label={t('sync.pushDir')} hint={t('sync.pushDesc')}>
        <span className="flex items-center gap-2">
          {status.pendingLocalChanges ? (
            <span className="fz-dot fz-dot-dirty" title={t('sync.stripPending')} aria-hidden="true" />
          ) : null}
          <Button variant="ink" size="sm" className="w-[104px] justify-center" disabled={busy} onClick={onSyncNow}>
            <Upload size={15} aria-hidden="true" />
            {t('sync.pushNow')}
          </Button>
        </span>
      </SettingRow>
      <SettingRow label={t('sync.pullDir')} hint={t('sync.pullDesc')} last>
        <Button variant="outline" size="sm" className="w-[104px] justify-center" disabled={busy} onClick={onPull}>
          <Download size={15} aria-hidden="true" />
          {t('sync.pull')}
        </Button>
      </SettingRow>
      <p className="mt-3 text-xs leading-[1.55] text-muted-foreground">{t('sync.mergeNote')}</p>
    </div>
  );
}
