/* Táper · casa compartida: la misma familia, menús y compra en varios móviles, y cada uno puede cambiar cosas
   - Quien crea la casa añade a su pareja en la familia y le manda un enlace de invitación (Perfil › Casa compartida).
   - Quien lo abre entra en la casa como esa persona y solo contesta lo suyo: objetivos, deporte, dieta y gustos.
   - Lo de la casa se guarda en el servidor (cs:<código>) con un número de versión. Al guardar, cada móvil manda sus
     cambios; si otro móvil cambió algo mientras tanto, se juntan: lo que solo cambió uno se queda, y si los dos
     cambiaron lo mismo gana el último.
   - Lo de cada móvil no se comparte: quién eres tú, avisos, estética, coins, encuestas… (LOCAL_KEYS). */
"use strict";

const LOCAL_KEYS=new Set(["uid","onboarded","notif","notifSynced","notifProblem","seenVersion","share","follow","rateShown","zoneAsked",
  "installSent","installCounted","installHidden","visited","ref","activeWeek","trCode","transferChecked","transferredFrom","casa","meId","joining",
  "avatar","skin","accent","owned","secret","noStats","testFresh","updatedAt","surveys","surveyLater","noSurvey","mySug","shopSnooze","base"]);
const sharedPart=s=>{const o={};for(const k of Object.keys(s))if(!LOCAL_KEYS.has(k)&&s[k]!==undefined)o[k]=s[k];return o};
const jeq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const isObj=x=>x&&typeof x==="object"&&!Array.isArray(x);
const byId=a=>Array.isArray(a)&&a.length>0&&a.every(x=>isObj(x)&&x.id!=null);
// Junta tres versiones: la última que se sincronizó (b), la de este móvil (l) y la del servidor (r)
function merge3(b,l,r,depth=0){
  if(jeq(l,b))return r;            // aquí no se tocó: vale lo del servidor
  if(jeq(r,b)||jeq(l,r))return l;  // solo se cambió aquí
  if(depth<4&&isObj(l)&&isObj(r)){const bb=isObj(b)?b:{},o={};
    for(const k of new Set([...Object.keys(bb),...Object.keys(l),...Object.keys(r)])){const v=merge3(bb[k],l[k],r[k],depth+1);if(v!==undefined)o[k]=v}
    return o}
  if(depth<4&&(byId(l)||byId(r))&&Array.isArray(l)&&Array.isArray(r)){
    const m=a=>Object.fromEntries((Array.isArray(a)?a:[]).filter(isObj).map(x=>[x.id,x])),bm=m(b),lm=m(l),rm=m(r),out=[];
    for(const id of [...new Set([...r.map(x=>x.id),...l.map(x=>x.id)])]){const v=merge3(bm[id],lm[id],rm[id],depth+1);if(v!==undefined)out.push(v)}
    return out}
  return l;                        // los dos cambiaron lo mismo: gana este móvil, que es el último en guardar
}
// Última versión sincronizada, guardada aparte (así los cambios sin mandar sobreviven a cerrar la app)
const CASA_BASE="taper-casa-base";
const getBase=()=>{try{return JSON.parse(localStorage.getItem(CASA_BASE)||"null")}catch(e){return null}};
const setBase=b=>{try{localStorage.setItem(CASA_BASE,JSON.stringify(b))}catch(e){}};
const casaOn=()=>!!(S.casa&&S.casa.id&&servidorOn());
async function casaFetch(path,body){
  const r=await fetch(srv()+path,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{cache:"no-store"});
  let d=null;try{d=await r.json()}catch(e){}
  return {status:r.status,d};
}
// Pone en este móvil lo que viene del servidor, sin perder los cambios hechos aquí que aún no se han mandado
function applyRemote(rev,estado){
  const base=getBase()||{},local=sharedPart(S),merged=merge3(base,local,estado);
  const keep={};for(const k of Object.keys(S))if(LOCAL_KEYS.has(k))keep[k]=S[k];
  const changed=!jeq(local,merged);
  S=mergeState({...merged,...keep});S.casa.rev=rev;setBase(estado);
  _saveCasa();
  return {changed,pending:!jeq(merged,estado)};
}
let casaBusy=false,casaTimer=null;
async function casaPull(){
  if(!casaOn()||casaBusy)return;casaBusy=true;
  try{const {status,d}=await casaFetch("/casa?id="+S.casa.id+"&k="+encodeURIComponent(S.casa.k));
    if(status===404||status===403){casaLost();return}
    if(status!==200||!d)return;
    if(d.rev!==S.casa.rev){const {changed,pending}=applyRemote(d.rev,d.estado);if(changed)casaRerender();if(pending){casaBusy=false;await casaPush()}}
  }catch(e){}finally{casaBusy=false}
}
async function casaPush(){
  if(!casaOn()||casaBusy)return;
  const local=sharedPart(S);if(jeq(local,getBase()))return;
  casaBusy=true;
  try{const {status,d}=await casaFetch("/casa/guardar",{id:S.casa.id,k:S.casa.k,rev:S.casa.rev,uid:S.uid,estado:local});
    if(status===200){S.casa.rev=d.rev;setBase(local);_saveCasa()}
    else if(status===409&&d){const {changed}=applyRemote(d.rev,d.estado);if(changed)casaRerender();casaBusy=false;return casaPush()}
    else if(status===404||status===403)casaLost();
  }catch(e){}finally{casaBusy=false}
}
const queueCasa=()=>{if(!casaOn())return;clearTimeout(casaTimer);casaTimer=setTimeout(casaPush,2500)};
// Repinta sin cerrar lo que la persona tiene abierto
function casaRerender(){if(tab==="wizard"||(dlg&&dlg.open))return;render()}
function casaLost(){delete S.casa;setBase(null);_saveCasa();toast("Ya no estás en la casa compartida")}
const _saveCasa=save;
save=function(){_saveCasa();queueCasa()};
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")casaPull()});
setInterval(()=>{if(document.visibilityState==="visible")casaPull()},20000);

