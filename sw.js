// Service worker de Táper: guarda la app para usarla sin conexión.
// Al cambiar cualquier archivo de la app, sube VERSION aquí y el ?v= de index.html para que los móviles descarguen la nueva.
const VERSION = "taper-v121";
const SHELL = [
  "./",
  "index.html",
  "css/app.css?v=121", "css/esteticas.css?v=121",
  "js/base.js?v=121",
  "js/iconos.js?v=121",
  "js/datos.js?v=121",
  "js/fotos.js?v=121",
  "js/gustos.js?v=121",
  "js/plan.js?v=121",
  "js/compra.js?v=121",
  "js/tickets.js?v=121",
  "js/congelador.js?v=121",
  "js/despensa.js?v=121",
  "js/preparacion.js?v=121",
  "js/historial.js?v=121",
  "js/avisos.js?v=121",
  "js/compartir.js?v=121",
  "js/casa.js?v=121",
  "js/bienvenida.js?v=121",
  "js/ui.js?v=121",
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
  "icons/icon-512.png",
  "icons/badge-96.png"
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

/* ---------- Avisos ----------
   El servidor manda el contenido cifrado dentro del push ({v:2, l:[avisos]}); si llega vacío (móviles o servidores
   antiguos), se piden a /pendientes con el token. Lo caducado (x) no se enseña: tras una noche sin red no llegan de
   golpe el «A comer» de ayer y compañía. Datos del móvil en la caché "taper-meta": /__avisos = {id, url, tok, vapid}. */
const META = "taper-meta";
async function leeMeta() { try { const r = await (await caches.open(META)).match("/__avisos"); return r ? await r.json() : null; } catch (err) { return null; } }
async function guardaMeta(m) { await (await caches.open(META)).put("/__avisos", new Response(JSON.stringify(m))); }
const conToken = m => (m && m.tok ? { "X-Taper-Token": m.tok } : {});
const baseUrl = m => String(m.url || "").replace(/\/$/, "");
// Botones de cada tipo de aviso (Android enseña 2 como mucho; en iPhone no hay botones: tocar abre su pantalla)
const ACCIONES = {
  shop: [{ action: "hecho", title: "✓ Hecho" }, { action: "manana", title: "⏰ Mañana" }],
  frz: [{ action: "hecho", title: "✓ Hecho" }, { action: "manana", title: "⏰ Mañana" }],
  tk: [{ action: "abrir", title: "📸 Subir" }, { action: "manana", title: "⏰ Mañana" }],
  plan: [{ action: "abrir", title: "Planificar" }, { action: "manana", title: "⏰ Mañana" }],
  mprep: [{ action: "abrir", title: "Prepararlo" }, { action: "manana", title: "⏰ Mañana" }],
  freezer: [{ action: "abrir", title: "Verlo" }, { action: "manana", title: "⏰ Mañana" }],
  sport: [{ action: "si", title: "✓ Sí" }, { action: "no", title: "✗ No" }],
  thaw: [{ action: "hecho", title: "✓ Hecho" }, { action: "abrir", title: "Ver" }],
  thawt: [{ action: "hecho", title: "✓ Hecho" }, { action: "abrir", title: "Ver" }],
  cook: [{ action: "abrir", title: "Ver receta" }],
  sess: [{ action: "abrir", title: "Abrir la sesión" }]
};
const REPITE = new Set(["shop", "tk", "frz", "plan", "mprep", "freezer"]);   // vuelven a sonar aunque sustituyan al anterior
const SILENCIO = new Set(["day", "rate"]);                                   // el resumen y las valoraciones, sin sonido
// Hora habitual de cada aviso para «Mañana» (si el aviso no trae la suya en h)
const HORA = { plan: "19:00", mprep: "19:00", frz: "20:00", tk: "10:00", freezer: "11:00", shop: "09:30" };
// Mañana a las hh:mm en la hora del móvil (con el cambio de hora incluido)
function manana(h, ahora = new Date()) { const [hh, mm] = String(h || "10:00").split(":").map(Number); return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, hh || 0, mm || 0, 0, 0).getTime(); }
// Nada entre las 22:00 y las 08:00: lo que caiga ahí pasa a las 08:00
function fueraDeSilencio(t) { const d = new Date(t), h = d.getHours(); if (h >= 22) { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); } else if (h < 8) d.setHours(8, 0, 0, 0); return d.getTime(); }
async function ponNumero() { try { const n = (await self.registration.getNotifications()).length; if (self.navigator.setAppBadge) n ? await self.navigator.setAppBadge(n) : await self.navigator.clearAppBadge(); } catch (err) {} }
async function avisaVentanas(msg) { for (const c of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) c.postMessage(msg); }

