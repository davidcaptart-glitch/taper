/* Táper · pruebas del sistema: los scripts se cargan juntos sin chocar y los datos de data/ son coherentes */
"use strict";
const fs = require("fs"), path = require("path");
const { cargarApp, informe, scriptsDeIndex, leeJSON, ROOT } = require("./harness.js");
const T = informe("Sistema");

/* 1. Cada nombre se declara una sola vez en el ámbito global.
   En el navegador todos los scripts comparten ese ámbito: un const/let repetido rompe la carga del segundo script
   y una function repetida pisa la primera sin avisar (así se rompió el historial de tickets en la v121). */
const files = scriptsDeIndex();
const decl = new Map();
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8").split("\n");
  src.forEach((l, i) => {
    // Solo lo que está pegado al margen izquierdo (el nivel superior del archivo)
    let m = l.match(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/) || l.match(/^class\s+([A-Za-z_$][\w$]*)/);
    const names = m ? [m[1]] : [];
    const v = l.match(/^(?:const|let|var)\s+(.*)/);
    if (v) {
      // const a=1, b=2; let x, y=3;  (se cortan los valores para quedarse con los nombres del primer nivel)
      let s = v[1], depth = 0, cur = "", parts = [];
      for (const ch of s) { if ("([{".includes(ch)) depth++; if (")]}".includes(ch)) depth--; if (ch === "," && depth === 0) { parts.push(cur); cur = "" } else if (ch === ";" && depth === 0) break; else cur += ch }
      parts.push(cur);
      for (const p of parts) { const n = p.trim().match(/^([A-Za-z_$][\w$]*)/); if (n) names.push(n[1]) }
    }
    for (const n of names) { if (!decl.has(n)) decl.set(n, []); decl.get(n).push(`${f}:${i + 1}`) }
  });
}
const dup = [...decl.entries()].filter(([, w]) => w.length > 1);
T.mira("decl", "Cada nombre global se declara una sola vez entre todos los scripts");
for (const [n, w] of dup) T.falla("decl", "Cada nombre global se declara una sola vez entre todos los scripts", `«${n}» está declarado ${w.length} veces: ${w.join(", ")}`);

// 2. Todos los scripts de index.html se cargan en un mismo contexto sin errores (como en el navegador)
const app = cargarApp({ semilla: 1 });
T.ok("carga", "Los scripts de index.html se cargan juntos sin errores", !app.fallosCarga.length, () => app.fallosCarga.map(x => `${x.f}: ${x.msg}`).join(" · "));
T.ok("carga-err", "Al cargar no salta ningún error que la app se trague (console.error)", !app.errores.length, () => app.errores.map(e => e.msg + " " + e.stack).join(" · "));
T.ok("orden", "index.html carga ui.js el último (arranca la app)", files[files.length - 1] === "js/ui.js", files.join(", "));
T.ok("existen", "Todos los scripts de index.html existen", files.every(f => fs.existsSync(path.join(ROOT, f))), files.filter(f => !fs.existsSync(path.join(ROOT, f))).join(", "));

