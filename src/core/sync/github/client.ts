import type { GitHubCredentials } from '../credentials';
import { toBase64Utf8 } from './base64';

/**
 * Dependency-free GitHub Contents API client for the background service worker.
 * Web `fetch` only — no Node Buffer, no User-Agent header (Chrome forbids
 * overriding it from extension fetch). All calls hit
 * https://api.github.com/repos/{owner}/{repo}/... (03-data-flow §5.4).
 */

const API_BASE = 'https://api.github.com';
const ACCEPT_JSON = 'application/vnd.github+json';
const ACCEPT_RAW = 'application/vnd.github.v3.raw';
const MAX_RETRIES = 3;

/** A non-retryable HTTP failure, tagged with status for the caller to classify. */
export class GitHubHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** True when the status reflects a rate limit (429, or 403 with no quota left). */
    public readonly rateLimited = false
  ) {
    super(message);
    this.name = 'GitHubHttpError';
  }
}

/** Builds a GitHubHttpError from a non-OK response, tagging rate-limit signals. */
function httpError(response: Response, context: string): GitHubHttpError {
  return new GitHubHttpError(response.status, `${context} (${response.status})`, isRateLimited(response));
}

/** A network-level failure (offline, DNS, abort). */
export class GitHubNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubNetworkError';
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    Accept: ACCEPT_JSON,
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response, attempt: number): number {
  const header = response.headers.get('Retry-After');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }
  // Exponential backoff: 1s, 2s, 4s.
  return 2 ** attempt * 1000;
}

/**
 * Fetch with bounded retry on 429 and >=5xx (honoring Retry-After). NEVER
 * retries 409 — a 409 is a real conflict and is surfaced to the caller for
 * re-pull + re-merge (§5.4, §6.1). Network errors are retried like 5xx.
 */
export async function fetchWithRetry(
  input: string,
  init: RequestInit
): Promise<Response> {
  let lastNetworkError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch (error) {
      lastNetworkError = error;
      if (attempt === MAX_RETRIES) {
        break;
      }
      await delay(2 ** attempt * 1000);
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt === MAX_RETRIES) {
        return response;
      }
      await delay(retryAfterMs(response, attempt));
      continue;
    }

    return response;
  }

  throw new GitHubNetworkError(
    lastNetworkError instanceof Error ? lastNetworkError.message : 'network_error'
  );
}

function contentsUrl(creds: GitHubCredentials, path: string, withRef: boolean): string {
  const base = `${API_BASE}/repos/${creds.owner}/${creds.repo}/contents/${path}`;
  return withRef ? `${base}?ref=${encodeURIComponent(creds.branch)}` : base;
}

/** Detects a low/exhausted rate-limit signal from response headers. */
export function isRateLimited(response: Response): boolean {
  if (response.status === 429) {
    return true;
  }
  const remaining = response.headers.get('X-RateLimit-Remaining');
  if (remaining !== null && Number(remaining) <= 0) {
    return true;
  }
  return false;
}

export interface GitHubRepoMeta {
  defaultBranch: string;
}

/**
 * Probes the repo to validate the token (§5.2, §8). Throws GitHubHttpError on
 * 401/403/404 and GitHubNetworkError when offline.
 */
export async function probeRepo(creds: GitHubCredentials): Promise<GitHubRepoMeta> {
  const response = await fetchWithRetry(`${API_BASE}/repos/${creds.owner}/${creds.repo}`, {
    method: 'GET',
    cache: 'no-store',
    headers: authHeaders(creds.token)
  });

  if (!response.ok) {
    throw httpError(response, 'repo probe failed');
  }

  const body = (await response.json()) as { default_branch?: string };
  return { defaultBranch: body.default_branch ?? 'main' };
}

/**
 * Reads a file's blob `sha`. ALWAYS no-store — never reuse a cached read; this
 * is what prevents 409s (§5.4). Returns undefined on 404 (file absent → create).
 */
export async function getFileMeta(
  creds: GitHubCredentials,
  path: string
): Promise<{ sha: string } | undefined> {
  const response = await fetchWithRetry(contentsUrl(creds, path, true), {
    method: 'GET',
    cache: 'no-store',
    headers: authHeaders(creds.token)
  });

  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw httpError(response, 'get sha failed');
  }

  const body = (await response.json()) as { sha?: string };
  if (typeof body.sha !== 'string') {
    throw new GitHubHttpError(response.status, 'missing sha in contents response');
  }
  return { sha: body.sha };
}

