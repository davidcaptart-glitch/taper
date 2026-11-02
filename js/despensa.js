/* Táper · despensa: todo lo que tienes en casa (lo comprado y los tickets), lo que se gasta al cocinar,
   lo que te falta para los próximos días y lo que te sobra (y cómo meterlo en el menú) */
"use strict";

// S.despensa = {start, set:{pid:{q,d,ts}} (recuento a mano), adj:[{id,pid,q,d,ts,lot?}] (añadido o quitado a mano; lot: de una entrada concreta),
//   gone:{"ticket|línea":true}, por:{hueco:raciones} (las raciones de cada comida ya pasada, como eran ese día),
//   snap:{"mes|lista":1} (compras hechas de antes ya apuntadas en S.bought), fzStart (desde cuándo cuenta lo congelado), fzu (S.freezerUsed ya pasado a ajustes)}
// S.bought = {"mes|lista|producto":{pid,q,at,ts,done?}}: lo que compraste de cada lista, tal como era al marcarlo (la lista puede cambiar después)
// ts = Date.now() del momento: dentro de un día, lo que pasa después de un recuento se suma o se resta sobre él
function despensaData(){
  if(!S.despensa)S.despensa={};const D=S.despensa;
  if(!D.start){D.start=todayISO().slice(0,8)+"01";save()}   // empieza contando desde el día 1 del mes en que se abre
  D.set=D.set||{};D.adj=D.adj||[];D.gone=D.gone||{};D.por=D.por||{};D.snap=D.snap||{};D.fzu=D.fzu||{};
  // Ajustes de antes sin id (en la casa compartida se juntan por id): el mismo id en todos los móviles
  D.adj.forEach((a,i)=>{if(!a.id)a.id="adj"+i+"-"+a.pid+"-"+a.d});
  // «Ya no está» del congelador de antes (S.freezerUsed: un contador por producto) pasa a ser un ajuste, una sola vez
  for(const [pid,v] of Object.entries(S.freezerUsed||{})){const x=Number(v)-(Number(D.fzu[pid])||0);if(x>0&&P[pid]){D.adj.push({id:"fzu-"+pid+"-"+v,pid,q:-x,d:todayISO()});D.fzu[pid]=Number(v)}}
  // Lo congelado que se compró antes de empezar la despensa sigue en el congelador (como mucho, 6 meses antes)
  if(D.fzStart==null&&Object.keys(P).length){let f=D.start;const lim=addDays(D.start,-183);
    for(const k of Object.keys(S.checks||{})){const [m,,pid]=k.split("|"),p=P[pid];if(p&&(p.keep==="congelar"||p.keep==="congelado")&&S.checks[k]){const at=(S.checkedAt||{})[k]||m+"-01";if(at<f)f=at}}
    for(const e of S.freezer||[])if(e.at&&e.at<f)f=e.at;D.fzStart=f<lim?lim:f}
  return D;
}
const isFrozen=pid=>!!P[pid]&&(P[pid].keep==="congelar"||P[pid].keep==="congelado");
// Lo mínimo que cuenta: 1 g o 1 ml; de lo que va por unidades (pizzas, hamburguesas…), cualquier unidad
const dpEps=pid=>P[pid]&&P[pid].unit==="ud"?0.05:1;
const newAdj=(pid,q,lot)=>({id:uid("adj"),pid,q,d:todayISO(),ts:Date.now(),...(lot?{lot}:{})});
const monthsBetween=(a,b)=>{const out=[];for(let m=a;m<=b;m=nextMonthOf(m))out.push(m);return out};
const prevMonthOf=m=>{const [y,mm]=m.split("-").map(Number);return mm===1?`${y-1}-12`:`${y}-${String(mm-1).padStart(2,"0")}`};
// ¿Ese plato ya se ha comido (y se cocinó en casa)? Los de días pasados sí, salvo que dijeras que comisteis fuera o no se hizo
function eatenUse(u){
  // Lo marcaste como cocinado: ya se gastó (aunque luego cenaras fuera); se mira antes que lo que contestaste
  if(u.slot&&u.slot.id&&(S.cooked||{})[u.slot.id])return true;
  const today=todayISO(),st=u.slot&&u.slot.id?((S.meals||{})[u.slot.id]||{}).status:null;
  if(st==="fuera"||st==="nada"||st==="otro")return false;
  return u.date<today||(u.date===today&&!!st);
}
// Horas de cada cosa dentro de un día (para ordenar lo que pasa el mismo día)
const dayMs=d=>parseISO(d).getTime();
const MEAL_AT={desayuno:"08:30",almuerzo:"11:00",merienda:"17:30"};
const mealMs=(d,meal)=>dayMs(d)+toMin(((S.home||{}).mealTimes||{})[meal]||MEAL_AT[meal]||"14:00")*6e4;
// ts guardado (si es de ese día) o una hora por defecto dentro del día
const atMs=(ts,d,dflt)=>ts&&iso(new Date(ts))===d?ts:dayMs(d)+dflt;
// La hora a la que se creó algo con uid(prefijo) (los tickets, las entradas del congelador…)
const idMs=(id,pre)=>{const n=parseInt(String(id||"").slice(pre.length,-4),36);return n>1e12&&n<4e12?n:null};
// Bolsa de un producto que cuenta en la despensa: producto conocido, con peso y en su misma unidad (g o ml)
const bolsaPid=b=>b&&b.pid&&P[b.pid]&&Number(b.peso)>0&&(b.unidad||"g")===P[b.pid].unit?b.pid:null;
// Lo comprado de cada lista (S.bought). Las marcas sin foto (de antes, de un ticket, de la lista compartida…) se apuntan
// con la lista de ahora; las desmarcadas se quitan; las «Ya he hecho esta compra» de antes cuentan todo lo que había en la lista
function syncBought(){
  const B=S.bought=S.bought||{},ck=S.checks||{},D=despensaData(),sh={};if(!Object.keys(P).length)return B;
  const from=prevMonthOf((D.fzStart<D.start?D.fzStart:D.start).slice(0,7));
  const get=m=>{if(!(m in sh))try{sh[m]=shopping(m,true)}catch(e){sh[m]=null}return sh[m]};
  const day=(m,key)=>{const w=weeksInMonth(m),ws=w[key==="mes"?mesWeek(w):Number(key)]||w[0];return ws?deliveryDate(ws):m+"-01"};
  for(const k of Object.keys(ck)){if(!ck[k]||B[k])continue;const [m,key,pid]=k.split("|");if(!P[pid]||!/^\d{4}-\d\d$/.test(m||"")||m<from)continue;
    const s=get(m),l=s&&s.lists[key],it=l&&l.items.find(i=>i.pid===pid);
    B[k]={pid,q:it?it.packs*P[pid].env:0,at:(S.checkedAt||{})[k]||day(m,key)}}
  for(const k of Object.keys(B))if(!ck[k]&&!B[k].done)delete B[k];
  for(const [sk,d] of Object.entries(S.shopDone||{})){if(D.snap[sk]||!d)continue;const [m,key]=sk.split("|");if(!m||m<from){D.snap[sk]=1;continue}
    const s=get(m),l=s&&s.lists[key];if(!l)continue;
    for(const it of l.items){const k=checkKey(m,key,it.pid);if(!B[k]&&!ck[k]&&P[it.pid])B[k]={pid:it.pid,q:it.packs*P[it.pid].env,at:typeof d==="string"?d:day(m,key),done:true}}
    D.snap[sk]=1}
  return B;
}
// Foto de lo comprado al marcarlo (it: la línea de la lista tal como se ve)
function snapBought(k,it){
  const [m,key,pid]=k.split("|");if(!P[pid])return;S.bought=S.bought||{};
  if(!it)try{it=shopping(m).lists[key].items.find(i=>i.pid===pid)}catch(e){}
  const at=(S.checkedAt||{})[k]||todayISO();if(it)S.bought[k]={pid,q:it.packs*P[pid].env,at,...(at===todayISO()?{ts:Date.now()}:{})};
}
// Lo que se gastó en una comida ya pasada, con las raciones de aquel día (si luego cambia la familia, no se recalcula)
function pastQty(u,D,today){
  const id=u.slot&&u.slot.id,por=u.slot&&u.slot.portions;if(!id||!(por>0)||u.date>=today)return u.q;
  const ck=(S.cooked||{})[id],p=ck&&typeof ck==="object"&&Number(ck.p)>0?Number(ck.p):D.por[id];
  if(p==null){D.por[id]=por;return u.q}
  return u.q*p/por;
}
// Lo que entra (compras marcadas, compras hechas, tickets, congelador, bolsas, a mano) y lo que sale (platos cocinados), en orden
function despensaEvents(){
  const D=despensaData(),today=todayISO(),ev=[],tk=S.tickets||[];
  const first=D.fzStart&&D.fzStart<D.start?D.fzStart:D.start,st=pid=>isFrozen(pid)?first:D.start;
  // Compras marcadas. Si hay ticket de esa lista con ese producto, cuenta el ticket (es lo que compraste de verdad);
  // un ticket suelto con el mismo producto, ±2 días, es la misma compra (subida desde la Despensa)
  const B=syncBought(),inTk={};for(const t of tk)if(t.list&&t.list!=="suelta")for(const l of t.lines||[])if(l.food&&l.pid)inTk[t.m+"|"+t.list+"|"+l.pid]=true;
  const buys=Object.entries(B).filter(([k,b])=>P[b.pid]&&b.q>0&&!inTk[k]),dup=new Set();
  for(const t of tk)if(!t.list||t.list==="suelta")for(const l of t.lines||[])if(l.food&&l.pid){const x=buys.find(([k,b])=>!dup.has(k)&&b.pid===l.pid&&Math.abs(daysBetween(b.at,t.date))<=2);if(x)dup.add(x[0])}
  for(const [k,b] of buys)if(!dup.has(k)&&b.at>=st(b.pid)&&b.at<=today)ev.push({pid:b.pid,d:b.at,t:atMs(b.ts,b.at,1),q:b.q,src:"compra",id:"c:"+k});
  for(const t of tk)if(t.date>=first&&t.date<=today)(t.lines||[]).forEach((l,i)=>{if(!l.food||!l.pid||!P[l.pid]||l.dev||!(l.amount>0)||t.date<st(l.pid))return;const q=lineQty(l);
    if(q>0)ev.push({pid:l.pid,d:t.date,t:t.at===t.date?atMs(idMs(t.id,"t"),t.date,2):dayMs(t.date)+2,q,src:"ticket",id:"t:"+t.id+"|"+i,uc:l.amount>0?l.amount/q:null})});
  // Lo añadido a mano al congelador
  for(const e of S.freezer||[])if(P[e.pid]&&Number(e.qty)>0&&e.at&&e.at<=today)ev.push({pid:e.pid,d:e.at,t:atMs(e.ts||idMs(e.id,"fz"),e.at,1),q:Number(e.qty),src:"mano",id:e.id,fz:true});
  // Bolsas de un producto: entran enteras; «Usar una» la pasa a la nevera para un plato (move) o la gasta ya
  for(const b of S.bolsas||[]){const bp=bolsaPid(b);if(!bp||!b.at)continue;const lot="b:"+b.id,n=Math.max(0,(Number(b.n)||0)-(Number(b.usadas)||0));
    if(n)ev.push({pid:bp,d:b.at,t:dayMs(b.at),q:n*b.peso,src:"bolsa",id:lot,bag:b.id});
    for(const u of b.usos||[])if(u.d)ev.push({pid:bp,d:u.d,t:atMs(u.ts||idMs(u.id,"bu"),u.d,43200000),q:(Number(u.n)||1)*b.peso,out:true,lot,only:true,move:!!u.slot,at0:b.at})}
  // Los platos ya comidos (los cocinados no salen del plan, sino de lo que se cocinó de verdad: cookedUses, abajo)
  for(const m of monthsBetween(prevMonthOf(first.slice(0,7)),today.slice(0,7)))
    for(const u of monthUses(m))if(u.pid&&P[u.pid]&&u.date>=st(u.pid)&&!(u.slot&&u.slot.id&&(S.cooked||{})[u.slot.id])&&eatenUse(u))ev.push({pid:u.pid,d:u.date,t:mealMs(u.date,u.slot.meal),q:pastQty(u,D,today),out:true,u});
  // Lo cocinado: la receta que se hizo y las raciones que se hicieron (aunque luego se cambiara el plato del día)
  for(const e of cookedUses(D.start))if(e.d<=today&&e.d>=st(e.pid))ev.push({...e,t:mealMs(e.d,e.u.slot.meal)});
  // Comidas «de la despensa» ya comidas (un producto o una bolsa)
  for(const x of despSlots())if(x.date>=D.start&&slotEaten(x.id)){const t=mealMs(x.date,x.meal),u={slot:{id:x.id,date:x.date,meal:x.meal},r:null,label:"De la despensa"};
    if(x.k.startsWith("p:")&&P[x.k.slice(2)])ev.push({pid:x.k.slice(2),d:x.date,t,q:despItemQty(x),out:true,u});
    else if(x.k.startsWith("b:")){const b=(S.bolsas||[]).find(y=>y.id===x.k.slice(2)),bp=bolsaPid(b);if(bp)ev.push({pid:bp,d:x.date,t,q:x.n*b.peso,out:true,lot:"b:"+b.id,only:true,u})}}
  for(const [pid,s] of Object.entries(D.set))if(P[pid]&&s&&s.d)ev.push({pid,d:s.d,t:atMs(s.ts,s.d,86399998),q:Number(s.q)||0,set:true});
  for(const a of D.adj)if(P[a.pid]&&a.d)ev.push({pid:a.pid,d:a.d,t:atMs(a.ts,a.d,86399999),q:Number(a.q)||0,adj:true,lot:a.lot,only:!!a.lot,id:a.id});
  return ev.sort((a,b)=>a.t-b.t||(a.out?1:0)-(b.out?1:0));
}
const unitCost=pid=>price(pid)/P[pid].env;
let despCache={k:null,v:null};
// Lo que hay en casa, por entradas (lotes): cada compra, ticket, bolsa o cosa añadida a mano, con lo que le queda.
// Se gasta primero lo más antiguo fuera de las bolsas y, si no hay, de las bolsas (así se sabe qué bolsa se gastó al cocinar)
function despensaState(){
  const k=S.updatedAt+"|"+todayISO()+"|"+(PR&&PR.fecha);if(despCache.k===k)return despCache.v;
  // paid: lo que pagaste por unidad en tu último ticket de cada producto (si no hay ticket, el precio del súper)
  // short: lo que un plato necesitó y no había en la despensa (salió de otro sitio)
  const lots={},meals={},paid={},short={};const uc=pid=>paid[pid]??unitCost(pid);
  const L=pid=>lots[pid]=lots[pid]||[],sum=pid=>L(pid).reduce((t,x)=>t+x.left,0);
  const take=(pid,q,lot,only,who)=>{
    const ls=L(pid).filter(x=>x.left>0&&(!only||x.id===lot)).sort((a,b)=>(b.id===lot)-(a.id===lot)||(!!a.bag)-(!!b.bag)||a.at.localeCompare(b.at));
    for(const x of ls){if(q<=0)break;const t=Math.min(x.left,q);x.left-=t;q-=t;if(x.bag&&who)(x.by=x.by||[]).push(who)}return Math.max(0,q)};
  for(const e of despensaEvents()){if(e.uc)paid[e.pid]=e.uc;
    if(e.set){const s=sum(e.pid);if(e.q<s)take(e.pid,s-e.q);else if(e.q>s)L(e.pid).push({id:"r:"+e.pid+"|"+e.d,q:e.q-s,left:e.q-s,at:e.d,src:"recuento"})}
    else if(e.adj){if(e.q>0)L(e.pid).push({id:e.id,q:e.q,left:e.q,at:e.d,src:"mano"});else if(e.q<0)take(e.pid,-e.q,e.lot,e.only)}
    else if(e.out){const miss=take(e.pid,e.q,e.lot,e.only,e.u?{d:e.d,u:e.u}:null);
      if(e.move&&e.q-miss>0)L(e.pid).push({id:"m:"+e.lot+"|"+e.t,q:e.q-miss,left:e.q-miss,at:e.at0||e.d,src:"bolsa"});   // descongelándose en la nevera
      if(e.u){if(miss>dpEps(e.pid))(short[e.pid]=short[e.pid]||[]).push({d:e.d,q:miss});
        // Lo que cuesta cada comida: lo que lleva el plato a precio del súper (se haya comprado o no)
        const key=e.u.slot.id||e.u.slot.date+"|"+e.u.slot.meal,mm=meals[key]=meals[key]||{key,date:e.u.slot.date,meal:e.u.slot.meal,r:e.u.r,cost:0,items:[]};
        mm.cost+=e.q*uc(e.pid);mm.items.push({pid:e.pid,q:e.q})}}
    else L(e.pid).push({id:e.id,q:e.q,left:e.q,at:e.d,src:e.src,bag:e.bag||null,fz:!!e.fz})}
  const stock={},bagged={};
  for(const pid of Object.keys(lots)){const s=sum(pid);if(s>=dpEps(pid)){stock[pid]=s;const bg=lots[pid].filter(x=>x.bag).reduce((t,x)=>t+x.left,0);if(bg>=dpEps(pid))bagged[pid]=bg}}
  // Lo del ticket sin receta que se comió: cuenta lo que costó
  for(const x of despSlots())if(x.k.startsWith("t:")&&slotEaten(x.id)&&x.date>=despensaData().start){const tl=despTicketLine(x.k);if(!tl)continue;
    const mm=meals[x.id]=meals[x.id]||{key:x.id,date:x.date,meal:x.meal,r:null,cost:0,items:[]};mm.cost+=tl.l.amount/Math.max(1,tl.l.qty||1)*x.n}
  for(const mm of Object.values(meals))if(!mm.r)mm.name="🧺 "+[...new Set(despSlots().filter(x=>x.id===mm.key).map(x=>despItemName(x.k)))].join(", ");
  const v={stock,bagged,lots,uc,short,meals:Object.values(meals).sort((a,b)=>b.date.localeCompare(a.date)||(a.meal<b.meal?1:-1))};
  despCache={k,v};return v;
}
// Platos que vienen (sin comer aún, ni fuera), del día from al to (sin incluir): [{pid,q,date,r,meal}]
function upcomingUses(from,to,exceptId){
  const out=[];
  for(const m of monthsBetween(prevMonthOf(from.slice(0,7)),to.slice(0,7)))for(const u of monthUses(m,exceptId)){
    if(!u.pid||!P[u.pid]||u.date<from||u.date>=to||eatenUse(u))continue;
    const st=u.slot&&u.slot.id?((S.meals||{})[u.slot.id]||{}).status:null;if(st==="fuera"||st==="nada")continue;
    out.push({pid:u.pid,q:u.q,date:u.date,r:u.r,meal:u.slot.meal,u})}
  for(const x of despSlots())if(x.k.startsWith("p:")&&P[x.k.slice(2)]&&x.date>=from&&x.date<to&&x.id!==exceptId&&!slotEaten(x.id))
    out.push({pid:x.k.slice(2),q:despItemQty(x),date:x.date,r:{name:"de la despensa"},meal:x.meal});
  return out;
}
// Lo que piden los platos que vienen, del día from al to (sin incluir), y el primero que lo usa
function upcomingNeed(from,to,exceptId){
  const need={},first={};
  for(const x of upcomingUses(from,to,exceptId)){need[x.pid]=(need[x.pid]||0)+x.q;if(!first[x.pid]||x.date<first[x.pid].date)first[x.pid]={date:x.date,r:x.r,meal:x.meal}}
  return {need,first};
}
// Lo mismo, día a día por producto: {pid:[[día,cantidad]…]} (para saber cuánto se habrá gastado antes de una compra)
function needByDay(from,to){const out={};for(const x of upcomingUses(from,to))(out[x.pid]=out[x.pid]||[]).push([x.date,x.q]);return out}
// Te falta: lo que necesitan los platos de los próximos 7 días y no tienes en casa
function despensaMissing(){
  const {stock}=despensaState(),today=todayISO(),{need,first}=upcomingNeed(today,addDays(today,7)),out=[];
  const pend=pendingShop();
  for(const [pid,q] of Object.entries(need)){const miss=q-(stock[pid]||0);if(miss>Math.max(dpEps(pid),P[pid].env*.05))out.push({pid,q:miss,packs:packsFor(pid,miss),first:first[pid],inList:pend.has(pid)})}
  return out.sort((a,b)=>a.inList-b.inList||a.first.date.localeCompare(b.first.date));
}
// Lo que ya está en una lista de la compra de esta semana, la que viene o la del mes, sin comprar todavía
function pendingShop(){
  const today=todayISO(),out=new Set();
  for(const ws of [weekStartFor(today),weekStartFor(addDays(today,7))]){const m=monthOfWeek(ws);let sh;try{sh=shopping(m)}catch(e){continue}
    for(const key of [String(sh.weeks.indexOf(ws)),"mes"]){const l=sh.lists[key];if(!l||shopIsDone(m,l))continue;
      for(const it of l.items)if(!S.checks[checkKey(m,key,it.pid)])out.add(it.pid)}}
  return out;
}
// Te sobrará: lo que tienes menos todo lo que piden los platos ya planificados
function despensaSpare(){
  const {stock}=despensaState(),today=todayISO(),{need}=upcomingNeed(today,addDays(today,70));
  return Object.entries(stock).map(([pid,q])=>({pid,q:q-(need[pid]||0)})).filter(x=>x.q>Math.max(dpEps(x.pid),P[x.pid].env*.15)).sort((a,b)=>b.q*unitCost(b.pid)-a.q*unitCost(a.pid));
}

