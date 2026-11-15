// Listavy service worker, Sprint 0.
// Purpose: satisfy PWA install requirements. It does NOT cache data or pages yet.
// Offline caching is deliberately out of scope until Sprint 2, when job flows exist.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Pass every request through to the network.
});

// Web Push (admin notifications). Payload: { title, body, url }.
self.addEventListener("push", (event) => {
  let data = { title: "Listavy", body: "", url: "/admin" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload: keep the defaults.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
