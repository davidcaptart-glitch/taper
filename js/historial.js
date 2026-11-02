/* Táper · tus tickets: el historial de todo lo que has subido (con filtros) y el informe de cada mes
   de en qué se va el dinero, en comida y en lo que no es comida */
"use strict";

// Tipo de gasto de cada línea del ticket: la comida por secciones y lo demás (limpieza, higiene, bebé…)
const AISLE_GROUP={"Carne y pescado":"Carne y pescado","Huevos y lácteos":"Lácteos, huevos y charcutería","Fruta y verdura":"Fruta y verdura","Despensa":"Despensa","Congelados":"Congelados"};
const FOOD_GROUP={"Carne":"Carne y pescado","Pescado y marisco":"Carne y pescado"};
const NONFOOD_CAT=[[/^Limpieza/,"Limpieza y hogar"],[/cabello|facial|corporal|Maquillaje/,"Higiene y cuidado personal"],[/Fitoterapia|parafarmacia/i,"Parafarmacia"],[/^Beb/,"Bebé"],[/Mascotas/,"Mascotas"]];
const NONFOOD_KINDS=new Set(["Limpieza y hogar","Higiene y cuidado personal","Parafarmacia","Bebé","Mascotas","Bolsas","Envío y preparación","Otros (no comida)","Sin detalle"]);
const KIND_ICO={"Fruta y verdura":"🥦","Carne y pescado":"🥩","Lácteos, huevos y charcutería":"🧀","Pan y bollería":"🥖","Despensa":"🥫","Congelados":"❄️","Platos preparados":"🍕","Dulces y aperitivos":"🍪","Bebidas":"🥤","Bebidas alcohólicas":"🍷","Alimentación infantil":"🍼","Otra comida":"🍽️",
  "Limpieza y hogar":"🧽","Higiene y cuidado personal":"🧴","Parafarmacia":"💊","Bebé":"🧷","Mascotas":"🐾","Bolsas":"🛍️","Envío y preparación":"🚚","Otros (no comida)":"📦","Sin detalle":"🧾"};
function lineKind(l){
  // l.g: la sección del catálogo (más precisa que la del producto de Táper)
  if(l.food){const g=FOOD_GROUP[l.g||l.group]||l.g||l.group;if(KIND_ICO[g]&&!NONFOOD_KINDS.has(g))return g;
    return (l.pid&&P[l.pid]&&AISLE_GROUP[P[l.pid].aisle])||AISLE_GROUP[l.group]||"Otra comida"}
  if(l.group==="Bolsas")return "Bolsas";if(l.group==="Preparación y envío")return "Envío y preparación";
  let cat=l.cat;if(!cat&&l.mid&&MC){const i=MC.p.findIndex(x=>x[0]===l.mid);if(i>=0)cat=MC.cats[MC.p[i][2]].n}
  if(cat)for(const [re,k] of NONFOOD_CAT)if(re.test(cat))return k;
  return "Otros (no comida)";
}
const superNm=t=>t.super&&t.super!=="otro"?superById(t.super).nombre.split(" /")[0]:(t.store||"").split(" · ")[0]||"Otro súper";
const listNm=t=>t.list==="suelta"?"Compra suelta":t.list==="mes"?"Compra del mes":"Compra de la semana";

