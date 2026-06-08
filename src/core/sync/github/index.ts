import type { FolioItem, FolioStore } from '../../types';
import { normalizeUrl } from '../../url';
import {
  clearGitHubCredentials,
  readGitHubCredentials,
  writeGitHubCredentials,
  type GitHubCredentials,
  type GitHubCredentialsInput
} from '../credentials';
import {
  branchExists,
  createBranch,
  getFileRaw,
  GitHubHttpError,
  GitHubNetworkError,
  isRateLimited,
  probeRepo,
  putFile
} from './client';
import {
  applyTombstones,
  buildDataEnvelope,
  buildSettingsEnvelope,
  mergeTombstones,
  parseDataEnvelope,
  parseSettingsEnvelope,
  type DataEnvelope,
  type SettingsEnvelope,
  type Tombstone
} from './envelope';
import {
  GITHUB_DATA_PATH,
  GITHUB_SETTINGS_PATH,
  type GitHubDiffEntry,
  type GitHubResolveResult,
  type GitHubResolveStrategy,
  type GitHubStoreDiff,
  type GitHubSyncErrorCode,
  type GitHubSyncResult,
  type GitHubSyncState,
  type GitHubSyncStatus
} from './types';

/**
 * GitHub content-branch sync orchestrator. Runs in the background service
 * worker. The repository layer injects its store accessors (to avoid a circular
 * import with repository.ts) and the merge function it already ships.
 */

export interface RepositoryBridge {
  getStore: () => Promise<FolioStore>;
  writeStore: (store: FolioStore) => Promise<void>;
  /** The shipped per-item LWW merger (sanitizeImportedStore). */
  mergeStores: (raw: unknown, current: FolioStore) => FolioStore | null;
}

let bridge: RepositoryBridge | null = null;

/** Wired once from repository.ts on module init. */
export function configureGitHubSync(next: RepositoryBridge): void {
  bridge = next;
}

function requireBridge(): RepositoryBridge {
  if (!bridge) {
    throw new Error('github sync bridge not configured');
  }
  return bridge;
}

/* ---------------------------- tombstone store ---------------------------- */
// Tombstones live OUTSIDE folio-store (the local commit() still hard-deletes).
// They are accumulated at the GitHub-envelope boundary only (03-data-flow §6.3).

const TOMBSTONE_KEY = 'folio-github-tombstones';

async function readLocalTombstones(): Promise<Tombstone[]> {
  const data = await chrome.storage.local.get(TOMBSTONE_KEY);
  const raw = data[TOMBSTONE_KEY];
  return Array.isArray(raw) ? (raw as Tombstone[]) : [];
}

async function writeLocalTombstones(tombstones: Tombstone[]): Promise<void> {
  await chrome.storage.local.set({ [TOMBSTONE_KEY]: tombstones });
}

/**
 * Records a soft-delete tombstone for a hard-deleted item. Called from the
 * push boundary in repository.ts when a `deleteItem` mutation commits.
 */
export async function recordTombstone(item: FolioItem): Promise<void> {
  const url = normalizeUrl(item.url);
  if (!url) {
    return;
  }
  const existing = await readLocalTombstones();
  const next = mergeTombstones(existing, [{ id: item.id, url, deletedAt: Date.now() }]);
  await writeLocalTombstones(next);
}

/* --------------------------- sync watermark ---------------------------- */
// A GitHub-specific "last synced at", stored separately from
// settings.lastSyncedAt (which the local-folder backup also bumps) so the
// in-sync indicator reflects GitHub alone. Set on every successful push/pull.

const SYNCED_AT_KEY = 'folio-github-synced-at';

