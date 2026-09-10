/**
 * Fire Finance - Hybrid Storage Engine
 * Persistence using IndexedDB with optional SSD Mirroring.
 */

const DB_NAME = 'FireFinance_v1';
const DATA_STORE = 'app_state';
const DOC_STORE = 'internal_docs';
const MIRROR_HANDLE_STORE = 'mirror_handles';
const FILE_BLOB_STORE = 'internal_files';

// FIX: Add timeout wrapper for file operations to prevent hanging
const TIMEOUT_MS = 10000; // 10 second timeout

function withTimeout<T>(promise: Promise<T>, timeoutMs: number = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

const initDB = (): Promise<IDBDatabase | null> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, 5);
      const timeoutId = setTimeout(() => {
        console.warn('indexedDB.open timed out');
        resolve(null);
      }, 3000);

      request.onupgradeneeded = () => {
        try {
          const db = request.result;
          if (!db.objectStoreNames.contains(DATA_STORE)) db.createObjectStore(DATA_STORE);
          if (!db.objectStoreNames.contains(MIRROR_HANDLE_STORE)) db.createObjectStore(MIRROR_HANDLE_STORE);
          if (!db.objectStoreNames.contains(DOC_STORE)) db.createObjectStore(DOC_STORE);
          if (!db.objectStoreNames.contains(FILE_BLOB_STORE)) db.createObjectStore(FILE_BLOB_STORE);
        } catch (e) {
          console.warn('IDB upgrade failed:', e);
        }
      };
      request.onsuccess = () => {
        clearTimeout(timeoutId);
        resolve(request.result);
      };
      request.onerror = () => {
        clearTimeout(timeoutId);
        resolve(null);
      };
      request.onblocked = () => {
        clearTimeout(timeoutId);
        console.warn('IDB open blocked by other tab');
        resolve(null);
      };
    } catch (e) {
      console.warn('indexedDB access error:', e);
      resolve(null);
    }
  });
};

// In-memory fallback for document storage when IndexedDB is unavailable
const memoryDocs = new Map<string, string>();

/**
 * Internal Document CRUD (Bypasses FileSystem API)
 */
export const saveInternalDoc = async (id: string, content: string): Promise<void> => {
  memoryDocs.set(id, content);
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains(DOC_STORE)) return;
    await new Promise<void>((resolve) => {
      try {
        const transaction = db.transaction(DOC_STORE, 'readwrite');
        transaction.objectStore(DOC_STORE).put(content, id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
        transaction.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch (err) {
    console.warn('saveInternalDoc error (non-fatal):', err);
  }
};

export const getInternalDoc = async (id: string): Promise<string | null> => {
  if (memoryDocs.has(id)) {
    return memoryDocs.get(id) || null;
  }
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains(DOC_STORE)) return null;
    return await new Promise<string | null>((resolve) => {
      try {
        const transaction = db.transaction(DOC_STORE, 'readonly');
        const request = transaction.objectStore(DOC_STORE).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
};

export const deleteInternalDoc = async (id: string): Promise<void> => {
  memoryDocs.delete(id);
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains(DOC_STORE)) return;
    const transaction = db.transaction(DOC_STORE, 'readwrite');
    transaction.objectStore(DOC_STORE).delete(id);
  } catch (e) {
    console.warn('deleteInternalDoc error:', e);
  }
};

/**
 * Internal File Blob CRUD (browser-native fallback for regular file
 * uploads — used whenever no local "SSD Mirror" folder is linked, so
 * uploading a document doesn't require the File System Access API).
 */
export const saveFileBlob = async (id: string, blob: Blob): Promise<void> => {
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains(FILE_BLOB_STORE)) return;
    await new Promise<void>((resolve) => {
      try {
        const transaction = db.transaction(FILE_BLOB_STORE, 'readwrite');
        transaction.objectStore(FILE_BLOB_STORE).put(blob, id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = (e) => {
          console.warn('saveFileBlob transaction error:', e);
          resolve();
        };
        transaction.onabort = () => resolve();
      } catch (err) {
        console.warn('saveFileBlob put error:', err);
        resolve();
      }
    });
  } catch (err) {
    console.warn('saveFileBlob IDB error (non-fatal):', err);
  }
};

export const getFileBlob = async (id: string): Promise<Blob | null> => {
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains(FILE_BLOB_STORE)) return null;
    return await new Promise<Blob | null>((resolve) => {
      try {
        const transaction = db.transaction(FILE_BLOB_STORE, 'readonly');
        const request = transaction.objectStore(FILE_BLOB_STORE).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch (err) {
    console.warn('getFileBlob IDB error:', err);
    return null;
  }
};

export const deleteFileBlob = async (id: string): Promise<void> => {
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains(FILE_BLOB_STORE)) return;
    const transaction = db.transaction(FILE_BLOB_STORE, 'readwrite');
    transaction.objectStore(FILE_BLOB_STORE).delete(id);
  } catch (err) {
    console.warn('deleteFileBlob IDB error (non-fatal):', err);
  }
};

/**
 * System Database File Management API
 * Uploads, downloads, and manages project files directly in the backend database.
 */
export interface SystemUploadedFile {
  id: string;
  userId?: string | null;
  projectId?: string | null;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  downloadUrl: string;
  viewUrl: string;
}

// Convert Blob or File to Base64 string safely
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result;
      if (typeof res === 'string') {
        resolve(res.split(',')[1] || '');
      } else {
        reject(new Error('Failed to read file as data URL'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
};

export const uploadFileToSystemDatabase = async (
  file: File | Blob,
  projectId?: string,
  customName?: string
): Promise<SystemUploadedFile> => {
  const fileName = customName || (file instanceof File ? file.name : 'document.bin');
  const fileType = file.type || 'application/octet-stream';
  const fileSize = file.size;

  // Primary: Try multipart/form-data upload
  try {
    const formData = new FormData();
    formData.append('file', file, fileName);
    if (projectId) {
      formData.append('projectId', projectId);
    }

    const res = await fetch('/api/files/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.ok && Array.isArray(data.files) && data.files.length > 0) {
        return data.files[0];
      }
    }
  } catch (multipartErr) {
    console.warn('Multipart upload failed, attempting base64 JSON upload fallback:', multipartErr);
  }

  // Fallback: Base64 JSON upload
  const base64Data = await blobToBase64(file);
  const jsonRes = await fetch('/api/files/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      fileName,
      fileType,
      fileSize,
      base64Data,
      projectId: projectId || null,
    }),
  });

  if (!jsonRes.ok) {
    const errorData = await jsonRes.json().catch(() => ({}));
    throw new Error(errorData.error || `Upload failed with status ${jsonRes.status}`);
  }

  const jsonData = await jsonRes.json();
  if (jsonData.ok && Array.isArray(jsonData.files) && jsonData.files.length > 0) {
    return jsonData.files[0];
  }
  throw new Error('Upload succeeded but no file record was returned by the system database.');
};

