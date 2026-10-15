// Permite instalar la página y el panel como aplicación.
// Siempre pide lo más nuevo a internet; lo guardado solo se usa si no hay conexión.
const CACHE = "queen-v1";
const BASICOS = ["/", "/estilo.css", "/tienda.html", "/admin/", "/iconos/icon-192.png", "/iconos/panel-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICOS)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return; // datos y pagos: siempre en vivo
  if (u.pathname.startsWith("/img/") || u.pathname.startsWith("/iconos/")) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone())); return res; })));
    return;
  }
  e.respondWith(fetch(e.request).then((res) => { if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); } return res; })
    .catch(() => caches.match(e.request).then((r) => r || (e.request.mode === "navigate" ? caches.match(u.pathname.startsWith("/admin") ? "/admin/" : "/") : Response.error()))));
});
