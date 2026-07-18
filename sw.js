/*
==========================================================
VIKRAM Investor Operating System
File : sw.js (Service Worker)

Caches the core app files so VIKRAM opens instantly and works
even with no internet connection, using the last-loaded data.
This does NOT fetch live data on its own - it just makes the
app itself installable and available offline, same as any
other installed app.
==========================================================
*/

const CACHE_NAME = 'vikram-cache-v2';

const CORE_FILES = [
  './index.html',
  './about.html',
  './css/style.css',
  './js/companyDatabase.js',
  './js/technicalData.js',
  './js/financialData.js',
  './js/engine.js',
  './js/scoreEngine.js',
  './js/gauge.js',
  './js/valuationEngine.js',
  './js/riskEngine.js',
  './js/institutionEngine.js',
  './js/fundamentalEngine.js',
  './js/newsEngine.js',
  './js/frameworkEngine.js',
  './js/ui.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// On install: cache all core files so the app works offline immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_FILES))
  );
  self.skipWaiting();
});

// On activate: remove any old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Serve from cache first, fall back to network - this is what makes
// the app open instantly and work offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).catch(() => {
        // If offline and not cached, just fail gracefully for that one request
        return new Response('Offline - this content is not cached yet.', { status: 503 });
      });
    })
  );
});
