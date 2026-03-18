export const BACKUP_FILE_NAME = 'folio-data.json';

export interface BackupWriteSuccess {
  ok: true;
  syncedAt: number;
}

export interface BackupWriteFailure {
  ok: false;
  error: string;
}

export type BackupWriteResult = BackupWriteSuccess | BackupWriteFailure;
