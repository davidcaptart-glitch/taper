/* Táper · compra: listas del mes y de cada semana, online o en tienda, pedido mínimo y presupuesto */
"use strict";

function deliveryDate(start){for(const d of weekDates(start))if(dow(d)===S.home.shop.delivery)return d;return start}
// Formas de comprar y sus tarifas (las pone el supermercado, no el usuario)
const SHOP_MODES={online:"🛒 Online",domicilio:"🚚 En tienda, te lo llevan",tienda:"🏪 En tienda"};
const superInfo=()=>(SUPERS||[]).find(x=>x.id===S.home.super)||(SUPERS||[])[0]||{};
// ¿Reparte este súper en tu código postal? (si no, solo se puede comprar en tienda)
const delivers=sid=>!((superById(sid).sin_reparto||[]).includes(S.home.cp));
const tarifa=(mode,sid)=>{const sp=sid?superById(sid):superInfo();if(mode!=="tienda"&&sid&&!delivers(sid))return {envio:0,minimo:0,soloTienda:true};
  const ent=sp.entrega||{},e=ent[mode]||(mode==="domicilio"?ent.online:null);
  return {envio:Number(e&&e.envio)||0,minimo:Number(e&&e.minimo)||0,gratisDesde:Number(e&&e.gratis_desde)||0}};
const listMode=(m,key)=>S.modes[m+"|"+key]||(key==="mes"?S.home.shop.monthMode:S.home.shop.weekMode);
// Presupuesto de un mes: el que se puso al prepararlo (Navidad, vacaciones…) o el normal
const monthBudget=m=>Number(((S.monthPrep||{})[m]||{}).budget)||Number(S.home.budget.month)||0;
const weekBudget=m=>(((S.monthPrep||{})[m]||{}).budget?0:Number(S.home.budget.week))||Math.round(monthBudget(m)/Math.max(1,weeksInMonth(m).length)*100)/100;

// Recorre los platos del mes: qué ingredientes hacen falta, en qué lista y cuándo
function monthUses(m,exceptId){
  const weeks=weeksInMonth(m), out=[];
  weeks.forEach((start,wi)=>{
    const wk=S.plans[start];if(!wk)return;
    const deliv=deliveryDate(start);
    for(const sl of buildSlots(start)){
      if(sl.id===exceptId)continue;
      const v=wk.slots[sl.id], r=v&&RX[v.recipe];
      if(!r){if(sl.fixed&&!sl.fixed.recipe)out.push({extra:Number(sl.fixed.cost)||0,wi,slot:sl});continue}
      const cook=cookDayFor(sl.date);
      // Lo fresco para lo que se cocina antes de que llegue el pedido sale del pedido de la semana anterior
      const freshWi=wi>0&&cook<deliv?wi-1:wi;
      for(const [pid,q] of r.ing)out.push({pid,q:q*sl.portions,wi,freshWi,date:cook,slot:sl,r});
    }
    // Desayunos, almuerzos y meriendas
    for(const [d,dd] of Object.entries(wk.small||{})){if(d<start||d>addDays(start,6))continue;
      for(const [m,v] of Object.entries(dd)){const r=RX[v.recipe];if(!r)continue;
        const fw=wi>0&&d<deliv?wi-1:wi, n=smallPortions(d,m);
        for(const [pid,q] of r.ing)out.push({pid,q:q*n,wi,freshWi:fw,date:d,slot:{date:d,meal:m},r})}}
  });
  return out;
}
function shopping(m){
  const weeks=weeksInMonth(m), uses=monthUses(m);
  const lists={mes:{}};weeks.forEach((_,i)=>lists[i]={});
  const first={}, freezeGuide={}, bags={}, extras=weeks.map(()=>0);
  const assign=S.assign[m]||{};
  for(const u of uses){
    if(u.extra!=null){extras[u.wi]+=u.extra;continue}
    const keep=P[u.pid].keep;
    let key=keep==="fresco"?String(u.freshWi):"mes";
    if(key==="mes"){if(!first[u.pid]||u.date<first[u.pid])first[u.pid]=u.date;if(assign[u.pid]!=null)key=String(assign[u.pid])}
    lists[key][u.pid]=(lists[key][u.pid]||0)+u.q;
    if(keep==="congelar"){(freezeGuide[u.pid]=freezeGuide[u.pid]||[]).push({q:u.q,label:DSHORT[dow(u.slot.date)]+" "+shortDate(u.slot.date),name:u.r.name});
      // Bolsas para congelar de esta lista: una por producto, día y plato
      const id=m+"|"+key+"|"+u.pid+"|"+u.slot.date+"|"+u.r.id, b=(bags[key]=bags[key]||{});
      if(b[id])b[id].q+=u.q;else b[id]={id,pid:u.pid,q:u.q,date:u.slot.date,rid:u.r.id}}
  }
  const out={weeks,lists:{},first,freezeGuide,extras,bags:Object.fromEntries(Object.entries(bags).map(([k,v])=>[k,Object.values(v).sort((a,b)=>a.date.localeCompare(b.date))]))};
  for(const key of Object.keys(lists)){
    const items=Object.entries(lists[key]).map(([pid,q])=>({pid,q,packs:packsFor(pid,q),cost:packsFor(pid,q)*price(pid),sup:superFor(pid)}));
    const cost=items.reduce((t,i)=>t+i.cost,0);
    const mode=listMode(m,key);
    // Un grupo por supermercado: cada uno con su envío y su pedido mínimo
    const groups={};for(const it of items){const g=groups[it.sup]=groups[it.sup]||{sup:it.sup,items:[],cost:0};g.items.push(it);g.cost+=it.cost}
    for(const g of Object.values(groups)){const t=tarifa(mode,g.sup);g.soloTienda=!!t.soloTienda;g.min=t.minimo;
      g.fee=t.gratisDesde&&g.cost>=t.gratisDesde?0:t.envio;g.belowMin=t.minimo>0&&g.cost<t.minimo}
    const gl=Object.values(groups).sort((a,b)=>(b.sup===mainSuper())-(a.sup===mainSuper())||b.cost-a.cost);
    const main=groups[mainSuper()]||gl[0]||{min:tarifa(mode).minimo};
    out.lists[key]={key,items,cost,mode,groups:gl,fee:gl.reduce((t,g)=>t+g.fee,0),min:main.min||0,belowMin:gl.some(g=>g.belowMin)};
  }
  const listsTotal=Object.values(out.lists).reduce((t,l)=>t+l.cost+l.fee,0);
  out.extrasTotal=extras.reduce((a,b)=>a+b,0);
  out.total=listsTotal+out.extrasTotal+(Number(S.home.budget.basics)||0);
  // Gasto previsto por semana (la compra del mes se cuenta en la primera)
  out.perWeek=weeks.map((s,i)=>{const l=out.lists[i];return (l?l.cost+l.fee:0)+extras[i]+(i===0?out.lists.mes.cost+out.lists.mes.fee+(Number(S.home.budget.basics)||0):0)});
  return out;
}
const checkKey=(m,key,pid)=>m+"|"+key+"|"+pid;

