/* Táper · congelador: lo que hay congelado, cuánto tiempo lleva y el plan B si se olvida descongelar */
"use strict";

const FREEZER_MONTHS=3;   // a partir de aquí, mejor gastarlo pronto

// El congelador es parte de la despensa: cada compra, ticket o cosa añadida a mano de un producto de congelar o congelado
// es una entrada con lo que le queda (se gasta primero lo más antiguo). Las bolsas van aparte (abajo)
let fzCache={k:null,v:null};
function freezerState(){
  const k=S.updatedAt+"|"+todayISO();if(fzCache.k===k)return fzCache.v;
  const v=computeFreezer();fzCache={k,v};return v;
}
function computeFreezer(){
  const {lots}=despensaState(),today=todayISO(),out=[];
  for(const [pid,ls] of Object.entries(lots)){if(!isFrozen(pid))continue;
    for(const l of ls)if(!l.bag&&l.src!=="bolsa"&&l.left>=dpEps(pid))out.push({id:l.id,pid,qty:l.q,left:l.left,at:l.at,src:l.src,days:Math.max(0,daysBetween(l.at,today))})}
  return out.sort((a,b)=>b.days-a.days);
}
// «Ya no está»: se quita esa entrada (no otra del mismo producto)
function freezerOut(id){
  const e=freezerState().find(x=>x.id===id);if(!e)return null;
  despensaData().adj.push(newAdj(e.pid,-e.left,e.id));save();return e;
}
// Próximos platos (sin comer aún) que usarán un producto, este mes y el siguiente (o hasta el día until)
let nuCache={k:null,v:null};
function nextUses(pid,until){
  const today=todayISO(),to=until||addDays(today,45),k=S.updatedAt+"|"+today+"|"+to;
  if(nuCache.k!==k){const by={};for(const x of upcomingUses(today,addDays(to,1)))if(x.u&&x.r&&x.u.slot)(by[x.pid]=by[x.pid]||[]).push(x.u);nuCache={k,v:by}}
  return (nuCache.v[pid]||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(0,3);
}
// «desde el 2 nov (3 días)» o «desde hoy»
const fzSince=(at,days)=>days>0?`desde el ${shortDate(at)} (${days} ${days===1?"día":"días"})`:"desde hoy";

/* ---------- Bolsas de congelado ----------
   Lo que metes tú en el congelador, por tipo y peso: «3 bolsas de muslos de pollo de 500 g», «2 de caldo de 1 l»…
   S.bolsas=[{id,tipo,nombre,pid,peso,unidad,n,usadas,usos:[{id,d,ts,n,slot?}],at}]
   usadas: el contador de antes (se respeta); usos: cada vez que se usa una, con su id (en la casa compartida se juntan, no se pisan).
   Se gastan con «Usar una», comiéndolas un día desde la despensa o, si son de un producto, al cocinar un plato que lo lleva
   cuando ya no había otra cosa de ese producto en casa (y se dice qué plato fue) */
const BOLSA_TIPOS={carne:["🥩","Carne"],pescado:["🐟","Pescado y marisco"],verdura:["🥦","Verdura"],fruta:["🍓","Fruta"],pan:["🥖","Pan y masas"],caldo:["🥣","Caldo, sopa o salsa"],cocinado:["🍲","Plato cocinado"],otro:["📦","Otro"]};
function bolsasState(){
  const eaten={};try{for(const x of despSlots())if(x.k.startsWith("b:")&&slotEaten(x.id))eaten[x.k.slice(2)]=(eaten[x.k.slice(2)]||0)+x.n}catch(e){}
  let lots={};try{lots=despensaState().lots}catch(e){console.error(e)}
  const all=(S.bolsas||[]).filter(b=>b&&b.id&&BOLSA_TIPOS[b.tipo]).map(b=>{
    const used=(Number(b.usadas)||0)+(b.usos||[]).reduce((t,u)=>t+(Number(u.n)||1),0);
    const x={...b,left:Math.max(0,(Number(b.n)||0)-used-(eaten[b.id]||0)),days:Math.max(0,daysBetween(b.at,todayISO()))};
    // De un producto: quedan como mucho las que caben en lo que le queda (si un plato la gastó porque no había otra cosa, se ve cuál)
    const bp=bolsaPid(b),lot=bp&&(lots[bp]||[]).find(l=>l.id==="b:"+b.id);
    if(lot){const ev=Math.max(0,Math.ceil(lot.left/b.peso-0.05));if(ev<x.left){x.auto=x.left-ev;x.left=ev;
      x.autoBy=[...new Set((lot.by||[]).map(w=>(w.u.r?w.u.r.name.toLowerCase():"comida de la despensa")+" ("+DSHORT[dow(w.d)]+" "+shortDate(w.d)+")"))].slice(-2)}}
    return x});
  return all.filter(b=>b.left>0).sort((a,b)=>a.tipo.localeCompare(b.tipo)||a.at.localeCompare(b.at));
}
const bolsaName=b=>b.nombre||(BOLSA_TIPOS[b.tipo]||BOLSA_TIPOS.otro)[1];
const bolsaPeso=b=>b.peso?(b.unidad==="ml"?(b.peso>=1000?String(b.peso/1000).replace(".",",")+" l":b.peso+" ml"):b.peso>=1000?String(b.peso/1000).replace(".",",")+" kg":b.peso+" g"):"";
// Usar una bolsa: si un plato de esta semana lleva ese producto, pasa a la nevera para él (se gasta al cocinarlo, no dos veces);
// si no, se gasta ya. Devuelve el plato, si lo hay
function useBolsa(id){
  const b=(S.bolsas||[]).find(x=>x.id===id);if(!b)return null;const today=todayISO(),bp=bolsaPid(b);
  let nx=null;if(bp)try{nx=nextUses(bp,addDays(today,7)).find(u=>u.slot&&u.slot.id)||null}catch(e){}
  b.usos=b.usos||[];b.usos.push({id:uid("bu"),d:today,ts:Date.now(),n:1,...(nx?{slot:nx.slot.id}:{})});save();return {b,nx};
}
function bolsasHTML(){
  const bs=bolsasState(),tot=bs.reduce((t,b)=>t+b.left,0);
  let h=`<div class="card"><div class="row"><h2 style="margin:0">Bolsas de congelado</h2><span class="spacer"></span><button class="btn small" id="bgAdd">${ico("plus")} Añadir bolsas</button></div>`;
  if(!bs.length)return h+`<p class="small muted" style="margin-top:8px">Apunta lo que congelas tú (carne en raciones, caldo, un guiso que sobra…), con su peso. Así sabes lo que hay y lo puedes comer un día desde la despensa.</p></div>`;
  h+=`<p class="small muted" style="margin:6px 0">${tot} ${tot===1?"bolsa":"bolsas"} · se gasta primero lo más antiguo</p>`;
  for(const [k,[ic,nm]] of Object.entries(BOLSA_TIPOS)){const g=bs.filter(b=>b.tipo===k);if(!g.length)continue;
    h+=`<h3 class="bgh">${ic} ${esc(nm)}</h3>`+g.map(b=>`<div class="fixed bgrow"><span><b>${esc(bolsaName(b))}</b><small>${b.left} ${b.left===1?"bolsa":"bolsas"}${b.peso?" de "+esc(bolsaPeso(b)):""} · ${esc(fzSince(b.at,b.days))}${b.days>FREEZER_MONTHS*30?" · ⚠️ gastar pronto":""}${bolsaPid(b)?` · se descuenta al cocinar con ${esc(P[b.pid].name.toLowerCase())} si no hay otra cosa`:""}${b.auto?` · ${b.auto} ya gastada${b.auto===1?"":"s"} al cocinar${b.autoBy&&b.autoBy.length?" "+esc(b.autoBy.join(", ")):""}`:""}</small></span>
      <span class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn ghost small" data-bgday="${b.id}">${RAW_BAG.has(b.tipo)?"Cocinarla un día":"Comerla un día"}</button><button class="btn small" data-bguse="${b.id}">Usar una</button><button class="btn ghost small" data-bged="${b.id}" aria-label="Editar">✎</button></span></div>`).join("")}
  return h+`</div>`;
}
function bindBolsas(){
  document.getElementById("bgAdd")?.addEventListener("click",()=>openBolsa());
  main.querySelectorAll("[data-bguse]").forEach(b=>b.onclick=()=>{const r=useBolsa(b.dataset.bguse);if(!r)return;render();
    toast(r.nx?`Para ${r.nx.r.name.toLowerCase()} (${DSHORT[dow(r.nx.date)]} ${shortDate(r.nx.date)}): pásala a la nevera. Se descuenta al cocinarlo`:`Usada una bolsa de ${bolsaName(r.b).toLowerCase()}. Pásala a la nevera la noche antes`)});
  main.querySelectorAll("[data-bged]").forEach(b=>b.onclick=()=>openBolsa(b.dataset.bged));
  main.querySelectorAll("[data-bgday]").forEach(b=>b.onclick=()=>openPickDay("b:"+b.dataset.bgday,1));
}
// Añadir (o corregir) bolsas: tipo, qué es, peso de cada una, cuántas y cuándo se congelaron
function openBolsa(id){
  const b=id?S.bolsas.find(x=>x.id===id):null,bs=b?bolsasState().find(x=>x.id===id):null;let tipo=b?b.tipo:"carne",unidad=b?b.unidad||"g":"g";
  // La unidad de la bolsa es la del producto (no se puede apuntar en ml algo que va en gramos)
  const pu=pid=>P[pid]&&(P[pid].unit==="g"||P[pid].unit==="ml")?P[pid].unit:null;
  const draw=()=>{
    const cpid=dlg&&dlg.open&&dlg.querySelector("#bgPid")?dlg.querySelector("#bgPid").value:(b&&b.pid)||"",lock=pu(cpid);if(lock)unidad=lock;
    showDialog(`<div class="mod">${closeBtn}<h2 class="vh" style="font-size:1.7rem">${b?"Corregir":"Añadir"} <em>bolsas</em></h2>
      <div class="field"><label>Tipo</label><div class="chips">${Object.entries(BOLSA_TIPOS).map(([k,[ic,nm]])=>chip("data-bgt",k,tipo===k,ic+" "+nm)).join("")}</div></div>
      <div class="field"><label for="bgN">¿Qué es? (opcional)</label><input type="text" id="bgN" value="${esc(b?b.nombre||"":"")}" placeholder="${tipo==="cocinado"?"Lentejas con verduras":tipo==="caldo"?"Caldo de pollo":tipo==="carne"?"Muslos de pollo":"Lo que es"}"></div>
      <div class="field"><label for="bgPid">¿Es de algún producto de tus recetas? (opcional)</label><select id="bgPid"><option value="">No, es otra cosa</option>${Object.values(P).filter(p=>p.unit==="g"||p.unit==="ml").sort((a,c)=>a.name.localeCompare(c.name)).map(p=>`<option value="${p.id}" ${cpid===p.id?"selected":""}>${esc(p.name)}</option>`).join("")}</select>
        <small class="muted">Si lo es, cuenta en tu despensa y, cuando cocines un plato que lo lleve sin tener otro en casa, la descuento sola (según el peso).</small></div>
      <div class="row"><div class="field" style="flex:1.2"><label for="bgP">Peso de cada bolsa</label><input type="number" id="bgP" min="1" step="any" value="${b&&b.peso?b.peso:""}" placeholder="500"></div>
        <div class="field" style="flex:.8"><label>&nbsp;</label><div class="chips">${lock?`<span class="small muted">${lock}</span>`:chip("data-bgu","g",unidad==="g","g")+chip("data-bgu","ml",unidad==="ml","ml")}</div></div></div>
      <div class="row"><div class="field" style="flex:1"><label for="bgC">${b?"Bolsas que quedan":"¿Cuántas bolsas?"}</label><input type="number" id="bgC" min="0" step="1" value="${bs?bs.left:1}"></div>
        <div class="field" style="flex:1.3"><label for="bgD">Congeladas el</label><input type="date" id="bgD" value="${esc(b?b.at:todayISO())}" max="${todayISO()}"></div></div>
      <div class="actions"><button class="btn wide" id="bgOk">Guardar</button></div>${b?`<div class="actions"><button class="btn ghost" id="bgDel">Ya no hay ninguna</button></div>`:""}</div>`);
    dlg.querySelectorAll("[data-bgt]").forEach(x=>x.onclick=()=>{tipo=x.dataset.bgt;keep();draw()});
    dlg.querySelectorAll("[data-bgu]").forEach(x=>x.onclick=()=>{unidad=x.dataset.bgu;keep();draw()});
    dlg.querySelector("#bgPid").onchange=()=>{keep();draw()};
    dlg.querySelector("#bgOk").onclick=()=>{const n=Number(dlg.querySelector("#bgC").value);if(!(n>=0)||n!==Math.round(n)){toast("Indica cuántas bolsas (un número entero)");return}
      const pr=dlg.querySelector("#bgP").value,peso=pr===""?null:Number(pr),pid=dlg.querySelector("#bgPid").value||null;
      if(peso!=null&&!(peso>0)){toast("El peso tiene que ser mayor que 0");return}
      if(pid&&!peso){toast("Pon el peso de cada bolsa para poder descontarla al cocinar");return}
      const at=dlg.querySelector("#bgD").value||todayISO();
      const v={tipo,pid,nombre:dlg.querySelector("#bgN").value.trim(),peso,unidad:pu(pid)||unidad,at:at>todayISO()?todayISO():at};
      S.bolsas=S.bolsas||[];
      if(b){Object.assign(b,v);b.n=n+(b.n-bs.left)}   // corrige lo que queda sin perder lo ya gastado
      else{if(!n){toast("Indica cuántas bolsas");return}S.bolsas.push({id:uid("bg"),...v,n,usadas:0,usos:[]})}
      save();dlg.close();render();toast(b?"Corregido":`${n} ${n===1?"bolsa añadida":"bolsas añadidas"} al congelador`)};
    dlg.querySelector("#bgDel")?.addEventListener("click",()=>{if(bs.left>0){b.usos=b.usos||[];b.usos.push({id:uid("bu"),d:todayISO(),ts:Date.now(),n:bs.left})}save();dlg.close();render();toast("Quitadas del congelador")});
  };
  // Al cambiar de tipo, unidad o producto no se pierde lo escrito
  const keep=()=>{const g=s=>dlg.querySelector(s)?.value;const nb={nombre:g("#bgN"),peso:g("#bgP"),c:g("#bgC"),d:g("#bgD"),pid:g("#bgPid")};setTimeout(()=>{dlg.querySelector("#bgN").value=nb.nombre;dlg.querySelector("#bgP").value=nb.peso;dlg.querySelector("#bgC").value=nb.c;dlg.querySelector("#bgD").value=nb.d;dlg.querySelector("#bgPid").value=nb.pid},0)};
  draw();
}

function renderCongelador(){
  const st=freezerState(),nb=bolsasState().reduce((t,b)=>t+b.left,0),nAll=st.length+nb;
  let h=`<section class="view"><button class="btn ghost small" id="fzBack" style="margin-bottom:8px">‹ Despensa</button>${viewHead(nAll+" "+(nAll===1?"cosa":"cosas")+" dentro","Tu *congelador*")}
    <p class="small muted">Es parte de tu despensa: se llena con lo que compras para congelar o congelado (marcado, con «Ya he hecho esta compra» o con el ticket) y se vacía al cocinar los platos que lo usan. Si algo no cuadra, corrígelo aquí.</p>${bolsasHTML()}<h2 style="margin:18px 0 8px">De la compra</h2>`;
  const old=st.filter(e=>e.days>FREEZER_MONTHS*30);
  if(old.length)h+=`<div class="warnbox">🕒 ${old.length===1?"Esto lleva":"Estas cosas llevan"} más de ${FREEZER_MONTHS} meses congelado: ${old.map(e=>esc(P[e.pid].name.toLowerCase())).join(", ")}. Mejor gastarlo pronto; te lo propondré en los próximos menús.</div>`;
  if(!st.length)h+=`<div class="empty"><p>El congelador está vacío (o aún no has marcado compras de congelar).</p></div>`;
  for(const e of st){const p=P[e.pid],nx=nextUses(e.pid);
    const age=Math.min(100,Math.round(e.days/(FREEZER_MONTHS*30)*100));
    h+=`<div class="item fz" style="--age:${age}%">${prodImg(e.pid)}<span class="t"><b>${esc(p.name)}</b><small>${fmtQty(e.left,p.unit)} · ${esc(fzSince(e.at,e.days))}${e.days>FREEZER_MONTHS*30?" · ⚠️ gastar pronto":""}${e.src==="mano"?" · añadido a mano":e.src==="ticket"?" · del ticket":e.src==="recuento"?" · de un recuento":""}</small>
      ${nx.length?`<small>Para: ${nx.map(u=>esc(DSHORT[dow(u.date)]+" "+shortDate(u.date)+" ("+u.r.name.toLowerCase()+")")).join("; ")}</small>`:""}</span>
      <button class="btn ghost small" data-fzout="${esc(e.id)}">Ya no está</button></div>`}
  const prods=Object.values(P).filter(p=>p.keep==="congelar"||p.keep==="congelado");
  h+=`<div class="card"><h2>Añadir algo al congelador</h2>${prodPicker("fzP")}<div class="row" style="margin-top:8px"><input type="number" id="fzQ" min="0" step="any" placeholder="Cantidad" style="flex:1"><span class="small" id="fzU">—</span></div>
    <button class="btn small" id="fzAdd" style="margin-top:8px">Añadir</button></div>
    <div class="guide"><h3>Descongelar bien</h3><p>Lo más seguro es pasarlo del congelador a la nevera la noche anterior. Si se te olvida: en una bolsa cerrada dentro de agua fría (cambiándola cada 30 minutos), 1–2 horas; o en el microondas en modo descongelar, justo antes de cocinarlo. Nunca a temperatura ambiente.</p></div></section>`;
  main.innerHTML=h;
  document.getElementById("fzBack").onclick=()=>{tab="despensa";render();scrollTo(0,0)};
  bindBolsas();
  const pick=bindProdPicker("fzP",prods,p=>{document.getElementById("fzU").textContent=p?p.unit:"—"});
  document.getElementById("fzAdd").onclick=()=>{const p=pick(),q=Number(document.getElementById("fzQ").value);if(!p){toast("Busca y elige el producto");return}if(!(q>0)){toast("Indica la cantidad");return}
    S.freezer=S.freezer||[];S.freezer.push({id:uid("fz"),pid:p.id,qty:q,at:todayISO(),ts:Date.now()});save();render();toast(p.name+": añadido al congelador")};
  main.querySelectorAll("[data-fzout]").forEach(b=>b.onclick=()=>{const e=freezerOut(b.dataset.fzout);render();if(e)toast(P[e.pid].name+": quitado del congelador")});
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
    const th=r.ing.filter(([p])=>P[p]&&P[p].thaw).map(([p])=>P[p].name.toLowerCase());if(!th.length)continue;
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
  const alts=alternatives(sl,8).filter(({r})=>!r.ing.some(([p])=>P[p]&&P[p].thaw)).slice(0,4);
  showDialog(`<div class="mod">${closeBtn}<h2>Plan B</h2>
    <p><b>Descongelar rápido:</b> en una bolsa bien cerrada dentro de agua fría, cambiando el agua cada 30 minutos (1–2 horas), o en el microondas en modo descongelar justo antes de cocinarlo.</p>
    <p><b>O cambia el plato</b> por uno que no necesita descongelar:</p>
    ${alts.map(({r,miss})=>`<button class="alt" data-pb="${r.id}"><b>${esc(r.name)}</b><small>${recipeTime(r)} min${miss?(miss.length?" · te falta: "+esc(miss.slice(0,2).map(p=>P[p].name.toLowerCase()).join(", ")):" · tienes todo"):""}</small></button>`).join("")||"<p class='small muted'>No hay alternativas sin descongelar con tus filtros.</p>"}
    <div class="actions"><button class="btn ghost" data-x>Lo descongelo rápido</button></div></div>`);
  dlg.querySelectorAll("[data-pb]").forEach(x=>x.onclick=()=>{setSlotRecipe(sl,x.dataset.pb);dlg.close();render();toast("Cambiado por "+RX[x.dataset.pb].name)});
}
