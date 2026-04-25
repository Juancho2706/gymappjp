/**
 * EVA PWA — política conservadora:
 * - No precachear HTML ni payloads RSC de Next (evita contenido obsoleto).
 * - Rutas /coach y /c/ no se interceptan (fetch pasa al origen).
 * - Si se amplía el precache, usar solo estáticos versionables (iconos, etc.).
 */
const CACHE_NAME = 'eva-pwa-cache-v1';

// Recursos mínimos a guardar en caché para la PWA
// He quitado el manifest y el root porque son dinámicos en Next.js
const urlsToCache = ['/LOGOS/eva-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Usamos addAll con cuidado, si falla un recurso falla todo el SW
        return cache.addAll(urlsToCache).catch(() => {
          // Silently fail cache preload
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

  const url = new URL(event.request.url);

  // Ignorar peticiones a la API de Supabase, rutas internas de Next.js o rutas específicas
  if (
    url.hostname.includes('supabase.co') || 
    url.pathname.includes('/_next/') ||
    url.pathname.includes('/api/') ||
    url.pathname.startsWith('/coach') ||
    url.pathname.startsWith('/c/')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request).catch(err => {
          console.error('[SW] Fetch failed for:', event.request.url, err);
          // Retornar una respuesta vacía válida en lugar de null para evitar TypeError
          return new Response('', {
            status: 408,
            statusText: 'Request Timeout'
          });
        });
      })
  );
});