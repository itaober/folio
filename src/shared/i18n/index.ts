import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './resources/en';
import zhCN from './resources/zh-CN';
import { readStoredLocale, type SupportedLocale } from './localeStore';

let isInitialized = false;

function applyDocumentLocale(locale: SupportedLocale): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en';
  document.documentElement.dir = 'ltr';
}

export async function initI18n(): Promise<void> {
  if (isInitialized) {
    return;
  }

  const locale = await readStoredLocale();

  await i18n
    .use(initReactI18next)
    .init({
      lng: locale,
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false
      },
      resources: {
        en: { translation: en },
        'zh-CN': { translation: zhCN }
      }
    });

  applyDocumentLocale(locale);
  isInitialized = true;
}

export async function changeLanguage(locale: SupportedLocale): Promise<void> {
  await i18n.changeLanguage(locale);
  applyDocumentLocale(locale);
}

export default i18n;
