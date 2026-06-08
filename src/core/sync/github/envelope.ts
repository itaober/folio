import type { FolioItem, FolioSettings, FolioStore } from '../../types';
import { normalizeUrl } from '../../url';
import { GITHUB_SCHEMA_VERSION, TOMBSTONE_GC_WINDOW_MS } from './types';

/** Soft-delete record carried inside data.json's envelope only (03-data-flow §6.3). */
export interface Tombstone {
  id: string;
  /** Normalized URL — the merge identity. */
  url: string;
  deletedAt: number;
}

/** Common envelope header (§3.1). The blob `sha` remains the authoritative token. */
interface EnvelopeBase {
  schemaVersion: number;
  revision: number;
  updatedAt: number;
}

export interface DataEnvelope extends EnvelopeBase {
  items: Record<string, FolioItem>;
  tags: string[];
  tombstones: Tombstone[];
}

/** Syncable settings subset — device-local fields are stripped (§3.4). */
export type SyncableSettings = Omit<
  FolioSettings,
  'syncDirectory' | 'lastSyncedAt' | 'lastSyncError'
>;

export interface SettingsEnvelope extends EnvelopeBase {
  settings: SyncableSettings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Strips device-local fields from settings before writing settings.json (§3.4). */
export function toSyncableSettings(settings: FolioSettings): SyncableSettings {
  const { syncDirectory: _s, lastSyncedAt: _a, lastSyncError: _e, ...rest } = settings;
  void _s;
  void _a;
  void _e;
  return rest;
}

/** Builds the data.json envelope from a store + accumulated (GC'd) tombstones. */
export function buildDataEnvelope(
  store: FolioStore,
  tombstones: Tombstone[],
  revision: number
): DataEnvelope {
  return {
    schemaVersion: GITHUB_SCHEMA_VERSION,
    revision,
    updatedAt: Date.now(),
    items: store.items,
    tags: store.tags,
    tombstones: gcTombstones(tombstones)
  };
}

/** Builds the settings.json envelope from a store. */
export function buildSettingsEnvelope(
  store: FolioStore,
  revision: number
): SettingsEnvelope {
  return {
    schemaVersion: GITHUB_SCHEMA_VERSION,
    revision,
    updatedAt: Date.now(),
    settings: toSyncableSettings(store.settings)
  };
}

/**
 * Parses a raw data.json envelope. Returns the envelope when its `schemaVersion`
 * is supported, `'incompatible'` when it is newer than this build, or null when
 * it is not a recognizable envelope.
 */
export function parseDataEnvelope(
  raw: unknown
): DataEnvelope | 'incompatible' | null {
  if (!isRecord(raw)) {
    return null;
  }
  const schemaVersion = toNumber(raw.schemaVersion, 0);
  if (schemaVersion > GITHUB_SCHEMA_VERSION) {
    return 'incompatible';
  }
  if (!isRecord(raw.items)) {
    return null;
  }

  return {
    schemaVersion: schemaVersion || GITHUB_SCHEMA_VERSION,
    revision: toNumber(raw.revision, 0),
    updatedAt: toNumber(raw.updatedAt, 0),
    items: raw.items as Record<string, FolioItem>,
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    tombstones: parseTombstones(raw.tombstones)
  };
}

/**
 * Parses a raw settings.json envelope. Same `schemaVersion` contract as
 * {@link parseDataEnvelope}.
 */
export function parseSettingsEnvelope(
  raw: unknown
): SettingsEnvelope | 'incompatible' | null {
  if (!isRecord(raw)) {
    return null;
  }
  const schemaVersion = toNumber(raw.schemaVersion, 0);
  if (schemaVersion > GITHUB_SCHEMA_VERSION) {
    return 'incompatible';
  }
  if (!isRecord(raw.settings)) {
    return null;
  }

  return {
    schemaVersion: schemaVersion || GITHUB_SCHEMA_VERSION,
    revision: toNumber(raw.revision, 0),
    updatedAt: toNumber(raw.updatedAt, 0),
    // Trusted shape-wise only as far as sanitizeImportedStore re-validates it.
    settings: raw.settings as SyncableSettings
  };
}

export function parseTombstones(raw: unknown): Tombstone[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: Tombstone[] = [];
  for (const value of raw) {
    if (!isRecord(value)) {
      continue;
    }
    const url = normalizeUrl(typeof value.url === 'string' ? value.url : '');
    if (!url) {
      continue;
    }
    out.push({
      id: typeof value.id === 'string' ? value.id : '',
      url,
      deletedAt: toNumber(value.deletedAt, 0)
    });
  }
  return out;
}

/** Drops tombstones older than the GC window to bound file growth (§6.3). */
export function gcTombstones(tombstones: Tombstone[], now = Date.now()): Tombstone[] {
  const cutoff = now - TOMBSTONE_GC_WINDOW_MS;
  return tombstones.filter((tombstone) => tombstone.deletedAt >= cutoff);
}

/**
 * Merges two tombstone lists, keeping the newest `deletedAt` per normalized URL.
 */
export function mergeTombstones(a: Tombstone[], b: Tombstone[]): Tombstone[] {
  const byUrl = new Map<string, Tombstone>();
  for (const tombstone of [...a, ...b]) {
    const existing = byUrl.get(tombstone.url);
    if (!existing || existing.deletedAt < tombstone.deletedAt) {
      byUrl.set(tombstone.url, tombstone);
    }
  }
  return [...byUrl.values()];
}

/**
 * Applies tombstone suppression to a merged item map: a tombstone with
 * `deletedAt >= item.updatedAt` for the same normalized URL removes that item
 * (delete beats older edit); a newer edit revives it (§6.3).
 */
export function applyTombstones(
  items: Record<string, FolioItem>,
  tombstones: Tombstone[]
): Record<string, FolioItem> {
  if (tombstones.length === 0) {
    return items;
  }
  const deletedAtByUrl = new Map<string, number>();
  for (const tombstone of tombstones) {
    const existing = deletedAtByUrl.get(tombstone.url);
    if (existing === undefined || existing < tombstone.deletedAt) {
      deletedAtByUrl.set(tombstone.url, tombstone.deletedAt);
    }
  }

  const out: Record<string, FolioItem> = {};
  for (const [id, item] of Object.entries(items)) {
    const deletedAt = deletedAtByUrl.get(item.url);
    if (deletedAt !== undefined && deletedAt >= item.updatedAt) {
      continue;
    }
    out[id] = item;
  }
  return out;
}
