/* Táper · Lo fresco que caduca: cada compra es un lote con su fecha (la despensa gasta primero lo más antiguo),
   y cada producto fresco aguanta unos días. Si se va a pasar antes de que un plato lo use, se avisa en Hoy y en En casa
   con «Ponerlo en el menú» (o «Congelarlo» la carne y el pescado que no se han guardado en bolsas) */
"use strict";

// Días que aguanta en la nevera desde que se compra (orientativo, lo prudente)
const VIDA={ensalada:4,rucula:3,cogollos:6,champi:4,aguacate:4,guacamole:3,mango:5,platano:6,tomate_cherry:7,esparragos:4,limon:21,
  manzana:21,pera:10,naranja:14,mandarina:10,kiwi:14,zanahoria:14,repollo:14,calabaza:14,remolacha:10,pepino:7,
  huevos:28,yogur:20,kefir:14,queso_batido:10,queso_fresco:6,feta:10,mozzarella_fresca:4,hummus:5,tofu:6,seitan:6,noquis:10,
  jamon:5,pavo_fiambre:5,serrano:10,salchichas:7,frankfurt:7,bacon:10,chorizo:20,guanciale:20,cheddar:20,queso_lonchas:14,queso:21,grana_padano:30,mantequilla:30,
  masa_empanadilla:7,masa_empanada:7,masa_pizza:7,pan_integral:5,pan_burger:5,pan_barra:2,pan_brioche:5,pan_perrito:5,
  dorada:1,picada:1,picada_pollo:1,burger:2,burger_pavo:2,burger_vacuno:2};
const vidaDe=pid=>{const p=P[pid];if(!p)return null;if(VIDA[pid]!=null)return VIDA[pid];
  if(p.keep==="congelar")return 2;                    // carne o pescado fresco: congélalo enseguida
  if(/pizza/.test(pid))return 10;if(p.aisle==="Fruta y verdura")return 7;if(p.aisle==="Huevos y lácteos")return 10;return null};
// Lo fresco que hay en casa con su fecha: [{pid, q, at, expires, daysLeft, next, rest}]
// Los platos que vienen gastan primero lo más antiguo (como la despensa), y cada entrada solo con los de antes de que se pase:
// next, el primer plato que tira de ella; rest, lo que le quedará cuando se pase (lo que ningún plato usa a tiempo)
function freshStock(){
  const {lots}=despensaState(),today=todayISO(),out=[],uses={};
  try{for(const x of upcomingUses(today,addDays(today,60)))if(x.q>0)(uses[x.pid]=uses[x.pid]||[]).push({date:x.date,q:x.q,u:x.u})}catch(e){}
  for(const [pid,ls] of Object.entries(lots||{})){const p=P[pid];if(!p||(p.keep!=="fresco"&&p.keep!=="congelar"))continue;const v=vidaDe(pid);if(v==null)continue;
    const us=(uses[pid]||[]).sort((a,b)=>a.date.localeCompare(b.date));let i=0;
    for(const x of ls.filter(x=>!x.bag&&!x.fz&&x.left>=dpEps(pid)&&x.at).sort((a,b)=>a.at.localeCompare(b.at))){
      const expires=addDays(x.at,v),daysLeft=daysBetween(today,expires);let rest=x.left,next=null;
      while(rest>=dpEps(pid)&&i<us.length&&us[i].date<=expires){const t=Math.min(rest,us[i].q);if(!next)next=us[i].u||{date:us[i].date};rest-=t;us[i].q-=t;if(us[i].q<dpEps(pid))i++}
      out.push({pid,q:x.left,at:x.at,expires,daysLeft,next,rest:Math.max(0,rest),congelar:p.keep==="congelar"})}}
  return out.sort((a,b)=>a.daysLeft-b.daysLeft);
}
// Lo que hay que gastar ya: caduca hoy o mañana (o ya se ha pasado) y los platos de antes no lo gastan entero (lo que sobra de un envase
// también: menos de un 10 % del envase no se cuenta). q: lo que quedará
const freshMin=pid=>Math.max(dpEps(pid),P[pid].env*.1);
function freshExpiring(){return freshStock().filter(x=>x.daysLeft<=1&&x.rest>=freshMin(x.pid)).map(x=>({...x,q:x.rest}))}
const freshNm=pid=>P[pid].name.replace(/ \(.*\)$/,"").toLowerCase();
// Filas para Hoy y En casa
function freshRowsHTML(list){
  return list.map(x=>{const nm=esc(freshNm(x.pid)),q=esc(fmtQty(x.q,P[x.pid].unit));
    const t=x.daysLeft<0?`${cap(freshNm(x.pid))} ya se ha pasado`:x.congelar?`Congela hoy ${nm}`:`Gasta ${x.daysLeft===0?"hoy":"mañana como tarde"} ${nm}`;
    const s=x.daysLeft<0?`Comprado el ${shortDate(x.at)}: mejor tirarlo si no tiene buena pinta.`:x.congelar?`Lo compraste el ${shortDate(x.at)} y no está en el congelador. Mañana ya no está bueno en la nevera.`:`Te quedan ${q} y ningún plato lo usa a tiempo.`;
    const btns=x.daysLeft<0?"":x.congelar?`<button class="btn small" data-fxbag="${x.pid}">Congelarlo</button>`:`<button class="btn small" data-fxuse="${x.pid}">Ponerlo en el menú</button>`;
    return `<div class="task"><span class="tic warn">${x.congelar?"❄️":"⏳"}</span><div><h3>${t}</h3><p class="small muted">${s}</p>${btns?`<div class="tacts">${btns}</div>`:""}</div></div>`}).join("");
}
function bindFresh(root){
  root.querySelectorAll("[data-fxuse]").forEach(b=>b.onclick=()=>{const x=freshStock().find(y=>y.pid===b.dataset.fxuse);useFreshInMenu(b.dataset.fxuse,x?x.expires:todayISO())});
  root.querySelectorAll("[data-fxbag]").forEach(b=>b.onclick=()=>{if(typeof openBolsa==="function")openBolsa();else{tab="congelador";render()}});
}
// Como «Ponerlo en el menú» de la despensa, pero solo en una comida de antes de que se pase (también hoy, si aún no se ha comido).
// Esos días ya están comprados: solo un plato que salga entero de lo que hay en casa
function useFreshInMenu(pid,until){
  const {stock}=despensaState();let best=null;
  for(const sl of changeableSlots(10,true)){if(sl.date>until)continue;const ctx=makeCtx(weekStartFor(sl.date),sl.id),wk=S.plans[weekStartFor(sl.date)],sls=buildSlots(weekStartFor(sl.date));
    const inv=slotNoShop(sl.id)?homeInv(sl)||{}:null;
    for(const r of candidates(sl))if(r.ing.some(([p])=>p===pid)&&!kidClash(wk,sls,sl,r.id)&&!(inv&&missingFor(r,sl,inv).length)){const sc=scoreRecipe(r,sl,ctx)+4*stockCover(r,sl,stock);if(!best||sc>best.s)best={s:sc,r,sl}}}
  if(!best){toast(`No hay ninguna comida antes del ${shortDate(until)} con un plato que lo lleve: úsalo a tu manera (ensalada, tostada…)`);return}
  setSlotRecipe(best.sl,best.r.id);render();
  toast(`${best.r.name}: ${DAYS[dow(best.sl.date)].toLowerCase()} ${shortDate(best.sl.date)}, ${best.sl.meal}`);
}
