import { commit, getStore } from '../core/repository';
import { selectItemByUrl } from '../core/selectors';
import { getActionIconPathSet } from '../shared/icons';

const SAVE_MENU_ID = 'folio-save-to-list';
type IconSize = 16 | 32 | 48 | 128;

const ICON_SIZES: IconSize[] = [16, 32, 48, 128];
const checkedIconCache = new Map<string, Promise<Record<IconSize, ImageData>>>();

async function updateBadge(tabId: number, url?: string): Promise<void> {
  const store = await getStore();
  const iconPaths = getActionIconPathSet(store.settings.iconVariant);

  if (!url) {
    await chrome.action.setBadgeText({ tabId, text: '' });
    await chrome.action.setIcon({ tabId, path: iconPaths });
    return;
  }

  const item = selectItemByUrl(store, url);

  if (!item) {
    await chrome.action.setBadgeText({ tabId, text: '' });
    await chrome.action.setIcon({ tabId, path: iconPaths });
    return;
  }

  const imageData = await getCheckedActionIconImageData(store.settings.iconVariant);
  await chrome.action.setBadgeText({ tabId, text: '' });
  await chrome.action.setIcon({ tabId, imageData });
}

async function applyConfiguredActionIcon(): Promise<void> {
  const store = await getStore();
  await chrome.action.setIcon({
    path: getActionIconPathSet(store.settings.iconVariant)
  });
}

async function getCheckedActionIconImageData(
  variant: unknown
): Promise<Record<IconSize, ImageData>> {
  const key = String(variant);
  const cached = checkedIconCache.get(key);
  if (cached) {
    return cached;
  }

  const task = buildCheckedActionIconImageData(variant);
  checkedIconCache.set(key, task);
  return task;
}

async function buildCheckedActionIconImageData(
  variant: unknown
): Promise<Record<IconSize, ImageData>> {
  const iconPaths = getActionIconPathSet(variant);
  const entries = await Promise.all(
    ICON_SIZES.map(async (size) => {
      const bitmap = await loadIconBitmap(iconPaths[size]);
      const canvas = new OffscreenCanvas(size, size);
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Failed to create icon drawing context');
      }

      context.clearRect(0, 0, size, size);
      context.drawImage(bitmap, 0, 0, size, size);
      drawSavedCheckmark(context, size);

      return [size, context.getImageData(0, 0, size, size)] as const;
    })
  );

  return Object.fromEntries(entries) as Record<IconSize, ImageData>;
}

async function loadIconBitmap(path: string): Promise<ImageBitmap> {
  const response = await fetch(chrome.runtime.getURL(path));
  const blob = await response.blob();
  return createImageBitmap(blob);
}

function drawSavedCheckmark(context: OffscreenCanvasRenderingContext2D, size: number): void {
  const outerRadius = Math.max(3, Math.round(size * 0.23));
  const centerX = size - outerRadius + 0.5;
  const centerY = size - outerRadius + 0.5;

  context.beginPath();
  context.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
  context.fillStyle = '#f8f4ed';
  context.fill();

  context.beginPath();
  context.arc(centerX, centerY, outerRadius - 1.2, 0, Math.PI * 2);
  context.fillStyle = '#3a6b3a';
  context.fill();

  context.beginPath();
  context.moveTo(centerX - outerRadius * 0.5, centerY + outerRadius * 0.05);
  context.lineTo(centerX - outerRadius * 0.18, centerY + outerRadius * 0.36);
  context.lineTo(centerX + outerRadius * 0.52, centerY - outerRadius * 0.34);
  context.strokeStyle = '#f8f4ed';
  context.lineWidth = Math.max(1.25, size / 10);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.stroke();
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
