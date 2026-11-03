/* Táper · casos sueltos: situaciones concretas que el mes simulado puede no pisar según el azar.
   Cada caso parte de la casa de David y Lukas (tests/casa-david.js) con el menú de noviembre hecho. */
"use strict";
const { cargarApp, informe } = require("./harness.js");
const { crearCasa, fecha, hueco, lukasEsperado, sumaDias } = require("./casa-david.js");
const T = informe("Casos sueltos");

function casa(hoy = "2026-11-01T10:00:00") {
  const app = cargarApp({ semilla: 7, hoy }); crearCasa(app); app.ev("ensureHorizon();save()");
  return app;
}
function caso(id, nombre, f) {
  T.def(id, nombre);
  try { f() } catch (e) { T.falla(id, nombre, "el caso ha lanzado un error: " + e.message + " | " + String(e.stack).split("\n").slice(1, 3).join(" | ")) }
}

/* 1. Una cena que repite el plato de la víspera ya está hecha: no hay que descongelar nada para ella */
caso("descongelar", "Avisos: no se pide descongelar para una cena que repite un plato ya cocinado", () => {
  const app = casa(), { ev } = app;
  // Viernes 13 y sábado 14: David solo (no es fin de semana de Lukas); el viernes no hay táper (el sábado se cocina)
  const rid = ev(`R.find(r=>!r.small&&!r.cap&&r.fridge>=2&&r.ing.some(([p])=>P[p].thaw)&&candidates(slotFor("2026-11-13","cena")).includes(r)).id`);
  ev(`(function(){const wk=S.plans["2026-11-09"];wk.slots["2026-11-13|cena"]={recipe:"${rid}",locked:true};wk.slots["2026-11-14|cena"]={recipe:"${rid}",rep:"2026-11-13|cena"};save()})()`);
  const valida = ev(`(function(){const s="2026-11-09",wk=S.plans[s],sl=buildSlots(s),x=sl.find(o=>o.id==="2026-11-14|cena"),keep=wk.slots[x.id];delete wk.slots[x.id];const ok=repeatOk(wk,x,"2026-11-13|cena",sl);wk.slots[x.id]=keep;return ok})()`);
  T.ok("descongelar", "Avisos: no se pide descongelar para una cena que repite un plato ya cocinado", valida, "la cena repetida de prueba no cumple las reglas de la app (repeatOk): el caso está mal planteado");
  const rx = ev(`RX["${rid}"]`), carne = ev(`RX["${rid}"].ing.filter(([p])=>P[p].thaw).map(([p])=>P[p].name).join(", ")`);
  for (const [cuando, cocinar] of [["2026-11-13T08:00:00", false], ["2026-11-13T20:45:00", true]]) {
    app.reloj(cuando);
    if (cocinar) ev(`markCooked(slotFor("2026-11-13","cena"))`);
    const malos = ev(`buildSchedule().filter(a=>a.tag==="thaw|2026-11-14|cena").map(a=>a.title+": "+a.body)`);
    T.ok("descongelar", "Avisos: no se pide descongelar para una cena que repite un plato ya cocinado", !malos.length,
      `${fecha(cuando.slice(0, 10))} ${cuando.slice(11, 16)}${cocinar ? " (ya cocinado el viernes)" : ""}: sale «${malos[0]}» para la cena del sábado 14, que repite «${rx.name}» del viernes (${carne} ya está cocinado)`);
  }
});