/* ---------- Pantalla ---------- */
const KEEP_GROUP={fresco:"Nevera, fruta y verdura",despensa:"Despensa",congelar:"Congelador",congelado:"Congelador"};
let despFilter="todo";
function renderDespensa(){
  const D=despensaData(),{stock,bagged,meals,uc}=despensaState(),today=todayISO();
  const pids=Object.keys(stock).sort((a,b)=>P[a].name.localeCompare(P[b].name));
  const value=pids.reduce((t,p)=>t+stock[p]*uc(p),0);
  const cm=today.slice(0,7),monthMeals=meals.filter(x=>x.date.slice(0,7)===cm),spentM=monthMeals.reduce((t,x)=>t+x.cost,0);
  const {first}=upcomingNeed(today,addDays(today,70)),miss=despensaMissing(),spare=despensaSpare(),spareSet=new Set(spare.map(x=>x.pid));
  let h=`<section class="view">${viewHead(pids.length+" "+(pids.length===1?"producto":"productos")+" en casa","Tu *despensa*")}
    <p class="small muted">Se llena con lo que marcas como comprado, tus tickets, el congelador y tus bolsas, y se gasta al cocinar cada plato. Si algo no cuadra, tócalo y pon lo que te queda.</p>
    <div class="row" style="gap:8px;flex-wrap:nowrap"><button class="btn" id="dpTicket" style="flex:1">${ico("receipt")} Subir un ticket</button><button class="btn ghost" id="dpTickets" style="flex:1">${ico("chart-bar")} Tickets e informe</button></div>
    <div class="dsum"><div><b>${eur(value)}</b><small>vale lo que tienes</small></div><div><b>${eur(spentM)}</b><small>cocinado en ${esc(monthName(cm).split(" ")[0].toLowerCase())}</small></div><div><b>${monthMeals.length}</b><small>${monthMeals.length===1?"comida hecha":"comidas hechas"}</small></div></div>`;
  if(!D.checked)h+=`<div class="infobox">🧺 <b>Primera vez:</b> he juntado lo que has comprado este mes y he restado lo que ya habéis cocinado. Como el menú ha ido cambiando, seguro que algo no cuadra: repasa la lista y toca lo que esté mal. <button class="btn small" id="dpChecked" style="margin-top:6px">Ya lo he repasado</button></div>`;
  // Te falta
  h+=`<div class="card"><h2>${ico("shopping-cart")} Te falta para los próximos 7 días</h2>`;
  if(!miss.length)h+=`<p class="small okbox">Tienes todo lo que piden los platos de esta semana.</p>`;
  else{const toAdd=miss.filter(x=>!x.inList);
    h+=`<p class="small muted">Lo piden los platos que vienen y no lo tienes en casa (unos ${eur(miss.reduce((t,x)=>t+x.packs*price(x.pid),0))}).</p>`+
    miss.map(x=>`<div class="fixed"><span>${esc(P[x.pid].name)}<small>${x.packs} × ${esc(fmtQty(P[x.pid].env,P[x.pid].unit))} · para el ${esc(DSHORT[dow(x.first.date)]+" "+shortDate(x.first.date))} (${esc(x.first.r.name.toLowerCase())})${x.inList?` · <b style="color:var(--ok)">✓ ya en tu lista</b>`:""}</small></span><b>${eur(x.packs*price(x.pid))}</b></div>`).join("")+
    (toAdd.length?`<div class="actions"><button class="btn small" id="dpBuy">${ico("plus")} Añadir ${toAdd.length===miss.length?"":toAdd.length+" "}a la próxima compra</button></div>`:`<p class="small muted">Todo está ya en tu lista de la compra: solo falta comprarlo.</p>`)}
  h+=`</div>`;
  // Te sobrará: lo que tienes menos todo lo que piden los platos planificados (algún plato puede usar una parte antes)
  if(spare.length)h+=`<div class="card"><h2>${ico("package")} Te sobrará después del menú</h2><p class="small muted">Lo tienes en casa y los platos que ya están en el menú no lo gastan entero (unos ${eur(spare.reduce((t,x)=>t+x.q*uc(x.pid),0))}).</p>
    ${spare.slice(0,12).map(x=>`<div class="fixed"><span>${esc(P[x.pid].name)}<small>sobrarán ${esc(fmtQty(x.q,P[x.pid].unit))}${first[x.pid]?` (lo demás es para el ${esc(DSHORT[dow(first[x.pid].date)]+" "+shortDate(first[x.pid].date))})`:""} · ${eur(x.q*uc(x.pid))}</small></span><button class="btn ghost small" data-dpuse="${x.pid}">Ponerlo en el menú</button></div>`).join("")}
    <div class="actions"><button class="btn small" id="dpRedo">${ico("repeat")} Rehacer los próximos 7 días con lo que tengo</button></div></div>`;
  // Lo que tienes
  const groups=[...new Set(pids.map(p=>KEEP_GROUP[P[p].keep]||"Despensa"))];
  h+=`<h2 style="margin:18px 0 8px">Lo que tienes</h2><div class="chips" style="margin-bottom:8px">${["todo",...groups].map(g=>chip("data-dpf",g,despFilter===g,g==="todo"?"Todo":g)).join("")}</div>`;
  if(!pids.length)h+=`<div class="empty"><p>Aún no hay nada. Marca lo que compras en la lista o sube el ticket, o añádelo abajo.</p></div>`;
  for(const p of pids){const g=KEEP_GROUP[P[p].keep]||"Despensa";if(despFilter!=="todo"&&despFilter!==g)continue;const f=first[p];
    h+=`<button class="item dpi" data-dpe="${p}">${prodImg(p)}<span class="t">${esc(P[p].name)}<small>${esc(fmtQty(stock[p],P[p].unit))}${bagged[p]?` (${esc(fmtQty(bagged[p],P[p].unit))} en bolsas)`:""} · ${eur(stock[p]*uc(p))}${f?` · para el ${esc(DSHORT[dow(f.date)]+" "+shortDate(f.date))}`:""}${spareSet.has(p)?(f?" · te sobrará algo":" · sin plato previsto"):""}</small></span><span class="p">${ico("chevron-right")}</span></button>`}
  // Otras cosas de los tickets (sin receta)
  const otros=ticketOtros();
  if(otros.length&&(despFilter==="todo"))h+=`<div class="card"><h2>Otras cosas de tus tickets</h2><p class="small muted">Comida que no va en ninguna receta (pizzas, caprichos…). Márcala cuando se acabe.</p>
    ${otros.map(o=>`<div class="fixed"><span>${esc(despItemName(o.k))}<small>${o.l.kg?String(o.l.kg).replace(".",",")+" kg":`quedan ${o.left} de ${o.total}`} · ${eur(o.l.amount)} · ${esc(shortDate(o.t.date))}${o.res.length?` · para el ${esc(o.res.map(x=>despSlotLabel(x.id)).join("; "))}`:""}</small></span><span class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn small" data-dpday="${esc(o.k)}">Comerlo un día</button><button class="btn ghost small" data-dpgone="${esc(o.k.slice(2))}">Se acabó</button></span></div>`).join("")}</div>`;
  // Lo que se ha gastado
  h+=`<div class="card"><h2>${ico("chef-hat")} Lo que vas gastando</h2><p class="small muted">Cada comida cocinada, a precio del súper. Cuenta las de días pasados salvo las que marcaste como comida fuera o no hecha.</p>`;
  h+=meals.length?meals.slice(0,12).map(x=>`<div class="fixed"><span>${esc(x.r?x.r.name:x.name||"Comida")}<small>${esc(DSHORT[dow(x.date)]+" "+shortDate(x.date))} · ${esc(SMALL[x.meal]?SMALL[x.meal][1].toLowerCase():x.meal)}</small></span><b>${eur(x.cost)}</b></div>`).join(""):`<p class="small muted">Aún no hay comidas cocinadas desde el ${esc(shortDate(D.start))}.</p>`;
  h+=`</div>`;
  // Añadir a mano
  h+=`<div class="card"><h2>Añadir algo que tienes</h2>${prodPicker("dpP")}<div class="row" style="margin-top:8px"><input type="number" id="dpQ" min="0" step="any" placeholder="Cantidad" style="flex:1"><span class="small" id="dpU">—</span></div>
    <button class="btn small" id="dpAdd" style="margin-top:8px">Añadir</button>
    <p class="small muted" style="margin-top:10px">${ico("snowflake")} ${(n=>n?`${n} ${n===1?"bolsa":"bolsas"} en el congelador. `:"")(bolsasState().reduce((t,b)=>t+b.left,0))}Lo congelado y tus bolsas, con los días que llevan dentro: <button class="btn ghost small" id="dpFz">Ver el congelador</button></p></div></section>`;
  main.innerHTML=h;
  document.getElementById("dpTickets").onclick=()=>{tab="tickets";render();scrollTo(0,0)};
  document.getElementById("dpTicket").onclick=()=>openTicketScan(false,null,{m:today.slice(0,7),key:"suelta"});
  document.getElementById("dpChecked")?.addEventListener("click",()=>{D.checked=todayISO();save();render();toast("Perfecto. A partir de ahora se va ajustando sola")});
  main.querySelectorAll("[data-dpf]").forEach(b=>b.onclick=()=>{despFilter=b.dataset.dpf;render()});
  main.querySelectorAll("[data-dpe]").forEach(b=>b.onclick=()=>openDespensaItem(b.dataset.dpe));
  main.querySelectorAll("[data-dpgone]").forEach(b=>b.onclick=()=>{D.gone[b.dataset.dpgone]=true;save();render()});
  main.querySelectorAll("[data-dpday]").forEach(b=>b.onclick=()=>openPickDay(b.dataset.dpday,1));
  main.querySelectorAll("[data-dpuse]").forEach(b=>b.onclick=()=>useInMenu(b.dataset.dpuse));
  document.getElementById("dpBuy")?.addEventListener("click",()=>addMissingToShop(miss.filter(x=>!x.inList)));
  document.getElementById("dpRedo")?.addEventListener("click",confirmRedoWithStock);
  document.getElementById("dpFz").onclick=()=>{tab="congelador";render();scrollTo(0,0)};
  const pick=bindProdPicker("dpP",Object.values(P),p=>{document.getElementById("dpU").textContent=p?p.unit:"—"});
  document.getElementById("dpAdd").onclick=()=>{const p=pick(),q=Number(document.getElementById("dpQ").value);if(!p){toast("Busca y elige el producto");return}if(!(q>0)){toast("Indica la cantidad");return}
    D.adj.push(newAdj(p.id,q));save();render();toast(p.name+": añadido a la despensa")};
}
// Corregir lo que queda de un producto (recuento): desde hoy cuenta esa cantidad
function openDespensaItem(pid){
  const p=P[pid],{stock,bagged}=despensaState(),bg=bagged[pid]||0,q=Math.round(((stock[pid]||0)-bg)*100)/100,{first}=upcomingNeed(todayISO(),addDays(todayISO(),28)),f=first[pid];
  const half=p.env>=10?Math.round(p.env/2):p.env/2;   // medio envase de algo que va por unidades: media unidad
  showDialog(`<div class="mod">${closeBtn}<div class="veb">${esc(KEEP_GROUP[p.keep]||"Despensa")}</div><h2 class="vh" style="font-size:1.6rem">${esc(p.name)}</h2>
    <p class="small muted">Envase de ${esc(fmtQty(p.env,p.unit))} · ${eur(price(pid))}${f?` · lo usa ${esc(f.r.name.toLowerCase())} el ${esc(DSHORT[dow(f.date)]+" "+shortDate(f.date))}`:""}</p>
    <div class="field"><label for="dpIn">¿Cuánto te queda? (${esc(p.unit)})${bg?` · sin contar ${esc(fmtQty(bg,p.unit))} en bolsas del congelador`:""}</label><input type="number" id="dpIn" min="0" step="any" value="${q}"></div>
    <div class="chips">${[["0","Se acabó"],[String(half),"Medio envase"],[String(p.env),"1 envase"],[String(p.env*2),"2 envases"]].map(([v,t])=>`<button type="button" class="chip" data-dpq="${v}">${t}</button>`).join("")}</div>
    <div class="actions"><button class="btn wide" id="dpSave">Guardar</button></div>
    ${q>0?`<div class="actions"><button class="btn ghost wide" id="dpDay">🧺 Comerlo un día (sin receta)</button></div>`:""}</div>`);
  dlg.querySelector("#dpDay")?.addEventListener("click",()=>openPickDay("p:"+pid,1));
  dlg.querySelectorAll("[data-dpq]").forEach(b=>b.onclick=()=>{dlg.querySelector("#dpIn").value=b.dataset.dpq});
  dlg.querySelector("#dpSave").onclick=()=>{const v=Number(dlg.querySelector("#dpIn").value);if(!(v>=0)){toast("Pon una cantidad");return}
    // Desde ahora cuenta esa cantidad (más lo de las bolsas); lo que pase después se suma o se resta encima
    const D=despensaData();D.set[pid]={q:v+bg,d:todayISO(),ts:Date.now()};save();dlg.close();render();toast(v?"Apuntado: "+fmtQty(v,p.unit):"Quitado de la despensa")};
}
// La próxima compra semanal por hacer: ni hecha, ni con ticket (la de esta semana o, si ya está, la siguiente)
function nextOpenList(){
  const today=todayISO();
  for(let i=0;i<6;i++){const ws=weekStartFor(addDays(today,7*i)),m=monthOfWeek(ws),key=String(weeksInMonth(m).indexOf(ws));if(S.home.start&&addDays(ws,6)<S.home.start)continue;
    let sh;try{sh=shopping(m)}catch(e){continue}const l=sh.lists[key];if(l&&!shopIsDone(m,l))return {m,key,ws,i}}
  return null;
}
// Añadir lo que falta a esa compra (S.extraBuy[mes][lista][producto] = cantidad)
function addMissingToShop(miss){
  const x=nextOpenList();if(!x){toast("No encuentro ninguna compra por hacer en las próximas semanas");return}
  S.extraBuy=S.extraBuy||{};const L=(S.extraBuy[x.m]=S.extraBuy[x.m]||{})[x.key]=S.extraBuy[x.m][x.key]||{};
  for(const it of miss)if(P[it.pid]&&it.q>0)L[it.pid]=(L[it.pid]||0)+it.q;
  save();month=x.m;listSel=x.key;tab="compra";render();scrollTo(0,0);
  toast(`Añadido a la compra ${x.i===0?"de esta semana":x.i===1?"de la semana que viene":"de la semana del "+shortDate(x.ws)}: ${miss.length} ${miss.length===1?"producto":"productos"}`);
}
/* ---------- Buscador de productos (escribe y elige) ---------- */
const foldTxt=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const prodPicker=id=>`<input type="search" id="${id}S" placeholder="Busca: arroz, pollo, pizza…" autocomplete="off" aria-label="Buscar producto"><div class="chips" id="${id}R" style="margin-top:6px"></div>`;
// Devuelve una función que da el producto elegido (o null); onPick se llama al elegir o al cambiar la búsqueda
function bindProdPicker(id,prods,onPick){
  const inp=document.getElementById(id+"S"),box=document.getElementById(id+"R");let sel=null;
  const list=prods.filter(p=>p&&p.id&&P[p.id]).sort((a,b)=>a.name.localeCompare(b.name));
  const draw=()=>{const q=foldTxt(inp.value.trim());
    // Primero lo que empieza por lo escrito, luego lo que tiene una palabra que empieza así y luego el resto
    const rank=p=>{const n=foldTxt(p.name);return n.startsWith(q)?0:(" "+n).includes(" "+q)?1:2};
    const hits=sel?[sel]:q?list.filter(p=>foldTxt(p.name).includes(q)).sort((a,b)=>rank(a)-rank(b)).slice(0,10):[];
    box.innerHTML=hits.map(p=>`<button type="button" class="chip" data-pp="${esc(p.id)}" aria-pressed="${sel===p}">${esc(p.name)}</button>`).join("")||(q?`<span class="small muted">No encuentro «${esc(inp.value.trim())}»</span>`:"");
    box.querySelectorAll("[data-pp]").forEach(b=>b.onclick=()=>{sel=sel?null:P[b.dataset.pp];if(sel)inp.value=sel.name;draw();onPick&&onPick(sel)})};
  inp.oninput=()=>{if(sel){sel=null;onPick&&onPick(null)}draw()};draw();
  return ()=>sel;
}
// Huecos que se pueden cambiar: de mañana a 7 días, sin elegir a mano ni platos fijos
function changeableSlots(days){
  const today=todayISO(),out=[];
  for(const s of [...new Set([weekStartFor(addDays(today,1)),weekStartFor(addDays(today,days))])]){const wk=S.plans[s];if(!wk)continue;
    for(const sl of buildSlots(s)){if(sl.date<=today||sl.date>addDays(today,days)||sl.fixed)continue;const v=wk.slots[sl.id];if(v&&v.locked)continue;out.push(sl)}}
  return out;
}
// Cuánto de un plato sale de lo que tienes (por lo que cuesta cada ingrediente)
function stockCover(r,sl,stk){let have=0,all=0;for(const [pid,q] of slotIng(r,sl)){const c=unitCost(pid);all+=q*c;have+=Math.min(q,stk[pid]||0)*c}return all?have/all:0}
// Meter en el menú un plato que use algo que te sobra (el mejor hueco de los próximos 10 días)
function useInMenu(pid){
  const {stock}=despensaState();let best=null;
  for(const sl of changeableSlots(10)){const ctx=makeCtx(weekStartFor(sl.date),sl.id);
    for(const r of candidates(sl))if(r.ing.some(([p])=>p===pid)){const s=scoreRecipe(r,sl,ctx)+4*stockCover(r,sl,stock);if(!best||s>best.s)best={s,r,sl}}}
  if(!best){toast("No encuentro un plato con esto que os encaje en los próximos días");return}
  setSlotRecipe(best.sl,best.r.id);render();
  toast(`${best.r.name}: ${DAYS[dow(best.sl.date)].toLowerCase()} ${shortDate(best.sl.date)}, ${best.sl.meal}`);
}
function confirmRedoWithStock(){
  const n=changeableSlots(7).length;
  showDialog(`<div class="mod">${closeBtn}<h2 class="vh" style="font-size:1.7rem">¿Rehago los próximos días con <em>lo que tienes</em>?</h2>
    <p>Cambio los platos de mañana a 7 días (${n}) por otros que aprovechen lo que hay en tu despensa, para comprar lo menos posible.</p>
    <p class="small muted">No toco los de hoy, los que elegiste a mano ni los platos fijos. Las alergias y dietas se respetan siempre.</p>
    <div class="actions"><button class="btn wide" id="rwOk">Sí, rehacerlos</button></div><div class="actions"><button class="btn ghost" data-x>Ahora no</button></div></div>`);
  dlg.querySelector("#rwOk").onclick=()=>{dlg.close();redoWithStock()};
}
function redoWithStock(){
  const stk={...despensaState().stock},slots=changeableSlots(7).sort((a,b)=>a.id.localeCompare(b.id));let changed=0,used=0;
  for(const sl of slots){const start=weekStartFor(sl.date),wk=S.plans[start],was=wk.slots[sl.id]&&wk.slots[sl.id].recipe;
    delete wk.slots[sl.id];const ctx=makeCtx(start,sl.id);ctx.have=r=>2.5*stockCover(r,sl,stk);ctx.noise=0.4;
    const r=pickFor(sl,ctx);if(!r){if(was)wk.slots[sl.id]={recipe:was};continue}
    wk.slots[sl.id]={recipe:r.id};if(r.id!==was)changed++;
    for(const [pid,q] of slotIng(r,sl)){const t=Math.min(q,stk[pid]||0);used+=t*unitCost(pid);stk[pid]=(stk[pid]||0)-t}}
  for(const s of new Set(slots.map(sl=>weekStartFor(sl.date))))ensureWeek(s);
  save();render();toast(changed?`He cambiado ${changed} ${changed===1?"plato":"platos"}: aprovechan ${eur(used)} de lo que tienes`:"Ya estaban aprovechando lo que tienes");
}

