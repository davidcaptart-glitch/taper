/* Táper · banco de pruebas: carga la app de verdad (los mismos scripts que index.html, en el mismo orden)
   en un contexto vm de node, como en el navegador: scripts clásicos que comparten un solo ámbito global.
   - Reloj falso y ajustable: Date.now() y new Date() siguen a cargarApp().reloj (hora de Madrid: TZ=Europe/Madrid).
   - localStorage en memoria, DOM de mentira (todo existe y no hace nada), fetch que no responde nunca
     (los datos de data/ se cargan a mano como hace boot() en js/ui.js), sin service worker ni notificaciones.
   - Math.random con semilla (las pruebas salen siempre igual con la misma semilla; SEMILLA=n para probar otras).
   - render() y showDialog() no pintan nada (no hay pantalla): se cuentan las veces que se llaman.
   Uso: const app=cargarApp({semilla:1,hoy:"2026-11-01T10:00:00"}); app.ev("S.people.length"); app.reloj("2026-11-02T08:00") */
"use strict";
process.env.TZ = process.env.TZ || "Europe/Madrid";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");

function zonaOk() { return new Date(2026, 6, 1, 12).getTimezoneOffset() === -120 && new Date(2026, 0, 15, 12).getTimezoneOffset() === -60; }

// Scripts de index.html, en su orden
function scriptsDeIndex(root = ROOT) {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  return [...html.matchAll(/<script[^>]*\ssrc="([^"?]+\.js)(?:\?[^"]*)?"/g)].map(m => m[1]).filter(f => f.startsWith("js/"));
}
const leeJSON = (f, root = ROOT) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));

// Algo que existe para cualquier propiedad o llamada y no hace nada
const nada = new Proxy(function () {}, {
  get: (t, k) => k === Symbol.toPrimitive ? () => "" : (k === "then" || typeof k === "symbol") ? undefined : k === "length" ? 0 : nada,
  apply: () => nada, construct: () => nada, set: () => true, has: () => true
});
// Un elemento del DOM de mentira: guarda lo que se le pone (innerHTML, onclick…) y lo demás existe sin hacer nada
function elemento(id) {
  const base = {
    id: id || "", tagName: "DIV", innerHTML: "", textContent: "", value: "", hidden: false, disabled: false, checked: false, open: false, scrollTop: 0,
    className: "", content: "", files: [], options: [], children: [], childNodes: [],
    dataset: {}, style: { setProperty() {}, removeProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false, replace() {} },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true }, setAttribute() {}, getAttribute: () => null, removeAttribute() {}, hasAttribute: () => false,
    appendChild: x => x, prepend() {}, append() {}, insertAdjacentHTML() {}, remove() {}, replaceWith() {}, focus() {}, blur() {}, click() {}, select() {}, scrollIntoView() {}, scrollTo() {},
    querySelector: () => elemento(), querySelectorAll: () => [], getElementsByTagName: () => [], closest: () => elemento(), matches: () => false, contains: () => false,
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    showModal() { this.open = true }, show() { this.open = true }, close() { this.open = false }, getContext: () => nada, toBlob() {}, play: async () => {}, pause() {}
  };
  return new Proxy(base, {
    get: (t, k) => k in t ? t[k] : k === Symbol.toPrimitive ? () => "" : (k === "then" || typeof k === "symbol") ? undefined : nada,
    set: (t, k, v) => { t[k] = v; return true }
  });
}

