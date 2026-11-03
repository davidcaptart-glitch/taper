/* Táper · la casa de David y Lukas (la usan el escenario del mes y los casos sueltos) y fechas calculadas aparte */
"use strict";

/* ---------- Fechas (cálculo propio, independiente de la app) ---------- */
const P2 = n => String(n).padStart(2, "0");
const dISO = t => { const d = new Date(t); return `${d.getUTCFullYear()}-${P2(d.getUTCMonth() + 1)}-${P2(d.getUTCDate())}` };
const utc = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const sumaDias = (s, n) => dISO(utc(s) + n * 864e5);
const entre = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
const dds = s => (new Date(utc(s)).getUTCDay() + 6) % 7;   // 0 lunes … 6 domingo
const lunes = s => sumaDias(s, -dds(s));
const DN = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const fecha = s => `${DN[dds(s)]} ${+s.slice(8)}/${+s.slice(5, 7)}`;
const hueco = id => `${fecha(id.slice(0, 10))} ${id.slice(11)}`;

/* ---------- La casa (como la deja el alta: js/base.js y js/bienvenida.js) ---------- */
function crearCasa(app) {
  app.ev(`(function(){
    const s=defaultState();
    s.onboarded=true;s.seenVersion=APP_VERSION;s.uid="U-PRUEBA";
    Object.assign(s.home,{super:"mercadona",supers:["mercadona"],cp:"08784",municipio:"Piera",cookMode:"diario",buyMode:"mes",
      weekTpl:[0,1,2,3,4,5,6].map(i=>i<5?{comida:"taper",cena:"cocinar"}:{comida:"cocinar",cena:"cocinar"}),
      repeatMeals:{cena:{days:2,who:"sin"}},budgetConfirmed:true,maxDiff:"moderada"});
    s.home.budget.month=300;s.home.budget.week=null;
    s.home.shop={monthMode:"online",weekMode:"online",delivery:1};
    const yo=s.people[0];Object.assign(yo,{name:"David",ageRange:"31-50",goals:["sano"],trains:true,sports:["fuerza"],
      train:{0:[{time:"19:00",type:"fuerza"}],2:[{time:"19:00",type:"fuerza"}]},mealsSet:true});
    s.people.push({...defaultAdult(),id:"k1",name:"Lukas",kind:"nino",ageRange:"6-9",age:ageOf("6-9"),factor:factorForAge(ageOf("6-9")),goals:["sano"],tupper:false,
      presence:{type:"dias",days:[0,1],findes:true,anchor:"2026-11-06",arrive:"cena",leave:"cena"},away:{comida:[0,1,2,3,4],cena:[]},mealsSet:true});
    S=mergeState(s);
    setPlanStart("2026-11-02",null);
    // Los miércoles, solo a cenar (como lo pone «Tu semana normal»: el día en sus días fijos y la comida, fuera)
    setKidMeals(S.people.find(p=>p.id==="k1"),2,"cena");
    // Semanas que se dan por planificadas al darse de alta (avisos.js)
    S.obWeeks=["2026-11-02"];
    // Avisos: todos los tipos encendidos (el peor caso para el máximo de 5 al día)
    S.notif={on:true,v2:true,types:Object.fromEntries(Object.keys(NOTIF_TYPES).map(k=>[k,true]))};
    save();
  })()`);
  app.ponPrecios();
}

/* ---------- Presencia de Lukas, calculada aparte (no con la app) ---------- */
const festivo = (FEST, d) => (FEST.cataluna[d.slice(0, 4)] || []).includes(d) || ((FEST.locales.Piera || {})[d.slice(0, 4)] || []).includes(d);
function lukasEsperado(app, d, meal) {
  const o = (((app.ev("S.days") || {})[d] || {}).kids || {}).k1;
  const cole = meal === "comida" && dds(d) <= 4 && !festivo(app.ctx.__datos.fest, d);
  if (o != null) {
    if (typeof o === "object") { if (o[meal] != null) return !!o[meal] }
    else return o ? !cole : false;
  }
  const w = dds(d);
  if (w === 2) return meal === "cena";                       // miércoles: solo a cenar
  if (w === 0 || w === 1) return !cole;                       // lunes y martes: cena (la comida, en el cole)
  const off = ((entre("2026-11-06", d) % 14) + 14) % 14;      // fines de semana alternos desde el viernes 6
  if (off >= 3) return false;
  if (off === 0) return meal === "cena" && !cole;             // el viernes llega a cenar
  return true;                                                // sábado y domingo, todo (se va después de cenar)
}

module.exports = { P2, dISO, utc, sumaDias, entre, dds, lunes, DN, fecha, hueco, crearCasa, festivo, lukasEsperado };
