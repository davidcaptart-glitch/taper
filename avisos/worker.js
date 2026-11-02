/* Táper · servidor de avisos (Cloudflare Worker)
   - Cada móvil se apunta con su código de avisos (id), su suscripción push y la lista de sus próximos avisos.
   - Al apuntarse, el servidor le da un TOKEN secreto (32 bytes al azar). Solo se guarda su SHA-256; el móvil lo
     manda en la cabecera X-Taper-Token en todas las rutas de su usuario. Sin token no se puede leer, cambiar,
     probar ni dar de baja los avisos de nadie (antes bastaba el uid, que iba en el enlace de invitación).
   - Cada 10 minutos (tarea programada) se buscan los avisos que caen en esa ventana de 10 minutos y se mandan
     CIFRADOS dentro del push (aes128gcm, RFC 8291): el móvil no tiene que pedir nada al servidor.
   Datos guardados (KV):
     sub:<id>  = {sub, th (hash del token), at}              · metadatos {m:2} · caduca a los 60 días sin renovar
     plan:<id> = {plan:[{t,x,title,body,tag,h}], at}          · metadatos {ts: minutos con aviso} · caduca a los 30 días
                 (t = cuándo, x = hasta cuándo vale; pasado x ya no se enseña; h = hora habitual para «Mañana»)
     log:<id>  = último envío FALLIDO {at, status} (solo se escribe cuando falla)
     pend:<id> = avisos pendientes, solo para móviles antiguos que aún no tienen token (los pide /pendientes)
     inv:<código> = uid de quien invita (el enlace de invitación ya no lleva el uid)
   tr:<código> = copia de los datos de quien usa Táper en Safari, para pasarlos a la app instalada (iPhone
   guarda por separado los datos de Safari y los de la app); trm:<huella> = código del último móvil con esa
   conexión y modelo (2 horas), para proponerlo solo: hay que escribir el final del código para cargarlo.
   cm:<código> = menú compartido {clave (hash), nombre, at, datos, marcas:{clave de la lista: {on, at}}}: quien lo
   comparte lo actualiza con su clave; quien tiene el código solo puede verlo y tachar la lista.
   cs:<código> = casa compartida {ek (hash de la llave), rev, at, por, estado}: quien tiene la llave la lee y la cambia;
   al guardar se manda la versión de la que parte y, si otro móvil guardó antes, se le devuelve la última (409).
   tp:<mes>:<huella del ticket> = precios de un ticket {at, mes, cp, super, u (seudónimo), items}: sin uid, sin calle
   y sin fecha exacta; la huella evita contar dos veces el mismo ticket.
*/

const ORIGENES = ["https://davidcaptart-glitch.github.io", "http://localhost:8765"];
const MAX_AVISOS = 150;                     // por usuario (una semana de avisos sobra)
const DIA = 864e5;
const SUB_TTL = 60 * 60 * 24 * 60;          // una suscripción que no se renueva en 60 días se borra sola
const PLAN_TTL = 60 * 60 * 24 * 30;         // un plan que no se actualiza en 30 días se borra solo
const RENOVAR = 20 * DIA;                   // pasado esto, /estado pide al móvil que renueve su suscripción
const TANDA = 600000;                       // el cron va cada 10 minutos: cada tanda manda lo de sus 10 minutos
const MAX_ENVIOS_TANDA = 45;                // plan gratuito: 50 subpeticiones por ejecución

function cors(req) {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGENES.includes(o) ? o : ORIGENES[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Taper-Token, X-Taper-Clave",
    "Vary": "Origin",
  };
}
const json = (req, data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors(req) } });
const uidOk = (u) => typeof u === "string" && /^U-[A-Z0-9]{4,8}$/.test(u);
const invOk = (c) => typeof c === "string" && /^[a-z0-9]{8}$/.test(c);
const horaOk = (h) => typeof h === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(h);

/* ---------- Plan de avisos ---------- */
function limpiaPlan(plan, ahora = Date.now()) {
  return (Array.isArray(plan) ? plan : [])
    .filter((a) => a && Number(a.t) > ahora - TANDA && typeof a.title === "string")
    .map((a) => {
      const t = Number(a.t), x = Math.min(t + 2 * DIA, Math.max(t + 60000, Number(a.x) || t + 6 * 3600000));
      const o = { t, x, title: String(a.title).slice(0, 80), body: String(a.body || "").slice(0, 320), tag: String(a.tag || "").slice(0, 60) };
      if (horaOk(a.h)) o.h = a.h;
      return o;
    })
    .sort((a, b) => a.t - b.t)
    .slice(0, MAX_AVISOS);
}
// Minuto de cada aviso (en base 36) en los metadatos de plan:<id>: el cron sabe sin leer nada a quién le toca
const minuto = (t) => Math.floor(t / 60000);
function ranuras(plan) {
  let s = "";
  for (const m of [...new Set(plan.map((a) => minuto(a.t).toString(36)))]) { if (s.length + m.length + 1 > 1000) break; s += (s ? "," : "") + m; }
  return s;
}
// ¿Cae este aviso en la tanda (desde, hasta]? Las tandas no se pisan: cada aviso sale una sola vez sin apuntar nada
const enTanda = (t, desde, hasta) => { const m = minuto(t) * 60000; return m > desde && m <= hasta; };
const tocaEnTanda = (ts, desde, hasta) => String(ts || "").split(",").some((m) => m && enTanda(parseInt(m, 36) * 60000, desde, hasta));

// Guarda el plan solo si ha cambiado (cada escritura de KV cuenta: el plan gratuito da 1.000 al día)
async function guardaPlan(env, id, plan) {
  const limpio = limpiaPlan(plan);
  const prev = await env.TAPER.get("plan:" + id, "json");
  if (prev && JSON.stringify(prev.plan) === JSON.stringify(limpio)) return false;
  await env.TAPER.put("plan:" + id, JSON.stringify({ plan: limpio, at: Date.now() }), { expirationTtl: PLAN_TTL, metadata: { ts: ranuras(limpio) } });
  return true;
}

/* ---------- Token secreto de cada móvil ---------- */
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function hashToken(t) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("taper-token:" + t))); }
const nuevoToken = () => b64u(crypto.getRandomValues(new Uint8Array(32)));
// Comparación en tiempo constante (no se puede adivinar el hash letra a letra midiendo cuánto tarda)
function igual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
/* ¿Puede esta petición tocar los avisos de este móvil?
   "ok": trae el token bueno.
   "reclamar": no trae token bueno, pero demuestra que es el móvil de verdad porque manda el endpoint exacto de su
     suscripción push (una dirección larga y secreta que solo conocen el móvil, el servicio push y este servidor;
     /estado ya no la enseña). Así se migran las suscripciones de antes, que no tenían token: la primera llamada del
     móvil de verdad se queda con un token nuevo. Contrapartida: mientras un móvil antiguo no abra la versión nueva
     de la app, su suscripción sigue sin token y /pendientes y /estado responden como antes con solo el uid (el resto
     de rutas ya piden token). Y si alguien llegara a conocer el endpoint de otro, podría quedarse con sus avisos.
   "no": ni token ni endpoint. */
