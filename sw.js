const CACHE = 'project-journal-static-v5';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './src/styles.css', './src/main.js', './src/config.js', './src/auth.js',
  './src/cache.js', './src/github.js', './src/store.js', './src/export.js',
  './src/utils.js', './src/validation.js', './src/device-auth.js',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(req).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req.mode === 'navigate' ? './index.html' : req, copy));
    }
    return res;
  }).catch(() => caches.match(req.mode === 'navigate' ? './index.html' : req)));
});
