import type { FolioItem, FolioStore } from '../../types';

/** Current schema version for both envelope files (03-data-flow §3.1). */
export const GITHUB_SCHEMA_VERSION = 1;

/** Content-branch file paths (03-data-flow §3). */
export const GITHUB_DATA_PATH = 'folio/data.json';
export const GITHUB_SETTINGS_PATH = 'folio/settings.json';

/** Tombstones older than this window are garbage-collected on push (§6.3). */
export const TOMBSTONE_GC_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * The eight sync states surfaced to the Storage UI.
 * - not-connected: no credentials configured.
 * - idle: connected, nothing in flight, never synced yet this session.
 * - syncing: a push or pull is in flight.
 * - synced: last operation succeeded.
 * - error: last operation failed (see {@link GitHubSyncErrorCode}).
 * - diverged: both sides changed and an auto-merge would be unsafe — needs the chooser (§4.5).
 * - rate-limited: GitHub API rate limit hit/low.
 * - offline: network unavailable.
 */
export type GitHubSyncState =
  | 'not-connected'
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'error'
  | 'diverged'
  | 'rate-limited'
  | 'offline';

/** Stable `lastSyncError` codes for GitHub failures (03-data-flow §5.7). */
export type GitHubSyncErrorCode =
  | 'github_not_configured'
  | 'github_auth_failed'
  | 'github_branch_missing'
  | 'github_conflict_unresolved'
  | 'github_offline'
  | 'github_server_error'
  | 'github_schema_incompatible'
  | 'github_rate_limited';

/** Snapshot returned by `githubGetStatus`. */
export interface GitHubSyncStatus {
  state: GitHubSyncState;
  /** Present when connected; the token is never included. */
  connection: {
    owner: string;
    repo: string;
    branch: string;
    persist: boolean;
  } | null;
  lastSyncedAt: number | null;
  lastSyncError: string | null;
  /**
   * True when the local store has item/tombstone changes made after the last
   * successful GitHub push/pull — i.e. GitHub is behind this device. A local-
   * ahead heuristic (remote-ahead needs a pull); drives the "有改动待同步" dot.
   */
  pendingLocalChanges?: boolean;
}

/** Result of a push/pull operation, foldable into `lastSyncedAt`/`lastSyncError`. */
export type GitHubSyncResult =
  | { ok: true; syncedAt: number }
  | { ok: false; error: GitHubSyncErrorCode };

/** A single item difference keyed by normalized URL, for the Review & resolve UI. */
export interface GitHubDiffEntry {
  url: string;
  /** Present for added/changed (this device's copy). */
  local: FolioItem | null;
  /** Present for removed/changed (the backend's copy). */
  remote: FolioItem | null;
}

/**
 * Item-level diff between the working store and the remote, keyed by normalized
 * URL — feeds the reconciliation chooser and Review & resolve (§7.4–7.5).
 */
export interface GitHubStoreDiff {
  /** Only on this device (would be pushed up). */
  added: GitHubDiffEntry[];
  /** Only on the backend (would be pulled down). */
  removed: GitHubDiffEntry[];
  /** On both, but with different content. */
  changed: GitHubDiffEntry[];
  localCount: number;
  remoteCount: number;
  /** True when settings differ between the two sides. */
  settingsDiffer: boolean;
}

/** Reconciliation strategy chosen in the diverged chooser (§4.5). */
export type GitHubResolveStrategy =
  | 'merge-newest' // sanitizeImportedStore per-item LWW (recommended default)
  | 'take-local' // this device -> GitHub (local overwrites backend)
  | 'take-remote'; // GitHub -> this device (backend overwrites local)

/** The merged store + which way it should flow after a resolve. */
export interface GitHubResolveResult {
  store: FolioStore;
  /** When true, the resolved store must be pushed up after writeStore. */
  pushAfter: boolean;
}
