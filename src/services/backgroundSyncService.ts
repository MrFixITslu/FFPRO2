// Talks to the service worker (see public/sw.js) to make sure a cloud save
// that couldn't be confirmed before the tab disappeared eventually gets
// delivered — even if the app is fully closed/killed in the meantime — by
// queuing it in IndexedDB and asking the browser to retry it via the
// Background Sync API.
//
// Not supported on Safari (iOS/macOS) or Firefox — every method here is a
// no-op on those browsers, so it's always safe to call regardless of
// platform. The visibilitychange/pagehide keepalive flush in App.tsx is
// what covers those browsers instead; this is an additional safety net
// specifically for Chromium-based mobile browsers, where the OS is more
// aggressive about killing backgrounded tabs before any in-flight fetch —
// keepalive included — gets a chance to finish.

const DB_NAME = 'ffpro-sync';
const DB_VERSION = 1;
const STORE_NAME = 'pending';
const PENDING_KEY = 'pending-save';
const SYNC_TAG = 'sync-app-data';

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'SyncManager' in window &&
    'indexedDB' in window
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function del(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const backgroundSyncService = {
  isSupported,

  /** Registers the service worker once, near app startup. No-op if unsupported. */
  async register(): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (err) {
      console.warn('[background-sync] Service worker registration failed:', err);
    }
  },

  /**
   * Stashes the current app state + the version it should be saved against,
   * then asks the browser to deliver it to the cloud in the background —
   * even if this tab closes or the app gets killed before that happens.
   * Safe to call repeatedly; each call overwrites the previously queued save.
   */
  async scheduleBackgroundSave(data: unknown, expectedVersion: number): Promise<void> {
    if (!isSupported()) return;
    try {
      await put(PENDING_KEY, { data, expectedVersion, queuedAt: new Date().toISOString() });
      const reg = await navigator.serviceWorker.ready;
      await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register(SYNC_TAG);
    } catch (err) {
      console.warn('[background-sync] Failed to schedule background save:', err);
    }
  },

  /** Clears any queued background save — call once a save has succeeded normally. */
  async clearPendingSave(): Promise<void> {
    if (typeof window === 'undefined' || !('indexedDB' in window)) return;
    try {
      await del(PENDING_KEY);
    } catch {
      // Non-fatal — worst case a stale queued save gets retried once, finds
      // its expectedVersion no longer matches, and no-ops as a 409.
    }
  },
};
