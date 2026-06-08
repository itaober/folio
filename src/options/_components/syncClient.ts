import type { GitHubCredentialsInput } from '../../core/sync/credentials';
import type {
  GitHubResolveStrategy,
  GitHubStoreDiff,
  GitHubSyncStatus
} from '../../core/sync/github/types';
import type {
  GitHubDiffResponse,
  GitHubStatusResponse,
  RuntimeMessage,
  RuntimeMessageResponse
} from '../../shared/runtimeMessages';

/**
 * Thin client over the background service-worker GitHub sync handlers. The
 * options surface never talks to api.github.com directly — every call is a
 * runtime message the SW fulfils (and which folds lastSyncedAt/lastSyncError +
 * emits a commit event so the chrome.storage subscription refreshes this page).
 */

async function send<R extends RuntimeMessageResponse>(message: RuntimeMessage): Promise<R> {
  return (await chrome.runtime.sendMessage(message)) as R;
}

export async function githubGetStatus(): Promise<GitHubSyncStatus | null> {
  const reply = await send<GitHubStatusResponse>({ type: 'githubGetStatus' });
  return reply.ok && reply.status ? reply.status : null;
}

export async function githubConnect(
  creds: GitHubCredentialsInput
): Promise<RuntimeMessageResponse> {
  return send({ type: 'githubConnect', creds });
}

export async function githubDisconnect(): Promise<RuntimeMessageResponse> {
  return send({ type: 'githubDisconnect' });
}

export async function githubPushNow(): Promise<RuntimeMessageResponse> {
  return send({ type: 'githubPushNow' });
}

export async function githubPullNow(): Promise<RuntimeMessageResponse> {
  return send({ type: 'githubPullNow' });
}

export async function githubGetDiff(): Promise<GitHubStoreDiff | null> {
  const reply = await send<GitHubDiffResponse>({ type: 'githubGetDiff' });
  return reply.ok && reply.diff ? reply.diff : null;
}

export async function githubResolve(
  strategy: GitHubResolveStrategy
): Promise<RuntimeMessageResponse> {
  return send({ type: 'githubResolve', strategy });
}
