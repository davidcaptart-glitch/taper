/* Táper · avisos en el móvil (notificaciones push con el servidor de avisos)
   La app calcula sus próximos avisos de la semana y se los manda al servidor, que los envía a su hora.
   Cómo deben ser: título corto (unos 40 caracteres, lo que se ve en Android) con un solo emoji delante, una línea de
   texto, nada entre las 22:00 y las 08:00, como mucho 5 al día, nada de lo que ya está hecho y cada toque abre su pantalla. */
"use strict";

const NOTIF_TYPES={
  descongelar:["❄️ Descongelar","La noche antes, para pasar la carne o el pescado a la nevera"],
  cocinar:["🍳 Qué cocinas hoy","Antes de la comida o la cena que toca cocinar, y cuándo sacar el táper"],
  planificar:["🗓️ Planificar la semana","El día y la hora en que planificas, si aún no está hecha"],
  compra:["🛒 Compra","Cuándo hacer el pedido o ir a comprar, hasta que lo marques"],
  ticket:["📸 Ticket","Después de la compra, para subir el ticket"],
  bolsas:["🧊 Reparte y congela","Cuando llega la compra, si hay bolsas que congelar"],
  mes:["📋 Preparar el mes","Unos días antes de que empiece, con el menú y el pedido del mes"],
  resumen:["☀️ Resumen del día","Por la mañana, todo lo que se come hoy"],
  horas:["🍽️ A la hora de comer","En cada comida: qué toca y para quién"],
  valorar:["⭐ ¿Qué tal hoy?","Una vez al día, para valorar los platos"],
  entreno:["🏃 ¿Entrenaste?","Una hora después de cada entreno"],
  congelador:["🧊 Congelador","Si algo lleva más de 3 meses congelado (sábado por la mañana)"]
};
// Activados de serie: pocos y útiles. El resto, si los quieres
const NOTIF_ON=["descongelar","cocinar","planificar","compra"];
const avisosOn=()=>!!(CFG.avisos&&CFG.avisos.url&&CFG.avisos.vapidPublic&&"serviceWorker" in navigator&&"PushManager" in window);
const notifCfg=()=>{
  if(!S.notif||typeof S.notif!=="object")S.notif={on:false};
  const n=S.notif;if(!n.types||typeof n.types!=="object")n.types={};
  // Antes venía todo activado (12-18 avisos al día). Si nadie lo había tocado, se quedan los 4 de serie;
  // si se había cambiado algo, se respeta, y los nuevos (ticket, bolsas, mes) heredan de los que los incluían antes
  if(!n.v2){const old=["resumen","horas","descongelar","cocinar","valorar","entreno","planificar","compra","congelador"];
    if(old.some(k=>n.types[k]===false)){if(n.types.ticket==null)n.types.ticket=n.types.compra!==false;if(n.types.bolsas==null)n.types.bolsas=n.types.compra!==false||n.types.descongelar!==false;if(n.types.mes==null)n.types.mes=n.types.planificar!==false}
    else for(const k of Object.keys(NOTIF_TYPES))n.types[k]=NOTIF_ON.includes(k);
    n.v2=true}
  for(const k of Object.keys(NOTIF_TYPES))if(typeof n.types[k]!=="boolean")n.types[k]=NOTIF_ON.includes(k);
  if(!n.summary)n.summary="08:00";if(!n.thaw)n.thaw="21:30";
  return n};

// Fecha y hora local -> milisegundos (con el cambio de hora: setHours trabaja en la hora del móvil)
const at=(d,hhmm,addMin=0)=>{const [h,m]=String(hhmm).split(":").map(Number);const x=parseISO(d);x.setHours(h,m+addMin,0,0);return x.getTime()};
// Recorta a n letras (los emojis cuentan como una) con «…»
const cutTxt=(s,n)=>{const a=[...String(s||"")];return a.length>n?a.slice(0,n-1).join("").trimEnd()+"…":a.join("")};
// ¿Una persona o varias? («comes»/«coméis», «te»/«os»)
const plural=(uno,varios)=>((S.people||[]).length>1?varios:uno);
// Semana ya planificada: confirmada, o la que se generó al darse de alta (no tiene sentido pedir planificarla al momento)
const weekDone=s=>!!(S.plans[s]&&(S.plans[s].confirmed||(S.obWeeks||[]).includes(s)));
// Cuánto vale cada aviso (min) antes de quedarse viejo: pasado eso el móvil ya no lo enseña
const AV_VALE={eat:60,pack:45,cook:60,sess:240,day:240,thaw:720,thawt:720,rate:180,sport:720,shop:720,tk:720,plan:720,mprep:1440,frz:720,freezer:1440,fin:1440};
// Prioridad para quedarse con 5 al día (menos = más importante)
const AV_PRIO={fin:0,thaw:1,thawt:1,cook:2,sess:2,shop:3,plan:4,mprep:4,tk:5,frz:5,sport:6,eat:7,pack:7,day:8,rate:9,freezer:9};
// Lo que tiene que ser a su hora (comer, cocinar, entreno) no se mueve: si cae en horas de silencio, no se avisa
const AV_FIJO=new Set(["eat","pack","cook","sess","sport"]);
const AV_SILENCIO=[22*60,8*60],AV_MAX_DIA=5;
// Tipos que se pueden dejar para mañana: llevan su hora habitual (h) para que «⏰ Mañana» use esa y no +24 h
const AV_LATER=new Set(["plan","mprep","frz","tk","freezer","shop"]);

/* Horas de silencio, uno por etiqueta y máximo al día.
   Lo que cae entre las 22:00 y las 08:00 se adelanta a las 21:45 o se retrasa a las 08:00 (si no es de una hora fija). */
function tidySchedule(list,now=Date.now()){
  const seen=new Set(),out=[];
  for(const a0 of list.slice().sort((a,b)=>a.t-b.t)){
    const a={...a0},k=String(a.tag||"").split("|")[0],d=new Date(a.t),m=d.getHours()*60+d.getMinutes();
    if(m>=AV_SILENCIO[0]||m<AV_SILENCIO[1]){if(AV_FIJO.has(k))continue;
      const t0=a.t;if(m>=AV_SILENCIO[0])d.setHours(21,45,0,0);else d.setHours(8,0,0,0);a.t=d.getTime();a.x=Math.max(a.t+6e4,(a.x||t0)+(a.t-t0))}
    if(a.t<=now||(a.tag&&seen.has(a.tag+"@"+a.t)))continue;
    if(a.tag)seen.add(a.tag+"@"+a.t);out.push(a)}
  // Como mucho 5 por día (en la hora del móvil), quedándose con los más importantes
  const byDay={};for(const a of out){const d=new Date(a.t),k=d.getFullYear()+"-"+d.getMonth()+"-"+d.getDate();(byDay[k]=byDay[k]||[]).push(a)}
  const keep=new Set();for(const l of Object.values(byDay))l.slice().sort((a,b)=>(AV_PRIO[String(a.tag).split("|")[0]]??5)-(AV_PRIO[String(b.tag).split("|")[0]]??5)||a.t-b.t).slice(0,AV_MAX_DIA).forEach(a=>keep.add(a));
  return out.filter(a=>keep.has(a)).sort((a,b)=>a.t-b.t).slice(0,150);
}

