import { Github, Link as LinkIcon, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_GITHUB_BRANCH,
  DEFAULT_GITHUB_OWNER,
  DEFAULT_GITHUB_REPO
} from '../../../core/sync/credentials';
import type {
  GitHubResolveStrategy,
  GitHubStoreDiff,
  GitHubSyncStatus
} from '../../../core/sync/github/types';
import { Button } from '../../../shared/ui/Button';
import { ToggleSwitch } from '../../../shared/ui/ToggleSwitch';
import {
  githubConnect,
  githubDisconnect,
  githubGetDiff,
  githubGetStatus,
  githubPullNow,
  githubPushNow,
  githubResolve
} from '../syncClient';
import type { NoticeState } from '../types';
import { SettingsCard } from '../settings/SettingsCard';
import { ConnectedStrip } from './ConnectedStrip';
import { ReconChooser } from './ReconChooser';
import { ReviewResolve } from './ReviewResolve';

interface GitHubCardProps {
  /** Bumped by App's chrome.storage subscription so the card re-polls status. */
  refreshToken: number;
  onStatusChange: (status: GitHubSyncStatus | null) => void;
  onNotice: (notice: NoticeState) => void;
}

type Mode = 'view' | 'recon' | 'review';

/** Maps a GitHubSyncErrorCode (or raw string) to localized inline copy. */
function errorCopy(code: string | null, t: (key: string) => string): string | null {
  if (!code) {
    return null;
  }
  const key = `sync.err_${code}`;
  const copy = t(key);
  return copy === key ? t('sync.err_generic') : copy;
}

function ConnectField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <label className="block">
      <span className="fz-field-label mb-1.5 block">{label}</span>
      <span className="fz-token-field h-[36px]">
        <input
          className="fz-input fz-mono text-[13px]"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