async function autoriza(d, req, endpoint) {
  if (!d) return "no";
  const t = req.headers.get("X-Taper-Token") || "";
  if (d.th && t && igual(await hashToken(t), d.th)) return "ok";
  if (typeof endpoint === "string" && d.sub && igual(endpoint, d.sub.endpoint)) return "reclamar";
  return "no";
}
const limpiaSub = (s) => ({ endpoint: String(s.endpoint), keys: s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string" ? { p256dh: s.keys.p256dh.slice(0, 200), auth: s.keys.auth.slice(0, 60) } : null });
const subOk = (s) => s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1200;
async function guardaSub(env, id, sub, th, at = Date.now()) {
  await env.TAPER.put("sub:" + id, JSON.stringify({ sub, th: th || null, at }), { expirationTtl: SUB_TTL, metadata: { m: 2 } });
}
const idDe = (b) => (b && (b.id || b.uid)) || "";

/* ---------- Límite de peticiones por IP ----------
   Con el enlace de límites de Workers (LIMITE y LIMITE_ALTAS en wrangler.toml; gratis y sin tocar KV).
   Si no estuviera configurado, un contador en memoria de cada instancia (aproximado, pero tampoco gasta KV). */
const ALTAS = new Set(["/suscribir", "/posponer", "/probar", "/zona", "/traspaso", "/traspaso/buscar", "/traspaso/cargar", "/compartir",
  "/casa/crear", "/evento", "/canjear", "/ticket-precios", "/invitacion"]);
const memLimite = new Map();
async function dentroDelLimite(env, req, ruta) {
  const altas = ALTAS.has(ruta), ip = req.headers.get("CF-Connecting-IP") || "?", key = (altas ? "a:" : "g:") + ip;
  const lim = altas ? env.LIMITE_ALTAS : env.LIMITE;
  if (lim && typeof lim.limit === "function") { try { return (await lim.limit({ key })).success; } catch (e) { return true; } }
  const max = altas ? 20 : 120, ahora = Date.now();
  let c = memLimite.get(key);
  if (!c || ahora - c.t0 > 60000) { c = { t0: ahora, n: 0 }; memLimite.set(key, c); }
  if (memLimite.size > 5000) for (const [k, v] of memLimite) if (ahora - v.t0 > 60000) memLimite.delete(k);
  return ++c.n <= max;
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
    const url = new URL(req.url);
    try {
      if (url.pathname !== "/" && !(await dentroDelLimite(env, req, url.pathname))) return json(req, { error: "demasiadas peticiones, espera un minuto" }, 429);
      // Apuntar este móvil (o renovar su suscripción). Devuelve un token nuevo cuando hace falta.
      if (req.method === "POST" && url.pathname === "/suscribir") {
        const b = await req.json(), id = idDe(b);
        if (!uidOk(id) || !subOk(b.sub)) return json(req, { error: "datos no válidos" }, 400);
        const d = await env.TAPER.get("sub:" + id, "json");
        let token = null, th = null;
        if (!d) { token = nuevoToken(); th = await hashToken(token); }
        else {
          const a = await autoriza(d, req, b.sub.endpoint);
          if (a === "ok") th = d.th;
          else if (a === "reclamar") { token = nuevoToken(); th = await hashToken(token); }
          // Ese código ya es de otro móvil: la app se busca otro código de avisos y vuelve a probar
          else return json(req, { error: "en uso" }, 403);
        }
        await guardaSub(env, id, limpiaSub(b.sub), th);
        if (Array.isArray(b.plan)) await guardaPlan(env, id, b.plan);
        else if (d && Array.isArray(d.plan)) await guardaPlan(env, id, d.plan);   // suscripción antigua: su plan pasa a plan:<id>
        return json(req, { ok: true, token });
      }
      if (req.method === "POST" && url.pathname === "/programar") {
        const b = await req.json(), id = idDe(b);
        if (!uidOk(id)) return json(req, { error: "usuario no válido" }, 400);
        const d = await env.TAPER.get("sub:" + id, "json");
        if (!d) return json(req, { error: "no suscrito" }, 404);
        const a = await autoriza(d, req, b.endpoint);
        if (a === "no") return json(req, { error: "token no válido" }, 401);
        let token = null;
        if (a === "reclamar") { token = nuevoToken(); await guardaSub(env, id, d.sub, await hashToken(token), d.at); }
        const cambiado = await guardaPlan(env, id, b.plan);
        return json(req, { ok: true, cambiado, token });
      }
      // Estado de la suscripción y, si falló, el último envío
      if (req.method === "GET" && url.pathname === "/estado") {
        const id = url.searchParams.get("id") || url.searchParams.get("uid");
        if (!uidOk(id)) return json(req, {}, 400);
        const d = await env.TAPER.get("sub:" + id, "json");
        if (!d) return json(req, { suscrito: false });
        const log = await env.TAPER.get("log:" + id, "json");
        // Suscripción antigua sin token: responde como antes para no romper las apps sin actualizar
        if (!d.th) return json(req, { suscrito: true, endpoint: d.sub.endpoint.slice(-24), ultimo: log, sinToken: true });
        if ((await autoriza(d, req, null)) !== "ok") return json(req, { error: "token no válido" }, 401);
        return json(req, { suscrito: true, endpoint: d.sub.endpoint.slice(-24), ultimo: log, renovar: Date.now() - (d.at || 0) > RENOVAR, cifrado: !!d.sub.keys });
      }
      // Prueba inmediata: manda un aviso ahora mismo
      if (req.method === "POST" && url.pathname === "/probar") {
        const b = await req.json(), id = idDe(b);
        if (!uidOk(id)) return json(req, { error: "usuario no válido" }, 400);
        const d = await env.TAPER.get("sub:" + id, "json");
        if (!d) return json(req, { error: "no suscrito" }, 404);
        if ((await autoriza(d, req, null)) !== "ok") return json(req, { error: "token no válido" }, 401);
        const ahora = Date.now();
        const status = await envia(env, id, d, [{ t: ahora, x: ahora + 3600000, title: "🔔 Aviso de prueba", body: "Si ves esto, los avisos funcionan.", tag: "test" }], true);
        return json(req, { status });
      }
      // «Mañana» o «Más tarde» desde la notificación: quita los avisos con esa misma etiqueta y lo pone a la hora pedida
      if (req.method === "POST" && url.pathname === "/posponer") {
        const b = await req.json(), id = idDe(b);
        if (!uidOk(id) || !b.aviso || typeof b.aviso.title !== "string") return json(req, { error: "datos no válidos" }, 400);
        const d = await env.TAPER.get("sub:" + id, "json");
        if (!d) return json(req, { error: "no suscrito" }, 404);
        if ((await autoriza(d, req, null)) !== "ok") return json(req, { error: "token no válido" }, 401);
        const ahora = Date.now();
        const t = Math.min(ahora + 2 * DIA, Math.max(ahora + TANDA, Number(b.at) || ahora + Math.min(24 * 60, Math.max(10, Number(b.mins) || 180)) * 60000));
        const tag = String(b.aviso.tag || "").slice(0, 60);
        const p = (await env.TAPER.get("plan:" + id, "json")) || { plan: [] };
        const resto = p.plan.filter((a) => !(tag && a.tag === tag && a.t < t + 3600000));
        const nuevo = { t, x: t + 12 * 3600000, title: b.aviso.title, body: String(b.aviso.body || ""), tag };
        if (horaOk(b.aviso.h)) nuevo.h = b.aviso.h;
        await guardaPlan(env, id, resto.concat([nuevo]));
        return json(req, { ok: true, t });
      }
      // Zonas sin precios: la app apunta el código postal y la actualización de precios lo recoge
      if (req.method === "POST" && url.pathname === "/zona") {
        const b = await req.json();
        const cp = String(b.cp || "");
        if (!/^\d{5}$/.test(cp)) return json(req, { error: "código postal no válido" }, 400);
        const prev = (await env.TAPER.get("zp:" + cp, "json")) || { primera: Date.now(), veces: 0 };
        await env.TAPER.put("zp:" + cp, JSON.stringify({ ...prev, ultima: Date.now(), veces: prev.veces + 1 }));
        return json(req, { ok: true });
      }
      if (req.method === "GET" && url.pathname === "/zonas") {
        const cps = []; let cursor;
        do { const l = await env.TAPER.list({ prefix: "zp:", cursor }); cursor = l.list_complete ? null : l.cursor; for (const k of l.keys) cps.push(k.name.slice(3)); } while (cursor);
        return json(req, { cps });
      }
      if (req.method === "POST" && url.pathname === "/baja") {
        const b = await req.json(), id = idDe(b);
        if (!uidOk(id)) return json(req, { error: "usuario no válido" }, 400);
        const d = await env.TAPER.get("sub:" + id, "json");
        if (!d) return json(req, { ok: true });
        if ((await autoriza(d, req, b.endpoint)) === "no") return json(req, { error: "token no válido" }, 401);
        for (const k of ["sub:", "plan:", "pend:", "log:"]) await env.TAPER.delete(k + id);
        return json(req, { ok: true });
      }
      // Compatibilidad: el móvil, al despertarse, pide sus avisos pendientes (y se borran).
      // Los móviles nuevos reciben el aviso cifrado dentro del push y solo usan esto si llega vacío.
      if (req.method === "GET" && url.pathname === "/pendientes") {
        const id = url.searchParams.get("id") || url.searchParams.get("uid");
        if (!uidOk(id)) return json(req, [], 400);
        const d = await env.TAPER.get("sub:" + id, "json");
        if (d && d.th && (await autoriza(d, req, null)) !== "ok") return json(req, [], 401);
        const p = (await env.TAPER.get("pend:" + id, "json")) || [];
        if (p.length) await env.TAPER.delete("pend:" + id);
        const ahora = Date.now();
        return json(req, p.filter((a) => !a.x || a.x > ahora));
      }
      // Código de invitación: el enlace lleva este código al azar en vez del uid
      if (req.method === "POST" && url.pathname === "/invitacion") {
        const b = await req.json();
        if (!uidOk(b.uid) || !invOk(b.inv)) return json(req, { error: "datos no válidos" }, 400);
        const prev = await env.TAPER.get("inv:" + b.inv);
        if (prev && prev !== b.uid) return json(req, { error: "código en uso" }, 409);
        if (!prev) await env.TAPER.put("inv:" + b.inv, b.uid);
        return json(req, { ok: true });
      }
      // Traspaso Safari -> app instalada
      if (req.method === "POST" && url.pathname === "/traspaso") {
        const txt = await req.text();
        if (txt.length > 3_000_000) return json(req, { error: "demasiado grande" }, 413);
        const b = JSON.parse(txt);
        if (!codigoOk(b.codigo) || !uidOk(b.uid) || !b.estado) return json(req, { error: "datos no válidos" }, 400);
        const prev = await env.TAPER.get("tr:" + b.codigo, "json");
        if (prev && prev.uid !== b.uid) return json(req, { error: "código en uso" }, 409);
        await env.TAPER.put("tr:" + b.codigo, JSON.stringify({ uid: b.uid, nombre: String(b.nombre || "").slice(0, 40), at: Date.now(), estado: b.estado }), { expirationTtl: TRASPASO_TTL });
        await env.TAPER.put("trm:" + (await huellaMovil(req)), b.codigo, { expirationTtl: TRASPASO_BUSCAR_TTL });
        return json(req, { ok: true });
      }
      // La app recién instalada pregunta si hay datos de este mismo móvil (misma conexión y modelo).
      // La conexión y el modelo los comparten muchos móviles (la red del operador, el mismo iPhone), así que solo
      // se dan el nombre y el principio del código: para cargar los datos hay que escribir el código entero.
      if (req.method === "GET" && url.pathname === "/traspaso/buscar") {
        const codigo = await env.TAPER.get("trm:" + (await huellaMovil(req)));
        const d = codigo ? await env.TAPER.get("tr:" + codigo, "json") : null;
        return json(req, d ? { pista: codigo.slice(0, 3), nombre: d.nombre, at: d.at } : {});
      }
      if (req.method === "GET" && url.pathname === "/traspaso/cargar") {
        const codigo = (url.searchParams.get("codigo") || "").toUpperCase();
        if (!codigoOk(codigo)) return json(req, { error: "código no válido" }, 400);
        const d = await env.TAPER.get("tr:" + codigo, "json");
        if (!d) return json(req, { error: "no encontrado" }, 404);
        return json(req, { nombre: d.nombre, at: d.at, estado: d.estado });
      }
      // Menú compartido con alguien de casa
      if (req.method === "POST" && url.pathname === "/compartir") {
        const txt = await req.text();
        if (txt.length > 400_000) return json(req, { error: "demasiado grande" }, 413);
        const b = JSON.parse(txt);
        if (!codigoOk(b.codigo) || typeof b.clave !== "string" || b.clave.length < 12 || !b.datos) return json(req, { error: "datos no válidos" }, 400);
        const prev = await env.TAPER.get("cm:" + b.codigo, "json"), h = await sha(b.clave);
        if (prev && prev.clave !== h) return json(req, { error: "código en uso" }, 409);
        await env.TAPER.put("cm:" + b.codigo, JSON.stringify({ clave: h, nombre: String(b.datos.nombre || "").slice(0, 40), at: Date.now(), datos: b.datos, marcas: (prev && prev.marcas) || {} }), { expirationTtl: COMPARTIR_TTL });
        return json(req, { ok: true });
      }
      if (req.method === "GET" && url.pathname === "/compartido") {
        const codigo = (url.searchParams.get("codigo") || "").toUpperCase();
        if (!codigoOk(codigo)) return json(req, { error: "código no válido" }, 400);
        const d = await env.TAPER.get("cm:" + codigo, "json");
        if (!d) return json(req, { error: "no encontrado" }, 404);
        return json(req, { nombre: d.nombre, at: d.at, datos: d.datos, marcas: d.marcas });
      }
      if (req.method === "POST" && url.pathname === "/compartido/marcar") {
        const b = await req.json();
        if (!codigoOk(b.codigo) || typeof b.key !== "string" || b.key.length > 90) return json(req, { error: "datos no válidos" }, 400);
        const d = await env.TAPER.get("cm:" + b.codigo, "json");
        if (!d) return json(req, { error: "no encontrado" }, 404);
        d.marcas = d.marcas || {};
        d.marcas[b.key] = { on: !!b.on, at: Date.now() };
        const ks = Object.keys(d.marcas);
        if (ks.length > 3000) for (const k of ks.sort((x, y) => d.marcas[x].at - d.marcas[y].at).slice(0, ks.length - 3000)) delete d.marcas[k];
        await env.TAPER.put("cm:" + b.codigo, JSON.stringify(d), { expirationTtl: COMPARTIR_TTL });
        return json(req, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/compartir/parar") {
        const b = await req.json();
        if (!codigoOk(b.codigo)) return json(req, { error: "datos no válidos" }, 400);
        const d = await env.TAPER.get("cm:" + b.codigo, "json");
        if (d && d.clave !== (await sha(String(b.clave || "")))) return json(req, { error: "clave incorrecta" }, 403);
        await env.TAPER.delete("cm:" + b.codigo);
        return json(req, { ok: true });
      }
      // Casa compartida: el mismo plan en varios móviles (cs:<código> = {ek (hash de la llave), rev, at, por, estado})
      if (req.method === "POST" && url.pathname === "/casa/crear") {
        const txt = await req.text();
        if (txt.length > 3_000_000) return json(req, { error: "demasiado grande" }, 413);
        const b = JSON.parse(txt);
        if (!codigoOk(b.id) || typeof b.k !== "string" || b.k.length < 20 || !b.estado) return json(req, { error: "datos no válidos" }, 400);
        if (await env.TAPER.get("cs:" + b.id)) return json(req, { error: "código en uso" }, 409);
        await env.TAPER.put("cs:" + b.id, JSON.stringify({ ek: await sha(b.k), rev: 1, at: Date.now(), por: String(b.uid || ""), estado: b.estado }), { expirationTtl: CASA_TTL });
        return json(req, { ok: true, rev: 1 });
      }
      if (req.method === "GET" && url.pathname === "/casa") {
        const id = (url.searchParams.get("id") || "").toUpperCase();
        if (!codigoOk(id)) return json(req, { error: "código no válido" }, 400);
        const d = await env.TAPER.get("cs:" + id, "json");
        if (!d) return json(req, { error: "no encontrada" }, 404);
        if (d.ek !== (await sha(url.searchParams.get("k") || ""))) return json(req, { error: "llave incorrecta" }, 403);
        return json(req, { rev: d.rev, at: d.at, por: d.por, estado: d.estado });
      }
      if (req.method === "POST" && url.pathname === "/casa/guardar") {
        const txt = await req.text();
        if (txt.length > 3_000_000) return json(req, { error: "demasiado grande" }, 413);
        const b = JSON.parse(txt);
        if (!codigoOk(b.id) || !b.estado) return json(req, { error: "datos no válidos" }, 400);
        const d = await env.TAPER.get("cs:" + b.id, "json");
        if (!d) return json(req, { error: "no encontrada" }, 404);
        if (d.ek !== (await sha(String(b.k || "")))) return json(req, { error: "llave incorrecta" }, 403);
        // Otro móvil guardó antes: se le devuelve lo último para que lo junte con lo suyo
        if (b.rev !== d.rev) return json(req, { rev: d.rev, estado: d.estado }, 409);
        const rev = d.rev + 1;
        await env.TAPER.put("cs:" + b.id, JSON.stringify({ ek: d.ek, rev, at: Date.now(), por: String(b.uid || ""), estado: b.estado }), { expirationTtl: CASA_TTL });
        return json(req, { ok: true, rev });
      }
      if (req.method === "POST" && url.pathname === "/evento") return json(req, await evento(env, await req.json(), req));
      // Canjear coins: hace falta la clave secreta del móvil (la primera vez queda registrada)
      if (req.method === "POST" && url.pathname === "/canjear") {
        const b = await req.json();
        if (!uidOk(b.uid) || typeof b.clave !== "string" || b.clave.length < 16) return json(req, { error: "datos no válidos" }, 400);
        const coste = TIENDA[b.item];
        if (!coste) return json(req, { error: "artículo desconocido" }, 400);
        const f = (await env.TAPER.get("st:" + b.uid, "json")) || nuevaFicha();
        const h = await sha(b.clave);
        if (f.clave && f.clave !== h) return json(req, { error: "Este móvil no puede gastar estas coins" }, 403);
        f.clave = h; f.compras = f.compras || [];
        if (f.compras.includes(b.item)) return json(req, { ok: true, coins: f.coins, compras: f.compras, yaLoTenias: true });
        if (f.coins < coste) return json(req, { error: "No tienes coins suficientes", coins: f.coins }, 402);
        f.coins -= coste; f.compras.push(b.item);
        f.historial = [{ fecha: hoy(), coins: -coste, motivo: "Canjeado en la tienda" }].concat(f.historial || []).slice(0, 30);
        await env.TAPER.put("st:" + b.uid, JSON.stringify(f));
        return json(req, { ok: true, coins: f.coins, compras: f.compras });
      }
      // Coins y contadores: si la ficha ya tiene clave, hace falta la misma clave (cabecera X-Taper-Clave)
      if (req.method === "GET" && url.pathname === "/stats") {
        const uid = url.searchParams.get("uid");
        if (!uidOk(uid)) return json(req, {}, 400);
        const f = (await env.TAPER.get("st:" + uid, "json")) || nuevaFicha();
        if (f.clave && f.clave !== (await sha(req.headers.get("X-Taper-Clave") || ""))) return json(req, { error: "clave no válida" }, 403);
        delete f.clave;
        return json(req, f);
      }
      // Precios de tickets que no cuadran con los de la app (se revisan a mano desde /admin).
      // Solo se guarda: supermercado, código postal (o municipio), mes y los productos. Ni uid, ni calle, ni fecha exacta.
      if (req.method === "POST" && url.pathname === "/ticket-precios") {
        const txt = await req.text();
        if (txt.length > 20000) return json(req, { error: "demasiado grande" }, 413);
        const b = JSON.parse(txt);
        if (!Array.isArray(b.items)) return json(req, { error: "datos no válidos" }, 400);
        const sup = String(b.super || "").slice(0, 20), fecha = String(b.fecha || ""), mes = /^\d{4}-\d{2}/.test(fecha) ? fecha.slice(0, 7) : hoy().slice(0, 7);
        const items = b.items.slice(0, 40).map((x) => ({ pid: String(x.pid).slice(0, 30), desc: String(x.desc || "").slice(0, 60), pagado: Number(x.pagado) || 0, app: Number(x.app) || 0, dif: Number(x.dif) || 0 }));
        // Huella del ticket (con la fecha y la tienda, que luego no se guardan): el mismo ticket subido dos veces cuenta una
        const huella = /^[a-f0-9]{16,64}$/.test(String(b.hash || "")) ? String(b.hash).slice(0, 32)
          : hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode([sup, fecha, String(b.tienda || ""), items.map((x) => x.pid + ":" + x.pagado).sort().join(",")].join("#")))).slice(0, 32);
        const clave = "tp:" + mes + ":" + huella;
        if (await env.TAPER.get(clave)) return json(req, { ok: true, repetido: true });
        const limpio = { at: Date.now(), mes, cp: /^\d{5}$/.test(String(b.cp || "")) ? String(b.cp) : "", muni: String(b.muni || "").slice(0, 40), super: sup,
          u: await seudonimo(env, uidOk(b.uid) ? b.uid : "ip:" + (req.headers.get("CF-Connecting-IP") || "")), items };
        await env.TAPER.put(clave, JSON.stringify(limpio), { expirationTtl: 60 * 60 * 24 * 120 });
        await recalcularAjustes(env, { clave, t: limpio });
        return json(req, { ok: true });
      }
      // Correcciones automáticas de precios que aplican todas las apps
      if (req.method === "GET" && url.pathname === "/ajustes") {
        return json(req, (await env.TAPER.get("ajustes", "json")) || { productos: {} });
      }
      if (req.method === "GET" && url.pathname === "/admin/precios") {
        if (!env.ADMIN_KEY || url.searchParams.get("clave") !== env.ADMIN_KEY) return json(req, { error: "clave no válida" }, 403);
        const out = []; let cursor;
        do { const l = await env.TAPER.list({ prefix: "tp:", cursor }); cursor = l.list_complete ? null : l.cursor;
          for (const k of l.keys) { const v = await env.TAPER.get(k.name, "json"); if (v) out.push(v); } } while (cursor && out.length < 500);
        // Por producto: cuántas veces, cuántas personas distintas y la diferencia media
        const por = {};
        for (const t of out) for (const x of t.items) { const p = (por[t.super + "|" + x.pid] = por[t.super + "|" + x.pid] || { super: t.super, pid: x.pid, veces: 0, personas: new Set(), difMedia: 0, ejemplos: [] });
          p.veces++; p.personas.add(t.u || "?"); p.difMedia += x.dif; if (p.ejemplos.length < 3) p.ejemplos.push({ mes: t.mes || String(t.fecha || "").slice(0, 7), cp: t.cp, desc: x.desc, pagado: x.pagado, app: x.app }); }
        const lista = Object.values(por).map((p) => ({ ...p, personas: p.personas.size, difMedia: Math.round(p.difMedia / p.veces) })).sort((a, b) => b.veces - a.veces);
        return json(req, { tickets: out.length, productos: lista });
      }
      if (req.method === "GET" && url.pathname === "/admin") {
        if (!env.ADMIN_KEY || url.searchParams.get("clave") !== env.ADMIN_KEY) return json(req, { error: "clave no válida" }, 403);
        return json(req, await resumenAdmin(env));
      }
      if (url.pathname === "/") return json(req, { ok: true, servicio: "avisos de Táper" });
      return json(req, { error: "no encontrado" }, 404);
    } catch (e) {
      return json(req, { error: String(e) }, 500);
    }
  },

  // Tarea programada: cada 10 minutos
  async scheduled(event, env, ctx) {
    ctx.waitUntil(enviarPendientes(env, event.scheduledTime || Date.now()));
    const d = new Date(event.scheduledTime || Date.now());
    if (d.getUTCHours() === 4 && d.getUTCMinutes() < 10) ctx.waitUntil(recalcularAjustes(env).catch((e) => console.log("ajustes", String(e))));
  },
};