// Los avisos de los próximos 8 días, calculados con el menú, los entrenos y los ajustes
function buildSchedule(){
  const n=notifCfg(),T=n.types,now=Date.now(),today=todayISO(),out=[];
  const push=(t,title,body,tag)=>{if(!(t>now))return;const k=String(tag).split("|")[0],a={t,x:t+(AV_VALE[k]||360)*6e4,title:cutTxt(title,40),body:cutTxt(String(body||"").replace(/\.$/,""),100),tag};
    if(AV_LATER.has(k))a.h=laterHour(k);out.push(a)};
  const cap=s=>String(s).charAt(0).toUpperCase()+String(s).slice(1);
  // Horas de las comidas pequeñas: las que haya puesto (comidas extra) o unas por defecto
  const smallTime=m=>(S.home.extraMeals||{})[m==="almuerzo"?"mediamanana":m]||{desayuno:"08:00",almuerzo:"11:00",merienda:"17:30"}[m];
  const names=ps=>{const n=ps.map(p=>isMe(p)?"ti":personName(p));return n.length>1?n.slice(0,-1).join(", ")+" y "+n.slice(-1):n[0]||""};
  for(let i=0;i<8;i++){
    const d=addDays(today,i),start=weekStartFor(d),wk=S.plans[start];
    // Resumen de la mañana: todo lo que se come hoy (sin sonido)
    if(T.resumen&&wk){const parts=[],sm=smallOf(d);
      for(const m of ["desayuno","almuerzo"])if(sm[m]&&RX[sm[m].recipe])parts.push(`${SMALL[m][0]} ${RX[sm[m].recipe].name}`);
      {const x=dishOfMeal(d,"comida");if(x.recipe)parts.push(`🍽️ ${x.recipe.name}${x.state==="taper"?" (táper)":""}`);else if(x.state==="fuera")parts.push("🍽️ fuera")}
      if(sm.merienda&&RX[sm.merienda.recipe])parts.push(`${SMALL.merienda[0]} ${RX[sm.merienda.recipe].name}`);
      {const x=dishOfMeal(d,"cena");if(x.recipe)parts.push(`🌙 ${x.recipe.name}`);else if(x.state==="fuera")parts.push("🌙 fuera")}
      if(parts.length)push(at(d,n.summary||"08:00"),`☀️ Hoy ${plural("comes","coméis")}`,parts.join(" · "),"day|"+d)}
    // Platos del día por valorar: un solo aviso al día, después de la cena (y antes de las 22:00)
    let toRate=0,lastMeal=null;
    // A la hora de cada comida pequeña
    if(wk)for(const [m,v] of Object.entries(smallOf(d))){const r=RX[v.recipe];if(!r)continue;
      const ps=smallEaters(d,m),casa=ps.filter(p=>smallState(p,m,d)==="casa"),llevar=ps.filter(p=>smallState(p,m,d)==="llevar");
      if(T.horas&&llevar.length)push(at(d,smallTime("desayuno"),-15),`🎒 Prepara el ${m} para llevar`,`${r.name} para ${names(llevar)}`,"pack|"+d+"|"+m);
      if(T.horas&&casa.length)push(at(d,smallTime(m)),`${SMALL[m][0]} ${SMALL[m][1]}: ${r.name}`,`Para ${names(casa)}`,"eat|"+d+"|"+m);
      if(ps.some(p=>!ratedBefore(p,r.id)))toRate++}
    if(wk)for(const sl of buildSlots(start)){
      if(sl.date!==d)continue;const v=wk.slots[sl.id],r=v&&RX[v.recipe];if(!r)continue;
      const mt=S.home.mealTimes[sl.meal]||(sl.meal==="cena"?"21:00":"14:00"),dayName=DAYS[dow(d)].toLowerCase();let warned=false;
      if(sl.meal==="cena"||!lastMeal)lastMeal=mt;
      if(T.descongelar&&S.home.cookMode!=="lote"&&!(S.thawChecked||{})[sl.id]){const th=r.ing.filter(([p])=>P[p].thaw).map(([p])=>P[p].name.toLowerCase());
        if(th.length)push(at(addDays(d,-1),n.thaw),"❄️ Descongela para mañana",`${cap(th.join(" y "))}, a la nevera (${sl.meal} del ${dayName})`,"thaw|"+sl.id)}
      const cooked=!!(S.cooked||{})[sl.id];
      if(v.rep&&!fromBatch(sl)){
        // Mismo plato que otro día: ya está hecho
        if(T.cocinar){push(at(d,mt,-30),"🥡 Saca el táper",`${r.name}, del ${DAYS[dow(v.rep.slice(0,10))].toLowerCase()}. Al micro y listo`,"cook|"+sl.id);warned=true}
      }else if(fromBatch(sl)){
        // Ya cocinado en la sesión: solo sacarlo (y, si va congelado, pasarlo a la nevera la noche antes)
        const k=keepPlan(r,sl);
        if(T.descongelar&&k.freeze&&!(S.thawChecked||{})[sl.id])push(at(addDays(d,-1),n.thaw),"❄️ Pasa el táper a la nevera",`${r.name}, para mañana (${sl.meal})`,"thawt|"+sl.id);
        if(T.cocinar){push(at(d,mt,-30),"🥡 Saca el táper",`${r.name}, del ${DAYS[dow(k.cook)].toLowerCase()}. Al micro y listo`,"cook|"+sl.id);warned=true}
      }else if(S.home.cookMode==="lote"){/* se avisa una vez al día de cocinar (abajo) */
      }else if(T.cocinar&&!cooked){const kids=repChildren(sl);
        push(at(d,mt,-60),`🍳 Cocina hoy: ${r.name}`,`${recipeTime(r)} min · ${String(cookPortions(sl)).replace(".",",")} raciones${sl.tupper.length?" · deja el táper de mañana":""}${kids.length?" · también para el "+kids.map(c=>DAYS[dow(c.date)].toLowerCase()).join(" y "):""}`,"cook|"+sl.id);warned=true}
      // «A comer» solo si no se ha avisado ya de ese plato (cocinar o sacar el táper dicen lo mismo)
      if(T.horas&&!warned){const who=sl.eaters.concat(sl.kids);if(who.length)push(at(d,mt),`${sl.meal==="comida"?"🍽️ A comer":"🌙 A cenar"}: ${r.name}`,`Para ${names(who)}${sl.guests?` y ${sl.guests} invitados`:""}`,"eat|"+sl.id)}
      if(sl.eaters.concat(sl.kids).some(p=>!ratedBefore(p,r.id)))toRate++;
    }
    if(T.valorar&&toRate){const t=Math.min(at(d,lastMeal||"20:30",45),at(d,"21:45"));
      push(t,"⭐ ¿Qué tal hoy?",`Valora ${toRate} ${toRate===1?"plato":"platos"} en 10 segundos`,"rate|"+d)}
    // Por lotes: el día de cocinar, un solo aviso con cuántos platos y para cuántos días
    if(T.cocinar&&S.home.cookMode==="lote"&&S.home.cookDays.includes(dow(d))){
      const pl=[weekStartFor(d),addDays(weekStartFor(d),7)].flatMap(s=>S.plans[s]?buildSlots(s).filter(x=>cookDayFor(x.date)===d&&S.plans[s].slots[x.id]&&!(S.cooked||{})[x.id]):[]),cv=batchCovers(d);
      if(pl.length)push(at(d,"10:30"),`🍳 Hoy toca cocinar: ${pl.length} ${pl.length===1?"plato":"platos"}`,`Para ${cv.days} ${cv.days===1?"día":"días"}. Abre la sesión y te digo cómo repartirlo`,"sess|"+d)}
    if(T.entreno)plannedSessions(d).forEach((s,j)=>(((S.sport||{})[d]||{}).res||{})[j]||push(at(d,sessTime(s),60),`🏃 ¿Hiciste ${(SPORTS[s.type]||s.type).toLowerCase()}?`,"Si no, recalculo lo que te conviene comer","sport|"+d+"|"+j));
    {const [y,mm]=d.split("-").map(Number),nx=mm===12?`${y+1}-01`:`${y}-${String(mm+1).padStart(2,"0")}`;
      if(T.mes&&d===monthPrepDate(d.slice(0,7))&&!((S.monthPrep||{})[nx]||{}).done){const nm=new Date(nx+"-01T12:00").toLocaleDateString("es-ES",{month:"long"});
        push(at(d,S.home.planTime),`📋 Prepara ${nm}`,"5 preguntas y te dejo el menú y el pedido del mes","mprep|"+nx)}}
    // Planificar: la semana que viene (o esta, si aún no está); nada si ya están planificadas
    if(T.planificar&&dow(d)===S.home.planDay){const st=weekStartFor(d),s=[addDays(st,7),st].find(w=>!weekDone(w)&&!(S.home.start&&addDays(w,6)<S.home.start));
      if(s)push(at(d,S.home.planTime),`🗓️ Planifica la semana del ${Number(s.slice(8))}`,"5 minutos: quién está, entrenos y platos","plan|"+s)}
    if(T.congelador&&dow(d)===5){try{const old=freezerState().filter(e=>e.days>FREEZER_MONTHS*30);
      if(old.length)push(at(d,"11:00"),"🧊 Gasta esto pronto",`Lleva más de 3 meses congelado: ${old.map(e=>P[e.pid].name.toLowerCase()).join(", ")}`,"freezer|"+d)}catch(e){}}
  }
  if(T.bolsas){try{
    for(const m of [today.slice(0,7),nextMonthOf(today.slice(0,7))]){const sh=shopping(m);
      for(const key of Object.keys(sh.bags||{})){const pend=bagsPending(sh,key);if(!pend.length)continue;
        const ws=sh.weeks[key==="mes"?mesWeek(sh.weeks):Number(key)];if(!ws)continue;const day=deliveryDate(ws);
        for(let i=0;i<2;i++)push(at(addDays(day,i),"20:00"),`🧊 Congela ${pend.length} ${pend.length===1?"bolsa":"bolsas"}`,`Una por plato con su día: ${[...new Set(pend.map(b=>P[b.pid].name.toLowerCase()))].slice(0,3).join(", ")}`,"frz|"+m+"|"+key)}}
  }catch(e){}}
  if(T.ticket){try{
    // Ticket: la noche del día de la compra y la mañana siguiente, si no se ha subido
    for(const m of [today.slice(0,7),nextMonthOf(today.slice(0,7))]){const sh=shopping(m);
      for(const l of Object.values(sh.lists)){if(!l.items.length)continue;const ws=sh.weeks[l.key==="mes"?mesWeek(sh.weeks):Number(l.key)];if(!ws)continue;
        const day=deliveryDate(ws),k=shopKey(m,l.key);
        if((S.tickets||[]).some(t=>t.m===m&&t.list===l.key)||(S.ticketSkip||{})[k])continue;
        push(at(day,"21:00"),"📸 Sube el ticket","Una foto y ganas 3 coins","tk|"+k);
        push(at(addDays(day,1),"10:00"),"📸 Te queda subir el ticket","Una foto, captura o PDF y ganas 3 coins","tk|"+k)}}
  }catch(e){}}
  if(T.compra){try{
    for(const r of shopReminders()){
      const snooze=((S.shopSnooze||{})[shopKey(r.m,r.key)])||"";
      for(let i=0;i<4;i++){const d=addDays(r.due>today?r.due:today,i);if(d<snooze)continue;
        push(at(d,r.online?"19:30":"09:30"),r.title,i?"¿Ya está? Márcalo como hecho · "+r.body:r.body,"shop|"+r.m+"|"+r.key)}
    }}catch(e){}}
  // Lo dejado para mañana: se avisa a esa hora (si sigue pendiente) y el aviso normal no se repite antes
  for(const [tag,x] of Object.entries(S.later||{})){
    if(!x||x.t<now-864e5||!laterPending(tag)){delete S.later[tag];continue}
    if(x.t<=now)continue;
    for(let i=out.length-1;i>=0;i--)if(out[i].tag===tag&&out[i].t<x.t+36e5)out.splice(i,1);
    const k=tag.split("|")[0];
    out.push({t:x.t,x:x.t+(AV_VALE[k]||720)*6e4,title:cutTxt(x.title,40),body:cutTxt(String(x.body||"").replace(/ Puedes quitarlo en Perfil › Avisos\.?$/,""),100),tag,...(AV_LATER.has(k)?{h:laterHour(k)}:{})});
  }
  // El servidor solo tiene 8 días de avisos: si no abres Táper en una semana, te lo dice antes de que se acaben
  if(out.length)push(at(addDays(today,7),"12:00"),"📲 Abre Táper","Abre Táper para seguir recibiendo avisos","fin|"+today);
  return tidySchedule(out,now);
}