/* 2. Si Lukas viene la noche de una cena repetida, la repetida se quita (con niños no se repite) */
caso("repetida-lukas", "Cenas: si Lukas viene la noche de una cena repetida, deja de ser repetida al recalcular", () => {
  const app = casa(), { ev } = app;
  const rid = ev(`R.find(r=>!r.small&&!r.cap&&r.fridge>=2&&r.kid&&candidates(slotFor("2026-11-13","cena")).includes(r)).id`);
  ev(`(function(){const wk=S.plans["2026-11-09"];wk.slots["2026-11-13|cena"]={recipe:"${rid}"};wk.slots["2026-11-14|cena"]={recipe:"${rid}",rep:"2026-11-13|cena"};save()})()`);
  app.reloj("2026-11-10T09:00:00");
  ev(`(function(){const o=S.days["2026-11-14"]=S.days["2026-11-14"]||{};o.kids={k1:{comida:false,cena:true}};const st=weekStartFor("2026-11-14");save();ensureWeek(st);save()})()`);
  const v = ev(`S.plans["2026-11-09"].slots["2026-11-14|cena"]`) || {};
  T.ok("repetida-lukas", "Cenas: si Lukas viene la noche de una cena repetida, deja de ser repetida al recalcular", !v.rep && v.recipe !== rid,
    `sáb 14/11 cena con Lukas: sigue ${v.rep ? "repitiendo" : "con"} «${ev(`RX["${v.recipe}"]&&RX["${v.recipe}"].name`)}» del viernes`);
  T.ok("repetida-lukas", "Cenas: si Lukas viene la noche de una cena repetida, deja de ser repetida al recalcular", ev(`slotFor("2026-11-14","cena").kids.length`) === 1, "la cena del sábado 14 no cuenta a Lukas");
});

/* 3. El mismo ticket dos veces no cuenta dos veces */
caso("ticket-doble", "Tickets: subir dos veces el mismo ticket no lo cuenta dos veces", () => {
  const app = casa("2026-11-03T18:00:00"), { ev } = app;
  const tk = { date: "2026-11-03", total: 12.5, super: "mercadona", fact: "2345-012-555555", lines: [{ qty: 1, desc: "LECHE", amount: 5.5, food: true, pid: "leche" }, { qty: 1, desc: "HUEVOS", amount: 7, food: true, pid: "huevos" }] };
  app.ctx.__tk = tk;
  ev(`saveTicket(JSON.parse(JSON.stringify(__tk)),"2026-11-03",{m:"2026-11",key:"0"})`);
  const p1 = ev(`paidOf("2026-11").total`);
  ev(`saveTicket(JSON.parse(JSON.stringify(__tk)),"2026-11-03",{m:"2026-11",key:"0"})`);
  T.ok("ticket-doble", "Tickets: subir dos veces el mismo ticket no lo cuenta dos veces", ev("S.tickets.length") === 1 && ev(`paidOf("2026-11").total`) === p1 && p1 === 12.5,
    `tras subirlo dos veces: ${ev("S.tickets.length")} tickets, pagado ${ev(`paidOf("2026-11").total`)} (una vez: ${p1})`);
});

/* 4. «Guardarlo así» dos veces no duplica las bolsas del pedido */
caso("pedido-doble", "Pedido: guardarlo dos veces no duplica las bolsas ni lo que hay en casa", () => {
  const app = casa(), { ev } = app;
  app.reloj("2026-11-03T10:00:00");
  ev(`S.pedido={"2026-11":{entrega:"2026-11-03",estado:"llegado",at:"2026-11-01"}};save()`);
  ev(`__p=shopping("2026-11").lists.mes.items.filter(it=>pedBagged(it.pid)).map(it=>pedBagPlan("2026-11",it));storePedido("2026-11",__p)`);
  const n1 = ev("S.bolsas.length"), st1 = JSON.stringify(ev("despensaState().stock"));
  ev(`storePedido("2026-11",__p)`);
  T.ok("pedido-doble", "Pedido: guardarlo dos veces no duplica las bolsas ni lo que hay en casa", n1 > 0 && ev("S.bolsas.length") === n1 && JSON.stringify(ev("despensaState().stock")) === st1,
    `bolsas: ${n1} y luego ${ev("S.bolsas.length")}`);
});

/* 5. Festivo entre semana (martes 8 de diciembre): Lukas no tiene cole y come en casa; esa comida se cocina */
caso("festivo", "Festivos: el martes 8 de diciembre Lukas come en casa y la comida se cocina", () => {
  const app = casa("2026-11-24T17:00:00"), { ev } = app;
  ev(`ensureHorizon();genWeekFromScratch("2026-12-07");save()`);
  const esta = ev(`peopleAt("2026-12-08","comida").some(p=>p.id==="k1")`), st = ev(`mealState("2026-12-08","comida")`), sl = ev(`slotFor("2026-12-08","comida")`);
  T.ok("festivo", "Festivos: el martes 8 de diciembre Lukas come en casa y la comida se cocina", esta === lukasEsperado(app, "2026-12-08", "comida") && esta && st === "cocinar" && sl && sl.kids.length === 1,
    `mar 8/12 comida: Lukas ${esta ? "está" : "no está"}, la comida es «${st}»`);
  // La víspera ya no deja táper (al día siguiente se cocina)
  T.ok("festivo", "Festivos: el martes 8 de diciembre Lukas come en casa y la comida se cocina", ev(`slotFor("2026-12-07","cena").tupper.length`) === 0, "la cena del lunes 7 sigue dejando táper para un día que se cocina");
});

