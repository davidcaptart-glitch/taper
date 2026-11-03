/* Táper · escenario «David y Lukas»: un mes entero de uso real (noviembre de 2026), día a día,
   comprobando cada día que se cumplen las reglas de la app.

   La casa: David (31–50, sin alergias, entrena fuerza lunes y miércoles a las 19:00) y su hijo Lukas (6–9, come de todo).
   Lukas está los lunes y martes, los miércoles solo a cenar y fines de semana alternos (desde el viernes 6 de noviembre:
   llega a cenar el viernes y se va después de cenar el domingo). De lunes a viernes come en el cole.
   Comida: táper de lunes a viernes, se cocina sábado y domingo. Cena: se cocina cada día.
   Solo, la cena se repite dos noches. Compra: pedido grande del mes (Mercadona, CP 08784) + fresco cada semana. 300 €/mes.
   Hoy es el domingo 1 de noviembre de 2026 a las 10:00; el plan empieza el lunes 2.

   Durante el mes, como un usuario de verdad: el pedido llega el martes 3 y se guarda en bolsas, se marca el fresco
   de cada semana, se cocina cada plato, se sube un ticket, Lukas viene un jueves extra a cenar, una cena fuera,
   el presupuesto baja a 250 €, se cambia una cena a mano, una cena no se hace, y el 24 se prepara diciembre.
   Uso: node tests/escenario-david.js  (mejor con node tests/run.js, que pone la hora de Madrid). SEMILLA=n cambia el azar. */
"use strict";
const fs = require("fs"), path = require("path");
const { cargarApp, informe } = require("./harness.js");

const SEMILLA = Number(process.env.SEMILLA || 1);
const app = cargarApp({ semilla: SEMILLA, hoy: "2026-11-01T10:00:00" });
const { ev } = app;
const A = new Proxy({}, { get: (_, k) => ev(String(k)) });   // A.buildSlots(...), A.S, A.RX…: lo de la app, tal cual
const T = informe("Escenario David y Lukas · noviembre 2026" + (SEMILLA !== 1 ? ` (semilla ${SEMILLA})` : ""));
const M = "2026-11";

/* ---------- Nombres de las comprobaciones ---------- */
const INV = {
  pasado: "1. Lo pasado no cambia: lo de días anteriores y lo cocinado sigue igual tras recalcular",
  presencia: "2. Quién come: Lukas está en cada comida según la custodia, el cole y los cambios de cada día",
  ninos: "3. Cenas con Lukas: ningún plato se repite en la semana",
  repetir: "4. Cenas repetidas solo: sin Lukas, no el día de su táper, como mucho 3 raciones y dentro de sus días de nevera",
  nevera: "5. Seguridad alimentaria: táper, repetidas y sobras se comen dentro de los días de nevera de la receta",
  alergias: "6. Nadie come un plato que no puede comer (alergias, dieta)",
  variedad: "7. Variedad: como mucho 3 platos de pasta y 3 de arroz por semana (o la app lo avisa)",
  despensa: "8. Despensa: nada en negativo, cocinar descuenta lo justo y el pedido en bolsas no cuenta doble",
  sobras: "9. Sobras: caducan el día de cocinado + días de nevera y nunca se ofrecen pasadas",
  dinero: "10. Presupuesto y gasto: la cifra del mes, lo pagado y el presupuesto cuadran",
  avisos: "11. Avisos: como mucho 5 al día, nada entre las 22:00 y las 08:00, nada de lo ya hecho",
  errores: "12. Ninguna función de la app lanza un error durante el mes",
  mano: "Extra: el plato elegido a mano se respeta",
  rehacer: "Extra: rehacer el menú (al cambiar el presupuesto) no cambia los platos ya comprados de los próximos días",
  noCocinado: "Extra: si una cena no se cocinó, al día siguiente no se ofrece su táper",
  comprado: "Extra: lo que pide cada plato está en casa al cocinarlo (comprado con la app a tiempo; se perdona menos del 10 % de un envase, por el redondeo a envases)",
  hueco: "Extra: cada comida que se cocina tiene plato",
  comedor: "13. Comedor: la cena con Lukas un día de cole no repite el tipo de comida del menú del cole (el menú real «Basal» de noviembre)",
  postreCole: "14. Postre: el de la cena (alterna fruta y yogur) no repite el tipo de postre que Lukas tomó en el cole",
  postre: "15. Postre: la fruta y los yogures están en la compra de su semana y se descuentan de casa al comerlos",
  caduca: "16. Lo fresco que caduca: no se avisa de lo que un plato gasta a tiempo, nada se pasa sin avisar y «Ponerlo en el menú» lo pone antes de que caduque"
};
for (const [k, v] of Object.entries(INV)) T.def(k, v);

/* ---------- Llamar a la app sin que un error pare el mes ---------- */
let nErr = 0;
function seguro(que, f) {
  try { return f() }
  catch (e) { T.falla("errores", INV.errores, `${app.ahora()} · ${que}: ${e.message} | ${String(e.stack).split("\n").slice(1, 4).map(s => s.trim()).join(" | ")}`); return undefined }
  finally {
    // Lo que la app se traga con try/catch y console.error también es un error
    while (nErr < app.errores.length) { const e = app.errores[nErr++]; T.falla("errores", INV.errores, `${e.cuando} · ${que} (console.error): ${e.msg} ${e.stack}`) }
  }
}

const { P2, sumaDias, entre, dds, lunes, fecha, hueco, crearCasa, lukasEsperado: lukasEsp } = require("./casa-david.js");
const nombre = rid => { const r = A.RX[rid]; return r ? `«${r.name}» (${r.fridge} d nevera)` : `«${rid}»` };
const lukasEsperado = (d, meal) => lukasEsp(app, d, meal);

/* ---------- 6. Lo que una persona no puede comer, mirado en los datos de data/ (no con canEat) ---------- */
const PRODS = Object.fromEntries(app.ctx.__datos.prods.productos.map(p => [p.id, p])), RECS = Object.fromEntries(app.ctx.__datos.recs.recetas.map(r => [r.id, r]));
function noPuede(p, rid) {
  const al = p.allergies || [], dieta = (A.DIETS[p.diet] || A.DIETS.omni)[2], no = Object.entries((p.tastes || {}).ing || {}).filter(([, v]) => v === -9).map(([k]) => k);
  for (const i of (RECS[rid] || {}).ingredientes || []) { const x = PRODS[i.producto] || {};
    const a = (x.alergenos || []).filter(y => al.includes(y)); if (a.length) return `${x.nombre} (${a.join(", ")})`;
    const o = (x.origen || []).filter(y => dieta.includes(y)); if (o.length) return `${x.nombre} (${o.join(", ")}, no va con su dieta)`;
    if (no.includes(i.producto)) return `${x.nombre} (marcado como «no puede»)` }
  return null;
}