async function readSyncedAt(): Promise<number | null> {
  const data = await chrome.storage.local.get(SYNCED_AT_KEY);
  const raw = data[SYNCED_AT_KEY];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

async function writeSyncedAt(at: number): Promise<void> {
  await chrome.storage.local.set({ [SYNCED_AT_KEY]: at });
}

/**
 * Local-ahead heuristic: any item edited (or item deleted) after the last
 * successful GitHub sync means GitHub is behind this device. Remote-ahead
 * (another device pushed) is not detectable without a pull.
 */
async function hasUnsyncedLocalChanges(store: FolioStore): Promise<boolean> {
  const syncedAt = await readSyncedAt();
  if (syncedAt === null) {
    return false;
  }
  for (const item of Object.values(store.items)) {
    if (item.updatedAt > syncedAt) {
      return true;
    }
  }
  const tombstones = await readLocalTombstones();
  return tombstones.some((tombstone) => tombstone.deletedAt > syncedAt);
}

/* ------------------------------ error mapping ----------------------------- */

function classifyError(error: unknown): GitHubSyncErrorCode {
  if (error instanceof GitHubNetworkError) {
    return 'github_offline';
  }
  if (error instanceof GitHubHttpError) {
    if (error.rateLimited) {
      // GitHub also uses 403 for secondary rate limits — don't misreport as auth.
      return 'github_rate_limited';
    }
    if (error.status === 401 || error.status === 403) {
      return 'github_auth_failed';
    }
    if (error.status === 404) {
      return 'github_branch_missing';
    }
    if (error.status === 429) {
      return 'github_rate_limited';
    }
    if (error.status === 409) {
      return 'github_conflict_unresolved';
    }
    if (error.status >= 500) {
      return 'github_server_error';
    }
  }
  return 'github_server_error';
}

/* --------------------------------- connect -------------------------------- */

/**
 * Validates the token (repo probe), stores credentials, and bootstraps the
 * content branch + the two files from the CURRENT local store, so the first
 * push IS the bootstrap — local data flows up, never the reverse (§8).
 */
export async function connectGitHub(
  input: GitHubCredentialsInput
): Promise<GitHubSyncResult> {
  const repo = requireBridge();

  // Build candidate credentials (not yet persisted) and probe.
  const candidate: GitHubCredentials = {
    owner: input.owner?.trim() || 'itaober',
    repo: input.repo?.trim() || 'folio',
    branch: input.branch?.trim() || 'content',
    token: input.token.trim(),
    addedAt: Date.now(),
    persist: input.persist ?? true
  };

  try {
    // Validate the token (throws on auth/repo failure) before persisting.
    await probeRepo(candidate);

    if (!(await branchExists(candidate))) {
      await createBranch(candidate);
    }

    // Persist only after the token validates.
    await writeGitHubCredentials(input);

    const remote = await inspectRemoteData(candidate);
    if (remote === 'incompatible') {
      // A newer-schema remote must not be clobbered by this older client.
      return { ok: false, error: 'github_schema_incompatible' };
    }
    if (remote === 'has-items') {
      // The branch already holds a library (another device bootstrapped it):
      // pull-merge (per-item newest-wins) then push the union, so connecting a
      // second device never overwrites the other device's data (§8).
      const pull = await pullStoreFromGitHub();
      if (!pull.ok) {
        return pull;
      }
      const merged = await repo.getStore();
      return await pushStoreToGitHub(merged, { force: true });
    }

    // Empty/absent remote → bootstrap: local data flows up.
    const store = await repo.getStore();
    return await pushStoreToGitHub(store, { force: true });
  } catch (error) {
    return { ok: false, error: classifyError(error) };
  }
}

/**
 * Classifies the remote data.json for the connect bootstrap decision:
 * 'has-items' (merge before push), 'empty' (bootstrap from local), or
 * 'incompatible' (newer schema — must not be overwritten).
 */
async function inspectRemoteData(
  creds: GitHubCredentials
): Promise<'empty' | 'has-items' | 'incompatible'> {
  const raw = await getFileRaw(creds, GITHUB_DATA_PATH);
  if (raw === null) {
    return 'empty';
  }
  const json = safeJsonParse(raw);
  if (json === 'incompatible') {
    // Corrupt/unparseable remote isn't worth preserving — let local bootstrap it.
    return 'empty';
  }
  const parsed = parseDataEnvelope(json);
  if (parsed === 'incompatible') {
    return 'incompatible';
  }
  if (parsed === null) {
    return 'empty';
  }
  return Object.keys(parsed.items).length > 0 ? 'has-items' : 'empty';
}

/** Clears credentials + local tombstones. Does not touch local items. */
export async function disconnectGitHub(): Promise<void> {
  await clearGitHubCredentials();
  await chrome.storage.local.remove(TOMBSTONE_KEY);
  await chrome.storage.local.remove(SYNCED_AT_KEY);
}

/* ---------------------------------- push ---------------------------------- */

interface PushOptions {
  /** Bypass the change check (used by connect bootstrap). */
  force?: boolean;
}

/**
 * Pushes data.json and/or settings.json (only files that actually changed,
 * unless `force`). GET-fresh-sha-then-PUT per file (§5.4). On a 409 conflict
 * re-pulls, re-merges via sanitizeImportedStore, writes the merge locally, and
 * retries — bounded — before surfacing github_conflict_unresolved (§6.1).
 */
export async function pushStoreToGitHub(
  store: FolioStore,
  options: PushOptions = {}
): Promise<GitHubSyncResult> {
  const repo = requireBridge();
  const creds = await readGitHubCredentials();
  if (!creds) {
    return { ok: false, error: 'github_not_configured' };
  }

  // Captured before the network so an edit made mid-push still registers as a
  // pending local change afterwards.
  const startedAt = Date.now();

  try {
    const tombstones = await readLocalTombstones();

    if (options.force) {
      await putFile(
        creds,
        GITHUB_DATA_PATH,
        JSON.stringify(buildDataEnvelope(store, tombstones, Date.now()), null, 2),
        'chore(folio): sync data.json'
      );
      await putFile(
        creds,
        GITHUB_SETTINGS_PATH,
        JSON.stringify(buildSettingsEnvelope(store, Date.now()), null, 2),
        'chore(folio): sync settings.json'
      );
      await writeSyncedAt(startedAt);
      return { ok: true, syncedAt: Date.now() };
    }

    await pushDataWithConflictRetry(creds, store, tombstones);

    // settings.json: whole-file LWW (§6.2); a 409 is rare and resolved by
    // letting the freshest sha win on retry inside putFile's GET-sha step.
    await putFile(
      creds,
      GITHUB_SETTINGS_PATH,
      JSON.stringify(buildSettingsEnvelope(await repo.getStore(), Date.now()), null, 2),
      'chore(folio): sync settings.json'
    );

    await writeSyncedAt(startedAt);
    return { ok: true, syncedAt: Date.now() };
  } catch (error) {
    return { ok: false, error: classifyError(error) };
  }
}

async function pushDataWithConflictRetry(
  creds: GitHubCredentials,
  initialStore: FolioStore,
  tombstones: Tombstone[]
): Promise<void> {
  const repo = requireBridge();
  let store = initialStore;
  let workingTombstones = tombstones;
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const envelope = buildDataEnvelope(store, workingTombstones, Date.now());
      await putFile(
        creds,
        GITHUB_DATA_PATH,
        JSON.stringify(envelope, null, 2),
        'chore(folio): sync data.json'
      );
      return;
    } catch (error) {
      if (!(error instanceof GitHubHttpError) || error.status !== 409) {
        throw error;
      }
      // 409: remote moved. Re-pull, re-merge, persist locally, retry (§6.1).
      const remote = await getFileRaw(creds, GITHUB_DATA_PATH);
      const remoteJson = remote === null ? null : safeJsonParse(remote);
      if (remoteJson === 'incompatible') {
        throw new GitHubHttpError(409, 'schema incompatible during conflict merge');
      }
      const parsed = remoteJson === null ? null : parseDataEnvelope(remoteJson);
      if (parsed === 'incompatible') {
        throw new GitHubHttpError(409, 'schema incompatible during conflict merge');
      }

      const current = await repo.getStore();
      const merged = mergeRemoteIntoLocal(repo, parsed, current, workingTombstones, await readSyncedAt());
      if (!merged) {
        throw error;
      }
      // writeStore drives chrome.storage.onChanged, which open surfaces use to
      // refresh — so the silent 409 merge surfaces without an extra event.
      await repo.writeStore(merged.store);
      store = merged.store;
      workingTombstones = merged.tombstones;
    }
  }

  throw new GitHubHttpError(409, 'conflict unresolved after retries');
}

