// ═══════════════════════════════════════════
//   KOMERCE — Service Worker
//   Cache-first pour fonctionnement hors-ligne
// ═══════════════════════════════════════════

const CACHE_NAME = 'komerce-v1';

const ASSETS = [
  './',
  './komerce.html',
  './sty.css',
  './ap.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap'
];

// Installation : mise en cache des ressources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn('Certaines ressources non mises en cache :', err);
      });
    })
  );
  self.skipWaiting();
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch : cache-first, puis réseau
self.addEventListener('fetch', event => {
  // Ne pas intercepter les requêtes non-GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Mettre en cache les nouvelles ressources valides
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Hors-ligne et pas en cache : retourner index.html
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