/* ---------- Lo que cuenta como «el plan» de una semana ---------- */
const semanas = () => Object.keys(A.S.plans).sort();
function huecos(s) { return seguro("buildSlots " + s, () => A.buildSlots(s)) || [] }

/* ---------- 1. Lo pasado no cambia ---------- */
const fijado = new Map();   // id -> receta que tenía cuando ya era pasado (o se cocinó)
const cocinado = new Map(); // id -> JSON de S.cooked[id]
function fijaPasado(hasta) {
  for (const s of semanas()) { const wk = A.S.plans[s]; for (const [id, v] of Object.entries(wk.slots || {})) if (id.slice(0, 10) <= hasta && v && v.recipe && !fijado.has(id)) fijado.set(id, v.recipe) }
  for (const [id, c] of Object.entries(A.S.cooked || {})) if (!cocinado.has(id)) cocinado.set(id, JSON.stringify(c));
}
function compruebaPasado(tras) {
  for (const [id, rid] of fijado) {
    const wk = A.S.plans[lunes(id.slice(0, 10))], v = wk && wk.slots[id];
    T.ok("pasado", INV.pasado, v && v.recipe === rid, () => `${hueco(id)}: era ${nombre(rid)} y tras «${tras}» ${v ? "es " + nombre(v.recipe) : "ha desaparecido del menú"}`);
  }
  for (const [id, c] of cocinado) T.ok("pasado", INV.pasado, JSON.stringify((A.S.cooked || {})[id]) === c, () => `${hueco(id)}: lo cocinado (${c}) ha cambiado tras «${tras}» a ${JSON.stringify((A.S.cooked || {})[id])}`);
}

/* ---------- Comprobaciones del plan (2 a 7) ---------- */
function compruebaPlan(hoy, desde) {
  for (const s of semanas()) {
    if (sumaDias(s, 6) < desde) continue;
    const wk = A.S.plans[s], sl = huecos(s), by = Object.fromEntries(sl.map(x => [x.id, x]));
    const rec = x => { const v = wk.slots[x.id]; return v && A.RX[v.recipe] ? v.recipe : null };
    // 2. Presencia: comidas y cenas de cada día del plan
    for (let i = 0; i < 7; i++) {
      const d = sumaDias(s, i); if (d < "2026-11-02") continue;
      for (const meal of ["comida", "cena"]) {
        const esp = lukasEsperado(d, meal), real = seguro("peopleAt", () => A.peopleAt(d, meal).some(p => p.id === "k1"));
        T.ok("presencia", INV.presencia, real === esp, () => `${fecha(d)} ${meal}: la app dice que Lukas ${real ? "está" : "no está"} y debería ${esp ? "estar" : "no estar"}`);
        const x = by[d + "|" + meal];
        if (x && !x.past) T.ok("presencia", INV.presencia, x.kids.some(k => k.id === "k1") === esp, () => `${fecha(d)} ${meal}: el hueco del menú ${esp ? "no cuenta" : "cuenta"} a Lukas`);
        // Cada comida que se cocina (desde hoy) tiene plato
        if (x && d >= hoy && !x.past && seguro("mealState", () => A.mealState(d, meal)) === "cocinar")
          T.ok("hueco", INV.hueco, !!rec(x) || !!(wk.slots[x.id] || {}).despensa, () => `${fecha(d)} ${meal}: se cocina y no tiene plato`);
      }
    }
    for (const x of sl) {
      const rid = rec(x); if (!rid) continue; const r = A.RX[rid], v = wk.slots[x.id];
      // 3. Cenas con Lukas: el plato no sale en ninguna otra cena de la semana (ni en otra comida con él)
      if (x.meal === "cena" && x.kids.length)
        for (const o of sl) if (o.id !== x.id && rec(o) === rid && (o.meal === "cena" || o.kids.length))
          T.falla("ninos", INV.ninos, `semana del ${fecha(s)}: ${nombre(rid)} en la cena con Lukas del ${fecha(x.date)} y otra vez en ${hueco(o.id)}${(wk.slots[o.id] || {}).rep ? " (repetida)" : ""}`);
      if (x.meal === "cena" && x.kids.length) T.mira("ninos", INV.ninos);
      // 4. Cenas que repiten el plato de otro día
      if (v.rep) {
        const h = by[v.rep], hv = wk.slots[v.rep], hijos = sl.filter(o => (wk.slots[o.id] || {}).rep === v.rep), usos = h ? [h, ...hijos] : hijos;
        const rac = usos.reduce((t, u) => t + 1 + (u.tupper.length ? 1 : 0), 0), coc = ((A.S.cooked || {})[v.rep] || {}).d || (h && h.date);
        const ultimo = usos.map(u => u.tupper.length ? sumaDias(u.date, 1) : u.date).sort().pop();
        const fallos = [];
        if (!h || !hv) fallos.push("repite un día que no existe (" + v.rep + ")");
        else {
          if (hv.recipe !== rid) fallos.push(`el día original tiene otro plato (${nombre(hv.recipe)})`);
          if (x.meal !== "cena" || x.kids.length || h.kids.length) fallos.push("con Lukas en la mesa (solo se repite estando solo)");
          if (h.tupper.length && sumaDias(h.date, 1) === x.date) fallos.push(`cae el mismo día que su táper (${fecha(x.date)})`);
          if (rac > 3) fallos.push(`${rac} raciones del mismo plato (máximo 3)`);
          if (coc && entre(coc, ultimo) > r.fridge) fallos.push(`se come ${entre(coc, ultimo)} días después de cocinarlo y aguanta ${r.fridge}`);
        }
        T.ok("repetir", INV.repetir, !fallos.length, () => `${hueco(x.id)} repite ${nombre(rid)} del ${hueco(v.rep)}: ${fallos.join("; ")}`);
      }
      // 5. Seguridad alimentaria: desde que se cocina hasta el último táper o cena repetida
      if (!v.rep && !x.past) {
        const st = ((A.S.meals || {})[x.id] || {}).status;
        if (st !== "nada" && st !== "fuera") {
          const coc = ((A.S.cooked || {})[x.id] || {}).d || x.date;
          const come = [x.date, ...(x.tupper.length ? [sumaDias(x.date, 1)] : [])];
          for (const o of sl) if ((wk.slots[o.id] || {}).rep === x.id) come.push(o.date, ...(o.tupper.length ? [sumaDias(o.date, 1)] : []));
          const tarde = come.filter(d => entre(coc, d) > r.fridge);
          T.ok("nevera", INV.nevera, !tarde.length, () => `${nombre(rid)} cocinado el ${fecha(coc)} se come el ${tarde.map(fecha).join(", ")} (aguanta ${r.fridge} d)`);
          if (x.tupper.length) T.ok("nevera", INV.nevera, r.fridge >= 1, () => `${hueco(x.id)}: táper de ${nombre(rid)}, que no aguanta ni una noche`);
        }
      }
      // 6. Nadie come algo que no puede
      if (x.date >= hoy) { const bad = seguro("unsafeFor", () => A.unsafeFor(A.slotPeople(x), r)) || [];
        T.ok("alergias", INV.alergias, !bad.length, () => `${hueco(x.id)}: ${nombre(rid)} no lo puede comer ${bad.map(p => p.name).join(", ")} (según la app)`);
        for (const p of A.slotPeople(x)) { const por = noPuede(p, rid); T.ok("alergias", INV.alergias, !por, () => `${hueco(x.id)}: ${nombre(rid)} lleva ${por}, que ${p.name} no puede comer`) } }
    }
    // 7. Variedad de la semana (los días que repiten el plato de otro no cuentan)
    const bases = {};
    for (const [id, v] of Object.entries(wk.slots || {})) { if (v.rep || !A.RX[v.recipe]) continue; const b = seguro("carbBase", () => A.carbBase(A.RX[v.recipe])); if (b) (bases[b] = bases[b] || []).push(id) }
    const over = Object.entries(bases).filter(([, ids]) => ids.length > 3);
    const nota = seguro("varietyNote", () => A.varietyNote(s)) || "";
    T.ok("variedad", INV.variedad, !over.length || !!nota, () => `semana del ${fecha(s)}: ${over.map(([b, ids]) => `${ids.length} de ${b} (${ids.map(hueco).join(", ")})`).join(" y ")} sin aviso`);
  }
}