/**
 * Reads a file body in raw mode (no base64 decode) — the response text IS the
 * file content. Returns null on 404.
 */
export async function getFileRaw(
  creds: GitHubCredentials,
  path: string
): Promise<string | null> {
  const response = await fetchWithRetry(contentsUrl(creds, path, true), {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: ACCEPT_RAW,
      Authorization: `Bearer ${creds.token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw httpError(response, 'get raw failed');
  }
  return response.text();
}

/**
 * GET-fresh-sha-then-PUT a JSON file (§5.4). When `sha` is omitted the caller
 * relies on this to fetch a fresh sha first (404 → create). A 409 is thrown as
 * a GitHubHttpError(409) and is NOT retried by `fetchWithRetry`.
 */
export async function putFile(
  creds: GitHubCredentials,
  path: string,
  json: string,
  message: string
): Promise<void> {
  const meta = await getFileMeta(creds, path);

  const response = await fetchWithRetry(contentsUrl(creds, path, false), {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      ...authHeaders(creds.token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message,
      content: toBase64Utf8(json),
      sha: meta?.sha,
      branch: creds.branch
    })
  });

  if (!response.ok) {
    throw httpError(response, 'put failed');
  }
}

/** Deletes a file (requires its current sha). Used for cleanup; tolerates 404. */
export async function deleteFile(
  creds: GitHubCredentials,
  path: string,
  message: string
): Promise<void> {
  const meta = await getFileMeta(creds, path);
  if (!meta) {
    return;
  }

  const response = await fetchWithRetry(contentsUrl(creds, path, false), {
    method: 'DELETE',
    cache: 'no-store',
    headers: {
      ...authHeaders(creds.token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message, sha: meta.sha, branch: creds.branch })
  });

  if (!response.ok && response.status !== 404) {
    throw httpError(response, 'delete failed');
  }
}

/** Returns true if the credential's branch exists. */
export async function branchExists(creds: GitHubCredentials): Promise<boolean> {
  const response = await fetchWithRetry(
    `${API_BASE}/repos/${creds.owner}/${creds.repo}/branches/${encodeURIComponent(creds.branch)}`,
    { method: 'GET', cache: 'no-store', headers: authHeaders(creds.token) }
  );

  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw httpError(response, 'branch check failed');
  }
  return true;
}

/** Git's well-known empty tree object — exists in every repo, contains no files. */
const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/**
 * Creates `refs/heads/{branch}` as an ORPHAN branch: an empty initial commit
 * (empty tree, no parents), so the content branch never carries the repo's
 * source tree — only the files folio writes (folio/data.json + folio/settings.json,
 * added by the subsequent push). Idempotent: a 422 "Reference already exists" is
 * treated as success.
 */
export async function createBranch(creds: GitHubCredentials): Promise<void> {
  const commitResponse = await fetchWithRetry(
    `${API_BASE}/repos/${creds.owner}/${creds.repo}/git/commits`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { ...authHeaders(creds.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'chore(folio): initialize content branch',
        tree: EMPTY_TREE_SHA,
        parents: []
      })
    }
  );
  if (!commitResponse.ok) {
    throw httpError(commitResponse, 'orphan commit failed');
  }
  const commit = (await commitResponse.json()) as { sha?: string };
  if (!commit.sha) {
    throw new GitHubHttpError(commitResponse.status, 'orphan commit missing sha');
  }

  const createResponse = await fetchWithRetry(
    `${API_BASE}/repos/${creds.owner}/${creds.repo}/git/refs`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { ...authHeaders(creds.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${creds.branch}`, sha: commit.sha })
    }
  );

  if (!createResponse.ok) {
    // A 422 "Reference already exists" means the branch is already there →
    // idempotent success. Any other 422 (e.g. invalid sha) is a real failure.
    if (createResponse.status === 422) {
      const body = (await createResponse.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (body?.message && /already exists/i.test(body.message)) {
        return;
      }
    }
    throw httpError(createResponse, 'branch create failed');
  }
}
