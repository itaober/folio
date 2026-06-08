import { createDefaultStore, FOLIO_STORE_KEY } from './defaults';
import { emitCommitEvent, subscribeCommitEvent } from './events';
import type {
  CommitResult,
  FolioItem,
  FolioMutation,
  FolioStatus,
  FolioStore
} from './types';
import {
  resolveDefaultViewMode,
  resolveSavedView,
  resolveSortMode,
  type ResumeSnapshot
} from './types';
import { extractDomain, normalizeUrl } from './url';
import { isSupportedLocale, writeStoredLocale } from '../shared/i18n/localeStore';
import { writeBackupToDirectory } from './sync/backupWriter';
import {
  readGitHubCredentials,
  type GitHubCredentialsInput
} from './sync/credentials';
import {
  configureGitHubSync,
  connectGitHub,
  disconnectGitHub,
  getGitHubDiff,
  getGitHubStatus,
  pullStoreFromGitHub,
  pushStoreToGitHub,
  recordTombstone,
  resolveGitHub
} from './sync/github';
import type {
  GitHubResolveStrategy,
  GitHubStoreDiff,
  GitHubSyncStatus
} from './sync/github/types';

/** Push/pull result the background folds into a RuntimeMessageResponse. */
export type RepositorySyncResult =
  | { ok: true; syncedAt: number }
  | { ok: false; error: string };

function createId(): string {
  return crypto.randomUUID();
}

function collectTagsFromItems(items: FolioStore['items']): string[] {
  const tagSet = new Set<string>();

  for (const item of Object.values(items)) {
    for (const tag of item.tags) {
      const normalized = tag.trim();
      if (!normalized) {
        continue;
      }
      tagSet.add(normalized);
    }
  }

  return [...tagSet].sort();
}

function itemHasTrackedUrl(item: FolioItem, normalizedUrl: string): boolean {
  return (
    item.url === normalizedUrl ||
    normalizeUrl(item.resumeSnapshot?.url ?? '') === normalizedUrl
  );
}

function normalizeResumeSnapshot(
  snapshot: ResumeSnapshot | null | undefined,
  fallbackTitle: string,
  fallbackUpdatedAt: number
): ResumeSnapshot | null {
  if (!snapshot) {
    return null;
  }

  const normalizedUrl = normalizeUrl(snapshot.url);
  if (!normalizedUrl) {
    return null;
  }

  return {
    url: snapshot.url.trim(),
    title: snapshot.title.trim() || fallbackTitle,
    scrollY:
      typeof snapshot.scrollY === 'number' && Number.isFinite(snapshot.scrollY)
        ? Math.max(0, snapshot.scrollY)
        : 0,
    updatedAt: toNumber(snapshot.updatedAt, fallbackUpdatedAt)
  };
}

export async function writeStore(store: FolioStore): Promise<void> {
  await chrome.storage.local.set({ [FOLIO_STORE_KEY]: store });
}