/* 3. Datos */
const prods = leeJSON("data/productos.json").productos, recs = leeJSON("data/recetas.json").recetas;
const pid = new Map(prods.map(p => [p.id, p]));
T.ok("prod-id", "Los productos no repiten id", pid.size === prods.length, `${prods.length - pid.size} ids repetidos`);
for (const p of prods) {
  T.ok("prod-campos", "Cada producto tiene envase > 0, unidad (g, ml, ud) y dónde se guarda", p.envase > 0 && ["g", "ml", "ud"].includes(p.unidad) && ["despensa", "congelar", "congelado", "fresco"].includes(p.conservacion),
    `${p.id}: envase ${p.envase}, unidad ${p.unidad}, conservación ${p.conservacion}`);
  T.ok("prod-precio", "Cada producto tiene un precio estimado", typeof p.precio_estimado === "number" && p.precio_estimado > 0, `${p.id}: precio_estimado ${p.precio_estimado}`);
}
const rid = new Set();
for (const r of recs) {
  T.ok("rec-id", "Las recetas no repiten id", !rid.has(r.id), r.id); rid.add(r.id);
  for (const i of r.ingredientes || [])
    T.ok("rec-ing", "Cada ingrediente de cada receta existe en productos.json", pid.has(i.producto), `${r.id} (${r.nombre}): «${i.producto}» no está en productos.json`);
  T.ok("rec-cant", "Cada ingrediente tiene una cantidad > 0", (r.ingredientes || []).every(i => Number(i.cantidad) > 0), `${r.id}: ${JSON.stringify((r.ingredientes || []).filter(i => !(Number(i.cantidad) > 0)))}`);
  T.ok("rec-nevera", "Cada receta dice cuántos días aguanta en la nevera (conserva.nevera_dias)", r.conserva && Number.isInteger(r.conserva.nevera_dias) && r.conserva.nevera_dias >= 0 && r.conserva.nevera_dias <= 7,
    `${r.id} (${r.nombre}): conserva ${JSON.stringify(r.conserva)}`);
  T.ok("rec-pasos", "Cada receta tiene al menos una forma de hacerla con pasos", (r.variantes ? r.variantes : [r]).some(v => (v.pasos || []).length), `${r.id} (${r.nombre})`);
  T.ok("rec-tipo", "Cada receta tiene grupo y dificultad conocidos", ["carne", "pescado", "legumbre", "huevo", "vegetal"].includes(r.grupo) && ["facil", "moderada", "dificil", undefined].includes(r.dificultad),
    `${r.id}: grupo ${r.grupo}, dificultad ${r.dificultad}`);
}
// Lo que hay en la app tras cargar (setRecipes quita en silencio los ingredientes que no existen: no debería quitar ninguno)
T.ok("rec-cargadas", "La app carga todas las recetas con todos sus ingredientes", app.ev("R.length") === recs.length && app.ev("R.reduce((t,r)=>t+r.ing.length,0)") === recs.reduce((t, r) => t + r.ingredientes.length, 0),
  `${app.ev("R.length")} de ${recs.length} recetas, ${app.ev("R.reduce((t,r)=>t+r.ing.length,0)")} ingredientes de ${recs.reduce((t, r) => t + r.ingredientes.length, 0)}`);
// Platos principales con táper: tienen que aguantar al menos una noche (si no, nunca salen de táper)
const mains = recs.filter(r => !r.pequena);
T.ok("rec-taper", "Hay platos principales que aguantan al menos una noche (para los tápers)", mains.filter(r => r.conserva.nevera_dias >= 1).length >= 20, `${mains.filter(r => r.conserva.nevera_dias >= 1).length} recetas`);
// Otros JSON de data/ que la app lee: se pueden leer
for (const f of ["festivos.json", "supermercados.json", "zonas.json", "precios.json", "precios_supers.json", "fotos_platos.json", "mercadona.json", "novedades.json", "config.json"]) {
  let ok = true, msg = ""; try { leeJSON("data/" + f) } catch (e) { ok = false; msg = e.message }
  T.ok("json", "Los JSON de data/ se pueden leer", ok, `data/${f}: ${msg}`);
}
const pr = leeJSON("data/precios.json").productos || {};
const sinPrecio = prods.filter(p => p.mercadona_id && !pr[p.id]).map(p => p.id);
T.ok("precios", "Los productos con id de Mercadona tienen precio en data/precios.json (como mucho un 10 % sin él)", sinPrecio.length <= prods.length * 0.1, `${sinPrecio.length} sin precio: ${sinPrecio.slice(0, 10).join(", ")}`);
// Versión: la de base.js, la de index.html y la de sw.js van a la par
{
  const v = app.ev("APP_VERSION"), html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const vs = [...html.matchAll(/\?v=(\d+)/g)].map(m => Number(m[1])), swv = (sw.match(/VERSION\s*=\s*["'`]?(\d+)/) || [])[1];
  T.ok("version", "La versión es la misma en base.js, index.html (?v=) y sw.js", vs.every(x => x === v) && (swv == null || Number(swv) === v), `APP_VERSION ${v}, index.html ${[...new Set(vs)].join("/")}, sw.js ${swv}`);
}
T.fin();
