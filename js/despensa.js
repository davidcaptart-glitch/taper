/* Táper · despensa: todo lo que tienes en casa (lo comprado y los tickets), lo que se gasta al cocinar,
   lo que te falta para los próximos días y lo que te sobra (y cómo meterlo en el menú) */
"use strict";

// S.despensa = {start, set:{pid:{q,d}} (recuento a mano), adj:[{pid,q,d}] (añadido o quitado a mano), gone:{"ticket|línea":true}}
function despensaData(){
  if(!S.despensa)S.despensa={};const D=S.despensa;
  if(!D.start){D.start=todayISO().slice(0,8)+"01";save()}   // empieza contando desde el día 1 del mes en que se abre
  D.set=D.set||{};D.adj=D.adj||[];D.gone=D.gone||{};return D;
}
const monthsBetween=(a,b)=>{const out=[];for(let m=a;m<=b;m=nextMonthOf(m))out.push(m);return out};
const prevMonthOf=m=>{const [y,mm]=m.split("-").map(Number);return mm===1?`${y-1}-12`:`${y}-${String(mm-1).padStart(2,"0")}`};
// ¿Ese plato ya se ha comido (y se cocinó en casa)? Los de días pasados sí, salvo que dijeras que comisteis fuera o no se hizo
function eatenUse(u){
  const today=todayISO(),st=u.slot&&u.slot.id?((S.meals||{})[u.slot.id]||{}).status:null;
  if(st==="fuera"||st==="nada"||st==="otro")return false;
  return u.date<today||(u.date===today&&!!st);
}
// Lo que entra (compras marcadas, compras hechas, tickets, a mano) y lo que sale (platos cocinados), en orden
function despensaEvents(){
  const D=despensaData(),start=D.start,today=todayISO(),ev=[];
  for(const m of monthsBetween(prevMonthOf(start.slice(0,7)),today.slice(0,7))){
    let sh;try{sh=shopping(m)}catch(e){continue}
    for(const l of Object.values(sh.lists)){
      if((S.tickets||[]).some(t=>t.m===m&&t.list===l.key))continue;   // con ticket, cuenta lo del ticket (es lo que compraste de verdad)
      const done=(S.shopDone||{})[shopKey(m,l.key)],day=deliveryDate(sh.weeks[l.key==="mes"?mesWeek(sh.weeks):Number(l.key)]||sh.weeks[0]);
      for(const it of l.items){const ck=checkKey(m,l.key,it.pid),at=S.checks[ck]?((S.checkedAt||{})[ck]||day):done||null;
        if(at&&at>=start&&at<=today)ev.push({pid:it.pid,d:at,k:0,q:it.packs*P[it.pid].env,src:"compra"})}}
    for(const u of monthUses(m))if(u.pid&&P[u.pid]&&u.date>=start&&eatenUse(u))ev.push({pid:u.pid,d:u.date,k:1,q:u.q,out:true,u});
  }
  for(const t of S.tickets||[])if(t.date>=start)for(const l of t.lines)if(l.food&&l.pid&&P[l.pid])ev.push({pid:l.pid,d:t.date,k:0,q:lineQty(l),src:"ticket"});
  for(const [pid,s] of Object.entries(D.set))if(P[pid])ev.push({pid,d:s.d,k:2,q:s.q,set:true});
  for(const a of D.adj)if(P[a.pid])ev.push({pid:a.pid,d:a.d,k:3,q:a.q,adj:true});
  return ev.sort((a,b)=>a.d.localeCompare(b.d)||a.k-b.k);
}
const unitCost=pid=>price(pid)/P[pid].env;
let despCache={k:null,v:null};
function despensaState(){
  const k=S.updatedAt+"|"+todayISO()+"|"+(PR&&PR.fecha);if(despCache.k===k)return despCache.v;
  const stock={},meals={};
  for(const e of despensaEvents()){const s=stock[e.pid]||0;
    if(e.set)stock[e.pid]=e.q;
    else if(e.adj)stock[e.pid]=Math.max(0,s+e.q);
    else if(e.out){stock[e.pid]=Math.max(0,s-e.q);
      // Lo que cuesta cada comida: lo que lleva el plato a precio del súper (se haya comprado o no)
      const key=e.u.slot.id||e.u.slot.date+"|"+e.u.slot.meal,mm=meals[key]=meals[key]||{key,date:e.u.slot.date,meal:e.u.slot.meal,r:e.u.r,cost:0,items:[]};
      mm.cost+=e.q*unitCost(e.pid);mm.items.push({pid:e.pid,q:e.q})}
    else stock[e.pid]=s+e.q}
  for(const [p,q] of Object.entries(stock))if(q<1)delete stock[p];
  const v={stock,meals:Object.values(meals).sort((a,b)=>b.date.localeCompare(a.date)||(a.meal<b.meal?1:-1))};
  despCache={k,v};return v;
}
// Lo que piden los platos que vienen (sin comer aún), del día from al to (sin incluir)
function upcomingNeed(from,to){
  const need={},first={};
  for(const m of monthsBetween(prevMonthOf(from.slice(0,7)),to.slice(0,7)))for(const u of monthUses(m)){
    if(!u.pid||!P[u.pid]||u.date<from||u.date>=to||eatenUse(u))continue;
    const st=u.slot&&u.slot.id?((S.meals||{})[u.slot.id]||{}).status:null;if(st==="fuera"||st==="nada")continue;
    need[u.pid]=(need[u.pid]||0)+u.q;if(!first[u.pid]||u.date<first[u.pid].date)first[u.pid]={date:u.date,r:u.r,meal:u.slot.meal}}
  return {need,first};
}
// Te falta: lo que necesitan los platos de los próximos 7 días y no tienes en casa
function despensaMissing(){
  const {stock}=despensaState(),today=todayISO(),{need,first}=upcomingNeed(today,addDays(today,7)),out=[];
  const pend=pendingShop();
  for(const [pid,q] of Object.entries(need)){const miss=q-(stock[pid]||0);if(miss>Math.max(1,P[pid].env*.05))out.push({pid,q:miss,packs:packsFor(pid,miss),first:first[pid],inList:pend.has(pid)})}
  return out.sort((a,b)=>a.inList-b.inList||a.first.date.localeCompare(b.first.date));
}
// Lo que ya está en una lista de la compra de esta semana, la que viene o la del mes, sin comprar todavía
function pendingShop(){
  const today=todayISO(),out=new Set();
  for(const ws of [weekStartFor(today),weekStartFor(addDays(today,7))]){const m=monthOfWeek(ws);let sh;try{sh=shopping(m)}catch(e){continue}
    for(const key of [String(sh.weeks.indexOf(ws)),"mes"]){const l=sh.lists[key];if(!l||shopIsDone(m,l)||(S.tickets||[]).some(t=>t.m===m&&t.list===key))continue;
      for(const it of l.items)if(!S.checks[checkKey(m,key,it.pid)])out.add(it.pid)}}
  return out;
}
// Te sobra: lo que tienes y ningún plato de las próximas 4 semanas va a usar
function despensaSpare(){
  const {stock}=despensaState(),today=todayISO(),{need}=upcomingNeed(today,addDays(today,28));
  return Object.entries(stock).map(([pid,q])=>({pid,q:q-(need[pid]||0)})).filter(x=>x.q>Math.max(1,P[x.pid].env*.15)).sort((a,b)=>b.q*unitCost(b.pid)-a.q*unitCost(a.pid));
}