/* ---------------------------------- pull ---------------------------------- */

/**
 * Fetches both files, merges remote into the working store via
 * sanitizeImportedStore (per-item LWW) with tombstone suppression, writes the
 * merged store, and persists merged tombstones (§4.5, §6.1).
 */
export async function pullStoreFromGitHub(): Promise<GitHubSyncResult> {
  const repo = requireBridge();
  const creds = await readGitHubCredentials();
  if (!creds) {
    return { ok: false, error: 'github_not_configured' };
  }

  const startedAt = Date.now();

  try {
    const { dataEnvelope, settingsEnvelope } = await fetchEnvelopes(creds);
    const current = await repo.getStore();
    const localTombstones = await readLocalTombstones();
    const syncedAt = await readSyncedAt();
    const merged = mergeRemoteIntoLocal(
      repo,
      dataEnvelope,
      current,
      localTombstones,
      syncedAt,
      settingsEnvelope
    );
    if (!merged) {
      return { ok: false, error: 'github_schema_incompatible' };
    }

    await repo.writeStore(merged.store);
    await writeLocalTombstones(merged.tombstones);
    await writeSyncedAt(startedAt);
    return { ok: true, syncedAt: Date.now() };
  } catch (error) {
    return { ok: false, error: classifyError(error) };
  }
}

