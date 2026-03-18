import type { FolioItem, FolioStatus, FolioStore } from './types';
import { normalizeUrl } from './url';

export function selectAllItems(store: FolioStore): FolioItem[] {
  return Object.values(store.items).sort((a, b) => b.savedAt - a.savedAt);
}

export function selectRecentItems(store: FolioStore, limit = 5): FolioItem[] {
  return selectAllItems(store).slice(0, limit);
}

export function selectItemsByStatus(store: FolioStore, status: FolioStatus): FolioItem[] {
  return selectAllItems(store).filter((item) => item.status === status);
}

export function selectItemByUrl(store: FolioStore, rawUrl: string): FolioItem | undefined {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) {
    return undefined;
  }

  return Object.values(store.items).find((item) => item.url === normalized);
}

export function selectFilteredItems(store: FolioStore, keyword: string): FolioItem[] {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return selectAllItems(store);
  }

  return selectAllItems(store).filter((item) => {
    return (
      item.title.toLowerCase().includes(normalizedKeyword) ||
      item.url.toLowerCase().includes(normalizedKeyword) ||
      item.note.toLowerCase().includes(normalizedKeyword)
    );
  });
}
