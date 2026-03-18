const DB_NAME = 'folio-sync-db';
const STORE_NAME = 'handles';
const DIRECTORY_HANDLE_KEY = 'backup-directory';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open sync database'));
    };

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = action(store);

    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    transaction.oncomplete = () => {
      database.close();
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
      database.close();
    };
  });
}

export async function saveBackupDirectoryHandle(
  handle: FileSystemDirectoryHandle
): Promise<void> {
  await withStore('readwrite', (store) => store.put(handle, DIRECTORY_HANDLE_KEY));
}

export async function getBackupDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const result = await withStore<FileSystemDirectoryHandle | undefined>(
    'readonly',
    (store) => store.get(DIRECTORY_HANDLE_KEY)
  );

  return result ?? null;
}

export async function clearBackupDirectoryHandle(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(DIRECTORY_HANDLE_KEY));
}
