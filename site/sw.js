// Permite instalar la página y el panel como aplicación.
// Siempre pide lo más nuevo a internet; lo guardado solo se usa si no hay conexión.
const CACHE = "queen-v22";
const BASICOS = ["/", "/estilo.css", "/mes.js", "/politicas.js", "/resenas.js", "/stats.js", "/comunidad.html", "/tienda.html", "/lecturas.html", "/admin/", "/iconos/icon-192.png", "/iconos/panel-192.png"];
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

// Notificaciones del panel (nuevas citas, cambios, cancelaciones, compras y solicitudes).
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { cuerpo: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "Queen Spiritual", {
    body: d.cuerpo || "", icon: "/iconos/panel-192.png", badge: "/iconos/panel-192.png", data: { url: d.url || "/admin/" }, tag: d.url || "aviso", renotify: true,
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/admin/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {
    const w = ws.find((c) => new URL(c.url).pathname.startsWith("/admin"));
    if (w) { w.navigate(url).catch(() => {}); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
