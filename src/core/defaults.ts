import {
  DEFAULT_DEFAULT_VIEW_MODE,
  DEFAULT_SAVED_VIEW,
  DEFAULT_SORT_MODE,
  type FolioStore
} from './types';
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
      sortMode: DEFAULT_SORT_MODE,
      optionsDefaultViewMode: DEFAULT_DEFAULT_VIEW_MODE,
      optionsFixedView: DEFAULT_SAVED_VIEW,
      optionsLastView: DEFAULT_SAVED_VIEW,
      popupDefaultViewMode: DEFAULT_DEFAULT_VIEW_MODE,
      popupFixedView: DEFAULT_SAVED_VIEW,
      popupLastView: DEFAULT_SAVED_VIEW,
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
