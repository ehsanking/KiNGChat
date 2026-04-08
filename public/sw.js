/* eslint-disable no-undef */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.1.0/workbox-sw.js');

if (self.workbox) {
  self.skipWaiting();
  workbox.core.clientsClaim();

  workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

  workbox.routing.registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/session'),
    new workbox.strategies.NetworkFirst({ cacheName: 'api-session', networkTimeoutSeconds: 6 }),
  );

  workbox.routing.registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/messages/'),
    new workbox.strategies.NetworkFirst({ cacheName: 'api-messages', networkTimeoutSeconds: 6 }),
  );

  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new workbox.strategies.CacheFirst({
      cacheName: 'static-images',
      plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 })],
    }),
  );

  workbox.routing.registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/'),
    new workbox.strategies.StaleWhileRevalidate({ cacheName: 'api-runtime' }),
  );

  workbox.routing.setCatchHandler(async ({ event }) => {
    if (event.request.destination === 'document') {
      const cache = await caches.open('offline-fallback');
      const cached = await cache.match('/offline.html');
      return cached || Response.error();
    }
    return Response.error();
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open('offline-fallback').then((cache) => cache.add('/offline.html')).catch(() => undefined));
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = { title: 'Elahe Messenger', body: 'You have a new message.', url: '/chat' };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    // fallback for non-JSON payloads
  }

  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: '/logo.png',
    badge: '/logo.png',
    data: { url: payload.url },
    tag: 'elahe-message',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/chat';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
    const existing = clientsArr.find((client) => 'focus' in client);
    if (existing) {
      existing.postMessage({ type: 'navigate', url: targetUrl });
      return existing.focus();
    }
    return clients.openWindow(targetUrl);
  }));
});
