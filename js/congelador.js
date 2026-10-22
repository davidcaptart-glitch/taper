/* Táper · congelador: lo que hay congelado, cuánto tiempo lleva y el plan B si se olvida descongelar */
"use strict";

const FREEZER_MONTHS=3;   // a partir de aquí, mejor gastarlo pronto

// Entradas: las que vienen de la compra (al marcar como comprado algo de congelar o congelado) y las añadidas a mano
function freezerEntries(){
  const out=[],shops={};
  for(const [key,v] of Object.entries(S.checks)){
    if(!v)continue;const [m,list,pid]=key.split("|");const p=P[pid];
    if(!p||(p.keep!=="congelar"&&p.keep!=="congelado"))continue;
    const sh=shops[m]=shops[m]||shopping(m),l=sh.lists[list],it=l&&l.items.find(i=>i.pid===pid);if(!it)continue;
    out.push({id:"auto|"+key,pid,qty:it.packs*p.env,at:(S.checkedAt||{})[key]||m+"-01",src:"compra"});
  }
  for(const e of S.freezer||[])out.push({...e,src:"mano"});
  return out.sort((a,b)=>a.at.localeCompare(b.at));
}
// Lo que se ha gastado de cada producto desde una fecha (platos ya pasados que sí se cocinaron)
function usedSince(pid,from){
  const today=todayISO();let t=0;const months=new Set();
  for(let d=from.slice(0,7);d<=today.slice(0,7);d=iso(new Date(Number(d.slice(0,4)),Number(d.slice(5,7)),1)).slice(0,7))months.add(d);
  for(const m of months)for(const u of monthUses(m)){
    if(u.pid!==pid||u.date<from||u.date>=today)continue;
    const st=((S.meals||{})[u.slot.id]||{}).status;if(st==="fuera"||st==="nada"||st==="otro")continue;
    t+=u.q;
  }
  return t;
}
// Estado del congelador: lo que queda de cada entrada (se gasta primero lo más antiguo)
let fzCache={k:null,v:null};
function freezerState(){
  const k=S.updatedAt+"|"+todayISO();if(fzCache.k===k)return fzCache.v;
  const v=computeFreezer();fzCache={k,v};return v;
}
function computeFreezer(){
  const by={};for(const e of freezerEntries())(by[e.pid]=by[e.pid]||[]).push(e);
  const out=[];
  for(const [pid,es] of Object.entries(by)){
    let used=usedSince(pid,es[0].at)+Number((S.freezerUsed||{})[pid]||0);
    for(const e of es){const take=Math.min(e.qty,used);used-=take;const left=e.qty-take;
      if(left>1)out.push({...e,left,days:daysBetween(e.at,todayISO())})}
  }
  return out.sort((a,b)=>b.days-a.days);
}
// Próximos platos que usarán cada producto congelado
function nextUses(pid){
  const today=todayISO(),m=today.slice(0,7),out=[];
  for(const u of monthUses(m))if(u.pid===pid&&u.date>=today)out.push(u);
  return out.sort((a,b)=>a.date.localeCompare(b.date)).slice(0,3);
}