/* ---------- «Mañana»: avisos que son una tarea y se pueden dejar para el día siguiente ----------
   S.later[tag]={t,title,body}: se vuelve a avisar a esa hora si la tarea sigue pendiente */
function laterPending(tag){try{const [k,a,b]=tag.split("|");
  if(k==="plan"){if(a&&S.plans[a])return !weekDone(a);const st=weekStartFor(todayISO());return [st,addDays(st,7)].some(s=>!weekDone(s))}
  if(k==="mprep")return !((S.monthPrep||{})[a]||{}).done;
  if(k==="frz")return bagsPending(shopping(a),b).length>0;
  if(k==="tk")return !(S.ticketSkip||{})[shopKey(a,b)]&&!(S.tickets||[]).some(t=>t.m===a&&t.list===b);
  if(k==="freezer")return freezerState().some(e=>e.days>FREEZER_MONTHS*30);
  if(k==="shop")return !(S.shopDone||{})[shopKey(a,b)];
}catch(e){}return true}
const laterHour=k=>({plan:S.home.planTime,mprep:S.home.planTime,frz:"20:00",tk:"10:00",freezer:"11:00",shop:"09:30"}[k]||"10:00");
// Desde la campanita: mañana a la hora habitual de ese aviso
function remindTomorrow(tag,title,body){
  S.later=S.later||{};S.later[tag]={t:at(addDays(todayISO(),1),laterHour(tag.split("|")[0])),title,body};save();render();toast("Te lo recuerdo mañana")}
// ¿Dejado para más tarde? Vale el aviso exacto ("frz|2026-11|0") o todos los de un tipo ("plan")
const laterHidden=tag=>Object.entries(S.later||{}).some(([k,x])=>(k===tag||k.startsWith(tag+"|"))&&x&&x.t>Date.now());
// Lo dejado para luego desde la notificación: lo apunta el service worker y la app lo recoge al abrirse
async function mergeLater(){try{const c=await caches.open("taper-meta"),r=await c.match("/__aplazados");if(!r)return;
  const l=await r.json();await c.delete("/__aplazados");if(!Object.keys(l).length)return;
  S.later={...(S.later||{}),...l};save();render()}catch(e){}}

/* ---------- Identidad de avisos de este móvil ----------
   localStorage "taper-avisos" = {id, tok, tokAt, inv, invOk}, fuera de S: no viaja en copias, traspasos ni en la casa
   compartida. id: código de avisos (quien ya los tenía sigue con su uid; quien empieza, uno nuevo al azar).
   tok: token secreto que da el servidor; sin él nadie puede tocar estos avisos. inv: código del enlace de invitación. */
