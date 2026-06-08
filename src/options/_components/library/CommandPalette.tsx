import { Download, RefreshCw, Search } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode
} from 'react';
import { useTranslation } from 'react-i18next';
import { getItemPreferredTitle, matchesItemKeyword } from '../../../core/selectors';
import type { FolioItem } from '../../../core/types';
import { FolioMark } from '../../../shared/ui/FolioMark';
import { renderHighlightedText } from '../../../shared/ui/renderHighlightedText';

export type PaletteCommand = 'sync' | 'export';

interface CommandPaletteProps {
  items: FolioItem[];
  syncConnected: boolean;
  onClose: () => void;
  onRunCommand: (command: PaletteCommand) => void;
  onOpenItem: (item: FolioItem) => void;
}

interface CommandEntry {
  id: PaletteCommand;
  labelKey: string;
  icon: ReactNode;
  kbd?: string;
  enabled: boolean;
}

type Row =
  | { kind: 'command'; command: CommandEntry }
  | { kind: 'item'; item: FolioItem };

export function CommandPalette({
  items,
  syncConnected,
  onClose,
  onRunCommand,
  onOpenItem
}: CommandPaletteProps): ReactElement {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commands = useMemo<CommandEntry[]>(
    () => [
      {
        id: 'sync',
        labelKey: 'sync.cmdSyncNow',
        icon: <RefreshCw size={17} className="text-muted-foreground" aria-hidden="true" />,
        enabled: syncConnected
      },
      {
        id: 'export',
        labelKey: 'sync.cmdExportView',
        icon: <Download size={17} className="text-muted-foreground" aria-hidden="true" />,
        enabled: true
      }
    ],
    [syncConnected]
  );

  const rows = useMemo<Row[]>(() => {
    const keyword = query.trim().toLowerCase();
    const matchedCommands = commands.filter(
      (command) => command.enabled && (!keyword || t(command.labelKey).toLowerCase().includes(keyword))
    );
    const matchedItems = (keyword ? items.filter((item) => matchesItemKeyword(item, keyword, true)) : items).slice(
      0,
      8
    );
    return [
      ...matchedCommands.map((command) => ({ kind: 'command' as const, command })),
      ...matchedItems.map((item) => ({ kind: 'item' as const, item }))
    ];
  }, [commands, items, query, t]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function runRow(row: Row): void {
    if (row.kind === 'command') {
      onRunCommand(row.command.id);
    } else {
      onOpenItem(row.item);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, rows.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) {
        runRow(row);
      }
    }
  }

  const firstItemIndex = rows.findIndex((row) => row.kind === 'item');
  const hasCommands = rows.some((row) => row.kind === 'command');

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center pt-[12vh]"
      style={{ background: 'color-mix(in oklch, black 8%, transparent)', backdropFilter: 'blur(2px)' }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="fz-sheet flex h-fit max-h-[70vh] w-[540px] flex-col overflow-hidden rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={t('sync.cmdPlaceholder')}
      >
        <div className="flex h-[52px] items-center gap-3 border-b border-border px-[18px]">
          <Search size={18} className="text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            className="fz-input text-[15px]"
            placeholder={t('sync.cmdPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="folio-scrollbar min-h-[240px] flex-1 overflow-y-auto p-2">
          {rows.length === 0 ? (
            <p className="m-0 px-3 py-10 text-center text-sm text-muted-foreground">
              {t('options.noResultsFor', { query })}
            </p>
          ) : (
            rows.map((row, index) => {
              if (row.kind === 'command' && index === 0) {
                return (
                  <PaletteGroup key="cmd-label" label={t('sync.cmdGroupCommands')}>
                    <PaletteRow
                      active={index === activeIndex}
                      icon={row.command.icon}
                      kbd={row.command.kbd}
                      onClick={() => runRow(row)}
                      onHover={() => setActiveIndex(index)}
                    >
                      {t(row.command.labelKey)}
                    </PaletteRow>
                  </PaletteGroup>
                );
              }
              if (row.kind === 'item' && index === firstItemIndex) {
                return (
                  <PaletteGroup key="item-label" label={t('sync.cmdGroupItems')} withTop={hasCommands}>
                    <PaletteRow
                      active={index === activeIndex}
                      icon={<FolioMark size={18} />}
                      onClick={() => runRow(row)}
                      onHover={() => setActiveIndex(index)}
                    >
                      {renderHighlightedText(getItemPreferredTitle(row.item), query)}
                    </PaletteRow>
                  </PaletteGroup>
                );
              }
              return (
                <PaletteRow
                  key={row.kind === 'command' ? row.command.id : row.item.id}
                  active={index === activeIndex}
                  icon={
                    row.kind === 'command' ? (
                      row.command.icon
                    ) : (
                      <FolioMark size={18} />
                    )
                  }
                  kbd={row.kind === 'command' ? row.command.kbd : undefined}
                  onClick={() => runRow(row)}
                  onHover={() => setActiveIndex(index)}
                >
                  {row.kind === 'command'
                    ? t(row.command.labelKey)
                    : renderHighlightedText(getItemPreferredTitle(row.item), query)}
                </PaletteRow>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3.5 border-t border-border bg-surface-2 px-4 py-2.5 text-xs text-muted-foreground">
          <FootHint kbds={['↑', '↓']}>{t('sync.cmdNavigate')}</FootHint>
          <FootHint kbds={['↵']}>{t('sync.cmdOpen')}</FootHint>
          <FootHint kbds={['esc']}>{t('sync.cmdCloseHint')}</FootHint>
        </div>
      </div>
    </div>
  );
}

function PaletteGroup({
  label,
  children,
  withTop
}: {
  label: string;
  children: ReactNode;
  withTop?: boolean;
}): ReactElement {
  return (
    <>
      <div className={`fz-field-label px-2.5 pb-1.5 ${withTop ? 'pt-3' : 'pt-1.5'}`}>{label}</div>
      {children}
    </>
  );
}

function PaletteRow({
  active,
  icon,
  kbd,
  children,
  onClick,
  onHover
}: {
  active: boolean;
  icon: ReactNode;
  kbd?: string;
  children: ReactNode;
  onClick: () => void;
  onHover: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseMove={onHover}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium ${
        active ? 'bg-muted' : ''
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {kbd ? <span className="fz-kbd shrink-0">{kbd}</span> : null}
    </button>
  );
}

function FootHint({ kbds, children }: { kbds: string[]; children: ReactNode }): ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5">
      {kbds.map((key) => (
        <span key={key} className="fz-kbd fz-kbd-bordered">
          {key}
        </span>
      ))}
      {children}
    </span>
  );
}
