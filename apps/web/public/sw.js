/**
 * EVA PWA Service Worker
 * - /coach + /api: pass-through
 * - /c/ navigation: network-first + cached page + offline fallback
 * - /c/ data/resources: stale-while-revalidate
 * - static assets/images/fonts: cache-first
 */
const SHELL_CACHE = 'eva-shell-v4';
const NAV_CACHE = 'eva-nav-v3';
const STATIC_CACHE = 'eva-static-v4';
const CLIENT_DATA_CACHE = 'eva-client-data-v2';

const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/LOGOS/eva-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, NAV_CACHE, STATIC_CACHE, CLIENT_DATA_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function cacheFirst(cacheName, request) {
  return caches.open(cacheName).then(async (cache) => {
    const hit = await cache.match(request);
    if (hit) return hit;
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept Supabase, Vercel internals, coach routes, or API
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/_vercel/') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/coach')
  ) {
    return;
  }

  // Next.js immutable static assets — cache-first forever
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(STATIC_CACHE, event.request));
    return;
  }

  // Same-origin fonts/images — cache-first to improve offline rendering
  if (
    url.origin === self.location.origin &&
    (event.request.destination === 'image' || event.request.destination === 'font')
  ) {
    event.respondWith(
      cacheFirst(STATIC_CACHE, event.request).catch(() =>
        caches.match('/LOGOS/eva-icon.png', { cacheName: SHELL_CACHE })
      )
    );
    return;
  }

  // /c/ navigation requests — network-first with cache fallback
  if (url.pathname.startsWith('/c/') && event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            caches.open(NAV_CACHE).then((cache) => cache.put(event.request, res.clone()));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(event.request, { cacheName: NAV_CACHE });
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
          return offline || new Response('Offline', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // /c/ same-origin resources/data — stale-while-revalidate for offline UX
  if (url.pathname.startsWith('/c/') && url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CLIENT_DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const networkPromise = fetch(event.request)
          .then((res) => {
            if (res && res.ok) cache.put(event.request, res.clone());
            return res;
          })
          .catch(() => null);
        if (cached) return cached;
        const network = await networkPromise;
        if (network) return network;
        return new Response('', { status: 408, statusText: 'Offline' });
      })
    );
    return;
  }

  // Default: network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((r) => r ?? new Response('', { status: 408, statusText: 'Offline' }))
    )
  );
});

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const title = data.title ?? 'EVA Fitness'
  const options = {
    body: data.body ?? '',
    icon: data.icon ?? '/icons/icon-192x192.png',
    badge: data.badge ?? '/icons/icon-72x72.png',
    data: { url: data.url ?? '/' },
    vibrate: [100, 50, 100],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(clients.openWindow(url))
})
