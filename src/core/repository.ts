import { createDefaultStore, FOLIO_STORE_KEY } from './defaults';
import { emitCommitEvent, subscribeCommitEvent } from './events';
import type { CommitResult, FolioMutation, FolioStore } from './types';
import { extractDomain, normalizeUrl } from './url';
import { isSupportedLocale, writeStoredLocale } from '../shared/i18n/localeStore';

function createId(): string {
  return crypto.randomUUID();
}

async function writeStore(store: FolioStore): Promise<void> {
  await chrome.storage.local.set({ [FOLIO_STORE_KEY]: store });
}

export async function getStore(): Promise<FolioStore> {
  const data = await chrome.storage.local.get(FOLIO_STORE_KEY);
  const store = data[FOLIO_STORE_KEY] as FolioStore | undefined;

  if (store) {
    return store;
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

      case 'setLocale': {
        if (!isSupportedLocale(mutation.payload.locale)) {
          return { ok: false, code: 'invalid_locale', store: current };
        }

        next.settings.locale = mutation.payload.locale;
        await writeStoredLocale(mutation.payload.locale);
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

    await writeStore(next);
    emitCommitEvent({ mutation, store: next });

    return { ok: true, store: next };
  } catch {
    return { ok: false, code: 'unknown_error', store: current };
  }
}

export { subscribeCommitEvent };
