// Service worker de Táper: guarda la app para usarla sin conexión.
// Al cambiar cualquier archivo de la app, sube VERSION aquí y el ?v= de index.html para que los móviles descarguen la nueva.
const VERSION = "taper-v17";
const SHELL = [
  "./",
  "index.html",
  "css/app.css?v=17",
  "js/base.js?v=17",
  "js/datos.js?v=17",
  "js/fotos.js?v=17",
  "js/gustos.js?v=17",
  "js/plan.js?v=17",
  "js/compra.js?v=17",
  "js/tickets.js?v=17",
  "js/congelador.js?v=17",
  "js/avisos.js?v=17",
  "js/bienvenida.js?v=17",
  "js/ui.js?v=17",
  "manifest.webmanifest",
  "data/festivos.json",
  "data/supermercados.json",
  "data/novedades.json",
  "data/config.json",
  "data/zonas.json",
  "data/fotos_platos.json",
  "data/productos.json",
  "data/recetas.json",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", e => {
  // precios.json no va aquí: se guarda la primera vez que se descarga (y si faltara, no impediría instalar)
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ---------- Avisos ---------- */
// El servidor solo "despierta" al móvil; aquí se piden los avisos pendientes y se muestran
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let list = [];
    try {
      const meta = await (await caches.open("taper-meta")).match("/__avisos");
      const { uid, url } = await meta.json();
      list = await (await fetch(url.replace(/\/$/, "") + "/pendientes?uid=" + encodeURIComponent(uid), { cache: "no-store" })).json();
    } catch (err) { /* sin conexión: se muestra un aviso genérico */ }
    if (!list.length) list = [{ title: "Táper", body: "Tienes avisos pendientes en Táper.", tag: "taper" }];
    for (const a of list) {
      await self.registration.showNotification(a.title, { body: a.body, tag: a.tag || undefined, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { tag: a.tag } });
    }
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  })());
});

// Red primero (con copia en caché) para los datos y la página; caché primero para el resto.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  const isPhoto = url.hostname === "prod-mercadona.imgix.net";   // fotos de los productos: se guardan para verlas sin conexión
  if (url.origin !== location.origin && !isFont && !isPhoto) return;

  const networkFirst = url.origin === location.origin &&
    (req.mode === "navigate" || /\.(json|html|js|css)$/.test(url.pathname) || url.pathname.endsWith("/"));

  if (networkFirst) {
    // precios.json se pide con ?t=… para saltarse cachés: se guarda sin ese parámetro
    const key = url.pathname.endsWith("precios.json") ? new Request(url.origin + url.pathname) : req;
    // "no-cache": pregunta siempre al servidor si hay versión nueva (si no la hay, responde rápido)
    const fresh = req.mode === "navigate" ? req : new Request(req.url, { cache: "no-cache" });
    e.respondWith(
      fetch(fresh).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(key, copy)); }
        return res;
      }).catch(() => caches.match(key, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