/* ---------- Envío de los avisos (cron) ----------
   Cada tanda manda los avisos cuyo minuto cae en (T - 10 min, T], con T la hora en que tocaba la tanda.
   Las tandas no se pisan, así que no hace falta apuntar qué se ha mandado: el cron NO escribe nada cuando todo va bien
   (ni log, ni sub:, ni plan:), y nunca pisa un plan que acabe de llegar por /programar o /posponer.
   Los minutos de cada plan van en sus metadatos: la lista de claves basta para saber a quién le toca, sin leer.
   Un fallo con un usuario (o con KV) no corta la tanda para los demás. */
async function enviarPendientes(env, T) {
  const hasta = Math.floor(T / 60000) * 60000, desde = hasta - TANDA;
  try { await migrarAntiguas(env); } catch (e) { console.log("migración", String(e)); }
  let cursor, enviados = 0;
  do {
    let lista;
    try { lista = await env.TAPER.list({ prefix: "plan:", cursor }); } catch (e) { console.log("lista", String(e)); return; }
    cursor = lista.list_complete ? null : lista.cursor;
    for (const k of lista.keys) {
      try {
        if (k.metadata && typeof k.metadata.ts === "string" && !tocaEnTanda(k.metadata.ts, desde, hasta)) continue;
        if (enviados >= MAX_ENVIOS_TANDA) { console.log("tanda llena: se queda sin enviar", k.name); continue; }
        const id = k.name.slice(5);
        const p = await env.TAPER.get(k.name, "json");
        if (!p || !Array.isArray(p.plan)) continue;
        const tocan = p.plan.filter((a) => enTanda(a.t, desde, hasta) && (!a.x || a.x > T));
        if (!tocan.length) continue;
        const d = await env.TAPER.get("sub:" + id, "json");
        if (!d || !d.sub) continue;
        enviados++;
        await envia(env, id, d, tocan);
      } catch (e) { console.log("usuario", k.name, String(e)); }
    }
  } while (cursor);
}
// Suscripciones de antes ({sub, plan, at} en sub:<uid>): su plan pasa a plan:<uid>. Una vez, en tandas de 40.
async function migrarAntiguas(env) {
  if (await env.TAPER.get("mig:v2")) return;
  let cursor, quedan = 0, hechas = 0;
  do {
    const l = await env.TAPER.list({ prefix: "sub:", cursor }); cursor = l.list_complete ? null : l.cursor;
    for (const k of l.keys) {
      if (k.metadata && k.metadata.m === 2) continue;
      if (hechas >= 40) { quedan++; continue; }
      try {
        const id = k.name.slice(4), d = await env.TAPER.get(k.name, "json");
        if (!d || !d.sub) continue;
        if (Array.isArray(d.plan)) await guardaPlan(env, id, d.plan);
        await guardaSub(env, id, d.sub, d.th || null, d.at || Date.now());
        hechas++;
      } catch (e) { quedan++; }
    }
  } while (cursor);
  if (!quedan) await env.TAPER.put("mig:v2", "1");
}
// Manda los avisos al móvil, cifrados en el push. Solo apunta algo si falla.
// Si la suscripción ya no existe (404/410), se borra: la app lo detecta al abrirse y se vuelve a suscribir sola.
async function envia(env, id, d, lista, prueba) {
  let status = 0;
  try {
    const cifrable = !!(d.sub.keys && d.sub.keys.p256dh && d.sub.keys.auth);
    // Móviles antiguos (sin token) o sin claves de cifrado: los avisos se dejan en pend: para que los pidan
    if (!d.th || !cifrable) {
      const pend = ((await env.TAPER.get("pend:" + id, "json")) || []).concat(lista).slice(-20);
      await env.TAPER.put("pend:" + id, JSON.stringify(pend), { expirationTtl: 60 * 60 * 24 });
    }
    const ahora = Date.now(), ttl = Math.max(60, Math.min(21600, Math.round((Math.max(...lista.map((a) => a.x || ahora + 6 * 3600000)) - ahora) / 1000)));
    status = await empuja(env, d.sub, cifrable ? paquete(lista) : null, ttl);
  } catch (e) { status = -1; }
  if (status < 200 || status >= 300) {
    try { await env.TAPER.put("log:" + id, JSON.stringify({ at: Date.now(), status }), { expirationTtl: 60 * 60 * 24 * 30 }); } catch (e) {}
    if (status === 404 || status === 410) for (const k of ["sub:", "plan:", "pend:"]) { try { await env.TAPER.delete(k + id); } catch (e) {} }
  }
  return status;
}
// Lo que va dentro del push: {v:2, l:[avisos]}. Cabe en ~3 KB (el límite del push es 4 KB): si no, se quedan los últimos.
function paquete(lista) {
  let l = lista.map((a) => ({ t: a.t, x: a.x, title: a.title, body: String(a.body || "").slice(0, 200), tag: a.tag, ...(a.h ? { h: a.h } : {}) }));
  let s = JSON.stringify({ v: 2, l });
  while (new TextEncoder().encode(s).length > 3000 && l.length > 1) { l = l.slice(1); s = JSON.stringify({ v: 2, l }); }
  return s;
}

