/* Táper · Hoy: lo que toca ahora (qué se come, qué descongelar, qué caduca, lo que hay que hacer) */
"use strict";

// Fecha de hoy como etiqueta: «Viernes 27 de noviembre»
const hoyLabel=()=>{const t=longDate(todayISO()).replace(",","");return t.charAt(0).toUpperCase()+t.slice(1)};
// Lista de nombres: «tú», «tú y Lukas», «tú, Lukas y Ana»
const namesList=ps=>{const n=ps.map(p=>isMe(p)?"tú":personName(p));return n.length>1?n.slice(0,-1).join(", ")+" y "+n[n.length-1]:n[0]||""};
// Para quién se cocina un hueco: «para ti», «para 2 (tú y Lukas)»
function forWhom(sl,st){
  const ps=(st==="solotaper"?[]:sl.eaters).concat(sl.kids),n=ps.length+(sl.guests||0);if(!n)return "";
  if(n===1&&isMe(ps[0]))return "para ti";
  return `para ${n} (${namesList(ps)}${sl.guests?` y ${sl.guests} ${sl.guests===1?"invitado":"invitados"}`:""})`;
}
// El pedido del mes en curso o del siguiente que está pedido o recién llegado (sin guardar)
function pedidoPend(){
  const cur=todayISO().slice(0,7),P0=S.pedido||{};
  for(const m of [cur,nextMonthOf(cur)]){const p=P0[m];if(p&&(p.estado==="pedido"||p.estado==="llegado"))return {m,p}}
  return null;
}
// La lista de fresco de esta semana (en el mes al que pertenece la semana)
function freshNow(){
  const ws=weekStartFor(todayISO()),m=monthOfWeek(ws);let sh;try{sh=shopping(m)}catch(e){return null}
  const i=sh.weeks.indexOf(ws);if(i<0)return null;const l=sh.lists[String(i)];if(!l)return null;
  return {m,key:String(i),l,ws,day:deliveryDate(ws),done:shopIsDone(m,l)};
}
// «Ya ha llegado»: se apunta y se abre «Guardar el pedido»
function pedidoLlegado(m){
  S.pedido=S.pedido||{};const p=S.pedido[m];if(p&&p.estado==="pedido"){p.estado="llegado";p.at=todayISO();save()}
  if(typeof openGuardarPedido==="function")openGuardarPedido(m);else render();
}
/* ---------- Lo único que importa ahora (una sola tarjeta) ---------- */
function hoyCTA(){
  const today=todayISO();
  // 1) Toca preparar el mes que viene
  const nx=monthPrepDue();
  if(nx)return {id:"mprep",h:`<div class="hcta"><h2>Toca preparar <em>${esc(mName(nx))}</em></h2><p>10 minutos: miro tu semana normal, tocas lo que cambie, te propongo el menú del mes y te preparo el pedido grande.</p><button class="btn wide" data-hcta="mprep|${nx}">Preparar ${esc(mName(nx))}</button></div>`};
  // 2) El pedido del mes: llega o ha llegado
  const pp=pedidoPend();
  if(pp){const {m,p}=pp,lleg=p.estado==="llegado"||(p.entrega&&today>=p.entrega);
    return {id:"pedido",h:`<div class="hcta"><h2>${lleg?"Ha llegado <em>el pedido</em>":`El pedido llega el <em>${esc(p.entrega?DAYS[dow(p.entrega)].toLowerCase()+" "+Number(p.entrega.slice(8)):"día que elegiste")}</em>`}</h2>
      <p>${lleg?"Te digo dónde va cada cosa y cómo repartir la carne en bolsas.":"Cuando llegue, te ayudo a guardarlo en 5 minutos."}</p><button class="btn wide" data-hcta="${lleg?"guardar":"llegado"}|${m}">${lleg?"Guardarlo":"Ya ha llegado"}</button></div>`}}
  // 3) La compra de fresco de esta semana
  const f=freshNow();
  if(f&&f.l.items.length&&!f.done&&listCurrent(f.m,f.key)){const left=f.l.items.filter(it=>!S.checks[checkKey(f.m,f.key,it.pid)]).length;
    return {id:"shop|"+f.m+"|"+f.key,h:`<div class="hcta"><h2>Haz la compra <em>de esta semana</em></h2><p>${left} ${left===1?"cosa":"cosas"}${(S.home.buyMode||"mes")==="semana"?"":" de fresco"} · unos ${eur(f.l.cost+f.l.fee)}${f.day>today?` · toca el ${esc(DAYS[dow(f.day)].toLowerCase())}`:""}</p><button class="btn wide" data-hcta="compra|${f.m}|${f.key}">Ver la lista</button></div>`}}
  // 4) Quien compra cada semana: la semana sin planificar
  const st=weekStartFor(today);
  if((S.home.buyMode||"mes")==="semana"&&!weekDone(st)&&!(S.home.start&&addDays(st,6)<S.home.start))
    return {id:"plan|"+st,h:`<div class="hcta"><h2>Planifica <em>tu semana</em></h2><p>5 minutos: quién está, entrenos, platos y la compra.</p><button class="btn wide" data-hcta="plan|${st}">Planificar la semana</button></div>`};
  return null;
}
function bindHoyCTA(root){
  root.querySelectorAll("[data-hcta]").forEach(b=>b.onclick=()=>{const [a,x,y]=b.dataset.hcta.split("|");
    if(a==="mprep"){if(typeof openMonthPrep==="function")openMonthPrep(x)}
    else if(a==="guardar"){pedidoLlegado(x)}
    else if(a==="llegado"){pedidoLlegado(x)}
    else if(a==="compra"){month=x;listSel=y;tab="compra";render();scrollTo(0,0)}
    else if(a==="plan"){openWeekPlanner(x)}});
}
/* ---------- La tarjeta grande: lo próximo que se come ---------- */
function todayCard(){
  const n=nextMeal();if(!n)return "";
  const ph=dishPhoto(n.r), when=n.i===0?(n.meal==="cena"?"Esta noche":"Hoy"):n.i===1?"Mañana":n.i<7?DAYS[dow(n.d)]:DAYS[dow(n.d)]+" "+shortDate(n.d);
  const st=mealState(n.d,n.meal),who=forWhom(n.sl,st),tp=n.sl.tupper&&n.sl.tupper.length&&st!=="solotaper";
  const done=(S.cooked||{})[n.sl.id];
  return `<div class="todaycard ${ph?"":"nophoto"}" ${ph?`style="background-image:linear-gradient(180deg,rgba(0,0,0,0) 25%,rgba(10,10,12,.82) 100%),url('${esc(ph)}')"`:""}>
    ${ph?"":`<div class="tcart">${dishImg(n.r,"l")}</div>`}
    <div class="tcin"><span class="tclab">${when} · ${n.meal==="comida"?"comida":"cena"}</span>
      <h2>${esc(n.r.name)}</h2>
      <div class="tcmeta"><span>⏱ ${recipeTime(n.r)} min</span>${who?`<span>👤 ${esc(who)}</span>`:`<span>👥 ${racTxt(n.sl.portions)} rac.</span>`}${st==="solotaper"?`<span>solo el táper de mañana</span>`:tp?`<span>+ táper de mañana</span>`:""}${(()=>{const p=typeof postreFor==="function"?postreFor(n.d,n.meal):null;return p?`<span>${p.pid==="yogur"?"🥛":"🍎"} ${esc(p.nombre.replace(/ \(.*\)$/,"").toLowerCase())}</span>`:""})()}</div>
      <div class="tcbtns"><button class="btn ${done?"tcdone":""}" data-cooknow="${n.r.id}|${n.sl.id}">${done?"✓ Cocinado":"▶ Cocinar"}</button><button class="btn glass" data-open="${n.r.id}" data-slot="${n.sl.id}">Ver receta</button></div></div></div>`;
}
// ▶ Cocinar: abre el modo cocina con su receta y sus raciones
function bindCookNow(root){
  root.querySelectorAll("[data-cooknow]").forEach(b=>b.onclick=()=>{const i=b.dataset.cooknow.indexOf("|"),rid=b.dataset.cooknow.slice(0,i),sid=b.dataset.cooknow.slice(i+1),r=RX[rid],sl=slotFor(sid.slice(0,10),sid.slice(11));if(r)openCook(r,variantFor(r)||r.vars[0],sl?cookPortions(sl):2,sid)});
  root.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>openRecipe(b.dataset.open,b.dataset.slot));
}
/* ---------- Lo que hay que hacer hoy ---------- */
// Lo que hay que pasar esta noche del congelador a la nevera para mañana (la misma cuenta que el menú)
function thawTonight(){
  const d=addDays(todayISO(),1),wk=S.plans[weekStartFor(d)],out=[];if(!wk)return out;
  for(const meal of ["comida","cena"]){const st=mealState(d,meal);if(st!=="cocinar"&&st!=="solotaper")continue;
    const sl=slotFor(d,meal),v=sl&&wk.slots[sl.id],r=v&&RX[v.recipe];if(!r||v.rep)continue;
    if(fromBatch(sl)){const k=keepPlan(r,sl);if(k.freeze)out.push({sid:sl.id,meal,what:"el táper de "+r.name.toLowerCase(),r})}
    else if(S.home.cookMode!=="lote"){const th=r.ing.filter(([p])=>P[p]&&P[p].thaw).map(([p])=>P[p].name.toLowerCase());if(th.length)out.push({sid:sl.id,meal,what:th.join(" y "),r})}}
  return out;
}
// Comida y cena de un día con cuántos sois: «comida para 2 y cena para 2»
function mealsFor(d){
  const ps=["comida","cena"].filter(m=>!["fuera","libre"].includes(mealState(d,m))).map(m=>`${m} para ${peopleAt(d,m).length}`);
  return ps.length?ps.join(" y "):"no se cocina";
}
function hoyTasks(skip){
  const today=todayISO(),tom=addDays(today,1),rows=[];
  // Descongelar esta noche
  for(const x of thawTonight()){const on=!!(S.thawChecked||{})[x.sid];
    rows.push(`<div class="task"><span class="tic ice">❄️</span><div><h3>Antes de dormir</h3><p class="small muted">Pasa ${esc(x.what)} del congelador a la nevera: es para la ${x.meal} de mañana.</p></div><button class="btn small ${on?"ghost":""}" data-thawnight="${esc(x.sid)}">${on?"✓ Hecho":"Hecho"}</button></div>`)}
  // Quién viene o se va mañana
  for(const k of others()){const a=peopleAt(today).includes(k),b=peopleAt(tom).includes(k);if(a===b)continue;
    const dn=DAYS[dow(tom)];
    rows.push(`<div class="task"><span class="tic kid">${k.kind==="nino"?"🧒":"🧑"}</span><div><h3>Mañana ${b?"viene":"no está"} ${esc(personName(k))}</h3><p class="small muted">${esc(dn)}: ${esc(mealsFor(tom))}. Ya está en el menú.</p></div></div>`)}
  // Tápers y sobras que caducan
  if(typeof cookedLeftovers==="function"){let lo=[];try{lo=cookedLeftovers()||[]}catch(e){console.error(e)}
    for(const x of lo.filter(x=>x&&x.daysLeft<=1).sort((a,b)=>a.daysLeft-b.daysLeft)){const nm=esc(String(x.name||"").toLowerCase());
      rows.push(`<div class="task"><span class="tic warn">🥡</span><div><h3>${x.daysLeft<0?`El táper de ${nm} ya no está bueno`:`Cómete hoy el táper de ${nm}`}</h3><p class="small muted">${x.daysLeft<0?"Lleva demasiados días en la nevera: mejor no comerlo.":"Mañana ya no está bueno"}${x.portions?` · ${racTxt(x.portions)} ${x.portions===1?"ración":"raciones"}`:""}</p></div><button class="btn ghost small" data-hgocasa>En casa</button></div>`)}}
  // Lo fresco que caduca antes de que un plato lo use
  if(typeof freshExpiring==="function"){try{const fx=freshExpiring();if(fx.length)rows.push(freshRowsHTML(fx))}catch(e){console.error(e)}}
  // El resto de pendientes (antes en la campanita)
  let items=[];try{items=inboxItems().filter(x=>!skip||x.id!==skip)}catch(e){console.error(e)}
  items.forEach((x,i)=>{
    if(x.btns)rows.push(`<div class="task"><span class="tic">${x.ico}</span><div><h3>${esc(x.t)}</h3>${x.s?`<p class="small muted">${esc(x.s)}</p>`:""}<div class="tacts">${x.btns.map(([l],k)=>`<button class="btn small${k?" ghost":""}" data-hib="${i}|${k}">${esc(l)}</button>`).join("")}</div></div></div>`);
    else rows.push(`<button class="task tlink" data-hig="${i}"><span class="tic">${x.ico}</span><div><h3>${esc(x.t)}</h3>${x.s?`<p class="small muted">${esc(x.s)}</p>`:""}</div><span class="tgo" aria-hidden="true">›</span></button>`)});
  return {h:rows.length?`<div class="card htasks">${rows.join("")}</div>`:"",items};
}
/* ---------- El presupuesto del mes, en una línea ---------- */
function hoyBudget(){
  const m=todayISO().slice(0,7);let sh;try{sh=shopping(m)}catch(e){return ""}
  const prev=sh.total,real=(()=>{try{return paidOf(m).total}catch(e){return 0}})(),mn=monthName(m).split(" ")[0];
  const [y,mm]=m.split("-").map(Number),left=new Date(y,mm,0).getDate()-Number(todayISO().slice(8))+1;
  if(!budgetSet(m))return `<button class="card hbud" id="hBudget"><div class="hbtop"><h3>${esc(mn)}</h3><span class="small muted">Poner presupuesto</span></div>
    <p class="small"><b>Este mes sale por unos ${eur(prev)}</b>${real?` <span class="muted">· llevas ${eur(real)} de verdad</span>`:""}</p></button>`;
  const b=monthBudget(m),cur=real||prev,over=cur>b+0.005;
  return `<button class="card hbud" id="hBudget"><div class="hbtop"><h3>${esc(mn)}</h3><span class="small muted">Tocar para cambiar</span></div>
    <div class="hbar ${over?"over":""}"><i style="width:${Math.min(100,b?cur/b*100:0)}%"></i></div>
    <p class="small">${real?`<b>Llevas ${eur(real)} de ${eur(b)}</b>`:`<b>Previsto: ${eur(prev)} de ${eur(b)}</b>`} <span class="muted">· ${over?`te pasas ${eur(cur-b)}`:`te quedan ${eur(b-cur)} para ${left} ${left===1?"día":"días"}`}${real?` · previsto ${eur(prev)}`:""}</span></p></button>`;
}
function renderHoy(){
  const cta=hoyCTA(),tk=hoyTasks(cta&&cta.id);
  let h=`<section class="view hoy">`+viewHead(hoyLabel(),"Hoy *en casa*")+safetyCard()+(cta?cta.h:"");
  const tc=todayCard();
  h+=tc||`<div class="card"><h3>Hoy no hay nada que cocinar</h3><p class="small muted" style="margin:4px 0 0">Mira el mes para ver lo que viene.</p></div>`;
  h+=tk.h+hoyBudget()+useUpCard()+installCard()+surveyCard()+`</section>`;
  main.innerHTML=h;
  bindHoyCTA(main);bindCookNow(main);bindInstall();bindSurvey();
  document.getElementById("safetyOk")?.addEventListener("click",()=>{safetyNotes=[];render()});
  document.getElementById("homeOk")?.addEventListener("click",()=>{homeNotes=[];render()});
  document.getElementById("useUp")?.addEventListener("click",openUseUp);
  document.getElementById("hBudget")?.addEventListener("click",()=>openWizard("compra","hoy"));
  main.querySelectorAll("[data-thawnight]").forEach(b=>b.onclick=()=>{S.thawChecked=S.thawChecked||{};const k=b.dataset.thawnight;if(S.thawChecked[k])delete S.thawChecked[k];else S.thawChecked[k]=true;save();render()});
  main.querySelectorAll("[data-hgocasa]").forEach(b=>b.onclick=()=>{tab="despensa";render();scrollTo(0,0)});
  if(typeof bindFresh==="function")bindFresh(main);
  main.querySelectorAll("[data-hig]").forEach(b=>b.onclick=()=>{const x=tk.items[Number(b.dataset.hig)];if(x)x.go()});
  main.querySelectorAll("[data-hib]").forEach(b=>b.onclick=()=>{const [i,k]=b.dataset.hib.split("|").map(Number),x=tk.items[i];if(!x)return;x.btns[k][1]();if(!dlg.open)render()});
}
