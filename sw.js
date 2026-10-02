// NEO service worker: keeps the app shell and the CDN libraries so NEO starts offline.
// Model weights are NOT handled here: WebLLM / wllama store them on their own (CacheStorage / OPFS).
// Bump VERSION to drop the old cache on the next release.
const VERSION = 'neo-shell-v7';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'ops.js', 'format.js', 'skills.js', 'logo.svg', 'manifest.webmanifest'];
const LIB_HOSTS = ['esm.run', 'esm.sh', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('neo-shell-') && k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const c = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' && await c.match('index.html'));
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const c = await caches.open(VERSION);
  const hit = await c.match(req);
  const fresh = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; });
  if (hit) { fresh.catch(() => {}); return hit; }
  return fresh;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(networkFirst(req));
  else if (LIB_HOSTS.includes(url.hostname)) e.respondWith(staleWhileRevalidate(req));
  // everything else (Hugging Face, Serper, Wikipedia…) goes straight to the network
});
