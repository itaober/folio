import { ArrowLeft, Check } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { getItemPreferredTitle } from '../../../core/selectors';
import type { GitHubDiffEntry, GitHubStoreDiff } from '../../../core/sync/github/types';
import type { FolioItem } from '../../../core/types';
import { Button } from '../../../shared/ui/Button';
import { IconButton } from '../../../shared/ui/IconButton';
import { FolioMark } from '../../../shared/ui/FolioMark';

interface ReviewResolveProps {
  diff: GitHubStoreDiff;
  busy: boolean;
  onBack: () => void;
  onMergeNewest: () => void;
  onTakeLocal: () => void;
  onTakeRemote: () => void;
}

type RowKind = 'add' | 'del' | 'change';

const KIND_TONE: Record<RowKind, { color: string; bg: string; symbol: string }> = {
  add: { color: 'var(--success)', bg: 'var(--success-tint)', symbol: '+' },
  del: { color: 'var(--danger)', bg: 'var(--danger-tint)', symbol: '−' },
  change: { color: 'var(--amber)', bg: 'var(--amber-tint)', symbol: '±' }
};

function entryItem(entry: GitHubDiffEntry): FolioItem | null {
  return entry.local ?? entry.remote;
}

function DiffRow({ kind, entry }: { kind: RowKind; entry: GitHubDiffEntry }): ReactElement {
  const { t } = useTranslation();
  const item = entryItem(entry);
  const tone = KIND_TONE[kind];
  const title = item ? getItemPreferredTitle(item) : entry.url;

  const meta =
    kind === 'add'
      ? t('sync.diffOnlyThisDevice')
      : kind === 'del'
        ? t('sync.diffOnlyGitHub')
        : t('sync.diffChanged');

  return (
    <div className="mb-2 flex items-center gap-3 rounded-[9px] px-3.5 py-3" style={{ background: tone.bg }}>
      <span className="w-[18px] text-center text-[15px] font-extrabold" style={{ color: tone.color }}>
        {tone.symbol}
      </span>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-surface">
        <FolioMark size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold">{title}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</div>
      </div>
    </div>
  );
}

export function ReviewResolve({
  diff,
  busy,
  onBack,
  onMergeNewest,
  onTakeLocal,
  onTakeRemote
}: ReviewResolveProps): ReactElement {
  const { t } = useTranslation();
  const differences = diff.added.length + diff.removed.length + diff.changed.length;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <IconButton size="sm" aria-label={t('common.cancel')} onClick={onBack}>
          <ArrowLeft size={17} aria-hidden="true" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <div className="fz-h text-base font-bold">{t('sync.reviewResolve')}</div>
          <div className="mt-0.5 text-[13px] text-muted-foreground">
            {t('sync.reviewSummary', {
              count: differences,
              settings: diff.settingsDiffer ? t('sync.settingsDiffer') : t('sync.settingsInSync')
            })}
          </div>
        </div>
        <Button variant="brand" size="sm" disabled={busy} onClick={onMergeNewest}>
          <Check size={15} aria-hidden="true" />
          {t('sync.mergeKeepNewest')}
        </Button>
      </div>

      <div className="mb-3.5 flex gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={onTakeLocal}>
          {t('sync.takeAllThisDevice')}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onTakeRemote}>
          {t('sync.takeAllGitHub')}
        </Button>
      </div>

      <div className="folio-scrollbar max-h-[360px] overflow-y-auto">
        {diff.changed.map((entry) => (
          <DiffRow key={`change-${entry.url}`} kind="change" entry={entry} />
        ))}
        {diff.added.map((entry) => (
          <DiffRow key={`add-${entry.url}`} kind="add" entry={entry} />
        ))}
        {diff.removed.map((entry) => (
          <DiffRow key={`del-${entry.url}`} kind="del" entry={entry} />
        ))}
        {differences === 0 ? (
          <p className="m-0 px-2 py-6 text-center text-[13px] text-muted-foreground">{t('sync.noDifferences')}</p>
        ) : null}
      </div>
    </div>
  );
}