/* 6. Sobras: un plato de 1 día de nevera con raciones de más caduca al día siguiente */
caso("sobras", "Sobras: un plato de 1 día cocinado con raciones de más se avisa y caduca a su día", () => {
  const app = casa(), { ev } = app;
  app.reloj("2026-11-05T20:30:00");
  const rid = ev(`R.find(r=>!r.small&&!r.cap&&r.fridge===1&&candidates(slotFor("2026-11-05","cena")).includes(r)).id`);
  ev(`S.plans["2026-11-02"].slots["2026-11-05|cena"]={recipe:"${rid}",locked:true,manual:true};save();const x=slotFor("2026-11-05","cena");markCooked(x,cookPortions(x)+2)`);
  const ver = d => { app.reloj(d + "T22:00:00"); const x = ev(`cookedLeftovers().find(y=>y.key==="2026-11-05|cena")`); return x ? { ...x, w: ev(`leftoverWhen(cookedLeftovers().find(y=>y.key==="2026-11-05|cena"))`) } : null };
  const j = ver("2026-11-05"), v = ver("2026-11-06"), s = ver("2026-11-07");
  T.ok("sobras", "Sobras: un plato de 1 día cocinado con raciones de más se avisa y caduca a su día", j && j.expires === "2026-11-06" && v && v.w.cls === "warn" && s && s.w.cls === "bad",
    `jueves: ${j && j.portions + " rac, caduca " + j.expires} · viernes: ${v && v.w.txt} · sábado: ${s && s.w.txt}`);
  T.ok("sobras", "Sobras: un plato de 1 día cocinado con raciones de más se avisa y caduca a su día", v && Math.abs(v.portions - 2) < 0.01, `el viernes (comido ya el táper) quedan ${v && v.portions} raciones y deberían quedar 2`);
});

/* 7. Antes de la primera compra (lunes 2; el fresco y el pedido llegan el martes 3): ni un plato con cosas que no hay,
      ni postre; si apuntas lo que tienes en casa, sale un plato con eso */
caso("primer-dia", "Primer día: antes de la primera compra, «Aún no has comprado: usa lo que tengas» o un plato con lo que hay en casa", () => {
  const N = "Primer día: antes de la primera compra, «Aún no has comprado: usa lo que tengas» o un plato con lo que hay en casa";
  const app = casa(), { ev } = app, id = "2026-11-02|cena";
  const v0 = ev(`S.plans["2026-11-02"].slots["${id}"]`) || {};
  T.ok("primer-dia", N, ev(`casaSlot(S.plans["2026-11-02"].slots["${id}"])`), `lun 2/11 cena, sin nada en casa: ${v0.recipe ? "«" + ev(`RX["${v0.recipe}"].name`) + "»" : JSON.stringify(v0)}`);
  T.ok("primer-dia", N, !ev(`monthUses("2026-11").some(u=>u.date==="2026-11-02"&&u.pid)`), "la compra pide cosas para el lunes 2, que llegan el martes 3");
  // Apunta en «En casa › Añadir» lo que lleva un plato que encaja (con un poco de margen)
  const rid = ev(`(function(){const sl=slotFor("2026-11-02","cena"),wk=S.plans["2026-11-02"],ss=buildSlots("2026-11-02");return candidates(sl).filter(r=>r.kid&&!kidClash(wk,ss,sl,r.id))[0].id})()`);
  app.reloj("2026-11-01T18:00:00");
  ev(`(function(){const sl=slotFor("2026-11-02","cena");for(const [pid,q] of slotIng(RX["${rid}"],sl))despensaData().adj.push(newAdj(pid,q*1.2+P[pid].env*0));save();ensureWeek("2026-11-02");save()})()`);
  const v = ev(`S.plans["2026-11-02"].slots["${id}"]`) || {}, miss = ev(`(function(){const sl=slotFor("2026-11-02","cena"),v=S.plans["2026-11-02"].slots["${id}"];return RX[v.recipe]?missingFor(RX[v.recipe],sl,homeInv(sl)||{}):["(sin receta)"]})()`);
  T.ok("primer-dia", N, v.recipe && !miss.length, () => `tras apuntar lo que hay en casa, lun 2/11 cena: ${v.recipe ? "«" + ev(`RX["${v.recipe}"].name`) + "», falta " + miss.join(", ") : "sigue sin plato"}`);
});

