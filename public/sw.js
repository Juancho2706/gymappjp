/**
 * EVA PWA Service Worker
 * - /coach: pass-through (never cached)
 * - /c/ navigation (HTML): network-first, cache fallback for offline
 * - /_next/ statics: cache-first (immutable hashes)
 * - Everything else: network-first, silent fail
 */
const SHELL_CACHE = 'eva-shell-v2';
const NAV_CACHE = 'eva-nav-v1';
const STATIC_CACHE = 'eva-static-v2';

const PRECACHE = ['/LOGOS/eva-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, NAV_CACHE, STATIC_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept Supabase, Next internals, coach routes, or API
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/_vercel/') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/coach')
  ) {
    return;
  }

  // Next.js immutable static assets — cache-first forever
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      })
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
        .catch(() =>
          caches.match(event.request, { cacheName: NAV_CACHE }).then((cached) => {
            if (cached) return cached;
            // Fallback: serve root cached page if specific URL not cached
            return caches.match('/', { cacheName: NAV_CACHE });
          })
        )
    );
    return;
  }

  // Default: network with silent fallback
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((r) => r ?? new Response('', { status: 408, statusText: 'Offline' }))
    )
  );
});
