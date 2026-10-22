/* Táper · compartir: un plato o la lista por WhatsApp, y el menú con alguien de casa que también tenga Táper
   Menú compartido: quien comparte guarda en el servidor una copia de sus próximos menús y de la compra del mes
   (se actualiza sola al cambiar algo). Quien tiene el enlace lo ve en su móvil y puede tachar la lista:
   lo que tacha uno se tacha también en el móvil del otro. */
"use strict";

const appLink=q=>location.origin+location.pathname.replace(/index\.html$/,"")+"?"+q;
// Hoja de compartir del móvil (WhatsApp, Telegram, correo…); en el ordenador, WhatsApp o copiar
async function shareText(title,text){
  if(navigator.share){try{await navigator.share({title,text});return}catch(e){if(e&&e.name==="AbortError")return}}
  showDialog(`<div class="mod">${closeBtn}<h2>${esc(title)}</h2><textarea readonly rows="9" style="width:100%;font-size:.85rem">${esc(text)}</textarea>
    <div class="actions"><a class="btn wide" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">💬 Enviar por WhatsApp</a><button class="btn ghost wide" id="cpTxt">Copiar el texto</button></div></div>`);
  dlg.querySelector("#cpTxt").onclick=async()=>{try{await navigator.clipboard.writeText(text);toast("Texto copiado")}catch(e){toast("No se ha podido copiar")}};
}

/* ---------- Un plato ---------- */
function recipeText(r,v,serv){
  const L=[`🍽️ *${r.name}*`,`⏱ ${v.time} min · ${String(serv).replace(".",",")} raciones${r.kcal?` · ${r.kcal} kcal por ración`:""}`,"","*Ingredientes*",
    ...r.ing.map(([p,q])=>`• ${P[p].name}: ${fmtQty(q*serv,P[p].unit)}`),"• Aceite, sal y especias al gusto"];
  if(v.tools&&v.tools.length)L.push("","*Necesitas*",v.tools.join(", "));
  L.push("","*Preparación*",...v.steps.map((s,i)=>{const tg=stepTags((v.info||[])[i]);return `${i+1}. ${s}${tg.length?` _(${tg.join(" · ")})_`:""}`}));
  L.push("",`Receta de Táper 👉 ${appLink("receta="+encodeURIComponent(r.id)+(S.uid?"&ref="+encodeURIComponent(S.uid):""))}`);
  return L.join("\n");
}
const shareRecipe=(r,v,serv)=>{shareText(r.name,recipeText(r,v,serv));evento("compartir")};

/* ---------- La lista de la compra ---------- */
// Lo que falta por coger, por supermercado y sección (en el orden en que se recorre la tienda)
function listText(title,groups,isDone,total){
  const L=[`🛒 *${title}*`];let left=0,all=0;
  for(const g of groups){
    const its=g.items.filter(it=>{all++;return !isDone(it)});left+=its.length;if(!its.length)continue;
    if(groups.length>1)L.push("",`*${superById(g.sup).nombre||g.sup}*`);
    const bySec={};for(const it of its)(bySec[P[it.pid].sec]=bySec[P[it.pid].sec]||[]).push(it);
    for(const sec of [...STORE_ORDER,...Object.keys(bySec).filter(s=>!STORE_ORDER.includes(s))].filter(s=>bySec[s])){
      L.push("",`${secIco(sec)} ${sec}`);
      for(const it of bySec[sec].sort((a,b)=>P[a.pid].name.localeCompare(P[b.pid].name)))L.push(`▫️ ${it.packs} × ${P[it.pid].name}`)}
  }
  if(!left)L.push("","Ya está todo cogido ✓");
  else if(left<all)L.push("",`(Faltan ${left} de ${all} productos)`);
  if(total)L.push("",`Unos ${eur(total)}`);
  L.push("",`Hecha con Táper 👉 ${appLink(S.uid?"ref="+encodeURIComponent(S.uid):"")}`);
  return L.join("\n");
}
function shareList(m,l,title){shareText(title,listText(title,l.groups,it=>!!S.checks[checkKey(m,l.key,it.pid)],l.cost+l.fee));evento("compartir")}