export const listFilesFromSystemDatabase = async (projectId: string): Promise<SystemUploadedFile[]> => {
  try {
    const res = await fetch(`/api/files/project/${encodeURIComponent(projectId)}`, {
      credentials: 'include'
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.files) ? data.files : [];
  } catch (err) {
    console.warn('listFilesFromSystemDatabase error:', err);
    return [];
  }
};

export const getFileContentFromSystemDatabase = async (fileId: string): Promise<string | null> => {
  try {
    const res = await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
      credentials: 'include'
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.warn('getFileContentFromSystemDatabase error:', err);
    return null;
  }
};

export const downloadFileFromSystemDatabase = async (fileId: string, fileName: string): Promise<void> => {
  const downloadUrl = `/api/files/${encodeURIComponent(fileId)}/download`;
  
  try {
    const res = await fetch(downloadUrl, { credentials: 'include' });
    if (!res.ok) {
      throw new Error(`Failed to download file from database (Status ${res.status})`);
    }
    const blob = await res.blob();
    triggerSecureDownload(blob, fileName);
  } catch (err) {
    // Direct anchor fallback
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
    }, 2000);
  }
};

export const deleteFileFromSystemDatabase = async (fileId: string): Promise<void> => {
  try {
    await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  } catch (err) {
    console.warn('deleteFileFromSystemDatabase non-fatal error:', err);
  }
};

/**
 * Universal Download Utility
 */
export const triggerSecureDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 2000);
};

/**
 * SSD Mirroring Logic
 */
export const saveFileToHardDrive = async (
  directoryHandle: FileSystemDirectoryHandle,
  projectName: string,
  fileName: string,
  blob: Blob
): Promise<string> => {
  try {
    // FIX: Add timeout to prevent hanging
    const save = async () => {
      const folderName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const projectFolder = await directoryHandle.getDirectoryHandle(folderName, { create: true });
      const fileHandle = await projectFolder.getFileHandle(fileName, { create: true });
      const writable = await (fileHandle as any).createWritable();
      await writable.write(blob);
      await writable.close();
      return `${folderName}/${fileName}`;
    };
    return await withTimeout(save());
  } catch (error) {
    console.warn("Hardware mirror failed, fallback to internal db only.", error);
    throw error;
  }
};

/**
 * Auto-Save Backup Logic
 */
export const saveBackupToHardDrive = async (
  directoryHandle: FileSystemDirectoryHandle,
  data: any
): Promise<void> => {
  try {
    // FIX: Add timeout to prevent hanging
    const backup = async () => {
      const backupFolder = await directoryHandle.getDirectoryHandle("Fire Finance Backups", { create: true });
      const fileName = `vault_auto_backup.json`;
      const fileHandle = await backupFolder.getFileHandle(fileName, { create: true });
      const writable = await (fileHandle as any).createWritable();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      await writable.write(blob);
      await writable.close();
    };
    return await withTimeout(backup());
  } catch (error) {
    console.warn("Auto-backup mirror write failed. Check permissions.", error);
    throw error;
  }
};

export const getFileFromHardDrive = async (
  directoryHandle: FileSystemDirectoryHandle,
  storageRef: string
): Promise<Blob> => {
  const [folderName, fileName] = storageRef.split('/');
  const projectFolder = await directoryHandle.getDirectoryHandle(folderName);
  const fileHandle = await projectFolder.getFileHandle(fileName);
  return await fileHandle.getFile();
};

export const storeMirrorHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MIRROR_HANDLE_STORE, 'readwrite');
    transaction.objectStore(MIRROR_HANDLE_STORE).put(handle, 'active_mirror');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getStoredVaultHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MIRROR_HANDLE_STORE, 'readonly');
    const request = transaction.objectStore(MIRROR_HANDLE_STORE).get('active_mirror');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

export const clearVaultHandle = async () => {
  const db = await initDB();
  const transaction = db.transaction(MIRROR_HANDLE_STORE, 'readwrite');
  transaction.objectStore(MIRROR_HANDLE_STORE).delete('active_mirror');
};

/**
 * Format bytes into human-readable size
 */
export const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

