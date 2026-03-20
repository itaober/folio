import type { FolioItem, FolioStatus, FolioStore, SortMode } from './types';
import { normalizeUrl } from './url';

export type { SortMode } from './types';

export interface StatusCounts {
  total: number;
  unread: number;
  reading: number;
  done: number;
}

export function selectAllItems(store: FolioStore): FolioItem[] {
  return Object.values(store.items).sort((a, b) => b.createdAt - a.createdAt);
}

export function selectRecentItems(store: FolioStore, limit = 5): FolioItem[] {
  return selectAllItems(store).slice(0, limit);
}

export function selectItemsByStatus(store: FolioStore, status: FolioStatus): FolioItem[] {
  return selectAllItems(store).filter((item) => item.status === status);
}

export function selectItemsByTag(store: FolioStore, tag: string): FolioItem[] {
  return selectAllItems(store).filter((item) => item.tags.includes(tag));
}

export function selectItemByUrl(store: FolioStore, rawUrl: string): FolioItem | undefined {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) {
    return undefined;
  }

  return Object.values(store.items).find((item) => item.url === normalized);
}

export function selectFilteredItems(store: FolioStore, keyword: string): FolioItem[] {
  if (!keyword.trim()) {
    return selectAllItems(store);
  }

  return selectAllItems(store).filter((item) => matchesItemKeyword(item, keyword));
}

export function matchesItemKeyword(
  item: FolioItem,
  keyword: string,
  includeDomain = false
): boolean {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return true;
  }

  return (
    item.title.toLowerCase().includes(normalizedKeyword) ||
    item.url.toLowerCase().includes(normalizedKeyword) ||
    item.note.toLowerCase().includes(normalizedKeyword) ||
    (includeDomain && item.domain.toLowerCase().includes(normalizedKeyword))
  );
}

export function selectStatusCounts(store: FolioStore): StatusCounts {
  const counts: StatusCounts = {
    total: 0,
    unread: 0,
    reading: 0,
    done: 0
  };

  for (const item of Object.values(store.items)) {
    counts.total += 1;
    if (item.status === 'unread') {
      counts.unread += 1;
    } else if (item.status === 'reading') {
      counts.reading += 1;
    } else {
      counts.done += 1;
    }
  }

  return counts;
}

export function sortItems(items: FolioItem[], mode: SortMode): FolioItem[] {
  const cloned = [...items];

  switch (mode) {
    case 'saved_asc':
      return cloned.sort((a, b) => a.createdAt - b.createdAt);
    case 'domain_asc':
      return cloned.sort((a, b) => a.domain.localeCompare(b.domain));
    case 'title_asc':
      return cloned.sort((a, b) => a.title.localeCompare(b.title));
    case 'status':
      return cloned.sort((a, b) => a.status.localeCompare(b.status));
    case 'saved_desc':
    default:
      return cloned.sort((a, b) => b.createdAt - a.createdAt);
  }
}
