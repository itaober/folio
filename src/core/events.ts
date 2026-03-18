import type { FolioMutation, FolioStore } from './types';

export interface CommitEvent {
  mutation: FolioMutation;
  store: FolioStore;
}

const listeners = new Set<(event: CommitEvent) => void>();

export function emitCommitEvent(event: CommitEvent): void {
  listeners.forEach((listener) => listener(event));
}

export function subscribeCommitEvent(listener: (event: CommitEvent) => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
