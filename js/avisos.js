/* Táper · avisos en el móvil (notificaciones push con el servidor de avisos)
   La app calcula sus próximos avisos de la semana y se los manda al servidor, que los envía a su hora. */
"use strict";

const NOTIF_TYPES={
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
  for(const k of Object.keys(NOTIF_TYPES))if(S.notif.types[k]==null)S.notif.types[k]=true;return S.notif};

// Fecha y hora local -> milisegundos
const at=(d,hhmm,addMin=0)=>{const [h,m]=String(hhmm).split(":").map(Number);const x=parseISO(d);x.setHours(h,m+addMin,0,0);return x.getTime()};

// Los avisos de los próximos 7 días, calculados con el menú, los entrenos y los ajustes
function buildSchedule(){
  const n=notifCfg(),T=n.types,now=Date.now(),today=todayISO(),out=[];
  const push=(t,title,body,tag)=>{if(t>now)out.push({t,title,body,tag})};
  for(let i=0;i<8;i++){
    const d=addDays(today,i),start=weekStartFor(d),wk=S.plans[start];
    if(wk)for(const sl of buildSlots(start)){
      if(sl.date!==d)continue;const v=wk.slots[sl.id],r=v&&RX[v.recipe];if(!r)continue;
      const mt=S.home.mealTimes[sl.meal]||"14:00";
      if(T.descongelar&&S.home.cookMode!=="lote"){const th=r.ing.filter(([p])=>P[p].thaw).map(([p])=>P[p].name.toLowerCase());
        if(th.length)push(at(addDays(d,-1),n.thaw),"❄️ Descongela para mañana",`Pasa ${th.join(" y ")} del congelador a la nevera para ${r.name.toLowerCase()}.`,"thaw|"+sl.id)}
      if(T.cocinar)push(at(d,mt,-60),`🍳 Hoy: ${r.name}`,`${recipeTime(r)} min · ${String(sl.portions).replace(".",",")} raciones${sl.tupper.length?" · haz el táper de mañana":""}.`,"cook|"+sl.id);
      if(T.valorar&&sl.eaters.length)push(at(d,mt,90),`¿Qué tal ${r.name.toLowerCase()}?`,"Toca para valorarlo y que aprenda lo que te gusta.","rate|"+sl.id);
    }
    if(T.entreno)plannedSessions(d).forEach((s,j)=>push(at(d,sessTime(s),60),`🏃 ¿Hiciste ${(SPORTS[s.type]||s.type).toLowerCase()}?`,"Si no, recalculo lo que te conviene comer.","sport|"+d+"|"+j));
    {const [y,mm]=d.split("-").map(Number),last=iso(new Date(y,mm,0)),nx=mm===12?`${y+1}-01`:`${y}-${String(mm+1).padStart(2,"0")}`;
      if(T.planificar&&daysBetween(d,last)===7&&!((S.monthPrep||{})[nx]||{}).done){const nm=new Date(nx+"-01T12:00").toLocaleDateString("es-ES",{month:"long"});
        push(at(d,S.home.planTime),`📋 Prepara ${nm}`,"5 preguntas rápidas y te dejo el menú y el pedido del mes listos.","mprep|"+nx)}}
    if(T.planificar&&dow(d)===S.home.planDay)push(at(d,S.home.planTime),"🗓️ Toca planificar la semana","Entrenos, quién está, platos y compra: 5 minutos.","plan|"+d);
    if(T.congelador&&dow(d)===5){try{const old=freezerState().filter(e=>e.days>FREEZER_MONTHS*30);
      if(old.length)push(at(d,"11:00"),"🧊 Gasta esto pronto",`Lleva más de 3 meses congelado: ${old.map(e=>P[e.pid].name.toLowerCase()).join(", ")}.`,"freezer|"+d)}catch(e){}}
  }
  if(T.compra!==false){try{
    for(const r of shopReminders()){
      const snooze=((S.shopSnooze||{})[shopKey(r.m,r.key)])||"";
      for(let i=0;i<4;i++){const d=addDays(r.due>today?r.due:today,i);if(d<snooze)continue;
        push(at(d,r.online?"19:30":"09:30"),r.title,r.body+(i?" · ¿Ya está? Márcala como hecha":""),"shop|"+r.m+"|"+r.key)}
    }}catch(e){}}
  return out.sort((a,b)=>a.t-b.t).slice(0,80);
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
    <div class="row small"><label>Hora del aviso de descongelar</label><input type="time" id="avThaw" value="${esc(n.thaw)}" style="width:auto"></div></div>
    ${n.on?`<div class="actions"><button class="btn ghost small" id="avTest">Enviarme un aviso de prueba</button><button class="btn ghost small" id="avOff">Desactivar avisos</button></div>`:""}</div>`;
}
function bindAvisos(){
  const n=notifCfg();
  document.getElementById("avOn")?.addEventListener("click",()=>enableAvisos().catch(e=>toast("No se ha podido activar: "+e.message)));
  document.getElementById("avOff")?.addEventListener("click",disableAvisos);
  document.getElementById("avPerm")?.addEventListener("click",openPermHelp);
  document.querySelectorAll("[data-nt]").forEach(c=>c.onchange=()=>{n.types[c.dataset.nt]=c.checked;save()});
  const th=document.getElementById("avThaw");if(th)th.onchange=()=>{n.thaw=th.value||"21:30";save()};
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
async function fillStats(){
  const box=document.getElementById("coinsBox");if(!box||!servidorOn())return;
  try{const r=await fetch(CFG.avisos.url.replace(/\/$/,"")+"/stats?uid="+encodeURIComponent(S.uid),{cache:"no-store"});const f=await r.json();
    box.innerHTML=`<div class="stats"><div><b>${f.visitas||0}</b><small>han abierto tu enlace</small></div><div><b>${f.instalados||0}</b><small>la han empezado a usar</small></div><div><b>${f.activos||0}</b><small>semanas de uso de tus invitados</small></div></div>
      <p class="coins">🪙 <b>${f.coins||0} coins</b> <span class="small muted">· pronto podrás canjearlos</span></p>
      ${(f.historial||[]).length?`<details class="small"><summary>Cómo los has ganado</summary>${f.historial.map(h=>`<div>${esc(shortDate(h.fecha))} · +${h.coins} · ${esc(h.motivo)}</div>`).join("")}</details>`:""}`;
  }catch(e){box.innerHTML=`<p class="small muted">No se han podido cargar tus coins ahora mismo.</p>`}
}
