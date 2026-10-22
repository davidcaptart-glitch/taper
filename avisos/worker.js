/* Táper · servidor de avisos (Cloudflare Worker)
   - Cada móvil se apunta con su código de usuario, su suscripción push y la lista de sus próximos avisos.
   - Cada 10 minutos (tarea programada) se buscan los avisos que ya tocan, se guardan como pendientes
     y se "despierta" al móvil con un push sin contenido; el móvil pide entonces sus avisos pendientes.
   - Así no hace falta cifrar el contenido del push: solo se firma la petición (VAPID).
   Datos guardados (KV): sub:<uid> = {sub, plan:[{t,title,body,tag}], at}; pend:<uid> = [avisos];
   log:<uid> = último envío {at, status} (para saber si el móvil recibe los avisos).
   tr:<código> = copia de los datos de quien usa Táper en Safari, para pasarlos a la app instalada (iPhone
   guarda por separado los datos de Safari y los de la app); trm:<huella> = código del último móvil con esa
   conexión y modelo, para reconocerlo solo.
*/

const ORIGENES = ["https://davidcaptart-glitch.github.io", "http://localhost:8765"];
const MAX_AVISOS = 150;          // por usuario (una semana de avisos sobra)
const CADUCA = 1000 * 60 * 60 * 24 * 30;   // suscripciones sin actualizar en 30 días se borran

function cors(req) {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGENES.includes(o) ? o : ORIGENES[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}
const json = (req, data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors(req) } });
const uidOk = (u) => typeof u === "string" && /^U-[A-Z0-9]{4,8}$/.test(u);

