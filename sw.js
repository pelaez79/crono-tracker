/* Crono — service worker
   Patrón de la casa (Luna):
   - El "shell" (HTML, CSS, JS, manifest, iconos) se cachea al instalar:
     la app abre instantánea y funciona sin conexión.
   - data/platos.json va por red primero (la base crece por web sin
     republicar); si la red falla, se usa la última copia cacheada.
   - Las navegaciones sin conexión caen al index cacheado (fallback
     offline: obligatorio para que no cuenten como crashes en TWA).
   Sube CACHE al cambiar el shell para forzar actualización. */
const CACHE = 'crono-shell-v1';
const SHELL = [
  './',
  'index.html',
  'privacidad.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/metodo.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // FormSubmit y externos: red directa

  if (url.pathname.endsWith('data/platos.json')) {
    // Red primero; refresca la copia. Si falla, última copia cacheada.
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  if (e.request.mode === 'navigate') {
    // Navegación: caché del shell primero (es una SPA); fallback offline = index.
    e.respondWith(
      caches.match(e.request)
        .then((hit) => hit || fetch(e.request))
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  // Todo lo demás: caché primero.
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