const AV_KEY="taper-avisos";
const randCode=(abc,n)=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>abc[b%abc.length]).join("");
const newAvisosId=()=>"U-"+randCode("ABCDEFGHJKLMNPQRSTUVWXYZ23456789",8);
const avSave=a=>{try{localStorage.setItem(AV_KEY,JSON.stringify(a))}catch(e){}};
function avId(){let a={};try{a=JSON.parse(localStorage.getItem(AV_KEY)||"{}")||{}}catch(e){a={}}
  if(!a.id){a.id=S.notif&&S.notif.on&&S.uid?S.uid:newAvisosId();avSave(a)}return a}
const avUrl=()=>CFG.avisos.url.replace(/\/$/,"");
const avHeaders=a=>({"Content-Type":"application/json",...(a.tok?{"X-Taper-Token":a.tok}:{})});
// Rutas de avisos: van con el código de avisos y el token
function avPost(path,body,keep){const a=avId();
  return fetch(avUrl()+path,{method:"POST",keepalive:!!keep,headers:avHeaders(a),body:JSON.stringify({id:a.id,uid:a.id,...(body||{})})})}
async function postAvisos(path,body){
  const r=await fetch(CFG.avisos.url.replace(/\/$/,"")+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok)throw new Error("El servidor de avisos ha respondido "+r.status);return r.json();
}
const b64ToBytes=s=>{const p="=".repeat((4-s.length%4)%4);const b=atob((s+p).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(b,c=>c.charCodeAt(0))};
// El service worker necesita el código, el token y la dirección del servidor (para pedir avisos y para renovar la suscripción)
async function shareWithSW(){const a=avId(),c=await caches.open("taper-meta");
  await c.put("/__avisos",new Response(JSON.stringify({id:a.id,uid:a.id,tok:a.tok||null,tokAt:a.tokAt||0,url:CFG.avisos.url,vapid:CFG.avisos.vapidPublic})))}
// Si el service worker renovó la suscripción y el servidor le dio un token nuevo, la app se queda con ese
async function adoptSWToken(){try{const r=await (await caches.open("taper-meta")).match("/__avisos");if(!r)return;const m=await r.json(),a=avId();
  if(m&&m.id===a.id&&m.tok&&(m.tokAt||0)>(a.tokAt||0)){a.tok=m.tok;a.tokAt=m.tokAt;avSave(a)}}catch(e){}}

// Suscribe este móvil (reutiliza la suscripción si sigue viva) y se la da al servidor
let lastSent=null;
async function subscribeHere(retry){
  const reg=await navigator.serviceWorker.ready;
  const sub=(await reg.pushManager.getSubscription())||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(CFG.avisos.vapidPublic)});
  const a=avId();let plan=[];try{plan=buildSchedule()}catch(e){console.error(e)}
  const r=await avPost("/suscribir",{sub:sub.toJSON(),plan});
  // Ese código de avisos ya es de otro móvil: este se busca uno nuevo
  if(r.status===403&&!retry){a.id=newAvisosId();delete a.tok;delete a.tokAt;avSave(a);return subscribeHere(true)}
  if(!r.ok)throw new Error("El servidor de avisos ha respondido "+r.status);
  const j=await r.json().catch(()=>({}));if(j.token){a.tok=j.token;a.tokAt=Date.now();avSave(a)}
  lastSent=JSON.stringify(plan);S.notifProblem=null;
  await shareWithSW();
}
/* ---------- Permiso de avisos bloqueado ----------
   Una web no puede abrir los ajustes del móvil por su cuenta: se explica el camino exacto según el móvil
   y la app detecta sola cuándo vuelves con el permiso activado. */
const notifBlocked=()=>avisosOn()&&"Notification" in window&&Notification.permission==="denied";
// ¿Abierta como app instalada? (en Android, desde el icono no hay barra de dirección ni candado)
const installedApp=()=>{try{return isStandalone()||["fullscreen","minimal-ui","window-controls-overlay"].some(m=>matchMedia(`(display-mode: ${m})`).matches)||document.referrer.startsWith("android-app://")}catch(e){return false}};
const ANDROID_APP_STEPS=["Mantén pulsado el icono de <b>Táper</b> en la pantalla de inicio","Toca <b>ⓘ Información de la aplicación</b>","Toca <b>Notificaciones</b> y activa <b>Permitir notificaciones</b>","Vuelve aquí: lo detecto solo"];
function permSteps(){
  const ua=navigator.userAgent, ios=/iPhone|iPad|iPod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1), samsung=/SamsungBrowser/.test(ua);
  if(ios&&!installedApp())return ["En Safari, toca <b>Compartir</b> (el cuadrado con la flecha ↑)","Toca <b>Añadir a pantalla de inicio</b>","Abre Táper desde su icono nuevo","Ve a Perfil › Avisos y actívalos: en iPhone solo funcionan con la app instalada"];
  if(ios)return ["Abre <b>Ajustes</b> del iPhone","Baja hasta <b>Táper</b>","Toca <b>Notificaciones</b> y activa <b>Permitir notificaciones</b>","Vuelve aquí: lo detecto solo"];
  if(installedApp())return ANDROID_APP_STEPS;
  return [`Toca el <b>candado 🔒</b> (o el icono de ajustes) a la izquierda de la dirección, arriba`,`Toca <b>Permisos</b> o <b>Notificaciones</b>`,"Cámbialo a <b>Permitir</b>",`Vuelve aquí: lo detecto solo${samsung?"":" (si no, recarga la página)"}`];
}
function openPermHelp(){
  const inst=installedApp(),ios=/iPhone|iPad|iPod/.test(navigator.userAgent);
  showDialog(`<div class="mod">${closeBtn}<h2>Los avisos están bloqueados</h2>
    <p class="small muted">Tu móvil tiene bloqueados los avisos de Táper. Las apps web no pueden abrir los ajustes por ti, pero son 4 toques:</p>
    <ol class="steps">${permSteps().map(s=>`<li>${s}</li>`).join("")}</ol>
    <div class="actions"><button class="btn wide" id="permRetry">Ya lo he activado</button></div>
    ${!inst&&!ios?`<p class="small muted" style="margin-top:10px">¿Usas Táper instalada, desde su icono? Entonces: mantén pulsado el icono de Táper › <b>Información de la aplicación</b> › <b>Notificaciones</b>.</p>`:""}
    <p class="small muted" style="margin-top:10px">Si no encuentras la opción: Ajustes del móvil › Aplicaciones › ${inst?"Táper":"Chrome"} › Notificaciones.</p></div>`);
  dlg.querySelector("#permRetry").onclick=async()=>{
    if(Notification.permission==="granted"){dlg.close();await enableAvisos()}
    else if(Notification.permission==="default"){dlg.close();await enableAvisos()}
    else toast("Sigue bloqueado. Revisa el paso 3 y vuelve a intentarlo");
  };
}
// Cuando el permiso cambia (vuelves de los ajustes con él activado), se activan los avisos sin hacer nada más
async function watchPermission(){
  try{const st=await navigator.permissions.query({name:"notifications"});
    st.onchange=()=>{if(st.state==="granted"&&avisosOn())enableAvisos().catch(()=>{});else render()}}catch(e){}
}
async function enableAvisos(){
  if(!avisosOn()){toast("Los avisos aún no están disponibles");return}
  if(notifBlocked()){openPermHelp();return}
  const perm=await Notification.requestPermission();
  if(perm!=="granted"){openPermHelp();return}
  notifCfg();await subscribeHere();
  notifCfg().on=true;S.notifSynced=Date.now();save();render();toast("Avisos activados");
}
async function disableAvisos(){
  try{const reg=await navigator.serviceWorker.ready;const s=await reg.pushManager.getSubscription();await avPost("/baja",{endpoint:s?s.endpoint:undefined});if(s)await s.unsubscribe()}catch(e){}
  try{const a=avId();delete a.tok;delete a.tokAt;avSave(a);await shareWithSW()}catch(e){}
  lastSent=null;notifCfg().on=false;save();render();toast("Avisos desactivados");
}
// Cada vez que cambian los datos se vuelve a mandar la lista de avisos: a los 4 s, solo si ha cambiado,
// y en el momento de salir de la app (keepalive), para que no llegue «Sube el ticket» con el ticket ya subido
let syncTimer=null;
function syncAvisosNow(keep){
  if(!avisosOn()||!S.notif||!S.notif.on)return;const a=avId();if(!a.tok)return;
  let plan;try{plan=buildSchedule()}catch(e){console.error(e);return}
  const h=JSON.stringify(plan);if(h===lastSent)return;lastSent=h;
  avPost("/programar",{plan},keep).then(r=>{
    if(r.ok){S.notifSynced=Date.now();try{localStorage.setItem("taper-v2",JSON.stringify(S))}catch(e){}}
    else{lastSent=null;if((r.status===401||r.status===404)&&!keep)subscribeHere().catch(()=>{})}}).catch(()=>{lastSent=null});
}
function queueSyncAvisos(){
  if(!avisosOn()||!S.notif||!S.notif.on)return;
  clearTimeout(syncTimer);syncTimer=setTimeout(()=>{syncTimer=null;syncAvisosNow(false)},4000);
}
// Quita el número del icono de la app
const clearBadge=()=>{try{if(navigator.clearAppBadge)navigator.clearAppBadge().catch(()=>{})}catch(e){}};
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="hidden"){clearTimeout(syncTimer);syncTimer=null;syncAvisosNow(true)}
  else clearBadge()});
