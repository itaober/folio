import { ChevronRight, Download, GitBranch, Upload } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { GitHubStoreDiff } from '../../../core/sync/github/types';

interface ReconChooserProps {
  diff: GitHubStoreDiff;
  onTakeLocal: () => void;
  onTakeRemote: () => void;
  onReview: () => void;
}

function Choice({
  icon,
  title,
  sub,
  primary,
  onClick
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  primary?: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fz-card flex w-full items-center gap-3.5 px-4 py-3.5 text-left focus-ring"
      style={{
        borderColor: primary ? 'var(--brand)' : 'var(--border)',
        background: primary ? 'var(--brand-tint)' : 'var(--surface)'
      }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
        style={{
          background: primary ? 'var(--brand)' : 'var(--muted)',
          color: primary ? 'var(--on-brand)' : 'var(--foreground)'
        }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="fz-h text-sm font-semibold">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
      </div>
      <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

export function ReconChooser({ diff, onTakeLocal, onTakeRemote, onReview }: ReconChooserProps): ReactElement {
  const { t } = useTranslation();

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5 rounded-[10px] px-3.5 py-3" style={{ background: 'var(--amber-tint)' }}>
        <span className="fz-dot fz-dot-dirty" />
        <div className="flex-1">
          <div className="text-[13px] font-bold" style={{ color: 'var(--amber)' }}>
            {t('sync.divergedTitle')}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{t('sync.divergedSubtitle')}</div>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <Choice
          icon={<Upload size={18} aria-hidden="true" />}
          title={t('sync.useThisDevice')}
          sub={t('sync.useThisDeviceSub', { count: diff.localCount })}
          onClick={onTakeLocal}
        />
        <Choice
          icon={<Download size={18} aria-hidden="true" />}
          title={t('sync.useGitHub')}
          sub={t('sync.useGitHubSub', { count: diff.remoteCount })}
          onClick={onTakeRemote}
        />
        <Choice
          icon={<GitBranch size={18} aria-hidden="true" />}
          title={t('sync.reviewResolve')}
          sub={t('sync.reviewResolveSub')}
          primary
          onClick={onReview}
        />
      </div>
    </div>
  );
}
