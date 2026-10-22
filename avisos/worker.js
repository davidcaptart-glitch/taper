/* Táper · servidor de avisos (Cloudflare Worker)
   - Cada móvil se apunta con su código de usuario, su suscripción push y la lista de sus próximos avisos.
   - Cada 10 minutos (tarea programada) se buscan los avisos que ya tocan, se guardan como pendientes
     y se "despierta" al móvil con un push sin contenido; el móvil pide entonces sus avisos pendientes.
   - Así no hace falta cifrar el contenido del push: solo se firma la petición (VAPID).
   Datos guardados (KV): sub:<uid> = {sub, plan:[{t,title,body,tag}], at}; pend:<uid> = [avisos].
*/

const ORIGENES = ["https://davidcaptart-glitch.github.io", "http://localhost:8765"];
const MAX_AVISOS = 80;           // por usuario (una semana de avisos sobra)
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
    .map((a) => ({ t: Number(a.t), title: String(a.title).slice(0, 80), body: String(a.body || "").slice(0, 200), tag: String(a.tag || "").slice(0, 60) }))
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
      if (url.pathname === "/") return json(req, { ok: true, servicio: "avisos de Táper" });
      return json(req, { error: "no encontrado" }, 404);
    } catch (e) {
      return json(req, { error: String(e) }, 500);
    }
  },

  // Tarea programada: cada 10 minutos
  async scheduled(event, env, ctx) {
    ctx.waitUntil(enviarPendientes(env));
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
      const r = await despertar(d.sub.endpoint, env);
      if (r === 404 || r === 410) { await env.TAPER.delete(k.name); await env.TAPER.delete("pend:" + uid); }
    }
  } while (cursor);
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
