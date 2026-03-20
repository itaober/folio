import type { FolioStore } from './types';
import { DEFAULT_THEME } from '../shared/theme';

export const FOLIO_STORE_KEY = 'folio-store';

export function createDefaultStore(): FolioStore {
  const now = Date.now();

  return {
    items: {},
    tags: [],
    settings: {
      locale: 'en',
      iconVariant: 'classic',
      theme: DEFAULT_THEME,
      defaultStatus: 'unread',
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