/* ---------- Comer algo de la despensa ----------
   Un hueco del menú puede ser «de la despensa»: las pizzas del viernes, algo que sobra, lo que compraste sin receta…
   No lleva receta ni se compra nada; al comerlo se descuenta. Hueco = {despensa:[{k,n}],locked:true}
   k = "p:producto" (n = envases) o "t:ticket|línea" (n = unidades del ticket) */
const despSlots=()=>{const out=[];for(const wk of Object.values(S.plans))for(const [id,v] of Object.entries(wk.slots||{}))if(v&&v.despensa)for(const it of v.despensa)out.push({id,date:id.slice(0,10),meal:id.slice(11),k:it.k,n:Number(it.n)||0});return out};
function slotEaten(id){const st=((S.meals||{})[id]||{}).status;if(st==="fuera"||st==="nada"||st==="otro")return false;const d=id.slice(0,10),t=todayISO();return d<t||(d===t&&!!st)}
function despTicketLine(k){const [tid,i]=k.slice(2).split("|");const t=(S.tickets||[]).find(x=>x.id===tid);return t&&t.lines[Number(i)]?{t,l:t.lines[Number(i)]}:null}
function despItemName(k){if(k.startsWith("b:")){const b=(S.bolsas||[]).find(x=>x.id===k.slice(2));return b?"Bolsa de "+bolsaName(b).toLowerCase()+(b.peso?" ("+bolsaPeso(b)+")":""):"Bolsa del congelador"}if(k.startsWith("p:"))return P[k.slice(2)]?P[k.slice(2)].name:"Producto";const x=despTicketLine(k);return x?(x.l.name||x.l.desc.charAt(0)+x.l.desc.slice(1).toLowerCase()):"Algo de un ticket"}
const despItemQty=it=>it.k.startsWith("p:")&&P[it.k.slice(2)]?it.n*P[it.k.slice(2)].env:it.n;
// Lo del ticket (sin receta): cuántas unidades quedan, cuántas ya se comieron y cuántas están reservadas para un día
function ticketOtros(){
  const D=despensaData(),out=[],used={},res={};
  for(const x of despSlots())if(x.k.startsWith("t:")){if(slotEaten(x.id))used[x.k]=(used[x.k]||0)+x.n;else(res[x.k]=res[x.k]||[]).push(x)}
  for(const t of S.tickets||[])if(t.date>=D.start)t.lines.forEach((l,i)=>{const k="t:"+t.id+"|"+i;if(!l.food||l.pid||l.dev||!(l.amount>0)||D.gone[t.id+"|"+i])return;
    const total=Math.max(1,l.qty||1),left=total-(used[k]||0);if(left<=0)return;out.push({k,l,t,total,left,res:res[k]||[]})});
  return out;
}
function despSlotLabel(id){const d=id.slice(0,10);return DSHORT[dow(d)]+" "+shortDate(d)+", "+id.slice(11)}
// ¿Aún se puede cambiar esta comida? (no ha pasado su hora, ni está cocinada ni comida)
function slotOpen(id){
  const d=id.slice(0,10),meal=id.slice(11),t=todayISO();if(d<t||slotEaten(id)||(S.cooked||{})[id])return false;
  if(d===t){const now=new Date();if(now.getHours()*60+now.getMinutes()>=toMin(((S.home||{}).mealTimes||{})[meal]||"14:00"))return false}
  return true;
}
// Lo ya apartado para otras comidas de la despensa aún sin comer (sin contar la comida sid): {k:n}
function despReserved(sid){const r={};for(const x of despSlots())if(x.id!==sid&&!slotEaten(x.id))r[x.k]=(r[x.k]||0)+x.n;return r}
// Bolsas de algo crudo (carne, pescado, verdura): no son un plato, se cocinan con una receta
const RAW_BAG=new Set(["carne","pescado","verdura"]);
// Elegir qué comer de la despensa en un hueco (desde «Cambiar plato»)
function openDespensaPick(sid,preset){
  const d=sid.slice(0,10),meal=sid.slice(11),start=weekStartFor(d),wk=S.plans[start];if(!wk)return;
  const cur=wk.slots[sid]&&wk.slots[sid].despensa?wk.slots[sid].despensa:[],n={};for(const it of cur)n[it.k]=it.n;if(preset)n[preset.k]=(n[preset.k]||0)+preset.n;
  // Lo que queda sin apartar para otros días (lo de esta comida sí se puede volver a elegir)
  const {stock,bagged}=despensaState(),otros=ticketOtros(),res=despReserved(sid);
  const rows=[...bolsasState().map(b=>{const k="b:"+b.id,free=b.left-(res[k]||0);return {k,name:"❄️ "+bolsaName(b),sub:`${free} ${free===1?"bolsa":"bolsas"}${b.peso?" de "+bolsaPeso(b):""} en el congelador${res[k]?` (y ${res[k]} para otro día)`:""}`,max:free,step:1,unit:"bolsa"}}),
    ...otros.map(o=>{const free=o.left-(res[o.k]||0);return {k:o.k,name:despItemName(o.k),sub:`${free} de ${o.total} · del ticket del ${shortDate(o.t.date)}`,max:free,step:1,unit:"ud"}}),
    ...Object.keys(stock).sort((a,b)=>P[a].name.localeCompare(P[b].name)).map(pid=>{const k="p:"+pid,free=stock[pid]-(bagged[pid]||0)-(res[k]||0)*P[pid].env;
      return {k,name:P[pid].name,sub:`tienes ${fmtQty(Math.max(0,free),P[pid].unit)}${res[k]?" sin apartar":""} · envase de ${fmtQty(P[pid].env,P[pid].unit)}`,max:Math.ceil(Math.max(0,free)/P[pid].env*2)/2,step:.5,unit:"env."}})]
    .map(r=>({...r,max:Math.max(r.max,n[r.k]||0)})).filter(r=>r.max>0);
  for(const k of Object.keys(n))if(!rows.some(r=>r.k===k))rows.unshift({k,name:despItemName(k),sub:"ya elegido",max:Math.max(n[k],1),step:k.startsWith("p:")?.5:1,unit:k.startsWith("p:")?"env.":"ud"});
  const draw=()=>{
    showDialog(`<div class="mod">${closeBtn}<div class="veb">${esc(DAYS[dow(d)]+" "+shortDate(d))} · ${esc(meal)}</div><h2 class="vh" style="font-size:1.7rem">Comer algo de <em>tu despensa</em></h2>
      <p class="small muted">Elige lo que vais a comer de lo que ya tienes. No hace falta comprar nada y, cuando pase, lo descuento de la despensa.</p>
      ${rows.length?rows.map(r=>`<div class="dprow"><span><b>${esc(r.name)}</b><small>${esc(r.sub)}</small></span><span class="step"><button type="button" data-dpm="${esc(r.k)}|-1" aria-label="Menos">−</button><b>${String(n[r.k]||0).replace(".",",")}</b><button type="button" data-dpm="${esc(r.k)}|1" aria-label="Más">+</button><small>${r.unit}</small></span></div>`).join("")
        :`<p>Tu despensa está vacía. Marca lo que compras o sube los tickets y aparecerá aquí.</p>`}
      <div class="actions"><button class="btn wide" id="dpkOk">Guardar</button></div>
      ${cur.length?`<div class="actions"><button class="btn ghost" id="dpkBack">${mealState(d,meal)==="libre"?"Quitar":"Volver a poner una receta"}</button></div>`:""}</div>`);
    dlg.querySelectorAll("[data-dpm]").forEach(b=>b.onclick=()=>{const i=b.dataset.dpm.lastIndexOf("|"),k=b.dataset.dpm.slice(0,i),dir=Number(b.dataset.dpm.slice(i+1)),r=rows.find(x=>x.k===k);
      n[k]=Math.max(0,Math.min(r.max,Math.round(((n[k]||0)+dir*r.step)*2)/2));const y=dlg.scrollTop;draw();dlg.scrollTop=y});
    dlg.querySelector("#dpkOk").onclick=()=>{const items=Object.entries(n).filter(([,v])=>v>0).map(([k,v])=>({k,n:v}));
      if(!items.length){toast("Elige al menos una cosa");return}
      wk.slots[sid]={despensa:items,locked:true};save();dlg.close();render();toast(`${DAYS[dow(d)]} ${meal}: ${items.map(it=>despItemName(it.k).toLowerCase()).join(", ")}`)};
    dlg.querySelector("#dpkBack")?.addEventListener("click",()=>{delete wk.slots[sid];ensureWeek(start);save();dlg.close();render();toast(mealState(d,meal)==="libre"?"Quitado":"Vuelve a tener receta")});
  };
  draw();
}
// Comidas de los próximos 14 días que aún se pueden cambiar (ni pasadas, ni cocinadas, ni comidas)
// raw: solo las que llevan receta (para cocinar una bolsa de carne, pescado o verdura)
function pickDayOpts(raw){
  const today=todayISO(),opts=[];
  // Las comidas que se cocinan y también las «libres» (sin plan: el viernes de pizza, por ejemplo)
  for(let i=0;i<15;i++){const dd=addDays(today,i),wk=S.plans[weekStartFor(dd)];if(!wk)continue;const sls=buildSlots(weekStartFor(dd));
    for(const meal of ["comida","cena"]){const id=dd+"|"+meal;if(!slotOpen(id))continue;const st=mealState(dd,meal),sl=sls.find(s=>s.id===id);
      if(!sl&&(st!=="libre"||raw))continue;if(raw&&(sl.fixed||(wk.slots[id]||{}).despensa))continue;const v=wk.slots[id];
      opts.push({sl:sl||{id,date:dd,meal},txt:v&&v.despensa?"🧺 "+v.despensa.map(it=>despItemName(it.k)).join(", "):v&&RX[v.recipe]?RX[v.recipe].name:sl&&sl.fixed?sl.fixed.name:st==="libre"?"libre (sin plan)":"—"})}}
  return opts;
}
// El mejor plato para un hueco que use un producto (para cocinar una bolsa)
function recipeWith(pid,sl){let best=null;const ctx=makeCtx(weekStartFor(sl.date),sl.id);
  for(const r of candidates(sl))if(r.ing.some(([p])=>p===pid)){const s=scoreRecipe(r,sl,ctx);if(!best||s>best.s)best={s,r}}
  return best&&best.r;
}
// Desde la despensa: ¿qué día te lo comes? (los próximos 14 días)
function openPickDay(k,nDefault){
  const b=k.startsWith("b:")?(S.bolsas||[]).find(x=>x.id===k.slice(2)):null,raw=b&&RAW_BAG.has(b.tipo),bp=raw&&bolsaPid(b);
  // Una bolsa de carne, pescado o verdura de un producto: propongo una receta que lo lleve (la bolsa se descuenta al cocinarla)
  if(bp){const opts=pickDayOpts(true).map(o=>({...o,r:recipeWith(bp,o.sl)})).filter(o=>o.r).slice(0,10);
    showDialog(`<div class="mod">${closeBtn}<h2 class="vh" style="font-size:1.6rem">¿Qué cocinas con <em>${esc(despItemName(k).toLowerCase())}</em>?</h2>
      <p class="small muted">Te propongo un plato con ${esc(P[bp].name.toLowerCase())} en lugar del que hay. Cuando lo cocines se descuenta la bolsa. Pásala a la nevera la noche antes.</p>
      ${opts.map((o,i)=>`<button class="alt" data-pday="${i}"><b>${esc(DAYS[dow(o.sl.date)]+" "+shortDate(o.sl.date))} · ${esc(o.sl.meal)}: ${esc(o.r.name)}</b><small>Ahora: ${esc(o.txt)}</small></button>`).join("")||`<p>No encuentro platos con ${esc(P[bp].name.toLowerCase())} que os encajen en los próximos días.</p>`}</div>`);
    dlg.querySelectorAll("[data-pday]").forEach(x=>x.onclick=()=>{const o=opts[Number(x.dataset.pday)];setSlotRecipe(o.sl,o.r.id);dlg.close();render();toast(`${o.r.name}: ${DAYS[dow(o.sl.date)].toLowerCase()} ${shortDate(o.sl.date)}, ${o.sl.meal}`)});
    return}
  const opts=pickDayOpts(false);
  showDialog(`<div class="mod">${closeBtn}<h2 class="vh" style="font-size:1.6rem">¿Cuándo os coméis <em>${esc(despItemName(k).toLowerCase())}</em>?</h2>
    <p class="small muted">Lo pongo en esa comida en lugar del plato que hay y no se compra nada para ese día.</p>
    ${raw?`<p class="small infobox">Es algo crudo: si me dices de qué producto es (✎ en la bolsa), te propongo un plato que lo lleve.</p>`:""}
    ${opts.map((o,i)=>`<button class="alt" data-pday="${i}"><b>${esc(DAYS[dow(o.sl.date)]+" "+shortDate(o.sl.date))} · ${esc(o.sl.meal)}</b><small>Ahora: ${esc(o.txt)}</small></button>`).join("")||"<p>No hay comidas planificadas en los próximos días.</p>"}</div>`);
  dlg.querySelectorAll("[data-pday]").forEach(x=>x.onclick=()=>openDespensaPick(opts[Number(x.dataset.pday)].sl.id,{k,n:nDefault}));
}