clearBadge();
// Llega un aviso con la app abierta: la campanita se pone al día
try{navigator.serviceWorker&&navigator.serviceWorker.addEventListener("message",e=>{if(e.data&&e.data.tipo==="push"){if(document.visibilityState==="visible")clearBadge();try{renderBell()}catch(err){}}})}catch(e){}
// Al abrir la app: si los avisos están activados pero el servidor ya no tiene este móvil, se vuelve a suscribir solo.
// Si el último envío falló (y no ha llegado nada después), se avisa en la campanita.
async function checkAvisos(){
  if(!avisosOn()||!S.notif||!S.notif.on)return;
  if(Notification.permission!=="granted"){S.notifProblem="permiso";return}
  if(dlg.open&&dlg.querySelector("#permRetry"))dlg.close();
  try{
    await adoptSWToken();
    const reg=await navigator.serviceWorker.ready;const local=await reg.pushManager.getSubscription();const a=avId();
    let st=null;
    if(a.tok){const r=await fetch(avUrl()+"/estado?id="+encodeURIComponent(a.id),{cache:"no-store",headers:{"X-Taper-Token":a.tok}});if(r.status!==401)st=await r.json()}
    if(!local||!st||!st.suscrito||st.sinToken||st.renovar||!local.endpoint.endsWith(st.endpoint||"-"))await subscribeHere();
    else{await shareWithSW();
      let last=0;try{const x=await (await caches.open("taper-meta")).match("/__ultimo");if(x)last=Number(await x.text())||0}catch(e){}
      const u=st.ultimo;S.notifProblem=u&&(u.status<200||u.status>=300)&&u.at>last&&Date.now()-u.at<3*864e5?"envio:"+u.status:null}
  }catch(e){S.notifProblem=navigator.onLine===false?null:"servidor"}
  try{renderBell()}catch(e){}
}
const _saveBase=save;
// Al terminar el alta, la semana que se acaba de generar cuenta como planificada (no se pide planificarla al momento)
let _wasOnboarded=!!(S&&S.onboarded);
save=function(){
  if(S.onboarded&&!_wasOnboarded&&!S.obWeeks){try{const t=todayISO(),st=S.home.start&&S.home.start>t?S.home.start:t,w=weekStartFor(st),nx=addDays(w,7);S.obWeeks=daysBetween(t,nx)<=2?[w,nx]:[w]}catch(e){}}
  _wasOnboarded=!!S.onboarded;_saveBase();queueSyncAvisos()};

function avisosCard(){
  if(!avisosOn())return `<div class="card"><h2>Avisos en el móvil</h2><p class="small muted">${"PushManager" in window?"Muy pronto podrás activar avisos: descongelar, qué cocinar, ¿qué tal?…":(/iPhone|iPad|iPod/.test(navigator.userAgent)?"En iPhone los avisos solo funcionan con Táper instalada: en Safari toca Compartir ↑ › Añadir a pantalla de inicio y ábrela desde su icono.":"Este navegador no admite avisos. En Android, abre Táper con Chrome e instálala.")}</p></div>`;
  const n=notifCfg();let next=[];if(n.on)try{next=buildSchedule().slice(0,3)}catch(e){console.error(e)}
  if(notifBlocked())return `<div class="card"><h2>Avisos en el móvil</h2>
    <p class="small warnbox">⚠️ Tu móvil tiene bloqueados los avisos de Táper, así que no te llegará ninguno.</p>
    <button class="btn" id="avPerm">Cómo activarlos</button></div>`;
  return `<div class="card"><h2>Avisos en el móvil</h2>
    ${n.on?`<p class="small okbox">✅ Activados. Próximos: ${next.length?next.map(a=>`${esc(new Date(a.t).toLocaleString("es-ES",{weekday:"short",hour:"2-digit",minute:"2-digit"}))} · ${esc(a.title)}`).join("<br>"):"ninguno esta semana"}</p>`
      :`<p class="small muted">Te avisa a su hora de lo que hay que hacer. Funciona aunque no tengas la app abierta.</p><button class="btn" id="avOn">🔔 Activar avisos</button>`}
    <div class="group"><h3>¿De qué te aviso?</h3>${Object.entries(NOTIF_TYPES).map(([k,[t,d]])=>`<label class="ntrow"><span class="ntt"><b>${t}</b><small>${d}</small></span><input type="checkbox" class="switch" data-nt="${k}" ${n.types[k]?"checked":""} aria-label="${esc(t)}"></label>`).join("")}
    <p class="small muted" style="margin-top:8px">Nunca entre las 22:00 y las 08:00, como mucho ${AV_MAX_DIA} al día, y nada de lo que ya esté hecho.</p>
    <div class="row small" style="margin-top:10px"><label style="flex:1">Hora del resumen de la mañana</label><input type="time" id="avSum" value="${esc(n.summary||"08:00")}" style="width:auto"></div>
    <div class="row small"><label style="flex:1">Hora del aviso de descongelar</label><input type="time" id="avThaw" value="${esc(n.thaw)}" style="width:auto"></div></div>
    ${n.on?`<div class="actions"><button class="btn ghost small" id="avTest">Enviarme un aviso de prueba</button><button class="btn ghost small" id="avOff">Desactivar avisos</button></div>`:""}</div>`;
}
function bindAvisos(){
  const n=notifCfg();
  document.getElementById("avOn")?.addEventListener("click",()=>enableAvisos().catch(e=>toast("No se ha podido activar: "+e.message)));
  document.getElementById("avOff")?.addEventListener("click",disableAvisos);
  document.getElementById("avPerm")?.addEventListener("click",openPermHelp);
  document.querySelectorAll("[data-nt]").forEach(c=>c.onchange=()=>{n.types[c.dataset.nt]=c.checked;save()});
  const th=document.getElementById("avThaw");if(th)th.onchange=()=>{n.thaw=th.value||"21:30";save()};
  const su=document.getElementById("avSum");if(su)su.onchange=()=>{n.summary=su.value||"08:00";save()};
  document.getElementById("avTest")?.addEventListener("click",async()=>{
    try{if(Notification.permission!=="granted"){openPermHelp();return}
      await subscribeHere();
      let r;try{r=await (await avPost("/probar",{})).json()}catch(e){r={status:0}}
      toast(r.status>=200&&r.status<300?"Enviado: debería aparecerte en unos segundos":"El servicio de avisos no lo ha aceptado (código "+r.status+"). Desactiva y vuelve a activar los avisos")}catch(e){toast("No se ha podido: "+e.message)}});
}