function renderCongelador(){
  const st=freezerState();
  let h=`<section class="view"><div class="listtotal"><h2>Congelador</h2><b>${st.length} ${st.length===1?"cosa":"cosas"}</b></div>
    <p class="small muted">Se llena solo al marcar como comprado lo que va al congelador y se vacía al cocinar los platos que lo usan. Si algo no cuadra, corrígelo aquí.</p>`;
  const old=st.filter(e=>e.days>FREEZER_MONTHS*30);
  if(old.length)h+=`<div class="warnbox">🕒 ${old.length===1?"Esto lleva":"Estas cosas llevan"} más de ${FREEZER_MONTHS} meses congelado: ${old.map(e=>esc(P[e.pid].name.toLowerCase())).join(", ")}. Mejor gastarlo pronto; te lo propondré en los próximos menús.</div>`;
  if(!st.length)h+=`<div class="empty"><p>El congelador está vacío (o aún no has marcado compras de congelar).</p></div>`;
  for(const e of st){const p=P[e.pid],nx=nextUses(e.pid);
    h+=`<div class="item">${prodImg(e.pid)}<span class="t"><b>${esc(p.name)}</b><small>${fmtQty(e.left,p.unit)} · desde el ${esc(shortDate(e.at))} (${e.days} días)${e.days>FREEZER_MONTHS*30?" · ⚠️ gastar pronto":""}${e.src==="mano"?" · añadido a mano":""}</small>
      ${nx.length?`<small>Para: ${nx.map(u=>esc(DSHORT[dow(u.slot.date)]+" "+shortDate(u.slot.date)+" ("+u.r.name.toLowerCase()+")")).join("; ")}</small>`:""}</span>
      <button class="btn ghost small" data-fzout="${e.pid}|${Math.round(e.left)}">Ya no está</button></div>`}
  const prods=Object.values(P).filter(p=>p.keep==="congelar"||p.keep==="congelado").sort((a,b)=>a.name.localeCompare(b.name));
  h+=`<div class="card"><h2>Añadir algo al congelador</h2><div class="row"><select id="fzP" style="flex:2">${prods.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>
    <input type="number" id="fzQ" min="1" placeholder="Cantidad" style="flex:1"><span class="small" id="fzU">${esc(prods[0]?.unit||"g")}</span></div>
    <button class="btn small" id="fzAdd" style="margin-top:8px">Añadir</button></div>
    <div class="guide"><h3>Descongelar bien</h3><p>Lo más seguro es pasarlo del congelador a la nevera la noche anterior. Si se te olvida: en una bolsa cerrada dentro de agua fría (cambiándola cada 30 minutos), 1–2 horas; o en el microondas en modo descongelar, justo antes de cocinarlo. Nunca a temperatura ambiente.</p></div></section>`;
  main.innerHTML=h;
  const sel=document.getElementById("fzP");sel.onchange=()=>{document.getElementById("fzU").textContent=P[sel.value].unit};
  document.getElementById("fzAdd").onclick=()=>{const q=Number(document.getElementById("fzQ").value);if(!q){toast("Indica la cantidad");return}
    S.freezer=S.freezer||[];S.freezer.push({id:uid("fz"),pid:sel.value,qty:q,at:todayISO()});save();render();toast("Añadido al congelador")};
  main.querySelectorAll("[data-fzout]").forEach(b=>b.onclick=()=>{const [pid,q]=b.dataset.fzout.split("|");S.freezerUsed=S.freezerUsed||{};S.freezerUsed[pid]=(Number(S.freezerUsed[pid])||0)+Number(q);save();render();toast("Quitado del congelador")});
}

/* ---------- ¿Descongelaste? (plan B) ---------- */
// El día de un plato con carne o pescado congelado, pregunta si se pasó a la nevera la noche anterior
function thawCard(){
  if(S.home.cookMode==="lote")return "";
  const d=todayISO(),now=new Date(),mins=now.getHours()*60+now.getMinutes();
  if(mins<7*60||mins>toMin(S.home.mealTimes.cena))return "";
  const wk=S.plans[weekStartFor(d)];if(!wk)return "";
  for(const sl of buildSlots(weekStartFor(d))){
    if(sl.date!==d||(S.thawChecked||{})[sl.id])continue;
    const v=wk.slots[sl.id],r=v&&RX[v.recipe];if(!r)continue;
    const th=r.ing.filter(([p])=>P[p].thaw).map(([p])=>P[p].name.toLowerCase());if(!th.length)continue;
    return `<div class="rate"><h3>❄️ ¿Pasaste ${esc(th.join(" y "))} a la nevera anoche?</h3><div class="small muted">Para ${esc(r.name.toLowerCase())} (${sl.meal} de hoy)</div>
      <div class="actions"><button class="btn small" data-thaw="${sl.id}~si">Sí</button><button class="btn ghost small" data-thaw="${sl.id}~no">No, se me olvidó</button></div></div>`;
  }
  return "";
}
function bindThaw(){
  document.querySelectorAll("[data-thaw]").forEach(b=>b.onclick=()=>{const [sid,ans]=b.dataset.thaw.split("~");
    S.thawChecked=S.thawChecked||{};S.thawChecked[sid]=true;save();
    if(ans==="si"){render();return}
    const sl=slotFor(sid.slice(0,10),sid.slice(11));
    const alts=alternatives(sl,8).filter(({r})=>!r.ing.some(([p])=>P[p].thaw)).slice(0,4);
    showDialog(`<div class="mod">${closeBtn}<h2>Plan B</h2>
      <p><b>Descongelar rápido:</b> en una bolsa bien cerrada dentro de agua fría, cambiando el agua cada 30 minutos (1–2 horas), o en el microondas en modo descongelar justo antes de cocinarlo.</p>
      <p><b>O cambia el plato</b> por uno que no necesita descongelar:</p>
      ${alts.map(({r,miss})=>`<button class="alt" data-pb="${r.id}"><b>${esc(r.name)}</b><small>${recipeTime(r)} min${miss?(miss.length?" · te falta: "+esc(miss.slice(0,2).map(p=>P[p].name.toLowerCase()).join(", ")):" · tienes todo"):""}</small></button>`).join("")||"<p class='small muted'>No hay alternativas sin descongelar con tus filtros.</p>"}
      <div class="actions"><button class="btn ghost" data-x>Lo descongelo rápido</button></div></div>`);
    dlg.querySelectorAll("[data-pb]").forEach(x=>x.onclick=()=>{setSlotRecipe(sl,x.dataset.pb);dlg.close();render();toast("Cambiado por "+RX[x.dataset.pb].name)});
  });
}