/* ---------- Recordatorios de compra ----------
   Cada lista (la del mes y la de cada semana) tiene su día: en tienda, el mismo día; online o con entrega,
   el día antes (hay que hacer el pedido). Se recuerda cada día hasta que se hace o se pospone. */
const shopKey=(m,key)=>m+"|"+key;
function shopIsDone(m,l){
  if((S.shopDone||{})[shopKey(m,l.key)])return true;
  if((S.tickets||[]).some(t=>t.m===m&&t.list===l.key))return true;
  return l.items.length>0&&l.items.every(it=>S.checks[checkKey(m,l.key,it.pid)]);
}
function shopReminders(){
  const out=[],today=todayISO();
  for(const m of [today.slice(0,7),nextMonthOf(today.slice(0,7))]){
    let sh;try{sh=shopping(m)}catch(e){continue}
    for(const l of Object.values(sh.lists)){
      if(!l.items.length)continue;
      const wi=l.key==="mes"?0:Number(l.key), ws=sh.weeks[wi];if(!ws)continue;
      if(S.home.start&&addDays(ws,6)<S.home.start)continue;
      const buyDay=deliveryDate(ws), online=l.mode!=="tienda";
      if(buyDay<addDays(today,-3))continue;   // compras ya pasadas: no se recuerdan
      const due=online?addDays(buyDay,l.key==="mes"?-2:-1):buyDay;
      if(shopIsDone(m,l))continue;
      out.push({m,key:l.key,due,online,buyDay,cost:l.cost+l.fee,n:l.items.length,
        title:l.key==="mes"?(online?"🛒 Haz el pedido del mes":"🛒 Hoy toca la compra del mes"):(online?"🛒 Haz el pedido de la semana":"🛒 Hoy toca la compra de la semana"),
        body:`${l.items.length} productos · unos ${eur(l.cost+l.fee)}${online?` · llega el ${DAYS[dow(buyDay)].toLowerCase()}`:""}`});
    }
  }
  return out;
}
// Las que ya tocan (y no se han pospuesto)
const shopDueNow=()=>shopReminders().filter(r=>r.due<=todayISO()&&!(((S.shopSnooze||{})[shopKey(r.m,r.key)]||"")>todayISO()));
// Bolsas para congelar pendientes de una lista
const bagsPending=(sh,key)=>(sh.bags[key]||[]).filter(b=>!(S.bags||{})[b.id]);
function markShopDone(m,key){S.shopDone=S.shopDone||{};S.shopDone[shopKey(m,key)]=todayISO();save()}
// Lo que tienes en casa: lo comprado (marcado) menos lo que necesitan los demás platos del mes
function inventory(m,exceptId){
  const sh=shopping(m);let any=false;const bought={};
  for(const l of Object.values(sh.lists))for(const it of l.items)if(S.checks[checkKey(m,l.key,it.pid)]){any=true;bought[it.pid]=(bought[it.pid]||0)+it.packs*P[it.pid].env}
  if(!any)return null;
  const need={};for(const u of monthUses(m,exceptId))if(u.pid)need[u.pid]=(need[u.pid]||0)+u.q;
  const inv={};for(const [pid,q] of Object.entries(bought))inv[pid]=q-(need[pid]||0);
  return inv;
}
// Completa un pedido online que no llega al mínimo adelantando cosas de la compra del mes
function fillToMinimum(m,wi){
  const sh=shopping(m), l=sh.lists[wi], min=l.min||0;
  // Con varios supermercados se completa el del principal
  const g=(l.groups||[]).find(x=>x.sup===mainSuper());if(g)l.cost=g.cost;
  const deliv=deliveryDate(sh.weeks[wi]);
  let cost=l.cost;const a=S.assign[m]=S.assign[m]||{};const moved=[];
  const cands=sh.lists.mes.items.filter(it=>!S.checks[checkKey(m,"mes",it.pid)]&&(sh.first[it.pid]||"")>=deliv).sort((x,y)=>y.cost-x.cost);
  for(const it of cands){if(cost>=min)break;a[it.pid]=wi;cost+=it.cost;moved.push(P[it.pid].name)}
  save();return {moved,ok:cost>=min,cost};
}

