import { commit, getStore } from '../core/repository';
import { selectItemByUrl } from '../core/selectors';
import { getActionIconPathSet } from '../shared/icons';
import { getThemeIconVariant, resolveFolioTheme } from '../shared/theme';

const SAVE_MENU_ID = 'folio-save-to-list';

function isMissingTabError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return message.includes('No tab with id');
}

function getSavedBadgeStyle(iconVariant: unknown): {
  background: string;
  textColor: string;
  text: string;
} {
  const normalized = iconVariant === 'mono' ? 'mono' : 'classic';

  if (normalized === 'mono') {
    return {
      background: '#2f2f2f',
      textColor: '#ffffff',
      text: '✓'
    };
  }

  return {
    background: '#a14f2c',
    textColor: '#fff9f3',
    text: '✓'
  };
}

async function clearBadge(tabId: number): Promise<void> {
  await chrome.action.setBadgeText({ tabId, text: '' });
}

async function setSavedBadge(tabId: number, iconVariant: unknown): Promise<void> {
  const style = getSavedBadgeStyle(iconVariant);

  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: style.background
  });

  const actionApi = chrome.action as typeof chrome.action & {
    setBadgeTextColor?: (details: {
      tabId?: number;
      color: string | [number, number, number, number];
    }) => Promise<void>;
  };

  if (typeof actionApi.setBadgeTextColor === 'function') {
    await actionApi.setBadgeTextColor({
      tabId,
      color: style.textColor
    });
  }

  await chrome.action.setBadgeText({
    tabId,
    text: style.text
  });
}

async function updateBadge(tabId: number, url?: string): Promise<void> {
  try {
    const store = await getStore();
    const theme = resolveFolioTheme(store.settings.theme);
    const iconVariant = getThemeIconVariant(theme);
    const iconPaths = getActionIconPathSet(iconVariant);
    await chrome.action.setIcon({ tabId, path: iconPaths });

    if (!url) {
      await clearBadge(tabId);
      return;
    }

    const item = selectItemByUrl(store, url);

    if (!item) {
      await clearBadge(tabId);
      return;
    }

    await setSavedBadge(tabId, iconVariant);
  } catch (error) {
    if (isMissingTabError(error)) {
      // Tab may close while async icon/badge work is in flight.
      return;
    }

    throw error;
  }
}

async function applyConfiguredActionIcon(): Promise<void> {
  const store = await getStore();
  const theme = resolveFolioTheme(store.settings.theme);
  const iconVariant = getThemeIconVariant(theme);
  await chrome.action.setIcon({
    path: getActionIconPathSet(iconVariant)
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