/* 8. Lo ya comprado no se rehace: «Rehacer esta semana», rehacerla entera, el menú del comedor; y si lo cambias tú, lo que falta va a la compra */
caso("comprado", "Días ya comprados: no se rehacen y, si cambias uno a mano, lo que falta va a la próxima compra y se dice", () => {
  const N = "Días ya comprados: no se rehacen y, si cambias uno a mano, lo que falta va a la próxima compra y se dice";
  const app = casa(), { ev } = app;
  app.reloj("2026-11-03T09:00:00");
  ev(`markShopDone("2026-11","mes");markShopDone("2026-11","0")`);
  app.reloj("2026-11-04T09:00:00");
  T.ok("comprado", N, ev("boughtUntil()") === "2026-11-09", `el martes 3 se compró lo de hasta el lunes 9 y boughtUntil dice ${ev("boughtUntil()")}`);
  const foto = () => JSON.stringify(Object.entries(ev(`S.plans["2026-11-02"].slots`)).filter(([k]) => k >= "2026-11-04").sort());
  const antes = foto(), l9 = ev(`S.plans["2026-11-09"].slots["2026-11-09|cena"]`).recipe;
  ev(`genWeekFromScratch("2026-11-02");ensureWeek("2026-11-02",true);genWeekFromScratch("2026-11-09");save()`);
  T.ok("comprado", N, foto() === antes && ev(`S.plans["2026-11-09"].slots["2026-11-09|cena"]`).recipe === l9, "rehacer la semana cambia platos de días ya comprados (4 al 9)");
  // El comedor dice que el lunes 9 comió lo mismo que su cena (ya comprada): no se cambia
  ev(`(function(){const t=recipeTypes(RX["${l9}"]);S.comedor={k1:{"2026-11-09":{txt:"prueba",tipos:t}}};save();comedorReplan(["2026-11-09"])})()`);
  T.ok("comprado", N, ev(`S.plans["2026-11-09"].slots["2026-11-09|cena"]`).recipe === l9, "el menú del comedor cambia la cena del lunes 9, ya comprada");
  // Cambiar plato el jueves 5: primero lo que sale de casa; si eliges uno al que le falta algo, va a la próxima compra (la del martes 10)
  const alt = ev(`alternatives(slotFor("2026-11-05","cena"),40).map(a=>a.miss?a.miss.length:-1)`);
  T.ok("comprado", N, alt.every((n, i) => !i || n >= alt[i - 1]), `las alternativas de un día ya comprado no van primero las que salen de casa: ${alt.join(",")}`);
  const r = ev(`(function(){const sl=slotFor("2026-11-05","cena"),inv=homeInv(sl)||{},wk=S.plans["2026-11-02"],ss=buildSlots("2026-11-02"),x=candidates(sl).find(r=>!kidClash(wk,ss,sl,r.id)&&missingFor(r,sl,inv).length),a=x&&{r:x,miss:missingFor(x,sl,inv)};if(!a)return null;const add=setSlotRecipe(sl,a.r.id);return {rid:a.r.id,add,miss:a.miss,xb:(S.extraBuy||{})["2026-11"]||{}}})()`);
  T.ok("comprado", N, r && r.add.length && r.miss.every(p => (r.xb["1"] || {})[p] > 0), () => `cambiar a mano la cena del jueves 5 por uno al que le falta algo: añadido ${JSON.stringify(r && r.add)}, en la compra del martes 10: ${JSON.stringify(r && r.xb)}`);
});

