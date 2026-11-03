/* Táper · En casa: nevera, despensa y congelador en una sola lista, y los tápers y sobras de lo cocinado
   (lo cocinado se pone malo en la nevera: se avisa antes de que caduque) */
"use strict";

let casaFilter="todo";   // "todo" | "Nevera" | "Despensa" | "Congelador"

/* ---------- Tápers y sobras ----------
   Un plato cocinado (S.cooked[hueco]={d,rid,p}) da sus raciones: las de ese hueco, el táper del día siguiente y los huecos
   que repiten el plato (repChildren). Cada uno se da por comido cuando pasa su comida (salvo que dijeras que no se comió).
   Lo que queda está en la nevera hasta el día en que se cocinó + los días que aguanta la receta (nevera_dias).
   S.sobras = {hueco:{estado:"comido"|"tirado"|"congelado",at,bag?}}: lo que hiciste con lo que sobró (deja de salir) */
const LO_BAD=new Set(["fuera","nada","otro"]);
function cookedLeftovers(){
  const today=todayISO(),out=[],so=S.sobras||{},memo={};
  const slotOf=id=>{const ws=weekStartFor(id.slice(0,10));try{return (memo[ws]=memo[ws]||buildSlots(ws)).find(s=>s.id===id)||null}catch(e){return null}};
  const stOf=id=>((S.meals||{})[id]||{}).status;
  for(const id of Object.keys(S.cooked||{})){
    if(so[id])continue;let c;try{c=cookedOf(id)}catch(e){continue}
    if(!c||c.by||!c.d||!(Number(c.p)>0)||c.d>today||c.d<addDays(today,-14))continue;
    // Si ese hueco ya no está en el plan (se quitó la comida después de cocinarla), todo lo cocinado sigue en la nevera
    const r=RX[c.rid];if(!r)continue;const sl=slotOf(id)||{id,date:id.slice(0,10),meal:id.slice(11),portions:0,tupper:[],eaters:[],kids:[]};
    // Cocinado en una sesión para otro día y al congelador: no está en la nevera
    try{if(fromBatch(sl)&&keepPlan(r,sl).freeze)continue}catch(e){}
    const tup=(sl.tupper||[]).reduce((t,a)=>t+adultFactor(a,sl),0);
    let eaten=0;
    if(sl.date<=today&&!LO_BAD.has(stOf(id)))eaten+=Math.max(0,sl.portions-tup);                 // los que comen ese día
    if(tup&&slotEaten(addDays(sl.date,1)+"|comida"))eaten+=tup;                                 // el táper del día siguiente
    let kids=[];try{kids=repChildren(sl)}catch(e){}
    for(const k of kids)if(slotEaten(k.id))eaten+=k.portions;                                   // los días que repiten el plato
    const left=Math.round((Number(c.p)-eaten)*100)/100;if(left<0.25)continue;
    const fridge=Math.max(0,Number(r.fridge)||0),expires=addDays(c.d,fridge);
    // free: lo que no tiene ya comida prevista (el táper de mañana y los días que repiten este plato)
    const pend=(tup&&!slotEaten(addDays(sl.date,1)+"|comida")?tup:0)+kids.filter(k=>!slotEaten(k.id)).reduce((t,k)=>t+k.portions,0);
    out.push({key:id,rid:r.id,name:r.name,portions:left,free:Math.max(0,Math.round((left-pend)*100)/100),cookedOn:c.d,expires,daysLeft:daysBetween(today,expires),freeze:!!r.freeze,
      next:[tup&&!slotEaten(addDays(sl.date,1)+"|comida")?addDays(sl.date,1)+"|comida":null,...kids.filter(k=>!slotEaten(k.id)).map(k=>k.id)].filter(Boolean)});
  }
  return out.sort((a,b)=>a.expires.localeCompare(b.expires)||a.name.localeCompare(b.name));
}
// «cómetelo antes del jueves 5», «cómetelo hoy: mañana ya no está bueno», «caducado: tíralo»
function leftoverWhen(x){
  if(x.daysLeft<0)return {cls:"bad",txt:"caducado: tíralo"};
  if(x.daysLeft===0)return {cls:"warn",txt:"cómetelo hoy: mañana ya no está bueno"};
  const d=addDays(x.expires,1);return {cls:x.daysLeft===1?"warn":"",txt:`cómetelo antes del ${DAYS[dow(d)].toLowerCase()} ${Number(d.slice(8))}`};
}
// Lo que haces con lo que sobró: comido o tirado deja de salir; congelado pasa a una bolsa (una por ración)
function leftoverDone(key,estado){
  const x=cookedLeftovers().find(y=>y.key===key);if(!x)return null;S.sobras=S.sobras||{};
  const rec={estado,at:todayISO()};
  if(estado==="congelado"){const n=Math.max(1,Math.round(x.portions)),id=uid("bg");
    S.bolsas=S.bolsas||[];S.bolsas.push({id,tipo:"cocinado",nombre:x.name,rid:x.rid,pid:null,peso:null,unidad:"g",n,usadas:0,usos:[],at:todayISO()});rec.bag=id;rec.n=n}
  S.sobras[key]=rec;save();return {x,rec};
}
function leftoverUndo(key){const r=(S.sobras||{})[key];if(!r)return;if(r.bag)S.bolsas=(S.bolsas||[]).filter(b=>b.id!==r.bag);delete S.sobras[key];save();render()}
function leftoversHTML(list){
  if(!list.length)return "";
  return `<div class="card lo"><h2>🥡 Tápers y sobras en la nevera</h2>${list.map(x=>{const w=leftoverWhen(x);
    return `<div class="lorow"><div><b>${esc(x.name)}</b><small>${racTxt(x.portions)} ${x.portions>1?"raciones":"ración"} · cocinado el ${esc(DAYS[dow(x.cookedOn)].toLowerCase()+" "+Number(x.cookedOn.slice(8)))}</small><span class="lowhen ${w.cls}">${esc(w.txt)}</span></div>
      <div class="loact">${x.daysLeft<0?`<button class="btn small" data-lo="${esc(x.key)}|tirado">Lo he tirado</button><button class="btn ghost small" data-lo="${esc(x.key)}|comido">Ya me lo he comido</button>`
        :`<button class="btn ghost small" data-lo="${esc(x.key)}|comido">Ya me lo he comido</button><button class="btn ghost small" data-lo="${esc(x.key)}|tirado">Lo he tirado</button>${x.freeze?`<button class="btn ghost small" data-lo="${esc(x.key)}|congelado">❄️ Congelarlo</button>`:""}`}</div></div>`}).join("")}</div>`;
}
function bindLeftovers(){
  main.querySelectorAll("[data-lo]").forEach(b=>b.onclick=()=>{const i=b.dataset.lo.lastIndexOf("|"),key=b.dataset.lo.slice(0,i),est=b.dataset.lo.slice(i+1);
    const r=leftoverDone(key,est);if(!r)return;render();
    const msg=est==="congelado"?`${r.x.name}: ${r.rec.n} ${r.rec.n===1?"bolsa":"bolsas"} al congelador`:est==="tirado"?`${r.x.name}: quitado de la nevera`:`${r.x.name}: ¡que aproveche!`;
    if(typeof toastAction==="function")toastAction(msg,"Deshacer",()=>leftoverUndo(key));else toast(msg)});
}

