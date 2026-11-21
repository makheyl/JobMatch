// JobMatch service worker: caches the app shell so it opens offline, never caches API calls.
const CACHE = 'jobmatch-shell-v22';
const SHELL = ['./', 'index.html', 'config.js', 'css/app.css', 'css/jobi-animations.css', 'js/core.js', 'js/jobi-rewards.js', 'js/public.js', 'js/seeker.js', 'js/seeker2.js', 'js/employer.js', 'js/admin.js', 'js/app.js', 'assets/logo.png', 'assets/mascot/jobi-rig.svg', 'assets/icon-192.png', 'assets/sample-resume-template.svg', 'assets/fonts/InterVariable.woff2', 'manifest.json'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('index.html'))));
});
self.addEventListener('push', (e) => {
  let d = { title: 'JobMatch', body: '' }; try { d = e.data.json(); } catch (x) { }
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', (e) => { e.notification.close(); e.waitUntil(clients.openWindow(e.notification.data.url || './')); });
