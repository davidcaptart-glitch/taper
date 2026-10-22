/* Táper · avisos en el móvil (notificaciones push con el servidor de avisos)
   La app calcula sus próximos avisos de la semana y se los manda al servidor, que los envía a su hora. */
"use strict";

const NOTIF_TYPES={
  resumen:["☀️ Resumen del día","Por la mañana, todo lo que coméis hoy"],
  horas:["🍽️ A la hora de comer","En cada comida (también desayuno, almuerzo y merienda): qué toca y para quién"],
  descongelar:["❄️ Descongelar","La noche antes, para pasar la carne o el pescado a la nevera"],
  cocinar:["🍳 Qué cocinas hoy","Una hora antes de la comida o la cena que toca cocinar"],
  valorar:["⭐ ¿Qué tal?","Después de cada comida, para valorarla"],
  entreno:["🏃 ¿Entrenaste?","Una hora después de cada entreno"],
  planificar:["🗓️ Planificar","El día y la hora en que planificas"],
  compra:["🛒 Compra","Cuándo hacer el pedido o ir a comprar, cada día hasta que lo hagas"],
  congelador:["🧊 Congelador","Si algo lleva más de 3 meses congelado (sábado por la mañana)"]
};
const avisosOn=()=>!!(CFG.avisos&&CFG.avisos.url&&CFG.avisos.vapidPublic&&"serviceWorker" in navigator&&"PushManager" in window);
const notifCfg=()=>{S.notif=S.notif||{on:false,types:Object.fromEntries(Object.keys(NOTIF_TYPES).map(k=>[k,true])),thaw:"21:30"};
  if(!S.notif.summary)S.notif.summary="08:00";
  for(const k of Object.keys(NOTIF_TYPES))if(S.notif.types[k]==null)S.notif.types[k]=true;return S.notif};

// Fecha y hora local -> milisegundos
const at=(d,hhmm,addMin=0)=>{const [h,m]=String(hhmm).split(":").map(Number);const x=parseISO(d);x.setHours(h,m+addMin,0,0);return x.getTime()};