/* ---------- Invitaciones, contadores y coins ---------- */
// Coins solo por retorno real: alguien abre tu enlace +1 (una vez por persona y conexión) · empieza a usar
// Táper +10 · cada semana que la usa +2 · tu propio uso semanal +1 · bienvenida al invitado +5.
// Pulsar "compartir" se cuenta, pero no da coins.
const COINS = { visita: 1, instalacion: 10, activoInvitado: 2, activoPropio: 1, bienvenida: 5, ticket: 3 };
const MAX_TICKETS_SEMANA = 3;
// Tienda de coins: el precio lo pone el servidor (la app no puede cambiarlo)
const TIENDA = { tema_oliva: 20, tema_marino: 20, tema_mostaza: 20, tema_berenjena: 20,
  tema_naranja: 20, tema_turquesa: 20, tema_rosa: 20, tema_lavanda: 20, tema_grafito: 20,
  av_chef: 10, av_aguacate: 10, av_pizza: 10, av_zorro: 10, av_panda: 10, av_pulpo: 10, av_taco: 10, av_tomate: 10,
  skin_libreta: 50, skin_trattoria: 50, skin_mediterranea: 50, skin_otono: 40, skin_neon: 60, skin_pop: 40, skin_japon: 40, skin_navidad: 40,
  pack_navidad: 30, pack_oficina: 30, pack_deportistas: 30, pack_aprovechamiento: 30, imprimible: 40 };