/* ---------- El menú, con alguien de casa ---------- */
const MEAL_ORDER=["desayuno","almuerzo","comida","merienda","cena"];
const MEAL_T={desayuno:"☀️ Desayuno",almuerzo:"🍎 Almuerzo",comida:"🍽️ Comida",merienda:"🥪 Merienda",cena:"🌙 Cena"};
// Copia de lo que verá la otra persona: próximos menús (con quién come) y la compra del mes
function shareSnapshot(){
  const today=todayISO(),dias=[];
  for(const s of Object.keys(S.plans).filter(s=>addDays(s,6)>=today).sort().slice(0,6))for(const d of weekDates(s)){
    if(d<today)continue;const sm=smallOf(d),ms=[];
    for(const m of MEAL_ORDER){
      if(SMALL[m]){const v=sm[m];if(v&&RX[v.recipe])ms.push({m,r:v.recipe,para:smallEaters(d,m).map(personName).join(", ")});continue}
      const x=dishOfMeal(d,m);
      if(x.recipe){const sl=slotFor(d,m);ms.push({m,r:x.recipe.id,taper:x.state==="taper",para:sl?sl.eaters.concat(sl.kids).map(personName).join(", "):""})}
      else if(x.state==="fuera"||x.state==="libre")ms.push({m,txt:MEALSTATE[x.state]})}
    if(ms.length)dias.push({d,ms})}
  // Compra de este mes y del siguiente (si ya tiene menú)
  const m0=todayISO().slice(0,7),[y,mo]=m0.split("-").map(Number),m1=mo===12?`${y+1}-01`:`${y}-${String(mo+1).padStart(2,"0")}`,listas=[];
  for(const m of [m0,m1]){const sh=shopping(m);if(!sh.weeks.some(s=>S.plans[s]))continue;
    for(const [key,l] of Object.entries(sh.lists).sort(([a],[b])=>(a==="mes"?-1:0)-(b==="mes"?-1:0))){if(!l.items.length)continue;
      listas.push({m,key:m+"|"+key,t:key==="mes"?"Compra de "+monthName(m).split(" ")[0].toLowerCase():"Semana del "+shortDate(sh.weeks[Number(key)]),total:Math.round((l.cost+l.fee)*100)/100,
        groups:l.groups.map(g=>({sup:g.sup,items:g.items.map(it=>({pid:it.pid,packs:it.packs}))}))})}}
  return {nombre:me().name||"",dias,compra:{listas}};
}
const shareCode=()=>{const a="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";return Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>a[b%a.length]).join("")};
const srv=()=>CFG.avisos.url.replace(/\/$/,"");
let shTimer=null,shLast="";
function queueShare(now){
  if(!S.share||!servidorOn())return;
  clearTimeout(shTimer);shTimer=setTimeout(async()=>{
    try{const datos=shareSnapshot(),txt=JSON.stringify(datos);if(txt===shLast&&!now)return;
      const r=await fetch(srv()+"/compartir",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({codigo:S.share.codigo,clave:S.share.clave,datos})});
      if(r.ok)shLast=txt}catch(e){}
  },now?0:6000);
}
// Lo que ha tachado la otra persona aparece tachado aquí
async function pullShareMarks(){
  if(!S.share||!servidorOn())return;
  try{const d=await (await fetch(srv()+"/compartido?codigo="+S.share.codigo,{cache:"no-store"})).json();if(!d||!d.marcas)return;
    let ch=false;for(const [k,v] of Object.entries(d.marcas)){if(!!S.checks[k]!==!!v.on){ch=true;if(v.on)S.checks[k]=true;else delete S.checks[k]}}
    if(ch){save();if(tab==="compra")render()}}catch(e){}
}
function markShared(codigo,key,on){if(!servidorOn())return;fetch(srv()+"/compartido/marcar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({codigo,key,on})}).catch(()=>{})}
const shareUrl=()=>appLink("menu="+S.share.codigo);
function openShareMenu(){
  if(!servidorOn()){toast("Para compartir hace falta conexión");return}
  const on=!!S.share;
  showDialog(`<div class="mod">${closeBtn}<h2>👥 Compartir el menú</h2>
    <p>Quien tenga el enlace verá en su móvil vuestro menú de los próximos días y la lista de la compra, siempre al día.</p>
    <p class="small muted">Lo que tache de la lista se tacha también en tu móvil, así podéis repartiros la compra. Solo puede verlo, no cambiar el menú.</p>
    ${on?`<div class="field"><input type="text" readonly value="${esc(shareUrl())}" id="shU"></div>
      <div class="actions"><button class="btn wide" id="shSend">💬 Enviar el enlace</button><button class="btn ghost wide" id="shStop">Dejar de compartir</button></div>`
    :`<div class="actions"><button class="btn wide" id="shGo">Crear el enlace</button></div>`}</div>`);
  dlg.querySelector("#shGo")?.addEventListener("click",()=>{S.share={codigo:shareCode(),clave:shareCode()+shareCode()+shareCode()};save();queueShare(true);openShareMenu()});
  dlg.querySelector("#shSend")?.addEventListener("click",()=>shareText("Nuestro menú",`👥 ${me().name?me().name+" te":"Te"} comparte el menú y la lista de la compra de Táper. Ábrelo aquí y lo verás siempre al día:\n${shareUrl()}`));
  dlg.querySelector("#shStop")?.addEventListener("click",async()=>{const s=S.share;delete S.share;save();
    try{await fetch(srv()+"/compartir/parar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)})}catch(e){}
    dlg.close();render();toast("Ya no se comparte. El enlace ha dejado de funcionar")});
}

/* ---------- Ver el menú que te comparten ---------- */
let followTab="menu",followList=null;
async function openFollowed(codigo){
  let d;
  try{const r=await fetch(srv()+"/compartido?codigo="+encodeURIComponent(codigo),{cache:"no-store"});
    if(r.status===404){S.follow=(S.follow||[]).filter(f=>f.codigo!==codigo);save();render();showDialog(`<div class="mod">${closeBtn}<h2>Este menú ya no se comparte</h2><p class="small muted">Pide a quien te lo pasó un enlace nuevo.</p></div>`);return}
    d=await r.json()}catch(e){toast("No hay conexión para ver el menú compartido");return}
  const nom=d.nombre||(d.datos&&d.datos.nombre)||"";
  S.follow=(S.follow||[]).filter(f=>f.codigo!==codigo);S.follow.unshift({codigo,nombre:nom});save();
  const D=d.datos||{},marks=d.marcas||{},C=D.compra||{listas:[]};
  if(!C.listas.some(l=>l.key===followList))followList=(C.listas[0]||{}).key;
  const done=k=>!!(marks[k]&&marks[k].on);
  const draw=()=>{
    let h=`<div class="mod">${closeBtn}<h2>👥 Menú ${nom?"de "+esc(nom):"compartido"}</h2><p class="small muted">Actualizado ${esc(new Date(d.at).toLocaleString("es-ES",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}))}</p>
      <div class="segtab" role="tablist"><button role="tab" data-ft="menu" aria-selected="${followTab==="menu"}">Menú</button><button role="tab" data-ft="compra" aria-selected="${followTab==="compra"}">Compra</button></div>`;
    if(followTab==="menu"){
      if(!(D.dias||[]).length)h+=`<p class="muted">Aún no hay menú para los próximos días.</p>`;
      for(const x of D.dias||[]){h+=`<h3 style="margin:14px 0 4px">${esc(cap(longDate(x.d)))}</h3>`;
        for(const m of x.ms){const r=m.r&&RX[m.r];
          h+=`<div class="dishrow" style="margin:4px 0">${r?dishImg(r,"s"):""}<span><small class="muted">${MEAL_T[m.m]||m.m}${m.para?" · "+esc(m.para):""}</small><br>${r?`<button class="name" data-fopen="${r.id}">${m.taper?"Táper de ":""}${esc(r.name)}</button>`:`<i>${esc(m.txt||"")}</i>`}</span></div>`}}
    }else{
      if(!C.listas.length)h+=`<p class="muted">Aún no hay lista de la compra.</p>`;
      else{const l=C.listas.find(x=>x.key===followList)||C.listas[0];
        h+=`<div class="seg" role="group">${C.listas.map(x=>`<button aria-pressed="${x.key===l.key}" data-fl="${esc(x.key)}">${esc(x.t)}</button>`).join("")}</div>
          <div class="row" style="justify-content:space-between;margin:6px 0"><b>${eur(l.total)}</b><button class="btn ghost small" id="flSend">📤 Enviar lista</button></div>`;
        for(const g of l.groups){if(l.groups.length>1)h+=`<h3>${esc(superById(g.sup).nombre||g.sup)}</h3>`;
          for(const it of g.items.filter(it=>P[it.pid]).sort((a,b)=>P[a.pid].name.localeCompare(P[b.pid].name))){const k=checkKey(l.m,l.key.slice(8),it.pid);
            h+=`<label class="item ${done(k)?"done":""}"><input type="checkbox" data-fck="${esc(k)}" ${done(k)?"checked":""}>${prodImg(it.pid)}<span class="t">${it.packs} × ${esc(P[it.pid].name)}</span></label>`}}}
    }
    h+=`<p class="small muted" style="margin-top:12px">${S.onboarded?"Tu propio menú sigue en la pestaña Menú.":"¿Quieres también tu propio menú? Cierra esta ventana y empieza."}</p></div>`;
    showDialog(h,true);
    dlg.querySelectorAll("[data-ft]").forEach(b=>b.onclick=()=>{followTab=b.dataset.ft;draw()});
    dlg.querySelectorAll("[data-fl]").forEach(b=>b.onclick=()=>{followList=b.dataset.fl;draw()});
    dlg.querySelectorAll("[data-fopen]").forEach(b=>b.onclick=()=>openRecipe(b.dataset.fopen));
    dlg.querySelectorAll("[data-fck]").forEach(i=>i.onchange=()=>{const k=i.dataset.fck;marks[k]={on:i.checked};markShared(codigo,k,i.checked);i.closest(".item").classList.toggle("done",i.checked)});
    dlg.querySelector("#flSend")?.addEventListener("click",()=>{const l=C.listas.find(x=>x.key===followList)||C.listas[0];shareText(l.t,listText(l.t,l.groups.map(g=>({...g,items:g.items.filter(it=>P[it.pid])})),it=>done(checkKey(l.m,l.key.slice(8),it.pid)),l.total))});
  };
  draw();
}
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
// Menús que te han compartido: acceso desde el Menú
function followChips(){
  const f=S.follow||[];if(!f.length)return "";
  return `<div class="chips" style="margin:6px 0">${f.map(x=>`<button class="chip" data-follow="${esc(x.codigo)}">👥 Menú ${x.nombre?"de "+esc(x.nombre):"compartido"}</button>`).join("")}</div>`;
}
// Al abrir: enlaces ?receta= y ?menu=
function shareOnBoot(){
  const u=new URLSearchParams(location.search),rid=u.get("receta"),mc=(u.get("menu")||"").toUpperCase();
  if(rid||mc)history.replaceState(null,"",location.pathname);
  if(/^[A-Z2-9]{6}$/.test(mc)&&servidorOn()){openFollowed(mc);return true}
  if(rid&&RX[rid]){openRecipe(rid);return true}
  // Quien solo sigue un menú (sin plan propio) lo ve nada más abrir
  if(!S.onboarded&&(S.follow||[]).length&&servidorOn()){openFollowed(S.follow[0].codigo);return true}
  if(S.share){pullShareMarks();queueShare()}
  return false;
}
// Cada cambio guardado actualiza (al rato) el menú compartido
const _saveSh=save;
save=function(){_saveSh();queueShare()};
