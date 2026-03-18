const CACHE_NAME = 'planner-full-v3-cache-final';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // BLINDAGEM TOTAL: Ignora Firebase e Google Auth para o Login funcionar
  if (
    url.includes('firestore') || 
    url.includes('googleapis.com') || 
    url.includes('identitytoolkit') || 
    url.includes('firebase') ||
    url.includes('gstatic.com') ||
    url.includes('accounts.google.com') ||
    url.includes('apis.google.com')
  ) {
    return; 
  }

  // MODO OFFLINE SEGURO
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