/* ---------- Traspaso de datos de Safari a la app instalada (iPhone) ----------
   En iPhone, Safari y la app de la pantalla de inicio guardan los datos por separado. Mientras usas Táper
   en Safari, se guarda una copia en el servidor; la app instalada la reconoce al abrirse por primera vez. */
const isIOS=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
const needsTransfer=()=>servidorOn()&&isIOS()&&!isStandalone()&&S.onboarded;
function transferCode(){
  if(!S.trCode){const a="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";S.trCode=Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>a[b%a.length]).join("")}
  return S.trCode;
}
let trTimer=null;
function queueTransfer(){
  if(!needsTransfer())return;
  clearTimeout(trTimer);trTimer=setTimeout(async()=>{
    try{const code=transferCode();
      const r=await fetch(CFG.avisos.url.replace(/\/$/,"")+"/traspaso",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({codigo:code,uid:S.uid,nombre:me().name||"",estado:S})});
      if(r.status===409){delete S.trCode;queueTransfer()}
    }catch(e){}
  },8000);
}
// Pone los datos de Safari en esta app (mismo usuario: avisos, coins e invitaciones siguen igual)
async function loadTransfer(code){
  const r=await fetch(CFG.avisos.url.replace(/\/$/,"")+"/traspaso/cargar?codigo="+encodeURIComponent(code.toUpperCase().trim()),{cache:"no-store"});
  if(r.status===404)throw new Error("No encuentro ese código. Revísalo en Táper en Safari");
  if(!r.ok)throw new Error("El servidor ha respondido "+r.status);
  const d=await r.json();
  S=mergeState(d.estado);S.transferredFrom=code;S.installSent=true;save();
  try{if(S.notif&&S.notif.on){S.notif.on=false;save()}}catch(e){}
  tab="menu";render();toast(`Listo${d.nombre?", "+d.nombre:""}: ya tienes aquí todo lo de Safari`);
  // Los avisos van con cada app: hay que activarlos una vez aquí
  if(avisosOn())setTimeout(()=>{
    showDialog(`<div class="mod">${closeBtn}<h2>Activa los avisos aquí</h2><p class="small muted">Los avisos van con la app instalada, así que hay que activarlos una vez más en esta app.</p><div class="actions"><button class="btn wide" id="trAv">🔔 Activar avisos</button></div></div>`);
    document.getElementById("trAv").onclick=()=>{dlg.close();enableAvisos().catch(e=>toast(e.message))}},900);
}
function openTransferCode(){
  showDialog(`<div class="mod">${closeBtn}<h2>Traer mis datos de Safari</h2>
    <p class="small muted">Abre Táper en Safari, ve a Perfil › Copia y novedades y copia aquí tu código de traspaso.</p>
    <div class="field"><input id="trIn" type="text" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="ABC123" style="text-transform:uppercase;letter-spacing:.2em;font-size:1.3rem;text-align:center"></div>
    <div class="actions"><button class="btn wide" id="trGo">Traer mis datos</button></div></div>`);
  dlg.querySelector("#trGo").onclick=async()=>{const v=dlg.querySelector("#trIn").value;try{await loadTransfer(v);dlg.close()}catch(e){toast(e.message)}};
}
// Primera vez en la app instalada: ¿hay datos de Safari de este mismo móvil?
async function checkTransferOnBoot(){
  if(!servidorOn()||S.onboarded||!isStandalone()||S.transferChecked)return;
  S.transferChecked=true;
  try{const d=await (await fetch(CFG.avisos.url.replace(/\/$/,"")+"/traspaso/buscar",{cache:"no-store"})).json();
    // El servidor solo da el principio del código (la conexión y el modelo los comparten muchos móviles): el resto se escribe
    const pre=d.codigo||d.pista;if(!pre)return;
    showDialog(`<div class="mod">${closeBtn}<h2>¿Son tus datos?</h2>
      <p>Has usado Táper en Safari${d.nombre?` como <b>${esc(d.nombre)}</b>`:""} (última vez: ${esc(new Date(d.at).toLocaleString("es-ES",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}))}).</p>
      <p class="small muted">Puedo traer aquí tu familia, gustos, menús y lista. Para que nadie más pueda, escribe tu código de traspaso: lo ves en Táper en Safari, en Perfil › Copia y novedades.</p>
      <div class="field"><input id="trIn" type="text" maxlength="6" autocapitalize="characters" autocomplete="off" value="${esc(pre)}" style="text-transform:uppercase;letter-spacing:.2em;font-size:1.3rem;text-align:center"></div>
      <div class="actions"><button class="btn wide" id="trYes">Traer mis datos</button><button class="btn ghost wide" id="trNo">No, empezar de cero</button></div></div>`);
    dlg.querySelector("#trYes").onclick=async()=>{const v=dlg.querySelector("#trIn").value;if(v.trim().length<6){toast("Escribe las 6 letras del código");return}try{await loadTransfer(v);dlg.close()}catch(e){toast(e.message)}};
    dlg.querySelector("#trNo").onclick=()=>dlg.close();
  }catch(e){}
}
const _saveTr=save;
save=function(){_saveTr();queueTransfer()};

/* ---------- Invitaciones y coins ---------- */
// Enlace personal: quien lo abre queda como invitado de este usuario. Lleva un código de invitación al azar
// (?inv=), no el uid; los enlaces viejos con ?ref=<uid> siguen sumando coins, pero el uid ya no da acceso a nada
function invCode(){const a=avId();if(!a.inv){a.inv=randCode("abcdefghijkmnpqrstuvwxyz23456789",8);a.invOk=false;avSave(a)}return a.inv}
const refParam=()=>{try{return "inv="+invCode()}catch(e){return ""}};
const shareLink=()=>location.origin+location.pathname.replace(/index\.html$/,"")+"?"+refParam();
const servidorOn=()=>!!(CFG.avisos&&CFG.avisos.url);
// Clave secreta del móvil para sus coins (la misma de la tienda): con ella el servidor sabe que es este móvil
const coinKey=()=>{if(!S.secret){S.secret=randCode("0123456789abcdef",36);try{localStorage.setItem("taper-v2",JSON.stringify(S))}catch(e){}}return S.secret};
async function evento(tipo,extra){if(!servidorOn())return;try{await postAvisos("/evento",{uid:S.uid,clave:coinKey(),tipo,...(extra||{})})}catch(e){}}
// El servidor apunta a quién pertenece el código de invitación (una vez)
async function registerInvite(){const a=avId(),inv=invCode();if(a.invOk||!servidorOn())return;
  try{const r=await fetch(CFG.avisos.url.replace(/\/$/,"")+"/invitacion",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({uid:S.uid,inv})});
    if(r.ok){a.invOk=true;avSave(a)}else if(r.status===409){delete a.inv;avSave(a)}}catch(e){}}
