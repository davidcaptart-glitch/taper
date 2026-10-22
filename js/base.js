/* Táper · base: utilidades, estado guardado en el móvil, migración y copia de seguridad */
"use strict";

// Versión de la app: súbela (y el ?v= de index.html y VERSION de sw.js) en cada mejora, y añade sus novedades a data/novedades.json
const APP_VERSION = 48;

/* ---------- Utilidades ---------- */
const DAYS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];   // índice 0 = lunes
const DSHORT = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const APP = {air:"Air fryer",horno:"Horno",vitro:"Vitro o fogones",micro:"Microondas",ninguno:"Sin cocinar"};
const GROUP = {carne:"Carne",pescado:"Pescado",legumbre:"Legumbre",huevo:"Huevo",vegetal:"Vegetal"};
// Deportes: resistencia (piden más hidratos), fuerza (más proteína), mixtos (las dos cosas) y suaves
const SPORTS = {
  fuerza:"Fuerza o gimnasio",calistenia:"Calistenia",escalada:"Escalada",
  crossfit:"CrossFit",hiit:"HIIT o funcional",boxeo:"Boxeo",artes:"Artes marciales",
  correr:"Correr",bici:"Bici",spinning:"Spinning",natacion:"Natación",montana:"Senderismo o montaña",triatlon:"Triatlón",remo:"Remo",
  futbol:"Fútbol",baloncesto:"Baloncesto",padel:"Pádel",tenis:"Tenis",equipo:"Otro deporte de equipo",baile:"Baile",
  yoga:"Yoga",pilates:"Pilates",gimnasia:"Gimnasia",patinaje:"Patinaje",atletismo:"Atletismo",otro:"Otro"
};
// Los deportes más habituales en niños (se enseñan primero en su pantalla)
const KID_SPORTS = ["futbol","baloncesto","natacion","artes","baile","gimnasia","patinaje","atletismo","tenis","padel","equipo","bici","otro"];
const SPORT_GROUPS = {"Fuerza":["fuerza","calistenia","escalada"],"Mixtos":["crossfit","hiit","boxeo","artes"],
  "Resistencia":["correr","bici","spinning","natacion","montana","triatlon","remo"],"Equipo y raqueta":["futbol","baloncesto","padel","tenis","equipo","baile"],"Suaves":["yoga","pilates","otro"]};
const ENDURANCE = new Set(["gimnasia","patinaje","atletismo","correr","bici","spinning","natacion","montana","triatlon","remo","futbol","baloncesto","padel","tenis","equipo","baile","crossfit","hiit","boxeo","artes"]);
const STRENGTH = new Set(["fuerza","calistenia","escalada","crossfit","hiit","boxeo","artes"]);
const GOALS = {
  rendimiento:["Rendimiento deportivo","Hidratos antes de entrenar y recuperación después"],
  musculo:["Ganar músculo","Más proteína y raciones algo mayores"],
  adelgazar:["Adelgazar","Cenas ligeras, más verdura y raciones ajustadas"],
  sano:["Comer sano y equilibrado","Legumbre, pescado y verdura cada semana"],
  ahorrar:["Ahorrar","Recetas baratas y aprovechar ingredientes"],
  rapido:["Ir rápido","Recetas de menos de 20 minutos"]
};
const REPEAT = {no:["No repetir","Variedad máxima"],semanas:["Repetir entre semanas","Algún plato de las semanas anteriores"],semana:["Repetir también en la misma semana","El mismo plato dos veces y platos que comparten ingredientes"]};
const SACRIFICES = {
  proteina:["Menos pescado y carne","Más legumbre y huevo, que son más baratos"],
  raciones:["Raciones algo más ajustadas","Un 10 % menos en las raciones de los adultos"],
  gustos:["Dar menos peso a los gustos","Sigue sin poner lo que no os gusta, pero no busca tanto lo favorito"]
};
// Los 14 alérgenos de declaración obligatoria en la UE
const ALLERGENS = {gluten:"Gluten",lacteos:"Lácteos y lactosa",huevo:"Huevo",pescado:"Pescado",crustaceos:"Crustáceos (gambas, langostinos)",
  moluscos:"Moluscos (calamar, sepia)",frutos_cascara:"Frutos de cáscara",cacahuete:"Cacahuete",soja:"Soja",sesamo:"Sésamo",
  apio:"Apio",mostaza:"Mostaza",sulfitos:"Sulfitos",altramuces:"Altramuces"};
