@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #0f172a;
  color: #ffffff;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  -webkit-font-smoothing: antialiased;
}


3. Ficheiro: public/sw.js

(O Service Worker que protege o Login do Google para não entrar em loop)

const CACHE_NAME = 'planner-full-v3-cache-final';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // BLINDAGEM TOTAL: Ignora Firebase e Google Auth para o Login funcionar perfeitamente
  if (
    url.includes('firestore') || 
    url.includes('googleapis.com') || 
    url.includes('identitytoolkit') || 
    url.includes('firebase') ||
    url.includes('gstatic.com') ||
    url.includes('accounts.google.com') ||
    url.includes('apis.google.com')
  ) {
    return; // Passa direto para a internet e não bloqueia o login
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

