/* Táper · avisos en el móvil (notificaciones push con el servidor de avisos)
   La app calcula sus próximos avisos de la semana y se los manda al servidor, que los envía a su hora. */
"use strict";

const NOTIF_TYPES={
  descongelar:["❄️ Descongelar","La noche antes, para pasar la carne o el pescado a la nevera"],
  cocinar:["🍳 Qué cocinas hoy","Una hora antes de la comida o la cena que toca cocinar"],
  valorar:["⭐ ¿Qué tal?","Después de cada comida, para valorarla"],
  entreno:["🏃 ¿Entrenaste?","Una hora después de cada entreno"],
  planificar:["🗓️ Planificar","El día y la hora en que planificas"],
  congelador:["🧊 Congelador","Si algo lleva más de 3 meses congelado (sábado por la mañana)"]
};
const avisosOn=()=>!!(CFG.avisos&&CFG.avisos.url&&CFG.avisos.vapidPublic&&"serviceWorker" in navigator&&"PushManager" in window);
const notifCfg=()=>{S.notif=S.notif||{on:false,types:Object.fromEntries(Object.keys(NOTIF_TYPES).map(k=>[k,true])),thaw:"21:30"};return S.notif};

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
    if(T.planificar&&dow(d)===S.home.planDay)push(at(d,S.home.planTime),"🗓️ Toca planificar la semana","Entrenos, quién está, platos y compra: 5 minutos.","plan|"+d);
    if(T.congelador&&dow(d)===5){try{const old=freezerState().filter(e=>e.days>FREEZER_MONTHS*30);
      if(old.length)push(at(d,"11:00"),"🧊 Gasta esto pronto",`Lleva más de 3 meses congelado: ${old.map(e=>P[e.pid].name.toLowerCase()).join(", ")}.`,"freezer|"+d)}catch(e){}}
  }
  return out.sort((a,b)=>a.t-b.t).slice(0,80);
}

async function postAvisos(path,body){
  const r=await fetch(CFG.avisos.url.replace(/\/$/,"")+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok)throw new Error("El servidor de avisos ha respondido "+r.status);return r.json();
}
const b64ToBytes=s=>{const p="=".repeat((4-s.length%4)%4);const b=atob((s+p).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(b,c=>c.charCodeAt(0))};
// El service worker necesita saber el código de usuario y la dirección del servidor para pedir los avisos
async function shareWithSW(){const c=await caches.open("taper-meta");await c.put("/__avisos",new Response(JSON.stringify({uid:S.uid,url:CFG.avisos.url})))}

async function enableAvisos(){
  if(!avisosOn()){toast("Los avisos aún no están disponibles");return}
  const perm=await Notification.requestPermission();
  if(perm!=="granted"){toast("Sin permiso no puedo avisarte. Puedes darlo en los ajustes del navegador");return}
  const reg=await navigator.serviceWorker.ready;
  const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(CFG.avisos.vapidPublic)});
  await shareWithSW();
  await postAvisos("/suscribir",{uid:S.uid,sub:sub.toJSON(),plan:buildSchedule()});
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
const _saveBase=save;
save=function(){_saveBase();queueSyncAvisos()};

function avisosCard(){
  if(!avisosOn())return `<div class="card"><h2>Avisos en el móvil</h2><p class="small muted">${"PushManager" in window?"Muy pronto podrás activar avisos: descongelar, qué cocinar, ¿qué tal?…":"Este navegador no admite avisos. En Android, abre Táper con Chrome e instálala."}</p></div>`;
  const n=notifCfg(),next=n.on?buildSchedule().slice(0,3):[];
  return `<div class="card"><h2>Avisos en el móvil</h2>
    ${n.on?`<p class="small okbox">✅ Activados. Próximos: ${next.length?next.map(a=>`${esc(new Date(a.t).toLocaleString("es-ES",{weekday:"short",hour:"2-digit",minute:"2-digit"}))} · ${esc(a.title)}`).join("<br>"):"ninguno esta semana"}</p>`
      :`<p class="small muted">Te avisa a su hora de lo que hay que hacer. Funciona aunque no tengas la app abierta.</p><button class="btn" id="avOn">🔔 Activar avisos</button>`}
    <div class="group"><h3>¿De qué te aviso?</h3>${Object.entries(NOTIF_TYPES).map(([k,[t,d]])=>`<label class="row small" style="margin:6px 0"><input type="checkbox" data-nt="${k}" ${n.types[k]?"checked":""} style="width:auto"> <span><b>${t}</b> · <span class="muted">${d}</span></span></label>`).join("")}
    <div class="row small"><label>Hora del aviso de descongelar</label><input type="time" id="avThaw" value="${esc(n.thaw)}" style="width:auto"></div></div>
    ${n.on?`<div class="actions"><button class="btn ghost small" id="avTest">Enviarme un aviso de prueba</button><button class="btn ghost small" id="avOff">Desactivar avisos</button></div>`:""}</div>`;
}
function bindAvisos(){
  const n=notifCfg();
  document.getElementById("avOn")?.addEventListener("click",()=>enableAvisos().catch(e=>toast("No se ha podido activar: "+e.message)));
  document.getElementById("avOff")?.addEventListener("click",disableAvisos);
  document.querySelectorAll("[data-nt]").forEach(c=>c.onchange=()=>{n.types[c.dataset.nt]=c.checked;save()});
  const th=document.getElementById("avThaw");if(th)th.onchange=()=>{n.thaw=th.value||"21:30";save()};
  document.getElementById("avTest")?.addEventListener("click",async()=>{
    try{const plan=buildSchedule();plan.unshift({t:Date.now()+30000,title:"🔔 Aviso de prueba de Táper",body:"Si ves esto, los avisos funcionan.",tag:"test"});
      await postAvisos("/programar",{uid:S.uid,plan});toast("Llegará en menos de 10 minutos")}catch(e){toast("No se ha podido: "+e.message)}});
}

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