/* 9. Sobras con «Cambiar plato › Con sobras»: el domingo sobra y el lunes se come; no se compra otra vez, no se ofrece pasado y se gasta */
caso("con-sobras", "Sobras: «Con sobras» se queda en el menú, no se compra otra vez, se gasta al comerla y no se ofrece pasada", () => {
  const N = "Sobras: «Con sobras» se queda en el menú, no se compra otra vez, se gasta al comerla y no se ofrece pasada";
  const app = casa(), { ev } = app, coc = "2026-11-08|cena", sid = "2026-11-09|cena";
  app.reloj("2026-11-08T20:30:00");
  const rid = ev(`R.find(r=>!r.small&&!r.cap&&r.fridge>=3&&r.kid&&candidates(slotFor("2026-11-08","cena")).includes(r)&&candidates(slotFor("2026-11-09","cena")).includes(r)).id`);
  ev(`S.plans["2026-11-02"].slots["${coc}"]={recipe:"${rid}",locked:true,manual:true};save();const x=slotFor("2026-11-08","cena");markCooked(x,cookPortions(x)+3)`);
  app.reloj("2026-11-09T09:00:00");
  // Lo que ofrece «Con sobras» (openSwap) y lo que hace al tocarlo
  // (lo que ya tiene comida prevista, el táper de hoy, no se ofrece: free)
  const of = ev(`cookedLeftovers().filter(x=>x.free>=0.25&&x.expires>="2026-11-09"&&x.key!=="${sid}").map(x=>x.key)`);
  const p0 = ev(`(cookedLeftovers().find(x=>x.key==="${coc}")||{}).free`) || 0;
  T.ok("con-sobras", N, of.includes(coc), `el lunes 9, «Con sobras» no ofrece lo que sobró el domingo: ${of.join(", ")}`);
  ev(`(function(){const x=cookedLeftovers().find(y=>y.key==="${coc}"),wk=S.plans["2026-11-09"];wk.slots["${sid}"]={recipe:x.rid,rep:x.key,sobra:true,locked:true,manual:true};save();
    ensureHorizon();for(const s of Object.keys(S.plans))if(addDays(s,6)>=todayISO())ensureWeek(s);save();safetyAll()})()`);
  const v = ev(`S.plans["2026-11-09"].slots["${sid}"]`) || {};
  T.ok("con-sobras", N, v.sobra && v.rep === coc && v.recipe === rid, () => `tras recalcular, la cena del lunes 9 ya no son las sobras: ${JSON.stringify(v)}`);
  T.ok("con-sobras", N, !ev(`monthUses("2026-11").some(u=>u.slot&&u.slot.id==="${sid}")`), "la compra vuelve a pedir lo de las sobras del lunes 9");
  const pl = ev(`slotFor("2026-11-09","cena").portions`);
  T.ok("con-sobras", N, ev(`(cookedLeftovers().find(x=>x.key==="${coc}")||{}).free`) < 0.25 || p0 - pl > 0.24, "con las sobras ya puestas para el lunes, «Con sobras» las sigue ofreciendo enteras");
  app.reloj("2026-11-09T23:00:00");
  const x1 = ev(`cookedLeftovers().find(x=>x.key==="${coc}")`), p1 = x1 ? x1.portions : 0;
  T.ok("con-sobras", N, Math.abs(Math.max(0, p0 - pl) - p1) < 0.26, `comido el táper y cenadas las sobras (${pl} raciones) quedan ${p1} de ${p0} libres`);
  // Pasada la fecha, no se ofrece
  app.reloj(`2026-11-${String(8 + ev(`RX["${rid}"].fridge`) + 1).padStart(2, "0")}T09:00:00`);
  const d = app.ahora().slice(0, 10), of2 = ev(`cookedLeftovers().filter(x=>x.free>=0.25&&x.expires>="${d}").map(x=>x.key)`);
  T.ok("con-sobras", N, !of2.includes(coc), `el ${fecha(d)}, ya caducado, «Con sobras» sigue ofreciendo lo del domingo 8`);
});

