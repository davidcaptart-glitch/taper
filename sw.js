// Service worker de Táper: guarda la app para usarla sin conexión.
// Al cambiar cualquier archivo de la app, sube VERSION aquí y el ?v= de index.html para que los móviles descarguen la nueva.
const VERSION = "taper-v6";
const SHELL = [
  "./",
  "index.html",
  "css/app.css?v=6",
  "js/base.js?v=6",
  "js/datos.js?v=6",
  "js/gustos.js?v=6",
  "js/plan.js?v=6",
  "js/compra.js?v=6",
  "js/tickets.js?v=6",
  "js/bienvenida.js?v=6",
  "js/ui.js?v=6",
  "manifest.webmanifest",
  "data/festivos.json",
  "data/supermercados.json",
  "data/novedades.json",
  "data/config.json",
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

// Red primero (con copia en caché) para los datos y la página; caché primero para el resto.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== location.origin && !isFont) return;

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