const ALLERGEN_ICO = {gluten:"🌾",lacteos:"🥛",huevo:"🥚",pescado:"🐟",crustaceos:"🦐",moluscos:"🦑",frutos_cascara:"🌰",cacahuete:"🥜",soja:"🫘",sesamo:"🌱",apio:"🥬",mostaza:"🫙",sulfitos:"🍷",altramuces:"🌼"};
const WT_ICO = {cocinar:"🍳",taper:"🥡",fuera:"🍴",libre:"–"};
const MEALSTATE = {cocinar:"Cocino",taper:"Táper",fuera:"Fuera",libre:"Libre"};
const EXTRA_MEALS = {desayuno:"Desayuno",mediamanana:"Media mañana",merienda:"Merienda",pre:"Antes de entrenar",post:"Después de entrenar",recena:"Recena"};

function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function parseISO(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)}
function addDays(s,n){const d=parseISO(s);d.setDate(d.getDate()+n);return iso(d)}
function dow(s){return (parseISO(s).getDay()+6)%7}                 // 0 = lunes … 6 = domingo
function mondayOf(s){return addDays(s,-dow(s))}
function daysBetween(a,b){return Math.round((parseISO(b)-parseISO(a))/864e5)}
const todayISO=()=>iso(new Date());
const eur=n=>(Number(n)||0).toLocaleString("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:Math.abs(n)>=100?0:2});
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
function shortDate(s){return parseISO(s).toLocaleDateString("es-ES",{day:"numeric",month:"short"}).replace(".","")}
function longDate(s){return parseISO(s).toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"})}
function monthName(m){const [y,mm]=m.split("-").map(Number);const t=new Date(y,mm-1,1).toLocaleDateString("es-ES",{month:"long"});return t.charAt(0).toUpperCase()+t.slice(1)+" "+y}
function fmtQty(q,u){if(u==="ud")return (Math.round(q*10)/10).toString().replace(".",",")+" ud";if(q>=1000)return (Math.round(q/100)/10).toString().replace(".",",")+(u==="g"?" kg":" l");return Math.round(q)+" "+u}
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("on");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("on"),2200)}
// Ración según la edad (editable después)
function factorForAge(a){a=Number(a);if(!a)return 0.6;if(a<=5)return 0.5;if(a<=9)return 0.6;if(a<=13)return 0.75;return 1}

/* ---------- Estado ---------- */
// Semana tipo por defecto: cena cocinada de domingo a jueves (doble, para el táper), viernes y sábado libres
function defaultWeekTpl(){
  return [0,1,2,3,4,5,6].map(d=>({comida:d<=4?"taper":"libre",cena:(d<=3||d===6)?"cocinar":"libre"}));
}
function defaultAdult(name){
  return {id:"yo",name:name||"",kind:"adulto",age:null,factor:1,goals:["sano"],weight:null,trains:false,sports:[],train:{},
    presence:{type:"siempre"},tastes:{ing:{},dish:{},ignore:{},src:{}}};
}
function defaultState(){
  return {
    v:2, updatedAt:0, onboarded:false,
    home:{super:"mercadona",cp:"",municipio:"",apps:["air","horno","vitro","micro"],cookMode:"diario",cookDays:[6],weekTpl:defaultWeekTpl(),
      planFreq:"semanal",planDay:6,planTime:"17:00",
      mealTimes:{comida:"14:00",cena:"21:00"},extraMeals:{},
      shop:{monthMode:"online",weekMode:"online",delivery:1},
      budget:{month:180,week:null,basics:6},festivosExtra:[]},
    people:[defaultAdult("")],
    fixed:[], plans:{}, days:{}, ratings:[], prices:{}, checks:{}, assign:{}, modes:{}, spent:{}, orders:{}, sport:{}, tickets:[], seenVersion:0, base:null
  };
}
function mergeState(o){
  const d=defaultState();
  const s={...d,...o,home:{...d.home,...(o.home||{}),mealTimes:{...d.home.mealTimes,...((o.home||{}).mealTimes||{})},shop:{...d.home.shop,...((o.home||{}).shop||{})},budget:{...d.home.budget,...((o.home||{}).budget||{})}}};
  s.people=(o.people&&o.people.length?o.people:d.people).map(p=>({...defaultAdult(),...p,tastes:{ing:{},dish:{},ignore:{},src:{},...(p.tastes||{})}}));
  return s;
}
// De la versión 1 (fase 1) se conserva lo que sigue teniendo sentido
function migrateV1(o){
  const s=defaultState(), st=o.settings||{};
  s.home.budget.month=Number(st.budget)||180; s.home.budget.basics=Number(st.basics)||6;
  if(Array.isArray(st.apps)&&st.apps.length)s.home.apps=st.apps;
  if(st.sunday===false)s.home.weekTpl[6].cena="libre";
  const me=s.people[0];
  if(Array.isArray(st.training)&&st.training.length){me.trains=true;me.sports=["calistenia","correr"];me.goals=["rendimiento","sano"];
    for(const d of st.training)me.train[d]=[{time:"08:00",type:"calistenia"}]}
  if(st.kidAnchor)s.people.push({...defaultAdult(),id:"hijo1",name:"",kind:"nino",age:null,factor:Number(st.kidFactor)||0.6,goals:["sano"],
    presence:{type:"alternas",anchor:st.kidAnchor},tastes:{ing:{},dish:{},ignore:{},src:{}}});
  for(const r of o.dislikes||[]){me.tastes.dish[r]=-1;me.tastes.src["d:"+r]="Lo marcaste antes"}
  s.prices=o.prices||{}; s.base=o.base||null;
  if(o.base&&o.base.items)s.orders={mes:{items:o.base.items,savedAt:o.base.savedAt||todayISO()}};
  s.fixed=(o.fixed||[]).map(f=>({id:f.id,recipe:f.recipe,name:f.name,cost:f.cost,dow:f.day,meal:f.meal,who:f.weeks==="hijo"?"con":f.weeks==="solo"?"sin":"todas",capricho:false}));
  return s;
}
let S=load();
function applyTheme(){const t=(S.home&&S.home.theme)||"light";if(t==="auto")delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=t;
  const m=document.querySelector('meta[name="theme-color"]');if(m)m.content=document.documentElement.dataset.theme==="dark"?"#101215":"#D22F2A"}
