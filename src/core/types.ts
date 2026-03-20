import type { SupportedLocale } from '../shared/i18n/localeStore';
import type { FolioIconVariant } from '../shared/icons';
import type { FolioTheme } from '../shared/theme';

export type FolioStatus = 'unread' | 'reading' | 'done';
export type SortMode =
  | 'saved_desc'
  | 'saved_asc'
  | 'domain_asc'
  | 'title_asc'
  | 'status';

export const DEFAULT_SORT_MODE: SortMode = 'saved_desc';

export function isSortMode(value: unknown): value is SortMode {
  return (
    value === 'saved_desc' ||
    value === 'saved_asc' ||
    value === 'domain_asc' ||
    value === 'title_asc' ||
    value === 'status'
  );
}

export function resolveSortMode(value: unknown): SortMode {
  return isSortMode(value) ? value : DEFAULT_SORT_MODE;
}

export interface FolioItem {
  id: string;
  url: string;
  title: string;
  favicon: string;
  domain: string;
  status: FolioStatus;
  tags: string[];
  note: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number | null;
}

export interface FolioSettings {
  locale: SupportedLocale;
  iconVariant: FolioIconVariant;
  theme: FolioTheme;
  defaultStatus: 'unread' | 'reading';
  sortMode: SortMode;
  syncDirectory: string | null;
  lastSyncedAt: number | null;
  lastSyncError: string | null;
}

export interface FolioStore {
  items: Record<string, FolioItem>;
  tags: string[];
  settings: FolioSettings;
  meta: {
    version: string;
    createdAt: number;
  };
}

export type FolioMutation =
  | {
      type: 'savePage';
      payload: {
        url: string;
        title: string;
        favicon: string;
      };
    }
  | {
      type: 'setStatus';
      payload: {
        id: string;
        status: FolioStatus;
      };
    }
  | {
      type: 'updateItem';
      payload: {
        id: string;
        title?: string;
        url?: string;
        note?: string;
        tags?: string[];
        status?: FolioStatus;
      };
    }
  | {
      type: 'deleteItem';
      payload: {
        id: string;
      };
    }
  | {
      type: 'restoreItem';
      payload: {
        item: FolioItem;
      };
    }
  | {
      type: 'setLocale';
      payload: {
        locale: SupportedLocale;
      };
    }
  | {
      type: 'setSyncDirectory';
      payload: {
        name: string | null;
      };
    }
  | {
      type: 'updateSettings';
      payload: {
        iconVariant?: FolioIconVariant;
        theme?: FolioTheme;
        defaultStatus?: 'unread' | 'reading';
        sortMode?: SortMode;
      };
    }
  | {
      type: 'touchOpenedAt';
      payload: {
        id: string;
      };
    };

export type CommitErrorCode =
  | 'already_exists'
  | 'invalid_url'
  | 'item_not_found'
  | 'invalid_locale'
  | 'unknown_error';

export interface CommitResult {
  ok: boolean;
  code?: CommitErrorCode;
  item?: FolioItem;
  store: FolioStore;
}
