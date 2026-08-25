const CACHE_NAME = "recomp-gym-console-v2";
const APP_FALLBACK_URL = "/";

const CORE_ASSETS = [
  "/manifest.json",
  "/app-icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
      .then(() => self.clients.claim())
      // Reload currently open tabs once after a service-worker upgrade so a stale app shell
      // cannot keep pointing at asset files that Vercel has already replaced.
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) =>
        Promise.all(
          clients.map((client) => {
            if (!("navigate" in client) || new URL(client.url).origin !== self.location.origin) {
              return undefined;
            }
            return client.navigate(client.url).catch(() => undefined);
          }),
        )
      )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(APP_FALLBACK_URL, copy))
            .catch(() => undefined);
          return response;
        })
        .catch(() =>
          caches.match(APP_FALLBACK_URL).then(
            (cached) =>
              cached ||
              new Response("You are offline. Reopen the workout tracker when you have internet.", {
                headers: { "Content-Type": "text/plain; charset=utf-8" },
                status: 503,
              }),
          ),
        ),
    );
    return;
  }

  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy))
            .catch(() => undefined);
        }
        return response;
      });
    }),
  );
});
