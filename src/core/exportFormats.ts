import type { FolioItem, FolioStore } from './types';

function escapeCsvField(value: string): string {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}

export function toJson(store: FolioStore): string {
  return JSON.stringify(store, null, 2);
}

export function toCsv(items: FolioItem[]): string {
  const header = ['title', 'url', 'domain', 'status', 'tags', 'note', 'createdAt', 'updatedAt', 'lastOpenedAt'];

  const rows = items.map((item) => {
    return [
      escapeCsvField(item.title),
      escapeCsvField(item.url),
      escapeCsvField(item.domain),
      escapeCsvField(item.status),
      escapeCsvField(item.tags.join(';')),
      escapeCsvField(item.note),
      String(item.createdAt),
      String(item.updatedAt),
      item.lastOpenedAt === null ? '' : String(item.lastOpenedAt)
    ].join(',');
  });

  return [header.join(','), ...rows].join('\n');
}

export function toMarkdown(items: FolioItem[]): string {
  const lines = ['# Folio Export', ''];

  for (const item of items) {
    lines.push(`- [${item.title}](${item.url})`);
    lines.push(`  - status: ${item.status}`);
    lines.push(`  - domain: ${item.domain}`);
    if (item.tags.length > 0) {
      lines.push(`  - tags: ${item.tags.join(', ')}`);
    }
    if (item.note) {
      lines.push(`  - note: ${item.note}`);
    }
  }

  return lines.join('\n');
}