/* 10. Alguien que «está siempre» (la abuela, que come lo del táper en casa): en cada comida y en las raciones */
caso("siempre", "Familia: alguien que está siempre come en cada comida y cuenta en las raciones", () => {
  const N = "Familia: alguien que está siempre come en cada comida y cuenta en las raciones";
  const app = casa(), { ev } = app;
  ev(`(function(){S.people.push({...defaultAdult(),id:"a2",name:"Abuela",ageRange:"65+",age:ageOf("65+"),tupper:true,presence:{type:"siempre"},mealsSet:true});save();
    for(const s of Object.keys(S.plans))genWeekFromScratch(s);save()})()`);
  let n = 0;
  for (let d = "2026-11-02"; d <= "2026-11-30"; d = sumaDias(d, 1)) for (const meal of ["comida", "cena"]) {
    const esta = ev(`peopleAt("${d}","${meal}").some(p=>p.id==="a2")`); n++;
    T.ok("siempre", N, esta, `${fecha(d)} ${meal}: la abuela no está`);
    const st = ev(`mealState("${d}","${meal}")`);
    if (st === "cocinar") { const sl = ev(`slotFor("${d}","${meal}")`), f = ev(`(function(){const sl=slotFor("${d}","${meal}");return Math.round((sl.eaters.concat(sl.tupper).reduce((t,a)=>t+adultFactor(a,sl),0)+sl.kids.reduce((t,k)=>t+kidFactor(k,sl),0)+sl.guests)*100)/100})()`);
      T.ok("siempre", N, sl && sl.eaters.some(p => p.id === "a2") && Math.abs(sl.portions - f) < 0.01 && sl.portions >= ev(`adultFactor(S.people.find(p=>p.id==="a2"),slotFor("${d}","${meal}"))`) + 1 - 0.01, () => `${fecha(d)} ${meal}: la abuela no cuenta en las raciones (${sl && sl.portions})`) }
    if (st === "taper") { const prev = ev(`slotFor(addDays("${d}",-1),"cena")`);
      if (prev) T.ok("siempre", N, prev.tupper.some(p => p.id === "a2"), () => `${fecha(d)} comida de táper: la cena de la víspera no hace táper para la abuela`) }
  }
  T.ok("siempre", N, n === 58, `se han mirado ${n} comidas`);
});

/* 11. Cambios de un día por comidas: S.days[d].kids[id] = {comida, cena} */
caso("dia-comidas", "Cambios de un día: solo a comer o solo a cenar se respeta en quién come y en las raciones", () => {
  const N = "Cambios de un día: solo a comer o solo a cenar se respeta en quién come y en las raciones";
  const app = casa(), { ev } = app;
  const cambia = (d, o) => ev(`(function(){const x=S.days["${d}"]=S.days["${d}"]||{};x.kids=x.kids||{};x.kids.k1=${JSON.stringify(o)};const st=weekStartFor("${d}");save();ensureWeek(st);save()})()`);
  for (const [d, o] of [["2026-11-07", { comida: true, cena: false }], ["2026-11-12", { comida: false, cena: true }], ["2026-11-14", { comida: true, cena: false }]]) {
    cambia(d, o);
    for (const meal of ["comida", "cena"]) {
      const esta = ev(`peopleAt("${d}","${meal}").some(p=>p.id==="k1")`), esp = lukasEsperado(app, d, meal);
      T.ok("dia-comidas", N, esta === esp && esp === o[meal], `${fecha(d)} ${meal}: Lukas ${esta ? "está" : "no está"} (puesto ${o[meal] ? "sí" : "no"})`);
      if (ev(`mealState("${d}","${meal}")`) === "cocinar") { const sl = ev(`slotFor("${d}","${meal}")`), dav = ev(`adultFactor(me(),slotFor("${d}","${meal}"))`);
        T.ok("dia-comidas", N, sl.kids.some(k => k.id === "k1") === o[meal] && (o[meal] ? sl.portions > dav + sl.tupper.length * 0 + 0.01 : true), () => `${fecha(d)} ${meal}: el hueco ${sl.kids.length ? "cuenta" : "no cuenta"} a Lukas (${sl.portions} raciones)`) }
    }
  }
});

T.fin();
