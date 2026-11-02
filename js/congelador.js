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

/* ---------- Bolsas de congelado ----------
   Lo que metes tú en el congelador, por tipo y peso: «3 bolsas de muslos de pollo de 500 g», «2 de caldo de 1 l»…
   S.bolsas=[{id,tipo,nombre,peso,unidad,n,usadas,at}]. Se gastan con «Usar una» o comiéndolas un día desde la despensa */
const BOLSA_TIPOS={carne:["🥩","Carne"],pescado:["🐟","Pescado y marisco"],verdura:["🥦","Verdura"],fruta:["🍓","Fruta"],pan:["🥖","Pan y masas"],caldo:["🥣","Caldo, sopa o salsa"],cocinado:["🍲","Plato cocinado"],otro:["📦","Otro"]};
// Bolsas que quedan (las comidas de la despensa ya comidas también cuentan como gastadas)
// y, si la bolsa es de un producto (pid), los platos cocinados que lo usan desde que se congeló, empezando por la más antigua
function bolsasState(){
  const eaten={};try{for(const x of despSlots())if(x.k.startsWith("b:")&&slotEaten(x.id))eaten[x.k.slice(2)]=(eaten[x.k.slice(2)]||0)+x.n}catch(e){}
  const all=(S.bolsas||[]).map(b=>({...b,left:Math.max(0,b.n-(b.usadas||0)-(eaten[b.id]||0)),days:daysBetween(b.at,todayISO())}));
  const withP=all.filter(b=>b.pid&&P[b.pid]&&b.peso>0&&b.left>0);
  if(withP.length)try{
    // Solo lo que la despensa no tenía: si la pechuga del plato salió de la compra, la bolsa sigue ahí
    const sh=despensaState().short,used={};
    for(const pid of new Set(withP.map(b=>b.pid))){const from=withP.filter(b=>b.pid===pid).map(b=>b.at).sort()[0];used[pid]=(sh[pid]||[]).filter(x=>x.d>=from).reduce((t,x)=>t+x.q,0)}
    for(const b of withP.sort((a,c)=>a.at.localeCompare(c.at))){let q=used[b.pid]||0;if(!q)continue;
      const n=Math.min(b.left,Math.ceil(q/b.peso-0.05));b.left-=n;b.auto=(b.auto||0)+n;used[b.pid]=Math.max(0,q-n*b.peso)}
  }catch(e){console.error(e)}
  return all.filter(b=>b.left>0).sort((a,b)=>a.tipo.localeCompare(b.tipo)||a.at.localeCompare(b.at));
}
const bolsaName=b=>b.nombre||BOLSA_TIPOS[b.tipo][1];
const bolsaPeso=b=>b.peso?(b.unidad==="ml"?(b.peso>=1000?String(b.peso/1000).replace(".",",")+" l":b.peso+" ml"):b.peso>=1000?String(b.peso/1000).replace(".",",")+" kg":b.peso+" g"):"";
function bolsasHTML(){
  const bs=bolsasState(),tot=bs.reduce((t,b)=>t+b.left,0);
  let h=`<div class="card"><div class="row"><h2 style="margin:0">Bolsas de congelado</h2><span class="spacer"></span><button class="btn small" id="bgAdd">${ico("plus")} Añadir bolsas</button></div>`;
  if(!bs.length)return h+`<p class="small muted" style="margin-top:8px">Apunta lo que congelas tú (carne en raciones, caldo, un guiso que sobra…), con su peso. Así sabes lo que hay y lo puedes comer un día desde la despensa.</p></div>`;
  h+=`<p class="small muted" style="margin:6px 0">${tot} ${tot===1?"bolsa":"bolsas"} · se gasta primero lo más antiguo</p>`;
  for(const [k,[ic,nm]] of Object.entries(BOLSA_TIPOS)){const g=bs.filter(b=>b.tipo===k);if(!g.length)continue;
    h+=`<h3 class="bgh">${ic} ${esc(nm)}</h3>`+g.map(b=>`<div class="fixed bgrow"><span><b>${esc(bolsaName(b))}</b><small>${b.left} ${b.left===1?"bolsa":"bolsas"}${b.peso?" de "+esc(bolsaPeso(b)):""} · desde el ${esc(shortDate(b.at))} (${b.days} días)${b.days>FREEZER_MONTHS*30?" · ⚠️ gastar pronto":""}${b.pid&&P[b.pid]?` · se descuenta al cocinar con ${esc(P[b.pid].name.toLowerCase())}`:""}${b.auto?` · ${b.auto} ya gastada${b.auto===1?"":"s"} al cocinar`:""}</small></span>
      <span class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn ghost small" data-bgday="${b.id}">Comerla un día</button><button class="btn small" data-bguse="${b.id}">Usar una</button><button class="btn ghost small" data-bged="${b.id}" aria-label="Editar">✎</button></span></div>`).join("")}
  return h+`</div>`;
}
function bindBolsas(){
  document.getElementById("bgAdd")?.addEventListener("click",()=>openBolsa());
  main.querySelectorAll("[data-bguse]").forEach(b=>b.onclick=()=>{const x=S.bolsas.find(y=>y.id===b.dataset.bguse);x.usadas=(x.usadas||0)+1;save();render();toast(`Usada una bolsa de ${bolsaName(x).toLowerCase()}. Pásala a la nevera la noche antes`)});
  main.querySelectorAll("[data-bged]").forEach(b=>b.onclick=()=>openBolsa(b.dataset.bged));
  main.querySelectorAll("[data-bgday]").forEach(b=>b.onclick=()=>openPickDay("b:"+b.dataset.bgday,1));
}
// Añadir (o corregir) bolsas: tipo, qué es, peso de cada una, cuántas y cuándo se congelaron
function openBolsa(id){
  const b=id?S.bolsas.find(x=>x.id===id):null,bs=b?bolsasState().find(x=>x.id===id):null;let tipo=b?b.tipo:"carne",unidad=b?b.unidad||"g":"g";
  const draw=()=>{
    showDialog(`<div class="mod">${closeBtn}<h2 class="vh" style="font-size:1.7rem">${b?"Corregir":"Añadir"} <em>bolsas</em></h2>
      <div class="field"><label>Tipo</label><div class="chips">${Object.entries(BOLSA_TIPOS).map(([k,[ic,nm]])=>chip("data-bgt",k,tipo===k,ic+" "+nm)).join("")}</div></div>
      <div class="field"><label for="bgN">¿Qué es? (opcional)</label><input type="text" id="bgN" value="${esc(b?b.nombre||"":"")}" placeholder="${tipo==="cocinado"?"Lentejas con verduras":tipo==="caldo"?"Caldo de pollo":tipo==="carne"?"Muslos de pollo":"Lo que es"}"></div>
      <div class="field"><label for="bgPid">¿Es de algún producto de tus recetas? (opcional)</label><select id="bgPid"><option value="">No, es otra cosa</option>${Object.values(P).filter(p=>p.unit!=="ud").sort((a,c)=>a.name.localeCompare(c.name)).map(p=>`<option value="${p.id}" ${b&&b.pid===p.id?"selected":""}>${esc(p.name)}</option>`).join("")}</select>
        <small class="muted">Si lo es, cuando cocines un plato que lo lleve la descuento sola (según el peso).</small></div>
      <div class="row"><div class="field" style="flex:1.2"><label for="bgP">Peso de cada bolsa</label><input type="number" id="bgP" min="0" step="any" value="${b&&b.peso?b.peso:""}" placeholder="500"></div>
        <div class="field" style="flex:.8"><label>&nbsp;</label><div class="chips">${chip("data-bgu","g",unidad==="g","g")}${chip("data-bgu","ml",unidad==="ml","ml")}</div></div></div>
      <div class="row"><div class="field" style="flex:1"><label for="bgC">${b?"Bolsas que quedan":"¿Cuántas bolsas?"}</label><input type="number" id="bgC" min="0" step="1" value="${bs?bs.left:1}"></div>
        <div class="field" style="flex:1.3"><label for="bgD">Congeladas el</label><input type="date" id="bgD" value="${esc(b?b.at:todayISO())}" max="${todayISO()}"></div></div>
      <div class="actions"><button class="btn wide" id="bgOk">Guardar</button></div>${b?`<div class="actions"><button class="btn ghost" id="bgDel">Ya no hay ninguna</button></div>`:""}</div>`);
    dlg.querySelectorAll("[data-bgt]").forEach(x=>x.onclick=()=>{tipo=x.dataset.bgt;keep();draw()});
    dlg.querySelectorAll("[data-bgu]").forEach(x=>x.onclick=()=>{unidad=x.dataset.bgu;keep();draw()});
    dlg.querySelector("#bgOk").onclick=()=>{const n=Math.round(Number(dlg.querySelector("#bgC").value));if(!(n>=0)){toast("Indica cuántas bolsas");return}
      const v={tipo,pid:dlg.querySelector("#bgPid").value||null,nombre:dlg.querySelector("#bgN").value.trim(),peso:Number(dlg.querySelector("#bgP").value)||null,unidad,at:dlg.querySelector("#bgD").value||todayISO()};
      S.bolsas=S.bolsas||[];
      if(b){Object.assign(b,v);b.n=n+(b.n-bs.left)}   // corrige lo que queda sin perder lo ya gastado
      else{if(!n){toast("Indica cuántas bolsas");return}S.bolsas.push({id:uid("bg"),...v,n,usadas:0})}
      save();dlg.close();render();toast(b?"Corregido":`${n} ${n===1?"bolsa añadida":"bolsas añadidas"} al congelador`)};
    dlg.querySelector("#bgDel")?.addEventListener("click",()=>{b.usadas=(b.usadas||0)+bs.left;save();dlg.close();render();toast("Quitadas del congelador")});
  };
  // Al cambiar de tipo o unidad no se pierde lo escrito
  const keep=()=>{const g=s=>dlg.querySelector(s)?.value;const nb={nombre:g("#bgN"),peso:g("#bgP"),c:g("#bgC"),d:g("#bgD"),pid:g("#bgPid")};setTimeout(()=>{dlg.querySelector("#bgN").value=nb.nombre;dlg.querySelector("#bgP").value=nb.peso;dlg.querySelector("#bgC").value=nb.c;dlg.querySelector("#bgD").value=nb.d;dlg.querySelector("#bgPid").value=nb.pid},0)};
  draw();
}

