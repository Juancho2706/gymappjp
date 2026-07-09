/**
 * EVA PWA Service Worker
 * - /coach + /api: pass-through
 * - /c/ + /t/ navigation: network-first + cached page + offline fallback
 * - /c/ + /t/ data/resources: stale-while-revalidate
 * - static assets/images/fonts: cache-first
 *
 * /t/ (team/pool students — Movida) shares the same offline strategy as /c/.
 * The proxy rewrites /t/...→/c/... server-side, but the browser URL and the SW
 * both stay at /t/..., so the SW must match both prefixes. Cache keys are
 * per-URL, so /c and /t never bleed across tenants.
 */
const SHELL_CACHE = 'eva-shell-v5';
const NAV_CACHE = 'eva-nav-v4';
const STATIC_CACHE = 'eva-static-v6';
const CLIENT_DATA_CACHE = 'eva-client-data-v3';

const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/LOGOS/eva-icon.png'];

// Student PWA trees: standalone /c/ and team/pool /t/ (proxy-rewritten to /c/).
const isClientApp = (pathname) => pathname.startsWith('/c/') || pathname.startsWith('/t/');

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

  // Same-origin only. Passing cross-origin requests through the SW breaks them
  // (Google Identity Services' script got a synthesized 408 here); the browser
  // must handle Supabase, GIS, MercadoPago, analytics, etc. natively.
  if (url.origin !== self.location.origin) return;

  // Never intercept Vercel internals, coach routes, or API
  if (
    url.pathname.startsWith('/_vercel/') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/coach')
  ) {
    return;
  }

  // Next.js static assets — network-first so redeployed chunks are never stale;
  // cache fallback keeps offline support for /c/ routes intact.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.ok) {
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, res.clone()));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(event.request, { cacheName: STATIC_CACHE });
          return cached || new Response('', { status: 408, statusText: 'Offline' });
        })
    );
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

  // /c/ + /t/ navigation requests — network-first with cache fallback
  if (isClientApp(url.pathname) && event.request.mode === 'navigate') {
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
          // Cinturón: reintenta ignorando query params (la entrada pudo guardarse con/sin ellos).
          const cachedLoose = await caches.match(event.request, { cacheName: NAV_CACHE, ignoreSearch: true });
          if (cachedLoose) return cachedLoose;
          const offline = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
          return offline || new Response('Offline', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // /c/ + /t/ same-origin resources/data — stale-while-revalidate for offline UX
  if (isClientApp(url.pathname) && url.origin === self.location.origin) {
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

/**
 * Precache de navegación bajo demanda (QA CEO 2026-07-07, modo avión).
 *
 * GOTCHA que expulsaba al alumno del entreno: NAV_CACHE sólo se llenaba con navegaciones DURAS
 * (mode === 'navigate'). El alumno entra al workout por navegación SPA (dashboard → workout,
 * client-side = fetch RSC que va a CLIENT_DATA_CACHE), así que la URL del workout NUNCA quedaba
 * en NAV_CACHE. Cuando el browser descarta la pestaña en background (ahorro de batería) y la
 * recarga OFFLINE, esa navegación dura no encuentra la página → offline.html → "No puedes
 * entrenar sin internet", con la sesión y la cola offline intactas pero inalcanzables.
 *
 * Fix: la pantalla de ejecución manda { type: 'eva:cache-nav', url } al montar; acá se fetchea el
 * HTML completo de esa URL (mismo documento que devolvería una navegación dura, con el estado
 * SSR'd embebido) y se guarda en NAV_CACHE → la recarga offline bootea la página real y el estado
 * local (cola/drafts/snapshot/cronómetro) restaura la sesión.
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'eva:cache-nav' || typeof data.url !== 'string') return;
  let url;
  try {
    url = new URL(data.url, self.location.origin);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin || !isClientApp(url.pathname)) return;
  event.waitUntil(
    fetch(url.href, { credentials: 'same-origin' })
      .then((res) => {
        // `!redirected`: si la sesión expiró, el fetch sigue el redirect al login — cachear ESO
        // bajo la URL del workout serviría la página de login en la recarga offline. Sólo se
        // guarda el documento real (200 directo) de la URL pedida.
        if (res && res.ok && !res.redirected) {
          return caches.open(NAV_CACHE).then((cache) => cache.put(url.href, res));
        }
      })
      .catch(() => {})
  );
});

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  // White-label (W2): el payload puede traer la marca del coach (brandName + iconUrl/icon).
  // Fallback = EVA cuando el caller no manda marca (coach free/starter o sin logo).
  const title = data.title ?? data.brandName ?? 'EVA Fitness'
  const options = {
    body: data.body ?? '',
    icon: data.icon ?? data.iconUrl ?? '/LOGOS/eva-icon.png',
    badge: data.badge ?? '/LOGOS/eva-icon.png',
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
