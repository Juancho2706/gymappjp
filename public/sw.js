const CACHE_NAME = 'omnicoach-pwa-cache-v1';

// Recursos mínimos a guardar en caché para la PWA
const urlsToCache = [
  '/',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Activar el SW inmediatamente
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName); // Limpiar cachés antiguos
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Este es el evento MÁS IMPORTANTE. 
// Sin esto, Chrome/Android rechazan la instalación de la PWA.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Devuelve el recurso cacheado si existe, o haz la petición a red
        return response || fetch(event.request);
      })
  );
});