self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let list = null, falloRed = false;
    try { const d = e.data && e.data.json(); if (d && Array.isArray(d.l)) list = d.l; } catch (err) {}
    if (!list) {
      try {
        const m = await leeMeta(), id = m.id || m.uid;
        list = await (await fetch(baseUrl(m) + "/pendientes?id=" + encodeURIComponent(id) + "&uid=" + encodeURIComponent(id), { cache: "no-store", headers: conToken(m) })).json();
        if (!Array.isArray(list)) list = [];
      } catch (err) { list = []; falloRed = true; }
    }
    const ahora = Date.now();
    list = list.filter(a => a && typeof a.title === "string" && (a.x ? a.x > ahora : !(a.t && ahora - a.t > 6 * 3600000)));
    if (!list.length && falloRed) list = [{ title: "🔔 Táper", body: "Abre Táper para ver tus avisos", tag: "taper" }];
    for (const a of list) {
      const tag = String(a.tag || ""), kind = tag.split("|")[0];
      await self.registration.showNotification(a.title, { body: a.body || "", tag: tag || undefined, icon: "icons/icon-192.png", badge: "icons/badge-96.png",
        timestamp: Number(a.t) || ahora, renotify: !!tag && REPITE.has(kind), silent: SILENCIO.has(kind), requireInteraction: kind === "sport",
        data: { tag, title: a.title, body: a.body || "", h: a.h || null }, actions: ACCIONES[kind] || [] });
    }
    try { await (await caches.open(META)).put("/__ultimo", new Response(String(ahora))); } catch (err) {}
    // Número en el icono donde el sistema lo permite, y la campanita de la app abierta se pone al día
    await ponNumero();
    await avisaVentanas({ tipo: "push" });
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const d = e.notification.data || {}, tag = String(d.tag || ""), kind = tag.split("|")[0];
  // «⏰ Mañana» (a su hora de siempre) o «Más tarde» (3 horas, fuera de las horas de silencio): quita los demás avisos
  // con esa etiqueta, lo apunta para la app (que lo recoge al abrirse) y se lo dice al servidor
  if (e.action === "manana" || e.action === "luego") {
    e.waitUntil((async () => { try {
      const at = e.action === "manana" ? manana(d.h || HORA[kind]) : fueraDeSilencio(Date.now() + 3 * 3600000);
      const cache = await caches.open(META);
      if (tag) {
        for (const n of await self.registration.getNotifications({ tag })) n.close();
        const r = await cache.match("/__aplazados"), l = r ? await r.json() : {};
        l[tag] = { t: at, title: d.title, body: d.body };
        await cache.put("/__aplazados", new Response(JSON.stringify(l)));
        await avisaVentanas({ tipo: "aplazado" });
      }
      await ponNumero();
      const m = await leeMeta(), id = m.id || m.uid;
      await fetch(baseUrl(m) + "/posponer", { method: "POST", headers: { "Content-Type": "application/json", ...conToken(m) },
        body: JSON.stringify({ id, uid: id, at, aviso: { title: d.title, body: d.body, tag, h: d.h || HORA[kind] || null } }) });
    } catch (err) {} })());
    return;
  }
  const tipo = ["hecho", "si", "no"].includes(e.action) ? e.action : "abrir";
  // Cada aviso abre su pantalla (compra, ticket, planificar, receta, sesión de cocina…) y apunta la respuesta
  e.waitUntil((async () => {
    await ponNumero();
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (tag && tag !== "taper" && tag !== "test") {
      if (all.length) { all[0].postMessage({ tipo, tag }); if ("focus" in all[0]) return all[0].focus(); }
      return self.clients.openWindow("./?" + tipo + "=" + encodeURIComponent(tag));
    }
    for (const c of all) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  })());
});
// La suscripción push caducó o el navegador la cambió: se renueva sola y se avisa al servidor (con el token)
self.addEventListener("pushsubscriptionchange", e => {
  e.waitUntil((async () => {
    const m = await leeMeta(); if (!m || !m.url) return;
    let sub = e.newSubscription;
    if (!sub && m.vapid) {
      const s = String(m.vapid).replace(/-/g, "+").replace(/_/g, "/"), raw = atob(s + "=".repeat((4 - s.length % 4) % 4));
      sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) });
    }
    if (!sub) return;
    const id = m.id || m.uid;
    const r = await fetch(baseUrl(m) + "/suscribir", { method: "POST", headers: { "Content-Type": "application/json", ...conToken(m) }, body: JSON.stringify({ id, uid: id, sub: sub.toJSON() }) });
    const j = await r.json().catch(() => ({}));
    if (j && j.token) { m.tok = j.token; m.tokAt = Date.now(); await guardaMeta(m); }
  })().catch(() => {}));
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
