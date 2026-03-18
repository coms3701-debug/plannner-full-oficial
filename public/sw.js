const CACHE_NAME = 'planner-full-v3-cache';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 1. BLINDAGEM DO BANCO DE DADOS: Ignora Firebase e Autenticação
  if (
    url.includes('firestore') || 
    url.includes('googleapis.com') || 
    url.includes('identitytoolkit') || 
    url.includes('firebase') ||
    url.includes('gstatic.com')
  ) {
    return; // Passa direto para a internet
  }

  // 2. MODO OFFLINE SEGURO para o resto da App
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Se tem internet, guarda no cache para o futuro
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Se não tem internet, devolve o que tem no cache (Modo Voo)
        return caches.match(event.request);
      })
  );
});
