import type { FolioItem, FolioStore } from './types';

function escapeCsvField(value: string): string {
  // Neutralize CSV/spreadsheet formula injection: a cell beginning with one of
  // these characters is treated as a formula by Excel/Sheets even when quoted,
  // so prefix it with a single quote (the standard mitigation).
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  const escaped = guarded.replaceAll('"', '""');
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

  // RFC 4180 line endings so Excel and other strict CSV readers parse rows.
  return [header.join(','), ...rows].join('\r\n');
}

export function toMarkdown(items: FolioItem[]): string {
  const lines = ['# Folio Export', ''];

  for (const item of items) {
    // Escape brackets in the link text and wrap the URL as an autolink so
    // titles/URLs containing ] or ( ) don't break the Markdown link syntax.
    const safeTitle = item.title.replace(/[[\]]/g, (match) => `\\${match}`);
    lines.push(`- [${safeTitle}](<${item.url}>)`);
    lines.push(`  - status: ${item.status}`);
    lines.push(`  - domain: ${item.domain}`);
    if (item.tags.length > 0) {
      lines.push(`  - tags: ${item.tags.join(', ')}`);
    }
    if (item.note) {
      // Keep multi-line notes intact by indenting continuation lines.
      const [first, ...rest] = item.note.split('\n');
      lines.push(`  - note: ${first}`);
      for (const extra of rest) {
        lines.push(`    ${extra}`);
      }
    }
  }

  return lines.join('\n');
}