/* ---------- 8. Despensa ---------- */
const stock = () => { const st = seguro("despensaState", () => A.despensaState()); return st ? JSON.parse(JSON.stringify(st.stock)) : {} };
function compruebaDespensa(cuando) {
  const st = seguro("despensaState", () => A.despensaState()); if (!st) return;
  for (const [pid, q] of Object.entries(st.stock)) T.ok("despensa", INV.despensa, q >= 0, () => `${cuando}: ${pid} en negativo (${q})`);
  for (const [pid, ls] of Object.entries(st.lots)) for (const l of ls) T.ok("despensa", INV.despensa, l.left >= -1e-6 && l.left <= l.q + 1e-6, () => `${cuando}: la entrada ${l.id} de ${pid} tiene ${l.left} de ${l.q}`);
}
// Cocinar: lo que lleva el plato sale de la despensa (comprobado en los ingredientes de los que había bastante)
function cocina(d, meal) {
  const x = seguro("slotFor", () => A.slotFor(d, meal)); if (!x) return;
  const wk = A.S.plans[lunes(d)], v = wk && wk.slots[x.id];
  if (!v || !A.RX[v.recipe] || v.rep || A.mealState(d, meal) !== "cocinar") return;
  const r = A.RX[v.recipe], p = seguro("cookPortions", () => A.cookPortions(x));
  const antes = stock(), faltaba = JSON.stringify((seguro("despensaState", () => A.despensaState()) || {}).short || {});
  seguro("markCooked " + x.id, () => A.markCooked(x, p));
  const despues = stock();
  // Lo que no estaba en casa al cocinar (aunque el usuario hizo todas las compras que le pidió la app, a su día)
  {const sh = (seguro("despensaState", () => A.despensaState()) || {}).short || {}, f0 = JSON.parse(faltaba), nuevo = [];
    for (const [pid, l] of Object.entries(sh)) { const n0 = (f0[pid] || []).length; for (const e of l.slice(n0)) if (e.d === d && e.q > Math.max(1, A.P[pid].env * 0.1)) nuevo.push(`${pid} ${Math.round(e.q)}${A.P[pid].unit} (${A.P[pid].keep})`) }
    T.ok("comprado", INV.comprado, !nuevo.length, () => `${hueco(x.id)} ${nombre(r.id)}: no había ${nuevo.join(", ")}`)}
  const ing = {}; for (const [pid, q] of seguro("slotIng", () => A.slotIng(r, { ...x, portions: p })) || []) ing[pid] = (ing[pid] || 0) + q;
  let n = 0;
  for (const [pid, q] of Object.entries(ing)) {
    if (!((antes[pid] || 0) >= q + 1) || n >= 4) continue; n++;
    const baja = (antes[pid] || 0) - (despues[pid] || 0);
    T.ok("despensa", INV.despensa, Math.abs(baja - q) < 0.01, () => `cocinar ${nombre(r.id)} el ${fecha(d)} (${p} raciones): ${pid} baja ${Math.round(baja * 100) / 100} y la receta pide ${Math.round(q * 100) / 100}`);
  }
  T.ok("despensa", INV.despensa, (A.S.cooked || {})[x.id] && A.S.cooked[x.id].rid === r.id && Math.abs(A.S.cooked[x.id].p - p) < 0.01, () => `${hueco(x.id)}: S.cooked no guarda lo cocinado (${JSON.stringify((A.S.cooked || {})[x.id])})`);
  compruebaPasado("cocinar " + hueco(x.id));
  fijaPasado(sumaDias(d, -1));
  cocinado.set(x.id, JSON.stringify(A.S.cooked[x.id])); fijado.set(x.id, r.id);
}

