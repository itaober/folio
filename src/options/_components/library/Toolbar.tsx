import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Download,
  File as FileIcon,
  Search
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode
} from 'react';
import { useTranslation } from 'react-i18next';
import type { SortMode } from '../../../core/selectors';
import { Button } from '../../../shared/ui/Button';
import { Segmented } from '../../../shared/ui/Segmented';
import type { ExportScope } from '../types';

interface ToolbarProps {
  title: string;
  count: number;
  search: string;
  sortMode: SortMode;
  exportScope: ExportScope;
  onSearchChange: (value: string) => void;
  onSortChange: (mode: SortMode) => void;
  onExportScopeChange: (scope: ExportScope) => void;
  onExport: (format: 'json' | 'csv' | 'markdown') => void;
}

interface DropdownProps {
  label: string;
  icon: ReactNode;
  width: number;
  children: (close: () => void) => ReactNode;
}

function Dropdown({ label, icon, width, children }: DropdownProps): ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        className="h-[34px]"
        style={open ? { borderColor: 'var(--brand)' } : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {icon}
        {label}
        <ChevronDown size={14} className="opacity-60" aria-hidden="true" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="fz-card absolute right-0 top-[calc(100%+6px)] z-20 rounded-[10px] p-1.5 shadow-[var(--shadow-lg)]"
          style={{ width }}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

interface DDItemProps {
  active?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
}

function DDItem({ active, icon, children, onClick }: DDItemProps): ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`pressable flex w-full items-center gap-2 rounded-[7px] px-2.5 py-2 text-left text-[13px] font-medium focus-ring ${
        active ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted/60'
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active ? <Check size={15} className="text-accent" aria-hidden="true" /> : null}
    </button>
  );
}

const SORT_OPTIONS: ReadonlyArray<{ value: SortMode; labelKey: string }> = [
  { value: 'saved_desc', labelKey: 'options.sortNewest' },
  { value: 'saved_asc', labelKey: 'options.sortOldest' },
  { value: 'domain_asc', labelKey: 'options.sortDomain' },
  { value: 'title_asc', labelKey: 'options.sortTitle' },
  { value: 'status', labelKey: 'options.sortStatus' }
];

export function Toolbar({
  title,
  count,
  search,
  sortMode,
  exportScope,
  onSearchChange,
  onSortChange,
  onExportScopeChange,
  onExport
}: ToolbarProps): ReactElement {
  const { t } = useTranslation();
  const activeSort = SORT_OPTIONS.find((option) => option.value === sortMode) ?? SORT_OPTIONS[0];

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape' && search) {
      event.preventDefault();
      onSearchChange('');
    }
  }

  return (
    <div className="flex items-center gap-3 py-[18px] pt-[22px]">
      <div className="shrink-0">
        <div className="fz-display" style={{ fontSize: 23 }}>
          {title}
        </div>
        <div className="mt-0.5 whitespace-nowrap text-[13px] text-muted-foreground">
          {t('options.totalCount', { count })}
        </div>
      </div>

      <div className="flex-1" />

      <div className="fz-token-field h-[34px] w-[208px] pl-3">
        <Search size={15} className="text-muted-foreground" aria-hidden="true" />
        <input
          id="options-search"
          aria-label={t('options.searchPlaceholder')}
          className="fz-input text-[13px]"
          placeholder={t('options.searchPlaceholder')}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        <span className="fz-kbd ml-auto">{search ? 'esc' : '⌘K'}</span>
      </div>

      <Dropdown
        label={t(activeSort.labelKey)}
        icon={<ArrowUpDown size={15} aria-hidden="true" />}
        width={180}
      >
        {(close) =>
          SORT_OPTIONS.map((option) => (
            <DDItem
              key={option.value}
              active={option.value === sortMode}
              onClick={() => {
                onSortChange(option.value);
                close();
              }}
            >
              {t(option.labelKey)}
            </DDItem>
          ))
        }
      </Dropdown>

      <Dropdown
        label={t('options.export')}
        icon={<Download size={15} aria-hidden="true" />}
        width={210}
      >
        {(close) => (
          <>
            <div className="fz-field-label px-2 pb-2 pt-1">{t('options.exportScope')}</div>
            <div className="mb-2 px-1">
              <Segmented
                tight
                ariaLabel={t('options.exportScope')}
                value={exportScope}
                onChange={onExportScopeChange}
                options={[
                  { value: 'current', label: t('options.exportScopeCurrent') },
                  { value: 'all', label: t('options.exportScopeAll') }
                ]}
              />
            </div>
            <div className="mx-1 mb-1.5 mt-0.5 h-px bg-border" />
            <DDItem
              icon={<FileIcon size={15} className="text-muted-foreground" aria-hidden="true" />}
              onClick={() => {
                onExport('json');
                close();
              }}
            >
              {t('options.exportJsonShort')}
            </DDItem>
            <DDItem
              icon={<FileIcon size={15} className="text-muted-foreground" aria-hidden="true" />}
              onClick={() => {
                onExport('csv');
                close();
              }}
            >
              {t('options.exportCsvShort')}
            </DDItem>
            <DDItem
              icon={<FileIcon size={15} className="text-muted-foreground" aria-hidden="true" />}
              onClick={() => {
                onExport('markdown');
                close();
              }}
            >
              {t('options.exportMarkdownShort')}
            </DDItem>
          </>
        )}
      </Dropdown>
    </div>
  );
}