function limpiaPlan(plan) {
  const ahora = Date.now();
  return (Array.isArray(plan) ? plan : [])
    .filter((a) => a && Number(a.t) > ahora - 600000 && typeof a.title === "string")
    .map((a) => ({ t: Number(a.t), title: String(a.title).slice(0, 80), body: String(a.body || "").slice(0, 320), tag: String(a.tag || "").slice(0, 60) }))
    .sort((a, b) => a.t - b.t)
    .slice(0, MAX_AVISOS);
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
    const url = new URL(req.url);
    try {
      if (req.method === "POST" && url.pathname === "/suscribir") {
        const b = await req.json();
        if (!uidOk(b.uid) || !b.sub || !b.sub.endpoint) return json(req, { error: "datos no válidos" }, 400);
        await env.TAPER.put("sub:" + b.uid, JSON.stringify({ sub: b.sub, plan: limpiaPlan(b.plan), at: Date.now() }));
        return json(req, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/programar") {
        const b = await req.json();
        if (!uidOk(b.uid)) return json(req, { error: "usuario no válido" }, 400);
        const prev = await env.TAPER.get("sub:" + b.uid, "json");
        if (!prev) return json(req, { error: "no suscrito" }, 404);
        await env.TAPER.put("sub:" + b.uid, JSON.stringify({ ...prev, plan: limpiaPlan(b.plan), at: Date.now() }));
        return json(req, { ok: true });
      }
      // Estado de la suscripción y resultado del último envío
      if (req.method === "GET" && url.pathname === "/estado") {
        const uid = url.searchParams.get("uid");
        if (!uidOk(uid)) return json(req, {}, 400);
        const d = await env.TAPER.get("sub:" + uid, "json");
        const log = await env.TAPER.get("log:" + uid, "json");
        return json(req, { suscrito: !!d, endpoint: d ? d.sub.endpoint.slice(-24) : null, ultimo: log });
      }
      // Prueba inmediata: deja un aviso pendiente y despierta al móvil ahora mismo
      if (req.method === "POST" && url.pathname === "/probar") {
        const b = await req.json();
        if (!uidOk(b.uid)) return json(req, { error: "usuario no válido" }, 400);
        const d = await env.TAPER.get("sub:" + b.uid, "json");
        if (!d) return json(req, { error: "no suscrito" }, 404);
        await env.TAPER.put("pend:" + b.uid, JSON.stringify([{ t: Date.now(), title: "🔔 Aviso de prueba de Táper", body: "Si ves esto, los avisos funcionan.", tag: "test" }]), { expirationTtl: 86400 });
        const status = await envia(env, b.uid, d);
        return json(req, { status });
      }
      // Posponer un aviso desde la notificación: vuelve a sonar dentro de un rato
      if (req.method === "POST" && url.pathname === "/posponer") {
        const b = await req.json();
        if (!uidOk(b.uid) || !b.aviso || typeof b.aviso.title !== "string") return json(req, { error: "datos no válidos" }, 400);
        const d = await env.TAPER.get("sub:" + b.uid, "json");
        if (!d) return json(req, { error: "no suscrito" }, 404);
        const mins = Math.min(24 * 60, Math.max(10, Number(b.mins) || 180));
        const plan = d.plan.concat([{ t: Date.now() + mins * 60000, title: b.aviso.title.slice(0, 80), body: String(b.aviso.body || "").slice(0, 320), tag: String(b.aviso.tag || "").slice(0, 60) }]);
        await env.TAPER.put("sub:" + b.uid, JSON.stringify({ ...d, plan: limpiaPlan(plan) }));
        return json(req, { ok: true });
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
        const b = await req.json();
        if (uidOk(b.uid)) { await env.TAPER.delete("sub:" + b.uid); await env.TAPER.delete("pend:" + b.uid); }
        return json(req, { ok: true });
      }
      // El móvil, al despertarse, pide sus avisos pendientes (y se borran)
      if (req.method === "GET" && url.pathname === "/pendientes") {
        const uid = url.searchParams.get("uid");
        if (!uidOk(uid)) return json(req, [], 400);
        const p = (await env.TAPER.get("pend:" + uid, "json")) || [];
        if (p.length) await env.TAPER.delete("pend:" + uid);
        return json(req, p);
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
        await env.TAPER.put("trm:" + (await huellaMovil(req)), b.codigo, { expirationTtl: 60 * 60 * 24 * 3 });
        return json(req, { ok: true });
      }
      // La app recién instalada pregunta si hay datos de este mismo móvil (misma conexión y modelo)
      if (req.method === "GET" && url.pathname === "/traspaso/buscar") {
        const codigo = await env.TAPER.get("trm:" + (await huellaMovil(req)));
        const d = codigo ? await env.TAPER.get("tr:" + codigo, "json") : null;
        return json(req, d ? { codigo, nombre: d.nombre, at: d.at } : {});
      }
      if (req.method === "GET" && url.pathname === "/traspaso/cargar") {
        const codigo = (url.searchParams.get("codigo") || "").toUpperCase();
        if (!codigoOk(codigo)) return json(req, { error: "código no válido" }, 400);
        const d = await env.TAPER.get("tr:" + codigo, "json");
        if (!d) return json(req, { error: "no encontrado" }, 404);
        return json(req, { nombre: d.nombre, at: d.at, estado: d.estado });
      }
      if (req.method === "POST" && url.pathname === "/evento") return json(req, await evento(env, await req.json(), req));
      if (req.method === "GET" && url.pathname === "/stats") {
        const uid = url.searchParams.get("uid");
        if (!uidOk(uid)) return json(req, {}, 400);
        return json(req, (await env.TAPER.get("st:" + uid, "json")) || nuevaFicha());
      }
      // Precios de tickets que no cuadran con los de la app (se revisan a mano desde /admin)
      if (req.method === "POST" && url.pathname === "/ticket-precios") {
        const txt = await req.text();
        if (txt.length > 20000) return json(req, { error: "demasiado grande" }, 413);
        const b = JSON.parse(txt);
        if (!uidOk(b.uid) || !Array.isArray(b.items)) return json(req, { error: "datos no válidos" }, 400);
        const clave = "tp:" + new Date().toISOString().slice(0, 10) + ":" + b.uid + ":" + Math.random().toString(36).slice(2, 7);
        const limpio = { at: Date.now(), cp: String(b.cp || "").slice(0, 5), super: String(b.super || "").slice(0, 20), tienda: String(b.tienda || "").slice(0, 60), fecha: String(b.fecha || "").slice(0, 10),
          items: b.items.slice(0, 40).map((x) => ({ pid: String(x.pid).slice(0, 30), desc: String(x.desc || "").slice(0, 60), pagado: Number(x.pagado) || 0, app: Number(x.app) || 0, dif: Number(x.dif) || 0 })) };
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
        // Por producto: cuántas veces y la diferencia media
        const por = {};
        for (const t of out) for (const x of t.items) { const p = (por[t.super + "|" + x.pid] = por[t.super + "|" + x.pid] || { super: t.super, pid: x.pid, veces: 0, difMedia: 0, ejemplos: [] });
          p.veces++; p.difMedia += x.dif; if (p.ejemplos.length < 3) p.ejemplos.push({ fecha: t.fecha, tienda: t.tienda, desc: x.desc, pagado: x.pagado, app: x.app }); }
        const lista = Object.values(por).map((p) => ({ ...p, difMedia: Math.round(p.difMedia / p.veces) })).sort((a, b) => b.veces - a.veces);
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
    ctx.waitUntil(enviarPendientes(env));
    const d = new Date(event.scheduledTime || Date.now());
    if (d.getUTCHours() === 4 && d.getUTCMinutes() < 10) ctx.waitUntil(recalcularAjustes(env));
  },
};

async function enviarPendientes(env) {
  const ahora = Date.now();
  let cursor;
  do {
    const lista = await env.TAPER.list({ prefix: "sub:", cursor });
    cursor = lista.list_complete ? null : lista.cursor;
    for (const k of lista.keys) {
      const uid = k.name.slice(4);
      const d = await env.TAPER.get(k.name, "json");
      if (!d) continue;
      if (ahora - (d.at || 0) > CADUCA) { await env.TAPER.delete(k.name); continue; }
      const tocan = d.plan.filter((a) => a.t <= ahora);
      if (!tocan.length) continue;
      const pend = ((await env.TAPER.get("pend:" + uid, "json")) || []).concat(tocan).slice(-20);
      await env.TAPER.put("pend:" + uid, JSON.stringify(pend), { expirationTtl: 60 * 60 * 24 * 3 });
      await env.TAPER.put(k.name, JSON.stringify({ ...d, plan: d.plan.filter((a) => a.t > ahora) }));
      await envia(env, uid, d);
    }
  } while (cursor);
}
// Despierta al móvil y apunta el resultado. Si la suscripción ya no existe (404/410), se borra:
// la app lo detecta al abrirse y se vuelve a suscribir sola.
async function envia(env, uid, d) {
  let status = 0;
  try { status = await despertar(d.sub.endpoint, env); } catch (e) { status = -1; }
  await env.TAPER.put("log:" + uid, JSON.stringify({ at: Date.now(), status }), { expirationTtl: 60 * 60 * 24 * 30 });
  if (status === 404 || status === 410) { await env.TAPER.delete("sub:" + uid); await env.TAPER.delete("pend:" + uid); }
  return status;
}

/* ---------- Invitaciones, contadores y coins ---------- */
// Coins solo por retorno real: alguien abre tu enlace +1 (una vez por persona y conexión) · empieza a usar
// Táper +10 · cada semana que la usa +2 · tu propio uso semanal +1 · bienvenida al invitado +5.
// Pulsar "compartir" se cuenta, pero no da coins.
const COINS = { visita: 1, instalacion: 10, activoInvitado: 2, activoPropio: 1, bienvenida: 5 };
const MAX_VISITAS_DIA = 10;
/* ---------- Corrección automática de precios con los tickets ----------
   Con los tickets de los últimos 60 días, por supermercado y producto:
   - al menos 2 tickets y la mediana de (pagado / precio de la app) se aleja más de un 4 % -> se corrige con ese factor;
   - si se aleja más de un 60 %, el producto estaba mal emparejado en ese súper -> se deja de usar ese súper para él. */
const AJ_DIAS = 60, AJ_MIN = 2, AJ_UMBRAL = 0.04, AJ_MAL = 0.6;
// nuevo: el ticket recién guardado (la lista de KV tarda unos segundos en incluirlo)
async function recalcularAjustes(env, nuevo) {
  const desde = Date.now() - AJ_DIAS * 864e5, grupos = {}, vistos = new Set();
  const suma = (t) => { for (const x of t.items) if (x.app > 0 && x.pagado > 0) (grupos[t.super + "|" + x.pid] = grupos[t.super + "|" + x.pid] || []).push(x.pagado / x.app); };
  if (nuevo) { suma(nuevo.t); vistos.add(nuevo.clave); }
  let cursor;
  do {
    const l = await env.TAPER.list({ prefix: "tp:", cursor }); cursor = l.list_complete ? null : l.cursor;
    for (const k of l.keys) {
      if (vistos.has(k.name)) continue;
      const t = await env.TAPER.get(k.name, "json"); if (!t || t.at < desde) continue;
      suma(t);
    }
  } while (cursor);
  const productos = {};
  for (const [k, rs] of Object.entries(grupos)) {
    if (rs.length < AJ_MIN) continue;
    rs.sort((a, b) => a - b); const med = rs[Math.floor(rs.length / 2)];
    const [sup, pid] = k.split("|");
    if (Math.abs(med - 1) > AJ_MAL) (productos[sup] = productos[sup] || {})[pid] = { excluir: true, n: rs.length };
    else if (Math.abs(med - 1) > AJ_UMBRAL) (productos[sup] = productos[sup] || {})[pid] = { factor: Math.round(med * 1000) / 1000, n: rs.length };
  }
  await env.TAPER.put("ajustes", JSON.stringify({ calculado: new Date().toISOString(), productos }));
}
const TRASPASO_TTL = 60 * 60 * 24 * 30;
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

async function sumar(env, uid, campo, coins, motivo) {
  const f = (await env.TAPER.get("st:" + uid, "json")) || nuevaFicha();
  if (campo) f[campo] = (f[campo] || 0) + 1;
  if (coins && motivo) { f.coins += coins; f.historial = [{ fecha: hoy(), coins, motivo }].concat(f.historial).slice(0, 30); }
  await env.TAPER.put("st:" + uid, JSON.stringify(f));
}
async function contarGlobal(env, campo) {
  const g = (await env.TAPER.get("global", "json")) || {};
  g[campo] = (g[campo] || 0) + 1; await env.TAPER.put("global", JSON.stringify(g));
}
async function evento(env, b, req) {
  if (!b || !uidOk(b.uid)) return { error: "usuario no válido" };
  const uid = b.uid, ref = uidOk(b.ref) && b.ref !== uid ? b.ref : null;
  if (b.tipo === "compartir") {
    await sumar(env, uid, "compartido", 0, null);
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
      await sumar(env, uid, null, COINS.bienvenida, "Bienvenida por llegar con una invitación");
    }
    return { ok: true };
  }
  if (b.tipo === "activo") {
    const w = semana(), k = "ac:" + uid + ":" + w;
    if (await env.TAPER.get(k)) return { ok: true, repetido: true };
    await env.TAPER.put(k, "1", { expirationTtl: 60 * 60 * 24 * 60 });
    await sumar(env, uid, null, COINS.activoPropio, "Has usado Táper esta semana");
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

/* ---------- Push sin contenido firmado con VAPID (ES256) ---------- */
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uStr = (s) => b64u(new TextEncoder().encode(s));

async function despertar(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const header = b64uStr(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64uStr(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT }));
  const key = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVATE_JWK), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(header + "." + claims));
  const jwt = header + "." + claims + "." + b64u(sig);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { TTL: "21600", Urgency: "high", Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`, "Content-Length": "0" },
  });
  return res.status;
}