/* ---------- 9. Sobras ---------- */
function compruebaSobras(hoy) {
  const lo = seguro("cookedLeftovers", () => A.cookedLeftovers()) || [];
  for (const x of lo) {
    const r = A.RX[x.rid], exp = r ? sumaDias(x.cookedOn, r.fridge) : null, w = seguro("leftoverWhen", () => A.leftoverWhen(x)) || {};
    T.ok("sobras", INV.sobras, x.expires === exp && x.daysLeft === entre(hoy, x.expires), () => `${hueco(x.key)} ${nombre(x.rid)}: caduca el ${x.expires} (debería ${exp}), quedan ${x.daysLeft} días`);
    T.ok("sobras", INV.sobras, hoy <= x.expires || w.cls === "bad", () => `${fecha(hoy)}: ${nombre(x.rid)} caducó el ${fecha(x.expires)} y se ofrece como «${w.txt}»`);
    for (const n of x.next || []) T.ok("sobras", INV.sobras, n.slice(0, 10) <= x.expires, () => `${nombre(x.rid)} cocinado el ${fecha(x.cookedOn)} está previsto para ${hueco(n)}, después de caducar (${fecha(x.expires)})`);
    T.ok("sobras", INV.sobras, x.portions > 0 && x.portions <= Number((A.S.cooked[x.key] || {}).p || 0) + 0.01, () => `${hueco(x.key)}: quedan ${x.portions} raciones de ${(A.S.cooked[x.key] || {}).p}`);
  }
  T.mira("sobras", INV.sobras);
}

/* ---------- 13 y 14. Comedor y postre del cole (al final del mes: lo que se comió cada día) ---------- */
function compruebaComedor() {
  const com = (A.S.comedor || {}).k1 || {};
  for (let d = "2026-11-02"; d <= "2026-11-30"; d = sumaDias(d, 1)) {
    const c = com[d]; if (!c || dds(d) > 4 || lukasEsperado(d, "comida") || !lukasEsperado(d, "cena")) continue;   // solo días de cole con Lukas a cenar
    const wk = A.S.plans[lunes(d)], v = wk && wk.slots[d + "|cena"], ck = (A.S.cooked || {})[d + "|cena"], rid = ck ? ck.rid : v && v.recipe;
    if (rid && A.RX[rid] && !(v && v.manual)) {
      const mismos = (seguro("recipeTypes", () => A.recipeTypes(A.RX[rid])) || []).filter(t => (c.tipos || []).includes(t));
      T.ok("comedor", INV.comedor, !mismos.length, () => `${fecha(d)}: en el cole «${c.txt}» (${c.tipos.join(", ")}) y de cena ${nombre(rid)}, también ${mismos.join(", ")}`);
    }
    // Postre: con «alterna», si en el cole tomó yogur (o un lácteo) la cena lleva fruta, y al revés
    const p = seguro("postreFor", () => A.postreFor(d, "cena")), cole = c.postre === "yogur" || c.postre === "lacteo" ? "yogur" : c.postre === "fruta" ? "fruta" : null;
    if (p && cole && !p.manual) { const t = p.pid === "yogur" ? "yogur" : "fruta"; T.ok("postreCole", INV.postreCole, t !== cole, () => `${fecha(d)}: en el cole ${c.postre} de postre y en la cena otra vez ${p.nombre}`) }
  }
  T.mira("comedor", INV.comedor); T.mira("postreCole", INV.postreCole);
}
/* ---------- 15. Postre: en la compra de su semana y descontado al comerlo ---------- */
const postreUsos = () => (seguro("monthUses", () => A.monthUses(M)) || []).filter(u => u.postre);
function compruebaPostreLista(wi) {
  const sh = seguro("shopping", () => A.shopping(M, true)); if (!sh) return;
  const l = sh.lists[wi], hace = {};
  for (const u of postreUsos()) if (u.freshWi === wi) hace[u.pid] = (hace[u.pid] || 0) + u.q;
  for (const [pid, q] of Object.entries(hace)) { const it = l && l.items.find(i => i.pid === pid);
    T.ok("postre", INV.postre, it && it.q >= q - 0.01, () => `compra de la semana del ${fecha(sh.weeks[wi])}: los postres piden ${Math.round(q)} de ${pid} y la lista trae ${it ? Math.round(it.q) : 0}`) }
}
function compruebaPostreComido(d) {
  const st = seguro("despensaState", () => A.despensaState()); if (!st) return;
  const meals = Object.fromEntries(st.meals.map(m => [m.key, m]));
  for (const meal of ["comida", "cena"]) {
    const p = seguro("postreFor", () => A.postreFor(d, meal)); if (!p) continue;
    const q = A.postreQty(d, meal, p.pid), m = meals[d + "|" + meal + "|postre"], it = m && m.items.find(i => i.pid === p.pid);
    T.ok("postre", INV.postre, it && Math.abs(it.q - q) < 0.01, () => `${fecha(d)} ${meal}: el postre (${p.nombre}, ${q}) no se ha descontado de casa (${it ? it.q : "nada"})`);
    const falta = ((st.short || {})[p.pid] || []).filter(e => e.d === d).reduce((t, e) => t + e.q, 0);
    T.ok("postre", INV.postre, falta <= Math.max(1, A.P[p.pid].env * 0.1), () => `${fecha(d)} ${meal}: de postre ${p.nombre} y no había en casa (faltaron ${Math.round(falta)} ${A.P[p.pid].unit})`);
  }
}
/* ---------- 16. Lo fresco que caduca (js/caduca.js) ---------- */
const avisado = new Set(), podrido = new Set();
const minFresco = pid => Math.max(A.dpEps(pid), A.P[pid].env * 0.1);
function compruebaCaduca(hoy) {
  const fx = seguro("freshExpiring", () => A.freshExpiring()) || [], st = seguro("despensaState", () => A.despensaState()); if (!st) return;
  for (const x of fx) avisado.add(x.pid + "|" + x.at);
  // (a) No avisa de lo que los platos de antes de que caduque gastan entero (se gasta primero lo más antiguo)
  const usos = {}; for (const u of seguro("upcomingUses", () => A.upcomingUses(hoy, sumaDias(hoy, 30))) || []) (usos[u.pid] = usos[u.pid] || []).push(u);
  for (const x of fx) { if (x.daysLeft < 0) continue;
    const antes = (st.lots[x.pid] || []).filter(l => !l.bag && !l.fz && l.at && l.at <= x.at).reduce((t, l) => t + l.left, 0);
    const gastan = (usos[x.pid] || []).filter(u => u.date <= x.expires).reduce((t, u) => t + u.q, 0);
    T.ok("caduca", INV.caduca, gastan < antes - minFresco(x.pid) + 0.01, () => `${fecha(hoy)}: avisa de ${x.pid} (comprado el ${fecha(x.at)}, caduca el ${fecha(x.expires)}) y los platos de antes gastan ${Math.round(gastan)} de ${Math.round(antes)}`) }
  // (b) Lo que se pasa (le queda algo el día después de caducar) se avisó antes: en Hoy, el día antes o ese día
  for (const [pid, ls] of Object.entries(st.lots)) { const v = A.vidaDe(pid), p = A.P[pid]; if (v == null || !p || (p.keep !== "fresco" && p.keep !== "congelar")) continue;
    for (const l of ls) { if (l.bag || l.fz || !l.at) continue; const k = pid + "|" + l.at, exp = sumaDias(l.at, v);
      if (hoy > exp && !podrido.has(k) && l.left >= minFresco(pid)) { podrido.add(k);
        T.ok("caduca", INV.caduca, avisado.has(k), () => `${pid} comprado el ${fecha(l.at)} se pasó el ${fecha(exp)} con ${Math.round(l.left)} ${p.unit} y la app no lo avisó`) } } }
  T.mira("caduca", INV.caduca);
  return fx;
}
// Como el usuario: en Hoy, «Ponerlo en el menú» de lo primero que caduca (no lo de congelar ni lo ya pasado)
function ponerFrescoEnMenu(hoy, fx) {
  const x = fx.find(y => !y.congelar && y.daysLeft >= 0); if (!x) return;
  const antes = {}; for (const s of semanas()) for (const [id, v] of Object.entries(A.S.plans[s].slots)) if (id.slice(0, 10) >= hoy) antes[id] = v.recipe;
  seguro("useFreshInMenu", () => A.useFreshInMenu(x.pid, x.expires));
  for (const s of semanas()) for (const [id, v] of Object.entries(A.S.plans[s].slots)) if (id.slice(0, 10) >= hoy && antes[id] !== v.recipe && v.manual) {
    const r = A.RX[v.recipe];
    T.ok("caduca", INV.caduca, id.slice(0, 10) <= x.expires && r && r.ing.some(([p]) => p === x.pid), () => `«Ponerlo en el menú» con ${x.pid} (caduca el ${fecha(x.expires)}) pone ${nombre(v.recipe)} el ${hueco(id)}`) }
  compruebaPasado("ponerlo en el menú (" + x.pid + ")");
}

