import type { FolioStore } from '../types';
import { getBackupDirectoryHandle } from './handleStore';
import { BACKUP_FILE_NAME, type BackupWriteResult } from './types';

async function ensureReadWritePermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  const handleWithPermissions = handle as FileSystemDirectoryHandle & {
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  };

  if (!handleWithPermissions.queryPermission || !handleWithPermissions.requestPermission) {
    return true;
  }

  if (
    (await handleWithPermissions.queryPermission({ mode: 'readwrite' })) ===
    'granted'
  ) {
    return true;
  }

  if (
    (await handleWithPermissions.requestPermission({ mode: 'readwrite' })) ===
    'granted'
  ) {
    return true;
  }

  return false;
}

export async function writeBackupToDirectory(
  store: FolioStore
): Promise<BackupWriteResult> {
  try {
    const directoryHandle = await getBackupDirectoryHandle();
    if (!directoryHandle) {
      return {
        ok: false,
        error: 'sync_directory_not_configured'
      };
    }

    const hasPermission = await ensureReadWritePermission(directoryHandle);
    if (!hasPermission) {
      return {
        ok: false,
        error: 'sync_permission_denied'
      };
    }

    const fileHandle = await directoryHandle.getFileHandle(BACKUP_FILE_NAME, {
      create: true
    });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(store, null, 2));
    await writable.close();

    return {
      ok: true,
      syncedAt: Date.now()
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'sync_write_failed';
    return {
      ok: false,
      error: message
    };
  }
}
