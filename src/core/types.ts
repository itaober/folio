import type { SupportedLocale } from '../shared/i18n/localeStore';

export type FolioStatus = 'unread' | 'reading' | 'done';

export interface FolioItem {
  id: string;
  url: string;
  title: string;
  favicon: string;
  domain: string;
  status: FolioStatus;
  tags: string[];
  note: string;
  savedAt: number;
  updatedAt: number;
  lastOpenedAt: number | null;
}

export interface FolioSettings {
  locale: SupportedLocale;
  defaultStatus: 'unread' | 'reading';
  backlogThreshold: number;
  staleThreshold: number;
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
        backlogThreshold?: number;
        staleThreshold?: number;
        defaultStatus?: 'unread' | 'reading';
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
