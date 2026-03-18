const CACHE_NAME = 'planner-full-v3-cache';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 1. BLINDAGEM DO FIREBASE E LOGIN: 
  // O 'identitytoolkit' é a peça mágica que permite o Login funcionar!
  if (
    url.includes('firestore') || 
    url.includes('googleapis.com') || 
    url.includes('identitytoolkit') || 
    url.includes('firebase') ||
    url.includes('gstatic.com')
  ) {
    return; // Passa direto para a internet e permite o Login
  }

  // 2. MODO OFFLINE SEGURO: 
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