/* ---------- 10. Presupuesto y gasto ---------- */
const eur = n => ev(`eur(${Number(n)})`);
function compruebaDinero(hoy) {
  const sh = seguro("shopping", () => A.shopping(M)); if (!sh) return;
  const pw = sh.perWeek.reduce((a, b) => a + b, 0);
  T.ok("dinero", INV.dinero, Math.abs(pw - sh.total) < 0.01, () => `${fecha(hoy)}: el gasto por semanas suma ${pw.toFixed(2)} y el total del mes es ${sh.total.toFixed(2)}`);
  const html = seguro("hoyBudget", () => A.hoyBudget()) || "", paid = A.paidOf(M);
  const want = paid.total ? `previsto ${eur(sh.total)}` : `Previsto: ${eur(sh.total)}`;
  T.ok("dinero", INV.dinero, html.includes(want), () => `${fecha(hoy)}: la línea del presupuesto en Hoy no dice «${want}»: ${html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)}`);
  const tk = (A.S.tickets || []).filter(t => (t.date || "").slice(0, 7) === M).reduce((s, t) => s + t.lines.filter(l => l.food).reduce((u, l) => u + l.amount, 0), 0);
  const man = Object.entries(A.S.spent || {}).filter(([k]) => k.startsWith(M + "|")).reduce((s, [, v]) => s + (Number(v) || 0), 0);
  T.ok("dinero", INV.dinero, Math.abs(paid.total - (tk + man)) < 0.01, () => `${fecha(hoy)}: paidOf dice ${paid.total} y los tickets del mes (${tk.toFixed(2)}) más lo apuntado a mano (${man}) suman ${(tk + man).toFixed(2)}`);
  if (paid.total) T.ok("dinero", INV.dinero, html.includes(`Llevas ${eur(paid.total)}`), () => `${fecha(hoy)}: Hoy no dice «Llevas ${eur(paid.total)}»`);
}

/* ---------- 11. Avisos ---------- */
function compruebaAvisos(hoy) {
  const l = seguro("buildSchedule", () => A.buildSchedule()) || [];
  const porDia = {};
  for (const a of l) {
    const d = new Date(a.t), min = d.getHours() * 60 + d.getMinutes(), dia = `${d.getFullYear()}-${P2(d.getMonth() + 1)}-${P2(d.getDate())}`, k = String(a.tag).split("|")[0];
    porDia[dia] = (porDia[dia] || 0) + 1;
    T.ok("avisos", INV.avisos, min >= 8 * 60 && min < 22 * 60, () => `aviso a las ${P2(d.getHours())}:${P2(min % 60)} del ${fecha(dia)}: ${a.title}`);
    if (k === "plan") { const s = a.tag.split("|")[1]; T.ok("avisos", INV.avisos, !(A.S.plans[s] && A.S.plans[s].confirmed), () => `«${a.title}» (${fecha(dia)}) para la semana del ${fecha(s)}, que ya está planificada`) }
    if (k === "thaw") {
      const id = a.tag.slice(5), wk = A.S.plans[lunes(id.slice(0, 10))], v = wk && wk.slots[id];
      const ya = (A.S.cooked || {})[id] ? "ya está cocinado" : v && v.rep ? `es el mismo plato que el ${hueco(v.rep)}, ya cocinado: no hay nada que descongelar` : ((A.S.thawChecked || {})[id] ? "ya se descongeló" : null);
      T.ok("avisos", INV.avisos, !ya, () => `«${a.title}: ${a.body}» (${fecha(dia)} ${P2(d.getHours())}:${P2(min % 60)}) para ${hueco(id)}: ${ya}`);
    }
    if (k === "cook") { const id = a.tag.slice(5); T.ok("avisos", INV.avisos, !(A.S.cooked || {})[id] || /táper/i.test(a.title), () => `«${a.title}» para ${hueco(id)}, que ya está cocinado`) }
  }
  for (const [dia, n] of Object.entries(porDia)) T.ok("avisos", INV.avisos, n <= 5, () => `${n} avisos el ${fecha(dia)}`);
  T.mira("avisos", INV.avisos);
}

