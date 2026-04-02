export interface CaptureResumeSnapshotMessage {
  type: 'captureResumeSnapshot';
  itemId: string;
}

export interface OpenPopupItemMessage {
  type: 'openPopupItem';
  itemId: string;
}

export type RuntimeMessage =
  | CaptureResumeSnapshotMessage
  | OpenPopupItemMessage;

export interface RuntimeMessageResponse {
  ok: boolean;
  error?: string;
}
