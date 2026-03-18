import type { FolioStore } from './types';

export const FOLIO_STORE_KEY = 'folio-store';

export function createDefaultStore(): FolioStore {
  const now = Date.now();

  return {
    items: {},
    tags: [],
    settings: {
      locale: 'en',
      defaultStatus: 'unread',
      backlogThreshold: 20,
      staleThreshold: 30,
      syncDirectory: null,
      lastSyncedAt: null,
      lastSyncError: null
    },
    meta: {
      version: '0.1.0',
      createdAt: now
    }
  };
}