async function sha(t) { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("taper-clave:" + t)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
// Seudónimo de quien sube un ticket: sirve para contar personas distintas, no se puede volver al uid sin la sal secreta
async function seudonimo(env, quien) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("taper-tp:" + (env.TP_SAL || "sin-sal") + ":" + quien))).slice(0, 16); }
const MAX_VISITAS_DIA = 10;
/* ---------- Corrección automática de precios con los tickets ----------
   Con los tickets de los últimos 60 días, por supermercado y producto, contando PERSONAS distintas (no tickets):
   - cada persona vota una vez (la mediana de sus tickets); el mismo ticket subido dos veces cuenta una;
   - los votos que se alejan más de un 50 % se apartan como raros;
   - si al menos 3 personas apartadas son mayoría, el producto estaba mal emparejado en ese súper -> se deja de usar;
   - si quedan al menos 3 personas y su mediana se aleja más de un 4 % -> se corrige con ese factor (como mucho ±50 %). */
const AJ_DIAS = 60, AJ_MIN = 3, AJ_UMBRAL = 0.04, AJ_RARO = 0.5;
const mediana = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
function calculaAjustes(tickets) {
  const grupos = {};
  for (const t of tickets) for (const x of t.items || []) if (x.app > 0 && x.pagado > 0) {
    const g = (grupos[t.super + "|" + x.pid] = grupos[t.super + "|" + x.pid] || {});
    (g[t.u || "?"] = g[t.u || "?"] || []).push(x.pagado / x.app);
  }
  const productos = {};
  for (const [k, por] of Object.entries(grupos)) {
    const votos = Object.values(por).map(mediana);
    if (votos.length < AJ_MIN) continue;
    const raros = votos.filter((r) => Math.abs(r - 1) > AJ_RARO), buenos = votos.filter((r) => Math.abs(r - 1) <= AJ_RARO);
    const [sup, pid] = k.split("|");
    if (raros.length >= AJ_MIN && raros.length > buenos.length) { (productos[sup] = productos[sup] || {})[pid] = { excluir: true, n: votos.length }; continue; }
    if (buenos.length < AJ_MIN) continue;
    const med = mediana(buenos);
    if (Math.abs(med - 1) > AJ_UMBRAL) (productos[sup] = productos[sup] || {})[pid] = { factor: Math.round(med * 1000) / 1000, n: buenos.length };
  }
  return productos;
}
// nuevo: el ticket recién guardado (la lista de KV tarda unos segundos en incluirlo)
async function recalcularAjustes(env, nuevo) {
  const desde = Date.now() - AJ_DIAS * DIA, tickets = [], vistos = new Set();
  if (nuevo) { tickets.push(nuevo.t); vistos.add(nuevo.clave); }
  let cursor, migrados = 0;
  do {
    const l = await env.TAPER.list({ prefix: "tp:", cursor }); cursor = l.list_complete ? null : l.cursor;
    for (const k of l.keys) {
      if (vistos.has(k.name)) continue;
      const t = await env.TAPER.get(k.name, "json"); if (!t || t.at < desde) continue;
      // Tickets de antes (tp:<fecha>:<uid>:<azar>, con calle y fecha): se pasan al formato sin datos personales
      const viejo = k.name.match(/^tp:(\d{4}-\d{2})-\d{2}:(U-[A-Z0-9]{4,8}):/);
      if (viejo) {
        t.u = await seudonimo(env, viejo[2]);
        if (migrados < 50) { try {
          const limpio = { at: t.at, mes: viejo[1], cp: /^\d{5}$/.test(String(t.cp || "")) ? t.cp : "", muni: "", super: t.super, u: t.u, items: t.items };
          await env.TAPER.put("tp:" + viejo[1] + ":" + k.name.split(":").slice(3).join("").slice(0, 32) + "v", JSON.stringify(limpio), { expirationTtl: Math.max(60, Math.round((t.at + 120 * DIA - Date.now()) / 1000)) });
          await env.TAPER.delete(k.name); migrados++;
        } catch (e) {} }
      }
      tickets.push(t);
    }
  } while (cursor);
  await env.TAPER.put("ajustes", JSON.stringify({ calculado: new Date().toISOString(), productos: calculaAjustes(tickets) }));
}
const TRASPASO_TTL = 60 * 60 * 24 * 30;
const TRASPASO_BUSCAR_TTL = 60 * 60 * 2;  // reconocer el móvil solo vale 2 horas desde el último uso en Safari
const COMPARTIR_TTL = 60 * 60 * 24 * 90;   // un menú compartido que nadie actualiza en 3 meses se borra
const CASA_TTL = 60 * 60 * 24 * 365;      // una casa que nadie usa en un año se borra
const codigoOk = (c) => typeof c === "string" && /^[A-Z2-9]{6}$/.test(c);
// Huella del móvil: conexión + modelo/sistema. Safari y la app instalada del mismo iPhone dan la misma.
async function huellaMovil(req) {
  const base = (req.headers.get("CF-Connecting-IP") || "") + "|" + (req.headers.get("User-Agent") || "").replace(/ Safari\/[\d.]+/, "").replace(/ Version\/[\d.]+/, "");
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("taper-movil:" + base));
  return [...new Uint8Array(h)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function huellaConexion(req) {
  const ip = req.headers.get("CF-Connecting-IP") || "";
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("taper:" + ip));
  return [...new Uint8Array(h)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const nuevaFicha = () => ({ compartido: 0, visitas: 0, instalados: 0, activos: 0, coins: 0, historial: [] });
const semana = (d = new Date()) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const n = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - n + 3); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return t.getUTCFullYear() + "-W" + String(1 + Math.round(((t - y) / 864e5 - 3 + ((y.getUTCDay() + 6) % 7)) / 7)).padStart(2, "0"); };
const hoy = () => new Date().toISOString().slice(0, 10);