// Los avisos de los próximos 7 días, calculados con el menú, los entrenos y los ajustes
function buildSchedule(){
  const n=notifCfg(),T=n.types,now=Date.now(),today=todayISO(),out=[];
  // Todos los avisos recuerdan que se pueden quitar
  const push=(t,title,body,tag)=>{if(t>now)out.push({t,title,body:String(body||"").replace(/\.?$/,".")+" Puedes quitarlo en Perfil › Avisos.",tag})};
  // Horas de las comidas pequeñas: las que haya puesto (comidas extra) o unas por defecto
  const smallTime=m=>(S.home.extraMeals||{})[m==="almuerzo"?"mediamanana":m]||{desayuno:"08:00",almuerzo:"11:00",merienda:"17:30"}[m];
  const names=ps=>{const n=ps.map(p=>isMe(p)?"ti":personName(p));return n.length>1?n.slice(0,-1).join(", ")+" y "+n.slice(-1):n[0]||""};
  for(let i=0;i<8;i++){
    const d=addDays(today,i),start=weekStartFor(d),wk=S.plans[start];
    // Resumen de la mañana: todo lo que se come hoy
    if(T.resumen&&wk){const parts=[],sm=smallOf(d);
      for(const m of ["desayuno","almuerzo"])if(sm[m]&&RX[sm[m].recipe])parts.push(`${SMALL[m][0]} ${RX[sm[m].recipe].name}`);
      {const x=dishOfMeal(d,"comida");if(x.recipe)parts.push(`🍽️ ${x.recipe.name}${x.state==="taper"?" (táper)":""}`);else if(x.state==="fuera")parts.push("🍽️ comes fuera")}
      if(sm.merienda&&RX[sm.merienda.recipe])parts.push(`${SMALL.merienda[0]} ${RX[sm.merienda.recipe].name}`);
      {const x=dishOfMeal(d,"cena");if(x.recipe)parts.push(`🌙 ${x.recipe.name}`);else if(x.state==="fuera")parts.push("🌙 cenas fuera")}
      if(parts.length)push(at(d,n.summary||"08:00"),i===0?"☀️ Hoy coméis":"☀️ Hoy coméis",parts.join(" · "),"day|"+d)}
    // A la hora de cada comida pequeña
    if(T.horas&&wk)for(const [m,v] of Object.entries(smallOf(d))){const r=RX[v.recipe];if(!r)continue;
      const ps=smallEaters(d,m),casa=ps.filter(p=>smallState(p,m,d)==="casa"),llevar=ps.filter(p=>smallState(p,m,d)==="llevar");
      if(llevar.length)push(at(d,smallTime("desayuno"),-15),`🎒 Prepara el ${m} para llevar`,`${r.name} para ${names(llevar)}.`,"pack|"+d+"|"+m);
      if(casa.length)push(at(d,smallTime(m)),`${SMALL[m][0]} ${SMALL[m][1]}: ${r.name}`,`Para ${names(casa)}.`,"eat|"+d+"|"+m);
      if(T.valorar&&ps.some(p=>!ratedBefore(p,r.id)))push(at(d,smallTime(m),60),`¿Qué tal ${r.name.toLowerCase()}?`,"Toca para valorarlo y que aprenda lo que os gusta.","rate|"+d+"|"+m)}
    if(wk)for(const sl of buildSlots(start)){
      if(sl.date!==d)continue;const v=wk.slots[sl.id],r=v&&RX[v.recipe];if(!r)continue;
      const mt=S.home.mealTimes[sl.meal]||"14:00";
      if(T.descongelar&&S.home.cookMode!=="lote"){const th=r.ing.filter(([p])=>P[p].thaw).map(([p])=>P[p].name.toLowerCase());
        if(th.length)push(at(addDays(d,-1),n.thaw),"❄️ Descongela para mañana",`Pasa ${th.join(" y ")} del congelador a la nevera para ${r.name.toLowerCase()}.`,"thaw|"+sl.id)}
      if(fromBatch(sl)){
        // Ya cocinado en la sesión: solo sacarlo (y, si va congelado, pasarlo a la nevera la noche antes)
        const k=keepPlan(r,sl);
        if(T.descongelar&&k.freeze)push(at(addDays(d,-1),n.thaw),"❄️ Pasa el táper a la nevera",`El de ${r.name.toLowerCase()} para mañana (${sl.meal}).`,"thawt|"+sl.id);
        if(T.cocinar)push(at(d,mt,-30),`🥡 Saca el táper: ${r.name}`,`Lo cocinaste el ${DAYS[dow(k.cook)].toLowerCase()}. Caliéntalo y a comer.`,"cook|"+sl.id);
      }else if(S.home.cookMode==="lote"){/* se avisa una vez al día de cocinar (abajo) */
      }else if(T.cocinar)push(at(d,mt,-60),`🍳 Hoy: ${r.name}`,`${recipeTime(r)} min · ${String(sl.portions).replace(".",",")} raciones${sl.tupper.length?" · haz el táper de mañana":""}.`,"cook|"+sl.id);
      if(T.horas){const who=sl.eaters.concat(sl.kids);if(who.length)push(at(d,mt),`${sl.meal==="comida"?"🍽️ A comer":"🌙 A cenar"}: ${r.name}`,`Para ${names(who)}${sl.guests?` y ${sl.guests} invitados`:""}.`,"eat|"+sl.id)}
      if(T.valorar&&sl.eaters.concat(sl.kids).some(p=>!ratedBefore(p,r.id)))push(at(d,mt,90),`¿Qué tal ${r.name.toLowerCase()}?`,"Toca para valorarlo y que aprenda lo que te gusta.","rate|"+sl.id);
    }
    // Por lotes: el día de cocinar, un solo aviso con cuántos platos y para cuántos días
    if(T.cocinar&&S.home.cookMode==="lote"&&S.home.cookDays.includes(dow(d))){
      const pl=[weekStartFor(d),addDays(weekStartFor(d),7)].flatMap(s=>S.plans[s]?buildSlots(s).filter(x=>cookDayFor(x.date)===d&&S.plans[s].slots[x.id]):[]),cv=batchCovers(d);
      if(pl.length)push(at(d,"10:30"),`🍳 Hoy toca cocinar: ${pl.length} ${pl.length===1?"plato":"platos"}`,`Para ${cv.days} ${cv.days===1?"día":"días"}. Abre la sesión y te digo en cuántos tápers repartir cada uno.`,"sess|"+d)}
    if(T.entreno)plannedSessions(d).forEach((s,j)=>push(at(d,sessTime(s),60),`🏃 ¿Hiciste ${(SPORTS[s.type]||s.type).toLowerCase()}?`,"Si no, recalculo lo que te conviene comer.","sport|"+d+"|"+j));
    {const [y,mm]=d.split("-").map(Number),last=iso(new Date(y,mm,0)),nx=mm===12?`${y+1}-01`:`${y}-${String(mm+1).padStart(2,"0")}`;
      if(T.planificar&&d===monthPrepDate(d.slice(0,7))&&!((S.monthPrep||{})[nx]||{}).done){const nm=new Date(nx+"-01T12:00").toLocaleDateString("es-ES",{month:"long"});
        push(at(d,S.home.planTime),`📋 Prepara ${nm}`,"5 preguntas rápidas y te dejo el menú y el pedido del mes listos.","mprep|"+nx)}}
    if(T.planificar&&dow(d)===S.home.planDay)push(at(d,S.home.planTime),"🗓️ Toca planificar la semana","Entrenos, quién está, platos y compra: 5 minutos.","plan|"+d);
    if(T.congelador&&dow(d)===5){try{const old=freezerState().filter(e=>e.days>FREEZER_MONTHS*30);
      if(old.length)push(at(d,"11:00"),"🧊 Gasta esto pronto",`Lleva más de 3 meses congelado: ${old.map(e=>P[e.pid].name.toLowerCase()).join(", ")}.`,"freezer|"+d)}catch(e){}}
  }
  if(T.compra!==false||T.descongelar){try{
    for(const m of [today.slice(0,7),nextMonthOf(today.slice(0,7))]){const sh=shopping(m);
      for(const [key,bg] of Object.entries(sh.bags||{})){const pend=bagsPending(sh,key);if(!pend.length)continue;
        const ws=sh.weeks[key==="mes"?0:Number(key)];if(!ws)continue;const day=deliveryDate(ws);
        for(let i=0;i<2;i++)push(at(addDays(day,i),"20:00"),`🧊 Reparte y congela: ${pend.length} ${pend.length===1?"bolsa":"bolsas"}`,`Una bolsa por plato con su día (${[...new Set(pend.map(b=>P[b.pid].name.toLowerCase()))].slice(0,3).join(", ")}…). Márcalas en la compra.`,"frz|"+m+"|"+key)}}
  }catch(e){}}
  if(T.compra!==false){try{
    // Ticket: la noche del día de la compra y la mañana siguiente, si no se ha subido
    for(const m of [today.slice(0,7),nextMonthOf(today.slice(0,7))]){const sh=shopping(m);
      for(const l of Object.values(sh.lists)){if(!l.items.length)continue;const ws=sh.weeks[l.key==="mes"?0:Number(l.key)];if(!ws)continue;
        const day=deliveryDate(ws),k=shopKey(m,l.key);
        if((S.tickets||[]).some(t=>t.m===m&&t.list===l.key)||(S.ticketSkip||{})[k])continue;
        push(at(day,"21:00"),"📸 ¿Subes el ticket de la compra?","Escanéalo y ganas 3 coins (y afino los precios para todos)","tk|"+k);
        push(at(addDays(day,1),"10:00"),"📸 Te queda subir el ticket","Escanéalo y ganas 3 coins","tk|"+k)}}
  }catch(e){}}
  if(T.compra!==false){try{
    for(const r of shopReminders()){
      const snooze=((S.shopSnooze||{})[shopKey(r.m,r.key)])||"";
      for(let i=0;i<4;i++){const d=addDays(r.due>today?r.due:today,i);if(d<snooze)continue;
        push(at(d,r.online?"19:30":"09:30"),r.title,r.body+(i?" · ¿Ya está? Márcala como hecha":""),"shop|"+r.m+"|"+r.key)}
    }}catch(e){}}
  return out.sort((a,b)=>a.t-b.t).slice(0,150);
}

