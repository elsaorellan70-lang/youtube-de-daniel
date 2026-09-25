/* NeonTube SW v2 — cachea SOLO el shell same-origin.
   YouTube/Googleapis siempre por red: privacidad, cuotas y ToS limpios.
   Al tocar este archivo, sube el número de CACHE para forzar actualización. */
'use strict';
const CACHE = 'neontube-shell-v2';
const SHELL = Object.freeze([
  './', './index.html', './styles.css', './app.js',
  './manifest.webmanifest', './icon.svg'
]);

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* Same-origin (shell): cache-first + revalidación silenciosa + fallback offline */
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) {
          fetch(req).then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
          }).catch(() => {});
          return hit;
        }
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }
  /* Cross-origin (YouTube, Googleapis, avatares): red directa, sin cacheo */
});