// clave: hash de la clave del propio móvil; si la ficha aún no tiene, se queda con esta
async function sumar(env, uid, campo, coins, motivo, clave) {
  const f = (await env.TAPER.get("st:" + uid, "json")) || nuevaFicha();
  if (clave && !f.clave) f.clave = clave;
  if (campo) f[campo] = (f[campo] || 0) + 1;
  if (coins && motivo) { f.coins += coins; f.historial = [{ fecha: hoy(), coins, motivo }].concat(f.historial).slice(0, 30); }
  await env.TAPER.put("st:" + uid, JSON.stringify(f));
}
async function contarGlobal(env, campo) {
  const g = (await env.TAPER.get("global", "json")) || {};
  g[campo] = (g[campo] || 0) + 1; await env.TAPER.put("global", JSON.stringify(g));
}
// Quién invita: el código del enlace nuevo (?inv=) o, en enlaces viejos, el uid (?ref=). Solo da coins, nunca acceso.
async function quienInvita(env, ref, uid) {
  let r = null;
  if (uidOk(ref)) r = ref;
  else if (invOk(ref)) r = await env.TAPER.get("inv:" + ref);
  return r && r !== uid ? r : null;
}
async function evento(env, b, req) {
  if (!b || !uidOk(b.uid)) return { error: "usuario no válido" };
  const uid = b.uid, ref = b.tipo === "visita" || b.tipo === "instalar" ? await quienInvita(env, b.ref, uid) : null;
  // Lo que suma al propio usuario: si su ficha ya tiene clave, tiene que traer la misma
  const clave = typeof b.clave === "string" && b.clave.length >= 16 ? await sha(b.clave) : null;
  if (b.tipo === "activo" || b.tipo === "ticket" || b.tipo === "instalar" || b.tipo === "compartir") {
    const f = await env.TAPER.get("st:" + uid, "json");
    if (f && f.clave && f.clave !== clave) return { error: "clave no válida" };
  }
  if (b.tipo === "compartir") {
    await sumar(env, uid, "compartido", 0, null, clave);
    await contarGlobal(env, "compartidos");
    return { ok: true };
  }
  // Alguien ha abierto el enlace de otra persona: cuenta una vez por visitante y por conexión
  if (b.tipo === "visita") {
    if (!ref) return { ok: true };
    const hu = await huellaConexion(req);
    if (await env.TAPER.get("vv:" + ref + ":" + uid) || await env.TAPER.get("vi:" + ref + ":" + hu)) return { ok: true, repetido: true };
    const kd = "vd:" + ref + ":" + hoy(), n = Number((await env.TAPER.get(kd)) || 0);
    await env.TAPER.put("vv:" + ref + ":" + uid, "1", { expirationTtl: 60 * 60 * 24 * 365 });
    await env.TAPER.put("vi:" + ref + ":" + hu, "1", { expirationTtl: 60 * 60 * 24 * 30 });
    await env.TAPER.put(kd, String(n + 1), { expirationTtl: 60 * 60 * 48 });
    await sumar(env, ref, "visitas", n < MAX_VISITAS_DIA ? COINS.visita : 0, "Alguien ha abierto tu enlace");
    await contarGlobal(env, "visitas");
    return { ok: true };
  }
  if (b.tipo === "instalar") {
    if (await env.TAPER.get("in:" + uid)) return { ok: true, repetido: true };
    await env.TAPER.put("in:" + uid, ref || "-");
    await contarGlobal(env, "instalaciones");
    if (ref) {
      await sumar(env, ref, "instalados", COINS.instalacion, "Alguien ha empezado a usar Táper con tu invitación");
      await sumar(env, uid, null, COINS.bienvenida, "Bienvenida por llegar con una invitación", clave);
    }
    return { ok: true };
  }
  // Ticket de la compra subido: +3 coins, una vez por ticket (huella) y como mucho 3 por semana
  if (b.tipo === "ticket") {
    const h = String(b.hash || "");
    if (!/^[a-f0-9]{16,64}$/.test(h)) return { error: "ticket no válido" };
    const kh = "tkh:" + uid + ":" + h;
    if (await env.TAPER.get(kh)) return { ok: true, repetido: true };
    const kw = "tkw:" + uid + ":" + semana(), n = Number(await env.TAPER.get(kw)) || 0;
    await env.TAPER.put(kh, "1", { expirationTtl: 60 * 60 * 24 * 400 });
    if (n >= MAX_TICKETS_SEMANA) return { ok: true, limite: true };
    await env.TAPER.put(kw, String(n + 1), { expirationTtl: 60 * 60 * 24 * 14 });
    await sumar(env, uid, "tickets", COINS.ticket, "Ticket de la compra subido", clave);
    return { ok: true, coins: COINS.ticket };
  }
  if (b.tipo === "activo") {
    const w = semana(), k = "ac:" + uid + ":" + w;
    if (await env.TAPER.get(k)) return { ok: true, repetido: true };
    await env.TAPER.put(k, "1", { expirationTtl: 60 * 60 * 24 * 60 });
    await sumar(env, uid, null, COINS.activoPropio, "Has usado Táper esta semana", clave);
    const g = (await env.TAPER.get("global", "json")) || {};
    g["activos:" + w] = (g["activos:" + w] || 0) + 1; await env.TAPER.put("global", JSON.stringify(g));
    const r = await env.TAPER.get("in:" + uid);
    if (r && r !== "-") await sumar(env, r, "activos", COINS.activoInvitado, "Una persona que invitaste sigue usando Táper");
    return { ok: true };
  }
  return { error: "evento desconocido" };
}
async function resumenAdmin(env) {
  const g = (await env.TAPER.get("global", "json")) || {};
  const w = semana(), prev = semana(new Date(Date.now() - 7 * 864e5));
  let avisos = 0, cursor;
  do { const l = await env.TAPER.list({ prefix: "sub:", cursor }); avisos += l.keys.length; cursor = l.list_complete ? null : l.cursor; } while (cursor);
  return { instalaciones: g.instalaciones || 0, visitasConInvitacion: g.visitas || 0, compartidos: g.compartidos || 0, activosEstaSemana: g["activos:" + w] || 0, activosSemanaPasada: g["activos:" + prev] || 0, conAvisos: avisos };
}

