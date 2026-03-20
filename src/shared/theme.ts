import type { FolioIconVariant } from './icons';

export const FOLIO_THEMES = ['warm', 'mono'] as const;

export type FolioTheme = (typeof FOLIO_THEMES)[number];

export const DEFAULT_THEME: FolioTheme = 'warm';
export const THEME_DATASET_KEY = 'folioTheme';
export const FOLIO_THEME_OPTIONS: readonly FolioTheme[] = FOLIO_THEMES;

export const FOLIO_THEME_META: Record<
  FolioTheme,
  {
    labelKey: 'settings.themeWarm' | 'settings.themeMono';
  }
> = {
  warm: {
    labelKey: 'settings.themeWarm'
  },
  mono: {
    labelKey: 'settings.themeMono'
  }
};

export function isFolioTheme(value: unknown): value is FolioTheme {
  return typeof value === 'string' && FOLIO_THEMES.includes(value as FolioTheme);
}

export function resolveFolioTheme(value: unknown): FolioTheme {
  if (isFolioTheme(value)) {
    return value;
  }

  if (value === 'folio') {
    return 'warm';
  }

  if (value === 'notion') {
    return 'warm';
  }

  return DEFAULT_THEME;
}

export function getThemeIconVariant(theme: FolioTheme): FolioIconVariant {
  return theme === 'mono' ? 'mono' : 'classic';
}

export function applyDocumentTheme(theme: FolioTheme): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.dataset[THEME_DATASET_KEY] = theme;
}