async function postAvisos(path,body){
  const r=await fetch(CFG.avisos.url.replace(/\/$/,"")+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok)throw new Error("El servidor de avisos ha respondido "+r.status);return r.json();
}
const b64ToBytes=s=>{const p="=".repeat((4-s.length%4)%4);const b=atob((s+p).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(b,c=>c.charCodeAt(0))};
// El service worker necesita saber el código de usuario y la dirección del servidor para pedir los avisos
async function shareWithSW(){const c=await caches.open("taper-meta");await c.put("/__avisos",new Response(JSON.stringify({uid:S.uid,url:CFG.avisos.url})))}

// Suscribe este móvil (reutiliza la suscripción si sigue viva) y se la da al servidor
async function subscribeHere(){
  const reg=await navigator.serviceWorker.ready;
  const sub=(await reg.pushManager.getSubscription())||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(CFG.avisos.vapidPublic)});
  await shareWithSW();
  await postAvisos("/suscribir",{uid:S.uid,sub:sub.toJSON(),plan:buildSchedule()});
}
/* ---------- Permiso de avisos bloqueado ----------
   Una web no puede abrir los ajustes del móvil por su cuenta: se explica el camino exacto según el móvil
   y la app detecta sola cuándo vuelves con el permiso activado. */
const notifBlocked=()=>avisosOn()&&"Notification" in window&&Notification.permission==="denied";
function permSteps(){
  const ua=navigator.userAgent, ios=/iPhone|iPad|iPod/.test(ua), samsung=/SamsungBrowser/.test(ua);
  if(ios&&!isStandalone())return ["En Safari, toca <b>Compartir</b> (el cuadrado con la flecha ↑)","Toca <b>Añadir a pantalla de inicio</b>","Abre Táper desde su icono nuevo","Ve a Perfil › Avisos y actívalos: en iPhone solo funcionan con la app instalada"];
  if(ios)return ["Abre <b>Ajustes</b> del iPhone","Baja hasta <b>Táper</b>","Toca <b>Notificaciones</b> y activa <b>Permitir notificaciones</b>","Vuelve aquí: lo detecto solo"];
  if(isStandalone())return ["Mantén pulsado el icono de <b>Táper</b> en la pantalla de inicio","Toca <b>ⓘ Información de la aplicación</b>","Toca <b>Notificaciones</b> y activa <b>Permitir notificaciones</b>","Vuelve aquí: lo detecto solo"];
  return [`Toca el <b>candado 🔒</b> (o el icono de ajustes) a la izquierda de la dirección, arriba`,`Toca <b>Permisos</b> o <b>Notificaciones</b>`,"Cámbialo a <b>Permitir</b>",`Vuelve aquí: lo detecto solo${samsung?"":" (si no, recarga la página)"}`];
}
function openPermHelp(){
  showDialog(`<div class="mod">${closeBtn}<h2>Los avisos están bloqueados</h2>
    <p class="small muted">Tu móvil tiene bloqueados los avisos de Táper. Las apps web no pueden abrir los ajustes por ti, pero son 4 toques:</p>
    <ol class="steps">${permSteps().map(s=>`<li>${s}</li>`).join("")}</ol>
    <div class="actions"><button class="btn wide" id="permRetry">Ya lo he activado</button></div>
    <p class="small muted" style="margin-top:10px">Si no encuentras la opción: Ajustes del móvil › Aplicaciones › ${isStandalone()?"Táper":"Chrome"} › Notificaciones.</p></div>`);
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
  await subscribeHere();
  notifCfg().on=true;S.notifSynced=Date.now();save();render();toast("Avisos activados");
}
async function disableAvisos(){
  try{const reg=await navigator.serviceWorker.ready;const s=await reg.pushManager.getSubscription();if(s)await s.unsubscribe();await postAvisos("/baja",{uid:S.uid})}catch(e){}
  notifCfg().on=false;save();render();toast("Avisos desactivados");
}
// Cada vez que cambian los datos se vuelve a mandar la lista de avisos (como mucho cada 20 s)
let syncTimer=null;
function queueSyncAvisos(){
  if(!avisosOn()||!S.notif||!S.notif.on)return;
  clearTimeout(syncTimer);syncTimer=setTimeout(async()=>{try{await postAvisos("/programar",{uid:S.uid,plan:buildSchedule()});S.notifSynced=Date.now();try{localStorage.setItem("taper-v2",JSON.stringify(S))}catch(e){}}catch(e){}},20000);
}
// Al abrir la app: si los avisos están activados pero el servidor ya no tiene este móvil, se vuelve a suscribir solo
async function checkAvisos(){
  if(!avisosOn()||!S.notif||!S.notif.on)return;
  if(Notification.permission!=="granted"){S.notifProblem="permiso";return}
  if(dlg.open&&dlg.querySelector("#permRetry"))dlg.close();
  try{
    const reg=await navigator.serviceWorker.ready;const local=await reg.pushManager.getSubscription();
    const st=await (await fetch(CFG.avisos.url.replace(/\/$/,"")+"/estado?uid="+encodeURIComponent(S.uid),{cache:"no-store"})).json();
    if(!local||!st.suscrito||!local.endpoint.endsWith(st.endpoint||"-"))await subscribeHere();else await shareWithSW();
    S.notifProblem=null;
  }catch(e){}
}
const _saveBase=save;
save=function(){_saveBase();queueSyncAvisos()};