interface FetchedEnvelopes {
  dataEnvelope: DataEnvelope | 'incompatible' | null;
  settingsEnvelope: SettingsEnvelope | 'incompatible' | null;
}

/** JSON.parse that maps a corrupt/truncated remote file to 'incompatible'. */
function safeJsonParse(raw: string): unknown | 'incompatible' {
  try {
    return JSON.parse(raw);
  } catch {
    return 'incompatible';
  }
}

async function fetchEnvelopes(creds: GitHubCredentials): Promise<FetchedEnvelopes> {
  const [dataRaw, settingsRaw] = await Promise.all([
    getFileRaw(creds, GITHUB_DATA_PATH),
    getFileRaw(creds, GITHUB_SETTINGS_PATH)
  ]);

  const dataJson = dataRaw === null ? null : safeJsonParse(dataRaw);
  const settingsJson = settingsRaw === null ? null : safeJsonParse(settingsRaw);

  return {
    dataEnvelope:
      dataJson === null ? null : dataJson === 'incompatible' ? 'incompatible' : parseDataEnvelope(dataJson),
    settingsEnvelope:
      settingsJson === null
        ? null
        : settingsJson === 'incompatible'
          ? 'incompatible'
          : parseSettingsEnvelope(settingsJson)
  };
}

interface MergeOutput {
  store: FolioStore;
  tombstones: Tombstone[];
}

/**
 * Core merge: feed the remote envelope payload (items + settings) through the
 * shipped sanitizeImportedStore against the current store (per-item LWW), union
 * tombstones, then suppress tombstoned items. Returns null on schema mismatch.
 *
 * settings.json uses whole-file LWW (§6.2): the remote settings replace local
 * only when the remote envelope is newer.
 */
function mergeRemoteIntoLocal(
  repo: RepositoryBridge,
  dataEnvelope: DataEnvelope | 'incompatible' | null,
  current: FolioStore,
  localTombstones: Tombstone[],
  syncedAt: number | null,
  settingsEnvelope?: SettingsEnvelope | 'incompatible' | null
): MergeOutput | null {
  if (dataEnvelope === 'incompatible' || settingsEnvelope === 'incompatible') {
    return null;
  }

  const remoteTombstones = dataEnvelope ? dataEnvelope.tombstones : [];

  // Build the import payload from the remote envelope. When settings should win
  // (newer envelope) include them; otherwise omit so current settings are kept.
  const importSettings =
    settingsEnvelope && shouldRemoteSettingsWin(settingsEnvelope, syncedAt)
      ? settingsEnvelope.settings
      : undefined;

  const importPayload: Record<string, unknown> = {
    items: dataEnvelope ? dataEnvelope.items : {},
    tags: dataEnvelope ? dataEnvelope.tags : []
  };
  if (importSettings) {
    importPayload.settings = importSettings;
  }

  const merged = repo.mergeStores(importPayload, current);
  if (!merged) {
    return null;
  }

  const allTombstones = mergeTombstones(localTombstones, remoteTombstones);
  const suppressedItems = applyTombstones(merged.items, allTombstones);

  return {
    store: { ...merged, items: suppressedItems },
    tombstones: allTombstones
  };
}

function shouldRemoteSettingsWin(remote: SettingsEnvelope, syncedAt: number | null): boolean {
  // Before the first successful sync (watermark null), keep THIS device's
  // settings — connecting shouldn't silently re-localize/reconfigure the joining
  // device. Its settings flow up in the bootstrap push instead.
  if (syncedAt === null) {
    return false;
  }
  // Otherwise remote settings win only when written after our last sync (another
  // device changed them). Uses the GitHub-specific watermark, not the shared
  // lastSyncedAt that the local-folder backup also bumps.
  return remote.updatedAt > syncedAt;
}

