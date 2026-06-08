/**
 * GitHub sync credentials. Stored under a SEPARATE chrome.storage key so they
 * never serialize into `folio-store`, never reach import/export JSON, and are
 * never touched by `sanitizeImportedStore` (03-data-flow §5.1).
 *
 * `persist: true`  -> chrome.storage.local (default; entered once, survives restarts).
 * `persist: false` -> chrome.storage.session (in-memory, cleared on browser restart).
 */

export const GITHUB_CREDENTIALS_KEY = 'folio-github-credentials';

export const DEFAULT_GITHUB_OWNER = 'itaober';
export const DEFAULT_GITHUB_REPO = 'folio';
export const DEFAULT_GITHUB_BRANCH = 'content';

export interface GitHubCredentials {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  addedAt: number;
  /** Whether the token lives in `local` (true) or `session` (false). */
  persist: boolean;
}

/** Connect-sheet input: token + optional repo overrides + persist toggle. */
export interface GitHubCredentialsInput {
  token: string;
  owner?: string;
  repo?: string;
  branch?: string;
  persist?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseCredentials(raw: unknown): GitHubCredentials | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (typeof raw.token !== 'string' || !raw.token.trim()) {
    return null;
  }

  return {
    owner: typeof raw.owner === 'string' && raw.owner.trim() ? raw.owner : DEFAULT_GITHUB_OWNER,
    repo: typeof raw.repo === 'string' && raw.repo.trim() ? raw.repo : DEFAULT_GITHUB_REPO,
    branch: typeof raw.branch === 'string' && raw.branch.trim() ? raw.branch : DEFAULT_GITHUB_BRANCH,
    token: raw.token,
    addedAt:
      typeof raw.addedAt === 'number' && Number.isFinite(raw.addedAt) ? raw.addedAt : Date.now(),
    persist: typeof raw.persist === 'boolean' ? raw.persist : true
  };
}

/**
 * Reads credentials, checking `local` first (default storage) then `session`.
 * Returns null when GitHub sync is not configured.
 */
export async function readGitHubCredentials(): Promise<GitHubCredentials | null> {
  const local = await chrome.storage.local.get(GITHUB_CREDENTIALS_KEY);
  const fromLocal = parseCredentials(local[GITHUB_CREDENTIALS_KEY]);
  if (fromLocal) {
    return fromLocal;
  }

  const session = await chrome.storage.session.get(GITHUB_CREDENTIALS_KEY);
  return parseCredentials(session[GITHUB_CREDENTIALS_KEY]);
}

/**
 * Normalizes connect-sheet input into stored credentials and writes them to the
 * chosen storage area, clearing any copy in the other area first.
 */
export async function writeGitHubCredentials(
  input: GitHubCredentialsInput
): Promise<GitHubCredentials> {
  const persist = input.persist ?? true;
  const credentials: GitHubCredentials = {
    owner: input.owner?.trim() || DEFAULT_GITHUB_OWNER,
    repo: input.repo?.trim() || DEFAULT_GITHUB_REPO,
    branch: input.branch?.trim() || DEFAULT_GITHUB_BRANCH,
    token: input.token.trim(),
    addedAt: Date.now(),
    persist
  };

  if (persist) {
    await chrome.storage.session.remove(GITHUB_CREDENTIALS_KEY);
    await chrome.storage.local.set({ [GITHUB_CREDENTIALS_KEY]: credentials });
  } else {
    await chrome.storage.local.remove(GITHUB_CREDENTIALS_KEY);
    await chrome.storage.session.set({ [GITHUB_CREDENTIALS_KEY]: credentials });
  }

  return credentials;
}

/** Removes credentials from both storage areas. Does not touch local items. */
export async function clearGitHubCredentials(): Promise<void> {
  await chrome.storage.local.remove(GITHUB_CREDENTIALS_KEY);
  await chrome.storage.session.remove(GITHUB_CREDENTIALS_KEY);
}
