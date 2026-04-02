import { commit, getStore } from '../core/repository';
import { selectItemByUrl } from '../core/selectors';
import { getActionIconPathSet } from '../shared/icons';
import type {
  RuntimeMessage,
  RuntimeMessageResponse
} from '../shared/runtimeMessages';
import { getThemeIconVariant, resolveFolioTheme } from '../shared/theme';

const SAVE_MENU_ID = 'folio-save-to-list';
const RESUME_SCROLL_RETRY_DELAYS_MS = [120, 420, 1200];
const ACTION_ICON_IMAGE_CACHE = new Map<string, ImageData>();

async function loadActionIconImage(path: string): Promise<ImageData> {
  const cached = ACTION_ICON_IMAGE_CACHE.get(path);
  if (cached) {
    return cached;
  }

  const url = chrome.runtime.getURL(path);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch icon '${path}': ${response.status}`);
  }

  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error(`Failed to create 2d context for icon '${path}'`);
  }

  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  ACTION_ICON_IMAGE_CACHE.set(path, imageData);
  return imageData;
}

async function loadActionIconImageSet(
  iconPaths: ReturnType<typeof getActionIconPathSet>
): Promise<{
  16: ImageData;
  32: ImageData;
  48: ImageData;
  128: ImageData;
}> {
  const [icon16, icon32, icon48, icon128] = await Promise.all([
    loadActionIconImage(iconPaths[16]),
    loadActionIconImage(iconPaths[32]),
    loadActionIconImage(iconPaths[48]),
    loadActionIconImage(iconPaths[128])
  ]);

  return {
    16: icon16,
    32: icon32,
    48: icon48,
    128: icon128
  };
}

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
    const iconImageSet = await loadActionIconImageSet(getActionIconPathSet(iconVariant));
    await chrome.action.setIcon({ tabId, imageData: iconImageSet });

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
  const iconImageSet = await loadActionIconImageSet(getActionIconPathSet(iconVariant));
  await chrome.action.setIcon({
    imageData: iconImageSet
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

async function captureTabResumeSnapshot(tabId: number): Promise<{
  url: string;
  title: string;
  scrollY: number;
} | null> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      url: window.location.href,
      title: document.title || window.location.href,
      scrollY:
        window.scrollY ||
        window.pageYOffset ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0
    })
  });

  return result?.result ?? null;
}

async function restoreTabScroll(tabId: number, scrollY: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [scrollY],
    func: (top: number) => {
      window.scrollTo({ top, behavior: 'auto' });
    }
  });
}

async function openItemFromPopup(itemId: string): Promise<RuntimeMessageResponse> {
  const store = await getStore();
  const item = store.items[itemId];

  if (!item) {
    return { ok: false, error: 'item_not_found' };
  }

  const targetUrl = item.resumeSnapshot?.url ?? item.url;
  const targetScrollY = item.resumeSnapshot?.scrollY ?? null;
  const createdTab = await chrome.tabs.create({ url: targetUrl });

  if (createdTab.id !== undefined && targetScrollY !== null) {
    const targetTabId = createdTab.id;
    const listener = (
      tabId: number,
      changeInfo: { status?: string }
    ): void => {
      if (tabId !== targetTabId || changeInfo.status !== 'complete') {
        return;
      }

      chrome.tabs.onUpdated.removeListener(listener);
      void (async () => {
        for (const delayMs of RESUME_SCROLL_RETRY_DELAYS_MS) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          try {
            await restoreTabScroll(targetTabId, targetScrollY);
          } catch {
            return;
          }
        }
      })();
    };

    chrome.tabs.onUpdated.addListener(listener);
  }

  await commit({ type: 'touchOpenedAt', payload: { id: itemId } });
  return { ok: true };
}

async function saveResumeSnapshotFromActiveTab(
  itemId: string
): Promise<RuntimeMessageResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || tab.id === undefined) {
    return { ok: false, error: 'tab_not_found' };
  }

  const snapshot = await captureTabResumeSnapshot(tab.id);
  if (!snapshot) {
    return { ok: false, error: 'snapshot_unavailable' };
  }

  const result = await commit({
    type: 'setResumeSnapshot',
    payload: {
      id: itemId,
      url: snapshot.url,
      title: snapshot.title,
      scrollY: snapshot.scrollY
    }
  });

  if (!result.ok) {
    return { ok: false, error: result.code ?? 'unknown_error' };
  }

  await updateBadge(tab.id, snapshot.url);
  return { ok: true };
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

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    _sender,
    sendResponse: (response: RuntimeMessageResponse) => void
  ) => {
    if (message.type === 'captureResumeSnapshot') {
      void saveResumeSnapshotFromActiveTab(message.itemId)
        .then(sendResponse)
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : 'unknown_error'
          });
        });
      return true;
    }

    if (message.type === 'openPopupItem') {
      void openItemFromPopup(message.itemId)
        .then(sendResponse)
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : 'unknown_error'
          });
        });
      return true;
    }

    return false;
  }
);