// Al abrir: guarda quién le invitó y, una vez por semana, cuenta que la está usando
function trackOnBoot(){
  const q=new URLSearchParams(location.search),ref=q.get("inv")||q.get("ref");
  registerInvite();
  if(ref&&ref!==S.uid&&!(S.visited||{})[ref]){S.visited={...(S.visited||{}),[ref]:true};if(!S.ref&&!S.onboarded)S.ref=ref;try{localStorage.setItem("taper-v2",JSON.stringify(S))}catch(e){};evento("visita",{ref})}
  if(S.onboarded&&!S.installSent){S.installSent=true;try{localStorage.setItem("taper-v2",JSON.stringify(S))}catch(e){};evento("instalar",{ref:S.ref||null})}
  const wk=mondayOf(todayISO());if(S.onboarded&&S.activeWeek!==wk){S.activeWeek=wk;try{localStorage.setItem("taper-v2",JSON.stringify(S))}catch(e){};evento("activo")}
}
/* ---------- Tienda de coins ---------- */
const SHOP={
  skin_libreta:{t:"Libreta de la abuela",c:50,ico:"📓",g:"Estéticas",d:"Papel de cuaderno, letra a mano y notas con cinta"},skin_trattoria:{t:"Trattoria",c:50,ico:"🇮🇹",g:"Estéticas",d:"Mantel de cuadros y el menú en pizarra"},skin_mediterranea:{t:"Mediterránea",c:50,ico:"🌊",g:"Estéticas",d:"Azulejos, azul y blanco, limones y olivos"},skin_otono:{t:"Otoño acogedor",c:40,ico:"🍂",g:"Estéticas",d:"Papel kraft, tonos tierra y letra redondeada"},skin_neon:{t:"Noche neón",c:60,ico:"🌙",g:"Estéticas",d:"Fondo oscuro con luces de neón rosa y azul"},skin_pop:{t:"Pop infantil",c:40,ico:"🧒",g:"Estéticas",d:"Colores vivos, formas redondas y pegatinas"},skin_japon:{t:"Minimal japonés",c:40,ico:"🍣",g:"Estéticas",d:"Beige y negro, mucho aire y un sello rojo"},skin_navidad:{t:"Navidad",c:40,ico:"🎄",g:"Estéticas",d:"Nieve cayendo, rojo y verde"},
  av_chef:{t:"Avatar Chef",c:10,ico:"🧑‍🍳",g:"Avatares"},av_aguacate:{t:"Avatar Aguacate",c:10,ico:"🥑",g:"Avatares"},av_pizza:{t:"Avatar Pizza",c:10,ico:"🍕",g:"Avatares"},av_zorro:{t:"Avatar Zorro",c:10,ico:"🦊",g:"Avatares"},av_panda:{t:"Avatar Panda",c:10,ico:"🐼",g:"Avatares"},av_pulpo:{t:"Avatar Pulpo",c:10,ico:"🐙",g:"Avatares"},av_taco:{t:"Avatar Taco",c:10,ico:"🌮",g:"Avatares"},av_tomate:{t:"Avatar Tomate",c:10,ico:"🍅",g:"Avatares"},
  tema_oliva:{t:"Tema verde oliva",c:20,ico:"🫒",g:"Temas"},tema_marino:{t:"Tema azul marino",c:20,ico:"🌊",g:"Temas"},
  tema_mostaza:{t:"Tema mostaza",c:20,ico:"🌻",g:"Temas"},tema_berenjena:{t:"Tema berenjena",c:20,ico:"🍆",g:"Temas"},
  tema_naranja:{t:"Tema naranja",c:20,ico:"🍊",g:"Temas"},tema_turquesa:{t:"Tema turquesa",c:20,ico:"🐬",g:"Temas"},tema_rosa:{t:"Tema frambuesa",c:20,ico:"🍓",g:"Temas"},tema_lavanda:{t:"Tema lavanda",c:20,ico:"💜",g:"Temas"},tema_grafito:{t:"Tema grafito",c:20,ico:"🖤",g:"Temas"},
  pack_navidad:{t:"Pack Navidad",c:30,ico:"🎄",g:"Packs de recetas",d:"Platos de fiesta que se pueden hacer en casa"},
  pack_oficina:{t:"Pack Tápers de oficina",c:30,ico:"💼",g:"Packs de recetas",d:"Platos que viajan bien y se comen fríos o recalentados"},
  pack_deportistas:{t:"Pack Deportistas",c:30,ico:"💪",g:"Packs de recetas",d:"Mucha proteína y energía para entrenar"},
  pack_aprovechamiento:{t:"Pack Aprovechamiento",c:30,ico:"♻️",g:"Packs de recetas",d:"Para gastar sobras y lo que está a punto de caducar"},
  imprimible:{t:"Menú imprimible",c:40,ico:"🖨️",g:"Extras",d:"El menú del mes y la lista de la compra en A4, para la nevera"}
};
const owns=item=>(S.owned||[]).includes(item);
let coinsNow=null;
async function loadStats(){const r=await fetch(CFG.avisos.url.replace(/\/$/,"")+"/stats?uid="+encodeURIComponent(S.uid),{cache:"no-store",headers:{"X-Taper-Clave":coinKey()}});const f=await r.json();
  coinsNow=f.coins||0;if(Array.isArray(f.compras)){S.owned=f.compras;try{localStorage.setItem("taper-v2",JSON.stringify(S))}catch(e){}}return f}
