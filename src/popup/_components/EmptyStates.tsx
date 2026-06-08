import { BookOpen, Bookmark, CheckCheck, Clock3, Search } from 'lucide-react';
import type { ReactElement } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { FolioStatus } from '../../core/types';
import { Button } from '../../shared/ui/Button';

/** Cold first-run empty — inviting, teaches the two ways to capture. */
export function EmptyCold(): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-8 text-center">
      <div className="fz-icon-circle mb-2" style={{ width: 52, height: 52 }}>
        <Bookmark size={22} strokeWidth={2} />
      </div>
      <div className="fz-h" style={{ fontWeight: 700 }}>
        {t('popup.emptyColdTitle')}
      </div>
      <p className="fz-sm m-0 mt-0.5 text-muted-foreground" style={{ lineHeight: 1.55 }}>
        <Trans
          i18nKey="popup.emptyColdBody"
          components={{ b: <b className="text-foreground" /> }}
        />
      </p>
    </div>
  );
}

const FILTER_ICON: Record<FolioStatus, typeof BookOpen> = {
  unread: Clock3,
  reading: BookOpen,
  done: CheckCheck
};

/** Filtered empty — the active status filter has no matches. Quiet, never a dead-end. */
export function EmptyFiltered({ status }: { status: FolioStatus }): ReactElement {
  const { t } = useTranslation();
  const Icon = FILTER_ICON[status];
  const label = t(`common.${status}`);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-8 text-center">
      <div className="mb-1.5 flex h-11 w-11 items-center justify-center rounded-pill bg-[var(--muted)] text-muted-foreground">
        <Icon size={20} strokeWidth={2} />
      </div>
      <div className="fz-h" style={{ fontWeight: 600 }}>
        {t('popup.emptyFilteredTitle', { status: label })}
      </div>
      <p className="fz-sm m-0 mt-0.5 text-muted-foreground">
        {t('popup.emptyFilteredBody', { status: label.toLowerCase() })}
      </p>
    </div>
  );
}

/** No search results — echoes the query and offers a one-tap clear. */
export function NoResults({
  query,
  onClear
}: {
  query: string;
  onClear: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-9 text-center">
      <Search size={24} strokeWidth={2} className="text-muted-foreground" />
      <div className="fz-h" style={{ fontWeight: 600 }}>
        {t('popup.noResults', { query })}
      </div>
      <Button variant="outline" size="sm" className="mt-1" onClick={onClear}>
        {t('popup.clearSearch')}
      </Button>
    </div>
  );
}
