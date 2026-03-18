export type SupportedLocale = 'en' | 'zh-CN';

const LOCALE_KEY = 'folio-locale';
const DEFAULT_LOCALE: SupportedLocale = 'en';

export async function readStoredLocale(): Promise<SupportedLocale> {
  const data = await chrome.storage.local.get(LOCALE_KEY);
  const locale = data[LOCALE_KEY];

  if (locale === 'en' || locale === 'zh-CN') {
    return locale;
  }

  await chrome.storage.local.set({ [LOCALE_KEY]: DEFAULT_LOCALE });
  return DEFAULT_LOCALE;
}

export async function writeStoredLocale(locale: SupportedLocale): Promise<void> {
  await chrome.storage.local.set({ [LOCALE_KEY]: locale });
}

export function isSupportedLocale(value: string): value is SupportedLocale {
  return value === 'en' || value === 'zh-CN';
}
