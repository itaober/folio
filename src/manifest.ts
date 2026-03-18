import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: '__MSG_appName__',
  description: '__MSG_appDescription__',
  version: '0.1.0',
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
