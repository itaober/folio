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
import { getThemeIconVariant, resolveFolioTheme } from '../shared/theme';
import { writeBackupToDirectory } from './sync/backupWriter';

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

async function writeStore(store: FolioStore): Promise<void> {
  await chrome.storage.local.set({ [FOLIO_STORE_KEY]: store });
}

function normalizeStore(store: FolioStore): FolioStore {
  const defaultStore = createDefaultStore();
  const theme = resolveFolioTheme(store.settings.theme);
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
    iconVariant: getThemeIconVariant(theme),
    theme,
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

function sanitizeImportedStore(raw: unknown, current: FolioStore): FolioStore | null {
  if (!isRecord(raw)) {
    return null;
  }

  const defaultStore = createDefaultStore();
  const rawItems = isRecord(raw.items) ? raw.items : {};
  const byUrl = new Map<string, FolioItem>();
  const now = Date.now();

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
  const theme = resolveFolioTheme(rawSettings.theme ?? current.settings.theme);
  const iconVariant = getThemeIconVariant(theme);

  const rawMeta = isRecord(raw.meta) ? raw.meta : {};

  const nextStore: FolioStore = {
    items,
    tags: collectTagsFromItems(items),
    settings: {
      locale,
      iconVariant,
      theme,
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

async function updateSyncMetadata(store: FolioStore): Promise<FolioStore> {
  if (!store.settings.syncDirectory) {
    return store;
  }

  const result = await writeBackupToDirectory(store);
  const nextStore: FolioStore = {
    ...store,
    settings: {
      ...store.settings,
      lastSyncedAt: result.ok ? result.syncedAt : store.settings.lastSyncedAt,
      lastSyncError: result.ok ? null : result.error
    }
  };

  await writeStore(nextStore);
  return nextStore;
}

export async function getStore(): Promise<FolioStore> {
  const data = await chrome.storage.local.get(FOLIO_STORE_KEY);
  const store = data[FOLIO_STORE_KEY] as FolioStore | undefined;

  if (store) {
    const knownSettingKeys = new Set([
      'locale',
      'iconVariant',
      'theme',
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
    if (
      normalized.settings.iconVariant !== store.settings.iconVariant ||
      normalized.settings.theme !== store.settings.theme ||
      needsTimestampNormalization ||
      hasUnexpectedSettingKeys
    ) {
      await writeStore(normalized);
    }
    return normalized;
  }

  const defaultStore = createDefaultStore();
  await writeStore(defaultStore);
  return defaultStore;
}

export async function commit(mutation: FolioMutation): Promise<CommitResult> {
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
          next.tags = [...new Set([...next.tags, ...updated.tags])].sort();
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
        if (mutation.payload.iconVariant !== undefined) {
          next.settings.iconVariant = mutation.payload.iconVariant;
        }

        if (mutation.payload.theme !== undefined) {
          next.settings.theme = mutation.payload.theme;
          next.settings.iconVariant = getThemeIconVariant(mutation.payload.theme);
        }

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
    return {
      ok: false,
      error: 'import_failed',
      store: current
    };
  }
}

export { subscribeCommitEvent };
