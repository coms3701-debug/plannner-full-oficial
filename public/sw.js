const CACHE_NAME = 'planner-full-cache-v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // IGNORAR FIREBASE E APIs PARA NÃO QUEBRAR O BANCO DE DADOS
  if (
    url.includes('firestore') || 
    url.includes('googleapis') || 
    url.includes('gstatic.com') || 
    url.includes('firebase') ||
    url.includes('identitytoolkit')
  ) {
    return; // Deixa o navegador ligar-se à nuvem normalmente sem interrupções
  }

  // ESTRATÉGIA SEGURA: Tenta a rede primeiro. Se falhar (sem internet), procura no cache.
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

