import type { FolioStore } from './types';
import { selectAllItems, selectStatusCounts } from './selectors';

export interface FolioStats {
  weeklyDone: number;
  total: number;
  unread: number;
  topDomains: Array<{ domain: string; count: number }>;
}

export function computeStats(store: FolioStore): FolioStats {
  const allItems = selectAllItems(store);
  const statusCounts = selectStatusCounts(store);
  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const weeklyDone = allItems.filter((item) => item.status === 'done' && item.updatedAt >= oneWeekAgo).length;
  const unread = statusCounts.unread;

  const domainCount = new Map<string, number>();
  for (const item of allItems) {
    domainCount.set(item.domain, (domainCount.get(item.domain) ?? 0) + 1);
  }

  const topDomains = [...domainCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([domain, count]) => ({ domain, count }));

  return {
    weeklyDone,
    total: allItems.length,
    unread,
    topDomains
  };
}