/* ---------- Crear la casa e invitar ---------- */
const longKey=()=>shareCode()+shareCode()+shareCode()+shareCode();
async function ensureCasa(){
  if(S.casa)return true;
  me().joined=true;
  const id=shareCode(),k=longKey(),estado=sharedPart(S);
  const {status}=await casaFetch("/casa/crear",{id,k,uid:S.uid,estado});
  if(status!==200)return false;
  S.casa={id,k,rev:1};setBase(estado);_saveCasa();return true;
}
const inviteLink=pid=>appLink(`casa=${S.casa.id}&k=${encodeURIComponent(S.casa.k)}&p=${encodeURIComponent(pid)}`);
async function invitePerson(pid){
  if(!servidorOn()){toast("Para invitar hace falta conexión");return}
  const p=S.people.find(x=>x.id===pid);if(!p)return;
  if(!p.name){toast("Ponle nombre primero en Quién come en casa");return}
  if(!(await ensureCasa())){toast("No se ha podido crear la casa. Prueba en un momento");return}
  await casaPush();
  shareText("Únete a nuestra casa en Táper",`🏠 ${me().name||"Te"} te ha añadido a nuestra casa en Táper, ${p.name}. Entra, dime qué te gusta y haremos el menú y la compra juntos:\n${inviteLink(pid)}`);
}
function casaCard(){
  if(!servidorOn()||!S.onboarded)return "";
  const ads=adults().filter(a=>!isMe(a));
  return `<div class="card"><h2>🏠 Casa compartida</h2>
    <p class="small muted">${S.casa?"Los que estáis en la casa veis y cambiáis el mismo menú, la familia y la compra. Los gustos, la dieta y el deporte de cada uno los pone cada cual en su móvil.":"Invita a tu pareja (u otro adulto de casa): tendrá Táper en su móvil con el mismo menú y la misma compra, y podrá cambiar cosas. Cada uno pone sus propios gustos."}</p>
    ${ads.length?ads.map(a=>`<div class="row" style="justify-content:space-between;margin:6px 0"><span>${esc(personName(a))}${a.joined?` <span class="pill ligera">✓ En la casa</span>`:""}</span><button class="btn ${a.joined?"ghost ":""}small" data-invite="${esc(a.id)}">${a.joined?"Reenviar enlace":"📩 Invitar"}</button></div>`).join("")
      :`<p class="small">Primero añade a la otra persona en <b>Quién come en casa</b>, como adulto.</p><button class="btn ghost small" data-goedit="familia">Añadir adulto</button>`}
    ${S.casa?`<button class="btn ghost small" id="casaLeave" style="margin-top:6px">Salir de la casa compartida</button>`:""}</div>`;
}
function bindCasa(root){
  root.querySelectorAll("[data-invite]").forEach(b=>b.onclick=()=>invitePerson(b.dataset.invite));
  root.querySelectorAll("[data-goedit]").forEach(b=>b.onclick=()=>openWizard(b.dataset.goedit));
  root.querySelector("#casaLeave")?.addEventListener("click",()=>{
    showDialog(`<div class="mod">${closeBtn}<h2>¿Salir de la casa compartida?</h2><p class="small muted">Te quedas con una copia de todo tal como está ahora, pero dejarás de ver los cambios de los demás.</p>
      <div class="actions"><button class="btn wide" id="clYes">Salir</button><button class="btn ghost wide" data-x>Cancelar</button></div></div>`);
    dlg.querySelector("#clYes").onclick=()=>{delete S.casa;setBase(null);save();dlg.close();render();toast("Has salido de la casa compartida")}});
}

