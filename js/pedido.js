/* Táper · Guardar el pedido del mes: dónde va cada cosa y las bolsas de congelado, ya pensadas para cada plato
   S.pedido = {"AAAA-MM":{entrega,estado:"pedido"|"llegado"|"guardado",at}} (lo crea «Hacer el pedido» del Mes) */
"use strict";

// Lo de congelar que va en bolsas: carne y pescado en gramos o mililitros (lo que va por unidades, tal cual)
const pedBagged=pid=>!!P[pid]&&P[pid].keep==="congelar"&&(P[pid].unit==="g"||P[pid].unit==="ml");
// Los platos del mes que lo usan (desde hoy), por día en que se cocina: [[día,cantidad]…]
function pedUses(m,pid){
  const today=todayISO(),by={};
  for(const u of monthUses(m))if(u.pid===pid&&u.r&&u.date>=today)by[u.date]=(by[u.date]||0)+u.q;
  return Object.entries(by).sort((a,b)=>a[0].localeCompare(b[0]));
}
// Bolsas de un producto: n bolsas iguales con todo lo comprado; cada plato, su bolsa (las de más, de reserva; si hay menos, más grandes)
function pedBagPlan(m,it,n){
  const pid=it.pid,B=(S.bought||{})[checkKey(m,"mes",pid)],tot=B&&B.q>0?B.q:it.packs*P[pid].env,uses=pedUses(m,pid),dates=uses.map(x=>x[0]);
  n=Math.max(1,n||dates.length||Math.max(1,Math.round(tot/500)));
  const peso=Math.max(1,Math.round(tot/n));
  const txt=dates.length?"para el "+daysTxt(dates)+(n>dates.length?` + ${n-dates.length} de reserva`:n<dates.length?" · bolsas más grandes":""):"de reserva";
  return {pid,n,peso,tot,dates,txt};
}
let pedN={};
function openGuardarPedido(m){
  m=m||todayISO().slice(0,7);let sh;try{sh=shopping(m)}catch(e){console.error(e)}
  const l=sh&&sh.lists.mes,its=l?l.items.filter(it=>P[it.pid]):[],pe=(S.pedido||{})[m]||{};
  const bag=its.filter(it=>pedBagged(it.pid)),asis=its.filter(it=>!pedBagged(it.pid)&&casaGroup(it.pid)==="Congelador"),
    desp=its.filter(it=>casaGroup(it.pid)==="Despensa"),fr=its.filter(it=>casaGroup(it.pid)==="Nevera");
  pedN={};for(const it of bag)pedN[it.pid]=pedBagPlan(m,it).n;
  const names=(xs,k)=>{const ns=xs.map(it=>P[it.pid].name.replace(/\s*\(.*?\)/g,""));return ns.length<=k?ns.join(", "):ns.slice(0,k).join(", ")+` y ${ns.length-k} ${ns.length-k===1?"cosa":"cosas"} más`};
  const draw=()=>{
    const plans=bag.map(it=>pedBagPlan(m,it,pedN[it.pid])),nb=plans.reduce((t,x)=>t+x.n,0);
    showDialog(`<div class="mod ped">${closeBtn}<div class="veb">${esc("Pedido de "+monthName(m).split(" ")[0].toLowerCase()+" · "+longDate(todayISO()))}</div><h2 class="vh" style="font-size:1.7rem">Guarda <em>el pedido</em></h2>
      ${!its.length?`<p class="muted">No hay nada en la compra del mes de ${esc(monthName(m).toLowerCase())}.</p>`:""}
      ${plans.length?`<div class="card"><p class="psec">❄️ Al congelador, en bolsas</p>${plans.map(x=>`<div class="dprow"><span><b>${esc(P[x.pid].name)}</b><small>${x.n} ${x.n===1?"bolsa":"bolsas"} de ${esc(bolsaPeso({peso:x.peso,unidad:P[x.pid].unit}))} · ${esc(x.txt)}</small></span>
        <span class="step"><button type="button" data-pbq="${x.pid}|-1" aria-label="Una bolsa menos">−</button><b>${x.n}</b><button type="button" data-pbq="${x.pid}|1" aria-label="Una bolsa más">+</button></span></div>`).join("")}
        <p class="small muted" style="margin-top:6px">Cada bolsa ya sabe para qué plato es: te aviso la noche antes de pasarla a la nevera.</p></div>`:""}
      ${asis.length?`<div class="card"><p class="psec">❄️ Al congelador, tal cual</p><p class="small">${esc(names(asis,6))}.</p></div>`:""}
      ${desp.length?`<div class="card"><p class="psec">🥫 A la despensa</p><p class="small">${esc(names(desp,6))}.</p></div>`:""}
      ${fr.length?`<div class="card"><p class="psec">🧊 A la nevera</p><p class="small">${esc(names(fr,6))}.</p></div>`:""}
      ${its.length?`<div class="actions"><button class="btn wide" id="pedOk">Guardarlo así${nb?` · ${nb} ${nb===1?"bolsa":"bolsas"}`:""}</button></div>`:""}</div>`,true);
    dlg.querySelectorAll("[data-pbq]").forEach(b=>b.onclick=()=>{const [pid,d]=b.dataset.pbq.split("|");pedN[pid]=Math.max(1,Math.min(12,(pedN[pid]||1)+Number(d)));const y=dlg.scrollTop;draw();dlg.scrollTop=y});
    dlg.querySelector("#pedOk")?.addEventListener("click",()=>{const n=storePedido(m,plans);dlg.close();tab="despensa";casaFilter="Congelador";render();scrollTo(0,0);
      toast(n?`Guardado: ${n} ${n===1?"bolsa":"bolsas"} al congelador`:"Guardado: todo en su sitio")});
  };
  draw();
}
// Guardarlo así: la compra del mes queda comprada (con su foto de lo comprado) y lo de congelar en bolsas, que es lo que cuenta en casa
function storePedido(m,plans){
  const key="mes",today=todayISO();
  if(!(S.shopDone||{})[shopKey(m,key)])markShopDone(m,key);else try{syncBought()}catch(e){}
  S.bolsas=S.bolsas||[];S.bought=S.bought||{};let nb=0;
  for(const x of plans){const p=P[x.pid],k=checkKey(m,key,x.pid);
    // Si ya se guardó (dos veces «Guardarlo así»), no se duplican las bolsas
    if(S.bolsas.some(b=>b.ped===m+"|"+key&&b.pid===x.pid))continue;
    if(!S.bought[k])try{snapBought(k)}catch(e){}
    const id=uid("bg");if(S.bought[k])S.bought[k].bolsas=id;   // lo comprado de este producto ya no suma: cuentan las bolsas
    S.bolsas.push({id,tipo:p.sec==="Marisco y pescado"||/pescado/i.test(p.sec||"")?"pescado":"carne",nombre:p.name.replace(/\s*\(.*?\)/g,""),pid:x.pid,peso:x.peso,unidad:p.unit,n:x.n,usadas:0,usos:[],at:today,para:x.dates,ped:m+"|"+key});
    nb+=x.n}
  S.pedido=S.pedido||{};S.pedido[m]={...(S.pedido[m]||{}),estado:"guardado",at:today};
  save();return nb;
}
