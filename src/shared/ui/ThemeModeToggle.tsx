import { Monitor, Moon, Sun } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { applyThemeMode, writeThemeMode, type ThemeMode } from '../theme';
import { Segmented, type SegmentedOption } from './Segmented';

interface ThemeModeToggleProps {
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  tight?: boolean;
  className?: string;
}

/**
 * Light / Dark / System segmented control. On change it applies the mode to the
 * document, persists it to chrome.storage (+ localStorage mirror), then calls the
 * parent `onChange` so the surface can keep its own state in sync.
 */
export function ThemeModeToggle({
  mode,
  onChange,
  tight,
  className
}: ThemeModeToggleProps): ReactElement {
  const { t } = useTranslation();

  const options: readonly SegmentedOption<ThemeMode>[] = [
    {
      value: 'light',
      label: t('settings.themeLight'),
      icon: <Sun size={14} strokeWidth={2} aria-hidden="true" />,
      ariaLabel: t('settings.themeLight')
    },
    {
      value: 'dark',
      label: t('settings.themeDark'),
      icon: <Moon size={14} strokeWidth={2} aria-hidden="true" />,
      ariaLabel: t('settings.themeDark')
    },
    {
      value: 'system',
      label: t('settings.themeSystem'),
      icon: <Monitor size={14} strokeWidth={2} aria-hidden="true" />,
      ariaLabel: t('settings.themeSystem')
    }
  ];

  function handleChange(next: ThemeMode): void {
    applyThemeMode(next);
    void writeThemeMode(next);
    onChange(next);
  }

  return (
    <Segmented
      options={options}
      value={mode}
      onChange={handleChange}
      tight={tight}
      className={className}
      ariaLabel={t('settings.theme')}
    />
  );
}
