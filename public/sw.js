self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Minimal fetch handler to satisfy PWA installability requirements
  // In a real offline app, you'd implement a caching strategy here.
});
