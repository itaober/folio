import { createDefaultStore, FOLIO_STORE_KEY } from './defaults';
import { emitCommitEvent, subscribeCommitEvent } from './events';
import type { CommitResult, FolioMutation, FolioStore } from './types';
import { extractDomain, normalizeUrl } from './url';
import { isSupportedLocale, writeStoredLocale } from '../shared/i18n/localeStore';
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

async function writeStore(store: FolioStore): Promise<void> {
  await chrome.storage.local.set({ [FOLIO_STORE_KEY]: store });
}

function normalizeStore(store: FolioStore): FolioStore {
  const normalizedSettings = {
    ...store.settings,
    backlogEnabled: store.settings.backlogEnabled ?? true,
    staleEnabled: store.settings.staleEnabled ?? true
  };

  return {
    ...store,
    settings: normalizedSettings
  };
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
    const normalized = normalizeStore(store);
    if (
      normalized.settings.backlogEnabled !== store.settings.backlogEnabled ||
      normalized.settings.staleEnabled !== store.settings.staleEnabled
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

        const existingItem = Object.values(next.items).find((item) => item.url === normalizedUrl);
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
          savedAt: now,
          updatedAt: now,
          lastOpenedAt: null
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
            (existing) => existing.url === normalizedUrl && existing.id !== item.id
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
          (existing) => existing.url === item.url && existing.id !== item.id
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
        if (mutation.payload.backlogEnabled !== undefined) {
          next.settings.backlogEnabled = mutation.payload.backlogEnabled;
        }

        if (mutation.payload.backlogThreshold !== undefined) {
          next.settings.backlogThreshold = Math.max(
            1,
            Math.floor(mutation.payload.backlogThreshold)
          );
        }

        if (mutation.payload.staleEnabled !== undefined) {
          next.settings.staleEnabled = mutation.payload.staleEnabled;
        }

        if (mutation.payload.staleThreshold !== undefined) {
          next.settings.staleThreshold = Math.max(
            1,
            Math.floor(mutation.payload.staleThreshold)
          );
        }

        if (mutation.payload.defaultStatus !== undefined) {
          next.settings.defaultStatus = mutation.payload.defaultStatus;
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

export { subscribeCommitEvent };
