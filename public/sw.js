// Fire Finance Pro service worker.
//
// Sole responsibility: Background Sync. When the app can't confirm a cloud
// save went through before the tab disappeared (backgrounded, killed by the
// OS, closed), the page queues the pending state in IndexedDB and asks the
// browser to deliver it via a 'sync' event — which the browser will fire
// (with automatic retry/backoff) even after the page itself is gone, as
// soon as the device has connectivity again.
//
// This does NOT do any asset caching or offline-shell work — that's a
// separate concern and intentionally not bundled in here.
//
// Browser support note: the Background Sync API (SyncManager) is supported
// in Chromium-based browsers (Chrome/Edge/Samsung Internet/Opera, desktop
// and Android) but NOT in Safari (iOS or macOS) or Firefox. On unsupported
// browsers this file still registers fine, it just never receives a 'sync'
// event — the visibilitychange/pagehide keepalive flush in the app is what
// covers those browsers instead.

const DB_NAME = 'ffpro-sync';
const DB_VERSION = 1;
const STORE_NAME = 'pending';
const PENDING_KEY = 'pending-save';
const SYNC_TAG = 'sync-app-data';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function openDb() {
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

async function getPending() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(PENDING_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function clearPending() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(PENDING_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function flushPendingSave() {
  const pending = await getPending();
  if (!pending) return;

  let res;
  try {
    res = await fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        data: pending.data,
        expectedVersion: pending.expectedVersion,
        force: false,
      }),
    });
  } catch (err) {
    // Network still down — leave the pending record in place and let the
    // sync event fail, so the browser retries with backoff.
    throw err;
  }

  if (res.ok) {
    // Saved successfully — nothing left to retry.
    await clearPending();
    return;
  }

  if (res.status === 409) {
    // Something else (another device, or this same app once reopened)
    // already saved a newer version in the meantime. This queued save is
    // stale — drop it rather than force it through and clobber newer data.
    await clearPending();
    return;
  }

  if (res.status === 401) {
    // Session expired/logged out — nothing useful to retry until the user
    // signs back in, at which point the app's normal sync flow takes over.
    await clearPending();
    return;
  }

  // Any other failure (5xx, etc.): leave the pending record in place and
  // fail the sync event so the browser retries later.
  throw new Error(`Background sync save failed: ${res.status}`);
}

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(flushPendingSave());
  }
});
