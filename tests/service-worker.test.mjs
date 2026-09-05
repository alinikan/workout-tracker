import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

// The cache and network are controlled fixtures. These tests exercise the worker's
// registered handlers, including responses that previously produced blank PWAs.
function worker(fetchResponse) {
  const listeners = {};
  const stores = new Map();
  const keyFor = (request) => typeof request === "string" ? request : request.url;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return { async put(key, response) { entries.set(keyFor(key), response.clone()); }, async addAll() {} };
    },
    async match(key) {
      for (const entries of stores.values()) {
        const response = entries.get(keyFor(key));
        if (response) return response.clone();
      }
    },
    async keys() { return [...stores.keys()]; },
    async delete(key) { return stores.delete(key); },
  };
  const self = {
    location: { origin: "https://tracker.test" },
    addEventListener(name, callback) { listeners[name] = callback; },
    skipWaiting() {},
    clients: { async claim() {}, async matchAll() { return []; } },
  };
  runInNewContext(source, { self, caches, fetch: fetchResponse, URL, Response, Set, Promise });
  return {
    caches,
    stores,
    async activate() {
      let pending;
      listeners.activate({ waitUntil(value) { pending = value; } });
      await pending;
    },
    async request(path, destination, mode = "cors") {
      let pending;
      listeners.fetch({ request: { url: `https://tracker.test${path}`, method: "GET", mode, destination }, respondWith(value) { pending = value; } });
      return await pending;
    },
  };
}

test("an HTTP error cannot replace the last working offline page", async () => {
  const app = worker(async () => new Response("Server error", { status: 500 }));
  const cache = await app.caches.open("recomp-gym-console-v31");
  await cache.put("/", new Response("Working tracker"));
  assert.equal(await (await app.request("/", "document", "navigate")).text(), "Working tracker");
  assert.equal(await (await app.caches.match("/")).text(), "Working tracker");
});

test("HTML returned for an old script falls back to the cached JavaScript", async () => {
  const app = worker(async () => new Response("<html>Fallback</html>", { headers: { "content-type": "text/html" } }));
  const cache = await app.caches.open("recomp-gym-console-v29");
  await cache.put("https://tracker.test/assets/old.js", new Response("workingScript()"));
  assert.equal(await (await app.request("/assets/old.js", "script")).text(), "workingScript()");
});

test("offline navigation uses the cached page", async () => {
  const app = worker(async () => { throw new TypeError("Offline"); });
  const cache = await app.caches.open("recomp-gym-console-v31");
  await cache.put("/", new Response("Saved shell"));
  assert.equal(await (await app.request("/", "document", "navigate")).text(), "Saved shell");
});

test("activation retains one prior app version and leaves unrelated caches alone", async () => {
  const app = worker(async () => new Response("OK"));
  for (const name of ["other-app", "recomp-gym-console-v29", "recomp-gym-console-v30", "recomp-gym-console-v31"]) await app.caches.open(name);
  await app.activate();
  assert.deepEqual([...app.stores.keys()].sort(), ["other-app", "recomp-gym-console-v30", "recomp-gym-console-v31"]);
});

test("no-store responses are not added to the offline cache", async () => {
  const app = worker(async () => new Response("Private", { headers: { "cache-control": "no-store" } }));
  await app.request("/api/private", "");
  assert.equal(await app.caches.match("https://tracker.test/api/private"), undefined);
});
