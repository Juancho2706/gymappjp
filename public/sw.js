const CACHE_NAME = 'omnicoach-pwa-cache-v1';

// Recursos mínimos a guardar en caché para la PWA
// He quitado el manifest y el root porque son dinámicos en Next.js
const urlsToCache = [
  '/icon-192x192.png',
  '/icon-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Usamos addAll con cuidado, si falla un recurso falla todo el SW
        return cache.addAll(urlsToCache).catch(err => {
          console.error('Fallo al precargar cache:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Ignorar peticiones que no sean GET (como las Server Actions que son POST)
  if (event.request.method !== 'GET') {
    return;
  }

  // Ignorar peticiones a la API de Supabase o rutas internas de Next.js
  if (
    event.request.url.includes('supabase.co') || 
    event.request.url.includes('/_next/') ||
    event.request.url.includes('/api/')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request).catch(err => {
          console.error('[SW] Fetch failed for:', event.request.url, err);
          // Opcionalmente retornar una respuesta de error o una página offline
          return null;
        });
      })
  );
});