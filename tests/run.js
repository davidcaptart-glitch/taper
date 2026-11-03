#!/usr/bin/env node
/* Táper · todas las pruebas con una orden: node tests/run.js
   Ejecuta cada prueba en su propio proceso (en paralelo y con la hora de Madrid), junta los resultados y dice cuántas
   comprobaciones pasan y cuáles fallan. Sale con código 1 si algo falla.
   Opciones: --semillas 1,2,3 (o SEMILLAS=…) para el azar del escenario · -v para ver toda la salida de cada prueba
             --solo escenario|sistema|casos para ejecutar solo una */
"use strict";
const { spawn } = require("child_process"), path = require("path");
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null };
const verbose = args.includes("-v");
const semillas = String(opt("--semillas") || process.env.SEMILLAS || "1,2,3").split(",").map(s => s.trim()).filter(Boolean);
const solo = opt("--solo");

const tareas = [
  { file: "sistema.js", nombre: "Sistema" },
  { file: "casos.js", nombre: "Casos sueltos" },
  ...semillas.map(s => ({ file: "escenario-david.js", nombre: "Escenario David y Lukas", env: { SEMILLA: s }, semilla: s }))
].filter(t => !solo || t.file.startsWith(solo));

const t0 = Date.now();
function ejecuta(t) {
  return new Promise(res => {
    const p = spawn(process.execPath, [path.join(__dirname, t.file)], { env: { ...process.env, TZ: "Europe/Madrid", ...(t.env || {}) } });
    let out = "", err = "";
    p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d);
    p.on("close", code => {
      const line = out.split("\n").reverse().find(l => l.startsWith("@@RESULTADO "));
      let r = null; try { r = line && JSON.parse(line.slice(12)) } catch (e) {}
      res({ ...t, code, out, err, r });
    });
  });
}

(async () => {
  const res = await Promise.all(tareas.map(ejecuta));
  // Se juntan por prueba y comprobación (el escenario con varias semillas cuenta como una sola prueba)
  const grupos = new Map();
  let roto = [];
  for (const x of res) {
    if (verbose) console.log(`\n===== ${x.file}${x.semilla ? " (semilla " + x.semilla + ")" : ""} =====\n` + x.out.split("\n").filter(l => !l.startsWith("@@")).join("\n") + x.err);
    if (!x.r) { roto.push(`${x.file}${x.semilla ? " (semilla " + x.semilla + ")" : ""} no ha terminado (código ${x.code}): ${(x.err || x.out).trim().split("\n").slice(-4).join(" | ")}`); continue }
    const g = grupos.get(x.nombre) || { nombre: x.nombre, checks: new Map(), segundos: [], pendientes: new Set() };
    grupos.set(x.nombre, g);
    if (x.r.segundos != null) g.segundos.push(x.r.segundos);
    for (const p of x.r.pendientes || []) g.pendientes.add(p);
    for (const c of x.r.comprobaciones) {
      const k = c.id, cur = g.checks.get(k) || { nombre: c.nombre, veces: 0, fallos: [] };
      cur.veces += c.veces;
      for (const f of c.fallos) cur.fallos.push(x.semilla && semillas.length > 1 ? `[semilla ${x.semilla}] ${f}` : f);
      g.checks.set(k, cur);
    }
  }
  let ok = 0, ko = 0;
  console.log("Táper · pruebas\n");
  for (const g of grupos.values()) {
    console.log(`${g.nombre}${g.segundos.length ? ` (${semillas.length > 1 && g.nombre.startsWith("Escenario") ? "semillas " + semillas.join(", ") + " · " : ""}${Math.max(...g.segundos).toFixed(1)} s)` : ""}`);
    for (const c of g.checks.values()) {
      if (c.fallos.length) ko++; else ok++;
      console.log(`  ${c.fallos.length ? "✗" : "✓"} ${c.nombre}${c.fallos.length ? `  · ${c.fallos.length} ${c.fallos.length === 1 ? "fallo" : "fallos"}` : ""}`);
    }
    for (const p of g.pendientes) console.log(`  … pendiente: ${p}`);
    console.log("");
  }
  const malos = [...grupos.values()].flatMap(g => [...g.checks.values()].filter(c => c.fallos.length).map(c => ({ g: g.nombre, ...c })));
  if (malos.length) {
    console.log("Detalle de los fallos:");
    for (const c of malos) { console.log(`\n✗ ${c.nombre}  (${c.g})`); for (const f of [...new Set(c.fallos)].slice(0, verbose ? 50 : 6)) console.log("   · " + f); if (new Set(c.fallos).size > 6 && !verbose) console.log(`   · … y ${new Set(c.fallos).size - 6} más (-v para verlos todos)`) }
    console.log("");
  }
  for (const r of roto) console.log("✗ " + r);
  const total = `✓ ${ok} ${ok === 1 ? "comprobación" : "comprobaciones"} · ✗ ${ko + roto.length} ${ko + roto.length === 1 ? "fallo" : "fallos"}`;
  console.log(`${total}   (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(ko || roto.length ? 1 : 0);
})();