/* ---------- Pantalla ---------- */
const KEEP_GROUP={fresco:"Nevera, fruta y verdura",despensa:"Despensa",congelar:"Congelador",congelado:"Congelador"};
let despFilter="todo";
function renderDespensa(){
  const D=despensaData(),{stock,meals}=despensaState(),today=todayISO();
  const pids=Object.keys(stock).sort((a,b)=>P[a].name.localeCompare(P[b].name));
  const value=pids.reduce((t,p)=>t+stock[p]*unitCost(p),0);
  const cm=today.slice(0,7),monthMeals=meals.filter(x=>x.date.slice(0,7)===cm),spentM=monthMeals.reduce((t,x)=>t+x.cost,0);
  const {first}=upcomingNeed(today,addDays(today,28)),miss=despensaMissing(),spare=despensaSpare(),spareSet=new Set(spare.map(x=>x.pid));
  let h=`<section class="view">${viewHead(pids.length+" "+(pids.length===1?"producto":"productos")+" en casa","Tu *despensa*")}
    <p class="small muted">Se llena con lo que marcas como comprado y con tus tickets, y se gasta al cocinar cada plato. Si algo no cuadra, tócalo y pon lo que te queda.</p>
    <div class="dsum"><div><b>${eur(value)}</b><small>vale lo que tienes</small></div><div><b>${eur(spentM)}</b><small>cocinado en ${esc(monthName(cm).split(" ")[0].toLowerCase())}</small></div><div><b>${monthMeals.length}</b><small>${monthMeals.length===1?"comida hecha":"comidas hechas"}</small></div></div>`;
  if(!D.checked)h+=`<div class="infobox">🧺 <b>Primera vez:</b> he juntado lo que has comprado este mes y he restado lo que ya habéis cocinado. Como el menú ha ido cambiando, seguro que algo no cuadra: repasa la lista y toca lo que esté mal. <button class="btn small" id="dpChecked" style="margin-top:6px">Ya lo he repasado</button></div>`;
  // Te falta
  h+=`<div class="card"><h2>${ico("shopping-cart")} Te falta para los próximos 7 días</h2>`;
  if(!miss.length)h+=`<p class="small okbox">Tienes todo lo que piden los platos de esta semana.</p>`;
  else{const toAdd=miss.filter(x=>!x.inList);
    h+=`<p class="small muted">Lo piden los platos que vienen y no lo tienes en casa (unos ${eur(miss.reduce((t,x)=>t+x.packs*price(x.pid),0))}).</p>`+
    miss.map(x=>`<div class="fixed"><span>${esc(P[x.pid].name)}<small>${x.packs} × ${esc(fmtQty(P[x.pid].env,P[x.pid].unit))} · para el ${esc(DSHORT[dow(x.first.date)]+" "+shortDate(x.first.date))} (${esc(x.first.r.name.toLowerCase())})${x.inList?` · <b style="color:var(--ok)">✓ ya en tu lista</b>`:""}</small></span><b>${eur(x.packs*price(x.pid))}</b></div>`).join("")+
    (toAdd.length?`<div class="actions"><button class="btn small" id="dpBuy">${ico("plus")} Añadir ${toAdd.length===miss.length?"":toAdd.length+" "}a la compra de esta semana</button></div>`:`<p class="small muted">Todo está ya en tu lista de la compra: solo falta comprarlo.</p>`)}
  h+=`</div>`;
  // Te sobra
  if(spare.length)h+=`<div class="card"><h2>${ico("package")} Te sobra</h2><p class="small muted">Lo tienes en casa y ningún plato de las próximas 4 semanas lo usa (unos ${eur(spare.reduce((t,x)=>t+x.q*unitCost(x.pid),0))}).</p>
    ${spare.slice(0,12).map(x=>`<div class="fixed"><span>${esc(P[x.pid].name)}<small>${esc(fmtQty(x.q,P[x.pid].unit))} · ${eur(x.q*unitCost(x.pid))}</small></span><button class="btn ghost small" data-dpuse="${x.pid}">Ponerlo en el menú</button></div>`).join("")}
    <div class="actions"><button class="btn small" id="dpRedo">${ico("repeat")} Rehacer los próximos 7 días con lo que tengo</button></div></div>`;
  // Lo que tienes
  const groups=[...new Set(pids.map(p=>KEEP_GROUP[P[p].keep]||"Despensa"))];
  h+=`<h2 style="margin:18px 0 8px">Lo que tienes</h2><div class="chips" style="margin-bottom:8px">${["todo",...groups].map(g=>chip("data-dpf",g,despFilter===g,g==="todo"?"Todo":g)).join("")}</div>`;
  if(!pids.length)h+=`<div class="empty"><p>Aún no hay nada. Marca lo que compras en la lista o sube el ticket, o añádelo abajo.</p></div>`;
  for(const p of pids){const g=KEEP_GROUP[P[p].keep]||"Despensa";if(despFilter!=="todo"&&despFilter!==g)continue;const f=first[p];
    h+=`<button class="item dpi" data-dpe="${p}">${prodImg(p)}<span class="t">${esc(P[p].name)}<small>${esc(fmtQty(stock[p],P[p].unit))} · ${eur(stock[p]*unitCost(p))}${f?` · para el ${esc(DSHORT[dow(f.date)]+" "+shortDate(f.date))}`:spareSet.has(p)?" · sin plato previsto":""}</small></span><span class="p">${ico("chevron-right")}</span></button>`}
  // Otras cosas de los tickets (sin receta)
  const otros=[];for(const t of S.tickets||[])if(t.date>=D.start)t.lines.forEach((l,i)=>{if(l.food&&!l.pid&&!D.gone[t.id+"|"+i])otros.push({k:t.id+"|"+i,l,t})});
  if(otros.length&&(despFilter==="todo"))h+=`<div class="card"><h2>Otras cosas de tus tickets</h2><p class="small muted">Comida que no va en ninguna receta (pizzas, caprichos…). Márcala cuando se acabe.</p>
    ${otros.map(o=>`<div class="fixed"><span>${esc(o.l.name||o.l.desc)}<small>${o.l.kg?String(o.l.kg).replace(".",",")+" kg":o.l.qty+" ud"} · ${eur(o.l.amount)} · ${esc(shortDate(o.t.date))}</small></span><button class="btn ghost small" data-dpgone="${esc(o.k)}">Se acabó</button></div>`).join("")}</div>`;
  // Lo que se ha gastado
  h+=`<div class="card"><h2>${ico("chef-hat")} Lo que vas gastando</h2><p class="small muted">Cada comida cocinada, a precio del súper. Cuenta las de días pasados salvo las que marcaste como comida fuera o no hecha.</p>`;
  h+=meals.length?meals.slice(0,12).map(x=>`<div class="fixed"><span>${esc(x.r?x.r.name:"Comida")}<small>${esc(DSHORT[dow(x.date)]+" "+shortDate(x.date))} · ${esc(SMALL[x.meal]?SMALL[x.meal][1].toLowerCase():x.meal)}</small></span><b>${eur(x.cost)}</b></div>`).join(""):`<p class="small muted">Aún no hay comidas cocinadas desde el ${esc(shortDate(D.start))}.</p>`;
  h+=`</div>`;
  // Añadir a mano
  const all=Object.values(P).sort((a,b)=>a.name.localeCompare(b.name));
  h+=`<div class="card"><h2>Añadir algo que tienes</h2><div class="row"><select id="dpP" style="flex:2">${all.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>
    <input type="number" id="dpQ" min="0" step="any" placeholder="Cantidad" style="flex:1"><span class="small" id="dpU">${esc(all[0]?.unit||"g")}</span></div>
    <button class="btn small" id="dpAdd" style="margin-top:8px">Añadir</button>
    <p class="small muted" style="margin-top:10px">${ico("snowflake")} Lo congelado, con los días que lleva dentro: <button class="btn ghost small" id="dpFz">Ver el congelador</button></p></div></section>`;
  main.innerHTML=h;
  document.getElementById("dpChecked")?.addEventListener("click",()=>{D.checked=todayISO();save();render();toast("Perfecto. A partir de ahora se va ajustando sola")});
  main.querySelectorAll("[data-dpf]").forEach(b=>b.onclick=()=>{despFilter=b.dataset.dpf;render()});
  main.querySelectorAll("[data-dpe]").forEach(b=>b.onclick=()=>openDespensaItem(b.dataset.dpe));
  main.querySelectorAll("[data-dpgone]").forEach(b=>b.onclick=()=>{D.gone[b.dataset.dpgone]=true;save();render()});
  main.querySelectorAll("[data-dpuse]").forEach(b=>b.onclick=()=>useInMenu(b.dataset.dpuse));
  document.getElementById("dpBuy")?.addEventListener("click",()=>addMissingToShop(miss.filter(x=>!x.inList)));
  document.getElementById("dpRedo")?.addEventListener("click",confirmRedoWithStock);
  document.getElementById("dpFz").onclick=()=>{tab="congelador";render();scrollTo(0,0)};
  const sel=document.getElementById("dpP");sel.onchange=()=>{document.getElementById("dpU").textContent=P[sel.value].unit};
  document.getElementById("dpAdd").onclick=()=>{const q=Number(document.getElementById("dpQ").value);if(!(q>0)){toast("Indica la cantidad");return}
    D.adj.push({pid:sel.value,q,d:todayISO()});save();render();toast("Añadido a la despensa")};
}
// Corregir lo que queda de un producto (recuento): desde hoy cuenta esa cantidad
function openDespensaItem(pid){
  const p=P[pid],{stock}=despensaState(),q=Math.round(stock[pid]||0),{first}=upcomingNeed(todayISO(),addDays(todayISO(),28)),f=first[pid];
  showDialog(`<div class="mod">${closeBtn}<div class="veb">${esc(KEEP_GROUP[p.keep]||"Despensa")}</div><h2 class="vh" style="font-size:1.6rem">${esc(p.name)}</h2>
    <p class="small muted">Envase de ${esc(fmtQty(p.env,p.unit))} · ${eur(price(pid))}${f?` · lo usa ${esc(f.r.name.toLowerCase())} el ${esc(DSHORT[dow(f.date)]+" "+shortDate(f.date))}`:""}</p>
    <div class="field"><label for="dpIn">¿Cuánto te queda? (${esc(p.unit)})</label><input type="number" id="dpIn" min="0" step="any" value="${q}"></div>
    <div class="chips">${[["0","Se acabó"],[String(Math.round(p.env/2)),"Medio envase"],[String(p.env),"1 envase"],[String(p.env*2),"2 envases"]].map(([v,t])=>`<button type="button" class="chip" data-dpq="${v}">${t}</button>`).join("")}</div>
    <div class="actions"><button class="btn wide" id="dpSave">Guardar</button></div></div>`);
  dlg.querySelectorAll("[data-dpq]").forEach(b=>b.onclick=()=>{dlg.querySelector("#dpIn").value=b.dataset.dpq});
  dlg.querySelector("#dpSave").onclick=()=>{const v=Number(dlg.querySelector("#dpIn").value);if(!(v>=0)){toast("Pon una cantidad");return}
    const D=despensaData();D.set[pid]={q:v,d:todayISO()};D.adj=D.adj.filter(a=>!(a.pid===pid&&a.d<=todayISO()));save();dlg.close();render();toast(v?"Apuntado: "+fmtQty(v,p.unit):"Quitado de la despensa")};
}
// Añadir lo que falta a la lista de la semana en curso (S.extraBuy[mes][lista][producto] = cantidad)
function addMissingToShop(miss){
  const ws=weekStartFor(todayISO()),m=monthOfWeek(ws),key=String(weeksInMonth(m).indexOf(ws));
  S.extraBuy=S.extraBuy||{};const L=(S.extraBuy[m]=S.extraBuy[m]||{})[key]=S.extraBuy[m][key]||{};
  for(const x of miss)L[x.pid]=(L[x.pid]||0)+x.q;
  save();month=m;listSel=key;tab="compra";render();scrollTo(0,0);toast(`Añadido a la compra de esta semana: ${miss.length} ${miss.length===1?"producto":"productos"}`);
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
