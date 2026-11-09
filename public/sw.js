// Listavy service worker, Sprint 0.
// Purpose: satisfy PWA install requirements. It does NOT cache data or pages yet.
// Offline caching is deliberately out of scope until Sprint 2, when job flows exist.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Pass every request through to the network.
});
