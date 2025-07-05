const CACHE_NAME = 'mytextwriter-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/static/mytextwriter.com_logo.png',
  '/static/mytextwriter.com_icon_256x256.ico',
  '/static/js/zxing_reader.js',
];

// Install event - cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          return cacheName !== CACHE_NAME;
        }).map(cacheName => {
          return caches.delete(cacheName);
        })
      );
    })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version if found
        if (response) {
          return response;
        }

        // Clone the request - request can only be used once
        const fetchRequest = event.request.clone();

        // Try to fetch from network
        return fetch(fetchRequest).then(response => {
          // Don't cache if not a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response - response can only be used once
          const responseToCache = response.clone();

          // Open cache and store the new response
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
  );
});

// Handle connectivity changes
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'ONLINE_STATUS') {
    console.log('Network status changed:', event.data.online ? 'online' : 'offline');
  }
});