/* ---------- Informe de un mes ---------- */
function monthSpend(m){
  const tks=(S.tickets||[]).filter(t=>(t.date||"").slice(0,7)===m),kinds={},prods={},shops={};let food=0,non=0,extra=0;
  for(const t of tks){let sum=0;
    for(const l of t.lines){const k=lineKind(l),a=Number(l.amount)||0;sum+=a;kinds[k]=(kinds[k]||0)+a;
      if(l.food){food+=a;if(l.extra)extra+=a}else non+=a;
      const pn=l.name||l.desc;prods[pn]=prods[pn]||{n:pn,a:0,food:l.food};prods[pn].a+=a}
    // Lo que el ticket cobra y no está en las líneas leídas (redondeos, una línea que no se leyó…)
    const rest=Math.round(((Number(t.total)||sum)-sum)*100)/100;if(Math.abs(rest)>=0.05){kinds["Sin detalle"]=(kinds["Sin detalle"]||0)+rest;non+=rest}
    const sh=superNm(t);shops[sh]=(shops[sh]||0)+(Number(t.total)||sum)}
  // Compras apuntadas a mano sin ticket (en «Lo que he pagado»)
  let manual=0;for(const [k,v] of Object.entries(S.spent||{})){const [mm,key]=k.split("|");if(mm===m&&!tks.some(t=>t.m===mm&&t.list===key))manual+=Number(v)||0}
  const total=food+non;
  return {m,tks,total,food,non,extra,manual,kinds:Object.entries(kinds).filter(([,v])=>Math.abs(v)>=0.01).sort((a,b)=>b[1]-a[1]),
    prods:Object.values(prods).sort((a,b)=>b.a-a.a),shops:Object.entries(shops).sort((a,b)=>b[1]-a[1])};
}
function reportHTML(m){
  const s=monthSpend(m),p=monthSpend(prevMonthOf(m)),pk=Object.fromEntries(p.kinds);
  if(!s.tks.length)return `<div class="empty"><p>No hay tickets de ${esc(monthName(m).toLowerCase())}.${s.manual?` Apuntaste a mano ${eur(s.manual)} sin ticket.`:""}</p><p class="small muted">Sube los tickets (foto, captura o PDF) y aquí verás en qué se va el dinero.</p></div>`;
  const max=Math.max(...s.kinds.map(([,v])=>v));
  const dif=(a,b)=>!b?"":Math.abs(a-b)<1?` <small class="muted">= que el mes pasado</small>`:` <small style="color:${a>b?"var(--accent)":"var(--ok)"}">${a>b?"▲":"▼"} ${eur(Math.abs(a-b))}</small>`;
  return `<div class="dsum"><div><b>${eur(s.total)}</b><small>gastado en ${s.tks.length} ${s.tks.length===1?"ticket":"tickets"}</small></div><div><b>${eur(s.food)}</b><small>en comida (${Math.round(s.food/s.total*100)} %)</small></div><div><b>${eur(s.non)}</b><small>en lo demás</small></div></div>
    ${p.tks.length?`<p class="small">Respecto a ${esc(monthName(p.m).split(" ")[0].toLowerCase())}: ${s.total>p.total?`<b style="color:var(--accent)">${eur(s.total-p.total)} más</b>`:`<b style="color:var(--ok)">${eur(p.total-s.total)} menos</b>`} (entonces ${eur(p.total)}).</p>`:""}
    ${s.extra>=1?`<p class="small">De la comida, <b>${eur(s.extra)}</b> fueron cosas que no estaban en la lista.</p>`:""}
    <div class="card"><h2>En qué se va el dinero</h2>${s.kinds.map(([k,v])=>`<div class="spbar rep"><span>${KIND_ICO[k]||"•"} ${esc(k)}</span><i style="width:${Math.max(3,v/max*100)}%"></i><b>${eur(v)}${dif(v,pk[k])}</b></div>`).join("")}</div>
    <div class="card"><h2>Lo que más</h2>${s.prods.slice(0,8).map(x=>`<div class="fixed"><span>${esc(x.n.charAt(0)+x.n.slice(1).toLowerCase())}${x.food?"":` <small class="muted">· no es comida</small>`}</span><b>${eur(x.a)}</b></div>`).join("")}</div>
    <div class="card"><h2>Dónde</h2>${s.shops.map(([k,v])=>`<div class="spbar"><span>${esc(k)}</span><i style="width:${Math.max(3,v/s.shops[0][1]*100)}%"></i><b>${eur(v)}</b></div>`).join("")}
      <p class="small muted" style="margin-top:8px">Ticket medio: ${eur(s.total/s.tks.length)}${s.manual?` · además apuntaste ${eur(s.manual)} a mano sin ticket (no está desglosado)`:""}.</p></div>`;
}

