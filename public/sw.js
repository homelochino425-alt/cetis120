const CACHE = "marcador-v13";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "lib/mp4box.all.js", "lib/mp4-muxer.min.js", "lib/jszip.min.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
// Primero intenta internet (para recibir cambios del admin); si no hay señal, usa la copia guardada
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/") && !u.pathname.startsWith("/api/media/") && u.pathname !== "/api/config") return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok && !e.request.headers.get("range")) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{}); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