// Cuánto costaría esta lista entera en cada supermercado (los productos que no tiene se cuentan a precio del principal)
function compareSupers(l){
  return chosenSupers().map(sid=>{let cost=0,miss=0;
    for(const it of l.items){const v=superPrice(sid,it.pid);if(v==null){miss++;cost+=it.packs*(superPrice(mainSuper(),it.pid)??price(it.pid))}else cost+=it.packs*v}
    return {sid,cost,miss}}).sort((a,b)=>a.cost-b.cost);
}

/* ---------- Cómo comprar más barato ----------
   Compara formas de repartir la compra del mes (despensa, congelados) y la semanal (fresco):
   envíos de todo el mes y si cada pedido online llega al mínimo. */
const SHOP_PLANS=[
  {id:"online",month:"online",week:"online",t:"Todo online",d:"Te lo traen todo: un envío por pedido"},
  {id:"mixto",month:"online",week:"tienda",t:"Despensa online, fresco en tienda",d:"Un solo pedido grande al mes y el fresco lo compras tú"},
  {id:"domicilio",month:"domicilio",week:"tienda",t:"Despensa en tienda con entrega, fresco en tienda",d:"Compras en la tienda y te llevan a casa lo que pesa"},
  {id:"tienda",month:"tienda",week:"tienda",t:"Todo en tienda",d:"Sin envíos: lo llevas tú"}
];
function shopPlans(m){
  const keep={month:S.home.shop.monthMode,week:S.home.shop.weekMode},keepModes={};
  for(const k of Object.keys(S.modes))if(k.startsWith(m+"|")){keepModes[k]=S.modes[k];delete S.modes[k]}
  const out=[];
  try{
    for(const p of SHOP_PLANS){
      if(!Object.keys(superInfo().entrega||{}).includes(p.month==="domicilio"?"domicilio":p.month)&&p.month!=="tienda")continue;
      S.home.shop.monthMode=p.month;S.home.shop.weekMode=p.week;
      const sh=shopping(m),lists=Object.values(sh.lists).filter(l=>l.items.length);
      const fees=lists.reduce((t,l)=>t+l.fee,0),orders=lists.filter(l=>l.mode!=="tienda").length;
      const below=lists.filter(l=>l.belowMin).length,trips=lists.filter(l=>l.mode==="tienda").length;
      out.push({...p,fees,orders,below,trips,total:sh.total})}
  }finally{S.home.shop.monthMode=keep.month;S.home.shop.weekMode=keep.week;Object.assign(S.modes,keepModes)}
  const cur=out.find(p=>p.month===keep.month&&p.week===keep.week&&!Object.keys(keepModes).length);
  // Recomendada: la más barata que te lleva la despensa a casa sin pedidos por debajo del mínimo
  const by=(a,b)=>a.fees-b.fees||a.trips-b.trips;
  const ok=out.filter(p=>!p.below), deliv=ok.filter(p=>p.month!=="tienda");
  const best=(deliv.length?deliv:ok.length?ok:out).slice().sort(by)[0], cheapest=(ok.length?ok:out).slice().sort(by)[0];
  return {plans:out,cur,best,cheapest};
}

