// Custom service worker for the installable PWA.
//
// The app is mostly online-first because Supabase and YouTube require network access, but this
// worker caches the shell assets so the Home Screen app opens reliably and can recover from spotty
// reception in the gym.

// Bump CACHE_NAME and APP_VERSION whenever deploy behavior changes. A new cache name makes old
// assets easy to delete during activate.
const CACHE_NAME = "recomp-gym-console-v30";
const APP_VERSION = "2026-09-04-reliable-coach-v30";
const APP_FALLBACK_URL = "/";

// Core assets are safe to precache because they are small and required for the installed shell.
const CORE_ASSETS = [
  "/manifest.json",
  "/app-icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  // Cache the shell immediately and activate without waiting for every old tab to close.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Delete old named caches, claim existing clients, then notify open pages that a fresh app
  // version is available.
  event.waitUntil(
    caches.keys().then((keys) => {
      // Keep one previous version so an already-open tab can finish its session
      // with its own hashed scripts. Never delete caches belonging to other apps.
      const appCaches = keys.filter((key) => /^recomp-gym-console-v\d+$/.test(key))
        .sort((a, b) => Number(b.split("-v").at(-1)) - Number(a.split("-v").at(-1)));
      const keep = new Set([CACHE_NAME, ...appCaches.filter((key) => key !== CACHE_NAME).slice(0, 1)]);
      return Promise.all(appCaches.filter((key) => !keep.has(key)).map((key) => caches.delete(key)));
    })
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) =>
        Promise.all(
          clients.map((client) => {
            client.postMessage({ type: "APP_UPDATED", version: APP_VERSION });
            return undefined;
          }),
        )
      )
  );
});

self.addEventListener("message", (event) => {
  // The React app can ask a waiting worker to activate immediately after a deploy.
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  const requestDestination = event.request.destination;

  if (event.request.mode === "navigate") {
    // Navigations are network-first. If the user is offline, serve the last good app shell so the
    // tracker can still open and show locally saved data.
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
            throw new Error("App shell unavailable");
          }
          const copy = response.clone();
          await caches
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

  if (requestDestination === "script" || requestDestination === "style") {
    // Scripts and styles are network-first so deploys reach users quickly, with cached fallbacks for
    // weak reception.
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          // A deployment fallback can return index.html for a missing script.
          // Never cache that response as JavaScript or overwrite a usable bundle.
          if (!response.ok || response.headers.get("content-type")?.includes("text/html")) {
            throw new Error("App asset unavailable");
          }
          if (response.ok) {
            const copy = response.clone();
            await caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copy))
              .catch(() => undefined);
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(
            (cached) =>
              cached ||
              new Response("", {
                status: 503,
                statusText: "Offline",
              }),
          ),
        ),
    );
    return;
  }

  event.respondWith(
    // Images, manifest files, and other same-origin GET assets are cache-first after their first
    // successful load.
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then(async (response) => {
        if (response.ok && !response.headers.get("cache-control")?.includes("no-store")) {
          const copy = response.clone();
          await caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy))
            .catch(() => undefined);
        }
        return response;
      });
    }),
  );
});
