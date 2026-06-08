import { Bookmark, Search } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';

interface EmptyStateProps {
  /** 'cold' = nothing saved; 'no-results' = search miss; 'filtered' = quiet filter miss. */
  variant: 'cold' | 'no-results' | 'filtered';
  query?: string;
  onClearSearch?: () => void;
}

export function EmptyState({ variant, query, onClearSearch }: EmptyStateProps): ReactElement {
  const { t } = useTranslation();

  if (variant === 'no-results') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 pt-24 text-center">
        <Search size={24} className="text-muted-foreground" aria-hidden="true" />
        <div className="fz-h font-semibold">{t('options.noResultsFor', { query })}</div>
        {onClearSearch ? (
          <Button variant="outline" size="sm" className="mt-1" onClick={onClearSearch}>
            {t('options.clearSearch')}
          </Button>
        ) : null}
      </div>
    );
  }

  if (variant === 'filtered') {
    return (
      <div className="flex flex-col items-center justify-center gap-1 px-6 pt-24 text-center">
        <p className="m-0 text-sm text-muted-foreground">{t('options.emptyFiltered')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 pt-24 text-center">
      <span className="fz-icon-circle" style={{ width: 54, height: 54 }}>
        <Bookmark size={24} aria-hidden="true" />
      </span>
      <div className="fz-title mt-1">{t('options.emptyTitle')}</div>
      <p className="m-0 max-w-[320px] text-[13px] leading-[1.55] text-muted-foreground">
        {t('options.emptyText')}
      </p>
    </div>
  );
}
