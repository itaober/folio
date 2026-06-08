import {
  commit,
  getStore,
  githubConnect,
  githubDisconnect,
  githubGetDiff,
  githubGetStatus,
  githubPullNow,
  githubPushNow,
  githubResolve,
  scheduleGitHubPush
} from '../core/repository';
import { FOLIO_STORE_KEY } from '../core/defaults';
import { selectItemByUrl } from '../core/selectors';
import type {
  GitHubDiffResponse,
  GitHubStatusResponse,
  RuntimeMessage,
  RuntimeMessageResponse
} from '../shared/runtimeMessages';
import type { FolioStatus } from '../core/types';

const SAVE_MENU_ID = 'folio-save-to-list';
const RESUME_SCROLL_RETRY_DELAYS_MS = [120, 420, 1200];
type IconImageSet = { 16: ImageData; 32: ImageData; 48: ImageData; 128: ImageData };

// The toolbar icon is the FolioMark glyph drawn at runtime (ink rounded square +
// three paper lines, authored on a 24×24 grid), so it always matches the in-app
// mark — no PNG asset to keep in sync. The active tab's saved status shows as a
// small dot in the bottom-right corner (sRGB ≈ the faiz status hues; chrome.action
// takes no oklch), with a paper halo for separation. No checkmark badge.
const ICON_INK = '#26231d';
const ICON_PAPER = '#faf9f6';
const STATUS_DOT_COLOR: Record<FolioStatus, string> = {
  unread: '#e0972a', // amber
  reading: '#5b86d8', // blue
  done: '#43a05f' // green
};

const ICON_SET_CACHE = new Map<string, IconImageSet>();

function roundRectPath(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function renderActionIcon(size: number, status: FolioStatus | null): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new ImageData(size, size);
  }
  const u = size / 24;

  // FolioMark: ink rounded square.
  ctx.fillStyle = ICON_INK;
  roundRectPath(ctx, 2.5 * u, 1.5 * u, 19 * u, 21 * u, 5 * u);
  ctx.fill();

  // FolioMark: three paper lines.
  ctx.strokeStyle = ICON_PAPER;
  ctx.lineWidth = 1.8 * u;
  ctx.lineCap = 'round';
  const line = (x1: number, x2: number, y: number): void => {
    ctx.beginPath();
    ctx.moveTo(x1 * u, y * u);
    ctx.lineTo(x2 * u, y * u);
    ctx.stroke();
  };
  line(8.5, 15.5, 6.5);
  line(8.5, 15.5, 11);
  line(8.5, 12.5, 15.5);

  // Bottom-right status dot + paper halo for separation from the ink body.
  if (status) {
    const r = size * 0.17;
    const ring = size * 0.05;
    const c = size - r - ring - size * 0.03;
    ctx.beginPath();
    ctx.arc(c, c, r + ring, 0, Math.PI * 2);
    ctx.fillStyle = ICON_PAPER;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fillStyle = STATUS_DOT_COLOR[status];
    ctx.fill();
  }

  return ctx.getImageData(0, 0, size, size);
}

function buildIconSet(status: FolioStatus | null): IconImageSet {
  const key = status ?? 'none';
  const cached = ICON_SET_CACHE.get(key);
  if (cached) {
    return cached;
  }
  const set: IconImageSet = {
    16: renderActionIcon(16, status),
    32: renderActionIcon(32, status),
    48: renderActionIcon(48, status),
    128: renderActionIcon(128, status)
  };
  ICON_SET_CACHE.set(key, set);
  return set;
}

function isMissingTabError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return message.includes('No tab with id');
}

async function clearBadge(tabId: number): Promise<void> {
  await chrome.action.setBadgeText({ tabId, text: '' });
}

async function updateBadge(tabId: number, url?: string): Promise<void> {
  try {
    const store = await getStore();
    const item = url ? selectItemByUrl(store, url) : null;
    await chrome.action.setIcon({ tabId, imageData: buildIconSet(item ? item.status : null) });
    await clearBadge(tabId);
  } catch (error) {
    if (isMissingTabError(error)) {
      // Tab may close while async icon/badge work is in flight.
      return;
    }

    throw error;
  }
}

async function applyConfiguredActionIcon(): Promise<void> {
  await chrome.action.setIcon({ imageData: buildIconSet(null) });
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

function toResponse(
  result: { ok: true; syncedAt: number } | { ok: false; error: string }
): RuntimeMessageResponse {
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

async function handleGitHubStatus(): Promise<GitHubStatusResponse> {
  const status = await githubGetStatus();
  return { ok: true, status };
}

async function handleGitHubDiff(): Promise<GitHubDiffResponse> {
  const result = await githubGetDiff();
  return result.ok ? { ok: true, diff: result.diff } : { ok: false, error: result.error };
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
  void updateBadgeForActiveTab();
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Redraw once per committed navigation, not on every micro-change.
  if (!changeInfo.url && changeInfo.status !== 'complete') {
    return;
  }
  void updateBadge(tabId, tab.url);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  // Only the reading store affects the icon — ignore credential, tombstone,
  // and theme writes to avoid redundant redraws.
  if (areaName !== 'local' || !changes[FOLIO_STORE_KEY]) {
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

    if (message.type === 'githubSchedulePush') {
      // A page asked us to run the debounced push in the durable SW context.
      scheduleGitHubPush();
      sendResponse({ ok: true });
      return false;
    }

    const respondWith = (promise: Promise<RuntimeMessageResponse>): true => {
      void promise.then(sendResponse).catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'unknown_error'
        });
      });
      return true;
    };

    if (message.type === 'githubConnect') {
      return respondWith(githubConnect(message.creds).then(toResponse));
    }

    if (message.type === 'githubDisconnect') {
      return respondWith(githubDisconnect().then(() => ({ ok: true })));
    }

    if (message.type === 'githubPushNow') {
      return respondWith(githubPushNow().then(toResponse));
    }

    if (message.type === 'githubPullNow') {
      return respondWith(githubPullNow().then(toResponse));
    }

    if (message.type === 'githubGetStatus') {
      return respondWith(handleGitHubStatus());
    }

    if (message.type === 'githubGetDiff') {
      return respondWith(handleGitHubDiff());
    }

    if (message.type === 'githubResolve') {
      return respondWith(githubResolve(message.strategy).then(toResponse));
    }

    return false;
  }
);
