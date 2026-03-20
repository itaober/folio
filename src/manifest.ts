import { defineManifest } from '@crxjs/vite-plugin';

const STABLE_EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtRvjyV9Bz+fBct5BnF/pPKsvaqMAcuffnQ9RqNywZmOcMMJAmmNRz/h+mpA6KctYrcgebzLfhgq/jCHRzb+oCOpOKkCIcUGmt7NP3jNMzkh2snFeAFAoJd4x4j8ZnRMzr0LLlorzCvOplrzs1b9/d8Oyu7xoxbEE3gDU+Scdmq1HpLjIrSpqsvBU8zQYVvfp9i4MDN+8uqHXBJu72vthvRBe1bi5zKm0QQkjfmjjzqe1pxmP+2E/CuYgKXH4HnY7Lpfh6CRLkBDzFu2IdfpTYVd0/en4SIydp004vFFvQQJcpM4DOvNWxMMYfrKjbRnwt2iMMgCcDdRIgFxUTxzY2QIDAQAB';

export default defineManifest({
  manifest_version: 3,
  name: '__MSG_appName__',
  description: '__MSG_appDescription__',
  version: '1.0.3',
  key: STABLE_EXTENSION_KEY,
  default_locale: 'en',
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: 'icons/classic-16.png',
      32: 'icons/classic-32.png',
      48: 'icons/classic-48.png',
      128: 'icons/classic-128.png'
    }
  },
  icons: {
    16: 'icons/classic-16.png',
    32: 'icons/classic-32.png',
    48: 'icons/classic-48.png',
    128: 'icons/classic-128.png'
  },
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module'
  },
  permissions: ['storage', 'tabs', 'contextMenus'],
  host_permissions: ['<all_urls>']
});