async function openShop(){
  if(!servidorOn()){toast("La tienda necesita conexión");return}
  if(!S.secret){coinKey();save()}
  try{await loadStats()}catch(e){}
  // Un pack solo se vende si ya hay recetas suyas en la app
  const groups={};for(const [k,v] of Object.entries(SHOP)){if(k.startsWith("pack_")&&!R.some(r=>r.pack===k.slice(5)))continue;(groups[v.g]=groups[v.g]||[]).push([k,v])}
  showDialog(`<div class="mod">${closeBtn}<div class="veb">Tienda</div><h2 class="vh" style="font-size:1.9rem">Canjea tus <em>coins</em></h2>
    <div class="coinbig">🪙 <b>${coinsNow??"…"}</b> coins</div>
    <p class="small muted">Gánalas invitando a gente, usando Táper cada semana y subiendo los tickets de la compra. Lo que canjeas es para siempre.</p>
    ${Object.entries(groups).map(([g,its])=>`<h3 class="mq">${esc(g)}</h3>${its.map(([k,v])=>`<div class="shopit ${owns(k)?"own":""}"><span class="si">${v.ico}</span><span><b>${esc(v.t)}</b>${v.d?`<small>${esc(v.d)}</small>`:""}</span>
      ${owns(k)?(()=>{const inUse=k.startsWith("skin_")?S.skin===k.slice(5):k.startsWith("tema_")?S.accent===k.slice(5)&&!S.skin:k.startsWith("av_")?S.avatar===k:null;
        return inUse===null?`<span class="okt">✓ Tuyo</span>`:inUse?`<span class="okt">✓ En uso</span>`:`<button class="btn ghost small" data-use="${k}">Usar</button>`})():`<button class="btn small" data-buy="${k}" ${coinsNow!=null&&coinsNow<v.c?"disabled":""}>🪙 ${v.c}</button>`}</div>
      ${k.startsWith("skin_")?`<div class="skinprev skin-${k.slice(5)}"><div class="pv-t">Qué <em>comemos</em></div><div class="pv-c"><span>🍝 Pasta al pesto</span><i>Hoy</i></div></div>`:""}`).join("")}`).join("")}</div>`);
  loadSkinFonts();
  // Cambiar entre lo que ya es tuyo
  dlg.querySelectorAll("[data-use]").forEach(b=>b.onclick=()=>{const k=b.dataset.use;
    if(k.startsWith("skin_")){S.skin=k.slice(5);applySkin()}
    else if(k.startsWith("tema_")){S.skin=null;S.accent=k.slice(5);applySkin();applyAccent()}
    else if(k.startsWith("av_"))S.avatar=k;
    save();render();toast(`${SHOP[k].ico} Ahora usas: ${SHOP[k].t}`);openShop()});
  dlg.querySelectorAll("[data-buy]").forEach(b=>b.onclick=async()=>{b.disabled=true;const ok=await buyItem(b.dataset.buy);if(ok)openShop();else b.disabled=false});
}
// Estéticas compradas: clase en <body>; sus tipografías se cargan solo cuando hacen falta
const SKIN_FONTS="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Fredoka:wght@500;600;700&family=Playfair+Display:ital,wght@0,700;1,500&display=swap";
function loadSkinFonts(){if(document.getElementById("skinFonts"))return;const l=document.createElement("link");l.id="skinFonts";l.rel="stylesheet";l.href=SKIN_FONTS;document.head.appendChild(l)}
function applySkin(){
  if(lookPreview){previewLook(lookPreview);return}
  document.body.className=document.body.className.replace(/\bskin-\S+/g,"").trim();
  if(S.skin&&owns("skin_"+S.skin)){loadSkinFonts();document.body.classList.add("skin-"+S.skin);
    const c=getComputedStyle(document.body).getPropertyValue("--accent").trim();if(c)document.querySelector('meta[name="theme-color"]')?.setAttribute("content",c)}
  else applyAccent();
}
// Temas de color comprados
// Canjear algo de la tienda (el precio lo pone el servidor); se usa enseguida
async function buyItem(k){
  try{const r=await fetch(CFG.avisos.url.replace(/\/$/,"")+"/canjear",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({uid:S.uid,clave:S.secret,item:k})});const j=await r.json();
    if(!r.ok){toast(j.error||"No se ha podido canjear");return false}
    S.owned=j.compras;if(typeof coinsNow!=="undefined")coinsNow=j.coins;save();
    if(k.startsWith("tema_")){S.accent=k.slice(5);applyAccent()}
    if(k.startsWith("av_"))S.avatar=k;
    if(k.startsWith("skin_")){S.skin=k.slice(5);applySkin()}
    if(k.startsWith("pack_"))refreshPlansForPacks();
    toast(`${SHOP[k].ico} ${SHOP[k].t}: ¡es tuyo!`);render();return true}
  catch(e){toast("Sin conexión: inténtalo luego");return false}
}
// Probar un color o una estética sin tenerlo: se pone en toda la app mientras decides
function previewLook(k){
  const st=document.documentElement.style;
  if(k.startsWith("tema_")){const a=ACCENTS[k.slice(5)];document.body.className=document.body.className.replace(/\bskin-\S+/g,"").trim();
    st.setProperty("--accent",a[0]);st.setProperty("--accent-2",a[1]);st.setProperty("--accent-soft",a[2]);document.querySelector('meta[name="theme-color"]')?.setAttribute("content",a[0])}
  if(k.startsWith("skin_")){["--accent","--accent-2","--accent-soft"].forEach(v=>st.removeProperty(v));loadSkinFonts();document.body.className=document.body.className.replace(/\bskin-\S+/g,"").trim();document.body.classList.add("skin-"+k.slice(5))}
}
// Comprar desde Perfil: primero se ve cómo queda; si no se compra, todo vuelve a como estaba
function askBuy(k){const v=SHOP[k];if(!v)return;
  const look=k.startsWith("tema_")||k.startsWith("skin_");let bought=false;
  if(look){lookPreview=k;previewLook(k)}
  showDialog(`<div class="mod">${closeBtn}<h2>${v.ico} ${esc(v.t)}</h2>
    ${look?`<p class="small muted" style="margin:0 0 8px">Así se ve Táper con ${k.startsWith("tema_")?"este color":"esta estética"}: mira también la pantalla de detrás.</p>
      <div class="pvcard${k.startsWith("skin_")?" skinprev skin-"+k.slice(5):""}"><div class="pv-t">Qué <em>comemos</em></div><div class="pv-c"><span>🍝 Pasta al pesto</span><i>Hoy</i></div>
        <div class="pv-row"><span class="btn small">Planificar la semana</span><span class="chip" aria-pressed="true">Cena</span></div></div>`:""}
    <p>Cuesta <b>🪙 ${v.c} coins</b>.${v.d?" "+esc(v.d)+".":""}</p>
    <div class="actions"><button class="btn wide" id="bkOk">Comprar y usar</button><button class="btn ghost wide" data-x>Ahora no</button></div></div>`);
  // Al cerrar la ventana (por donde sea), si no se ha comprado, todo vuelve a como estaba
  if(look){const t=setInterval(()=>{if(dlg.open&&dlg.querySelector("#bkOk"))return;clearInterval(t);if(lookPreview!==k)return;lookPreview=null;applyAccent();applySkin()},150)}
  dlg.querySelector("#bkOk").onclick=async e=>{e.target.disabled=true;if(await buyItem(k)){bought=true;dlg.close()}else e.target.disabled=false};
}
const ACCENTS={rojo:["#D22F2A","#B42520","#FBE8E7"],oliva:["#5B7F2A","#4A6A20","#EEF4E3"],marino:["#1F4E8C","#173E70","#E6EEF9"],mostaza:["#B97F0F","#9C6A0B","#FBF1DC"],berenjena:["#6B2D5C","#56234A","#F4E6F0"],naranja:["#D2601A","#B04E12","#FCEBDD"],turquesa:["#0E8A8A","#0A6F6F","#E0F3F3"],rosa:["#C2366E","#A12A5B","#FBE6EE"],lavanda:["#6B55B5","#574497","#EEEAF9"],grafito:["#3D4552","#2C333D","#E9EBEE"]};
let lookPreview=null;   // color o estética que se está probando antes de comprar
function applyAccent(){if(lookPreview){previewLook(lookPreview);return}const a=ACCENTS[S.accent]&&(S.accent==="rojo"||owns("tema_"+S.accent))?ACCENTS[S.accent]:null,st=document.documentElement.style;
  if(!a){["--accent","--accent-2","--accent-soft"].forEach(v=>st.removeProperty(v));return}
  st.setProperty("--accent",a[0]);st.setProperty("--accent-2",a[1]);st.setProperty("--accent-soft",a[2]);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",a[0]);}
// Al desbloquear un pack, sus recetas entran en las semanas que vienen
function refreshPlansForPacks(){for(const s of Object.keys(S.plans))if(addDays(s,6)>=todayISO()&&!(S.plans[s].confirmed))genWeekFromScratch(s);save()}
async function fillStats(){
  const box=document.getElementById("coinsBox");if(!box||!servidorOn())return;
  try{const f=await loadStats();
    box.innerHTML=`<div class="stats"><div><b>${f.visitas||0}</b><small>han abierto tu enlace</small></div><div><b>${f.instalados||0}</b><small>la han empezado a usar</small></div><div><b>${f.activos||0}</b><small>semanas de uso de tus invitados</small></div></div>
      <p class="coins">🪙 <b>${f.coins||0} coins</b></p><button class="btn wide" id="openShop">🛍️ Tienda de coins</button>
      <p class="small muted" style="margin-top:8px">Se ganan invitando a gente, usando Táper cada semana y subiendo los tickets de la compra (+3 cada uno).</p>
      ${(f.historial||[]).length?`<details class="small"><summary>Historial de coins</summary>${f.historial.map(h=>`<div>${esc(shortDate(h.fecha))} · ${h.coins>0?"+":""}${h.coins} · ${esc(h.motivo)}</div>`).join("")}</details>`:""}`;
    document.getElementById("openShop").onclick=openShop;
  }catch(e){box.innerHTML=`<p class="small muted">No se han podido cargar tus coins ahora mismo.</p>`}
}
