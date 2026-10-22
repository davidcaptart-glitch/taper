/* Táper · compra: listas del mes y de cada semana, online o en tienda, pedido mínimo y presupuesto */
"use strict";

function deliveryDate(start){for(const d of weekDates(start))if(dow(d)===S.home.shop.delivery)return d;return start}
const listMode=(m,key)=>S.modes[m+"|"+key]||(key==="mes"?S.home.shop.monthMode:S.home.shop.weekMode);
const weekBudget=m=>Number(S.home.budget.week)||Math.round((Number(S.home.budget.month)||0)/Math.max(1,weeksInMonth(m).length)*100)/100;

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
  });
  return out;
}
function shopping(m){
  const weeks=weeksInMonth(m), uses=monthUses(m);
  const lists={mes:{}};weeks.forEach((_,i)=>lists[i]={});
  const first={}, freezeGuide={}, extras=weeks.map(()=>0);
  const assign=S.assign[m]||{};
  for(const u of uses){
    if(u.extra!=null){extras[u.wi]+=u.extra;continue}
    const keep=P[u.pid].keep;
    let key=keep==="fresco"?String(u.freshWi):"mes";
    if(key==="mes"){if(!first[u.pid]||u.date<first[u.pid])first[u.pid]=u.date;if(assign[u.pid]!=null)key=String(assign[u.pid])}
    lists[key][u.pid]=(lists[key][u.pid]||0)+u.q;
    if(keep==="congelar")(freezeGuide[u.pid]=freezeGuide[u.pid]||[]).push({q:u.q,label:DSHORT[dow(u.slot.date)]+" "+shortDate(u.slot.date),name:u.r.name});
  }
  const out={weeks,lists:{},first,freezeGuide,extras};
  for(const key of Object.keys(lists)){
    const items=Object.entries(lists[key]).map(([pid,q])=>({pid,q,packs:packsFor(pid,q),cost:packsFor(pid,q)*price(pid)}));
    const cost=items.reduce((t,i)=>t+i.cost,0);
    const mode=listMode(m,key), online=mode==="online"&&items.length>0;
    out.lists[key]={key,items,cost,mode,fee:online?Number(S.home.shop.fee)||0:0,belowMin:online&&cost<(Number(S.home.shop.min)||0)};
  }
  const listsTotal=Object.values(out.lists).reduce((t,l)=>t+l.cost+l.fee,0);
  out.extrasTotal=extras.reduce((a,b)=>a+b,0);
  out.total=listsTotal+out.extrasTotal+(Number(S.home.budget.basics)||0);
  // Gasto previsto por semana (la compra del mes se cuenta en la primera)
  out.perWeek=weeks.map((s,i)=>{const l=out.lists[i];return (l?l.cost+l.fee:0)+extras[i]+(i===0?out.lists.mes.cost+out.lists.mes.fee+(Number(S.home.budget.basics)||0):0)});
  return out;
}
const checkKey=(m,key,pid)=>m+"|"+key+"|"+pid;
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
  const sh=shopping(m), l=sh.lists[wi], min=Number(S.home.shop.min)||0;
  const deliv=deliveryDate(sh.weeks[wi]);
  let cost=l.cost;const a=S.assign[m]=S.assign[m]||{};const moved=[];
  const cands=sh.lists.mes.items.filter(it=>!S.checks[checkKey(m,"mes",it.pid)]&&(sh.first[it.pid]||"")>=deliv).sort((x,y)=>y.cost-x.cost);
  for(const it of cands){if(cost>=min)break;a[it.pid]=wi;cost+=it.cost;moved.push(P[it.pid].name)}
  save();return {moved,ok:cost>=min,cost};
}

/* ---------- Resumen del mes ---------- */
// Analiza un mes: presupuesto previsto y real, por qué se desvió, objetivos y propuesta para el siguiente
function monthReview(m){
  const sh=shopping(m), budget=Number(S.home.budget.month)||0, weeks=sh.weeks;
  const realEntries=Object.entries(S.spent).filter(([k])=>k.startsWith(m+"|"));
  const real=realEntries.reduce((t,[,v])=>t+(Number(v)||0),0);
  const listsWith=Object.values(sh.lists).filter(l=>l.items.length).length;
  const fees=Object.values(sh.lists).reduce((t,l)=>t+l.fee,0);
  const eaten=weeks.reduce((t,st)=>t+(S.plans[st]?weekCost(st):0),0);
  const spent=real&&realEntries.length>=listsWith?real:sh.total;
  const reasons=[];
  if(fees>0)reasons.push({eur:fees,txt:`Envíos de los pedidos online: ${eur(fees)}`,fix:{weekMode:"tienda"},fixTxt:"Compra semanal en tienda"});
  if(sh.extrasTotal>0)reasons.push({eur:sh.extrasTotal,txt:`Caprichos y platos fijos sin receta: ${eur(sh.extrasTotal)}`});
  const over=weeks.filter(st=>S.plans[st]&&weekCost(st)>weekFoodTarget(st)+0.5);
  if(over.length)reasons.push({eur:over.reduce((t,st)=>t+weekCost(st)-weekFoodTarget(st),0),txt:`${over.length} ${over.length===1?"semana se pasó":"semanas se pasaron"} incluso con los platos más baratos que encajaban`,fix:{sacrifice:"proteina"},fixTxt:"Menos pescado y carne"});
  const stock=sh.total-fees-sh.extrasTotal-(Number(S.home.budget.basics)||0)-eaten;
  if(stock>5)reasons.push({eur:stock,txt:`Envases enteros: ${eur(stock)} de comida que queda en casa para otras semanas (arroz, aceite de los botes, congelados…)`});
  if(real&&realEntries.length>=listsWith&&real>sh.total+3)reasons.push({eur:real-sh.total,txt:`Pagaste ${eur(real-sh.total)} más de lo previsto en la lista: compras fuera de la lista o precios distintos`});
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
