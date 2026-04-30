import { defineManifest } from '@crxjs/vite-plugin';
import { resolveBuildChannel } from './shared/buildChannel';

const STABLE_EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtRvjyV9Bz+fBct5BnF/pPKsvaqMAcuffnQ9RqNywZmOcMMJAmmNRz/h+mpA6KctYrcgebzLfhgq/jCHRzb+oCOpOKkCIcUGmt7NP3jNMzkh2snFeAFAoJd4x4j8ZnRMzr0LLlorzCvOplrzs1b9/d8Oyu7xoxbEE3gDU+Scdmq1HpLjIrSpqsvBU8zQYVvfp9i4MDN+8uqHXBJu72vthvRBe1bi5zKm0QQkjfmjjzqe1pxmP+2E/CuYgKXH4HnY7Lpfh6CRLkBDzFu2IdfpTYVd0/en4SIydp004vFFvQQJcpM4DOvNWxMMYfrKjbRnwt2iMMgCcDdRIgFxUTxzY2QIDAQAB';
const DEV_EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAux5Zwa5sWjVhlOpT1Uyf91qllzO0D+syS99yz+FMr+HTtOI9O4K5lC+G4pH4Agop/mxJWu3kaA2H7HRkNixOak0d8xnD29x3QwkDijFyVXtLIxPoA+BB9WsWf5lWnnIQT3tutcEGZ9fBjOjur6RAf2qql2dMquVqudOo5ChFvf582hfmrQ0ERhcQrTgAfjQ/hqQDS1ZNM7sZybsGHw/QWml4eQGrXuJP8H7933WWKPqhb6ciWTUw7ihRhktWWcHmg1bHEn18JVkYFUIRHgOePbaaTNmVZ2cBkMItjukJJt+kd336nQ/VoTFFsmLvG7TtKCzGqqE/Defc0tNpmtJgmQIDAQAB';
const BUILD_CHANNEL = resolveBuildChannel(process.env.FOLIO_BUILD_CHANNEL);
const APP_NAME_KEY = BUILD_CHANNEL === 'dev' ? 'appNameDev' : 'appName';
const CLASSIC_ICON_PREFIX = BUILD_CHANNEL === 'dev' ? 'dev-classic' : 'classic';

export default defineManifest({
  manifest_version: 3,
  name: `__MSG_${APP_NAME_KEY}__`,
  description: '__MSG_appDescription__',
  version: '1.0.11',
  key: BUILD_CHANNEL === 'dev' ? DEV_EXTENSION_KEY : STABLE_EXTENSION_KEY,
  default_locale: 'en',
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: `icons/${CLASSIC_ICON_PREFIX}-16.png`,
      32: `icons/${CLASSIC_ICON_PREFIX}-32.png`,
      48: `icons/${CLASSIC_ICON_PREFIX}-48.png`,
      128: `icons/${CLASSIC_ICON_PREFIX}-128.png`
    }
  },
  icons: {
    16: `icons/${CLASSIC_ICON_PREFIX}-16.png`,
    32: `icons/${CLASSIC_ICON_PREFIX}-32.png`,
    48: `icons/${CLASSIC_ICON_PREFIX}-48.png`,
    128: `icons/${CLASSIC_ICON_PREFIX}-128.png`
  },
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module'
  },
  permissions: ['storage', 'tabs', 'contextMenus', 'scripting'],
  host_permissions: ['<all_urls>']
});