function renderCongelador(){
  const st=freezerState(),nb=bolsasState().reduce((t,b)=>t+b.left,0),nAll=st.length+nb;
  let h=`<section class="view"><button class="btn ghost small" id="fzBack" style="margin-bottom:8px">‹ Despensa</button>${viewHead(nAll+" "+(nAll===1?"cosa":"cosas")+" dentro","Tu *congelador*")}
    <p class="small muted">Se llena solo al marcar como comprado lo que va al congelador y se vacía al cocinar los platos que lo usan. Si algo no cuadra, corrígelo aquí.</p>${bolsasHTML()}<h2 style="margin:18px 0 8px">De la compra</h2>`;
  const old=st.filter(e=>e.days>FREEZER_MONTHS*30);
  if(old.length)h+=`<div class="warnbox">🕒 ${old.length===1?"Esto lleva":"Estas cosas llevan"} más de ${FREEZER_MONTHS} meses congelado: ${old.map(e=>esc(P[e.pid].name.toLowerCase())).join(", ")}. Mejor gastarlo pronto; te lo propondré en los próximos menús.</div>`;
  if(!st.length)h+=`<div class="empty"><p>El congelador está vacío (o aún no has marcado compras de congelar).</p></div>`;
  for(const e of st){const p=P[e.pid],nx=nextUses(e.pid);
    const age=Math.min(100,Math.round(e.days/(FREEZER_MONTHS*30)*100));
    h+=`<div class="item fz" style="--age:${age}%">${prodImg(e.pid)}<span class="t"><b>${esc(p.name)}</b><small>${fmtQty(e.left,p.unit)} · desde el ${esc(shortDate(e.at))} (${e.days} días)${e.days>FREEZER_MONTHS*30?" · ⚠️ gastar pronto":""}${e.src==="mano"?" · añadido a mano":""}</small>
      ${nx.length?`<small>Para: ${nx.map(u=>esc(DSHORT[dow(u.slot.date)]+" "+shortDate(u.slot.date)+" ("+u.r.name.toLowerCase()+")")).join("; ")}</small>`:""}</span>
      <button class="btn ghost small" data-fzout="${e.pid}|${Math.round(e.left)}">Ya no está</button></div>`}
  const prods=Object.values(P).filter(p=>p.keep==="congelar"||p.keep==="congelado").sort((a,b)=>a.name.localeCompare(b.name));
  h+=`<div class="card"><h2>Añadir algo al congelador</h2><div class="row"><select id="fzP" style="flex:2">${prods.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>
    <input type="number" id="fzQ" min="1" placeholder="Cantidad" style="flex:1"><span class="small" id="fzU">${esc(prods[0]?.unit||"g")}</span></div>
    <button class="btn small" id="fzAdd" style="margin-top:8px">Añadir</button></div>
    <div class="guide"><h3>Descongelar bien</h3><p>Lo más seguro es pasarlo del congelador a la nevera la noche anterior. Si se te olvida: en una bolsa cerrada dentro de agua fría (cambiándola cada 30 minutos), 1–2 horas; o en el microondas en modo descongelar, justo antes de cocinarlo. Nunca a temperatura ambiente.</p></div></section>`;
  main.innerHTML=h;
  document.getElementById("fzBack").onclick=()=>{tab="despensa";render();scrollTo(0,0)};
  bindBolsas();
  const sel=document.getElementById("fzP");sel.onchange=()=>{document.getElementById("fzU").textContent=P[sel.value].unit};
  document.getElementById("fzAdd").onclick=()=>{const q=Number(document.getElementById("fzQ").value);if(!q){toast("Indica la cantidad");return}
    S.freezer=S.freezer||[];S.freezer.push({id:uid("fz"),pid:sel.value,qty:q,at:todayISO()});save();render();toast("Añadido al congelador")};
  main.querySelectorAll("[data-fzout]").forEach(b=>b.onclick=()=>{const [pid,q]=b.dataset.fzout.split("|");S.freezerUsed=S.freezerUsed||{};S.freezerUsed[pid]=(Number(S.freezerUsed[pid])||0)+Number(q);save();render();toast("Quitado del congelador")});
}