export function GitHubCard({ refreshToken, onStatusChange, onNotice }: GitHubCardProps): ReactElement {
  const { t } = useTranslation();
  const [status, setStatus] = useState<GitHubSyncStatus | null>(null);
  const [diff, setDiff] = useState<GitHubStoreDiff | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState(false);

  // Inline connect form (no modal — the form lives directly in the card).
  const [token, setToken] = useState('');
  const [owner, setOwner] = useState(DEFAULT_GITHUB_OWNER);
  const [repo, setRepo] = useState(DEFAULT_GITHUB_REPO);
  const [branch, setBranch] = useState(DEFAULT_GITHUB_BRANCH);
  const [persist, setPersist] = useState(true);
  const [validating, setValidating] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  async function refreshStatus(): Promise<GitHubSyncStatus | null> {
    const next = await githubGetStatus();
    setStatus(next);
    onStatusChangeRef.current(next);
    return next;
  }

  useEffect(() => {
    void refreshStatus();
  }, [refreshToken]);

  async function handleConnect(): Promise<void> {
    if (!token.trim() || validating) {
      return;
    }
    setValidating(true);
    setConnectError(null);
    try {
      const result = await githubConnect({ token: token.trim(), owner, repo, branch, persist });
      if (!result.ok) {
        setConnectError(errorCopy(result.error ?? null, t) ?? t('sync.err_generic'));
        return;
      }
      setToken('');
      onNotice({ level: 'success', text: t('sync.connected') });
      await refreshStatus();
    } finally {
      setValidating(false);
    }
  }

  async function handleDisconnect(): Promise<void> {
    await githubDisconnect();
    setMode('view');
    setDiff(null);
    onNotice({ level: 'info', text: t('sync.disconnected') });
    await refreshStatus();
  }

  async function handleSyncNow(): Promise<void> {
    setBusy(true);
    try {
      const result = await githubPushNow();
      const next = await refreshStatus();
      if (!result.ok) {
        if (next?.state === 'diverged') {
          await openRecon();
          return;
        }
        onNotice({ level: 'error', text: errorCopy(result.error ?? null, t) ?? t('sync.err_generic') });
        return;
      }
      onNotice({ level: 'success', text: t('sync.syncedOk') });
    } finally {
      setBusy(false);
    }
  }

  async function handlePull(): Promise<void> {
    setBusy(true);
    try {
      const result = await githubPullNow();
      await refreshStatus();
      if (!result.ok) {
        onNotice({ level: 'error', text: errorCopy(result.error ?? null, t) ?? t('sync.err_generic') });
        return;
      }
      onNotice({ level: 'success', text: t('sync.pulledOk') });
    } finally {
      setBusy(false);
    }
  }

  async function openRecon(): Promise<void> {
    const next = await githubGetDiff();
    if (!next) {
      onNotice({ level: 'error', text: t('sync.err_generic') });
      return;
    }
    setDiff(next);
    setMode('recon');
  }

  async function openReview(): Promise<void> {
    const next = diff ?? (await githubGetDiff());
    if (!next) {
      onNotice({ level: 'error', text: t('sync.err_generic') });
      return;
    }
    setDiff(next);
    setMode('review');
  }

  async function handleResolve(strategy: GitHubResolveStrategy): Promise<void> {
    setBusy(true);
    try {
      const result = await githubResolve(strategy);
      await refreshStatus();
      if (!result.ok) {
        onNotice({ level: 'error', text: errorCopy(result.error ?? null, t) ?? t('sync.err_generic') });
        return;
      }
      setMode('view');
      setDiff(null);
      onNotice({ level: 'success', text: t('sync.resolved') });
    } finally {
      setBusy(false);
    }
  }

  const connected = status != null && status.state !== 'not-connected';

  return (
    <SettingsCard>
      {!connected ? (
        <div>
          <div className="mb-4 flex items-center gap-3.5">
            <span className="fz-icon-circle" style={{ background: 'var(--foreground)', color: 'var(--background)' }}>
              <Github size={22} aria-hidden="true" />
            </span>
            <div className="flex-1">
              <div className="fz-h text-[15px] font-bold">{t('sync.cardTitle')}</div>
              <div className="mt-0.5 text-[13px] text-muted-foreground">{t('sync.cardOffSubtitle')}</div>
            </div>
          </div>

          <div className="fz-field-label mb-1.5">{t('sync.patLabel')}</div>
          <div
            className="fz-token-field"
            style={connectError ? { borderColor: 'var(--danger)', boxShadow: '0 0 0 3px var(--danger-tint)' } : undefined}
          >
            <LinkIcon size={15} className="text-muted-foreground" aria-hidden="true" />
            <input
              type="password"
              className="fz-input fz-mono text-[13px]"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              aria-label={t('sync.patLabel')}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleConnect();
                }
              }}
            />
            {validating ? <span className="fz-dot fz-dot-sync mr-2" /> : null}
          </div>
          {connectError ? (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-danger">
              <TriangleAlert size={13} aria-hidden="true" />
              {connectError}
            </div>
          ) : (
            <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {t('sync.patHint')}{' '}
              <a
                href="https://github.com/settings/personal-access-tokens/new"
                target="_blank"
                rel="noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                {t('sync.patCreateLink')}
              </a>
            </div>
          )}

          <div className="mt-3.5 grid grid-cols-3 gap-2.5">
            <ConnectField label={t('sync.owner')} value={owner} onChange={setOwner} />
            <ConnectField label={t('sync.repo')} value={repo} onChange={setRepo} />
            <ConnectField label={t('sync.branch')} value={branch} onChange={setBranch} />
          </div>

          <div className="mt-3.5 flex items-center gap-2.5 rounded-[9px] border border-border bg-surface-2 px-3 py-2.5">
            <div className="flex-1">
              <div className="text-[13px] font-semibold">{t('sync.rememberLabel')}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{t('sync.rememberHint')}</div>
            </div>
            <ToggleSwitch checked={persist} onChange={setPersist} ariaLabel={t('sync.rememberLabel')} />
          </div>

          <Button
            variant="brand"
            className="mt-4 w-full"
            disabled={validating || !token.trim()}
            onClick={() => void handleConnect()}
          >
            {validating ? (
              <>
                <span className="fz-dot" style={{ background: 'currentColor' }} />
                {t('sync.validating')}
              </>
            ) : (
              <>
                <Github size={16} aria-hidden="true" />
                {t('sync.connectGitHub')}
              </>
            )}
          </Button>
          <p className="mt-3 text-xs leading-[1.55] text-muted-foreground">{t('sync.firstConnectSafety')}</p>
        </div>
      ) : mode === 'recon' && diff ? (
        <ReconChooser
          diff={diff}
          onTakeLocal={() => void handleResolve('take-local')}
          onTakeRemote={() => void handleResolve('take-remote')}
          onReview={() => void openReview()}
        />
      ) : mode === 'review' && diff ? (
        <ReviewResolve
          diff={diff}
          busy={busy}
          onBack={() => setMode(status?.state === 'diverged' ? 'recon' : 'view')}
          onMergeNewest={() => void handleResolve('merge-newest')}
          onTakeLocal={() => void handleResolve('take-local')}
          onTakeRemote={() => void handleResolve('take-remote')}
        />
      ) : status ? (
        <>
          <ConnectedStrip
            status={status}
            busy={busy}
            onSyncNow={() => void handleSyncNow()}
            onPull={() => void handlePull()}
            onDisconnect={() => void handleDisconnect()}
            onRetry={() => void handleSyncNow()}
          />
          {status.state === 'diverged' ? (
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => void openRecon()}>
              {t('sync.reviewDivergence')}
            </Button>
          ) : null}
        </>
      ) : null}
    </SettingsCard>
  );
}
