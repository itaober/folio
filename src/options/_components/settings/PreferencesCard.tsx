import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../../shared/i18n/localeStore';
import type { DefaultViewMode, SavedView } from '../../../core/types';
import type { ThemeMode } from '../../../shared/theme';
import { Button } from '../../../shared/ui/Button';
import { Segmented } from '../../../shared/ui/Segmented';
import { ThemeModeToggle } from '../../../shared/ui/ThemeModeToggle';
import { SettingRow, SettingsCard } from './SettingsCard';

interface PreferencesCardProps {
  locale: SupportedLocale;
  defaultStatus: 'unread' | 'reading';
  optionsDefaultViewMode: DefaultViewMode;
  optionsFixedView: SavedView;
  popupDefaultViewMode: DefaultViewMode;
  popupFixedView: SavedView;
  themeMode: ThemeMode;
  onLocaleChange: (locale: SupportedLocale) => void;
  onDefaultStatusChange: (status: 'unread' | 'reading') => void;
  onOptionsDefaultViewModeChange: (mode: DefaultViewMode) => void;
  onOptionsFixedViewChange: (view: SavedView) => void;
  onPopupDefaultViewModeChange: (mode: DefaultViewMode) => void;
  onPopupFixedViewChange: (view: SavedView) => void;
  onThemeModeChange: (mode: ThemeMode) => void;
}

/** 'last' (remember) + the four fixed views, as one choice. */
type ViewChoice = 'last' | SavedView;

/**
 * Single dropdown for the "opens to" setting: 上次使用 + 待读/在读/已读/全部.
 * Collapses the old segmented(last|fixed) + conditional view picker into one
 * control, so switching never pops a second dropdown or shifts the layout.
 */
function DefaultViewSelect({
  value,
  onChange,
  ariaLabel
}: {
  value: ViewChoice;
  onChange: (choice: ViewChoice) => void;
  ariaLabel: string;
}): ReactElement {
  const { t } = useTranslation();
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
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const choices: ViewChoice[] = ['last', 'unread', 'reading', 'done', 'all'];
  const labelFor = (choice: ViewChoice): string =>
    choice === 'last'
      ? t('settings.rememberLastView')
      : choice === 'all'
        ? t('common.all')
        : t(`common.${choice}`);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        className="min-w-[124px] justify-between"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
      >
        {labelFor(value)}
        <ChevronDown size={13} aria-hidden="true" />
      </Button>
      {open ? (
        <div role="menu" className="fz-card absolute right-0 top-[calc(100%+6px)] z-20 w-44 rounded-[10px] p-1.5 shadow-[var(--shadow-lg)]">
          {choices.map((choice) => (
            <button
              key={choice}
              type="button"
              role="menuitem"
              className="pressable flex w-full items-center justify-between gap-2 rounded-[7px] px-2.5 py-2 text-left text-[13px] font-medium text-foreground hover:bg-muted/60 focus-ring"
              onClick={() => {
                onChange(choice);
                setOpen(false);
              }}
            >
              {labelFor(choice)}
              {choice === value ? <Check size={14} className="text-accent" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PreferencesCard(props: PreferencesCardProps): ReactElement {
  const { t } = useTranslation();

  return (
    <SettingsCard title={t('settings.preferencesTitle')}>
      <SettingRow label={t('settings.language')} hint={t('settings.languageHint')}>
        <Segmented
          tight
          ariaLabel={t('settings.language')}
          value={props.locale}
          onChange={props.onLocaleChange}
          options={[
            { value: 'en', label: t('settings.english') },
            { value: 'zh-CN', label: t('settings.zhCN') }
          ]}
        />
      </SettingRow>

      <SettingRow label={t('options.defaultStatus')} hint={t('settings.defaultStatusRowHint')}>
        <Segmented
          tight
          ariaLabel={t('options.defaultStatus')}
          value={props.defaultStatus}
          onChange={props.onDefaultStatusChange}
          options={[
            { value: 'unread', label: t('common.unread') },
            { value: 'reading', label: t('common.reading') }
          ]}
        />
      </SettingRow>

      <SettingRow label={t('settings.optionsDefaultView')} hint={t('settings.optionsDefaultViewHint')}>
        <DefaultViewSelect
          ariaLabel={t('settings.optionsDefaultView')}
          value={props.optionsDefaultViewMode === 'fixed' ? props.optionsFixedView : 'last'}
          onChange={(choice) => {
            if (choice === 'last') {
              props.onOptionsDefaultViewModeChange('last');
            } else {
              props.onOptionsDefaultViewModeChange('fixed');
              props.onOptionsFixedViewChange(choice);
            }
          }}
        />
      </SettingRow>

      <SettingRow label={t('settings.popupDefaultView')} hint={t('settings.popupDefaultViewHint')}>
        <DefaultViewSelect
          ariaLabel={t('settings.popupDefaultView')}
          value={props.popupDefaultViewMode === 'fixed' ? props.popupFixedView : 'last'}
          onChange={(choice) => {
            if (choice === 'last') {
              props.onPopupDefaultViewModeChange('last');
            } else {
              props.onPopupDefaultViewModeChange('fixed');
              props.onPopupFixedViewChange(choice);
            }
          }}
        />
      </SettingRow>

      <SettingRow label={t('settings.appearance')} hint={t('settings.appearanceHint')} last>
        <ThemeModeToggle mode={props.themeMode} onChange={props.onThemeModeChange} />
      </SettingRow>
    </SettingsCard>
  );
}
