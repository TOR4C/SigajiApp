const CACHE = 'sigaji-v4';
const SHELL = ['./', './index.html', './manifest.json', './512.png', './js/app.js', './js/cloud.js', './css/theme.css'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x))))); self.clients.claim(); });
// Network-first: selalu ambil versi terbaru saat online, jatuh ke cache saat offline. /api tidak pernah di-cache.
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
});
