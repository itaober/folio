import type { GitHubCredentialsInput } from '../core/sync/credentials';
import type {
  GitHubResolveStrategy,
  GitHubStoreDiff,
  GitHubSyncStatus
} from '../core/sync/github/types';

export interface CaptureResumeSnapshotMessage {
  type: 'captureResumeSnapshot';
  itemId: string;
}

export interface OpenPopupItemMessage {
  type: 'openPopupItem';
  itemId: string;
}

export interface GitHubConnectMessage {
  type: 'githubConnect';
  creds: GitHubCredentialsInput;
}

export interface GitHubDisconnectMessage {
  type: 'githubDisconnect';
}

export interface GitHubPushNowMessage {
  type: 'githubPushNow';
}

export interface GitHubPullNowMessage {
  type: 'githubPullNow';
}

export interface GitHubGetStatusMessage {
  type: 'githubGetStatus';
}

export interface GitHubGetDiffMessage {
  type: 'githubGetDiff';
}

export interface GitHubResolveMessage {
  type: 'githubResolve';
  strategy: GitHubResolveStrategy;
}

/**
 * Fire-and-forget request from a page context (popup/options) asking the
 * background service worker to run the debounced GitHub push in its own durable
 * context — a page's setTimeout would die when the popup closes.
 */
export interface GitHubSchedulePushMessage {
  type: 'githubSchedulePush';
}

export type RuntimeMessage =
  | CaptureResumeSnapshotMessage
  | OpenPopupItemMessage
  | GitHubConnectMessage
  | GitHubDisconnectMessage
  | GitHubPushNowMessage
  | GitHubPullNowMessage
  | GitHubGetStatusMessage
  | GitHubGetDiffMessage
  | GitHubResolveMessage
  | GitHubSchedulePushMessage;

/** Base reply contract shared by every runtime message. */
export interface RuntimeMessageResponse {
  ok: boolean;
  error?: string;
}

/** `githubGetStatus` reply: base contract + the status snapshot on success. */
export interface GitHubStatusResponse extends RuntimeMessageResponse {
  status?: GitHubSyncStatus;
}

/** `githubGetDiff` reply: base contract + the item-level diff on success. */
export interface GitHubDiffResponse extends RuntimeMessageResponse {
  diff?: GitHubStoreDiff;
}