/* ---------- Lo que hace la app al abrirse (boot en js/ui.js) y al pintar (render: safetyAll) ---------- */
function abrirApp(hoy) {
  seguro("abrir la app (ensureHorizon y ensureWeek)", () => ev(`ensureHorizon();for(const s of Object.keys(S.plans))if(addDays(s,6)>=todayISO())ensureWeek(s);save();
    if(budgetSet()&&!(S.budgetInfo&&S.budgetInfo[budgetMonths()[0]]))checkBudget();safetyAll();`));
  compruebaPasado(`abrir la app el ${fecha(hoy)}`);
}
// Tras un cambio: lo que hace la pantalla del día en el Mes (mes.js: redo) y luego pintar
const recalculaSemana = (d, que) => {
  seguro(que, () => ev(`(function(){const st=weekStartFor("${d}");save();ensureWeek(st);if(S.plans[addDays(st,7)])ensureWeek(addDays(st,7));save();safetyAll()})()`));
  compruebaPasado(que);
};
// «Preparar el mes» (ui.js openMonthPrep: build + Hacer el pedido)
function prepararMes(nx, entrega) {
  seguro("preparar " + nx, () => ev(`(function(){const nx="${nx}";
    const from=[todayISO(),S.home.start||""].sort()[1],ws=[];for(let s=weekStartFor(nx+"-01");s.slice(0,7)<=nx;s=addDays(s,7))if(addDays(s,6)>=from)ws.push(s);
    S.monthPrep=S.monthPrep||{};S.monthPrep[nx]={mood:null,more:[],less:[],favs:[],budget:null,kidsOk:{k1:true},done:null};
    const cw=weekStartFor(todayISO());for(const s of ws)if(s>cw&&!(S.plans[s]&&S.plans[s].confirmed))genWeekFromScratch(s);else if(S.plans[s])ensureWeek(s);
    if(budgetSet(nx))fitMonthBudget(nx);save();
    S.monthPrep[nx].done=todayISO();S.pedido=S.pedido||{};S.pedido[nx]={...(S.pedido[nx]||{}),entrega:"${entrega}",estado:"pedido",at:todayISO()};save()})()`));
  compruebaPasado("preparar " + nx);
}

/* ---------- El ticket (tests/fixtures/ticket-mercadona.txt, con la fecha del pedido) ---------- */
async function subirTicket(d, lista) {
  app.fetchLocal();
  await seguro("loadCatalog", () => A.loadCatalog());
  const txt = fs.readFileSync(path.join(__dirname, "fixtures", "ticket-mercadona.txt"), "utf8").replace(/\d\d\/\d\d\/2026 (\d\d:\d\d)/, `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)} $1`);
  app.ctx.__txt = txt;
  // Lo mismo que hace openTicketScan al leer el ticket (bolsas y lo que no es producto, fuera; lo demás, con su producto)
  const tk = seguro("parseTicket", () => ev(`(function(){const tk=parseTicket(__txt);for(const l of tk.lines){
      if(l.fee||/^(BOSSA|BOLSA)\\b/i.test(l.desc)&&l.amount/Math.max(1,l.qty)<=0.5){l.match=null;l.food=false;l.pid=null;l.group=l.fee?"Preparación y envío":"Bolsas";continue}
      if(l.nonprod){l.match=null;l.food=false;l.pid=null;l.group="Otros (no comida)";continue}
      l.match=matchLine(l.desc,tk.super);l.food=l.match?l.match.food:true;l.pid=l.match?l.match.pid:null;l.group=l.match?l.match.group:"Sin identificar"}return tk})()`));
  if (!tk) return null;
  T.ok("dinero", INV.dinero, tk.date === d && Math.abs(tk.total - 36.06) < 0.01, `el ticket se lee con fecha ${tk.date} y total ${tk.total} (debería ${d} y 36,06)`);
  seguro("saveTicket", () => A.saveTicket(tk, tk.date, { m: d.slice(0, 7), key: lista }));
  return tk;
}