/* ---------- ¿Descongelaste? (plan B) ---------- */
// El día de un plato con carne o pescado congelado, pregunta si se pasó a la nevera la noche anterior
function thawPending(){
  if(S.home.cookMode==="lote")return null;
  const d=todayISO(),now=new Date(),mins=now.getHours()*60+now.getMinutes();
  if(mins<7*60||mins>toMin(S.home.mealTimes.cena))return null;
  const wk=S.plans[weekStartFor(d)];if(!wk)return null;
  for(const sl of buildSlots(weekStartFor(d))){
    if(sl.date!==d||(S.thawChecked||{})[sl.id])continue;
    const v=wk.slots[sl.id],r=v&&RX[v.recipe];if(!r)continue;
    const th=r.ing.filter(([p])=>P[p].thaw).map(([p])=>P[p].name.toLowerCase());if(!th.length)continue;
    return {sl,r,th};
  }
  return null;
}
function thawCard(){
  const x=thawPending();if(!x)return "";const {sl,r,th}=x;
  return `<div class="rate"><h3>❄️ ¿Pasaste ${esc(th.join(" y "))} a la nevera anoche?</h3><div class="small muted">Para ${esc(r.name.toLowerCase())} (${sl.meal} de hoy)</div>
    <div class="actions"><button class="btn small" data-thaw="${sl.id}~si">Sí</button><button class="btn ghost small" data-thaw="${sl.id}~no">No, se me olvidó</button></div></div>`;
}
function bindThaw(){
  document.querySelectorAll("[data-thaw]").forEach(b=>b.onclick=()=>{const [sid,ans]=b.dataset.thaw.split("~");answerThaw(sid,ans)});
}
// Sí: se apunta y ya. No: plan B (descongelar rápido o cambiar el plato)
function answerThaw(sid,ans){
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
}