/* ---------- Push firmado con VAPID (ES256) y contenido cifrado (aes128gcm, RFC 8291) ---------- */
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uStr = (s) => b64u(new TextEncoder().encode(s));
const b64uBytes = (s) => { const t = String(s).replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(t + "=".repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0)); };
const une = (...ps) => { const n = ps.reduce((s, p) => s + p.length, 0), o = new Uint8Array(n); let i = 0; for (const p of ps) { o.set(p, i); i += p.length; } return o; };
async function hmac(clave, datos) {
  const k = await crypto.subtle.importKey("raw", clave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, datos));
}
/* Cifra el texto para una suscripción (RFC 8291 + RFC 8188, un solo registro).
   prueba: {salt, par} solo para las pruebas (sal y par de claves fijos). */
async function cifra(sub, texto, prueba) {
  const te = new TextEncoder(), uaPub = b64uBytes(sub.keys.p256dh), auth = b64uBytes(sub.keys.auth);
  const par = (prueba && prueba.par) || (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]));
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secreto = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, par.privateKey, 256));
  const ikm = await hmac(await hmac(auth, secreto), une(te.encode("WebPush: info\0"), uaPub, asPub, new Uint8Array([1])));
  const salt = (prueba && prueba.salt) || crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, une(te.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, une(te.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const k = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, k, une(te.encode(texto), new Uint8Array([2]))));
  const cab = new Uint8Array(21); cab.set(salt, 0); new DataView(cab.buffer).setUint32(16, 4096); cab[20] = asPub.length;
  return une(cab, asPub, cifrado);
}
async function vapid(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const header = b64uStr(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64uStr(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT }));
  const key = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVATE_JWK), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(header + "." + claims));
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}
// texto null: push vacío (el móvil pide /pendientes)
async function empuja(env, sub, texto, ttl = 21600) {
  const headers = { TTL: String(ttl), Urgency: "high", Authorization: await vapid(sub.endpoint, env) };
  let body = null;
  if (texto != null && sub.keys) { body = await cifra(sub, texto); headers["Content-Encoding"] = "aes128gcm"; headers["Content-Type"] = "application/octet-stream"; }
  else headers["Content-Length"] = "0";
  const res = await fetch(sub.endpoint, { method: "POST", headers, body });
  return res.status;
}