function normalizeStore(store: FolioStore): FolioStore {
  const defaultStore = createDefaultStore();
  const normalizedItems: Record<string, FolioItem> = {};
  for (const [id, item] of Object.entries(store.items)) {
    const legacySavedAt = (item as FolioItem & { savedAt?: unknown }).savedAt;
    const createdAt = toNumber(item.createdAt, toNumber(legacySavedAt, item.updatedAt));
    const updatedAt = toNumber(item.updatedAt, createdAt);
    normalizedItems[id] = {
      ...item,
      createdAt,
      updatedAt,
      resumeSnapshot: normalizeResumeSnapshot(
        item.resumeSnapshot,
        item.title,
        updatedAt
      )
    };
  }

  const normalizedSettings: FolioStore['settings'] = {
    ...defaultStore.settings,
    locale: isSupportedLocale(store.settings.locale)
      ? store.settings.locale
      : defaultStore.settings.locale,
    defaultStatus:
      store.settings.defaultStatus === 'reading' ? 'reading' : 'unread',
    sortMode: resolveSortMode(store.settings.sortMode),
    optionsDefaultViewMode: resolveDefaultViewMode(store.settings.optionsDefaultViewMode),
    optionsFixedView: resolveSavedView(store.settings.optionsFixedView),
    optionsLastView: resolveSavedView(store.settings.optionsLastView),
    popupDefaultViewMode: resolveDefaultViewMode(store.settings.popupDefaultViewMode),
    popupFixedView: resolveSavedView(store.settings.popupFixedView),
    popupLastView: resolveSavedView(store.settings.popupLastView),
    syncDirectory:
      typeof store.settings.syncDirectory === 'string'
        ? store.settings.syncDirectory
        : null,
    lastSyncedAt:
      typeof store.settings.lastSyncedAt === 'number' &&
      Number.isFinite(store.settings.lastSyncedAt)
        ? store.settings.lastSyncedAt
        : null,
    lastSyncError:
      typeof store.settings.lastSyncError === 'string'
        ? store.settings.lastSyncError
        : null
  };

  return {
    ...store,
    items: normalizedItems,
    settings: normalizedSettings
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

function parseStatus(value: unknown): FolioStatus {
  if (value === 'unread' || value === 'reading' || value === 'done') {
    return value;
  }
  return 'unread';
}

function sanitizeImportedStore(
  raw: unknown,
  current: FolioStore,
  mode: 'replace' | 'merge' = 'replace'
): FolioStore | null {
  if (!isRecord(raw)) {
    return null;
  }

  const rawItems = isRecord(raw.items) ? raw.items : {};
  const byUrl = new Map<string, FolioItem>();
  const now = Date.now();

  // 'merge' (GitHub sync): seed with the current store so local-only items
  // (saved on this device but not yet pushed) survive a pull; payload items
  // then win per-URL by the updatedAt LWW comparison below. 'replace' (file
  // import) starts empty so the imported file fully defines the store.
  if (mode === 'merge') {
    for (const item of Object.values(current.items)) {
      byUrl.set(item.url, item);
    }
  }

  for (const value of Object.values(rawItems)) {
    if (!isRecord(value)) {
      continue;
    }

    const normalizedUrl = normalizeUrl(
      typeof value.url === 'string' ? value.url : ''
    );
    if (!normalizedUrl) {
      continue;
    }

    const createdAt = toNumber(
      value.createdAt,
      toNumber(value.savedAt, now)
    );
    const updatedAt = toNumber(value.updatedAt, createdAt);
    const nextItem: FolioItem = {
      id:
        typeof value.id === 'string' && value.id.trim()
          ? value.id
          : createId(),
      url: normalizedUrl,
      title:
        typeof value.title === 'string' && value.title.trim()
          ? value.title
          : normalizedUrl,
      favicon: typeof value.favicon === 'string' ? value.favicon : '',
      domain: extractDomain(normalizedUrl),
      status: parseStatus(value.status),
      tags: Array.isArray(value.tags)
        ? [...new Set(value.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean))]
        : [],
      note: typeof value.note === 'string' ? value.note : '',
      createdAt,
      updatedAt,
      lastOpenedAt:
        typeof value.lastOpenedAt === 'number' && Number.isFinite(value.lastOpenedAt)
          ? value.lastOpenedAt
          : null,
      resumeSnapshot: normalizeResumeSnapshot(
        isRecord(value.resumeSnapshot)
          ? {
              url: typeof value.resumeSnapshot.url === 'string' ? value.resumeSnapshot.url : '',
              title:
                typeof value.resumeSnapshot.title === 'string'
                  ? value.resumeSnapshot.title
                  : '',
              scrollY:
                typeof value.resumeSnapshot.scrollY === 'number'
                  ? value.resumeSnapshot.scrollY
                  : 0,
              updatedAt:
                typeof value.resumeSnapshot.updatedAt === 'number'
                  ? value.resumeSnapshot.updatedAt
                  : updatedAt
            }
          : null,
        typeof value.title === 'string' && value.title.trim()
          ? value.title
          : normalizedUrl,
        updatedAt
      )
    };

    const existing = byUrl.get(nextItem.url);
    if (!existing || existing.updatedAt <= nextItem.updatedAt) {
      byUrl.set(nextItem.url, nextItem);
    }
  }

  const items: Record<string, FolioItem> = {};
  const usedIds = new Set<string>();
  for (const item of byUrl.values()) {
    const nextId = usedIds.has(item.id) ? createId() : item.id;
    usedIds.add(nextId);
    items[nextId] = { ...item, id: nextId };
  }

  const rawSettings = isRecord(raw.settings) ? raw.settings : {};
  const locale =
    typeof rawSettings.locale === 'string' && isSupportedLocale(rawSettings.locale)
      ? rawSettings.locale
      : current.settings.locale;
  const defaultStatus =
    rawSettings.defaultStatus === 'unread' || rawSettings.defaultStatus === 'reading'
      ? rawSettings.defaultStatus
      : current.settings.defaultStatus;
  const sortMode = resolveSortMode(rawSettings.sortMode ?? current.settings.sortMode);
  const optionsDefaultViewMode = resolveDefaultViewMode(
    rawSettings.optionsDefaultViewMode ?? current.settings.optionsDefaultViewMode
  );
  const optionsFixedView = resolveSavedView(
    rawSettings.optionsFixedView ?? current.settings.optionsFixedView
  );
  const optionsLastView = resolveSavedView(
    rawSettings.optionsLastView ?? current.settings.optionsLastView
  );
  const popupDefaultViewMode = resolveDefaultViewMode(
    rawSettings.popupDefaultViewMode ?? current.settings.popupDefaultViewMode
  );
  const popupFixedView = resolveSavedView(
    rawSettings.popupFixedView ?? current.settings.popupFixedView
  );
  const popupLastView = resolveSavedView(
    rawSettings.popupLastView ?? current.settings.popupLastView
  );

  const rawMeta = isRecord(raw.meta) ? raw.meta : {};

  const nextStore: FolioStore = {
    items,
    tags: collectTagsFromItems(items),
    settings: {
      locale,
      defaultStatus,
      sortMode,
      optionsDefaultViewMode,
      optionsFixedView,
      optionsLastView,
      popupDefaultViewMode,
      popupFixedView,
      popupLastView,
      syncDirectory:
        typeof current.settings.syncDirectory === 'string'
          ? current.settings.syncDirectory
          : null,
      lastSyncedAt:
        typeof current.settings.lastSyncedAt === 'number' &&
        Number.isFinite(current.settings.lastSyncedAt)
          ? current.settings.lastSyncedAt
          : null,
      lastSyncError:
        typeof current.settings.lastSyncError === 'string'
          ? current.settings.lastSyncError
          : null
    },
    meta: {
      version:
        typeof rawMeta.version === 'string'
          ? rawMeta.version
          : current.meta.version,
      createdAt: toNumber(rawMeta.createdAt, current.meta.createdAt)
    }
  };

  return normalizeStore(nextStore);
}

const GITHUB_PUSH_DEBOUNCE_MS = 3000;
let githubPushTimer: ReturnType<typeof setTimeout> | null = null;

/** A page context (popup/options) has a `window`; the service worker does not. */
const IS_PAGE_CONTEXT = typeof window !== 'undefined';

/**
 * Coalesces a burst of commits into a single GitHub push. The push reads the
 * latest store snapshot itself (whole-state file, no per-mutation queue, §5.6).
 *
 * In a PAGE context (popup/options) a setTimeout would be torn down when the
 * surface closes — the popup almost always closes within the debounce window —
 * so we hand the request to the background service worker, whose context is far
 * more durable. In the SERVICE WORKER (e.g. a context-menu save) we run the
 * debounce locally.
 */
export function scheduleGitHubPush(): void {
  if (IS_PAGE_CONTEXT) {
    try {
      void chrome.runtime.sendMessage({ type: 'githubSchedulePush' }).catch(() => {});
    } catch {
      // Messaging unavailable (e.g. the e2e harness) — nothing to schedule.
    }
    return;
  }

  if (githubPushTimer) {
    clearTimeout(githubPushTimer);
  }
  githubPushTimer = setTimeout(() => {
    githubPushTimer = null;
    void runGitHubPush();
  }, GITHUB_PUSH_DEBOUNCE_MS);
}

async function runGitHubPush(): Promise<void> {
  const creds = await readGitHubCredentials();
  if (!creds) {
    return;
  }
  const store = await getStore();
  const result = await pushStoreToGitHub(store);
  await foldGitHubResult(result);
}

/** Records a tombstone for a deleted item only when GitHub sync is connected. */
async function recordTombstoneIfSyncing(item: FolioItem): Promise<void> {
  const creds = await readGitHubCredentials();
  if (!creds) {
    return;
  }
  await recordTombstone(item);
}

/** Folds a GitHub push/pull result into lastSyncedAt/lastSyncError (§5.7). */
export async function foldGitHubResult(
  result: { ok: true; syncedAt: number } | { ok: false; error: string }
): Promise<FolioStore> {
  const current = await getStore();
  const nextStore: FolioStore = {
    ...current,
    settings: {
      ...current.settings,
      lastSyncedAt: result.ok ? result.syncedAt : current.settings.lastSyncedAt,
      lastSyncError: result.ok ? null : result.error
    }
  };
  await writeStore(nextStore);
  return nextStore;
}

/**
 * Dispatches a committed store to every configured sync target (03-data-flow
 * §4.3): local-directory backup write-through first (synchronous-ish), then a
 * debounced async GitHub push. Returns the store with folded local-backup
 * metadata; the GitHub result is folded later by the debounced push.
 */
async function updateSyncMetadata(store: FolioStore): Promise<FolioStore> {
  let nextStore = store;

  if (store.settings.syncDirectory) {
    const result = await writeBackupToDirectory(store);
    nextStore = {
      ...store,
      settings: {
        ...store.settings,
        lastSyncedAt: result.ok ? result.syncedAt : store.settings.lastSyncedAt,
        lastSyncError: result.ok ? null : result.error
      }
    };
    await writeStore(nextStore);
  }

  const creds = await readGitHubCredentials();
  if (creds) {
    scheduleGitHubPush();
  }

  return nextStore;
}

export async function getStore(): Promise<FolioStore> {
  const data = await chrome.storage.local.get(FOLIO_STORE_KEY);
  const store = data[FOLIO_STORE_KEY] as FolioStore | undefined;

  if (store) {
    const knownSettingKeys = new Set([
      'locale',
      'defaultStatus',
      'sortMode',
      'optionsDefaultViewMode',
      'optionsFixedView',
      'optionsLastView',
      'popupDefaultViewMode',
      'popupFixedView',
      'popupLastView',
      'syncDirectory',
      'lastSyncedAt',
      'lastSyncError'
    ]);
    const hasUnexpectedSettingKeys = Object.keys(
      store.settings as unknown as Record<string, unknown>
    ).some((key) => !knownSettingKeys.has(key));

    const needsTimestampNormalization = Object.values(store.items).some((item) => {
      const legacySavedAt = (item as FolioItem & { savedAt?: unknown }).savedAt;
      return (
        typeof item.createdAt !== 'number' ||
        !Number.isFinite(item.createdAt) ||
        typeof item.updatedAt !== 'number' ||
        !Number.isFinite(item.updatedAt) ||
        legacySavedAt !== undefined
      );
    });

    const normalized = normalizeStore(store);
    if (needsTimestampNormalization || hasUnexpectedSettingKeys) {
      await writeStore(normalized);
    }
    return normalized;
  }

  const defaultStore = createDefaultStore();
  await writeStore(defaultStore);
  return defaultStore;
}

let commitChain: Promise<unknown> = Promise.resolve();

/**
 * Serializes commits within this context: each commit's full read-modify-write
 * (getStore → mutate → writeStore → sync side effects) runs to completion before
 * the next begins, so a burst of mutations (rapid status changes, edits) can't
 * interleave a stale getStore()/writeStore() and silently drop a change. (Cross-
 * context races between the SW and a page still share chrome.storage; those are
 * far rarer — see REVIEW notes.)
 */
export function commit(mutation: FolioMutation): Promise<CommitResult> {
  const run = commitChain.then(() => performCommit(mutation));
  commitChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function performCommit(mutation: FolioMutation): Promise<CommitResult> {
  const current = await getStore();
  const next: FolioStore = {
    ...current,
    items: { ...current.items },
    tags: [...current.tags],
    settings: { ...current.settings }
  };

  const now = Date.now();

  try {
    switch (mutation.type) {
      case 'savePage': {
        const normalizedUrl = normalizeUrl(mutation.payload.url);
        if (!normalizedUrl) {
          return { ok: false, code: 'invalid_url', store: current };
        }

        const existingItem = Object.values(next.items).find((item) =>
          itemHasTrackedUrl(item, normalizedUrl)
        );
        if (existingItem) {
          return { ok: false, code: 'already_exists', item: existingItem, store: current };
        }

        const id = createId();
        const item = {
          id,
          url: normalizedUrl,
          title: mutation.payload.title || normalizedUrl,
          favicon: mutation.payload.favicon,
          domain: extractDomain(normalizedUrl),
          status: next.settings.defaultStatus,
          tags: [] as string[],
          note: '',
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: null,
          resumeSnapshot: null
        };

        next.items[id] = item;
        break;
      }

      case 'setStatus': {
        const item = next.items[mutation.payload.id];
        if (!item) {
          return { ok: false, code: 'item_not_found', store: current };
        }

        next.items[item.id] = {
          ...item,
          status: mutation.payload.status,
          updatedAt: now
        };
        break;
      }

      case 'updateItem': {
        const item = next.items[mutation.payload.id];
        if (!item) {
          return { ok: false, code: 'item_not_found', store: current };
        }

        const updated = { ...item, updatedAt: now };

        if (mutation.payload.title !== undefined) {
          updated.title = mutation.payload.title;
        }

        if (mutation.payload.note !== undefined) {
          updated.note = mutation.payload.note;
        }

        if (mutation.payload.status !== undefined) {
          updated.status = mutation.payload.status;
        }

        if (mutation.payload.tags !== undefined) {
          updated.tags = [...new Set(mutation.payload.tags.filter(Boolean))];
        }

        if (mutation.payload.url !== undefined) {
          const normalizedUrl = normalizeUrl(mutation.payload.url);
          if (!normalizedUrl) {
            return { ok: false, code: 'invalid_url', store: current };
          }

          const duplicate = Object.values(next.items).find(
            (existing) => itemHasTrackedUrl(existing, normalizedUrl) && existing.id !== item.id
          );

          if (duplicate) {
            return { ok: false, code: 'already_exists', item: duplicate, store: current };
          }

          updated.url = normalizedUrl;
          updated.domain = extractDomain(normalizedUrl);
        }

        next.items[item.id] = updated;
        break;
      }

      case 'setResumeSnapshot': {
        const item = next.items[mutation.payload.id];
        if (!item) {
          return { ok: false, code: 'item_not_found', store: current };
        }

        const normalizedUrl = normalizeUrl(mutation.payload.url);
        if (!normalizedUrl) {
          return { ok: false, code: 'invalid_url', store: current };
        }

        const duplicate = Object.values(next.items).find(
          (existing) => itemHasTrackedUrl(existing, normalizedUrl) && existing.id !== item.id
        );

        if (duplicate) {
          return { ok: false, code: 'already_exists', item: duplicate, store: current };
        }

        next.items[item.id] = {
          ...item,
          updatedAt: now,
          resumeSnapshot: {
            url: mutation.payload.url.trim(),
            title: mutation.payload.title.trim() || item.title,
            scrollY: Math.max(0, mutation.payload.scrollY),
            updatedAt: now
          }
        };
        break;
      }

      case 'deleteItem': {
        const item = next.items[mutation.payload.id];
        if (!item) {
          return { ok: false, code: 'item_not_found', store: current };
        }

        delete next.items[item.id];
        // Soft-delete tombstone at the GitHub-envelope boundary only — the
        // local store stays a hard delete (03-data-flow §6.3). Records to a
        // separate key, so FolioStore is unchanged. Skip when GitHub is off.
        void recordTombstoneIfSyncing(item);
        break;
      }

      case 'restoreItem': {
        const item = mutation.payload.item;
        const duplicate = Object.values(next.items).find(
          (existing) =>
            (itemHasTrackedUrl(existing, item.url) ||
              (item.resumeSnapshot?.url
                ? itemHasTrackedUrl(existing, item.resumeSnapshot.url)
                : false)) &&
            existing.id !== item.id
        );
        if (duplicate) {
          return { ok: false, code: 'already_exists', item: duplicate, store: current };
        }

        next.items[item.id] = {
          ...item,
          updatedAt: now
        };
        break;
      }

      case 'setLocale': {
        if (!isSupportedLocale(mutation.payload.locale)) {
          return { ok: false, code: 'invalid_locale', store: current };
        }

        next.settings.locale = mutation.payload.locale;
        await writeStoredLocale(mutation.payload.locale);
        break;
      }

      case 'setSyncDirectory': {
        next.settings.syncDirectory = mutation.payload.name;
        if (!mutation.payload.name) {
          next.settings.lastSyncedAt = null;
          next.settings.lastSyncError = null;
        }
        break;
      }

      case 'updateSettings': {
        if (mutation.payload.defaultStatus !== undefined) {
          next.settings.defaultStatus = mutation.payload.defaultStatus;
        }
        if (mutation.payload.sortMode !== undefined) {
          next.settings.sortMode = mutation.payload.sortMode;
        }
        if (mutation.payload.optionsDefaultViewMode !== undefined) {
          next.settings.optionsDefaultViewMode = mutation.payload.optionsDefaultViewMode;
        }
        if (mutation.payload.optionsFixedView !== undefined) {
          next.settings.optionsFixedView = mutation.payload.optionsFixedView;
        }
        if (mutation.payload.optionsLastView !== undefined) {
          next.settings.optionsLastView = mutation.payload.optionsLastView;
        }
        if (mutation.payload.popupDefaultViewMode !== undefined) {
          next.settings.popupDefaultViewMode = mutation.payload.popupDefaultViewMode;
        }
        if (mutation.payload.popupFixedView !== undefined) {
          next.settings.popupFixedView = mutation.payload.popupFixedView;
        }
        if (mutation.payload.popupLastView !== undefined) {
          next.settings.popupLastView = mutation.payload.popupLastView;
        }

        break;
      }

      case 'touchOpenedAt': {
        const item = next.items[mutation.payload.id];
        if (!item) {
          return { ok: false, code: 'item_not_found', store: current };
        }

        next.items[item.id] = {
          ...item,
          lastOpenedAt: now,
          updatedAt: now
        };
        break;
      }

      case 'renameTag': {
        const to = mutation.payload.to.trim();
        if (!to) {
          return { ok: false, code: 'unknown_error', store: current };
        }
        if (to === mutation.payload.from) {
          break; // no-op rename — don't bump updatedAt on every tagged item
        }
        for (const [id, item] of Object.entries(next.items)) {
          if (!item.tags.includes(mutation.payload.from)) {
            continue;
          }
          const renamed = item.tags.map((tag) => (tag === mutation.payload.from ? to : tag));
          next.items[id] = { ...item, tags: [...new Set(renamed)], updatedAt: now };
        }
        break;
      }

      case 'deleteTag': {
        for (const [id, item] of Object.entries(next.items)) {
          if (!item.tags.includes(mutation.payload.tag)) {
            continue;
          }
          next.items[id] = {
            ...item,
            tags: item.tags.filter((tag) => tag !== mutation.payload.tag),
            updatedAt: now
          };
        }
        break;
      }

      default:
        return { ok: false, code: 'unknown_error', store: current };
    }

    next.tags = collectTagsFromItems(next.items);
    await writeStore(next);
    const syncedStore = await updateSyncMetadata(next);
    emitCommitEvent({ mutation, store: syncedStore });

    return { ok: true, store: syncedStore };
  } catch {
    return { ok: false, code: 'unknown_error', store: current };
  }
}

export async function syncBackupNow(): Promise<{
  ok: boolean;
  error?: string;
  store: FolioStore;
}> {
  const current = await getStore();
  if (!current.settings.syncDirectory) {
    return {
      ok: false,
      error: 'sync_directory_not_configured',
      store: current
    };
  }

  const result = await writeBackupToDirectory(current);
  const nextStore: FolioStore = {
    ...current,
    settings: {
      ...current.settings,
      lastSyncedAt: result.ok ? result.syncedAt : current.settings.lastSyncedAt,
      lastSyncError: result.ok ? null : result.error
    }
  };

  await writeStore(nextStore);

  return {
    ok: result.ok,
    error: result.ok ? undefined : result.error,
    store: nextStore
  };
}

export async function importStoreFromJson(raw: unknown): Promise<{
  ok: boolean;
  error?: string;
  store: FolioStore;
}> {
  const current = await getStore();
  const next = sanitizeImportedStore(raw, current);
  if (!next) {
    return {
      ok: false,
      error: 'invalid_json_structure',
      store: current
    };
  }

  try {
    await writeStore(next);
    if (current.settings.locale !== next.settings.locale) {
      await writeStoredLocale(next.settings.locale);
    }
    const syncedStore = await updateSyncMetadata(next);
    return { ok: true, store: syncedStore };
  } catch {
    // The write may have partially landed — roll back so the reported failure
    // matches what's actually stored.
    try {
      await writeStore(current);
    } catch {
      // nothing more we can do
    }
    return {
      ok: false,
      error: 'import_failed',
      store: current
    };
  }
}

/* ----------------------------- GitHub facade ----------------------------- */
// Thin wrappers the background SW calls. They fold sync results into
// lastSyncedAt/lastSyncError and emit a commit event so open surfaces refresh.

export async function githubConnect(
  input: GitHubCredentialsInput
): Promise<RepositorySyncResult> {
  const result = await connectGitHub(input);
  const store = await foldGitHubResult(result);
  emitCommitEvent({ store });
  return result.ok
    ? { ok: true, syncedAt: result.syncedAt }
    : { ok: false, error: result.error };
}

export async function githubDisconnect(): Promise<void> {
  await disconnectGitHub();
  const store = await getStore();
  emitCommitEvent({ store });
}

export async function githubPushNow(): Promise<RepositorySyncResult> {
  const current = await getStore();
  const result = await pushStoreToGitHub(current);
  const store = await foldGitHubResult(result);
  emitCommitEvent({ store });
  return result.ok
    ? { ok: true, syncedAt: result.syncedAt }
    : { ok: false, error: result.error };
}

export async function githubPullNow(): Promise<RepositorySyncResult> {
  const result = await pullStoreFromGitHub();
  const store = await foldGitHubResult(result);
  emitCommitEvent({ store });
  return result.ok
    ? { ok: true, syncedAt: result.syncedAt }
    : { ok: false, error: result.error };
}

export async function githubGetStatus(): Promise<GitHubSyncStatus> {
  return getGitHubStatus();
}

export async function githubGetDiff(): Promise<
  { ok: true; diff: GitHubStoreDiff } | { ok: false; error: string }
> {
  return getGitHubDiff();
}

/**
 * Applies a reconciliation strategy: writes the resolved store, re-pushes when
 * the strategy implies local should flow up, and folds the result.
 */
export async function githubResolve(
  strategy: GitHubResolveStrategy
): Promise<RepositorySyncResult> {
  const resolved = await resolveGitHub(strategy);
  if (!resolved.ok) {
    const store = await foldGitHubResult({ ok: false, error: resolved.error });
    emitCommitEvent({ store });
    return { ok: false, error: resolved.error };
  }

  const { store: resolvedStore, pushAfter } = resolved.result;
  // Capture the locale BEFORE writing — reading it after writeStore would
  // always equal resolvedStore's locale and skip the stored-locale update.
  const prevLocale = (await getStore()).settings.locale;
  await writeStore(resolvedStore);
  if (resolvedStore.settings.locale !== prevLocale) {
    await writeStoredLocale(resolvedStore.settings.locale);
  }

  if (pushAfter) {
    const pushResult = await pushStoreToGitHub(resolvedStore);
    const store = await foldGitHubResult(pushResult);
    emitCommitEvent({ store });
    return pushResult.ok
      ? { ok: true, syncedAt: pushResult.syncedAt }
      : { ok: false, error: pushResult.error };
  }

  const store = await foldGitHubResult({ ok: true, syncedAt: Date.now() });
  emitCommitEvent({ store });
  return { ok: true, syncedAt: Date.now() };
}

export { subscribeCommitEvent };

// Wire the GitHub sync orchestrator to the repository's store accessors and the
// shipped per-item LWW merger, avoiding a circular import (03-data-flow §1.3).
configureGitHubSync({
  getStore,
  writeStore,
  mergeStores: (raw, current) => sanitizeImportedStore(raw, current, 'merge')
});
