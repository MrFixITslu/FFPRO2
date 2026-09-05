/**
 * Fire Finance Pro - Service Worker
 * Handles App Badging API, Background Sync, and Offline Caching
 */

const CACHE_NAME = 'ffpro-v1';
let currentBadgeCount = 0;

// Install event
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
    })()
  );
});

// Helper: Safely apply badge in Service Worker context
async function applyBadge(count) {
  currentBadgeCount = typeof count === 'number' && Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
  if ('setAppBadge' in self.navigator) {
    try {
      if (currentBadgeCount > 0) {
        await self.navigator.setAppBadge(currentBadgeCount);
      } else {
        await self.navigator.clearAppBadge();
      }
    } catch (err) {
      // Ignore unsupported or restricted environment errors
    }
  }
}

// Helper: Safely clear badge in Service Worker context
async function clearBadge() {
  currentBadgeCount = 0;
  if ('clearAppBadge' in self.navigator) {
    try {
      await self.navigator.clearAppBadge();
    } catch (err) {
      // Ignore errors
    }
  }
}

// Listen for messages from foreground clients (React application)
self.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') return;

  const { type, count } = event.data;

  switch (type) {
    case 'SET_BADGE':
      event.waitUntil(applyBadge(count));
      break;

    case 'CLEAR_BADGE':
      event.waitUntil(clearBadge());
      break;

    case 'GET_BADGE':
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ count: currentBadgeCount });
      }
      break;

    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    default:
      break;
  }
});

// Push notification event (handles server pushes if configured)
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Fire Finance Pro', body: event.data ? event.data.text() : 'New notification' };
  }

  const title = data.title || 'Fire Finance Pro Notification';
  const options = {
    body: data.body || 'You have new unread items in Fire Finance Pro',
    icon: '/logo.png',
    badge: '/favicon.png',
    data: data.url || '/',
    tag: data.tag || 'ffpro-notification'
  };

  if (typeof data.badgeCount === 'number') {
    applyBadge(data.badgeCount);
  } else if (currentBadgeCount > 0) {
    applyBadge(currentBadgeCount + 1);
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data || '/';

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});