/* ---------- Historial ---------- */
let tkView="lista",tkMonth=null,tkBy="subido",tkDay="",tkSup="todos",tkQ="";
const tkUp=t=>t.at||t.date;   // los tickets de antes no guardaban el día en que se subieron: se usa el de la compra
function ticketsFiltered(){
  const key=tkBy==="subido"?tkUp:t=>t.date,q=normTxt(tkQ);
  return (S.tickets||[]).filter(t=>(tkDay?key(t)===tkDay:key(t).slice(0,7)===tkMonth)&&(tkSup==="todos"||superNm(t)===tkSup)&&(!q||t.lines.some(l=>normTxt(l.name||l.desc).includes(q))||normTxt(superNm(t)+" "+(t.store||"")).includes(q)))
    .sort((a,b)=>key(b).localeCompare(key(a))||(b.at||"").localeCompare(a.at||""));
}
function ticketCard(t){
  const lines=t.lines.slice().sort((a,b)=>(b.food-a.food)||(b.amount-a.amount));
  return `<details class="tkc"><summary><span><b>${esc(superNm(t))}</b><small>${esc(listNm(t))} · compra del ${esc(shortDate(t.date))}${t.at&&t.at!==t.date?` · subido el ${esc(shortDate(t.at))}`:""} · ${t.lines.length} líneas</small></span><b>${eur(t.total||t.lines.reduce((s,l)=>s+l.amount,0))}</b></summary>
    ${t.store&&t.store!==superNm(t)?`<p class="small muted">${esc(t.store)}</p>`:""}
    <p class="small">Comida ${eur(t.food)}${(t.total||0)-t.food>=0.05?` · lo demás ${eur((t.total||0)-t.food)}`:""}</p>
    ${lines.map(l=>`<div class="tkl"><span>${l.qty>1?l.qty+" × ":""}${esc(l.name||l.desc)}${l.kg?` <small>${String(l.kg).replace(".",",")} kg</small>`:""}<small>${KIND_ICO[lineKind(l)]||""} ${esc(lineKind(l))}${l.extra?" · fuera de la lista":""}</small></span><b>${eur(l.amount)}</b></div>`).join("")}
    <div class="actions"><button class="btn ghost small" data-tkdel2="${t.id}">Borrar este ticket</button></div></details>`;
}
async function renderTickets(){
  tkMonth=tkMonth||todayISO().slice(0,7);
  try{await loadCatalog()}catch(e){}   // para saber de qué tipo es lo que no es comida en los tickets antiguos
  if(tab!=="tickets")return;
  const all=S.tickets||[],sups=[...new Set(all.map(superNm))].sort();
  let h=`<section class="view"><button class="btn ghost small" id="tkBack" style="margin-bottom:8px">‹ Despensa</button>${viewHead(all.length+" "+(all.length===1?"ticket guardado":"tickets guardados"),"Tus *tickets*")}
    <button class="btn wide" id="tkNew">${ico("receipt")} Subir un ticket</button>
    <div class="seg" role="group" style="margin-top:12px"><button aria-pressed="${tkView==="lista"}" data-tkv="lista">Historial</button><button aria-pressed="${tkView==="informe"}" data-tkv="informe">Informe del mes</button></div>
    <div class="row tkmonth"><button class="btn ghost small" data-tkm="-1" aria-label="Mes anterior">‹</button><b>${esc(monthName(tkMonth))}</b><button class="btn ghost small" data-tkm="1" aria-label="Mes siguiente">›</button></div>`;
  if(tkView==="informe")h+=reportHTML(tkMonth);
  else{
    const list=ticketsFiltered(),tot=list.reduce((s,t)=>s+(Number(t.total)||0),0);
    h+=`<div class="tkf"><div class="chips">${chip("data-tkby","subido",tkBy==="subido","Por el día que lo subí")}${chip("data-tkby","compra",tkBy==="compra","Por el día de la compra")}</div>
      <div class="row"><div class="field" style="flex:1;margin:0"><label for="tkDay">Un día concreto</label><input type="date" id="tkDay" value="${esc(tkDay)}"></div>${tkDay?`<button class="btn ghost small" id="tkDayX" style="align-self:flex-end">Todo el mes</button>`:""}</div>
      ${sups.length>1?`<div class="chips">${["todos",...sups].map(s=>chip("data-tksup",s,tkSup===s,s==="todos"?"Todos los súper":esc(s))).join("")}</div>`:""}
      <input type="search" id="tkQ" placeholder="Buscar un producto o una tienda" value="${esc(tkQ)}"></div>
      <p class="small muted">${list.length} ${list.length===1?"ticket":"tickets"}${list.length?` · ${eur(tot)}`:""}</p>`;
    if(!list.length)h+=`<div class="empty"><p>${all.length?"No hay tickets con estos filtros.":"Aún no has subido ningún ticket."}</p></div>`;
    // Agrupados por día
    const key=tkBy==="subido"?tkUp:t=>t.date;let cur=null;
    for(const t of list){const k=key(t);if(k!==cur){cur=k;h+=`<h3 class="tkday">${esc(longDate(k))}</h3>`}h+=ticketCard(t)}
  }
  main.innerHTML=h+`</section>`;
  document.getElementById("tkBack").onclick=()=>{tab="despensa";render();scrollTo(0,0)};
  document.getElementById("tkNew").onclick=()=>openTicketScan(false,null,{m:todayISO().slice(0,7),key:"suelta"});
  main.querySelectorAll("[data-tkv]").forEach(b=>b.onclick=()=>{tkView=b.dataset.tkv;render()});
  main.querySelectorAll("[data-tkm]").forEach(b=>b.onclick=()=>{tkMonth=b.dataset.tkm==="1"?nextMonthOf(tkMonth):prevMonthOf(tkMonth);tkDay="";render()});
  main.querySelectorAll("[data-tkby]").forEach(b=>b.onclick=()=>{tkBy=b.dataset.tkby;render()});
  main.querySelectorAll("[data-tksup]").forEach(b=>b.onclick=()=>{tkSup=b.dataset.tksup;render()});
  document.getElementById("tkDay")?.addEventListener("change",e=>{tkDay=e.target.value;if(tkDay)tkMonth=tkDay.slice(0,7);render()});
  document.getElementById("tkDayX")?.addEventListener("click",()=>{tkDay="";render()});
  const qi=document.getElementById("tkQ");if(qi)qi.oninput=()=>{tkQ=qi.value;clearTimeout(qi._t);qi._t=setTimeout(()=>{render();const n=document.getElementById("tkQ");if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length)}},350)};
  main.querySelectorAll("[data-tkdel2]").forEach(b=>b.onclick=()=>deleteTicket(b.dataset.tkdel2));
}
// Borrar un ticket: también deja de contar en lo pagado de su compra
function deleteTicket(id){
  if(!confirm("¿Borrar este ticket?"))return;
  const t=S.tickets.find(x=>x.id===id);if(!t)return;S.tickets=S.tickets.filter(x=>x!==t);
  const k=t.m+"|"+t.list,rest=S.tickets.filter(y=>y.m===t.m&&y.list===t.list);if(rest.length)S.spent[k]=Math.round(rest.reduce((s,y)=>s+y.food,0)*100)/100;else delete S.spent[k];
  save();render();toast("Ticket borrado");
}