function avisosCard(){
  if(!avisosOn())return `<div class="card"><h2>Avisos en el móvil</h2><p class="small muted">${"PushManager" in window?"Muy pronto podrás activar avisos: descongelar, qué cocinar, ¿qué tal?…":(/iPhone|iPad|iPod/.test(navigator.userAgent)?"En iPhone los avisos solo funcionan con Táper instalada: en Safari toca Compartir ↑ › Añadir a pantalla de inicio y ábrela desde su icono.":"Este navegador no admite avisos. En Android, abre Táper con Chrome e instálala.")}</p></div>`;
  const n=notifCfg(),next=n.on?buildSchedule().slice(0,3):[];
  if(notifBlocked())return `<div class="card"><h2>Avisos en el móvil</h2>
    <p class="small warnbox">⚠️ Tu móvil tiene bloqueados los avisos de Táper, así que no te llegará ninguno.</p>
    <button class="btn" id="avPerm">Cómo activarlos</button></div>`;
  return `<div class="card"><h2>Avisos en el móvil</h2>
    ${n.on?`<p class="small okbox">✅ Activados. Próximos: ${next.length?next.map(a=>`${esc(new Date(a.t).toLocaleString("es-ES",{weekday:"short",hour:"2-digit",minute:"2-digit"}))} · ${esc(a.title)}`).join("<br>"):"ninguno esta semana"}</p>`
      :`<p class="small muted">Te avisa a su hora de lo que hay que hacer. Funciona aunque no tengas la app abierta.</p><button class="btn" id="avOn">🔔 Activar avisos</button>`}
    <div class="group"><h3>¿De qué te aviso?</h3>${Object.entries(NOTIF_TYPES).map(([k,[t,d]])=>`<label class="ntrow"><span class="ntt"><b>${t}</b><small>${d}</small></span><input type="checkbox" class="switch" data-nt="${k}" ${n.types[k]?"checked":""} aria-label="${esc(t)}"></label>`).join("")}
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
      let r;try{r=await postAvisos("/probar",{uid:S.uid})}catch(e){r={status:0}}
      toast(r.status>=200&&r.status<300?"Enviado: debería aparecerte en unos segundos":"Google no ha aceptado el aviso (código "+r.status+"). Desactiva y vuelve a activar los avisos")}catch(e){toast("No se ha podido: "+e.message)}});
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
    if(!d.codigo)return;
    showDialog(`<div class="mod">${closeBtn}<h2>¿Son tus datos?</h2>
      <p>Has usado Táper en Safari${d.nombre?` como <b>${esc(d.nombre)}</b>`:""} (última vez: ${esc(new Date(d.at).toLocaleString("es-ES",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}))}).</p>
      <p class="small muted">Puedo traer aquí tu familia, gustos, menús y lista, para que no tengas que empezar de nuevo.</p>
      <div class="actions"><button class="btn wide" id="trYes">Sí, traer mis datos</button><button class="btn ghost wide" id="trNo">No, empezar de cero</button></div></div>`);
    dlg.querySelector("#trYes").onclick=async()=>{try{await loadTransfer(d.codigo);dlg.close()}catch(e){toast(e.message)}};
    dlg.querySelector("#trNo").onclick=()=>dlg.close();
  }catch(e){}
}
const _saveTr=save;
save=function(){_saveTr();queueTransfer()};

/* ---------- Invitaciones y coins ---------- */
// Enlace personal: quien lo abre queda como invitado de este usuario
const shareLink=()=>location.origin+location.pathname.replace(/index\.html$/,"")+"?ref="+encodeURIComponent(S.uid);
const servidorOn=()=>!!(CFG.avisos&&CFG.avisos.url);
async function evento(tipo,extra){if(!servidorOn())return;try{await postAvisos("/evento",{uid:S.uid,tipo,...(extra||{})})}catch(e){}}
// Al abrir: guarda quién le invitó y, una vez por semana, cuenta que la está usando
function trackOnBoot(){
  const ref=new URLSearchParams(location.search).get("ref");
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
  pack_navidad:{t:"Pack Navidad",c:30,ico:"🎄",g:"Packs de recetas",d:"Platos de fiesta que se pueden hacer en casa"},
  pack_oficina:{t:"Pack Tápers de oficina",c:30,ico:"💼",g:"Packs de recetas",d:"Platos que viajan bien y se comen fríos o recalentados"},
  pack_deportistas:{t:"Pack Deportistas",c:30,ico:"💪",g:"Packs de recetas",d:"Mucha proteína y energía para entrenar"},
  pack_aprovechamiento:{t:"Pack Aprovechamiento",c:30,ico:"♻️",g:"Packs de recetas",d:"Para gastar sobras y lo que está a punto de caducar"},
  imprimible:{t:"Menú imprimible",c:40,ico:"🖨️",g:"Extras",d:"El menú del mes y la lista de la compra en A4, para la nevera"}
};
const owns=item=>(S.owned||[]).includes(item);
let coinsNow=null;
async function loadStats(){const r=await fetch(CFG.avisos.url.replace(/\/$/,"")+"/stats?uid="+encodeURIComponent(S.uid),{cache:"no-store"});const f=await r.json();
  coinsNow=f.coins||0;if(Array.isArray(f.compras)){S.owned=f.compras;try{localStorage.setItem("taper-v2",JSON.stringify(S))}catch(e){}}return f}
async function openShop(){
  if(!servidorOn()){toast("La tienda necesita conexión");return}
  if(!S.secret){S.secret=Array.from(crypto.getRandomValues(new Uint8Array(18)),b=>b.toString(16).padStart(2,"0")).join("");save()}
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
  dlg.querySelectorAll("[data-buy]").forEach(b=>b.onclick=async()=>{const k=b.dataset.buy;b.disabled=true;
    try{const r=await fetch(CFG.avisos.url.replace(/\/$/,"")+"/canjear",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({uid:S.uid,clave:S.secret,item:k})});const j=await r.json();
      if(!r.ok){toast(j.error||"No se ha podido canjear");b.disabled=false;return}
      S.owned=j.compras;coinsNow=j.coins;save();
      if(k.startsWith("tema_")){S.accent=k.slice(5);applyAccent()}
      if(k.startsWith("av_"))S.avatar=k;
      if(k.startsWith("skin_")){S.skin=k.slice(5);applySkin()}
      if(k.startsWith("pack_"))refreshPlansForPacks();
      toast(`${SHOP[k].ico} ${SHOP[k].t}: ¡es tuyo!`);openShop();render()}
    catch(e){toast("Sin conexión: inténtalo luego");b.disabled=false}});
}
// Estéticas compradas: clase en <body>; sus tipografías se cargan solo cuando hacen falta
const SKIN_FONTS="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Fredoka:wght@500;600;700&family=Playfair+Display:ital,wght@0,700;1,500&display=swap";
function loadSkinFonts(){if(document.getElementById("skinFonts"))return;const l=document.createElement("link");l.id="skinFonts";l.rel="stylesheet";l.href=SKIN_FONTS;document.head.appendChild(l)}
function applySkin(){
  document.body.className=document.body.className.replace(/\bskin-\S+/g,"").trim();
  if(S.skin&&owns("skin_"+S.skin)){loadSkinFonts();document.body.classList.add("skin-"+S.skin);
    const c=getComputedStyle(document.body).getPropertyValue("--accent").trim();if(c)document.querySelector('meta[name="theme-color"]')?.setAttribute("content",c)}
  else applyAccent();
}
// Temas de color comprados
const ACCENTS={rojo:["#D22F2A","#B42520","#FBE8E7"],oliva:["#5B7F2A","#4A6A20","#EEF4E3"],marino:["#1F4E8C","#173E70","#E6EEF9"],mostaza:["#B97F0F","#9C6A0B","#FBF1DC"],berenjena:["#6B2D5C","#56234A","#F4E6F0"]};
function applyAccent(){const a=ACCENTS[S.accent]&&(S.accent==="rojo"||owns("tema_"+S.accent))?ACCENTS[S.accent]:null,st=document.documentElement.style;
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