/* ---------------------------------- diff ---------------------------------- */

function itemsAreEqual(a: FolioItem, b: FolioItem): boolean {
  return (
    a.title === b.title &&
    a.status === b.status &&
    a.note === b.note &&
    a.url === b.url &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, index) => tag === b.tags[index])
  );
}

function indexByUrl(items: Record<string, FolioItem>): Map<string, FolioItem> {
  const map = new Map<string, FolioItem>();
  for (const item of Object.values(items)) {
    map.set(item.url, item);
  }
  return map;
}

/**
 * Item-level diff (added/removed/changed) keyed by normalized URL, for the
 * reconciliation chooser and Review & resolve (§7.4–7.5).
 */
export function diffStores(
  local: FolioStore,
  remote: FolioStore
): GitHubStoreDiff {
  const localByUrl = indexByUrl(local.items);
  const remoteByUrl = indexByUrl(remote.items);

  const added: GitHubDiffEntry[] = [];
  const removed: GitHubDiffEntry[] = [];
  const changed: GitHubDiffEntry[] = [];

  for (const [url, localItem] of localByUrl) {
    const remoteItem = remoteByUrl.get(url);
    if (!remoteItem) {
      added.push({ url, local: localItem, remote: null });
    } else if (!itemsAreEqual(localItem, remoteItem)) {
      changed.push({ url, local: localItem, remote: remoteItem });
    }
  }

  for (const [url, remoteItem] of remoteByUrl) {
    if (!localByUrl.has(url)) {
      removed.push({ url, local: null, remote: remoteItem });
    }
  }

  const settingsDiffer = !sameSyncableSettings(local, remote);

  return {
    added,
    removed,
    changed,
    localCount: localByUrl.size,
    remoteCount: remoteByUrl.size,
    settingsDiffer
  };
}

function sameSyncableSettings(a: FolioStore, b: FolioStore): boolean {
  const keys: (keyof FolioStore['settings'])[] = [
    'locale',
    'defaultStatus',
    'sortMode',
    'optionsDefaultViewMode',
    'optionsFixedView',
    'optionsLastView',
    'popupDefaultViewMode',
    'popupFixedView',
    'popupLastView'
  ];
  return keys.every((key) => a.settings[key] === b.settings[key]);
}

/**
 * Builds the local-vs-remote diff for the UI without mutating anything. Returns
 * null on schema mismatch or when not configured.
 */
export async function getGitHubDiff(): Promise<
  | { ok: true; diff: GitHubStoreDiff }
  | { ok: false; error: GitHubSyncErrorCode }
> {
  const repo = requireBridge();
  const creds = await readGitHubCredentials();
  if (!creds) {
    return { ok: false, error: 'github_not_configured' };
  }

  try {
    const { dataEnvelope, settingsEnvelope } = await fetchEnvelopes(creds);
    if (dataEnvelope === 'incompatible' || settingsEnvelope === 'incompatible') {
      return { ok: false, error: 'github_schema_incompatible' };
    }

    const current = await repo.getStore();
    const remoteStore = remoteEnvelopeToStore(repo, dataEnvelope, settingsEnvelope, current);
    if (!remoteStore) {
      return { ok: false, error: 'github_schema_incompatible' };
    }

    return { ok: true, diff: diffStores(current, remoteStore) };
  } catch (error) {
    return { ok: false, error: classifyError(error) };
  }
}

/**
 * Materializes the remote envelopes into a full FolioStore (for diffing /
 * take-remote), running the remote payload through sanitizeImportedStore so the
 * shapes are validated. Tombstone suppression is applied so a remote that
 * carries tombstones presents the post-delete view.
 */
function remoteEnvelopeToStore(
  repo: RepositoryBridge,
  dataEnvelope: DataEnvelope | null,
  settingsEnvelope: SettingsEnvelope | null,
  current: FolioStore
): FolioStore | null {
  const importPayload: Record<string, unknown> = {
    items: dataEnvelope ? dataEnvelope.items : {},
    tags: dataEnvelope ? dataEnvelope.tags : []
  };
  if (settingsEnvelope) {
    importPayload.settings = settingsEnvelope.settings;
  }

  const remoteStore = repo.mergeStores(importPayload, current);
  if (!remoteStore) {
    return null;
  }

  const tombstones = dataEnvelope ? dataEnvelope.tombstones : [];
  return { ...remoteStore, items: applyTombstones(remoteStore.items, tombstones) };
}

