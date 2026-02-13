const CACHE_NAME = 'navifly-tile-cache-v1';
const TILE_URL_PATTERN = /tile\.openstreetmap\.org/;

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Only cache map tiles
    if (TILE_URL_PATTERN.test(url)) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((response) => {
                    const fetchPromise = fetch(event.request).then((networkResponse) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                    // Return cached response if available, else wait for network
                    return response || fetchPromise;
                });
            })
        );
    }
});
