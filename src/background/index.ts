import { commit, getStore } from '../core/repository';
import { selectItemByUrl } from '../core/selectors';
import type { FolioStatus } from '../core/types';
import { getActionIconPathSet } from '../shared/icons';

const SAVE_MENU_ID = 'folio-save-to-list';

function colorByStatus(status: FolioStatus): string {
  if (status === 'unread') return '#b46e28';
  if (status === 'reading') return '#2a5f8f';
  return '#3a6b3a';
}

async function updateBadge(tabId: number, url?: string): Promise<void> {
  if (!url) {
    await chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  const store = await getStore();
  const item = selectItemByUrl(store, url);

  if (!item) {
    await chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: colorByStatus(item.status)
  });
  await chrome.action.setBadgeText({ tabId, text: '•' });
}

async function applyConfiguredActionIcon(): Promise<void> {
  const store = await getStore();
  await chrome.action.setIcon({
    path: getActionIconPathSet(store.settings.iconVariant)
  });
}

async function updateBadgeForActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) {
    return;
  }

  await updateBadge(tab.id, tab.url);
}

async function saveFromTab(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.url) {
    return;
  }

  await commit({
    type: 'savePage',
    payload: {
      url: tab.url,
      title: tab.title ?? tab.url,
      favicon: tab.favIconUrl ?? ''
    }
  });

  if (tab.id !== undefined) {
    await updateBadge(tab.id, tab.url);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.contextMenus.removeAll(() => {
    void chrome.contextMenus.create({
      id: SAVE_MENU_ID,
      title: 'Save to Folio',
      contexts: ['page']
    });
  });

  void applyConfiguredActionIcon();
  void updateBadgeForActiveTab();
});

chrome.runtime.onStartup.addListener(() => {
  void applyConfiguredActionIcon();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== SAVE_MENU_ID || !tab) {
    return;
  }

  void saveFromTab(tab);
});

chrome.tabs.onActivated.addListener(() => {
  void updateBadgeForActiveTab();
});

chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  void updateBadge(tabId, tab.url);
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  void applyConfiguredActionIcon();
  void updateBadgeForActiveTab();
});