/* opts: {semilla, hoy:"AAAA-MM-DDTHH:MM", root, consola:boolean} */
function cargarApp(opts = {}) {
  if (!zonaOk()) throw new Error("Hace falta la hora de Madrid: ejecuta con TZ=Europe/Madrid (node tests/run.js ya lo hace)");
  const root = opts.root || ROOT;
  const errores = [];          // console.error de la app (excepciones que la app se traga con try/catch)
  const reloj = { t: new Date(opts.hoy || "2026-11-01T10:00:00").getTime(), now() { return this.t++ } };   // +1 ms por consulta: los guardados seguidos no se pisan
  const store = {};
  const porId = {};
  const documento = elemento("document");
  Object.assign(documento, {
    getElementById: id => porId[id] = porId[id] || elemento(id),
    querySelector: () => elemento(), querySelectorAll: () => [], createElement: t => elemento(t), createTextNode: () => elemento(),
    documentElement: elemento("html"), body: elemento("body"), head: elemento("head"), visibilityState: "visible", hidden: false, title: "", cookie: "", fonts: { ready: Promise.resolve() }
  });
  const ctx = {
    console: { log: opts.consola ? console.log : () => {}, info() {}, warn() {}, debug() {},
      error: (...a) => { const e = a.find(x => x && x.stack) ; errores.push({ cuando: iso(reloj.t), msg: a.map(x => x && x.message ? x.message : String(x)).join(" "), stack: e ? String(e.stack).split("\n").slice(0, 4).join(" | ") : "" }) } },
    __reloj: reloj, __semilla: Number(opts.semilla) || 1,
    document: documento,
    localStorage: { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v) }, removeItem: k => { delete store[k] }, clear: () => { for (const k in store) delete store[k] }, key: i => Object.keys(store)[i] ?? null, get length() { return Object.keys(store).length } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { userAgent: "node (pruebas de Táper)", language: "es-ES", languages: ["es-ES"], onLine: true, standalone: false, clipboard: { writeText: async () => {} } },
    location: { search: "", pathname: "/", hash: "", href: "http://localhost/", origin: "http://localhost", protocol: "http:", host: "localhost", reload() {} },
    history: { replaceState() {}, pushState() {} },
    fetch: () => new Promise(() => {}),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, requestIdleCallback: () => 0,
    queueMicrotask, structuredClone, TextEncoder, TextDecoder, URL, URLSearchParams, Blob, AbortController, crypto: globalThis.crypto,
    caches: { open: async () => ({ match: async () => null, put: async () => {}, delete: async () => true }), keys: async () => [], delete: async () => true },
    performance: { now: () => reloj.t },
    addEventListener() {}, removeEventListener() {}, scrollTo() {}, scrollY: 0, innerWidth: 400, innerHeight: 800, devicePixelRatio: 1,
    alert() {}, confirm: () => true, prompt: () => null, open: () => null,
    Image: function () { return elemento("img") }, FileReader: function () { return elemento("filereader") }
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  // Reloj falso y Math.random con semilla, dentro del propio contexto (las fechas son del mismo «realm» que la app)
  vm.runInContext(`(function(){const RD=Date;
    class FDate extends RD{constructor(...a){if(a.length===0)super(__reloj.now());else super(...a)} static now(){return __reloj.now()}}
    globalThis.Date=FDate;
    let s=__semilla>>>0||1;Math.random=function(){s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296};
  })()`, ctx, { filename: "preludio.js" });

  const scripts = scriptsDeIndex(root);
  const fallosCarga = [];
  for (const f of scripts) {
    try { vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f }) }
    catch (e) { fallosCarga.push({ f, msg: e.message, stack: String(e.stack).split("\n").slice(0, 3).join(" | ") }) }
  }
  const ev = code => vm.runInContext(code, ctx);

  // Los datos, como boot() en js/ui.js: productos, recetas, festivos, supermercados, fotos, precios de la zona y de otros súper
  ctx.__datos = {
    prods: leeJSON("data/productos.json", root), recs: leeJSON("data/recetas.json", root), fest: leeJSON("data/festivos.json", root),
    supers: leeJSON("data/supermercados.json", root).supermercados, fotos: leeJSON("data/fotos_platos.json", root),
    zonas: leeJSON("data/zonas.json", root), ps: leeJSON("data/precios_supers.json", root)
  };
  if (!fallosCarga.length) {
    ev(`setProducts(__datos.prods.productos);setRecipes(__datos.recs.recetas);FEST=__datos.fest;SUPERS=__datos.supers;DISHPHOTOS=__datos.fotos;ZONES=__datos.zonas;PS=__datos.ps;AJ=null;CFG={};`);
  }
  // Precios de la zona del código postal (como boot): data/precios/<almacén>.json o data/precios.json si es la zona principal
  const ponPrecios = () => {
    const cp = ev("S.home.cp"), z = ctx.__datos.zonas, wh = cp && z.cp[cp];
    const f = wh && wh !== z.principal ? `data/precios/${wh}.json` : "data/precios.json";
    ctx.__pr = leeJSON(f, root); ev("PR=__pr;zoneMissing=false;");
    return f;
  };
  // Sin pantalla: render y los diálogos no pintan (se cuentan)
  ctx.__pintado = { render: 0, dialogos: 0 };
  if (!fallosCarga.length) ev(`render=function(){__pintado.render++};showDialog=function(){__pintado.dialogos++};`);

  // fetch de data/ desde el disco (para loadCatalog y parecidos); lo demás no responde nunca (nada sale a la red)
  const fetchLocal = () => {
    ctx.fetch = async (url) => {
      const u = String(url).replace(/^\.?\//, "").split("?")[0];
      if (!u.startsWith("data/") || !fs.existsSync(path.join(root, u))) return new Promise(() => {});
      const txt = fs.readFileSync(path.join(root, u), "utf8");
      return { ok: true, status: 200, json: async () => JSON.parse(txt), text: async () => txt };
    };
  };
  return {
    ctx, ev, errores, fallosCarga, scripts, store, root,
    reloj: s => { reloj.t = new Date(s).getTime() },
    ahora: () => iso(reloj.t),
    ponPrecios, fetchLocal,
    // Pone un estado entero (como si se hubiera hecho el alta) y lo guarda
    ponEstado: obj => { ctx.__nuevo = JSON.parse(JSON.stringify(obj)); ev("S=mergeState(__nuevo);save();"); },
    // Copia de algo de la app fuera del contexto (JSON: sin funciones)
    copia: code => JSON.parse(ev(`JSON.stringify(${code})`) ?? "null")
  };
}
function iso(t) { const d = new Date(t), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}` }

/* ---------- Resultados de una prueba ----------
   Cada comprobación cuenta las veces que se ha mirado y guarda sus fallos (con un ejemplo concreto).
   Al final se escribe una línea «@@RESULTADO {json}» que recoge tests/run.js */
function informe(titulo) {
  const C = new Map();
  const reg = (id, nombre) => { if (!C.has(id)) C.set(id, { id, nombre, veces: 0, fallos: [] }); return C.get(id) };
  return {
    def: reg,
    ok(id, nombre, cond, detalle) { const c = reg(id, nombre); c.veces++; if (!cond) c.fallos.push(typeof detalle === "function" ? detalle() : detalle); return !!cond },
    falla(id, nombre, detalle) { const c = reg(id, nombre); c.veces++; c.fallos.push(detalle) },
    mira(id, nombre) { reg(id, nombre).veces++ },
    fin(extra = {}) {
      // Un mismo fallo visto muchos días cuenta una vez (los mensajes no llevan el día en que se vio)
      const lista = [...C.values()].map(c => { const u = dedup(c.fallos); return { ...c, nFallos: u.length, fallos: u.slice(0, 10) } });
      for (const c of lista) console.log(`${c.nFallos ? "✗" : "✓"} ${c.nombre} (${c.veces} veces)${c.nFallos ? ` · ${c.nFallos} fallos` : ""}`);
      for (const c of lista.filter(c => c.nFallos)) { console.log(`\n✗ ${c.nombre}`); for (const f of c.fallos) console.log("   · " + f) }
      console.log("@@RESULTADO " + JSON.stringify({ titulo, comprobaciones: lista, ...extra }));
      return lista;
    }
  };
}
function dedup(a) { const s = new Set(), out = []; for (const x of a) { const k = String(x); if (!s.has(k)) { s.add(k); out.push(k) } } return out }

module.exports = { cargarApp, informe, scriptsDeIndex, leeJSON, ROOT, zonaOk };
