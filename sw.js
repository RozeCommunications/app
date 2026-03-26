// ============================================
// ROZE ASSISTANT — Service Worker
// Permet le fonctionnement hors connexion
// Version 1.0
// ============================================

const CACHE_NOM     = 'roze-assistant-v1';
const FICHIERS_CACHE = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Installation : on met les fichiers en cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NOM).then(cache => {
      return cache.addAll(FICHIERS_CACHE);
    })
  );
  self.skipWaiting();
});

// Activation : on supprime les anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cles => {
      return Promise.all(
        cles
          .filter(cle => cle !== CACHE_NOM)
          .map(cle => caches.delete(cle))
      );
    })
  );
  self.clients.claim();
});

// Interception des requêtes
// Stratégie : réseau d'abord, cache en fallback
self.addEventListener('fetch', event => {

  // On ne met pas en cache les appels API externes
  // (Claude, Google Sheets) — ils nécessitent internet
  const url = event.request.url;
  if (
    url.includes('api.anthropic.com') ||
    url.includes('script.google.com') ||
    url.includes('drive.google.com') ||
    url.includes('fonts.googleapis.com')
  ) {
    return; // laisse passer sans mise en cache
  }

  event.respondWith(
    fetch(event.request)
      .then(reponse => {
        // On met à jour le cache avec la réponse fraîche
        const reponseCopie = reponse.clone();
        caches.open(CACHE_NOM).then(cache => {
          cache.put(event.request, reponseCopie);
        });
        return reponse;
      })
      .catch(() => {
        // Pas de réseau → on sert depuis le cache
        return caches.match(event.request);
      })
  );
});