/* ---------- Resumen del mes ---------- */
// Analiza un mes: presupuesto previsto y real, por qué se desvió, objetivos y propuesta para el siguiente
function monthReview(m){
  const sh=shopping(m), budget=monthBudget(m), weeks=sh.weeks;
  const realEntries=Object.entries(S.spent).filter(([k])=>k.startsWith(m+"|"));
  const real=realEntries.reduce((t,[,v])=>t+(Number(v)||0),0);
  const listsWith=Object.values(sh.lists).filter(l=>l.items.length).length;
  const fees=Object.values(sh.lists).reduce((t,l)=>t+l.fee,0);
  const eaten=weeks.reduce((t,st)=>t+(S.plans[st]?weekCost(st):0),0);
  const spent=real&&realEntries.length>=listsWith?real:sh.total;
  const reasons=[];
  if(fees>0)reasons.push({eur:fees,txt:`Envíos a domicilio: ${eur(fees)}`,fix:{weekMode:"tienda"},fixTxt:"Compra semanal en tienda, llevándotela tú"});
  if(sh.extrasTotal>0)reasons.push({eur:sh.extrasTotal,txt:`Caprichos y platos fijos sin receta: ${eur(sh.extrasTotal)}`});
  const over=weeks.filter(st=>S.plans[st]&&weekCost(st)>weekFoodTarget(st)+0.5);
  if(over.length)reasons.push({eur:over.reduce((t,st)=>t+weekCost(st)-weekFoodTarget(st),0),txt:`${over.length} ${over.length===1?"semana se pasó":"semanas se pasaron"} incluso con los platos más baratos que encajaban`,fix:{sacrifice:"proteina"},fixTxt:"Menos pescado y carne"});
  const stock=sh.total-fees-sh.extrasTotal-(Number(S.home.budget.basics)||0)-eaten;
  if(stock>5)reasons.push({eur:stock,txt:`Envases enteros: ${eur(stock)} de comida que queda en casa para otras semanas (arroz, aceite de los botes, congelados…)`});
  if(real&&realEntries.length>=listsWith&&real>sh.total+3)reasons.push({eur:real-sh.total,txt:`Pagaste ${eur(real-sh.total)} más de lo previsto en la lista: compras fuera de la lista o precios distintos`});
  const sp=typeof spendingOf==="function"?spendingOf(m):null;
  if(sp&&sp.off>3)reasons.push({eur:sp.off,txt:`Compraste ${eur(sp.off)} fuera de la lista (${sp.top.slice(0,3).map(t=>t.desc.toLowerCase()).join(", ")}…)`});
  reasons.sort((a,b)=>b.eur-a.eur);
  // Objetivos: proteína, entrenos y comidas fuera o cambiadas
  const days=[];const [y,mm]=m.split("-").map(Number);for(let d=1;d<=new Date(y,mm,0).getDate();d++)days.push(iso(new Date(y,mm-1,d)));
  const past=days.filter(d=>d<todayISO()&&S.plans[weekStartFor(d)]);
  let protDays=0,protOk=0;for(const d of past){const pt=dayProtein(me(),d);if(pt&&!pt.unknown){protDays++;if(pt.got>=pt.target*0.85)protOk++}}
  let planned=0,done=0;for(const d of past){const ps=plannedSessions(d);planned+=ps.length;const res=((S.sport||{})[d]||{}).res||{};ps.forEach((_,i)=>{if(!res[i]||res[i].st!=="no")done++})}
  const meals=Object.entries(S.meals||{}).filter(([k])=>k.startsWith(m));
  const out=meals.filter(([,v])=>v.status==="fuera").length, other=meals.filter(([,v])=>v.status==="otro").length, notCooked=meals.filter(([,v])=>v.status==="nada").length;
  const proposal=Math.ceil(Math.max(spent,budget*0.5)/5)*5;
  return {m,budget,forecast:sh.total,real,realComplete:realEntries.length>=listsWith&&real>0,spent,ok:spent<=budget,reasons,protDays,protOk,planned,done,out,other,notCooked,proposal,fees};
}
