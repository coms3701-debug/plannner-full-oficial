const CACHE_NAME = 'pf-offline-cache-v2';

// Instalação rápida e ativação imediata
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // ATENÇÃO: Ignora chamadas do Banco de Dados (Firebase) para não as travar
  if (event.request.url.indexOf('firestore') !== -1 || event.request.url.indexOf('googleapis') !== -1) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. Se já tem no cache (Modo Voo), devolve na hora!
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. Se não tem no cache (Com internet), vai buscar e guarda para o futuro
      return fetch(event.request).then((networkResponse) => {
        // Guarda dinamicamente as cores, telas e botões que o Vercel gerou
        if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // 3. Fallback de emergência
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});