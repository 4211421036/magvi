const CACHE_NAME = "magvi-v1";
const urlsToCache = [
  "index.html",
  "logomag192x192.jpeg",
  "logomag48x48.jpeg",
  "logomag512x512.jpeg",
  "manifest.webmanifest",
  "script.js",
  "script.json",
  "styles.css",
  "magnet_data.json",
  "assets/brunoPeekingBottom-cropped.gif",
  "assets/sensor-circuit.png"
];
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log("[ServiceWorker] Opened cache");
        return Promise.allSettled(
          urlsToCache.map(url =>
            fetch(url).then(response => {
              if (!response.ok) {
                throw new Error(`Fetch failed for ${url}: ${response.statusText}`);
              }
              return cache.put(url, response);
            })
          )
        ).then(results => {
          // laporkan yang gagal
          results.forEach((r, i) => {
            if (r.status === "rejected") {
              console.warn("[ServiceWorker] Caching failed:", urlsToCache[i], r.reason);
            }
          });
        });
      })
      .catch(err => console.error("[ServiceWorker] Cache open error:", err))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(cachedResp => {
        if (cachedResp) return cachedResp;

        return fetch(event.request.clone())
          .then(networkResp => {
            if (!networkResp || networkResp.status !== 200 || networkResp.type !== "basic") {
              return networkResp;
            }
            // simpan response baru
            const respClone = networkResp.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, respClone);
            });
            return networkResp;
          })
          .catch(() => {
            if (event.request.headers.get("accept")?.includes("text/html")) {
              return caches.match("/index.html");
            }
          });
      })
  );
});

self.addEventListener("activate", event => {
  const whitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (!whitelist.includes(key)) {
            console.log("[ServiceWorker] Deleting cache:", key);
            return caches.delete(key);
          }
        })
      )
    )
  );
});

self.addEventListener("sync", event => {
  if (event.tag === "sync-data") {
    event.waitUntil(
      fetchLatestData()
        .then(() => console.log("[ServiceWorker] Data synced"))
        .catch(err => console.error("[ServiceWorker] Sync failed", err))
    );
  }
});

function fetchLatestData() {
  return fetch("https://4211421036.github.io/magvi/magnet_data.json")
    .then(res => {
      if (!res.ok) throw new Error("Fetch data failed");
      return res.json();
    })
    .then(data => {
      return Promise.resolve();
    });
}
