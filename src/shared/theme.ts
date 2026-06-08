export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_MODE_KEY = 'folio:theme-mode';
export const DEFAULT_THEME_MODE: ThemeMode = 'system';
export const THEME_MODE_OPTIONS: readonly ThemeMode[] = ['light', 'dark', 'system'];

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export async function readThemeMode(): Promise<ThemeMode> {
  const data = await chrome.storage.local.get(THEME_MODE_KEY);
  const mode = data[THEME_MODE_KEY];

  if (isThemeMode(mode)) {
    return mode;
  }

  await chrome.storage.local.set({ [THEME_MODE_KEY]: DEFAULT_THEME_MODE });
  return DEFAULT_THEME_MODE;
}

export async function writeThemeMode(mode: ThemeMode): Promise<void> {
  await chrome.storage.local.set({ [THEME_MODE_KEY]: mode });
  // Mirror to localStorage so the synchronous pre-paint script can read it
  // before chrome.storage (async) resolves.
  try {
    localStorage.setItem(THEME_MODE_KEY, mode);
  } catch {
    // localStorage may be unavailable; best-effort only.
  }
}

export function resolveThemeMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return typeof matchMedia === 'function' && matchMedia(DARK_MEDIA_QUERY).matches
      ? 'dark'
      : 'light';
  }
  return mode;
}

let systemModeListener: ((event: MediaQueryListEvent) => void) | null = null;

export function applyThemeMode(mode: ThemeMode): void {
  if (typeof document === 'undefined') {
    return;
  }

  const media =
    typeof matchMedia === 'function' ? matchMedia(DARK_MEDIA_QUERY) : null;

  if (systemModeListener && media) {
    media.removeEventListener('change', systemModeListener);
    systemModeListener = null;
  }

  document.documentElement.classList.toggle('dark', resolveThemeMode(mode) === 'dark');

  if (mode === 'system' && media) {
    systemModeListener = (event: MediaQueryListEvent): void => {
      document.documentElement.classList.toggle('dark', event.matches);
    };
    media.addEventListener('change', systemModeListener);
  }
}

/**
 * Inline pre-paint snippet for popup/options index.html. Best-effort: reads the
 * localStorage mirror of the chosen mode (chrome.storage is async) and falls back
 * to the system preference, then toggles `.dark` before first paint to avoid a flash.
 */
export const PRE_PAINT_SNIPPET = `(function(){try{var m=localStorage.getItem('${THEME_MODE_KEY}');var dark=m==='dark'||((m==='system'||!m)&&matchMedia('${DARK_MEDIA_QUERY}').matches);document.documentElement.classList.toggle('dark',dark);}catch(e){}})();`;