/* ---------- Entrar en una casa con el enlace ---------- */
async function joinFromLink(){
  const u=new URLSearchParams(location.search),id=(u.get("casa")||"").toUpperCase(),k=u.get("k")||"",pid=u.get("p")||"";
  if(!id)return false;
  history.replaceState(null,"",location.pathname);
  if(!servidorOn())return false;
  if(S.casa&&S.casa.id===id){toast("Ya estás en esta casa");return false}
  const {status,d}=await casaFetch("/casa?id="+encodeURIComponent(id)+"&k="+encodeURIComponent(k));
  if(status!==200||!d){showDialog(`<div class="mod">${closeBtn}<h2>Esta invitación ya no vale</h2><p class="small muted">Pide a quien te la mandó un enlace nuevo desde Perfil › Casa compartida.</p></div>`);return true}
  const fam=mergeState(d.estado),p=fam.people.find(x=>x.id===pid)||fam.people.find(x=>x.kind==="adulto"&&x.id!=="yo");
  const owner=fam.people.find(x=>x.id==="yo");
  showDialog(`<div class="mod">${closeBtn}<h2>🏠 ${owner&&owner.name?esc(owner.name)+" te invita":"Te invitan"} a su casa</h2>
    <p>Tendrás el mismo menú y la misma lista de la compra${owner&&owner.name?" que "+esc(owner.name):""}, y podrás cambiar cosas.</p>
    ${p?`<p class="small muted">Entrarás como <b>${esc(personName(p))}</b>. Solo te preguntaré lo tuyo: objetivos, deporte, dieta y gustos.</p>`:""}
    ${S.onboarded?`<p class="small muted">Ya tenías un plan en este móvil: guardo una copia por si quieres recuperarlo (Perfil › Copia).</p>`:""}
    <div class="actions"><button class="btn wide" id="jnYes">Entrar en la casa</button><button class="btn ghost wide" data-x>Ahora no</button></div></div>`);
  dlg.querySelector("#jnYes").onclick=()=>{
    if(S.onboarded)try{snapshot()}catch(e){}
    const keep={};for(const k2 of Object.keys(S))if(LOCAL_KEYS.has(k2))keep[k2]=S[k2];
    S=mergeState({...d.estado,...keep});
    S.casa={id,k,rev:d.rev};setBase(d.estado);
    if(p){S.meId=p.id;const me2=S.people.find(x=>x.id===p.id);me2.joined=true}
    S.onboarded=false;S.joining=true;_saveCasa();queueCasa();
    dlg.close();wiz={i:0,single:null,started:true};tab="wizard";render();
  };
  return true;
}
// Fin del alta de quien se une: ya puede ver el menú de la casa
function finishJoin(){
  S.joining=false;S.onboarded=true;save();
  if(typeof trackOnBoot==="function")trackOnBoot();
  preparingScreen(()=>{refreshPlans&&refreshPlans();save()},()=>{tab="menu";render();toast("Ya estás en la casa. Lo que cambies lo veréis los dos")});
}
async function casaOnBoot(){if(await joinFromLink())return true;if(casaOn())casaPull();return false}