/* -------------------------------- resolve -------------------------------- */

/**
 * Resolves a divergence by the chosen strategy, returning the store to write
 * and whether to push afterward (§4.5, §7.5).
 * - merge-newest: per-item LWW merge (recommended). pushAfter=true.
 * - take-local: keep the working store; overwrite the backend. pushAfter=true.
 * - take-remote: replace the working store with the backend. pushAfter=false.
 */
export async function resolveGitHub(
  strategy: GitHubResolveStrategy
): Promise<
  | { ok: true; result: GitHubResolveResult }
  | { ok: false; error: GitHubSyncErrorCode }
> {
  const repo = requireBridge();
  const creds = await readGitHubCredentials();
  if (!creds) {
    return { ok: false, error: 'github_not_configured' };
  }

  try {
    const current = await repo.getStore();

    if (strategy === 'take-local') {
      return { ok: true, result: { store: current, pushAfter: true } };
    }

    const { dataEnvelope, settingsEnvelope } = await fetchEnvelopes(creds);
    if (dataEnvelope === 'incompatible' || settingsEnvelope === 'incompatible') {
      return { ok: false, error: 'github_schema_incompatible' };
    }

    if (strategy === 'take-remote') {
      const remoteStore = remoteEnvelopeToStore(repo, dataEnvelope, settingsEnvelope, current);
      if (!remoteStore) {
        return { ok: false, error: 'github_schema_incompatible' };
      }
      return { ok: true, result: { store: remoteStore, pushAfter: false } };
    }

    // merge-newest
    const localTombstones = await readLocalTombstones();
    const syncedAt = await readSyncedAt();
    const merged = mergeRemoteIntoLocal(
      repo,
      dataEnvelope,
      current,
      localTombstones,
      syncedAt,
      settingsEnvelope
    );
    if (!merged) {
      return { ok: false, error: 'github_schema_incompatible' };
    }
    return { ok: true, result: { store: merged.store, pushAfter: true } };
  } catch (error) {
    return { ok: false, error: classifyError(error) };
  }
}

/* --------------------------------- status -------------------------------- */

let lastRuntimeState: GitHubSyncState | null = null;

/** Lets the dispatcher mark transient states (syncing/diverged/rate-limited). */
export function setRuntimeSyncState(state: GitHubSyncState | null): void {
  lastRuntimeState = state;
}

/**
 * Derives the current sync status from credentials + the persisted
 * lastSyncedAt/lastSyncError, overlaid with any transient runtime state.
 */
export async function getGitHubStatus(): Promise<GitHubSyncStatus> {
  const repo = requireBridge();
  const creds = await readGitHubCredentials();
  const store = await repo.getStore();
  const lastSyncedAt = store.settings.lastSyncedAt;
  const lastSyncError = store.settings.lastSyncError;

  if (!creds) {
    return {
      state: 'not-connected',
      connection: null,
      lastSyncedAt,
      lastSyncError
    };
  }

  const connection = {
    owner: creds.owner,
    repo: creds.repo,
    branch: creds.branch,
    persist: creds.persist
  };

  let state: GitHubSyncState;
  if (lastRuntimeState && lastRuntimeState !== 'not-connected') {
    state = lastRuntimeState;
  } else if (lastSyncError) {
    state = errorCodeToState(lastSyncError);
  } else if (lastSyncedAt) {
    state = 'synced';
  } else {
    state = 'idle';
  }

  return {
    state,
    connection,
    lastSyncedAt,
    lastSyncError,
    pendingLocalChanges: await hasUnsyncedLocalChanges(store)
  };
}

function errorCodeToState(code: string): GitHubSyncState {
  if (code === 'github_offline') {
    return 'offline';
  }
  if (code === 'github_rate_limited') {
    return 'rate-limited';
  }
  if (code === 'github_conflict_unresolved' || code === 'github_schema_incompatible') {
    return 'diverged';
  }
  return 'error';
}

export { isRateLimited };