applyTheme();
// Código de usuario anónimo: se crea una vez por móvil (sirve para identificar sus sugerencias)
if(!S.uid){S.uid="U-"+Math.random().toString(36).slice(2,7).toUpperCase();try{localStorage.setItem("taper-v2",JSON.stringify(S))}catch(e){}}
function load(){
  try{const raw=localStorage.getItem("taper-v2");if(raw)return mergeState(JSON.parse(raw))}catch(e){}
  try{const raw=localStorage.getItem("taper-v1");if(raw)return migrateV1(JSON.parse(raw))}catch(e){}
  return defaultState();
}
function save(){
  S.updatedAt=Date.now();
  try{localStorage.setItem("taper-v2",JSON.stringify(S))}catch(e){toast("No se ha podido guardar en el móvil")}
}
const me=()=>S.people.find(p=>p.kind==="adulto");
const adults=()=>S.people.filter(p=>p.kind==="adulto");
const kids=()=>S.people.filter(p=>p.kind==="nino");
const personName=p=>p.name||(p.kind==="adulto"?"Tú":"Hijo/a");

/* ---------- Empezar de cero guardando los datos (para probar el inicio) ----------
   La copia se queda en este móvil y se puede recuperar tantas veces como se quiera. */
const SNAP_KEY="taper-guardado";
function snapshot(){try{return JSON.parse(localStorage.getItem(SNAP_KEY)||"null")}catch(e){return null}}
function startFresh(){
  try{localStorage.setItem(SNAP_KEY,JSON.stringify({at:new Date().toISOString(),nombre:me().name||"",estado:S}))}
  catch(e){toast("No he podido guardar la copia: no empiezo de cero");return false}
  const keep={uid:S.uid,notif:S.notif,installSent:S.installSent,activeWeek:S.activeWeek,visited:S.visited,ref:S.ref,trCode:S.trCode,seenVersion:S.seenVersion};
  S=mergeState({v:2,...keep});S.testFresh=true;save();return true;
}
function restoreSnapshot(){
  const s=snapshot();if(!s||!s.estado){toast("No hay ninguna copia guardada");return false}
  S=mergeState(s.estado);save();return true;
}

/* ---------- Copia de seguridad ---------- */
function exportBackup(){
  const data={app:"taper",version:2,exportado:new Date().toISOString(),estado:S,precios:PR};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="taper-copia-"+todayISO()+".json";
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast("Copia descargada");
}
function importBackup(file){
  const rd=new FileReader();
  rd.onload=()=>{
    let o;try{o=JSON.parse(rd.result)}catch(e){toast("El archivo no es una copia válida");return}
    if(!o||o.app!=="taper"||!o.estado){toast("El archivo no es una copia de Táper");return}
    const when=o.exportado?new Date(o.exportado).toLocaleDateString("es-ES",{day:"numeric",month:"long",year:"numeric"}):"fecha desconocida";
    if(!confirm("¿Sustituir todos tus datos por la copia del "+when+"? Lo que tienes ahora se perderá."))return;
    S=o.version===2||o.estado.v===2?mergeState(o.estado):migrateV1(o.estado);save();
    if(o.precios&&!PR){PR=o.precios;try{localStorage.setItem("taper-precios",JSON.stringify(PR))}catch(e){}}
    render();toast("Copia restaurada");
  };
  rd.readAsText(file);
}