/* ================= El mes, día a día ================= */
(async () => {
  const t0 = Date.now();
  seguro("crear la casa", () => crearCasa(app));
  // TRAMPA="código": se ejecuta en la app antes de empezar (para comprobar que las pruebas pillan un fallo metido a propósito)
  if (process.env.TRAMPA) ev(process.env.TRAMPA);
  // Domingo 1, 10:00: termina el alta (finishOnboarding: ensureHorizon) y prepara noviembre con el pedido para el martes 3
  seguro("ensureHorizon", () => A.ensureHorizon());
  // Sube el menú del comedor de Lukas: el PDF real del cole (tests/fixtures/comedor-basal-nov.json: los trozos de texto de su página «Basal»),
  // leído con lo mismo que «Menú del comedor» (pdfMenus, parsePdfMenu, cEntry) y guardado como openComedor (comedorReplan)
  {const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "comedor-basal-nov.json"), "utf8"));
    app.ctx.__pg = [{ n: fx.n, items: fx.items }];
    const n = seguro("menú del comedor", () => ev(`(function(){const ms=pdfMenus(__pg),mn=ms.find(m=>/basal/i.test(m.name));if(!mn)return 0;const ds=parsePdfMenu(mn);
      S.comedor={k1:{}};for(const [d,o] of Object.entries(ds))S.comedor.k1[d]=cEntry(o);S.comedorCfg={k1:{variante:mn.name}};S.home.postre={comida:"fruta",cena:"alterna"};save();comedorReplan(Object.keys(ds));return Object.keys(ds).length})()`));
    T.ok("comedor", INV.comedor, n >= 20, `el menú del comedor «Basal» de noviembre se lee con ${n} días (deberían ser 21)`);}
  prepararMes(M, "2026-11-03");
  let swapId = null, swapRid = null, sinCocinar = new Set(["2026-11-17|cena"]);
  const semanasM = A.weeksInMonth(M);

  for (let d = "2026-11-01"; d <= "2026-11-30"; d = sumaDias(d, 1)) {
    // 08:00 · se abre la app
    app.reloj(d + "T08:00:00");
    if (d > "2026-11-01") abrirApp(d);
    compruebaPlan(d, d); compruebaDespensa(fecha(d) + " 08:00"); compruebaSobras(d); compruebaDinero(d); compruebaAvisos(d);
    if (d > "2026-11-02") compruebaPostreComido(sumaDias(d, -1));
    const fx = compruebaCaduca(d) || [];
    if (swapId) { const v = A.S.plans[lunes(swapId.slice(0, 10))].slots[swapId]; T.ok("mano", INV.mano, v && v.recipe === swapRid, () => `${hueco(swapId)}: elegido a mano ${nombre(swapRid)} y ahora es ${v ? nombre(v.recipe) : "nada"}`) }

    // 09:00–10:00 · lo que pasa ese día
    app.reloj(d + "T09:00:00");
    // Como haría el usuario: en «En casa › Lo que falta», «Añadir a la compra» lo que aún no está en ninguna lista
    {const miss = (seguro("despensaMissing", () => A.despensaMissing()) || []).filter(x => !x.inList);
      if (miss.length) { seguro("addMissingToShop", () => A.addMissingToShop(miss)); compruebaPasado("añadir lo que falta a la compra") }}
    // El fresco de cada semana llega su día de entrega (martes): se marca como comprado
    const wi = semanasM.findIndex(s => A.deliveryDate(s) === d);
    if (wi >= 0) compruebaPostreLista(wi);
    // Lo que caduca: «Ponerlo en el menú» (después del fresco del día, que ya está en casa)
    if (wi < 0 && d > "2026-11-03") ponerFrescoEnMenu(d, fx);
    if (wi >= 0) { seguro("markShopDone " + wi, () => A.markShopDone(M, String(wi))); compruebaPasado("marcar el fresco"); }
    if (d === "2026-11-03") {
      // Llega el pedido del mes y se guarda («Guardar el pedido»: bolsas de carne y pescado con su día)
      seguro("pedido llegado", () => ev(`S.pedido["${M}"].estado="llegado";save()`));
      seguro("openGuardarPedido", () => A.openGuardarPedido(M));   // la ventana (sin pantalla: solo que no falle)
      const bolsas = seguro("pedBagPlan", () => ev(`shopping("${M}").lists.mes.items.filter(it=>pedBagged(it.pid)).map(it=>pedBagPlan("${M}",it))`)) || [];
      const nb = seguro("storePedido", () => A.storePedido(M, bolsas));
      const st = stock();
      T.ok("despensa", INV.despensa, bolsas.length > 0 && nb === bolsas.reduce((t, x) => t + x.n, 0), `guardar el pedido: ${bolsas.length} productos en bolsas, ${nb} bolsas`);
      for (const x of bolsas) {
        const enBolsas = A.S.bolsas.filter(b => b.pid === x.pid).reduce((t, b) => t + b.n * b.peso, 0);
        T.ok("despensa", INV.despensa, Math.abs((st[x.pid] || 0) - enBolsas) < 1, () => `pedido guardado: ${x.pid} tiene ${Math.round(st[x.pid] || 0)} en casa y en bolsas hay ${enBolsas} (compradas ${x.tot}): lo comprado cuenta ${Math.round((st[x.pid] || 0) / Math.max(1, enBolsas) * 10) / 10} veces`);
        T.ok("despensa", INV.despensa, (x.dates || []).every(dd => dd >= d), () => `bolsa de ${x.pid} para días ya pasados: ${x.dates.join(", ")}`);
      }
      // El ticket del pedido (no puede volver a sumar lo que ya está en bolsas)
      app.reloj(d + "T18:00:00");
      const antes = stock();
      const tk = await subirTicket(d, "mes");
      const despues = stock();
      for (const x of bolsas) T.ok("despensa", INV.despensa, Math.abs((despues[x.pid] || 0) - (antes[x.pid] || 0)) < 1, () => `subir el ticket del pedido: ${x.pid} pasa de ${Math.round(antes[x.pid] || 0)} a ${Math.round(despues[x.pid] || 0)} (ya estaba en bolsas)`);
      T.ok("dinero", INV.dinero, tk && A.paidOf(M).n === 1, () => `tras subir el ticket, paidOf cuenta ${A.paidOf(M).n} tickets`);
      compruebaPasado("subir el ticket");
    }
    if (d === "2026-11-10") {
      // Cena fuera el viernes 13 (Mes › día › Cena: Fuera › «No lo cocino»: changeMeal en ui.js)
      seguro("cena fuera el 13", () => ev(`(function(){const d="2026-11-13",st=weekStartFor(d),wk=S.plans[st];delete wk.slots[d+"|cena"];S.days[d]=S.days[d]||{};S.days[d].cena="fuera";save();ensureWeek(st);save();safetyAll()})()`));
      compruebaPasado("cena fuera el viernes 13");
      T.ok("hueco", INV.hueco, !A.S.plans["2026-11-09"].slots["2026-11-13|cena"] && A.mealState("2026-11-13", "cena") === "fuera", "la cena fuera del viernes 13 sigue con plato");
    }
    if (d === "2026-11-12") {
      // Lukas viene el jueves 19 solo a cenar (Mes › día › Lukas: Solo cena)
      seguro("Lukas el jueves 19", () => ev(`(function(){const o=S.days["2026-11-19"]=S.days["2026-11-19"]||{};o.kids=o.kids||{};o.kids.k1={comida:false,cena:true}})()`));
      recalculaSemana("2026-11-19", "Lukas viene el jueves 19 a cenar");
    }
    if (d === "2026-11-14") {
      // El presupuesto baja a 250 € (Tu semana normal › Presupuesto: guardar rehace el menú desde hoy)
      // Antes: los platos de hoy hasta el próximo fresco (martes 17), que ya están comprados (el fresco del martes 10 y el pedido del mes)
      const prox = A.deliveryDate("2026-11-16"), antes = {};
      for (const s of semanas()) for (const [id, v] of Object.entries(A.S.plans[s].slots)) if (id.slice(0, 10) >= d && id.slice(0, 10) < prox && v && v.recipe) antes[id] = v.recipe;
      seguro("presupuesto 250", () => ev(`S.home.budget.month=250;S.home.budget.week=null;S.home.budgetConfirmed=true;S.home.tscale={};save();redoFromToday();checkBudget();safetyAll()`));
      for (const [id, rid] of Object.entries(antes)) { const v = A.S.plans[lunes(id.slice(0, 10))].slots[id];
        T.ok("rehacer", INV.rehacer, v && v.recipe === rid, () => `${hueco(id)}: ${nombre(rid)}, con su compra ya hecha (fresco del ${fecha(A.deliveryDate("2026-11-09"))} y pedido del mes), pasa a ${v ? nombre(v.recipe) : "nada"} al bajar el presupuesto a 250 €; lo nuevo no está comprado y lo comprado se queda sin plato`) }
      compruebaPasado("bajar el presupuesto a 250 €");
      T.ok("dinero", INV.dinero, A.budgetSet() === true && A.monthBudget(M) === 250, () => `tras poner 250 €: budgetSet() ${A.budgetSet()}, monthBudget ${A.monthBudget(M)}`);
    }
    if (d === "2026-11-16") {
      // Cambia a mano la cena del miércoles 18 (Cambiar plato: la primera alternativa)
      const x = A.slotFor("2026-11-18", "cena"), alt = seguro("alternatives", () => A.alternatives(x, 6)) || [];
      if (x && alt.length) { swapId = x.id; swapRid = alt[0].r.id; seguro("setSlotRecipe", () => A.setSlotRecipe(x, swapRid)); seguro("render", () => ev("safetyAll()")); compruebaPasado("cambiar a mano la cena del 18") }
      else T.falla("mano", INV.mano, "no hay alternativas para la cena del miércoles 18");
    }
    if (d === "2026-11-18") {
      // La cena del martes 17 no se hizo («¿Qué tal?» › No lo cociné; no se pasa a otro día)
      seguro("no se cocinó el 17", () => ev(`S.meals=S.meals||{};S.meals["2026-11-17|cena"]={status:"nada"};save();safetyAll()`));
      compruebaPasado("la cena del 17 no se hizo");
      // Su táper del miércoles 18 no existe: ni en el Mes (dishOfMeal), ni en «¿Qué tal?» (pendingMeals) a media tarde
      const t = seguro("dishOfMeal", () => A.dishOfMeal("2026-11-18", "comida")) || {};
      T.ok("noCocinado", INV.noCocinado, !t.recipe, () => `mié 18/11 comida: la cena del martes 17 no se cocinó y la app sigue diciendo «táper de ${t.recipe.name}» (Mes, resumen del día, ¿Qué tal?, nutrición)`);
      app.reloj(d + "T16:00:00");
      const pm = (seguro("pendingMeals", () => A.pendingMeals()) || []).filter(x => x.key === "2026-11-18|comida" && x.taper);
      T.ok("noCocinado", INV.noCocinado, !pm.length, () => `mié 18/11 16:00: «¿Qué tal?» pregunta por el táper de ${pm[0].r.name}, que no se cocinó`);
      app.reloj(d + "T09:00:00");
    }
    if (d === "2026-11-24") {
      // Toca preparar diciembre (monthPrepDate: el último martes)
      T.ok("avisos", INV.avisos, A.monthPrepDate(M) === d, () => `preparar diciembre: monthPrepDate dice ${A.monthPrepDate(M)}`);
      app.reloj(d + "T17:00:00");
      prepararMes("2026-12", "2026-12-01");
    }
    // Cada domingo a las 17:00 se planifica (confirma) la semana siguiente
    if (dds(d) === 6) { app.reloj(d + "T17:00:00"); const nx = sumaDias(d, 1); if (A.S.plans[nx]) seguro("confirmar semana", () => ev(`S.plans["${nx}"].confirmed=true;save()`)) }

    // 13:30 comida y 20:30 cena: se cocina lo que toca
    if (d >= "2026-11-02") {
      app.reloj(d + "T13:30:00"); cocina(d, "comida");
      app.reloj(d + "T20:30:00"); if (!sinCocinar.has(d + "|cena")) cocina(d, "cena");
    }
    // 23:00 · fin del día
    app.reloj(d + "T23:00:00");
    compruebaDespensa(fecha(d) + " 23:00"); compruebaSobras(d);
    compruebaPasado("fin del día " + fecha(d));
    fijaPasado(d);
  }
  // Repaso final de todo el mes (también las semanas ya pasadas)
  app.reloj("2026-11-30T23:30:00");
  compruebaPlan("2026-11-30", "2026-11-02");
  compruebaComedor();
  T.mira("errores", INV.errores);
  const pendientes = [];

  // Lo que un plato necesitó al cocinarlo y no estaba en casa (despensaState().short)
  if (process.env.VER) { const sh = A.despensaState().short; for (const [pid, l] of Object.entries(sh)) console.log(`   faltó ${pid}: ${l.map(x => fecha(x.d) + " " + Math.round(x.q)).join(", ")}`) }
  // VER=1: el menú del mes tal como quedó (para mirar a ojo)
  if (process.env.VER) for (const s of semanas()) {
    console.log(`— semana del ${fecha(s)}${A.S.plans[s].confirmed ? " (planificada)" : ""}`);
    for (const x of huecos(s)) { const v = A.S.plans[s].slots[x.id] || {}, r = A.RX[v.recipe], ck = (A.S.cooked || {})[x.id];
      console.log(`   ${hueco(x.id).padEnd(16)} ${x.kids.length ? "Lukas" : "     "} ${x.tupper.length ? "+táper" : "      "} ${r ? r.name + ` (${r.fridge} d${r.ing.some(([p]) => A.P[p].thaw) ? ", descongelar" : ""})` : "—"}${v.rep ? " · repite " + hueco(v.rep) : ""}${v.manual ? " · a mano" : ""}${ck ? ` · cocinado ${ck.d.slice(5)} ${ck.p} rac` : ""}`) }
  }
  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Escenario simulado en ${seg} s · ${Object.keys(A.S.cooked || {}).length} platos cocinados · ${(A.S.bolsas || []).length} productos en bolsas · ${A.S.tickets.length} ticket · semilla ${SEMILLA}`);
  for (const p of pendientes) console.log("… pendiente: " + p);
  T.fin({ segundos: Number(seg), pendientes });
})().catch(e => { console.log("Error del escenario (no de la app): " + e.stack); process.exit(2) });
