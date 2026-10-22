// Service worker de Táper: guarda la app para usarla sin conexión.
// Al cambiar cualquier archivo de la app, sube VERSION aquí y el ?v= de index.html para que los móviles descarguen la nueva.
const VERSION = "taper-v81";
const SHELL = [
  "./",
  "index.html",
  "css/app.css?v=81", "css/esteticas.css?v=81",
  "js/base.js?v=81",
  "js/iconos.js?v=81",
  "js/datos.js?v=81",
  "js/fotos.js?v=81",
  "js/gustos.js?v=81",
  "js/plan.js?v=81",
  "js/compra.js?v=81",
  "js/tickets.js?v=81",
  "js/congelador.js?v=81",
  "js/avisos.js?v=81",
  "js/compartir.js?v=81",
  "js/casa.js?v=81",
  "js/bienvenida.js?v=81",
  "js/ui.js?v=81",
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
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== "taper-meta").map(k => caches.delete(k))))
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
      const shop = String(a.tag || "").startsWith("shop|");
      await self.registration.showNotification(a.title, { body: a.body, tag: a.tag || undefined, icon: "icons/icon-192.png", badge: "icons/icon-192.png",
        data: { tag: a.tag, title: a.title, body: a.body }, requireInteraction: shop,
        actions: shop ? [{ action: "hecho", title: "✓ Ya está" }, { action: "luego", title: "⏰ En 3 horas" }] : [] });
    }
    // Número en el icono donde el sistema lo permite (en Android sale el puntito de la notificación)
    try { const n = (await self.registration.getNotifications()).length; if (self.navigator.setAppBadge) await self.navigator.setAppBadge(n); } catch (err) {}
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const d = e.notification.data || {};
  // Posponer: el servidor lo vuelve a mandar dentro de 3 horas
  if (e.action === "luego") {
    e.waitUntil((async () => { try {
      const { uid, url } = await (await (await caches.open("taper-meta")).match("/__avisos")).json();
      await fetch(url.replace(/\/$/, "") + "/posponer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid, mins: 180, aviso: { title: d.title, body: d.body, tag: d.tag } }) });
    } catch (err) {} })());
    return;
  }
  const tipo = e.action === "hecho" ? "hecho" : "abrir";
  // Compra y "¿Qué tal?": abre la app justo en esa pantalla
  if (d.tag && /^(shop|rate)\|/.test(String(d.tag))) {
    e.waitUntil((async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (all.length) { all[0].postMessage({ tipo, tag: d.tag }); if ("focus" in all[0]) return all[0].focus(); }
      return self.clients.openWindow("./?" + tipo + "=" + encodeURIComponent(d.tag));
    })());
    return;
  }
  e.waitUntil((async () => { try { const n = (await self.registration.getNotifications()).length; if (self.navigator.setAppBadge) n ? await self.navigator.setAppBadge(n) : await self.navigator.clearAppBadge(); } catch (err) {} })());
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  })());
});

// Red primero (con copia en caché) para los datos y la página; caché primero para el resto.
self.addEventListener("fetch", e => {
  const req = e.request;
  // Ticket compartido desde otra app (el correo, la app del súper…): se guarda y se abre Táper para leerlo
  if (req.method === "POST" && new URL(req.url).pathname.endsWith("/compartir-ticket")) {
    e.respondWith((async () => {
      try {
        const fd = await req.formData(), f = fd.get("ticket");
        if (f && f.size) {
          const c = await caches.open("taper-meta");
          await c.put("/__ticket-compartido", new Response(f, { headers: { "Content-Type": f.type || "application/octet-stream", "X-Nombre": encodeURIComponent(f.name || "ticket") } }));
        }
      } catch (err) {}
      return Response.redirect(new URL("./?ticket=compartido", self.registration.scope).href, 303);
    })());
    return;
  }
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