/* ---------- Pantalla ---------- */
function renderCasa(){
  const f=casaFilter,{stock}=despensaState(),bs=bolsasState(),lo=cookedLeftovers();
  const nBags=bs.reduce((t,b)=>t+b.left,0),nAll=Object.keys(stock).length+bs.length+lo.length;
  const showLo=f==="todo"||f==="Nevera",showBags=f==="todo"||f==="Congelador";
  const more=despMoreHTML(),rows=despRowsHTML(f==="todo"?"todo":f);
  let h=`<section class="view casa">${viewHead(nAll+" "+(nAll===1?"cosa":"cosas")+" en casa","Lo que *tienes*")}
    <div class="chips cchips">${[["todo","Todo"],...CASA_GROUPS.map(g=>[g,g])].map(([k,t])=>chip("data-cf",k,f===k,t)).join("")}</div>
    <button class="btn wide" id="caAdd">${ico("plus")} Añadir</button>${despFirstHTML()}`;
  if(showLo)h+=leftoversHTML(lo);
  // Lo fresco que hay que gastar ya
  if(showLo&&typeof freshExpiring==="function"){let fx=[];try{fx=freshExpiring()}catch(e){console.error(e)}if(fx.length)h+=`<div class="card htasks"><h2 style="margin:4px 0 6px">⏳ Gástalo pronto</h2>${freshRowsHTML(fx)}</div>`}
  if(showBags&&bs.length)h+=bolsasHTML({compact:true});
  if(rows)h+=`<div class="clist">${rows}</div>`;
  else if(!(showLo&&lo.length)&&!(showBags&&bs.length))h+=`<div class="empty"><p>${f==="todo"?"Aún no hay nada. Se llena solo con el pedido, el fresco y los tickets; o añádelo con «+ Añadir».":`No hay nada apuntado en ${f==="Nevera"?"la nevera":f==="Despensa"?"la despensa":"el congelador"}.`}</p></div>`;
  h+=`<p class="small muted chint">Se llena sola con el pedido, el fresco y los tickets, y se gasta al cocinar. Si algo no cuadra, tócalo y pon lo que te queda.</p>
    <div class="row clinks"><button class="btn ghost small" id="caTk">${ico("chart-bar")} Tickets e informe</button><button class="btn ghost small" id="caFz">${ico("snowflake")} El congelador al detalle${nBags?` · ${nBags} ${nBags===1?"bolsa":"bolsas"}`:""}</button></div>
    <details class="cmore"><summary><b>Lo que falta, lo que sobra y lo que vale</b><small>${esc(more.sum)}</small></summary>${more.html}</details></section>`;
  main.innerHTML=h;if(typeof bindFresh==="function")bindFresh(main);
  main.querySelectorAll("[data-cf]").forEach(b=>b.onclick=()=>{casaFilter=b.dataset.cf;render()});
  document.getElementById("caAdd").onclick=openCasaAdd;
  document.getElementById("caTk").onclick=()=>{tab="tickets";render();scrollTo(0,0)};
  document.getElementById("caFz").onclick=()=>{tab="congelador";render();scrollTo(0,0)};
  bindDespensa(more.miss);bindBolsas();bindLeftovers();
}
// «+ Añadir»: un ticket, una bolsa al congelador o algo que ya tienes
function openCasaAdd(){
  const opts=[["tk","🧾","Subir un ticket","Una foto o el PDF: lo apunto todo"],["bg","❄️","Una bolsa al congelador","Lo que congelas tú: carne en raciones, caldo, un guiso"],["dp","🥫","Algo que ya tengo","Buscar un producto y decir cuánto"]];
  showDialog(`<div class="mod">${closeBtn}<h2 class="vh" style="font-size:1.6rem">Añadir <em>a casa</em></h2>
    ${opts.map(([k,ic,t,s])=>`<button class="alt caopt" data-cadd="${k}"><span class="caic" aria-hidden="true">${ic}</span><span><b>${t}</b><small>${s}</small></span></button>`).join("")}</div>`);
  dlg.querySelectorAll("[data-cadd]").forEach(b=>b.onclick=()=>{const k=b.dataset.cadd;dlg.close();
    if(k==="tk")openTicketScan(false,null,{m:todayISO().slice(0,7),key:"suelta"});
    else if(k==="bg")openBolsa();
    else openDespAdd()});
}
