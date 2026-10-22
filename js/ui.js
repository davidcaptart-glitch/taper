/* Táper · interfaz: menú, compra, recetas, perfil y ventanas */
"use strict";

const main=document.getElementById("main");
const dlg=document.getElementById("dlg");
let tab="menu", month=todayISO().slice(0,7), listSel="mes", recFilter="todas", recSearch="";

/* ---------- Cabecera ---------- */
function renderHeader(){
  const onb=S.onboarded&&tab!=="wizard";
  document.querySelector(".top .ticket").hidden=!onb;
  document.querySelector(".monthnav").style.display=onb&&(tab==="menu"||tab==="compra")?"":"none";
  document.querySelector(".top .ticket").hidden=!onb||!(tab==="menu"||tab==="compra");
  document.querySelector("nav.tabs").hidden=!onb;
  document.getElementById("monthLabel").textContent=monthName(month);
  document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-current",b.dataset.tab===tab?"page":"false"));
  const pd=document.getElementById("priceDate");
  if(PR&&PR.fecha){const ups=Object.keys(P).filter(rise).length;
    pd.innerHTML=`Precios del <b>${esc(longDate(PR.fecha).replace(/^\w+, /,""))}</b>${prOffline?" (última copia guardada)":""}${ups?` · <span class="up">▲ ${ups} ${ups===1?"producto ha subido":"productos han subido"}</span>`:""}`}
  else pd.textContent="Precios estimados: aún no se han descargado los de Mercadona";
  if(zoneMissing)pd.innerHTML+=` · <span class="up">precios de otra zona (tu código postal aún no está)</span>`;
  if(!onb)return;
  const sh=shopping(month), budget=monthBudget(month), spent=sh.total;
  const real=Object.entries(S.spent).filter(([k])=>k.startsWith(month+"|")).reduce((t,[,v])=>t+(Number(v)||0),0);
  document.getElementById("spent").textContent=eur(spent);
  document.getElementById("budgetOf").textContent="de "+eur(budget);
  const bar=document.getElementById("bar");bar.classList.toggle("over",spent>budget);
  bar.firstElementChild.style.width=Math.min(100,budget?spent/budget*100:0)+"%";
  const note=document.getElementById("budgetNote");note.classList.toggle("over",spent>budget);
  note.textContent=(spent>budget?"Te pasas "+eur(spent-budget)+" con lo previsto. Cambia algún plato o revisa el presupuesto.":"Previsto este mes · te sobran "+eur(budget-spent))+(real?` · Gastado de verdad: ${eur(real)}`:"");
}
// Las animaciones de entrada solo al cambiar de pestaña (o de paso del asistente), no en cada toque
let lastView=null;
function render(){
  try{if(S.onboarded)safetyAll()}catch(e){console.error(e)}
  if(!S.onboarded&&tab!=="wizard")tab="wizard";
  setTimeout(renderBell,0);
  const vk=tab+"|"+(tab==="wizard"?(wiz.single||wiz.i):"")+"|"+month;
  main.classList.toggle("anim",vk!==lastView);lastView=vk;
  if(tab==="menu"&&S.onboarded)syncMenuWeek();
  renderHeader();
  document.body.classList.toggle("wizmode",tab==="wizard");
  if(tab==="wizard")return renderWizard();
  if(tab==="menu")renderMenu();
  if(tab==="compra")renderCompra();
  if(tab==="recetas")renderRecetas();
  if(tab==="congelador")renderCongelador();
  if(tab==="perfil")renderPerfil();
}

/* ---------- Menú ---------- */
function slotFor(d,meal){const start=weekStartFor(d);return buildSlots(start).find(s=>s.id===d+"|"+meal)}
const nutrTxt=n=>n.kcal==null?`${n.prot} g proteína`:`${n.kcal.toLocaleString("es-ES")} kcal · ${n.prot} g proteína · ${n.carb} g hidratos · ${n.fat} g grasa`;
// Versión corta para el menú: P = proteína, H = hidratos, G = grasa
const nutrShort=n=>n.kcal==null?`${n.prot} g proteína`:`${n.kcal.toLocaleString("es-ES")} kcal · P ${n.prot} · H ${n.carb} · G ${n.fat}`;
const company=sl=>sl.eaters.filter(a=>a.id!=="yo").concat(sl.kids);
function needLine(sl,r){
  if((sl.fixed&&sl.fixed.capricho)||(r&&r.cap))return `<div class="need muted">🍕 Capricho: no cuenta para tus objetivos</div>`;
  if(!sl.need.why.length)return "";
  return `<div class="need">${sl.need.carbs?"⚡ Con hidratos":"💪 Con proteína"}: ${esc(sl.need.why.join("; "))}${sl.need.noHeavy?" · nada pesado":""}</div>`;
}
function mealLine(d,meal,wk){
  const st=mealState(d,meal);
  const label=meal==="comida"?"Comida":"Cena";
  if(st==="taper"){const prev=dishOfMeal(d,"comida");
    return `<div class="meta"><b>${label}:</b> táper${prev.recipe?" de "+esc(prev.recipe.name.toLowerCase()):""}</div>${prev.recipe&&!prev.capricho?`<div class="nutr">${nutrShort(portionNutr(prev.recipe,adultFactor(me())))}</div>`:""}`}
  if(st==="fuera"||st==="libre")return `<div class="meta"><b>${label}:</b> ${MEALSTATE[st].toLowerCase()}</div>`;
  const sl=slotFor(d,meal);if(!sl)return "";
  const v=wk&&wk.slots[sl.id], r=v&&RX[v.recipe];
  const who=[...(st==="solotaper"?[]:["tú"]),...sl.kids.map(k=>personName(k))];
  const comp=company(sl);
  let h=`<div style="margin-top:6px"><div class="small muted">${label}${st==="solotaper"?" (solo el táper de mañana)":""}${sl.tupper.length&&st!=="solotaper"?" + táper de mañana":""}${comp.length?" · con "+esc(comp.map(personName).join(" y ")):""}${sl.guests?` · <b>+${sl.guests} ${sl.guests===1?"invitado":"invitados"}</b>`:""}</div>`;
  if(r&&fromBatch(sl)){const k=keepPlan(r,sl);h+=`<div class="batchtag">${k.freeze?"❄️":"🥡"} Del táper del ${DAYS[dow(k.cook)].toLowerCase()}${k.freeze?" · pásalo a la nevera la noche antes":" · solo sacarlo y calentar"}</div>`}
  if(r)h+=`<div class="dishrow">${dishImg(r,"s")}<button class="name" data-open="${r.id}" data-slot="${sl.id}">${esc(r.name)}</button></div>`;
  else if(sl.fixed)h+=`<b>${esc(sl.fixed.name)}</b>`;
  h+=`<div class="meta">${r?`${recipeTime(r)} min · ${r.prot||"?"} g proteína · ${String(sl.portions).replace(".",",")} raciones`:sl.fixed?"Plato fijo":""}</div>`;
  if(r){const ps=(st==="solotaper"?[]:sl.eaters).concat(sl.kids);
    const who=ps.find(isMe)||ps[0];if(who)h+=`<div class="nutr">${isMe(who)?"Tu plato":esc(personName(who))}: ${nutrShort(portionNutr(r,factorOf(who)))}</div>`}
  h+=needLine(sl,r);
  if(r){
    if(S.home.cookMode==="lote"&&!fromBatch(sl)){const k=keepPlan(r,sl);
      h+=`<div class="thaw">🍳 Se cocina hoy en la sesión${k.freeze?" y parte se congela":""}</div>`}
    else{const th=r.ing.filter(([p])=>P[p].thaw).map(([p])=>P[p].name.toLowerCase());
      if(th.length)h+=`<div class="thaw">La noche anterior, pasa ${esc(th.join(" y "))} del congelador a la nevera.</div>`}
    h+=`<div class="ops"><button class="btn ghost small" data-swap="${sl.id}">Cambiar plato</button></div>`;
  }
  return h+`</div>`;
}
/* ---------- ¿Entrenaste? (una hora después de cada sesión) ---------- */
function pendingSports(){
  const today=todayISO(), now=new Date(), mins=now.getHours()*60+now.getMinutes(), out=[];
  for(let k=2;k>=0;k--){const d=addDays(today,-k), wk=S.plans[weekStartFor(d)];if(!wk||d<(wk.createdAt||"9"))continue;
    const res=((S.sport||{})[d]||{}).res||{};
    plannedSessions(d).forEach((s,i)=>{if(res[i])return;if(k===0&&mins<toMin(sessTime(s))+60)return;out.push({d,i,s})})}
  return out;
}
function sportCard(){
  const list=pendingSports();if(!list.length)return "";
  const {d,i,s}=list[list.length-1], key=d+"|"+i, today=d===todayISO();
  return `<div class="rate"><h3>¿Hiciste ${esc((SPORTS[s.type]||s.type).toLowerCase())}${today?" hoy":" el "+esc(longDate(d))} a las ${esc(sessTime(s))}?</h3><div class="small muted">Con esto recalculo lo que te conviene comer${list.length>1?` · ${list.length-1} más pendientes`:""}</div>
    <div class="actions"><button class="btn small" data-sp="${key}|si">Sí</button><button class="btn ghost small" data-sp="${key}|no">No</button><button class="btn ghost small" data-spother="${key}">Hice otra cosa</button></div>
    <div class="chips hidden" id="spOther">${Object.entries(SPORTS).map(([k,v])=>`<button class="chip" data-sp="${key}|otro|${k}">${v}</button>`).join("")}</div></div>`;
}
// Cambia los entrenos y, si las comidas que quedan ya no encajan, propone cambiarlas
function withRecalc(change){
  const today=todayISO(), starts=[weekStartFor(today),addDays(weekStartFor(today),7)];
  const future=()=>starts.flatMap(st=>S.plans[st]?buildSlots(st).filter(sl=>!sl.fixed&&(sl.date>today||(sl.date===today&&sl.meal==="cena"))):[]);
  const before=Object.fromEntries(future().map(sl=>[sl.id,sl.need]));
  change();save();
  const bad=[];
  for(const sl of future()){const b=before[sl.id];if(!b)continue;
    if(b.carbs===sl.need.carbs&&b.prot===sl.need.prot&&b.noHeavy===sl.need.noHeavy)continue;
    const wk=S.plans[weekStartFor(sl.date)], r=RX[(wk.slots[sl.id]||{}).recipe];if(!r)continue;
    const mismatch=(sl.need.carbs&&r.type!=="c")||(!sl.need.carbs&&sl.meal==="cena"&&r.type==="c"&&!sl.need.prot)||(sl.need.noHeavy&&r.heavy);
    if(mismatch)bad.push({sl,r});
  }
  render();
  if(!bad.length){toast("Apuntado. Las comidas que quedan siguen encajando");return}
  showDialog(`<div class="mod">${closeBtn}<h2>He recalculado</h2><p class="small muted">Con el cambio de entreno, ${bad.length===1?"este plato ya no encaja del todo":"estos platos ya no encajan del todo"}:</p>
    ${bad.map(({sl,r})=>`<div class="daycard"><div class="small muted">${DSHORT[dow(sl.date)]} ${shortDate(sl.date)} · ${sl.meal}</div><b>${esc(r.name)}</b>${needLine(sl)||`<div class="need">🥗 Ahora toca algo más ligero</div>`}
      <div class="chips" style="margin-top:6px">${alternatives(sl,3).map(({r:x})=>`<button class="chip" data-rc="${sl.id}|${x.id}">${esc(x.name)}</button>`).join("")}</div></div>`).join("")}
    <div class="actions"><button class="btn ghost" data-x>Dejarlo así</button></div></div>`);
  dlg.querySelectorAll("[data-rc]").forEach(b=>b.onclick=()=>{const v=b.dataset.rc,i=v.lastIndexOf("|"),sid=v.slice(0,i),rid=v.slice(i+1);
    setSlotRecipe(slotFor(sid.slice(0,10),sid.slice(11)),rid);b.closest(".daycard").innerHTML=`<b>Cambiado por ${esc(RX[rid].name)}</b>`;render()});
}
function setSport(d,i,st,type){S.sport=S.sport||{};const x=S.sport[d]=S.sport[d]||{};x.res=x.res||{};x.res[i]={st,type:type||null}}

/* ---------- ¿Qué tal? (después de cada comida) ---------- */
// Comidas ya pasadas sin respuesta: se pregunta hora y media después de la hora de cada comida
const MEAL_ART={desayuno:"el desayuno",almuerzo:"el almuerzo",comida:"la comida",merienda:"la merienda",cena:"la cena"};
const mealClock=m=>m==="comida"||m==="cena"?S.home.mealTimes[m]||(m==="comida"?"14:00":"21:00"):(S.home.extraMeals||{})[m==="almuerzo"?"mediamanana":m]||{desayuno:"08:00",almuerzo:"11:00",merienda:"17:30"}[m];
function pendingMeals(){
  const now=new Date(), today=todayISO(), mins=now.getHours()*60+now.getMinutes(), out=[];
  const after=m=>{const [hh,mm]=String(mealClock(m)||"14:00").split(":").map(Number);return hh*60+(mm||0)+(m==="comida"||m==="cena"?90:45)};
  S.meals=S.meals||{};
  for(let i=4;i>=0;i--){
    const d=addDays(today,-i);
    for(const meal of ["desayuno","almuerzo","comida","merienda","cena"]){
      if(i===0&&mins<after(meal))continue;
      const key=d+"|"+meal;if(S.meals[key])continue;
      const wk=S.plans[weekStartFor(d)];if(!wk||d<(wk.createdAt||"9"))continue;
      if(SMALL[meal]){const v=smallOf(d)[meal],r=v&&RX[v.recipe];if(!r)continue;
        const who=smallEaters(d,meal).filter(p=>!ratedBefore(p,r.id));
        if(!who.length){S.meals[key]={status:"ok"};continue}
        out.push({key,d,meal,r,taper:false,who,small:true,cook:false});continue}
      const st=mealState(d,meal);
      if(st==="taper"){const x=dishOfMeal(d,"comida");if(x.recipe)out.push({key,d,meal,r:x.recipe,taper:true,who:[]});continue}
      if(st!=="cocinar")continue;
      const sl=buildSlots(weekStartFor(d)).find(s=>s.id===key);if(!sl)continue;
      const v=wk.slots[sl.id], r=v&&RX[v.recipe];if(!r)continue;
      const who=sl.eaters.concat(sl.kids).filter(p=>!S.ratings.some(x=>x.slot===key&&x.who===p.id)&&!ratedBefore(p,r.id));
      // Quien cocina (el adulto) responde además si fue fácil y si lo repetiría
      const mine=S.ratings.find(x=>x.slot===key&&x.who===me().id);
      const cook=!!(mine&&(mine.ease==null||mine.again==null));
      if(!who.length&&!cook){S.meals[key]={status:"ok"};continue}
      out.push({key,d,meal,r,taper:false,who,sl,cook});
    }
  }
  return out;
}
// Contador del día: lo que comes entre comida y cena
function dayCounter(d,pt){
  const a=me(), t=dayTotals(a,d);if(!t.meals)return "";
  const prot=pt&&!pt.unknown?`<span class="${t.prot<pt.target*0.85?"low":""}">${t.prot} g proteína de ${pt.target}</span>`:`${t.prot} g proteína`;
  return `<div class="daybar">Hoy en ${t.meals===2?"comida y cena":t.skipped.length?"lo que comes en casa":"esta comida"}: <b>${t.kcal.toLocaleString("es-ES")} kcal</b> · ${prot} · ${t.carb} g hidratos · ${t.fat} g grasa${t.skipped.length?" (sin contar "+t.skipped.map(m=>m==="comida"?"la comida":"la cena").join(" ni ")+")":""}</div>`;
}
function rateCard(){
  const list=pendingMeals();if(!list.length)return "";
  const {key,d,meal,r,taper,who,cook,small}=list[list.length-1];
  const when=MEAL_ART[meal]+" del "+longDate(d);
  if(taper)return `<div class="rate"><h3>¿Te comiste el táper de ${esc(r.name.toLowerCase())}?</h3><div class="small muted">${esc(when)}${list.length>1?` · ${list.length-1} más pendientes`:""}</div>
    <div class="actions"><button class="btn small" data-ate="${key}">Sí</button><button class="btn ghost small" data-notate="${key}|${r.id}">No, otra cosa</button></div></div>`;
  return `<div class="rate"><h3>¿Qué tal ${esc(r.name.toLowerCase())}?</h3><div class="small muted">${esc(when)}${list.length>1?` · ${list.length-1} más pendientes`:""}</div>
    ${who.map(p=>`<div class="who"><div class="small"><b>${esc(personName(p))}</b></div><div class="chips">
      <button class="chip" data-rate="${key}~${r.id}~${p.id}~2">❤️ ${isMe(p)?"Me encantó":"Le encantó"}</button><button class="chip" data-rate="${key}~${r.id}~${p.id}~1">👍 Bien</button>
      <button class="chip" data-rate="${key}~${r.id}~${p.id}~-1">👎 No ${isMe(p)?"me":"le"} gustó</button></div></div>`).join("")}
    ${cook?(()=>{const m=S.ratings.find(x=>x.slot===key&&x.who===me().id);return `<div class="who"><div class="small"><b>¿Fue fácil de cocinar?</b></div><div class="chips">
      ${[["facil","😌 Fácil"],["normal","🙂 Normal"],["dificil","😓 Complicado"]].map(([v,t])=>`<button class="chip" data-ease="${key}~${v}" aria-pressed="${m.ease===v}">${t}</button>`).join("")}</div></div>
      <div class="who"><div class="small"><b>¿Lo repetirías?</b></div><div class="chips">
      ${[["menudo","🔁 Sí, a menudo"],["aveces","🗓️ De vez en cuando"],["no","🚫 No quiero repetirlo"]].map(([v,t])=>`<button class="chip" data-again="${key}~${v}" aria-pressed="${m.again===v}">${t}</button>`).join("")}</div></div>`})():""}
    ${small?`<button class="btn ghost small" style="margin-top:8px" data-skipmeal="${key}">No lo comimos</button>`:who.length?`<button class="btn ghost small" style="margin-top:8px" data-notate="${key}|${r.id}">No me lo comí o comí otra cosa</button>`:""}
    <p class="small muted" style="margin:8px 2px 0">Solo pregunto la primera vez que coméis cada plato. Así sé qué proponeros y busco platos parecidos a los que os encantan.</p></div>`;
}
// Respuestas al "¿Qué tal?" (en el Menú o en la ventana que sale al abrir la app)
function bindRate(root,done){
  root.querySelectorAll("[data-rate]").forEach(b=>b.onclick=()=>{const [sid,rid,who,v]=b.dataset.rate.split("~");
    if(v==="-1"){openDislike(rid,who,sid);return}
    addRating({slot:sid,rid,who,v:Number(v)});if(v==="2")setDish(S.people.find(p=>p.id===who),rid,2,who===me().id?"Te encantó":"Le encantó");done();toast("¡Apuntado!")});
  const myRating=key=>S.ratings.find(x=>x.slot===key&&x.who===me().id);
  root.querySelectorAll("[data-ease]").forEach(b=>b.onclick=()=>{const [k,v]=b.dataset.ease.split("~");const m=myRating(k);m.ease=v;save();done()});
  root.querySelectorAll("[data-again]").forEach(b=>b.onclick=()=>{const [k,v]=b.dataset.again.split("~");const m=myRating(k);m.again=v;m.rare=v==="aveces";
    if(v==="menudo")setDish(me(),m.rid,2,"Lo repetirías a menudo");
    if(v==="no"){setDish(me(),m.rid,-1,"No lo repetirías");toast("No lo volveré a proponer")}
    save();done()});
  root.querySelectorAll("[data-ate]").forEach(b=>b.onclick=()=>{S.meals[b.dataset.ate]={status:"ok"};save();done()});
  root.querySelectorAll("[data-skipmeal]").forEach(b=>b.onclick=()=>{S.meals[b.dataset.skipmeal]={status:"nada"};save();done()});
  root.querySelectorAll("[data-notate]").forEach(b=>b.onclick=()=>{const v=b.dataset.notate;openNotEaten(v.slice(0,v.lastIndexOf("|")),v.slice(v.lastIndexOf("|")+1))});
}
// Al abrir la app (o volver a ella) pregunta qué tal lo último que se ha comido; si se cierra, no insiste con esa comida
function openRateDialog(force){
  if(!S.onboarded)return;const list=pendingMeals();if(!list.length){if(force&&dlg.open)dlg.close();return}
  const key=list[list.length-1].key;if(!force&&(dlg.open||S.rateShown===key))return;
  S.rateShown=key;save();
  showDialog(`<div class="mod">${closeBtn}${rateCard()}</div>`);
  bindRate(dlg,()=>{render();if(dlg.open&&!dlg.querySelector("[name=why]"))openRateDialog(true)});
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")setTimeout(()=>openRateDialog(),600)});
// Qué pasó si no se comió lo previsto
function openNotEaten(key,rid){
  const d=key.slice(0,10), meal=key.slice(11), r=RX[rid], cooked=mealState(d,meal)==="cocinar";
  const sel=R.slice().sort((a,b)=>a.name.localeCompare(b.name));
  showDialog(`<div class="mod">${closeBtn}<h2>¿Qué pasó?</h2><div class="small muted">${meal==="comida"?"Comida":"Cena"} del ${esc(longDate(d))} · estaba previsto ${esc(r.name.toLowerCase())}</div>
    <button class="alt" data-w="fuera"><b>${meal==="comida"?"Comí fuera":"Cené fuera"}</b><small>En un restaurante, en casa de alguien…</small></button>
    <button class="alt" data-w="otro"><b>Comí otra cosa porque me apetecía</b><small>Dime qué y aprendo de ello</small></button>
    ${cooked?`<button class="alt" data-w="nada"><b>No lo cociné</b><small>Los ingredientes siguen en casa</small></button>`:""}
    <div id="otroBox" hidden><div class="field"><label>¿Qué comiste?</label><select id="otroR"><option value="">Otra cosa (escríbela)</option>${sel.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></div>
      <div class="field" id="otroTW"><input type="text" id="otroT" placeholder="Por ejemplo, bocadillo de tortilla"></div>
      <div class="chips" id="otroRate" hidden><button class="chip" data-or="2">❤️ Me encantó</button><button class="chip" data-or="1">👍 Bien</button><button class="chip" data-or="-1">👎 No me gustó</button></div>
      <div class="actions"><button class="btn" id="otroOk">Guardar</button></div></div></div>`);
  let orv=null;
  const finish=(info)=>{S.meals=S.meals||{};S.meals[key]=info;save();
    if(cooked&&info.status!=="ok"){
      showDialog(`<div class="mod">${closeBtn}<h2>¿Cocinamos ${esc(r.name.toLowerCase())} otro día?</h2><p class="small muted">Para aprovechar los ingredientes que ya tienes.</p>
        <div class="actions"><button class="btn" data-mv>Sí, en la próxima cena</button><button class="btn ghost" data-x>No</button></div></div>`);
      dlg.querySelector("[data-mv]").onclick=()=>{const ok=moveToNext(rid,todayISO());dlg.close();render();toast(ok?"Pasado a "+ok:"No hay más cenas esta semana")};
    }else dlg.close();
    render();toast("Apuntado");
  };
  dlg.querySelector("[data-w=fuera]").onclick=()=>finish({status:"fuera"});
  dlg.querySelector("[data-w=nada]")?.addEventListener("click",()=>finish({status:"nada"}));
  dlg.querySelector("[data-w=otro]").onclick=()=>{dlg.querySelector("#otroBox").hidden=false};
  const oR=dlg.querySelector("#otroR");oR.onchange=()=>{dlg.querySelector("#otroTW").hidden=!!oR.value;dlg.querySelector("#otroRate").hidden=!oR.value};
  dlg.querySelectorAll("[data-or]").forEach(b=>b.onclick=()=>{orv=Number(b.dataset.or);dlg.querySelectorAll("[data-or]").forEach(x=>x.setAttribute("aria-pressed",x===b))});
  dlg.querySelector("#otroOk").onclick=()=>{const other=oR.value||null,text=dlg.querySelector("#otroT").value.trim();
    if(other&&orv!=null)addRating({slot:key+"|otro",rid:other,who:me().id,v:orv});
    finish({status:"otro",rid:other,text})};
}
// Coloca un plato en la siguiente cena desde una fecha (desplaza los demás un hueco)
function moveToNext(rid,from){
  for(const start of [weekStartFor(from),addDays(weekStartFor(from),7)]){
    const wk=S.plans[start];if(!wk)continue;
    const slots=buildSlots(start).filter(s=>!s.fixed&&s.meal==="cena"&&s.date>=from);if(!slots.length)continue;
    let carry=rid;for(const s of slots){const cur=wk.slots[s.id];wk.slots[s.id]={recipe:carry};if(!cur)break;carry=cur.recipe}
    save();return longDate(slots[0].date);
  }
  return null;
}
/* ---------- Preparar el mes que viene ----------
   La última semana del mes: unas preguntas rápidas, se rehace el menú del mes siguiente y queda listo su pedido. */
const nextMonthOf=m=>{const [y,mm]=m.split("-").map(Number);return mm===12?`${y+1}-01`:`${y}-${String(mm+1).padStart(2,"0")}`};
const mName=m=>monthName(m).split(" ")[0].toLowerCase();
function monthPrepDue(){
  if(!S.onboarded)return null;const t=todayISO(),cur=t.slice(0,7);
  if(t<monthPrepDate(cur))return null;   // a partir del día elegido y hasta fin de mes
  const nx=nextMonthOf(cur);return ((S.monthPrep||{})[nx]||{}).done?null:nx;
}
function monthPrepCard(){
  const nx=monthPrepDue();if(!nx)return "";
  return `<div class="prepcard"><div><div class="veb">Se acaba ${esc(mName(todayISO().slice(0,7)))}</div><h2>Prepara <em>${esc(mName(nx))}</em></h2><p>5 preguntas rápidas y te dejo el menú y el pedido del mes listos.</p></div><button class="btn" data-mprep="${nx}">Empezar</button></div>`;
}
// Previsión de los días con cada hijo con custodia o turnos: se calcula con lo que ya se sabe y se aprueba
const custodyKids=()=>others().filter(k=>["alternas","findes","dias","manual"].includes((k.presence||{}).type));
function daysWith(k,m){const [y,mm]=m.split("-").map(Number),n=new Date(y,mm,0).getDate(),out=[];
  for(let i=1;i<=n;i++){const d=`${m}-${String(i).padStart(2,"0")}`;if(peopleAt(d).includes(k))out.push(d)}return out}
function rangesText(ds){
  if(!ds.length)return "ningún día";const rs=[];let a=ds[0],b=ds[0];
  for(const d of ds.slice(1)){if(d===addDays(b,1)){b=d;continue}rs.push([a,b]);a=b=d}rs.push([a,b]);
  return rs.map(([x,y])=>x===y?`el ${Number(x.slice(8))}`:`del ${Number(x.slice(8))} al ${Number(y.slice(8))}`).join(", ").replace(/, ([^,]*)$/," y $1");
}
function custodyCal(k,m){
  const [y,mm]=m.split("-").map(Number),first=`${m}-01`,n=new Date(y,mm,0).getDate();
  let h=`<div class="cal">${DSHORT.map(d=>`<span class="cal-h">${d.slice(0,1)}</span>`).join("")}${"<span></span>".repeat(dow(first))}`;
  for(let i=0;i<n;i++){const d=addDays(first,i),on=peopleAt(d).includes(k),ov=((S.days[d]||{}).kids||{})[k.id]!=null;
    h+=`<button class="cal-d ${on?"on":""} ${isHoliday(d)?"hol":""} ${ov?"ov":""}" data-mpk="${k.id}|${d}">${i+1}</button>`}
  return h+`</div>`;
}
function openMonthPrep(nx){
  const cur=todayISO().slice(0,7)<nx?todayISO().slice(0,7):iso(new Date(Number(nx.slice(0,4)),Number(nx.slice(5))-2,1)).slice(0,7);
  const prev=(S.monthPrep||{})[nx]||{};
  const st={mood:prev.mood||null,more:[...(prev.more||[])],less:[...(prev.less||[])],favs:[...(prev.favs||[])],budget:prev.budget||"",away:[],guests:[],kidsOk:{...(prev.kidsOk||{})}};
  // Los mejor valorados del mes que acaba (o de siempre si aún no hay)
  const rated=S.ratings.filter(x=>x.who===me().id&&x.v>=1&&RX[x.rid]);
  const thisM=rated.filter(x=>String(x.at||"").startsWith(cur));
  const favIds=[...new Set((thisM.length?thisM:rated).sort((a,b)=>b.v-a.v).map(x=>x.rid))].concat(Object.entries(me().tastes.dish).filter(([,v])=>v>=1.5).map(([k])=>k)).filter((v,i,a)=>RX[v]&&a.indexOf(v)===i).slice(0,10);
  const rv=(()=>{try{return monthReview(cur)}catch(e){return null}})();
  const draw=()=>{
    showDialog(`<div class="mod mprep">${closeBtn}
      <div class="veb">Prepara ${esc(mName(nx))}</div><h2 class="vh" style="font-size:1.9rem">¿Qué tal <em>${esc(mName(cur))}</em>?</h2>
      ${rv&&rv.budget?`<p class="small muted" style="margin:6px 0 10px">Previsto ${eur(rv.spent)} de ${eur(rv.budget)}${rv.ok?" · dentro del presupuesto":" · te pasaste "+eur(rv.spent-rv.budget)}.</p>`:""}
      <div class="moods">${[["bien","😀","Bien"],["regular","😐","Regular"],["mal","😞","Mal"]].map(([k,e,t])=>`<button class="mood" data-mood="${k}" aria-pressed="${st.mood===k}"><span>${e}</span>${t}</button>`).join("")}</div>
      <h3 class="mq">En ${esc(mName(nx))} quiero <b>más</b>…</h3><div class="chips">${Object.entries(PREF_OPTS).map(([k,t])=>chip("data-more",k,st.more.includes(k),t)).join("")}</div>
      <h3 class="mq">…y <b>menos</b></h3><div class="chips">${Object.entries(PREF_OPTS).map(([k,t])=>chip("data-less",k,st.less.includes(k),t)).join("")}</div>
      ${favIds.length?`<h3 class="mq">¿Qué platos repetimos?</h3><div class="favpick">${favIds.map(id=>{const r=RX[id];return `<button class="fp" data-fav="${id}" aria-pressed="${st.favs.includes(id)}">${dishImg(r,"s")}<span>${esc(r.name)}</span></button>`}).join("")}</div>`:""}
      ${custodyKids().map(k=>{const ds=daysWith(k,nx),ok=st.kidsOk[k.id];return `<h3 class="mq">📅 ¿Cuándo está ${esc(personName(k))} contigo en ${esc(mName(nx))}?</h3>
        <p class="small muted" style="margin:0 0 8px">${(k.presence||{}).type==="manual"?`Marca los días que estará contigo.`:`Según sus turnos y los cambios que tienes apuntados, está contigo <b>${ds.length} días</b>: ${esc(rangesText(ds))}. Toca un día si no es así.`}</p>
        ${custodyCal(k,nx)}
        <div class="row" style="margin-top:8px">${ok?`<span class="okt" style="color:var(--ok);font-weight:650">✓ Aprobado</span><button class="btn ghost small" data-kok="${k.id}">Volver a revisar</button>`:`<button class="btn small" data-kok="${k.id}">✓ Así está bien</button>`}<button class="btn ghost small" data-mchg="${k.id}">Vacaciones o cambio de turno</button></div>`}).join("")}
      <h3 class="mq">¿Algo especial en ${esc(mName(nx))}?</h3>
      <details class="more" ${st.away.length?"open":""}><summary>✈️ Días fuera de casa${st.away.length?` (${st.away.length})`:""}</summary>
        ${st.away.map((a,i)=>`<div class="fixed"><span>Del ${esc(shortDate(a.from))} al ${esc(shortDate(a.to))}</span><button class="btn ghost small" data-delaway="${i}">Quitar</button></div>`).join("")}
        <div class="row"><input type="date" id="awF" value="${nx}-01" style="flex:1"><input type="date" id="awT" value="${nx}-07" style="flex:1"></div>
        <button class="btn ghost small" id="awAdd" style="margin:8px 0">+ Añadir días fuera</button></details>
      <details class="more" ${st.guests.length?"open":""}><summary>👥 Visitas${st.guests.length?` (${st.guests.length})`:""}</summary>
        ${st.guests.map((g,i)=>`<div class="fixed"><span>${esc(longDate(g.d))} · ${g.meal} · +${g.n}</span><button class="btn ghost small" data-delg="${i}">Quitar</button></div>`).join("")}
        <div class="row"><input type="date" id="gD" value="${nx}-01" style="flex:2"><select id="gM" style="flex:1"><option value="comida">comida</option><option value="cena">cena</option></select><input type="number" id="gN" min="1" max="20" value="2" style="flex:.8"></div>
        <button class="btn ghost small" id="gAdd" style="margin:8px 0">+ Añadir visita</button></details>
      <details class="more" ${st.budget?"open":""}><summary>💶 Presupuesto distinto${st.budget?` (${eur(Number(st.budget))})`:""}</summary>
        <div class="field"><label for="mpB">Presupuesto de ${esc(mName(nx))} (€)</label><input type="number" id="mpB" min="0" step="5" value="${esc(st.budget)}" placeholder="${eur(Number(S.home.budget.month)||0)} (el de siempre)"></div></details>

      <div class="actions sticky"><button class="btn wide" id="mpGo">Preparar ${esc(mName(nx))}</button></div></div>`,true);
    const q=s=>dlg.querySelectorAll(s);
    q("[data-mood]").forEach(b=>b.onclick=()=>{st.mood=b.dataset.mood;draw()});
    const tog=(arr,k)=>arr.includes(k)?arr.splice(arr.indexOf(k),1):arr.push(k);
    q("[data-more]").forEach(b=>b.onclick=()=>{tog(st.more,b.dataset.more);if(st.less.includes(b.dataset.more))tog(st.less,b.dataset.more);draw()});
    q("[data-less]").forEach(b=>b.onclick=()=>{tog(st.less,b.dataset.less);if(st.more.includes(b.dataset.less))tog(st.more,b.dataset.less);draw()});
    q("[data-fav]").forEach(b=>b.onclick=()=>{tog(st.favs,b.dataset.fav);draw()});
    dlg.querySelector("#awAdd").onclick=()=>{const f=dlg.querySelector("#awF").value,t=dlg.querySelector("#awT").value;if(!f||!t||t<f){toast("Revisa las fechas");return}st.away.push({from:f,to:t});draw()};
    q("[data-delaway]").forEach(b=>b.onclick=()=>{st.away.splice(Number(b.dataset.delaway),1);draw()});
    dlg.querySelector("#gAdd").onclick=()=>{const d=dlg.querySelector("#gD").value,n=Number(dlg.querySelector("#gN").value);if(!d||!(n>0)){toast("Pon el día y cuántos vienen");return}st.guests.push({d,meal:dlg.querySelector("#gM").value,n});draw()};
    q("[data-delg]").forEach(b=>b.onclick=()=>{st.guests.splice(Number(b.dataset.delg),1);draw()});
    dlg.querySelector("#mpB").oninput=e=>{st.budget=e.target.value};
    q("[data-mchg]").forEach(b=>b.onclick=()=>{const y=dlg.scrollTop;openChange(b.dataset.mchg);dlg.addEventListener("close",()=>{draw();dlg.scrollTop=y},{once:true})});
    q("[data-mpk]").forEach(b=>b.onclick=()=>{const [kid,d]=b.dataset.mpk.split("|"),k=S.people.find(p=>p.id===kid);S.days[d]=S.days[d]||{};const o=S.days[d].kids=S.days[d].kids||{};
      const ruleOn=presentByRule(k,d),nowOn=peopleAt(d).includes(k);if(!nowOn===ruleOn)delete o[kid];else o[kid]=!nowOn;delete st.kidsOk[kid];save();const y=dlg.scrollTop;draw();dlg.scrollTop=y});
    q("[data-kok]").forEach(b=>b.onclick=()=>{const kid=b.dataset.kok;st.kidsOk[kid]=!st.kidsOk[kid];const y=dlg.scrollTop;draw();dlg.scrollTop=y});
    dlg.querySelector("#mpGo").onclick=()=>{
      const pend=custodyKids().find(k=>!st.kidsOk[k.id]);
      if(pend){toast(`Revisa y aprueba los días de ${personName(pend)}`);return}
      S.monthPrep=S.monthPrep||{};S.monthPrep[nx]={mood:st.mood,more:st.more,less:st.less,favs:st.favs,budget:Number(st.budget)||null,kidsOk:st.kidsOk,done:todayISO()};
      for(const a of st.away)for(let d=a.from;d<=a.to;d=addDays(d,1)){S.days[d]=S.days[d]||{};S.days[d].comida="fuera";S.days[d].cena="fuera"}
      for(const g of st.guests){S.days[g.d]=S.days[g.d]||{};S.days[g.d].guests={...(S.days[g.d].guests||{}),[g.meal]:g.n}}
      dlg.close();
      preparingScreen(()=>{for(const s of weeksInMonth(nx))if(!(S.plans[s]&&S.plans[s].confirmed))genWeekFromScratch(s);save()},()=>{
        const l=shopping(nx).lists.mes;month=nx;tab="menu";render();
        showDialog(`<div class="mod">${closeBtn}<div class="veb">Listo</div><h2 class="vh" style="font-size:1.8rem">${esc(monthName(nx).split(" ")[0])}, <em>preparado</em></h2>
          <p>He rehecho el menú con lo que me has dicho${st.favs.length?` y he metido ${st.favs.length} ${st.favs.length===1?"plato que te gustó":"platos que te gustaron"}`:""}.</p>
          <div class="okbox"><b>Pedido del mes:</b> ${l.items.length} productos · ${eur(l.cost+l.fee)}${l.fee?` (con ${eur(l.fee)} de envío)`:""}</div>
          <div class="actions"><button class="btn wide" id="mpShop">Ver el pedido del mes</button></div></div>`);
        dlg.querySelector("#mpShop").onclick=()=>{dlg.close();month=nx;tab="compra";listSel="mes";render();scrollTo(0,0)};
      });
    };
  };
  draw();
}

function openShopReminder(r){
  showDialog(`<div class="mod">${closeBtn}<div class="veb">${r.key==="mes"?"Compra del mes":"Compra de la semana"}</div><h2 class="vh" style="font-size:1.8rem">${r.online?"Haz el <em>pedido</em>":"Toca <em>comprar</em>"}</h2>
    <p>${esc(r.body)}.</p>
    <div class="actions"><button class="btn wide" id="srList">Ver la lista</button></div>
    <div class="actions"><button class="btn ghost" id="srDone">✓ Ya la he hecho</button><button class="btn ghost" id="srLater">⏰ Mañana</button></div></div>`);
  dlg.querySelector("#srList").onclick=()=>{dlg.close();month=r.m;tab="compra";listSel=r.key;render();scrollTo(0,0)};
  dlg.querySelector("#srDone").onclick=()=>{markShopDone(r.m,r.key);render();askTicket(r.m,r.key)};
  dlg.querySelector("#srLater").onclick=()=>{S.shopSnooze=S.shopSnooze||{};S.shopSnooze[shopKey(r.m,r.key)]=addDays(todayISO(),1);save();dlg.close();render();toast("Te lo recuerdo mañana")};
}
// Acciones que llegan desde una notificación ("Ya está" o tocarla)
function notifAction(tipo,tag){
  if(tag&&tag.startsWith("rate|")){tab="menu";render();openRateDialog(true);return}
  if(!tag||!tag.startsWith("shop|"))return;
  const [,m,key]=tag.split("|");
  if(tipo==="hecho"){markShopDone(m,key);render();toast("Compra marcada como hecha")}
  else {month=m;tab="compra";listSel=key;render();scrollTo(0,0)}
}

// Platos quitados por alergias o dieta: se dice cuáles y por qué, hasta que se lee
function safetyCard(){
  if(!safetyNotes.length)return "";
  return `<div class="warnbox" id="safetyBox"><b>⚠️ He cambiado ${safetyNotes.length===1?"un plato":safetyNotes.length+" platos"} por alergias o dieta</b>
    <ul style="margin:6px 0 4px 18px;padding:0">${safetyNotes.map(n=>`<li>${esc(n.name)} · ${esc(DAYS[dow(n.d)].toLowerCase())} ${esc(shortDate(n.d))}, ${esc(MEAL_ART[n.meal]?MEAL_ART[n.meal].split(" ")[1]:n.meal)} · ${esc(n.who.join("; "))}</li>`).join("")}</ul>
    <small>Ya tienes otro plato en su lugar y la lista de la compra está al día.</small> <button class="btn ghost small" id="safetyOk">Entendido</button></div>`;
}
// Fila compacta con las comidas pequeñas del día
function smallLine(d){
  const sm=smallOf(d),ks=Object.keys(SMALL).filter(m=>sm[m]&&RX[sm[m].recipe]);if(!ks.length)return "";
  return `<div class="smallrow">${ks.map(m=>{const r=RX[sm[m].recipe],ll=smallEaters(d,m).some(p=>smallState(p,m,d)==="llevar");
    return `<div class="smi"><button class="smimg" data-open="${r.id}" aria-label="${esc(r.name)}">${dishImg(r,"s")}</button><span><small>${SMALL[m][0]} ${SMALL[m][1]}${ll?" · 🎒":""}</small><button class="name smn" data-open="${r.id}">${esc(r.name)}</button></span><button class="smre" data-smre="${d}|${m}" aria-label="Cambiar ${SMALL[m][1].toLowerCase()}">↻</button></div>`}).join("")}</div>`;
}

/* ---------- Menú imprimible (se canjea en la tienda) ---------- */
function printMenu(m){
  if(!owns("imprimible")){openShop();return}
  const weeks=weeksInMonth(m).filter(s=>S.plans[s]);const sh=shopping(m);
  const cell=(d,meal)=>{const x=dishOfMeal(d,meal);return x.recipe?esc(x.recipe.name):x.state==="fuera"?"<i>Fuera</i>":x.state==="libre"?"<i>Libre</i>":"–"};
  let h=`<div class="pr-head"><b>Táper</b><span>Menú de ${esc(monthName(m))}</span></div>`;
  for(const s of weeks){h+=`<h2>Semana del ${esc(shortDate(s))} al ${esc(shortDate(addDays(s,6)))}</h2><table class="pr-t"><tr><th></th><th>Desayuno</th><th>Comida</th><th>Merienda</th><th>Cena</th></tr>`;
    for(const d of weekDates(s)){const sm=smallOf(d);h+=`<tr><td><b>${esc(DSHORT[dow(d)])}</b> ${Number(d.slice(8))}</td><td>${sm.desayuno&&RX[sm.desayuno.recipe]?esc(RX[sm.desayuno.recipe].name):"–"}</td><td>${cell(d,"comida")}</td><td>${sm.merienda&&RX[sm.merienda.recipe]?esc(RX[sm.merienda.recipe].name):"–"}</td><td>${cell(d,"cena")}</td></tr>`}
    h+=`</table>`}
  h+=`<h2>Lista de la compra</h2><div class="pr-cols">`;
  for(const l of Object.values(sh.lists)){if(!l.items.length)continue;
    h+=`<div><h3>${l.key==="mes"?"Compra del mes":"Semana del "+esc(shortDate(sh.weeks[Number(l.key)]))}</h3><ul>${l.items.map(it=>`<li>☐ ${it.packs} × ${esc(P[it.pid].name)}</li>`).join("")}</ul></div>`}
  h+=`</div>`;
  let area=document.getElementById("printArea");if(!area){area=document.createElement("div");area.id="printArea";document.body.appendChild(area)}
  area.innerHTML=h;document.body.classList.add("printing");setTimeout(()=>{window.print();setTimeout(()=>document.body.classList.remove("printing"),500)},100);
}

/* ---------- Piezas de diseño comunes ---------- */
// Cabecera de cada pantalla: etiqueta pequeña + título grande con *acento* en cursiva
const viewHead=(eyebrow,title,side)=>`<div class="vhead"><div><div class="veb">${esc(eyebrow)}</div><h1 class="vh">${esc(title).replace(/\*(.+?)\*/g,"<em>$1</em>")}</h1></div>${side||""}</div>`;
const dishPhoto=r=>MYPHOTOS[r.id]||(DISHPHOTOS[r.id]&&DISHPHOTOS[r.id].archivo)||null;
// El próximo plato que toca cocinar o comer (hoy, mañana…)
function nextMeal(){
  const now=new Date(),h=now.getHours()+now.getMinutes()/60;
  const lead=S.home.start&&S.home.start>todayISO()?daysBetween(todayISO(),S.home.start):0;
  for(let i=0;i<lead+8;i++){const d=addDays(todayISO(),i),wk=S.plans[weekStartFor(d)];if(!wk)continue;
    for(const meal of ["comida","cena"]){
      if(i===0&&meal==="comida"&&h>=16)continue;
      if(i===0&&meal==="cena"&&h>=22)continue;
      if(["fuera","libre"].includes(mealState(d,meal)))continue;
      const sl=slotFor(d,meal),v=sl&&wk.slots[sl.id],r=v&&RX[v.recipe];if(r)return {d,meal,sl,r,i}}}
  return null;
}
function todayCard(){
  const n=nextMeal();if(!n)return "";
  const ph=dishPhoto(n.r), when=n.i===0?"Hoy":n.i===1?"Mañana":n.i<7?DAYS[dow(n.d)]:DAYS[dow(n.d)]+" "+shortDate(n.d);
  const k=n.r.kcal?` · ${n.r.kcal} kcal`:"";
  return `<div class="todaycard ${ph?"":"nophoto"}" ${ph?`style="background-image:linear-gradient(180deg,rgba(0,0,0,0) 25%,rgba(10,10,12,.82) 100%),url('${esc(ph)}')"`:""}>
    ${ph?"":`<div class="tcart">${dishImg(n.r,"l")}</div>`}
    <div class="tcin"><span class="tclab">${when} · ${n.meal==="comida"?"comida":"cena"}</span>
      <h2>${esc(n.r.name)}</h2>
      <div class="tcmeta"><span>⏱ ${recipeTime(n.r)} min</span><span>👥 ${String(n.sl.portions).replace(".",",")} rac.</span>${n.r.kcal?`<span>🔥 ${n.r.kcal} kcal</span>`:""}</div>
      <div class="tcbtns"><button class="btn" data-open="${n.r.id}" data-slot="${n.sl.id}">Ver receta</button><button class="btn glass" data-cooknow="${n.r.id}|${n.sl.portions}">▶ Cocinar</button></div></div></div>`;
}
// Tira de días de la semana actual: toca uno para ir a él
function dayStrip(st){
  if(!st){const n=nextMeal();st=weekStartFor(n?n.d:todayISO())}const ds=weekDates(st);if(!S.plans[st])return "";
  return `<div class="dstrip">${ds.map(d=>{const has=["comida","cena"].some(m=>!["fuera","libre"].includes(mealState(d,m)));
    return `<button class="dsd ${d===todayISO()?"on":""} ${d<todayISO()?"past":""}" data-goday="${d}"><small>${DSHORT[dow(d)]}</small><b>${Number(d.slice(8))}</b><i class="${has?"y":""}"></i></button>`}).join("")}</div>`;
}
const SEC_ICO=[["frut","🥦"],["verdur","🥦"],["carne","🥩"],["pollo","🍗"],["pescad","🐟"],["marisc","🦐"],["huevo","🥚"],["leche","🥛"],["lácte","🥛"],["yogur","🥛"],["queso","🧀"],["charcut","🧀"],["congel","🧊"],["arroz","🍚"],["pasta","🍝"],["legumbre","🫘"],["conserv","🥫"],["caldo","🥫"],["aceite","🫒"],["especia","🧂"],["salsa","🫙"],["pan","🥖"],["cereal","🥣"],["fruto","🥜"]];
const secIco=s=>{const l=String(s).toLowerCase();const m=SEC_ICO.find(([k])=>l.includes(k));return m?m[1]:"🛒"};

// Semanas que se pueden ver: desde dos atrás (o el inicio del plan) hasta la última con menú
let weekSel=null, menuMonth=null;
function menuWeeks(){
  const cur=weekStartFor(todayISO()), first=S.home.start&&S.home.start>todayISO()?weekStartFor(S.home.start):addDays(cur,-14);
  const last=Object.keys(S.plans).sort().pop()||cur, out=[];
  for(let s=first;s<=last&&out.length<16;s=addDays(s,7))if(!(S.home.start&&addDays(s,6)<S.home.start))out.push(s);
  return out.length?out:[cur];
}
function defaultWeek(ws){const cur=weekStartFor(todayISO());return ws.includes(cur)?cur:ws.find(s=>s>=cur)||ws[0]}
function weekPicker(ws,sel){
  const cur=weekStartFor(todayISO());
  return `<div class="wpick" role="tablist" aria-label="Semanas">${ws.map(s=>{const wk=S.plans[s];
    return `<button role="tab" class="wp ${s===sel?"on":""} ${addDays(s,6)<todayISO()?"past":""}" data-wsel="${s}" aria-selected="${s===sel}">
      <small>${s===cur?"Esta semana":s===addDays(cur,7)?"La que viene":esc(monthName(s.slice(0,7)).split(" ")[0])}</small><b>${Number(s.slice(8))}–${esc(shortDate(addDays(s,6)))}</b>
      <i>${wk&&wk.confirmed?"✓ Planificada":wk?"Previsión":"Sin menú"}</i></button>`}).join("")}</div>`;
}
// Elige la semana del Menú (y su mes) antes de pintar la cabecera
function syncMenuWeek(){
  const ws=menuWeeks();if(!weekSel||!ws.includes(weekSel))weekSel=defaultWeek(ws);
  // Si el mes se ha cambiado desde fuera (flechas, preparar el mes…), se va a su primera semana
  if(menuMonth&&month!==menuMonth){const w=ws.find(s=>monthOfWeek(s)===month)||ws.find(s=>addDays(s,6).slice(0,7)===month);if(w)weekSel=w}
  month=monthOfWeek(weekSel);menuMonth=month;return ws;
}
function renderMenu(){
  const ws=syncMenuWeek();
  const weeks=[weekSel];
  let h=`<section class="view">`+viewHead(monthName(month),"Qué *comemos*",`${servidorOn()?`<button class="btn ghost small" id="shareMenu" title="Compartir el menú con alguien de casa">👥</button>`:""}<button class="btn ghost small" id="printMenu" title="Menú imprimible">🖨️</button>`)+followChips()+safetyCard()+afinarCard()+monthPrepCard()+((n=>n&&weekStartFor(n.d)===weekSel)(nextMeal())?todayCard():"")+weekPicker(ws,weekSel)+dayStrip(weekSel)+useUpCard()+`<div class="row" style="justify-content:flex-end;margin:4px 0 -4px"><button class="btn ghost small" id="startDay">📅 ${S.home.start&&S.home.start>todayISO()?"Cambiar el día de inicio":"Empezar el plan otro día"}</button></div>`+installCard()+reviewCard()+surveyCard()+thawCard()+sportCard()+rateCard();
  for(const start of weeks){
    const wk=S.plans[start], dates=weekDates(start);
    h+=`<div class="week"><div class="weekhead"><h2>${shortDate(start)} – ${shortDate(dates[6])}</h2>${wk&&wk.confirmed?`<span class="badge ok">Planificada</span>`:wk?`<span class="badge">Previsión</span>`:""}</div>`;
    if(!wk||!Object.keys(wk.slots||{}).length){h+=`<div class="empty"><p>Aún no hay menú para esta semana.</p><button class="btn" data-plan="${start}">Planificar la semana</button></div></div>`;continue}
    const {changed}=ensureWeek(start);if(changed)save();
    h+=`<div class="weekacts"><button class="btn small" data-plan="${start}">${wk.confirmed?"Revisar la semana":"Planificar la semana"}</button><button class="btn ghost small" data-regen="${start}">Rehacer platos</button></div>`;
    {const cost=weekCost(start),target=weekFoodTarget(start);
      h+=cost>target+0.5?`<div class="warnbox">💶 La comida de esta semana sale por unos <b>${eur(cost)}</b> y tu presupuesto deja <b>${eur(target)}</b>. He elegido lo más barato que encaja con vuestros gustos y entrenos, pero no llego. <button class="btn small" data-sacr="${start}">¿Qué sacrificamos?</button></div>`
        :`<div class="small muted" style="margin-bottom:6px">💶 Comida de la semana: ${eur(cost)} de ${eur(target)} disponibles</div>`}
    for(const g of tupperGaps(start))h+=`<div class="warnbox">El ${DAYS[dow(g)].toLowerCase()} ${shortDate(g)} no tienes táper: la cena de la víspera no se cocina. <button class="btn ghost small" data-day="${g}">Arreglarlo</button></div>`;
    if(S.home.cookMode==="lote"){const cds=[...new Set(buildSlots(start).filter(s=>wk.slots[s.id]).map(s=>cookDayFor(s.date)))].sort();
      for(const cd of cds){const n=buildSlots(start).filter(s=>cookDayFor(s.date)===cd&&wk.slots[s.id]&&RX[wk.slots[s.id].recipe]).length;
        h+=`<div class="session"><b>Sesión de cocina: ${esc(longDate(cd))}</b><div class="small muted">${n} platos</div><button class="btn ghost small" data-session="${cd}">Ver la sesión</button></div>`}}
    for(const d of dates){
      const ks=peopleAt(d).filter(p=>p.id!=="yo"), hol=isHoliday(d), a=me(), pt=a?dayProtein(a,d):null;
      const sess=sessionsOn(d);
      const empty=["comida","cena"].every(m=>["fuera","libre"].includes(mealState(d,m)));
      h+=`<div class="slot ${empty?"extra":""} ${d===todayISO()?"today":""}" id="d-${d}"><div class="day"><small>${DSHORT[dow(d)]}</small><b>${Number(d.slice(8))}</b><small>${esc(shortDate(d).split(" ")[1]||"")}</small></div><div>
        <div class="tags">${hol?`<span class="pill carga">${esc(holidayName(d))}</span>`:""}${ks.map(k=>{const c=peopleAt(d,"comida").includes(k),n=peopleAt(d,"cena").includes(k);return `<span class="pill kid">${esc(personName(k))}${c&&!n?" · solo comida":!c&&n?" · solo cena":""}</span>`}).join("")}${sess.map(s=>`<span class="pill ligera">${esc(SPORTS[s.type])} ${esc(sessTime(s))}</span>`).join("")}</div>
        ${smallLine(d)}${mealLine(d,"comida",wk)}${mealLine(d,"cena",wk)}
        ${dayCounter(d,pt)}
        <div class="ops"><button class="btn ghost small" data-day="${d}">Cambiar este día</button></div></div></div>`;
    }
    h+=`</div>`;
  }
  main.innerHTML=h+`</section>`;
  main.querySelectorAll("[data-plan]").forEach(b=>b.onclick=()=>openWeekPlanner(b.dataset.plan));
  document.getElementById("printMenu")?.addEventListener("click",()=>printMenu(month));
  main.querySelectorAll("[data-wsel]").forEach(b=>b.onclick=()=>{weekSel=b.dataset.wsel;render()});
  {const on=main.querySelector(".wp.on");if(on)on.scrollIntoView({inline:"center",block:"nearest"})}
  main.querySelectorAll("[data-mprep]").forEach(b=>b.onclick=()=>openMonthPrep(b.dataset.mprep));
  main.querySelectorAll("[data-smre]").forEach(b=>b.onclick=()=>{const [d,m]=b.dataset.smre.split("|");rerollSmall(d,m);save();render();toast("Cambiado")});
  main.querySelectorAll("[data-goday]").forEach(b=>b.onclick=()=>{const el=document.getElementById("d-"+b.dataset.goday);if(el){el.scrollIntoView({behavior:"smooth",block:"start"});el.classList.remove("flash");void el.offsetWidth;el.classList.add("flash")}});
  main.querySelectorAll("[data-cooknow]").forEach(b=>b.onclick=()=>{const [rid,p]=b.dataset.cooknow.split("|");const r=RX[rid];openCook(r,variantFor(r)||r.vars[0],Number(p)||2)});
  main.querySelectorAll("[data-regen]").forEach(b=>b.onclick=()=>{if(confirm("¿Rehacer los platos de esta semana? Se mantienen los que elegiste a mano.")){genWeekFromScratch(b.dataset.regen);save();render();toast("Platos rehechos")}});
  main.querySelectorAll("[data-swap]").forEach(b=>b.onclick=()=>openSwap(b.dataset.swap));
  main.querySelectorAll("[data-sacr]").forEach(b=>b.onclick=()=>openSacrifice(b.dataset.sacr));
  bindReview(main);bindSurvey();bindThaw();bindInstall();
  document.getElementById("useUp")?.addEventListener("click",openUseUp);
  document.getElementById("startDay")?.addEventListener("click",openStartDay);
  main.querySelectorAll("[data-day]").forEach(b=>b.onclick=()=>openDay(b.dataset.day));
  main.querySelectorAll("[data-session]").forEach(b=>b.onclick=()=>openSession(b.dataset.session));
  bindRate(main,render);
  bindAfinar(main);
  document.getElementById("safetyOk")?.addEventListener("click",()=>{safetyNotes=[];render()});
  document.getElementById("shareMenu")?.addEventListener("click",openShareMenu);
  main.querySelectorAll("[data-follow]").forEach(b=>b.onclick=()=>openFollowed(b.dataset.follow));
  main.querySelectorAll("[data-sp]").forEach(b=>b.onclick=()=>{const [d,i,st,type]=b.dataset.sp.split("|");withRecalc(()=>setSport(d,Number(i),st,type))});
  main.querySelectorAll("[data-spother]").forEach(b=>b.onclick=()=>document.getElementById("spOther").classList.toggle("hidden"));
  bindOpen();
}

/* ---------- Resumen del mes ---------- */
function reviewHTML(rv,compact){
  const mn=monthName(rv.m);
  let h=`<h3>Resumen de ${esc(mn)}</h3>
    <p>${rv.ok?`✅ Dentro del presupuesto: ${eur(rv.spent)} de ${eur(rv.budget)}.`:`⚠️ Te pasaste: ${eur(rv.spent)} de ${eur(rv.budget)} (${eur(rv.spent-rv.budget)} más).`}
    <span class="small muted">${rv.realComplete?"Con lo que apuntaste que pagaste.":rv.real?"Faltan tickets por apuntar: uso lo previsto.":"Con lo previsto (no apuntaste lo pagado)."}</span></p>`;
  if(!rv.ok&&rv.reasons.length)h+=`<p class="small"><b>Por qué:</b></p><ul class="small">${rv.reasons.map(r=>`<li>${esc(r.txt)}</li>`).join("")}</ul>`;
  h+=`<p class="small">${rv.protDays?`💪 Proteína: llegaste ${rv.protOk} de ${rv.protDays} días. `:""}${rv.planned?`🏃 Entrenos: ${rv.done} de ${rv.planned}. `:""}${rv.out+rv.other+rv.notCooked?`🍽️ ${rv.out} comidas fuera, ${rv.other} cambiadas por otra cosa y ${rv.notCooked} sin cocinar.`:""}</p>`;
  if(!rv.ok){
    const fixes=rv.reasons.filter(r=>r.fix);
    h+=`<p class="small"><b>Para el mes que viene:</b> un presupuesto realista sería <b>${eur(rv.proposal)}</b>${fixes.length?`, o mantener ${eur(rv.budget)} aplicando: ${fixes.map(f=>f.fixTxt.toLowerCase()).join(" y ")}`:""}.</p>
      <div class="actions"><button class="btn small" data-rvset="${rv.proposal}">Usar ${eur(rv.proposal)}</button>${fixes.length?`<button class="btn ghost small" data-rvfix="${rv.m}">Mantener y aplicar medidas</button>`:""}${compact?`<button class="btn ghost small" data-rvok="${rv.m}">Entendido</button>`:""}</div>`;
  }else if(compact)h+=`<div class="actions"><button class="btn ghost small" data-rvok="${rv.m}">Entendido</button></div>`;
  return h;
}
function bindReview(root){
  root.querySelectorAll("[data-rvset]").forEach(b=>b.onclick=()=>{S.home.budget.month=Number(b.dataset.rvset);S.home.budget.week=null;S.reviewed=S.reviewed||{};S.reviewed[prevMonth()]=true;save();render();toast("Presupuesto: "+eur(S.home.budget.month)+" al mes")});
  root.querySelectorAll("[data-rvfix]").forEach(b=>b.onclick=()=>{const rv=monthReview(b.dataset.rvfix);
    for(const r of rv.reasons){if(!r.fix)continue;if(r.fix.weekMode)S.home.shop.weekMode=r.fix.weekMode;if(r.fix.sacrifice){S.home.sacrifice=S.home.sacrifice||{};S.home.sacrifice[r.fix.sacrifice]=true}}
    S.reviewed=S.reviewed||{};S.reviewed[b.dataset.rvfix]=true;
    for(const s of Object.keys(S.plans))if(s>=weekStartFor(todayISO())&&!S.plans[s].confirmed)genWeekFromScratch(s);save();render();toast("Medidas aplicadas al menú")});
  root.querySelectorAll("[data-rvok]").forEach(b=>b.onclick=()=>{S.reviewed=S.reviewed||{};S.reviewed[b.dataset.rvok]=true;save();render()});
}
const prevMonth=()=>{const d=new Date();return iso(new Date(d.getFullYear(),d.getMonth()-1,1)).slice(0,7)};
// Los primeros 10 días del mes sale el resumen del anterior (si había menús)
function reviewCard(){
  const pm=prevMonth();if((S.reviewed||{})[pm]||new Date().getDate()>10)return "";
  if(!weeksInMonth(pm).some(s=>S.plans[s]))return "";
  return `<div class="rate" id="rvCard">${reviewHTML(monthReview(pm),true)}</div>`;
}

/* ---------- Ventanas ---------- */
// No se llega al presupuesto: elige qué sacrificar o sube el presupuesto a lo que realmente cuesta
// Cuánto se ahorraría esta semana repitiendo (se prueba sin guardar)
function repeatSaving(start,mode){
  // Media de varios menús con y sin repetir (el reparto tiene algo de azar)
  const keep=JSON.stringify(S.plans[start]),old=S.home.repeat;const avg=m=>{S.home.repeat=m;let t=0;for(let i=0;i<4;i++){try{genWeekFromScratch(start)}catch(e){}t+=weekCost(start)}return t/4};
  const base=avg("no"),con=avg(mode);
  S.plans[start]=JSON.parse(keep);S.home.repeat=old;return Math.max(0,Math.round((base-con)*10)/10);
}
function openSacrifice(start){
  const sc=S.home.sacrifice=S.home.sacrifice||{};
  const cost=weekCost(start),target=weekFoodTarget(start),m=monthOfWeek(start),wb=weekBudget(m),need=Math.ceil((wb+cost-target)/5)*5;
  showDialog(`<div class="mod">${closeBtn}<h2>¿Qué sacrificamos?</h2><p class="small muted">Faltan unos ${eur(cost-target)} esta semana. Elige lo que te parezca bien y vuelvo a preparar el menú.</p>
    ${Object.entries(SACRIFICES).map(([k,[t,d]])=>`<label class="alt" style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" data-sk="${k}" ${sc[k]?"checked":""} style="width:auto;margin-top:4px"><span><b>${t}</b><small>${d}</small></span></label>`).join("")}
    <div class="field"><label for="repSel">Repetir platos</label><select id="repSel">${Object.entries(REPEAT).map(([k,[t]])=>`<option value="${k}" ${(S.home.repeat||"no")===k?"selected":""}>${t}${k!=="no"?" (ahorra unos "+eur(repeatSaving(start,k))+" esta semana)":""}</option>`).join("")}</select></div>
    ${tarifa(S.home.shop.weekMode).envio?`<label class="alt" style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" id="toShop" style="width:auto;margin-top:4px"><span><b>Hacer la compra semanal en tienda y llevártela tú</b><small>Te ahorras ${eur(tarifa(S.home.shop.weekMode).envio)} de envío cada semana</small></span></label>`:""}
    <label class="alt" style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" id="raiseB" style="width:auto;margin-top:4px"><span><b>Subir el presupuesto semanal a ${eur(need)}</b><small>Ahora es ${eur(wb)}. Es lo que cuesta este menú sin sacrificar nada más.</small></span></label>
    <div class="actions"><button class="btn" id="sacOk">Rehacer el menú</button></div></div>`);
  dlg.querySelector("#sacOk").onclick=()=>{
    dlg.querySelectorAll("[data-sk]").forEach(c=>{if(c.checked)sc[c.dataset.sk]=true;else delete sc[c.dataset.sk]});
    if(dlg.querySelector("#raiseB").checked)S.home.budget.week=need;
    if(dlg.querySelector("#toShop")?.checked)S.home.shop.weekMode="tienda";
    S.home.repeat=dlg.querySelector("#repSel").value;
    for(const s of Object.keys(S.plans))if(s>=weekStartFor(todayISO())&&!S.plans[s].confirmed||s===start)genWeekFromScratch(s);
    save();dlg.close();render();
    const c2=weekCost(start),t2=weekFoodTarget(start);toast(c2<=t2+0.5?"Listo: "+eur(c2)+" de "+eur(t2):"Más cerca: "+eur(c2)+" de "+eur(t2)+". Puedes sacrificar algo más");
  };
}
function showDialog(html,full){dlg.className=full?"full":"";dlg.innerHTML=html;if(!dlg.open)dlg.showModal();dlg.querySelectorAll("[data-x]").forEach(b=>b.onclick=()=>dlg.close())}
const closeBtn=`<button class="close" aria-label="Cerrar" data-x>✕</button>`;

// Cambiar un día concreto: quién está y qué se hace en cada comida
function openDay(d){
  const o=S.days[d]=S.days[d]||{};
  const draw=()=>{
    const ks=others();
    showDialog(`<div class="mod">${closeBtn}<h2>${esc(longDate(d))}</h2>${isHoliday(d)?`<span class="pill carga">${esc(holidayName(d))}</span>`:""}
      ${ks.length?`<h3 style="margin-top:12px">¿Quién está?</h3><div class="chips">${ks.map(k=>chip("data-dk",k.id,peopleAt(d).includes(k),esc(personName(k)))).join("")}</div>`:""}
      ${adults().some(a=>a.trains)?`<h3 style="margin-top:12px">Entreno</h3>
        ${plannedSessions(d).map((s,i)=>{const r=(((S.sport||{})[d]||{}).res||{})[i];return `<div class="row small" style="margin:4px 0">${esc(SPORTS[s.type])} a las ${esc(sessTime(s))}${r?` · ${r.st==="no"?"no lo hiciste":r.st==="otro"?"hiciste "+esc(SPORTS[r.type].toLowerCase()):"hecho ✓"}`:""}<span class="spacer"></span><button class="btn ghost small" data-dsx="${i}">${r&&r.st==="no"?"Sí lo hago":"No lo hago"}</button></div>`}).join("")}
        ${(((S.sport||{})[d]||{}).extra||[]).map((s,i)=>`<div class="row small" style="margin:4px 0">${esc(SPORTS[s.type])} a las ${esc(s.time)} (añadido)<span class="spacer"></span><button class="btn ghost small" data-dse="${i}">Quitar</button></div>`).join("")}
        <div class="row" style="margin-top:6px"><select id="dsT" style="flex:1">${Object.entries(SPORTS).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select><input type="time" id="dsH" value="19:00" style="width:auto"><button class="btn small" data-dsa>Añadir</button></div>`:""}
      ${["comida","cena"].map(m=>`<h3 style="margin-top:12px">${m==="comida"?"Comida":"Cena"}</h3><div class="chips">${(m==="comida"?["taper","cocinar","fuera","libre"]:["cocinar","solotaper","fuera","libre"]).map(v=>chip("data-dm",m+":"+v,mealState(d,m)===v,v==="solotaper"?"Solo el táper":MEALSTATE[v])).join("")}</div>`).join("")}
      <div class="actions"><button class="btn ghost" data-reset>Como la semana tipo</button><button class="btn" data-x>Hecho</button></div></div>`);
    dlg.querySelectorAll("[data-dk]").forEach(b=>b.onclick=()=>{const id=b.dataset.dk;o.kids=o.kids||{};o.kids[id]=!peopleAt(d).some(k=>k.id===id);after()});
    dlg.querySelectorAll("[data-dm]").forEach(b=>b.onclick=()=>{const [m,v]=b.dataset.dm.split(":");changeMeal(d,m,v,draw)});
    dlg.querySelector("[data-reset]").onclick=()=>{delete S.days[d];after();dlg.close()};
    const sp=()=>{S.sport=S.sport||{};return S.sport[d]=S.sport[d]||{}};
    dlg.querySelectorAll("[data-dsx]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.dsx),x=sp();x.res=x.res||{};
      withRecalc(()=>{if(x.res[i]&&x.res[i].st==="no")delete x.res[i];else x.res[i]={st:"no"}});if(!dlg.open||dlg.querySelector("[data-dsa]"))draw()});
    dlg.querySelectorAll("[data-dse]").forEach(b=>b.onclick=()=>{const x=sp();withRecalc(()=>x.extra.splice(Number(b.dataset.dse),1));if(!dlg.open||dlg.querySelector("[data-dsa]"))draw()});
    dlg.querySelector("[data-dsa]")?.addEventListener("click",()=>{const x=sp();withRecalc(()=>(x.extra=x.extra||[]).push({type:dlg.querySelector("#dsT").value,time:dlg.querySelector("#dsH").value||"19:00"}));if(!dlg.open||dlg.querySelector("[data-dsa]"))draw()});
  };
  const after=()=>{save();ensureWeek(weekStartFor(d));save();draw();render()};
  draw();
}
// Si dejas de cocinar una cena que tenía plato, pregunta qué hacer con él
function changeMeal(d,m,v,redraw){
  const start=weekStartFor(d), wk=S.plans[start], sid=d+"|"+m, had=wk&&wk.slots[sid]&&RX[wk.slots[sid].recipe];
  const apply=()=>{S.days[d]=S.days[d]||{};S.days[d][m]=v;save();ensureWeek(start);save();render();redraw&&redraw()};
  if(had&&(v==="fuera"||v==="libre")){
    const nextT=m==="cena"&&mealState(addDays(d,1),"comida")==="taper";
    showDialog(`<div class="mod">${closeBtn}<h2>¿Qué hacemos con ${esc(had.name.toLowerCase())}?</h2>
      ${nextT?`<button class="alt" data-c="tap"><b>Cocino solo el táper de mañana</b><small>Una ración para la comida del ${DAYS[dow(addDays(d,1))].toLowerCase()}</small></button>`:""}
      <button class="alt" data-c="shift"><b>Pásalo al siguiente día</b><small>Los demás platos se mueven un día; el último de la semana se quita</small></button>
      <button class="alt" data-c="drop"><b>No lo cocino</b><small>${had.ing.some(([p])=>P[p].thaw)?"La carne o el pescado se quedan en el congelador para otro día":"Se quita del menú y de la compra"}</small></button></div>`);
    dlg.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{const c=b.dataset.c;
      if(c==="tap"){v="solotaper"}
      if(c==="shift"){shiftForward(start,sid)}
      if(c==="drop"){delete wk.slots[sid]}
      apply();if(c!=="tap"&&nextT)toast("Ojo: mañana no tendrás táper");});
    return;
  }
  apply();
}
function openSwap(sid){
  const d=sid.slice(0,10), sl=slotFor(d,sid.slice(11));if(!sl)return;
  const alts=alternatives(sl,8);
  const sel=R.filter(r=>variantFor(r)&&!r.small&&!unsafeFor(slotPeople(sl),r).length).sort((a,b)=>a.name.localeCompare(b.name));
  showDialog(`<div class="mod">${closeBtn}<h2>Cambiar plato</h2><div class="small muted">${esc(longDate(d))}, ${sl.meal}${company(sl).length?" · con "+esc(company(sl).map(personName).join(" y ")):""}</div>
    ${needLine(sl)}
    <div style="margin-top:10px">${alts.map(({r,miss})=>`<button class="alt altimg" data-pick="${r.id}">${dishImg(r,"s")}<span><b>${esc(r.name)}</b><small>${recipeTime(r)} min · ${r.prot||"?"} g proteína · ${eur(rationCost(r))}/ración · ${r.type==="c"?"⚡ hidratos":"🥗 ligera"}</small>
      ${miss?(miss.length?`<span class="badge miss">Te falta: ${esc(miss.slice(0,3).map(p=>P[p].name.toLowerCase()).join(", "))}${miss.length>3?"…":""}</span>`:`<span class="badge ok">Tienes todo</span>`):""}</span></button>`).join("")||"<p>No hay alternativas con tus filtros.</p>"}</div>
    ${(()=>{const cs=candidates(sl,{cap:true}).filter(r=>r.cap);return cs.length?`<details class="more" style="margin-top:10px"><summary>🍔 Mejor un capricho</summary>${cs.map(r=>`<button class="alt altimg" data-pick="${r.id}">${dishImg(r,"s")}<span><b>${esc(r.name)}</b><small>${recipeTime(r)} min · ${eur(rationCost(r))}/ración · no cuenta para tus objetivos</small></span></button>`).join("")}</details>`:""})()}
    <div class="field"><label for="anyR">O elige cualquier receta</label><select id="anyR"><option value="">…</option>${sel.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join("")}</select></div></div>`);
  const pick=rid=>{setSlotRecipe(sl,rid);dlg.close();render();
    const inv=inventory(monthOfWeek(weekStartFor(d)),sl.id);const miss=inv?missingFor(RX[rid],sl,inv):[];
    toast(miss.length?"Cambiado. Añadido a la lista: "+miss.map(p=>P[p].name.toLowerCase()).join(", "):"Cambiado por "+RX[rid].name)};
  dlg.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>pick(b.dataset.pick));
  dlg.querySelector("#anyR").onchange=e=>{if(e.target.value)pick(e.target.value)};
}
function openDislike(rid,who,sid){
  const r=RX[rid], p=S.people.find(x=>x.id===who);
  showDialog(`<div class="mod">${closeBtn}<h2>¿Por qué no ${isMe(p)?"te":"le"} gustó?</h2><div class="small muted">${esc(r.name)} · ${esc(personName(p))}</div>
    <div style="margin-top:10px">${Object.entries(REASONS).map(([k,t])=>`<label class="row" style="margin:8px 0"><input type="radio" name="why" value="${k}" style="width:auto"> ${t}</label>`).join("")}</div>
    <div class="field" id="whyIng" hidden><label>¿Cuál?</label><select id="whyIngSel">${r.ing.map(([pid])=>`<option value="${pid}">${esc(P[pid].name)}</option>`).join("")}</select></div>
    <div class="field" id="whyTxt" hidden><label>Cuéntame</label><input type="text" id="whyTxtIn"></div>
    <label class="row small"><input type="checkbox" id="never" checked style="width:auto"> No volver a proponerlo</label>
    <div class="actions"><button class="btn" id="whyOk">Guardar</button></div></div>`);
  dlg.querySelectorAll("[name=why]").forEach(i=>i.onchange=()=>{dlg.querySelector("#whyIng").hidden=i.value!=="ingrediente";dlg.querySelector("#whyTxt").hidden=i.value!=="otro"});
  dlg.querySelector("#whyOk").onclick=()=>{
    const t=(dlg.querySelector("[name=why]:checked")||{}).value||"otro";
    const reason={type:t};if(t==="ingrediente")reason.ing=dlg.querySelector("#whyIngSel").value;if(t==="otro")reason.text=dlg.querySelector("#whyTxtIn").value.trim();
    addRating({slot:sid||null,rid,who,v:-1,reason});
    const txt=t==="ingrediente"?"No le gusta: "+P[reason.ing].name.toLowerCase():t==="otro"?(reason.text||"Otro motivo"):REASONS[t];
    if(dlg.querySelector("#never").checked)setDish(p,rid,-1,txt);
    dlg.close();render();toast("Apuntado. No lo propondré"+(dlg.querySelector("#never")?.checked===false?" tan a menudo":""));
  };
}
function bindOpen(){main.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>openRecipe(b.dataset.open,b.dataset.slot))}
let recTab="ing";
function openRecipe(id,sid){
  const r=RX[id];let serv=2;let vi=Math.max(0,r.vars.indexOf(variantFor(r)));
  const sl=sid?slotFor(sid.slice(0,10),sid.slice(11)):null;if(sl)serv=sl.portions;
  const draw=()=>{
    const v=r.vars[vi], ok=new Set([...S.home.apps,"ninguno"]);
    const cost=rationCost(r);
    const fav=dishPref(me(),r.id)>=1.5;
    const tags=[recipeDiet(r)==="vegano"?"🌱 Vegano":recipeDiet(r)==="vege"?"🥚 Vegetariano":null,v.time<=25?"⚡ Rápido":null,(r.prot||0)>=30?"💪 Alto en proteína":null,r.type==="l"?"🥗 Ligera":"🍝 Con hidratos",r.kid?"🧒 Gusta a niños":null,r.freeze?"❄️ Se congela":null].filter(Boolean);
    const bar=(lab,val,max,cls)=>`<div class="mbar"><span>${lab}</span><div><i class="${cls}" style="width:${Math.min(100,Math.round((val||0)/max*100))}%"></i></div><b>${val!=null?val+" g":"–"}</b></div>`;
    showDialog(`<div class="mod recipe">
      <div class="rhero">${dishImg(r,"l")}<button class="rbtn rclose" data-x aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="rright"><button class="rbtn ${fav?"on":""}" data-love aria-label="Me encanta"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button><span class="rprice">${eur(cost)}<small>/ración</small></span></div></div>
      ${photoCredit(r)}
      <div class="rtags">${tags.map(t=>`<span>${t}</span>`).join("")}</div>
      <h2 class="rtitle">${esc(r.name)}</h2>
      ${(()=>{const bad=S.people.filter(p=>!canEat(p,r));return bad.length?`<div class="warnbox" style="margin:6px 0">⛔ <b>No apto para ${bad.map(p=>esc(isMe(p)?"ti":personName(p))).join(" ni ")}</b>: ${bad.map(p=>esc(whyCant(p,r))).filter((x,i,a)=>a.indexOf(x)===i).join(", ")}. No lo pondré en un día en que coma.</div>`:""})()}
      ${recipeAllergens(r).length?`<div class="chips" style="margin:2px 0 4px">${recipeAllergens(r).map(a=>`<span class="pill carga">⚠️ ${esc(ALLERGENS[a].split(" (")[0])}</span>`).join("")}</div>`:`<div class="small muted">Sin alérgenos principales</div>`}${r.sug?`<div class="small muted">💡 ${r.author?"Sugerida por "+esc(r.author):"Sugerida por la comunidad"}</div>`:""}
      <div class="scards">
        <div><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg><span class="sv"><button data-s="-0.5" aria-label="Menos raciones">−</button><b>${String(serv).replace(".",",")}</b><button data-s="0.5" aria-label="Más raciones">+</button></span><small>Raciones</small></div>
        <div><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg><b>${v.time} min</b><small>${v.active} min de trabajo</small></div>
        <div><svg viewBox="0 0 24 24"><path d="M12 3c2 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 3s1-4 1-7z"/></svg><b>${r.kcal||"–"}</b><small>kcal/ración</small></div>
      </div>
      ${r.prot!=null?`<div class="macros">${bar("Proteína",r.prot,60,"p")}${bar("Hidratos",r.carb,110,"c")}${bar("Grasas",r.fat,45,"f")}</div>`:""}
      ${r.fridge?`<p class="small muted" style="margin:6px 2px">Aguanta ${r.fridge} días en la nevera${r.freeze?" · se puede congelar":""}.</p>`:""}
      ${sl?`<div class="nutr" style="margin-top:6px">${(sl.eaters.length?sl.eaters:sl.tupper).concat(sl.kids).map(p=>`<div>${isMe(p)?"Tu plato":esc(personName(p))}: ${nutrTxt(portionNutr(r,factorOf(p)))}</div>`).join("")}</div>`:""}
      ${r.vars.length>1?`<div class="vtabs">${r.vars.map((x,i)=>`<button class="chip" data-vi="${i}" aria-pressed="${i===vi}" ${ok.has(x.app)?"":"disabled"}>${APP[x.app]}</button>`).join("")}</div>`:""}
      <div class="segtab" role="tablist"><button role="tab" data-rt="ing" aria-selected="${recTab==="ing"}">Ingredientes</button><button role="tab" data-rt="prep" aria-selected="${recTab==="prep"}">Preparación</button></div>
      ${recTab==="ing"?`<table class="ingt">${r.ing.map(([p,q])=>`<tr><td>${prodImg(p)}${esc(P[p].name)}</td><td>${fmtQty(q*serv,P[p].unit)}</td></tr>`).join("")}<tr><td><span class="pimg ph">🧂</span>Aceite, sal y especias</td><td>al gusto</td></tr></table>${choiceBox(r)}`
      :`${v.tools&&v.tools.length?`<div class="needs"><b>Necesitas</b><div class="tools">${v.tools.map(t=>`<span>${toolIco(t)} ${esc(t)}</span>`).join("")}</div></div>`:""}
        <button class="cookrow" data-cook><span class="play"><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg></span><b>Cocinar paso a paso</b><svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
        <ol class="rsteps">${v.steps.map((s,i)=>{const tg=stepTags((v.info||[])[i]);return `<li>${esc(s)}${tg.length?`<div class="stags">${tg.map(x=>`<span>${esc(x)}</span>`).join("")}</div>`:""}</li>`}).join("")}</ol>`}
      <div class="row" style="margin-top:8px"><button class="btn small" id="rShare">📤 Compartir</button><label class="btn ghost small">📷 ${MYPHOTOS[r.id]?"Cambiar mi foto":"Foto de mi plato"}<input type="file" accept="image/*" capture="environment" id="myPh" hidden></label>${MYPHOTOS[r.id]?`<button class="btn ghost small" id="myPhDel">Quitar mi foto</button>`:""}</div>
      <div class="actions"><select id="rWho" style="width:auto">${S.people.map(p=>`<option value="${p.id}">${esc(personName(p))}</option>`).join("")}</select>
        <button class="btn ghost small" data-love2>❤️ Me encanta</button><button class="btn ghost small" data-hate>👎 No me gusta</button></div>
      <h3 style="margin-top:10px">Más como esta</h3><div>${similar(r).map(x=>`<button class="alt" data-sim="${x.id}"><b>${esc(x.name)}</b><small>${recipeTime(x)} min · ${x.prot||"?"} g proteína</small></button>`).join("")}</div></div>`);
    dlg.querySelectorAll("[data-vi]").forEach(b=>b.onclick=()=>{vi=Number(b.dataset.vi);draw()});
    dlg.querySelector("#myPh").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{await saveMyPhoto(r.id,f);draw();render();toast("¡Qué buena pinta! Foto guardada")}catch(x){toast("No se ha podido guardar la foto")}};
    dlg.querySelector("#myPhDel")?.addEventListener("click",async()=>{await deleteMyPhoto(r.id);draw();render()});
    dlg.querySelector("#rShare").onclick=()=>shareRecipe(r,r.vars[vi],serv);
    dlg.querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>{serv=Math.max(0.5,serv+Number(b.dataset.s));draw()});
    dlg.querySelector("[data-cook]")?.addEventListener("click",()=>openCook(r,r.vars[vi],serv));
    dlg.querySelectorAll("[data-choice]").forEach(x=>x.onchange=()=>{const [pid,g]=x.dataset.choice.split("|"),p=S.people.find(y=>y.id===pid);p.choices={...(p.choices||{}),[g]:x.value};save();toast("Apuntado para "+(isMe(p)?"ti":personName(p)))});
    dlg.querySelectorAll("[data-rt]").forEach(b=>b.onclick=()=>{recTab=b.dataset.rt;const y=dlg.scrollTop;draw();dlg.scrollTop=y});
    const who=()=>S.people.find(p=>p.id===dlg.querySelector("#rWho").value);
    dlg.querySelector("[data-love]").onclick=()=>{if(fav){setDish(me(),r.id,null);toast("Quitado de favoritos")}else{setDish(me(),r.id,2,"Lo marcaste como favorito");toast("❤️ Guardado en tus favoritos")}draw()};
    dlg.querySelector("[data-love2]").onclick=()=>{setDish(who(),r.id,2,"Lo marcaste como favorito");toast("❤️ Apuntado para "+personName(who()))};
    dlg.querySelector("[data-hate]").onclick=()=>openDislike(r.id,who().id,null);
    dlg.querySelectorAll("[data-sim]").forEach(b=>b.onclick=()=>openRecipe(b.dataset.sim));
  };
  draw();
}
// Lo que cada persona elige a su gusto (la pizza de cada uno): sale en la compra, una para cada uno
function choiceBox(r){
  const ch=r.ing.find(([p])=>P[p].choice);if(!ch)return "";
  const g=P[ch[0]].choice,opts=Object.values(P).filter(x=>x.choice===g).sort((a,b)=>a.name.localeCompare(b.name));
  return `<div class="needs" style="margin-top:10px"><b>${g==="pizza"?"🍕 La pizza de cada uno":"La de cada uno"}</b>
    ${S.people.map(p=>`<div class="row" style="margin:6px 0"><span style="flex:1">${esc(isMe(p)?"Tú":personName(p))}</span><select data-choice="${esc(p.id)}|${esc(g)}" style="width:auto;max-width:62%">${opts.map(o=>`<option value="${o.id}" ${((p.choices||{})[g]||ch[0])===o.id?"selected":""}>${esc(o.name)}</option>`).join("")}</select></div>`).join("")}
    <div class="hint">En la lista de la compra pongo la de cada uno para cada día que toque.</div></div>`;
}
// Recetas parecidas: misma proteína principal o ingredientes compartidos
function similar(r){
  const ids=new Set(r.ing.map(([p])=>p));
  return R.filter(x=>x.id!==r.id&&variantFor(x)).map(x=>({x,s:(x.main===r.main?2:0)+x.ing.filter(([p])=>ids.has(p)).length+(x.type===r.type?0.5:0)}))
    .sort((a,b)=>b.s-a.s).slice(0,4).map(o=>o.x);
}

/* ---------- Modo cocina ---------- */
let wakeLock=null, cookTimer=null;
async function openCook(r,v,serv){
  let i=0;
  try{wakeLock=await navigator.wakeLock?.request("screen")}catch(e){}
  const draw=()=>{
    const step=v.steps[i], x=(v.info||[])[i], mm=step.match(/(\d+)(?:\s*[–-]\s*(\d+))?\s*min/), m=x&&x.min?[null,String(x.min)]:mm;
    showDialog(`<div class="cook"><div class="top"><span class="n">Paso ${i+1} de ${v.steps.length} · ${esc(r.name)}</span><button class="close" data-x aria-label="Salir">✕</button></div>
      ${i===0&&v.tools&&v.tools.length?`<div class="needs big"><b>Saca esto</b><div class="tools">${v.tools.map(t=>`<span>${toolIco(t)} ${esc(t)}</span>`).join("")}</div></div>`:""}
      <div class="txt">${esc(step)}</div>
      ${stepTags(x).length?`<div class="stags big">${stepTags(x).map(t=>`<span>${esc(t)}</span>`).join("")}</div>`:""}
      ${i===0?`<div class="small muted">Para ${String(serv).replace(".",",")} raciones: ${r.ing.map(([p,q])=>esc(P[p].name.toLowerCase())+" "+fmtQty(q*serv,P[p].unit)).join(", ")}</div>`:""}
      ${m?`<div class="timer" id="tmr">${m[2]||m[1]}:00</div><button class="btn ghost wide" id="tmrBtn">⏱ Temporizador de ${m[2]||m[1]} min</button>`:""}
      <div class="bot" style="margin-top:14px"><button class="btn ghost" data-prev ${i===0?"disabled":""}>Anterior</button><button class="btn" data-next>${i===v.steps.length-1?"¡Terminado!":"Siguiente"}</button></div></div>`,true);
    dlg.querySelector("[data-prev]").onclick=()=>{i--;draw()};
    dlg.querySelector("[data-next]").onclick=()=>{if(i<v.steps.length-1){i++;draw()}else{dlg.close();toast("¡Que aproveche!")}};
    const tb=dlg.querySelector("#tmrBtn");if(tb)tb.onclick=()=>startTimer(Number(m[2]||m[1])*60);
  };
  dlg.addEventListener("close",()=>{clearInterval(cookTimer);try{wakeLock&&wakeLock.release()}catch(e){};wakeLock=null},{once:true});
  draw();
}
// Modo cocina de una sesión: todos los platos en una sola lista de pasos
async function openBatchCook(cd,items){
  const plan=batchPlan(items).steps;let i=0;
  try{wakeLock=await navigator.wakeLock?.request("screen")}catch(e){}
  const draw=()=>{
    const p=plan[i],r=p.o.r;
    let body;
    if(p.tupper){const sp=tupperSplit(p.o.sl),k=keepPlan(r,p.o.sl);
      body=`<div class="txt">${esc(r.name)} está listo. Repártelo en ${sp.length} ${sp.length===1?"táper":"tápers"}${k.freeze?" y llévalo al congelador cuando se enfríe":" y, cuando se enfríe, a la nevera"}:</div>
        <div class="tsplit">${sp.map(t=>`<div class="tsp"><span>🥡 ${esc(t.when)}</span><span>${String(t.rac).replace(".",",")} rac. · ${esc(t.who.join(", "))}</span></div>`).join("")}</div>`}
    else{const tg=stepTags(p.info);
      body=`<div class="txt">${esc(p.text)}</div>${tg.length?`<div class="stags big">${tg.map(t=>`<span>${esc(t)}</span>`).join("")}</div>`:""}
        ${p.passive?`<div class="okbox small">Esto se hace solo: pon el temporizador y sigue con el siguiente paso.</div>`:""}
        ${p.info&&p.info.min?`<div class="timer" id="tmr">${p.info.min}:00</div><button class="btn ghost wide" id="tmrBtn">⏱ Temporizador de ${p.info.min} min</button>`:""}`}
    showDialog(`<div class="cook"><div class="top"><span class="n">Paso ${i+1} de ${plan.length} · minuto ${p.at}</span><button class="close" data-x aria-label="Salir">✕</button></div>
      <div class="bcdish">${dishImg(r,"s")}<b>${esc(r.name)}</b></div>
      ${i===0?`<div class="needs big"><b>Saca esto</b><div class="tools">${[...new Set(items.flatMap(o=>o.v.tools||[]))].map(t=>`<span>${toolIco(t)} ${esc(t)}</span>`).join("")}</div></div>`:""}
      ${body}
      <div class="bot" style="margin-top:14px"><button class="btn ghost" data-prev ${i===0?"disabled":""}>Anterior</button><button class="btn" data-next>${i===plan.length-1?"¡Terminado!":"Siguiente"}</button></div></div>`,true);
    dlg.querySelector("[data-prev]").onclick=()=>{i--;draw()};
    dlg.querySelector("[data-next]").onclick=()=>{if(i<plan.length-1){i++;draw()}else{dlg.close();toast("¡Sesión terminada! Tápers listos")}};
    const tb=dlg.querySelector("#tmrBtn");if(tb)tb.onclick=()=>startTimer(Number(p.info.min)*60);
  };
  dlg.addEventListener("close",()=>{try{wakeLock&&wakeLock.release()}catch(e){};wakeLock=null},{once:true});
  draw();
}
function startTimer(sec){
  clearInterval(cookTimer);const end=Date.now()+sec*1000;
  cookTimer=setInterval(()=>{const left=Math.max(0,Math.round((end-Date.now())/1000));const el=document.getElementById("tmr");
    if(el)el.textContent=Math.floor(left/60)+":"+String(left%60).padStart(2,"0");
    if(!left){clearInterval(cookTimer);try{navigator.vibrate&&navigator.vibrate([400,200,400,200,400])}catch(e){}
      try{const ac=new AudioContext(),o=ac.createOscillator();o.frequency.value=880;o.connect(ac.destination);o.start();o.stop(ac.currentTime+1.2)}catch(e){}
      toast("⏱ ¡Tiempo!")}},500);
}

/* ---------- Sesión de cocina (por lotes) ---------- */
function openSession(cd){
  const start=weekStartFor(cd), out=[];
  for(const s of [addDays(start,-7),start,addDays(start,7)]){const wk=S.plans[s];if(!wk)continue;
    for(const sl of buildSlots(s)){const v=wk.slots[sl.id],r=v&&RX[v.recipe];if(r&&cookDayFor(sl.date)===cd)out.push({sl,r,v:variantFor(r),k:keepPlan(r,sl)})}}
  const order={horno:0,air:1,vitro:2,micro:3,ninguno:4};
  out.sort((a,b)=>order[a.v.app]-order[b.v.app]||b.v.time-a.v.time);
  const active=out.reduce((t,o)=>t+o.v.active,0), longest=Math.max(0,...out.map(o=>o.v.time));
  const cv=batchCovers(cd), nTp=out.reduce((t,o)=>t+tupperSplit(o.sl).length,0);
  showDialog(`<div class="mod">${closeBtn}<div class="veb">Sesión de cocina</div><h2 class="vh" style="font-size:1.8rem">${esc(longDate(cd))}</h2>
    <div class="okbox"><b>Cocinas para ${cv.days} ${cv.days===1?"día":"días"}</b>: del ${esc(DAYS[dow(cv.from)].toLowerCase())} al ${esc(DAYS[dow(cv.to)].toLowerCase())}. ${out.length} platos repartidos en ${nTp} tápers.</div>
    <p class="small muted">Unos ${Math.max(active,longest)} min si vas encadenando. Empieza por el horno y, mientras, ve con la vitro. Pon una etiqueta a cada táper con el día.</p>
    ${out.length?`<button class="cookrow" id="cookAll"><span class="play"><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg></span><b>Cocinar todo paso a paso</b><small class="muted" style="margin-left:auto">unos ${batchPlan(out).total} min</small></button>`:""}
    ${out.map((o,i)=>`<div class="session sesscard">${dishImg(o.r,"s")}<div class="sessin"><b>${i+1}. ${esc(o.r.name)}</b><div class="small muted">${APP[o.v.app]} · ${o.v.time} min (${o.v.active} de trabajo) · ${String(o.sl.portions).replace(".",",")} raciones</div>
      <div class="tsplit"><b>Repártelo en ${tupperSplit(o.sl).length} ${tupperSplit(o.sl).length===1?"táper":"tápers"}${o.k.freeze?" · ❄️ al congelador":""}</b>
        ${tupperSplit(o.sl).map(t=>`<div class="tsp"><span>🥡 ${esc(t.when)}</span><span>${String(t.rac).replace(".",",")} rac. · ${esc(t.who.join(", "))}</span></div>`).join("")}</div>
      <button class="btn ghost small" data-open2="${o.r.id}" data-sl="${o.sl.id}">Ver receta</button></div></div>`).join("")}</div>`);
  document.getElementById("cookAll")?.addEventListener("click",()=>openBatchCook(cd,out));
  dlg.querySelectorAll("[data-open2]").forEach(b=>b.onclick=()=>openRecipe(b.dataset.open2,b.dataset.sl));
}

/* ---------- Planificar la semana ---------- */
function openWeekPlanner(start){
  let step=0;
  const wk=S.plans[start]=S.plans[start]||{start,slots:{},training:null,confirmed:false};
  if(!wk.training){wk.training={};for(const d of weekDates(start))wk.training[d]=JSON.parse(JSON.stringify(plannedSessions(d)))}
  const a=me(), sports=a&&a.sports.length?a.sports:Object.keys(SPORTS);
  const draw=()=>{
    let h=`<div class="mod">${closeBtn}<div class="small muted">Semana del ${shortDate(start)} · paso ${step+1} de 4</div>`;
    if(step===0){
      h+=`<h2>¿Cómo entrenas esta semana?</h2><p class="small muted">Viene rellena con tu semana habitual.</p>`;
      for(const d of weekDates(start)){const ss=wk.training[d]||[];
        h+=`<div class="daycard"><div class="row"><b>${DSHORT[dow(d)]} ${shortDate(d)}</b><span class="spacer"></span>${ss.length<2?`<button class="btn ghost small" data-as="${d}">+ Sesión</button>`:""}</div>
        ${ss.map((s,i)=>`<div class="sess"><input type="time" data-tw="${d}|${i}" value="${esc(sessTime(s))}" style="width:auto" aria-label="Hora">
        <select data-tt="${d}|${i}">${sports.map(k=>`<option value="${k}" ${s.type===k?"selected":""}>${SPORTS[k]}</option>`).join("")}</select><button class="btn ghost small" data-ds="${d}|${i}">✕</button></div>`).join("")}</div>`}
    }
    if(step===1){
      h+=`<h2>¿Quién está y qué cambia?</h2><p class="small muted">Toca para cambiar cualquier comida: si comes fuera, tienes un plan o están los niños.</p>`;
      for(const d of weekDates(start)){const ks=peopleAt(d);
        h+=`<div class="daycard"><div class="row"><b>${DSHORT[dow(d)]} ${shortDate(d)}</b>${isHoliday(d)?`<span class="pill carga">${esc(holidayName(d))}</span>`:""}</div>
        ${others().length?`<div class="chips" style="margin-top:6px">${others().map(k=>chip("data-wk",d+"|"+k.id,ks.includes(k),esc(personName(k)))).join("")}</div>`:""}
        <div class="row small" style="margin-top:6px">Comida: <select data-wm="${d}|comida" style="width:auto">${["taper","cocinar","fuera","libre"].map(v=>`<option value="${v}" ${mealState(d,"comida")===v?"selected":""}>${MEALSTATE[v]}</option>`).join("")}</select>
        Cena: <select data-wm="${d}|cena" style="width:auto">${["cocinar","solotaper","fuera","libre"].map(v=>`<option value="${v}" ${mealState(d,"cena")===v?"selected":""}>${v==="solotaper"?"Solo táper":MEALSTATE[v]}</option>`).join("")}</select></div></div>`}
    }
    if(step===2){
      ensureWeek(start);save();
      h+=`<h2>Los platos</h2><p class="small muted">Toca una alternativa para cambiarlo.</p><button class="btn ghost small" data-rg>Proponer otros platos</button>`;
      for(const sl of buildSlots(start)){const v=wk.slots[sl.id],r=v&&RX[v.recipe];
        h+=`<div class="daycard"><div class="small muted">${DSHORT[dow(sl.date)]} ${shortDate(sl.date)} · ${sl.meal}${company(sl).length?" · con "+esc(company(sl).map(personName).join(" y ")):""}</div>
        <b>${r?esc(r.name):esc(sl.fixed?sl.fixed.name:"—")}</b>${needLine(sl)}
        ${r&&!sl.fixed?`<div class="chips" style="margin-top:6px">${alternatives(sl,3).map(({r:x})=>`<button class="chip" data-alt="${sl.id}|${x.id}">${esc(x.name)}</button>`).join("")}</div>`:""}</div>`}
    }
    if(step===3){
      const m=monthOfWeek(start), sh=shopping(m), wi=sh.weeks.indexOf(start), l=sh.lists[wi], wb=weekBudget(m);
      h+=`<h2>La compra</h2>`;
      if(wi===0)h+=`<p>Compra del mes: <b>${eur(sh.lists.mes.cost+sh.lists.mes.fee)}</b> (${SHOP_MODES[sh.lists.mes.mode].toLowerCase()})</p>`;
      h+=`<p>Compra de esta semana: <b>${eur(l?l.cost+l.fee:0)}</b> (${l?SHOP_MODES[l.mode].toLowerCase():""})</p>
        <p>Previsto esta semana: <b>${eur(sh.perWeek[wi]||0)}</b> de ${eur(wb)} de presupuesto semanal.</p>
        ${(sh.perWeek[wi]||0)>wb?`<div class="warnbox">Te pasas ${eur((sh.perWeek[wi]||0)-wb)}. Vuelve al paso anterior y elige platos más baratos, o revisa el presupuesto.</div>`:`<div class="okbox">Dentro del presupuesto.</div>`}
        ${l&&l.belowMin?`<div class="warnbox">El pedido no llega al mínimo de ${eur(l.min)}. En la pestaña Compra puedes completarlo con cosas del mes.</div>`:""}`;
    }
    h+=`<div class="actions">${step>0?`<button class="btn ghost" data-pb>Atrás</button>`:""}<button class="btn" data-pn>${step===3?"Confirmar la semana":"Siguiente"}</button></div></div>`;
    showDialog(h);
    const q=s=>dlg.querySelectorAll(s);
    q("[data-as]").forEach(b=>b.onclick=()=>{const d=b.dataset.as;(wk.training[d]=wk.training[d]||[]).push({time:"19:00",type:sports[0]});save();draw()});
    q("[data-ds]").forEach(b=>b.onclick=()=>{const [d,i]=b.dataset.ds.split("|");wk.training[d].splice(Number(i),1);save();draw()});
    q("[data-tw]").forEach(s=>s.onchange=()=>{const [d,i]=s.dataset.tw.split("|");wk.training[d][i].time=s.value;delete wk.training[d][i].when;save()});
    q("[data-tt]").forEach(s=>s.onchange=()=>{const [d,i]=s.dataset.tt.split("|");wk.training[d][i].type=s.value;save()});
    q("[data-wk]").forEach(b=>b.onclick=()=>{const [d,id]=b.dataset.wk.split("|");const o=S.days[d]=S.days[d]||{};o.kids=o.kids||{};o.kids[id]=!peopleAt(d).some(k=>k.id===id);save();draw()});
    q("[data-wm]").forEach(s=>s.onchange=()=>{const [d,m]=s.dataset.wm.split("|");S.days[d]=S.days[d]||{};S.days[d][m]=s.value;save()});
    q("[data-rg]").forEach(b=>b.onclick=()=>{genWeekFromScratch(start);save();draw()});
    q("[data-alt]").forEach(b=>b.onclick=()=>{const [sid,rid]=[b.dataset.alt.slice(0,b.dataset.alt.lastIndexOf("|")),b.dataset.alt.slice(b.dataset.alt.lastIndexOf("|")+1)];
      const sl=slotFor(sid.slice(0,10),sid.slice(11));setSlotRecipe(sl,rid);draw()});
    q("[data-pb]").forEach(b=>b.onclick=()=>{step--;draw()});
    q("[data-pn]").forEach(b=>b.onclick=()=>{if(step<3){step++;draw()}else{wk.confirmed=true;save();dlg.close();render();toast("Semana planificada")}});
  };
  draw();dlg.addEventListener("close",()=>render(),{once:true});
}

/* ---------- Compra ---------- */
// Pedido guardado: la próxima vez solo hay que repetirlo en Mercadona y cambiar lo que difiere
function orderBlock(l,kind){
  S.orders=S.orders||{};
  const now={};for(const it of l.items)now[it.pid]=it.packs;
  const b=S.orders[kind], name=kind==="mes"?"pedido del mes":"pedido semanal";
  if(!b)return `<div class="guide"><h3>Guarda tu ${name}</h3><p>Hazlo una vez en Mercadona y guárdalo aquí. Las próximas veces repites ese pedido desde "Mis pedidos" de Mercadona y la app te dice solo lo que tienes que cambiar.</p><button class="btn small" data-saveorder="${kind}">Guardar como mi ${name}</button></div>`;
  const add=[],del=[],chg=[];
  for(const [pid,n] of Object.entries(now)){const o=b.items[pid]||0;if(!o)add.push([pid,n]);else if(o!==n)chg.push([pid,o,n])}
  for(const [pid,o] of Object.entries(b.items))if(!now[pid]&&P[pid])del.push([pid,o]);
  const when=longDate(b.savedAt).replace(/^\w+, /,"");
  if(!add.length&&!del.length&&!chg.length)return `<div class="okbox"><b>Igual que tu ${name}</b> del ${esc(when)}. Repítelo tal cual desde "Mis pedidos" en Mercadona.</div>`;
  let h=`<div class="guide"><h3>Repite tu ${name} y cambia esto</h3><p>Abre en Mercadona el pedido del ${esc(when)}, pásalo al carro y haz solo estos ${add.length+del.length+chg.length} cambios:</p><ul>`;
  for(const [pid,n] of add)h+=`<li><span class="add">Añadir</span> ${n} × ${esc(P[pid].name)}</li>`;
  for(const [pid,o,n] of chg)h+=`<li><span class="chg">${n>o?"Subir":"Bajar"}</span> ${esc(P[pid].name)}: de ${o} a ${n}</li>`;
  for(const [pid,o] of del)h+=`<li><span class="del">Quitar</span> ${esc(P[pid].name)} (tenías ${o})</li>`;
  return h+`</ul><button class="btn small" data-saveorder="${kind}">Hecho: guardar este como mi ${name}</button></div>`;
}
// Comparativa: esta lista en cada supermercado elegido, y lo que ahorras repartiendo
function compareCard(l){
  const rows=compareSupers(l), best=rows[0], mix=l.cost;
  return `<details class="card cmp"><summary><b>Comparar supermercados</b> <span class="small muted">· ${cheapestMode()?`repartiendo ahorras ${eur(Math.max(0,rows.find(r=>r.sid===mainSuper()).cost-mix))}`:`el más barato: ${esc(superById(best.sid).nombre)}`}</span></summary>
    <table class="wtable">${rows.map(r=>`<tr><td>Todo en ${esc(superById(r.sid).nombre)}${r.miss?` <small class="muted">(${r.miss} sin precio)</small>`:""}</td><td>${eur(r.cost)}</td></tr>`).join("")}
    ${cheapestMode()?`<tr><td><b>Repartido (lo que ves abajo)</b></td><td><b>${eur(mix)}</b></td></tr>`:""}</table>
    <p class="small muted">Sin contar envíos. Precios de las webs de cada súper del ${esc(PS&&PS.ejecutado?longDate(PS.ejecutado.slice(0,10)).replace(/^\w+, /,""):"")}. Si el envase es distinto, se calcula el precio para la misma cantidad.</p>
    <div class="chips">${chip("data-strat","principal",!cheapestMode(),"Todo en "+esc(superById(mainSuper()).nombre))}${chip("data-strat","barato",cheapestMode(),"Cada cosa donde sea más barata")}</div></details>`;
}
// Tarjeta: qué forma de comprar sale más barata este mes
function shopPlanCard(m){
  const {plans,cur,best,cheapest}=shopPlans(m);if(plans.length<2)return "";
  const curFees=cur?cur.fees:null, save=curFees!=null?curFees-best.fees:0;
  const isBest=cur&&cur.id===best.id;
  return `<details class="card shopplan" ${isBest?"":"open"}><summary><b>💡 Cómo comprar más barato</b> <span class="small muted">· ${isBest?"ya usas la mejor opción":save>0.01?`puedes ahorrar ${eur(save)} este mes`:"compara las opciones"}</span></summary>
    <p class="small muted" style="margin:8px 0">La compra del mes (despensa y congelados) y la de cada semana (fresco) se pueden hacer de forma distinta. Envíos de ${esc(superInfo().nombre||"tu supermercado")} en todo el mes:</p>
    ${plans.map(p=>`<div class="spl ${p.id===best.id?"best":""}"><span><b>${esc(p.t)}</b><small>${esc(p.d)}${p.orders?` · ${p.orders} ${p.orders===1?"pedido":"pedidos"}`:""}${p.trips?` · ${p.trips} ${p.trips===1?"viaje":"viajes"} a la tienda`:""}${p.below?` · <span class="up">${p.below} ${p.below===1?"no llega":"no llegan"} al mínimo</span>`:""}</small></span>
      <span class="r"><b>${p.fees?eur(p.fees):"0 €"}</b>${p.id===best.id?`<small class="okt">Recomendada</small>`:p.id===cheapest.id?`<small class="okt">Lo más barato</small>`:""}${cur&&p.id===cur.id?`<small>La tuya</small>`:""}</span>
      ${cur&&p.id===cur.id?"":`<button class="btn ${p.id===best.id?"":"ghost"} small" data-splan="${p.id}">Usar</button>`}</div>`).join("")}
    <p class="small muted" style="margin:8px 0 0">Los precios de los productos son los mismos; cambia lo que pagas de envío.${chosenSupers().length>1?" Con varios supermercados se cuenta el envío de cada uno.":""}</p></details>`;
}
function renderCompra(){
  const sh=shopping(month);
  if(!sh.weeks.length||!sh.weeks.some(s=>S.plans[s])){main.innerHTML=`<section class="view"><div class="empty"><h2>Sin lista todavía</h2><p>Planifica alguna semana de este mes y aquí aparecerá la compra.</p><button class="btn" id="goMenu">Ir al menú</button></div></section>`;document.getElementById("goMenu").onclick=()=>{tab="menu";render()};return}
  if(listSel!=="mes"&&!sh.lists[listSel])listSel="mes";
  const l=sh.lists[listSel], wi=listSel==="mes"?null:Number(listSel);
  let h=`<section class="view">${viewHead(monthName(month),"Tu *compra*")}<div class="seg" role="group" aria-label="Lista"><button aria-pressed="${listSel==="mes"}" data-list="mes">Compra del mes</button>`;
  sh.weeks.forEach((s,i)=>{if(S.home.start&&addDays(s,6)<S.home.start)return;h+=`<button aria-pressed="${listSel===String(i)}" data-list="${i}">Semana ${shortDate(s)}</button>`});
  h+=`</div><div class="listtotal"><h2>${listSel==="mes"?"Despensa, congelados y carne":"Fresco de la semana"}</h2><b>${eur(l.cost+l.fee)}</b></div>
  <div class="modes chips">${Object.entries(SHOP_MODES).map(([m,t])=>chip("data-lm",m,l.mode===m,t)).join("")}</div>
  ${l.groups.length>1?`<p class="small muted" style="margin:4px 0">Repartido en ${l.groups.length} supermercados, cada producto donde sale más barato.${l.fee?` Envíos: ${eur(l.fee)}.`:""}</p>`
    :`<p class="small muted" style="margin:4px 0">${l.fee?`Envío: ${eur(l.fee)}`:"Sin envío"}${l.min?` · pedido mínimo ${eur(l.min)}`:""} (tarifa de ${esc(superById((l.groups[0]||{}).sup||mainSuper()).nombre||"tu supermercado")})</p>`}`;
  if(wi!=null)h+=`<p class="small muted" style="margin:0">Llega o se compra el ${esc(longDate(deliveryDate(sh.weeks[wi])))}. Lo que se cocina antes sale de lo que ya hay en casa.</p>`;
  if(l.mode==="online"){
    h+=`<p class="shophint">Toca 🛒 para abrir el producto en Mercadona y añadirlo al carro.</p>`;
  }
  if(l.autoStore)h+=`<div class="infobox">🏪 Con esta compra (${eur(l.cost)}) no llegas al mínimo de ${eur(l.autoStore.min)} para pedirla ${l.autoStore.mode==="online"?"online":"a domicilio"}: te faltan ${eur(l.autoStore.short)}. Te la dejo para <b>comprar en tienda</b>${wi!=null?", o júntala con la compra del mes":""}. <button class="btn ghost small" data-lm="${l.autoStore.mode}">Pedirla ${l.autoStore.mode==="online"?"online":"a domicilio"} igualmente</button></div>`;
  if(l.belowMin){const bg=l.groups.find(g=>g.belowMin);
    h+=`<div class="warnbox">${l.groups.length>1?esc(superById(bg.sup).nombre)+": n":"N"}o llegas al pedido mínimo (${eur(bg.min)}): faltan ${eur(bg.min-bg.cost)}.${wi!=null?` <button class="btn small" id="fillMin">Completar con cosas del mes</button>`:" Pásala a compra en tienda o junta compras."}</div>`;
  }
  {const bg=sh.bags[listSel]||[];if(bg.length){const done=bg.filter(b=>(S.bags||{})[b.id]).length;
    h+=`<details class="frzcard" ${done<bg.length?"open":""}><summary><span class="fzi">🧊</span><span><b>Al llegar: ${bg.length} ${bg.length===1?"bolsa":"bolsas"} para congelar</b><small>${done===bg.length?"✓ Todas hechas":`${done} de ${bg.length} hechas · una bolsa por plato, con su día`}</small></span></summary>
      ${bg.map(b=>{const r=RX[b.rid],on=!!(S.bags||{})[b.id];return `<label class="bag ${on?"done":""}"><input type="checkbox" data-bag="${esc(b.id)}" ${on?"checked":""}>${r?dishImg(r,"s"):prodImg(b.pid)}<span><b>${esc(P[b.pid].name)} · ${fmtQty(b.q,P[b.pid].unit)}</b><small>Etiqueta: ${esc(DAYS[dow(b.date)])} ${esc(shortDate(b.date))}${r?" · "+esc(r.name):""}</small></span></label>`}).join("")}
      <p class="small muted" style="margin:8px 2px 0">Aplana las bolsas para que se congelen y descongelen antes. La noche antes de cada día te aviso de pasarla a la nevera.</p></details>`}}
  if(ticketDue().some(x=>x.m===month&&x.key===listSel))h+=`<div class="tkban"><span class="ti">📸</span><span><b>Sube el ticket de esta compra</b><small>+3 coins y me ayudas a afinar los precios</small></span><button class="btn small" id="tkBanner">Escanear</button><button class="tkx" id="tkSkip" aria-label="No tengo ticket">✕</button></div>`;
  if(l.items.length)h+=`<div class="row" style="margin:4px 0"><button class="btn small" id="sendList">📤 Enviar la lista</button>${servidorOn()?`<button class="btn ghost small" id="shareMenuC">👥 ${S.share?"Compartida con alguien de casa":"Compartir con alguien de casa"}</button>`:""}</div>`;
  if(l.items.length&&!shopIsDone(month,l))h+=`<div class="row" style="margin:4px 0 8px"><button class="btn ghost small" id="shopDone">✓ Ya he hecho esta compra</button></div>`;
  else if(l.items.length)h+=`<p class="small okt" style="margin:4px 0 8px;color:var(--ok);font-weight:600">✓ Compra hecha</p>`;
  if(listSel==="mes")h+=shopPlanCard(month);
  if(l.items.length&&l.groups.length===1&&l.groups[0].sup==="mercadona")h+=orderBlock(l,listSel==="mes"?"mes":"semana");
  if(l.items.length&&chosenSupers().length>1)h+=compareCard(l);
  // Un bloque por supermercado; dentro, por secciones en el orden en que se recorre la tienda
  const multi=l.groups.length>1;
  if(l.mode!=="online")h+=`<p class="shophint">Ordenado por secciones, en el orden en que se suele recorrer el súper: coges todo lo de cada sección de una vez y los congelados al final.</p>`;
  for(const g of l.groups){
    const sp=superById(g.sup);
    if(multi)h+=`<div class="suphead"><h2>${esc(sp.nombre)}</h2><b>${eur(g.cost+g.fee)}</b></div>
      <p class="small muted" style="margin:0 0 6px">${g.items.length} productos${g.soloTienda&&l.mode!=="tienda"?" · no reparte en tu zona: en tienda":g.fee?` · envío ${eur(g.fee)}`:""}${g.belowMin?` · <span class="up">no llega al mínimo de ${eur(g.min)}</span>`:""}</p>`;
    const bySec={};for(const it of g.items)(bySec[P[it.pid].sec]=bySec[P[it.pid].sec]||[]).push(it);
    const secs=[...STORE_ORDER,...Object.keys(bySec).filter(s=>!STORE_ORDER.includes(s))].filter(s=>bySec[s]);
    secs.forEach((sec,si)=>{
      h+=`<div class="aisle"><h3><span class="secico">${secIco(sec)}</span>${l.mode!=="online"?`<span class="secn">${si+1}</span>`:""}${esc(sec)} <span class="muted small">· ${bySec[sec].length}</span></h3>`;
      for(const it of bySec[sec].sort((a,b)=>P[a.pid].name.localeCompare(P[b.pid].name))){
        const key=checkKey(month,listSel,it.pid),done=!!S.checks[key],moved=(S.assign[month]||{})[it.pid]!=null&&listSel!=="mes";
        const sx=it.sup!=="mercadona"&&PS&&PS.supers[it.sup]?PS.supers[it.sup].productos[it.pid]:null;
        h+=`<label class="item ${done?"done":""}"><input type="checkbox" data-ck="${key}" ${done?"checked":""}>${prodImg(it.pid)}<span class="t">${it.packs} × ${esc(P[it.pid].name)}<small>Necesitas ${fmtQty(it.q,P[it.pid].unit)}${P[it.pid].keep==="congelar"?", para congelar":""}${moved?" · adelantado de la compra del mes":""}${sx?` · ${esc(sx.nombre)}`:""}</small></span><span class="p">${eur(it.cost)}${upTag(it.pid)}</span>${l.mode==="online"&&it.sup==="mercadona"&&P[it.pid].mid?`<a class="mlink" href="https://tienda.mercadona.es/product/${encodeURIComponent(P[it.pid].mid)}/" target="_blank" rel="noopener" aria-label="Abrir ${esc(P[it.pid].name)} en Mercadona">🛒</a>`:""}</label>`}
      h+=`</div>`});
  }
  const sk=month+"|"+listSel;
  h+=`<div class="card"><h2>Lo que he pagado</h2><div class="spend"><span class="small muted">Apunta el total del ticket o del pedido para comparar con lo previsto (${eur(l.cost+l.fee)}).</span><input type="number" min="0" step="0.01" id="spentIn" value="${S.spent[sk]??""}" placeholder="0,00"></div></div>`;
  if(listSel==="mes"){
    h+=`<p class="small muted">Básicos (aceite, sal, especias): ${eur(Number(S.home.budget.basics))}.${sh.extrasTotal?` Platos fijos sin receta: ${eur(sh.extrasTotal)}.`:""}</p>`;

  }
  if(listSel==="mes")h+=spendingHTML(month)+`<div class="card">${reviewHTML(monthReview(month),false)}</div>`;
  const wb=weekBudget(month);
  h+=`<div class="card"><h2>Presupuesto por semana</h2><table class="wtable">${sh.weeks.map((s,i)=>S.home.start&&addDays(s,6)<S.home.start?"":`<tr><td>Semana del ${shortDate(s)}${i===mesWeek(sh.weeks)?" (con la compra del mes)":""}</td><td class="${sh.perWeek[i]>wb?"up":""}">${eur(sh.perWeek[i])} / ${eur(wb)}</td></tr>`).join("")}</table></div>`;
  main.innerHTML=h+`</section>`;
  main.querySelectorAll("[data-list]").forEach(b=>b.onclick=()=>{listSel=b.dataset.list;render()});
  document.getElementById("sendList")?.addEventListener("click",()=>shareList(month,l,listSel==="mes"?"Compra del mes":"Compra de la semana del "+shortDate(sh.weeks[wi])));
  document.getElementById("shareMenuC")?.addEventListener("click",openShareMenu);
  document.getElementById("shopDone")?.addEventListener("click",()=>{const m=month,k=listSel;markShopDone(m,k);render();askTicket(m,k)});
  document.getElementById("tkBanner")?.addEventListener("click",()=>openTicketScan());
  document.getElementById("tkSkip")?.addEventListener("click",()=>{S.ticketSkip=S.ticketSkip||{};S.ticketSkip[shopKey(month,listSel)]=todayISO();save();render()});
  main.querySelectorAll("[data-bag]").forEach(i=>i.onchange=()=>{S.bags=S.bags||{};if(i.checked)S.bags[i.dataset.bag]=todayISO();else delete S.bags[i.dataset.bag];save();render()});
  main.querySelectorAll("[data-splan]").forEach(b=>b.onclick=()=>{const p=SHOP_PLANS.find(x=>x.id===b.dataset.splan);
    S.home.shop.monthMode=p.month;S.home.shop.weekMode=p.week;for(const k of Object.keys(S.modes))if(k.startsWith(month+"|"))delete S.modes[k];
    save();render();toast("Hecho: "+p.t.toLowerCase())});
  main.querySelectorAll("[data-strat]").forEach(b=>b.onclick=()=>{S.home.shop.strategy=b.dataset.strat;save();render();toast(b.dataset.strat==="barato"?"Cada producto, donde sale más barato":"Todo en "+superById(mainSuper()).nombre)});
  main.querySelectorAll("[data-lm]").forEach(b=>b.onclick=()=>{S.modes[month+"|"+listSel]=b.dataset.lm;save();render()});
  main.querySelectorAll("[data-ck]").forEach(i=>i.onchange=()=>{S.checkedAt=S.checkedAt||{};if(i.checked){S.checks[i.dataset.ck]=true;S.checkedAt[i.dataset.ck]=todayISO()}else{delete S.checks[i.dataset.ck];delete S.checkedAt[i.dataset.ck]}i.closest(".item").classList.toggle("done",i.checked);save();if(S.share)markShared(S.share.codigo,i.dataset.ck,i.checked);
    // Lista completa: se pide el ticket
    if(i.checked&&l.items.every(it=>S.checks[checkKey(month,l.key,it.pid)])&&!(S.tickets||[]).some(t=>t.m===month&&t.list===l.key))setTimeout(()=>askTicket(month,l.key),400)});
  document.getElementById("spentIn").onchange=e=>{const v=e.target.value;if(v==="")delete S.spent[sk];else S.spent[sk]=Number(v);save();renderHeader()};
  main.querySelectorAll("[data-saveorder]").forEach(b=>b.onclick=()=>{const items={};for(const it of l.items)items[it.pid]=it.packs;S.orders[b.dataset.saveorder]={items,savedAt:todayISO()};save();render();toast("Pedido guardado")});
  bindReview(main);bindSpending();
  const fm=document.getElementById("fillMin");if(fm)fm.onclick=()=>{const r=fillToMinimum(month,wi);render();toast(r.moved.length?(r.ok?"Completado con: ":"No llega del todo. Añadido: ")+r.moved.join(", ").toLowerCase():"No hay nada del mes que se pueda adelantar")};
}

/* ---------- Recetas ---------- */
function renderRecetas(){
  const a=me();
  const fl={todas:"Todas",fav:"Favoritas",nuevas:"Sin probar",no:"Descartadas",c:"⚡ Hidratos",l:"🥗 Ligeras",kid:"Gustan a niños"};
  if(R.some(r=>r.cap))fl.guarreo="🍔 Guarreo";
  fl.d_vegano="🌱 Veganas";fl.d_vege="🥚 Vegetarianas";
  if(R.some(r=>r.small))fl.pequenas="🥐 Desayunos y meriendas";
  for(const pk of [...new Set(R.filter(r=>r.pack).map(r=>r.pack))])if(SHOP["pack_"+pk])fl["pack_"+pk]=SHOP["pack_"+pk].ico+" "+SHOP["pack_"+pk].t.replace("Pack ","");
  if(R.some(r=>r.sug))fl.comunidad="💡 De la comunidad";
  for(const k of S.home.apps)fl[k]=APP[k];
  let h=`<section class="view">${viewHead(R.length+" recetas","Tus *recetas*")}${recipeSuggestOn()?`<button class="btn ghost small" id="sugRec" style="margin:4px 0 10px">💡 Sugerir una receta</button>`:""}<div class="field"><input type="text" id="rq" placeholder="Buscar receta o ingrediente" value="${esc(recSearch)}"></div><div class="filters">`+Object.entries(fl).map(([k,v])=>`<button class="btn ${recFilter===k?"":"ghost"} small" data-f="${k}">${v}</button>`).join("")+`</div>`;
  const ms=S.mySug||[];
  if(ms.length)h+=`<details class="card" style="margin-top:0"><summary><b>Mis recetas sugeridas</b> <span class="small muted">(${ms.length})</span></summary>${ms.slice().reverse().map(x=>`<div class="fixed"><span><b>${esc(x.name)}</b><small>${x.code} · ${x.status==="aprobada"?"✅ Aprobada y publicada":"⏳ Enviada el "+esc(shortDate(x.at))+", pendiente de revisar"}</small></span>${x.status==="aprobada"&&x.rid&&RX[x.rid]?`<button class="btn ghost small" data-open="${x.rid}">Ver</button>`:""}</div>`).join("")}</details>`;
  const qn=recSearch.toLowerCase();
  const tried=new Set(S.ratings.map(x=>x.rid));
  const list=R.filter(r=>{
    if(!hasPhoto(r))return false;
    if(qn&&!(r.name.toLowerCase().includes(qn)||r.ing.some(([p])=>P[p].name.toLowerCase().includes(qn))))return false;
    const dp=dishPref(a,r.id);
    if(recFilter.startsWith("pack_"))return r.pack===recFilter.slice(5);
    if(recFilter==="guarreo")return r.cap;
    if(recFilter==="d_vegano")return recipeDiet(r)==="vegano";
    if(recFilter==="d_vege")return ["vegano","vege"].includes(recipeDiet(r));
    switch(recFilter){case "pequenas":return r.small;case "comunidad":return !!r.sug;case "fav":return dp>=1.5;case "nuevas":return !tried.has(r.id);case "no":return dp<=-1;case "c":return r.type==="c";case "l":return r.type==="l";case "kid":return r.kid;case "todas":return true;default:return r.vars.some(v=>v.app===recFilter)}
  });
  h+=`<p class="small muted">${list.length} recetas</p><div class="rgrid">`;
  for(const r of list){const dp=dishPref(a,r.id),can=!!variantFor(r);
    if(!hasPack(r)){h+=`<button class="rtile locked" data-lockpack="${r.pack}"><span class="rtimg">${dishImg(r,"m")}<span class="lock">🔒 ${esc(SHOP["pack_"+r.pack]?SHOP["pack_"+r.pack].t:"Pack")}</span></span><span class="rtt"><b>${esc(r.name)}</b><small>Desbloquéalo en la tienda de coins</small></span></button>`;continue}
    h+=`<button class="rtile ${dp<=-1||!can?"no":""}" data-open="${r.id}"><span class="rtimg">${dishImg(r,"m")}${dp>=1.5?`<span class="rtfav">❤️</span>`:""}<span class="rtbad"><span>⏱ ${recipeTime(r)}′</span>${r.kcal?`<span>🔥 ${r.kcal}</span>`:""}</span></span>
      <span class="rtt"><b>${r.sug?"💡 ":""}${esc(r.name)}</b><small>${r.prot||"?"} g proteína · ${r.type==="c"?"con hidratos":"ligera"}${!can?" · no tienes el aparato":""}${dp<=-1?" · descartada":""}</small></span></button>`;continue;
    h+=`<button class="rcard ${dp<=-1||!can?"no":""}" data-open="${r.id}">${dishImg(r,"s")}<span class="t"><b>${dp>=1.5?"❤️ ":""}${r.sug?"💡 ":""}${esc(r.name)}</b><small>${recipeTime(r)} min · ${r.prot||"?"} g proteína${r.kcal?" · "+r.kcal+" kcal":""}${!can?" · no tienes el aparato":""}${dp<=-1?" · descartada":""}</small></span><span class="pill ${r.type==="c"?"carga":"ligera"}">${r.type==="c"?"⚡":"🥗"}</span></button>`}
  main.innerHTML=h+"</div></section>";
  main.querySelectorAll("[data-lockpack]").forEach(b=>b.onclick=()=>openShop());
  main.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{recFilter=b.dataset.f;render()});
  document.getElementById("sugRec")?.addEventListener("click",openSuggestRecipe);
  const rq=document.getElementById("rq");rq.oninput=()=>{recSearch=rq.value;clearTimeout(rq._t);rq._t=setTimeout(()=>{render();const x=document.getElementById("rq");x.focus();x.setSelectionRange(x.value.length,x.value.length)},250)};
  bindOpen();
}

/* ---------- Cambios planificados (vacaciones, cambios de turno, imprevistos) ---------- */
const CHANGE_TYPES={vacaciones:"Vacaciones",turno:"Cambio de turno",imprevisto:"Imprevisto",otro:"Otro"};
function changesHTML(p){
  const list=(p.changes||[]).filter(c=>c.to>=todayISO()).sort((a,b)=>a.from.localeCompare(b.from));
  const past=(p.changes||[]).length-list.length;
  return `<h3 style="margin-top:14px">Cambios planificados</h3>
    ${list.length?list.map(c=>`<div class="fixed"><span><b>${esc(CHANGE_TYPES[c.type]||"Cambio")}: ${c.with?"está contigo":"no está"}</b><small>Del ${esc(shortDate(c.from))} (${c.fromMeal==="cena"?"cena":"comida"}) al ${esc(shortDate(c.to))} (${c.toMeal==="comida"?"comida":"cena"})${c.note?" · "+esc(c.note):""}</small></span><button class="btn ghost small" data-delch="${p.id}|${c.id}">Quitar</button></div>`).join(""):`<p class="small muted">Ninguno. Úsalos para vacaciones, cambios de turno o imprevistos.</p>`}
    ${past?`<p class="small muted">${past} ${past===1?"cambio pasado":"cambios pasados"} guardados.</p>`:""}
    <button class="btn ghost small" data-addch="${p.id}">+ Planificar un cambio</button>`;
}
function openChange(pid){
  const p=S.people.find(x=>x.id===pid);
  showDialog(`<div class="mod">${closeBtn}<h2>Planificar un cambio</h2><p class="small muted">${esc(personName(p))} · manda sobre su turno normal durante esas fechas.</p>
    <div class="field"><label>¿Qué es?</label><div class="chips">${Object.entries(CHANGE_TYPES).map(([k,t],i)=>chip("data-cht",k,i===0,t)).join("")}</div></div>
    <div class="field"><label>Durante esas fechas</label><div class="chips">${chip("data-chw","1",true,"Está conmigo")}${chip("data-chw","0",false,"No está conmigo")}</div></div>
    <div class="row"><div class="field" style="flex:1.3"><label for="chF">Desde</label><input type="date" id="chF" value="${todayISO()}"></div>
      <div class="field" style="flex:1"><label for="chFm">Empieza con</label><select id="chFm"><option value="comida">la comida</option><option value="cena">la cena</option></select></div></div>
    <div class="row"><div class="field" style="flex:1.3"><label for="chT">Hasta</label><input type="date" id="chT" value="${addDays(todayISO(),6)}"></div>
      <div class="field" style="flex:1"><label for="chTm">Termina después de</label><select id="chTm"><option value="cena">cenar</option><option value="comida">comer</option></select></div></div>
    <div class="field"><label for="chN">Nota (opcional)</label><input type="text" id="chN" placeholder="Por ejemplo, vacaciones de verano"></div>
    <div class="actions"><button class="btn wide" id="chOk">Guardar cambio</button></div></div>`);
  let type="vacaciones",withMe=true;
  dlg.querySelectorAll("[data-cht]").forEach(b=>b.onclick=()=>{type=b.dataset.cht;dlg.querySelectorAll("[data-cht]").forEach(x=>x.setAttribute("aria-pressed",x===b))});
  dlg.querySelectorAll("[data-chw]").forEach(b=>b.onclick=()=>{withMe=b.dataset.chw==="1";dlg.querySelectorAll("[data-chw]").forEach(x=>x.setAttribute("aria-pressed",x===b))});
  dlg.querySelector("#chOk").onclick=()=>{
    const from=dlg.querySelector("#chF").value,to=dlg.querySelector("#chT").value;
    if(!from||!to||to<from){toast("Revisa las fechas: el final no puede ser antes del inicio");return}
    p.changes=p.changes||[];p.changes.push({id:uid("c"),type,with:withMe,from,to,fromMeal:dlg.querySelector("#chFm").value,toMeal:dlg.querySelector("#chTm").value,note:dlg.querySelector("#chN").value.trim()});
    save();for(const s of Object.keys(S.plans))if(addDays(s,6)>=from&&s<=to)ensureWeek(s);save();
    dlg.close();render();toast("Cambio guardado: el menú y la compra ya lo tienen en cuenta");
  };
}

/* ---------- Perfil ---------- */
let calMonth=null;
// Calendario del mes con los días que cada hijo está contigo (tocar un día lo cambia)
function kidCalendar(k){
  const m=calMonth||month, [y,mm]=m.split("-").map(Number);
  const first=iso(new Date(y,mm-1,1)), n=new Date(y,mm,0).getDate();
  let days=0,h=`<div class="row" style="margin-top:12px"><b>Calendario de ${esc(personName(k))}</b><span class="spacer"></span><button class="btn ghost small" data-cal="-1" aria-label="Mes anterior">‹</button><span class="small" style="text-transform:capitalize">${monthName(m)}</span><button class="btn ghost small" data-cal="1" aria-label="Mes siguiente">›</button></div>
  <div class="cal">${DSHORT.map(d=>`<span class="cal-h">${d.slice(0,1)}</span>`).join("")}${"<span></span>".repeat(dow(first))}`;
  for(let i=0;i<n;i++){const d=addDays(first,i),on=peopleAt(d).includes(k),ov=((S.days[d]||{}).kids||{})[k.id]!=null||!!changeFor(k,d);if(on)days++;
    h+=`<button class="cal-d ${on?"on":""} ${isHoliday(d)?"hol":""} ${ov?"ov":""}" data-kcal="${k.id}|${d}" title="${esc(longDate(d))}${isHoliday(d)?" · "+esc(holidayName(d)):""}">${i+1}</button>`}
  return h+`</div><div class="small muted">${days} días este mes · toca un día para cambiarlo${Object.keys(S.days).some(d=>d.startsWith(m)&&((S.days[d].kids||{})[k.id]!=null))?" · los días con borde los has cambiado tú":""}</div>`;
}
function knowHTML(p){
  const ings=Object.entries(p.tastes.ing).filter(([pid])=>P[pid]);
  const by=v=>ings.filter(([,x])=>Number(x)===v||(v===1&&Number(x)===2));
  const src=k=>p.tastes.src[k]?`<span class="src"> · ${esc(p.tastes.src[k])}</span>`:"";
  const ichips=list=>list.length?`<div class="chips">${list.map(([pid,v])=>`<span class="chip t${v}">${v==2?"❤️ ":""}${esc(P[pid].name)} <button class="reset" data-unI="${p.id}|${pid}" aria-label="Quitar" style="border:0;background:none;padding:0 0 0 4px">✕</button></span>`).join("")}</div>`:`<p class="small muted">Nada todavía.</p>`;
  const dishes=Object.entries(p.tastes.dish).filter(([rid])=>RX[rid]);
  const dl=v=>dishes.filter(([,x])=>v>0?x>=1:x<=-1);
  const dchips=list=>list.length?list.map(([rid])=>`<div class="fixed"><span><b>${esc(RX[rid].name)}</b><small>${esc(p.tastes.src["d:"+rid]||"")}</small></span><button class="btn ghost small" data-unD="${p.id}|${rid}">Quitar</button></div>`).join(""):`<p class="small muted">Nada todavía.</p>`;
  const lr=learned(p), y=isMe(p);
  const le=y?"te":"le", Le=y?"Te":"Le", puede=y?"puedes":"puede";
  const al=p.allergies||[];
  return `<div class="know">
    <div class="row" style="justify-content:space-between"><h3 style="margin:0">${DIETS[dietOf(p)][0]} ${esc(DIETS[dietOf(p)][1])}</h3><button class="btn ghost small" data-edit="dieta">Cambiar dieta</button></div>
    <h3>⚠️ Alergias e intolerancias</h3>${al.length?`<div class="chips">${al.map(a=>`<span class="pill carga">${esc(ALLERGENS[a])}</span>`).join("")}</div>`:`<p class="small muted">Ninguna indicada.</p>`}
    <h3>🚫 No ${puede} comer</h3>${ichips(by(-9))}
    <h3>👎 Ingredientes que no ${le} gustan</h3>${ichips(by(-1))}
    <h3>❤️ Ingredientes que ${le} gustan</h3>${ichips(by(1))}
    <h3>Platos que ${le} gustan</h3>${dchips(dl(1))}
    <h3>Platos que no ${le} gustan</h3>${dchips(dl(-1))}
    ${lr.length?`<h3>He notado que…</h3>${lr.map(x=>`<div class="fixed"><span><b>${x.v>0?Le+" gusta":"No "+le+" gusta"} ${esc(P[x.pid].name.toLowerCase())}</b><small>${esc(x.src)}</small></span><span><button class="btn small" data-lok="${p.id}|${x.pid}|${x.v}">Es así</button> <button class="btn ghost small" data-lno="${p.id}|${x.pid}">No</button></span></div>`).join("")}`:""}
    <p class="small muted">${S.ratings.filter(x=>x.who===p.id).length} valoraciones hasta ahora.</p>
    <button class="btn ghost small" data-edit="gustos:${p.id}">Editar alergias e ingredientes</button></div>`;
}
let accOpen=new Set([me().id]);
// Apartado desplegable del Perfil (recuerda si estaba abierto)
const acc=(id,ico,title,sub,body)=>`<details class="acc" data-acc="${id}" ${accOpen.has(id)?"open":""}><summary><span class="ico">${ico}</span><span class="tx">${title}${sub?`<small>${esc(sub)}</small>`:""}</span></summary><div class="accbody">${body}</div></details>`;
function renderPerfil(){
  const RV={2:"❤️",1:"👍",rare:"🙂","-1":"👎"};
  const fav=Object.values(me().tastes.dish).filter(v=>v>=1.5).length, rated=S.ratings.filter(x=>x.who===me().id).length, wks=Object.values(S.plans).filter(w=>w.confirmed).length;
  let h=`<section class="view"><div class="phero"><button class="avatar ${S.avatar&&owns(S.avatar)?"emo":""}" id="avBtn" aria-label="Cambiar avatar">${S.avatar&&owns(S.avatar)?SHOP[S.avatar].ico:esc((me().name||"T").trim().charAt(0).toUpperCase())}</button>
    <div><div class="veb">Tu perfil</div><h1 class="vh">Hola, <em>${esc(me().name||"tú")}</em></h1>
    <p>${S.people.length>1?`${S.people.length} en casa · `:""}${eur(S.home.budget.month)} al mes · ${esc(chosenSupers().map(s=>superById(s).nombre).join(", "))}</p></div></div>
    <div class="pstats"><div><b>${rated}</b><small>platos valorados</small></div><div><b>${fav}</b><small>favoritos</small></div><div><b>${wks}</b><small>semanas planificadas</small></div></div>`;
  let fam="";
  for(const p of S.people){const hist=historyOf(p,20);
    const body=`${!isMe(p)?`<div class="small muted">${p.kind==="nino"?(p.age?p.age+" años · ":"")+"niño o niña":"adulto"} · ración ${String(p.factor).replace(".",",")}${p.tupper?" · se lleva táper":""}</div>${turnText(p)?`<div class="small" style="margin-top:6px">${esc(turnText(p))}</div>`:""}${mealsAwayText(p)?`<div class="small" style="margin-top:4px">🍽️ ${esc(mealsAwayText(p))}</div>`:""}${kidCalendar(p)}${changesHTML(p)}`:""}${knowHTML(p)}
      <details style="margin-top:12px"><summary class="small"><b>Historial</b> <span class="muted">(${hist.length} ${hist.length===1?"comida reciente":"comidas recientes"})</span></summary>
      ${hist.length?`<table class="wtable">${hist.map(x=>`<tr><td>${DSHORT[dow(x.date)]} ${shortDate(x.date)} · ${x.meal}</td><td style="text-align:left;padding-left:8px">${esc(x.name)}${x.note?` <span class="small muted">${esc(x.note)}</span>`:""}</td><td>${x.v!=null?RV[x.v]:""}</td></tr>`).join("")}</table>`:`<p class="small muted">Aún no hay comidas pasadas.</p>`}</details>`;
    const likes=Object.values(p.tastes.dish).filter(v=>v>=1).length, nos=Object.values(p.tastes.ing).filter(v=>v<0).length;
    const sub=`${likes} ${likes===1?"plato favorito":"platos favoritos"} · ${nos} ${nos===1?"cosa":"cosas"} que no ${isMe(p)?"te":"le"} ${nos===1?"gusta":"gustan"}`;
    if(isMe(p))h+=acc(p.id,"🙂","Lo que sé de ti",sub,body);
    else fam+=acc(p.id,p.kind==="nino"?"🧒":"🧑",esc(personName(p)),sub,body);
  }
  if(fam)h+=acc("familia","👨‍👩‍👧","Tu familia",S.people.filter(p=>!isMe(p)).map(personName).join(", "),fam);
  const items=[["aparatos","Aparatos",Object.entries(APP).filter(([k])=>S.home.apps.includes(k)).map(([,v])=>v).join(", ")],["zona","Supermercados y zona",[chosenSupers().map(s=>superById(s).nombre).join(", ")+(cheapestMode()?" (lo más barato)":""),S.home.cp,S.home.municipio].filter(Boolean).join(" · ")||"Sin indicar"],["dieta","Dieta y alergias",S.people.map(p=>(p.id==="yo"?"Tú":personName(p))+": "+DIETS[dietOf(p)][1].toLowerCase()+((p.allergies||[]).length?" · "+p.allergies.length+" alergias":"")).join(" · ")],["familia","Quién come en casa",others().map(personName).join(", ")||"Solo tú"],
    ...kids().map(k=>["entreno:"+k.id,"Deporte de "+personName(k),k.trains?k.sports.map(s=>SPORTS[s]).join(", "):"No hace deporte"]),
    ...adults().flatMap(a=>[["objetivos:"+a.id,isMe(a)?"Tus objetivos":"Objetivos de "+personName(a),a.goals.map(g=>GOALS[g][0]).join(", ")],["entreno:"+a.id,isMe(a)?"Tu entrenamiento":"Entrenamiento de "+personName(a),a.trains?a.sports.map(s=>SPORTS[s]).join(", "):"No entrena"]]),["cocina","Tu semana, caprichos y horario",(S.home.cookMode==="lote"?"Por lotes":"Cada día")+" · "+S.fixed.length+" platos fijos"],
    ["plan","Planificación",(S.home.start&&S.home.start>todayISO()?"Empieza el "+shortDate(S.home.start)+" · ":"")+{diaria:"Cada día",semanal:"Cada semana",quincenal:"Cada dos semanas",mensual:"Cada mes"}[S.home.planFreq]+", "+DAYS[S.home.planDay].toLowerCase()+" a las "+S.home.planTime],
    ["compra","Compra y presupuesto",eur(S.home.budget.month)+" al mes"]];
  h+=acc("ajustes","⚙️","Ajustes","Familia, objetivos, entrenos, compra…",`<div class="settingslist">${items.map(([id,t,d])=>`<button data-edit="${id}">${t}<small>${esc(d)}</small></button>`).join("")}</div>`);
  if(servidorOn())h+=acc("casa","🏠","Casa compartida",S.casa?adults().filter(a=>a.joined&&!isMe(a)).map(personName).concat(["tú"]).join(", ")+" · mismo menú y compra":"Invita a tu pareja a ver y cambiar el menú",casaCard());
  h+=acc("avisos","🔔","Avisos en el móvil",S.notif&&S.notif.on?"Activados":"Desactivados",avisosCard().replace('<div class="card"><h2>Avisos en el móvil</h2>','<div>'));
  h+=acc("coins","🪙","Invita y gana coins","Tu QR personal y tus coins",`<p class="small muted">Este es <b>tu</b> código: quien lo escanee con la cámara del móvil abre Táper y queda como invitado tuyo. Ganas coins solo cuando hay respuesta: alguien abre tu enlace (+1), empieza a usar Táper (+10) y cada semana que la sigue usando (+2).</p>
    <div id="coinsBox">${servidorOn()?`<p class="small muted">Cargando tus coins…</p>`:""}</div>
    <div id="qrBox" style="display:grid;place-items:center;margin:10px 0;background:#fff;border-radius:12px;padding:10px"></div>
    <div class="actions"><button class="btn" id="shareApp">Enviar el enlace</button><button class="btn ghost" id="copyApp">Copiar enlace</button></div>`);
  h+=acc("privacidad","🔒","Tus datos y privacidad","Qué se queda en tu móvil y qué sale",`<p class="small"><b>Se queda solo en tu móvil:</b> tu familia, gustos, alergias, menús, lista de la compra, valoraciones y las fotos de tus platos. No hay cuenta ni contraseña.</p>
    <p class="small"><b>Sale del móvil solo si lo usas:</b></p>
    <ul class="small" style="margin:0 0 6px 18px;padding:0">
      <li><b>Avisos:</b> el texto de tus próximos avisos, para mandártelos a su hora.</li>
      <li><b>Código postal:</b> para saber qué precios de supermercado te tocan.</li>
      <li><b>Tickets:</b> los productos y precios del ticket, sin tu nombre, para corregir precios. La foto no se guarda.</li>
      <li><b>Casa compartida o menú compartido:</b> una copia del menú, la familia y la compra mientras compartas, para que lo vea la otra persona.</li>
      <li><b>Invitaciones y coins:</b> un código anónimo (${esc(S.uid||"")}) con tus coins y a quién invitaste.</li>
      <li><b>Visitas:</b> un recuento anónimo, sin cookies, que puedes quitar en Sugerencias y opinión.</li></ul>
    <p class="small muted">Todo va a un servidor propio de Táper (Cloudflare). No se vende ni se comparte con nadie. Para llevarte tus datos o borrarlo todo, usa Copia y novedades.</p>`);
  h+=acc("opinion","💡","Sugerencias y opinión","Ideas, recetas, encuesta y privacidad",`${suggestUrl()?`<p class="small muted">¿Se te ocurre una mejora, una receta o has visto un fallo? Cuéntamelo.</p><a class="btn" href="${esc(suggestUrl())}" target="_blank" rel="noopener">Enviar una sugerencia</a>`:`<p class="small muted">Pronto podrás enviar sugerencias desde aquí.</p>`}
    <div class="actions">${recipeSuggestOn()?`<button class="btn ghost small" id="sugRec2">🍳 Sugerir una receta</button>`:""}${surveyOn()?`<button class="btn ghost small" id="svProfile">📋 Encuesta del mes</button>`:""}</div>
    <label class="row small"><input type="checkbox" id="noStats" ${S.noStats?"":"checked"} style="width:auto"> Contar mis visitas de forma anónima (sin cookies ni datos personales) para saber cuánta gente usa Táper</label>`);
  h+=acc("festivos","📅","Festivos",`Cataluña${S.home.municipio?" y "+S.home.municipio:""}${S.home.festivosExtra.length?" · "+S.home.festivosExtra.length+" añadidos":""}`,`<p class="small muted">Se usan los de Cataluña${S.home.municipio&&FEST&&FEST.locales[S.home.municipio]?" y los locales de "+esc(S.home.municipio):""}. Añade los locales de tu municipio u otros días especiales.</p>
    ${S.home.festivosExtra.map(d=>`<div class="fixed"><span>${esc(longDate(d))}</span><button class="btn ghost small" data-delfest="${d}">Quitar</button></div>`).join("")}
    <div class="row"><input type="date" id="festIn" style="flex:1"><button class="btn small" id="festAdd">Añadir</button></div>`);
  h+=acc("app","📦","Copia de seguridad y novedades",`Versión ${APP_VERSION} · tu código ${S.uid}`,`<p class="small muted">Todo se guarda solo en este móvil. Descarga una copia de vez en cuando y antes de cambiar de móvil.</p>
    ${needsTransfer()?`<div class="okbox"><b>¿Vas a instalar Táper?</b> Tus datos pasarán solos a la app. Si no te los reconoce, usa este código de traspaso: <b style="letter-spacing:.15em">${esc(transferCode())}</b></div>`:""}
    ${isStandalone()&&servidorOn()?`<button class="btn ghost small" id="trBring" style="margin-bottom:8px">Traer mis datos de Safari</button>`:""}
    <div class="okbox small" style="margin-bottom:10px"><b>Probar el inicio de la app</b><br>Guardo tus datos en este móvil, empiezas de cero y, cuando quieras, los recuperas tal cual.
      <div class="actions" style="margin-top:8px"><button class="btn small" id="fresh">Empezar de cero (guardando mis datos)</button>${snapshot()?`<button class="btn ghost small" id="restoreSnap">Recuperar mis datos del ${esc(new Date(snapshot().at).toLocaleString("es-ES",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}))}</button>`:""}</div></div>
    <div class="actions"><button class="btn" id="exp">Exportar copia</button><button class="btn ghost" id="imp">Importar copia</button></div><input type="file" id="impFile" accept="application/json,.json" hidden>
    <div class="field"><label>Aspecto</label><div class="chips">${[["light","Claro"],["dark","Oscuro"],["auto","Como el móvil"]].map(([k,t])=>chip("data-theme-set",k,(S.home.theme||"light")===k,t)).join("")}</div></div>
    <div class="field"><label>Color</label><div class="chips">${chip("data-accent","rojo",!S.accent||S.accent==="rojo","🍅 Rojo")}${Object.keys(ACCENTS).filter(k=>k!=="rojo"&&owns("tema_"+k)).map(k=>chip("data-accent",k,S.accent===k,SHOP["tema_"+k].ico+" "+SHOP["tema_"+k].t.replace("Tema ",""))).join("")}<button class="chip" id="moreColors">🛍️ Más colores</button></div></div>
    <div class="field"><label>Estética</label><div class="chips">${chip("data-skin","",!S.skin,"✨ Normal")}${Object.keys(SHOP).filter(k=>k.startsWith("skin_")&&owns(k)).map(k=>chip("data-skin",k.slice(5),S.skin===k.slice(5),SHOP[k].ico+" "+SHOP[k].t)).join("")}<button class="chip" id="moreSkins">🛍️ Más estéticas</button></div>
      <div class="hint">Las estéticas cambian el fondo, las letras y las tarjetas. Con una estética puesta, manda su color.</div></div>
    <div class="actions"><button class="btn ghost small" id="newsAll">Ver todas las novedades</button><button class="btn ghost small" id="restartWiz">Repetir el asistente</button></div>`);
  h+=`</section>`;
  main.innerHTML=h;
  const q=s=>main.querySelectorAll(s), find=id=>S.people.find(p=>p.id===id);
  q("details.acc").forEach(d=>d.addEventListener("toggle",()=>{if(d.open)accOpen.add(d.dataset.acc);else accOpen.delete(d.dataset.acc)}));
  q("[data-edit]").forEach(b=>b.onclick=()=>{openWizard(b.dataset.edit);scrollTo(0,0)});
  bindCasa(main);
  q("[data-addch]").forEach(b=>b.onclick=()=>openChange(b.dataset.addch));
  q("[data-delch]").forEach(b=>b.onclick=()=>{const [pp,cid]=b.dataset.delch.split("|");const p=find(pp);const c=(p.changes||[]).find(x=>x.id===cid);p.changes=p.changes.filter(x=>x.id!==cid);save();
    if(c)for(const s of Object.keys(S.plans))if(addDays(s,6)>=c.from&&s<=c.to)ensureWeek(s);save();render();toast("Cambio quitado")});
  q("[data-cal]").forEach(b=>b.onclick=()=>{const [y,m]=(calMonth||month).split("-").map(Number);calMonth=iso(new Date(y,m-1+Number(b.dataset.cal),1)).slice(0,7);render()});
  q("[data-kcal]").forEach(b=>b.onclick=()=>{const [id,d]=b.dataset.kcal.split("|"),k=find(id);const o=S.days[d]=S.days[d]||{};o.kids=o.kids||{};
    const ruleOn=presentByRule(k,d), nowOn=peopleAt(d).includes(k);
    if(!nowOn===ruleOn)delete o.kids[id];else o.kids[id]=!nowOn;
    save();if(S.plans[weekStartFor(d)])ensureWeek(weekStartFor(d));save();render()});
  q("[data-unI]").forEach(b=>b.onclick=e=>{e.preventDefault();const [pp,pid]=b.dataset.uni.split("|");setIng(find(pp),pid,0);render()});
  q("[data-unD]").forEach(b=>b.onclick=()=>{const [pp,rid]=b.dataset.und.split("|");setDish(find(pp),rid,null);render()});
  q("[data-lok]").forEach(b=>b.onclick=()=>{const [pp,pid,v]=b.dataset.lok.split("|");setIng(find(pp),pid,Number(v),"Aprendido de tus valoraciones");render()});
  q("[data-lno]").forEach(b=>b.onclick=()=>{const [pp,pid]=b.dataset.lno.split("|");find(pp).tastes.ignore[pid]=true;save();render()});
  q("[data-delfest]").forEach(b=>b.onclick=()=>{S.home.festivosExtra=S.home.festivosExtra.filter(d=>d!==b.dataset.delfest);save();refreshPlans();render()});
  document.getElementById("festAdd").onclick=()=>{const v=document.getElementById("festIn").value;if(v&&!S.home.festivosExtra.includes(v)){S.home.festivosExtra.push(v);S.home.festivosExtra.sort();save();refreshPlans();render()}};
  document.getElementById("fresh")?.addEventListener("click",()=>{
    showDialog(`<div class="mod">${closeBtn}<h2>¿Empezar de cero?</h2><p>Guardo una copia de todo en este móvil (familia, gustos, menús, compra…) y la app vuelve a la primera pantalla, como si la abrieras por primera vez.</p>
      <p class="small muted">Para volver a tus datos: botón «Recuperar mis datos» en la primera pantalla o aquí, en Perfil. Si ya había otra copia guardada, se sustituye por esta.</p>
      <div class="actions"><button class="btn wide" id="freshOk">Guardar y empezar de cero</button></div></div>`);
    dlg.querySelector("#freshOk").onclick=()=>{if(startFresh()){dlg.close();wiz={i:0,single:null};tab="wizard";render();scrollTo(0,0);toast("Tus datos están guardados. Empieza cuando quieras")}}});
  document.getElementById("restoreSnap")?.addEventListener("click",()=>{if(confirm("¿Recuperar tus datos guardados? Lo que tienes ahora se sustituye.")&&restoreSnapshot()){tab="perfil";render();toast("Datos recuperados")}});
  document.getElementById("exp").onclick=exportBackup;document.getElementById("trBring")?.addEventListener("click",openTransferCode);
  const f=document.getElementById("impFile");document.getElementById("imp").onclick=()=>f.click();f.onchange=()=>{if(f.files[0])importBackup(f.files[0]);f.value=""};
  document.getElementById("newsAll").onclick=()=>openNews(true);
  q("[data-theme-set]").forEach(b=>b.onclick=()=>{S.home.theme=b.dataset.themeSet;save();applyTheme();render()});
  document.getElementById("avBtn")?.addEventListener("click",()=>{const mine=Object.keys(SHOP).filter(k=>k.startsWith("av_")&&owns(k));
    showDialog(`<div class="mod">${closeBtn}<h2>Tu avatar</h2><div class="avgrid"><button class="avopt ${!S.avatar?"on":""}" data-av="">${esc((me().name||"T").trim().charAt(0).toUpperCase())}</button>${mine.map(k=>`<button class="avopt ${S.avatar===k?"on":""}" data-av="${k}">${SHOP[k].ico}</button>`).join("")}</div>
      <button class="btn wide" id="avShop" style="margin-top:12px">🛍️ Más avatares en la tienda</button></div>`);
    dlg.querySelectorAll("[data-av]").forEach(b=>b.onclick=()=>{S.avatar=b.dataset.av||null;save();dlg.close();render()});dlg.querySelector("#avShop").onclick=openShop});
  q("[data-accent]").forEach(b=>b.onclick=()=>{S.accent=b.dataset.accent;save();applyAccent();render()});
  document.getElementById("moreColors")?.addEventListener("click",openShop);
  document.getElementById("moreSkins")?.addEventListener("click",openShop);
  q("[data-skin]").forEach(b=>b.onclick=()=>{S.skin=b.dataset.skin||null;save();applySkin();render()});
  bindAvisos();
  document.getElementById("svProfile")?.addEventListener("click",openSurvey);
  document.getElementById("sugRec2")?.addEventListener("click",openSuggestRecipe);
  document.getElementById("noStats").onchange=e=>{S.noStats=!e.target.checked;save();toast(S.noStats?"No se contarán tus visitas":"Gracias: se contarán de forma anónima")};
  const url=shareLink();fillStats();
  loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js").then(()=>{const qr=qrcode(0,"M");qr.addData(url);qr.make();const b=document.getElementById("qrBox");if(b)b.innerHTML=qr.createSvgTag({cellSize:6,margin:2,scalable:true}).replace("<svg ",'<svg style="width:220px;height:220px" ')}).catch(()=>{const b=document.getElementById("qrBox");if(b)b.textContent=url});
  document.getElementById("shareApp").onclick=async()=>{try{if(navigator.share){await navigator.share({title:"Táper",text:"Menú semanal, tápers y lista de la compra con precios de Mercadona",url});evento("compartir").then(fillStats)}else{await navigator.clipboard?.writeText(url);toast("Enlace copiado");evento("compartir").then(fillStats)}}catch(e){}};
  document.getElementById("copyApp").onclick=()=>{navigator.clipboard?.writeText(url).then(()=>{toast("Enlace copiado");evento("compartir").then(fillStats)},()=>toast(url))};
  document.getElementById("restartWiz").onclick=()=>{S.onboarded=false;wiz={i:0,single:null};save();render()};
}

/* ---------- Navegación y arranque ---------- */
// Cambio de pestaña con transición suave (si el navegador la admite) y vibración breve
document.querySelectorAll("nav.tabs button").forEach(b=>b.onclick=()=>{
  if(tab===b.dataset.tab){scrollTo({top:0,behavior:"smooth"});return}
  try{navigator.vibrate&&navigator.vibrate(8)}catch(e){}
  const go=()=>{tab=b.dataset.tab;render();scrollTo(0,0)};
  if(document.startViewTransition&&!matchMedia("(prefers-reduced-motion: reduce)").matches)document.startViewTransition(go);else go();
});
function shiftMonth(n){const [y,m]=month.split("-").map(Number);const d=new Date(y,m-1+n,1);month=iso(d).slice(0,7);listSel="mes";render()}
document.getElementById("prevM").onclick=()=>shiftMonth(-1);
document.getElementById("bell").onclick=openInbox;
document.getElementById("nextM").onclick=()=>shiftMonth(1);
dlg.addEventListener("click",e=>{if(e.target===dlg)dlg.close()});

/* ---------- Antes de empezar: gastar lo que hay en casa ---------- */
function useUpCard(){
  if(!S.home.start||S.home.start<=todayISO())return "";
  const n=(S.pantry||[]).length;
  return `<div class="hero"><div class="eyebrow">Tu plan empieza el ${esc(longDate(S.home.start).replace(/^\w+, /,""))}</div><h2>Mientras, gasta lo que tienes</h2>
    <p>Dime qué hay en tu despensa, nevera y congelador y te propongo recetas para aprovecharlo, sin comprar casi nada.</p>
    <button class="btn" id="useUp">${n?`Ver ideas con mis ${n} productos`:"¿Qué tengo en casa?"}</button></div>`;
}
// Elegir cuándo empieza el plan (hasta entonces: gastar lo que hay en casa)
function openStartDay(){
  const nextMonth=iso(new Date(new Date().getFullYear(),new Date().getMonth()+1,1));
  showDialog(`<div class="mod">${closeBtn}<h2>¿Cuándo empiezas?</h2><p class="small muted">Hasta ese día no preparo menú ni compra: te ayudo a gastar lo que ya tienes en casa.</p>
    <div class="field"><label for="sdIn">Empezar el plan el</label><input type="date" id="sdIn" min="${todayISO()}" value="${esc(S.home.start&&S.home.start>todayISO()?S.home.start:nextMonth)}"></div>
    <div class="actions"><button class="btn" id="sdOk">Guardar</button>${S.home.start&&S.home.start>todayISO()?`<button class="btn ghost" id="sdNow">Empezar ya</button>`:""}</div></div>`);
  const apply=st=>{S.home.start=st&&st>todayISO()?st:null;
    if(S.home.start)for(const s of Object.keys(S.plans))if(addDays(s,6)<S.home.start)delete S.plans[s];
    ensureHorizon();save();dlg.close();month=(S.home.start||todayISO()).slice(0,7);render();
    toast(S.home.start?"Tu plan empieza el "+longDate(S.home.start).replace(/^\w+, /,""):"Plan en marcha desde hoy")};
  dlg.querySelector("#sdOk").onclick=()=>apply(dlg.querySelector("#sdIn").value);
  dlg.querySelector("#sdNow")?.addEventListener("click",()=>apply(null));
}
function openUseUp(){
  const have=new Set(S.pantry||[]);let step=have.size?1:0;
  const draw=()=>{
    if(step===0){
      const groups={};for(const p of Object.values(P))(groups[p.sec]=groups[p.sec]||[]).push(p);
      showDialog(`<div class="mod">${closeBtn}<h2>¿Qué tienes en casa?</h2><p class="small muted">Toca lo que tengas, aunque sea poco.</p>
        ${[...STORE_ORDER,...Object.keys(groups).filter(g=>!STORE_ORDER.includes(g))].filter(g=>groups[g]).map(g=>`<div class="group"><h3>${esc(g)}</h3><div class="chips">${groups[g].sort((a,b)=>a.name.localeCompare(b.name)).map(p=>chip("data-hv",p.id,have.has(p.id),esc(p.name))).join("")}</div></div>`).join("")}
        <div class="actions sticky"><button class="btn wide" id="hvOk">Ver ideas (${have.size})</button></div></div>`);
      dlg.querySelectorAll("[data-hv]").forEach(b=>b.onclick=()=>{const id=b.dataset.hv;if(have.has(id))have.delete(id);else have.add(id);b.setAttribute("aria-pressed",have.has(id));dlg.querySelector("#hvOk").textContent=`Ver ideas (${have.size})`});
      dlg.querySelector("#hvOk").onclick=()=>{S.pantry=[...have];save();step=1;draw()};
      return;
    }
    // Recetas que más aprovechan lo que hay (sin contar lo básico); primero las que no necesitan nada más
    const ideas=R.filter(r=>variantFor(r)&&canEat(me(),r)&&dishPref(me(),r.id)>-1).map(r=>{
      const main=r.ing.filter(([p])=>!COMMON.has(p)), got=main.filter(([p])=>have.has(p)), miss=main.filter(([p])=>!have.has(p));
      return {r,got:got.length,miss:miss.map(([p])=>p),score:got.length-miss.length*3};
    }).filter(x=>x.got>0).sort((a,b)=>b.score-a.score).slice(0,15);
    showDialog(`<div class="mod">${closeBtn}<h2>Ideas para gastar lo que tienes</h2>
      ${ideas.length?ideas.map(x=>`<button class="alt altimg" data-open3="${x.r.id}">${dishImg(x.r,"s")}<span><b>${esc(x.r.name)}</b><small>${recipeTime(x.r)} min · ${x.miss.length?"te falta: "+esc(x.miss.map(p=>P[p].name.toLowerCase()).join(", ")):"tienes todo"}</small></span></button>`).join(""):`<p class="muted">Con eso aún no sale ningún plato. Añade algo más.</p>`}
      <div class="actions"><button class="btn ghost" id="hvEdit">Cambiar lo que tengo</button></div></div>`);
    dlg.querySelectorAll("[data-open3]").forEach(b=>b.onclick=()=>openRecipe(b.dataset.open3));
    dlg.querySelector("#hvEdit").onclick=()=>{step=0;draw()};
  };
  draw();
}

/* ---------- Centro de avisos (campanita) ---------- */
// Todo lo pendiente de la app en un solo sitio; cada elemento lleva a resolverlo
function inboxItems(){
  const out=[], today=todayISO(), go=(t,fn)=>()=>{dlg.close();tab=t;render();scrollTo(0,0);if(fn)setTimeout(fn,60)};
  // Avisos del móvil: bloqueados, sin activar, o el móvil no puede recibirlos
  try{
    if(notifBlocked())out.push({ico:"🔕",t:"Tus avisos están bloqueados",s:"Te enseño cómo activarlos en 4 toques",go:()=>openPermHelp()});
    else if(avisosOn()&&!(S.notif&&S.notif.on))out.push({ico:"🔔",t:"Activa los avisos",s:"Para saber qué descongelar, qué cocinar y cuándo planificar",go:()=>{dlg.close();enableAvisos().catch(e=>toast("No se ha podido: "+e.message))}});
    else if(avisosOn()&&S.notif&&S.notif.on&&"Notification" in window&&Notification.permission==="default")out.push({ico:"🔔",t:"Vuelve a activar los avisos",s:"Este móvil aún no te ha dado permiso",go:()=>{dlg.close();enableAvisos().catch(e=>toast("No se ha podido: "+e.message))}});
    else if(!avisosOn()&&isIOS()&&!isStandalone())out.push({ico:"📲",t:"Instala Táper para recibir avisos",s:"En iPhone solo llegan con la app en la pantalla de inicio",go:()=>{dlg.close();showDialog(`<div class="mod">${closeBtn}<h2>Instala Táper</h2><ol class="steps"><li>Toca <b>Compartir</b> (el cuadrado con la flecha ↑)</li><li>Toca <b>Añadir a pantalla de inicio</b></li><li>Abre Táper desde su icono nuevo</li><li>Tus datos pasarán solos</li></ol></div>`)}});
    else if(!avisosOn()&&!isIOS())out.push({ico:"🔕",t:"Este navegador no recibe avisos",s:"Abre Táper con Chrome e instálala para recibirlos",go:()=>{dlg.close();tab="perfil";render()}});
  }catch(e){}
  try{for(const k of S.people)if(!k.smallSet&&(k.id==="yo"||(k.presence||{}).type!=="manual"))out.push({ico:"🥐",t:isMe(k)?"¿Desayunas, almuerzas y meriendas?":`¿Qué desayuna y merienda ${personName(k)}?`,s:"Te propongo desayunos, almuerzos y meriendas sanos",go:()=>{dlg.close();openWizard("familia");scrollTo(0,0)}})}catch(e){}
  try{for(const k of others())if(!k.mealsSet&&(k.presence||{}).type!=="manual")out.push({ico:"🍽️",t:`¿Qué comidas hace ${personName(k)} en casa?`,s:"Comida y cena de cada día: así no cocino de más",go:()=>{dlg.close();openWizard("familia");scrollTo(0,0)}})}catch(e){}
  try{if(S.onboarded&&!/^\d{5}$/.test(S.home.cp||""))out.push({ico:"📍",t:"Pon tu código postal",s:"Para tus precios, los supermercados que te reparten y tus festivos",go:()=>{dlg.close();openWizard("zona");scrollTo(0,0)}})}catch(e){}
  try{for(const x of ticketDue())out.push({ico:"📸",t:`Sube el ticket de ${x.title}`,s:"+3 coins · y afino los precios para todos",go:()=>{dlg.close();askTicket(x.m,x.key)}})}catch(e){}
  try{for(const r of shopDueNow())out.push({ico:"🛒",t:r.title.replace("🛒 ",""),s:r.body,go:()=>openShopReminder(r)})}catch(e){}
  try{const nx=monthPrepDue();if(nx)out.push({ico:"📋",t:`Prepara ${mName(nx)}`,s:"5 preguntas y te dejo el menú y el pedido del mes listos",go:()=>{dlg.close();openMonthPrep(nx)}})}catch(e){}
  try{const n=pendingMeals().length;if(n)out.push({ico:"⭐",t:n===1?"1 comida por valorar":`${n} comidas por valorar`,s:"Así aprendo lo que os gusta",go:go("menu")})}catch(e){}
  try{const n=pendingSports().length;if(n)out.push({ico:"🏃",t:n===1?"¿Hiciste el entreno?":`${n} entrenos por confirmar`,s:"Para recalcular lo que te conviene comer",go:go("menu")})}catch(e){}
  try{if(thawCard())out.push({ico:"❄️",t:"¿Descongelaste lo de hoy?",s:"Si se te olvidó, tienes un plan B",go:go("menu")})}catch(e){}
  try{const st=weekStartFor(today),nx=addDays(st,7);
    for(const s of [st,nx]){if(S.home.start&&addDays(s,6)<S.home.start)continue;const wk=S.plans[s];
      if(!wk||!wk.confirmed){if(s===nx&&daysBetween(today,s)>2)continue;out.push({ico:"🗓️",t:`Planifica la semana del ${shortDate(s)}`,s:"Entrenos, quién está, platos y compra",go:()=>{dlg.close();tab="menu";render();openWeekPlanner(s)}})}}}catch(e){}
  try{const st=weekStartFor(today);if(S.plans[st]&&weekCost(st)>weekFoodTarget(st)+0.5)out.push({ico:"💶",t:"Esta semana te pasas del presupuesto",s:`${eur(weekCost(st))} de ${eur(weekFoodTarget(st))}`,go:()=>{dlg.close();openSacrifice(st)}})}catch(e){}
  try{const ups=Object.keys(P).filter(rise);if(ups.length)out.push({ico:"📈",t:ups.length===1?"1 producto ha subido de precio":`${ups.length} productos han subido de precio`,s:ups.slice(0,3).map(p=>P[p].name.toLowerCase()).join(", "),go:go("compra")})}catch(e){}
  try{const old=freezerState().filter(e=>e.days>FREEZER_MONTHS*30);if(old.length)out.push({ico:"🧊",t:"Gasta esto pronto",s:old.map(e=>P[e.pid].name.toLowerCase()).join(", "),go:go("congelador")})}catch(e){}
  try{if(reviewCard())out.push({ico:"📊",t:"Resumen del mes pasado",s:"Cómo fue el presupuesto y qué ajustar",go:go("menu")})}catch(e){}
  try{if(surveyCard())out.push({ico:"📋",t:"Encuesta del mes",s:"Un minuto",go:()=>{dlg.close();openSurvey()}})}catch(e){}
  try{if(S.home.start&&S.home.start>today)out.push({ico:"🥫",t:`Tu plan empieza el ${shortDate(S.home.start)}`,s:"Mientras, ideas para gastar lo que tienes",go:()=>{dlg.close();openUseUp()}})}catch(e){}
  return out;
}
function renderBell(){
  const b=document.getElementById("bell");if(!b)return;b.hidden=!S.onboarded||tab==="wizard";
  const n=S.onboarded?inboxItems().length:0, el=document.getElementById("bellN");el.textContent=n>9?"9+":String(n);el.hidden=!n;
}
function openInbox(){
  const items=inboxItems();
  let next=[];try{if(avisosOn()&&S.notif&&S.notif.on)next=buildSchedule().slice(0,5)}catch(e){}
  showDialog(`<div class="mod">${closeBtn}<h2>Avisos</h2>
    ${items.length?items.map((x,i)=>`<button class="alt altimg inbox" data-ib="${i}"><span class="ibico">${x.ico}</span><span><b>${esc(x.t)}</b><small>${esc(x.s||"")}</small></span></button>`).join(""):`<div class="empty" style="box-shadow:none;background:var(--surface-2)"><h2>Todo al día</h2><p>No tienes nada pendiente.</p></div>`}
    ${next.length?`<h3 style="margin-top:16px">Próximos avisos en el móvil</h3>${next.map(a=>`<div class="fixed"><span>${esc(a.title)}<small>${esc(new Date(a.t).toLocaleString("es-ES",{weekday:"long",hour:"2-digit",minute:"2-digit"}))}</small></span></div>`).join("")}`
      :`<p class="small muted" style="margin-top:14px">${avisosOn()?"Activa los avisos en el móvil desde Perfil para que te lleguen aunque no tengas la app abierta.":""}</p>`}</div>`);
  dlg.querySelectorAll("[data-ib]").forEach(b=>b.onclick=()=>items[Number(b.dataset.ib)].go());
}

/* ---------- Instalar la app ---------- */
let installPrompt=null;
const isStandalone=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;if(S.onboarded&&tab==="menu")render()});
addEventListener("appinstalled",()=>{installPrompt=null;toast("¡Táper instalada! Ábrela desde el icono de tu pantalla");render()});
function installCard(){
  if(isStandalone()||(S.installHidden&&S.installHidden>todayISO()))return "";
  const ua=navigator.userAgent, samsung=/SamsungBrowser/i.test(ua), ios=/iPhone|iPad/i.test(ua), inApp=/(FBAN|FBAV|Instagram|Line|wv\)|GSA\/)/i.test(ua);
  let how;
  if(installPrompt)how=`<button class="btn" id="doInstall">📲 Instalar Táper</button>`;
  else if(inApp)how=`<p class="small">Estás en un navegador integrado. Toca <b>⋮</b> y elige <b>«Abrir en Chrome»</b>; allí aparecerá el botón para instalarla.</p>`;
  else if(samsung)how=`<p class="small">Toca el menú <b>≡</b> › <b>Añadir página a</b> › <b>Pantalla de inicio</b>.</p>`;
  else if(ios)how=`<p class="small">Toca <b>Compartir</b> (el cuadrado con la flecha) › <b>Añadir a pantalla de inicio</b>. Tus datos pasarán solos a la app${S.onboarded?` (código de traspaso, por si acaso: <b>${esc(transferCode())}</b>)`:""}.</p>`;
  else how=`<p class="small">En Chrome, toca <b>⋮</b> › <b>Instalar aplicación</b> (o <b>Añadir a pantalla de inicio</b> › <b>Instalar</b>).</p>`;
  return `<div class="rate"><h3>📲 Instala Táper en tu móvil</h3><p class="small muted">Tendrás su icono en la pantalla de inicio, funcionará sin conexión y te llegarán los avisos.</p>${how}
    <button class="btn ghost small" id="hideInstall" style="margin-top:6px">Ahora no</button></div>`;
}
function bindInstall(){
  document.getElementById("doInstall")?.addEventListener("click",async()=>{if(!installPrompt)return;installPrompt.prompt();const r=await installPrompt.userChoice;installPrompt=null;if(r.outcome!=="accepted")render()});
  document.getElementById("hideInstall")?.addEventListener("click",()=>{S.installHidden=addDays(todayISO(),7);save();render()});
}

/* ---------- Contador anónimo de uso y sugerencias ---------- */
let CFG={};
// GoatCounter: cuenta aperturas de la app sin cookies ni datos personales (se puede desactivar en Perfil)
function startCounter(){
  if(!CFG.goatcounter||S.noStats||location.hostname==="localhost"||location.hostname==="127.0.0.1")return;
  window.goatcounter={path:"/app",title:"Táper v"+APP_VERSION,no_onload:false};
  const s=document.createElement("script");s.async=true;s.dataset.goatcounter=CFG.goatcounter;s.src="https://gc.zgo.at/count.js";document.head.appendChild(s);
  if(!S.installCounted&&matchMedia("(display-mode: standalone)").matches){S.installCounted=true;save();
    setTimeout(()=>{try{window.goatcounter.count&&window.goatcounter.count({path:"instalada",title:"App instalada",event:true})}catch(e){}},3000)}
}
// Enlace al formulario de sugerencias con la versión de la app y el código de usuario ya rellenados
function suggestUrl(){if(!CFG.sugerencias)return null;let u=CFG.sugerencias.replace(/(entry\.\d+=)0(&|$)/,"$1"+APP_VERSION+"$2");
  const c=CFG.sugerenciasEnvio&&CFG.sugerenciasEnvio.campos&&CFG.sugerenciasEnvio.campos.contacto;if(c)u+="&"+c+"="+encodeURIComponent((me().name?me().name+" · ":"")+S.uid);return u}

/* ---------- Sugerir una receta ---------- */
// Se envía al formulario de sugerencias como "Receta nueva", con el texto ordenado para leerlo de un vistazo
const recipeSuggestOn=()=>!!(CFG.sugerenciasEnvio&&CFG.sugerenciasEnvio.url);
function openSuggestRecipe(){
  showDialog(`<div class="mod">${closeBtn}<h2>Sugerir una receta</h2><p class="small muted">Dinos qué receta te gustaría ver en Táper; con el nombre basta. Si encaja (rápida, sencilla y con productos del súper), la añadiremos para todos.</p>
    <div class="field"><label for="srN">¿Qué receta te gustaría?</label><input type="text" id="srN" placeholder="Por ejemplo, pollo al limón con arroz"></div>
    <details style="margin:6px 0 10px"><summary class="small"><b>Añadir detalles (opcional)</b></summary>
    <div class="field"><label for="srI">Ingredientes</label><textarea id="srI" rows="3" placeholder="Uno por línea, con cantidades si las sabes" style="width:100%;border:1.5px solid var(--line);background:var(--bg);border-radius:10px;padding:10px 12px;font:inherit;color:inherit"></textarea></div>
    <div class="field"><label for="srP">¿Cómo se hace?</label><textarea id="srP" rows="4" placeholder="Los pasos, como se lo explicarías a un amigo" style="width:100%;border:1.5px solid var(--line);background:var(--bg);border-radius:10px;padding:10px 12px;font:inherit;color:inherit"></textarea></div>
    <div class="row"><div class="field" style="flex:1"><label for="srT">Tiempo aprox. (min)</label><input type="number" id="srT" min="1" max="240"></div>
      <div class="field" style="flex:1.3"><label for="srA">Aparato</label><select id="srA"><option value="Sin indicar">Sin indicar</option>${Object.entries(APP).map(([k,v])=>`<option value="${esc(v)}">${esc(v)}</option>`).join("")}</select></div></div>
    <label class="row small"><input type="checkbox" id="srK" style="width:auto"> Suele gustar a niños</label></details>
    ${me().name?`<label class="row small" style="margin-top:10px"><input type="checkbox" id="srSign" checked style="width:auto"> Firmar como <b>${esc(me().name)}</b> (saldrá «Sugerida por ${esc(me().name)}»)</label>`:""}
    <div class="field" style="margin-top:10px"><label for="srC">Correo, por si queremos responderte (opcional)</label><input type="text" id="srC" inputmode="email"></div>
    <div class="actions"><button class="btn" id="srSend">Enviar receta</button></div></div>`);
  dlg.querySelector("#srSend").onclick=async()=>{
    const v=id=>dlg.querySelector(id).value.trim();
    if(!v("#srN")){toast("Escribe el nombre de la receta");return}
    const code="R-"+Math.random().toString(36).slice(2,6).toUpperCase();
    const sign=dlg.querySelector("#srSign")?.checked?me().name:"";
    const txt=`CÓDIGO: ${code}
USUARIO: ${S.uid}${sign?" · "+sign:" (anónimo)"}
RECETA: ${v("#srN")}

INGREDIENTES:
${v("#srI")||"(sin indicar)"}

CÓMO SE HACE:
${v("#srP")||"(sin indicar)"}

Tiempo: ${v("#srT")||"?"} min · Aparato: ${v("#srA")} · ${dlg.querySelector("#srK").checked?"Gusta a niños":"Sin indicar si gusta a niños"}`;
    const c=CFG.sugerenciasEnvio.campos, fd=new URLSearchParams();
    fd.append(c.tipo,CFG.sugerenciasEnvio.tipoReceta||"Receta nueva");fd.append(c.texto,txt);fd.append(c.contacto,[sign,v("#srC"),S.uid].filter(Boolean).join(" · "));fd.append(c.version,String(APP_VERSION));
    try{await fetch(CFG.sugerenciasEnvio.url,{method:"POST",mode:"no-cors",body:fd})}catch(e){toast("Sin conexión: inténtalo más tarde");return}
    S.mySug=S.mySug||[];S.mySug.push({code,name:v("#srN"),at:todayISO(),status:"enviada"});save();
    dlg.close();render();toast("¡Gracias! Receta enviada (código "+code+")");
  };
}

// ¿Alguna receta sugerida por esta persona ya está publicada? Avisa y la marca como aprobada
function checkApprovedSuggestions(){
  const mine=(S.mySug||[]).filter(x=>x.status==="enviada");if(!mine.length)return null;
  const done=[];for(const x of mine){const r=R.find(r=>r.sug===x.code);if(r){x.status="aprobada";x.rid=r.id;x.approvedAt=todayISO();done.push({x,r})}}
  if(!done.length)return null;
  for(const {r} of done)setDish(me(),r.id,2,"Es tu receta sugerida");
  save();
  try{if("Notification" in window&&Notification.permission==="granted")navigator.serviceWorker?.ready.then(reg=>reg.showNotification("🎉 Tu receta ya está en Táper",{body:done.map(d=>d.r.name).join(", "),icon:"icons/icon-192.png"}))}catch(e){}
  return done;
}
function showApproved(done){
  showDialog(`<div class="mod">${closeBtn}<h2>🎉 ¡Tu receta ya está en Táper!</h2>
    <p>Gracias por sugerirla. Ya está disponible para todos y te la propondré en tus menús.</p>
    ${done.map(({r})=>`<button class="alt" data-open3="${r.id}"><b>${esc(r.name)}</b><small>${recipeTime(r)} min · ${r.prot||"?"} g proteína</small></button>`).join("")}</div>`);
  dlg.querySelectorAll("[data-open3]").forEach(b=>b.onclick=()=>openRecipe(b.dataset.open3));
}

/* ---------- Encuesta de satisfacción mensual ---------- */
// Las opciones deben coincidir exactamente con las del formulario de Google
const SURVEY_FEATURES=["Menú semanal automático","Recetas y modo cocina","Lista de la compra y enlaces a supermercados (p. ej. Mercadona)","Precios actualizados",
  "Presupuesto y resumen del mes","Escáner de tickets","Adaptación a mis entrenos","Gustos y valoraciones","Planificación con la familia","Tápers y cocina por lotes","Avisos y notificaciones"];
const SURVEY_PAY=["De 1 a 3 €","De 4 a 6 €","De 7 a 9 €"];
const surveyOn=()=>!!(CFG.encuesta&&CFG.encuesta.url&&CFG.encuesta.campos&&CFG.encuesta.campos.estrellas);
function surveyCard(){
  if(!surveyOn()||!S.onboarded||S.noSurvey)return "";
  const m=todayISO().slice(0,7);S.surveys=S.surveys||{};
  if(S.surveys[m]||new Date().getDate()>12||(S.surveyLater&&S.surveyLater>todayISO()))return "";
  // Solo a quien lleva al menos una semana usándola
  const first=Object.keys(S.plans).sort()[0];if(!first||daysBetween(first,todayISO())<7)return "";
  return `<div class="rate"><h3>📋 Encuesta del mes · 1 minuto</h3><p class="small muted">Nos ayuda a mejorar Táper. Es anónima.</p>
    <div class="actions"><button class="btn small" id="svGo">Responder</button><button class="btn ghost small" id="svLater">Ahora no</button><button class="btn ghost small" id="svNever">No volver a preguntar</button></div></div>`;
}
function openSurvey(){
  const a={stars:0,like:new Set(),dislike:new Set(),pay:null,text:""};
  const keep=()=>{const t=dlg.querySelector("#svTxt");if(t)a.text=t.value};
  const draw=()=>{
    showDialog(`<div class="mod">${closeBtn}<h2>Encuesta del mes</h2>
      <h3 style="margin-top:12px">¿Cuántas estrellas le darías a Táper?</h3>
      <div class="chips">${[1,2,3,4,5].map(n=>`<button class="chip" data-st="${n}" style="font-size:1.3rem" aria-label="${n} estrellas">${n<=a.stars?"★":"☆"}</button>`).join("")}</div>
      <h3 style="margin-top:14px">¿Qué es lo que más te gusta?</h3><div class="chips">${SURVEY_FEATURES.map((f,i)=>chip("data-lk",i,a.like.has(f),esc(f))).join("")}</div>
      <h3 style="margin-top:14px">¿Y lo que menos?</h3><div class="chips">${SURVEY_FEATURES.map((f,i)=>chip("data-dk2",i,a.dislike.has(f),esc(f))).join("")}</div>
      <h3 style="margin-top:14px">Si tuvieras que pagar cada mes, ¿cuánto pagarías como máximo?</h3><div class="chips">${SURVEY_PAY.map((p,i)=>chip("data-py",i,a.pay===p,esc(p))).join("")}</div>
      <div class="field" style="margin-top:14px"><label for="svTxt">¿Algo más? (opcional)</label><input type="text" id="svTxt" value="${esc(a.text)}"></div>
      <div class="actions"><button class="btn" id="svSend">Enviar</button></div></div>`);
    dlg.querySelectorAll("[data-st]").forEach(b=>b.onclick=()=>{keep();a.stars=Number(b.dataset.st);draw()});
    const tog=(set,f)=>{if(set.has(f))set.delete(f);else set.add(f)};
    dlg.querySelectorAll("[data-lk]").forEach(b=>b.onclick=()=>{keep();tog(a.like,SURVEY_FEATURES[b.dataset.lk]);draw()});
    dlg.querySelectorAll("[data-dk2]").forEach(b=>b.onclick=()=>{keep();tog(a.dislike,SURVEY_FEATURES[b.dataset.dk2]);draw()});
    dlg.querySelectorAll("[data-py]").forEach(b=>b.onclick=()=>{keep();a.pay=SURVEY_PAY[b.dataset.py];draw()});
    dlg.querySelector("#svSend").onclick=async()=>{
      keep();a.text=a.text.trim();
      if(!a.stars){toast("Elige las estrellas");return}
      const c=CFG.encuesta.campos, fd=new URLSearchParams();
      fd.append(c.estrellas,String(a.stars));for(const f of a.like)fd.append(c.gusta,f);for(const f of a.dislike)fd.append(c.disgusta,f);
      if(a.pay&&c.pagaria)fd.append(c.pagaria,a.pay);if(a.text&&c.comentario)fd.append(c.comentario,a.text);if(c.version)fd.append(c.version,String(APP_VERSION));
      // Google Forms no deja leer la respuesta (no-cors): si no hay error de red, se da por enviada
      try{await fetch(CFG.encuesta.url,{method:"POST",mode:"no-cors",body:fd})}catch(e){toast("Sin conexión: vuelve a intentarlo más tarde");return}
      S.surveys=S.surveys||{};S.surveys[todayISO().slice(0,7)]={stars:a.stars,at:todayISO()};save();dlg.close();render();toast("¡Gracias por responder!")};
  };
  draw();
}
function bindSurvey(){
  document.getElementById("svGo")?.addEventListener("click",openSurvey);
  document.getElementById("svLater")?.addEventListener("click",()=>{S.surveyLater=addDays(todayISO(),3);save();render()});
  document.getElementById("svNever")?.addEventListener("click",()=>{S.noSurvey=true;save();render();toast("No volveré a preguntar. Puedes responder desde Perfil")});
}

/* ---------- Novedades y actualización automática ---------- */
let NEWS=null;
function openNews(all){
  const list=(NEWS||[]).filter(n=>all||n.version>(S.seenVersion||0)).sort((a,b)=>b.version-a.version);
  if(!list.length)return;
  showDialog(`<div class="mod">${closeBtn}<h2>${all?"Novedades":"🎉 Táper se ha actualizado"}</h2>
    ${list.map(n=>`<h3 style="margin-top:12px">${esc(n.titulo)} <span class="small muted">· ${esc(longDate(n.fecha).replace(/^\w+, /,""))}</span></h3><ul class="small">${n.cambios.map(c=>`<li>${esc(c)}</li>`).join("")}</ul>`).join("")}
    <div class="actions"><button class="btn" data-x>¡Entendido!</button></div></div>`);
  if(!all){S.seenVersion=APP_VERSION;save()}
}
// Al volver a la app comprueba si hay versión nueva y, si la hay, se recarga sola
async function checkUpdate(){
  try{const n=await getJSON("data/novedades.json",true);const last=Math.max(...n.versiones.map(v=>v.version));
    if(last>APP_VERSION&&!sessionStorage.getItem("taper-reload-"+last)){sessionStorage.setItem("taper-reload-"+last,"1");location.reload()}}catch(e){}
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){checkUpdate();
  // Al volver de los ajustes del móvil: si ya hay permiso, se activan los avisos
  if(avisosOn()&&Notification.permission==="granted"&&dlg.open&&dlg.querySelector("#permRetry"))enableAvisos().catch(()=>{});else if(tab==="perfil")render();renderBell()}});
async function getJSON(url,fresh){const r=await fetch(url,{cache:fresh?"no-store":"no-cache"});if(!r.ok)throw new Error(url+": "+r.status);return r.json()}
async function boot(){
  try{
    const [prods,recs]=await Promise.all([getJSON("data/productos.json"),getJSON("data/recetas.json")]);
    setProducts(prods.productos);setRecipes(recs.recetas);
  }catch(e){main.innerHTML=`<section class="view"><div class="empty"><h2>No se han podido cargar las recetas</h2><p>Comprueba la conexión y vuelve a abrir la app.</p></div></section>`;return}
  try{FEST=await getJSON("data/festivos.json")}catch(e){FEST=null}
  try{SUPERS=(await getJSON("data/supermercados.json")).supermercados}catch(e){SUPERS=[{id:"mercadona",nombre:"Mercadona",estado:"activo"}]}
  await loadMyPhotos();
  try{DISHPHOTOS=await getJSON("data/fotos_platos.json")}catch(e){DISHPHOTOS={}}
  PR=loadSavedPrices();
  // Precios de la zona del usuario: el almacén que corresponde a su código postal (si aún no está, los de la zona principal)
  try{ZONES=await getJSON("data/zonas.json",true)}catch(e){ZONES=null}
  const wh=ZONES&&S.home.cp?ZONES.cp[S.home.cp]:null;
  zoneMissing=!!(ZONES&&S.home.cp&&!wh);
  const prUrl=wh&&wh!==ZONES.principal?`data/precios/${wh}.json`:"data/precios.json";
  if(PR&&PR.codigo_postal_almacen&&wh&&PR.codigo_postal_almacen!==wh)PR=null;
  // Código postal sin precios propios: se pide solo al servidor (una vez por código postal)
  if(zoneMissing&&/^\d{5}$/.test(S.home.cp)&&S.zoneAsked!==S.home.cp){
    getJSON("data/config.json",true).then(c=>{if(c&&c.avisos&&c.avisos.url)return fetch(c.avisos.url.replace(/\/$/,"")+"/zona",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cp:S.home.cp})})})
      .then(r=>{if(r&&r.ok){S.zoneAsked=S.home.cp;save()}}).catch(()=>{})}
  try{const fresh=await getJSON(prUrl+"?t="+Date.now(),true);
    if(fresh&&fresh.productos){PR=fresh;prOffline=false;try{localStorage.setItem("taper-precios",JSON.stringify(PR))}catch(e){}}}
  catch(e){prOffline=!!PR}
  try{PS=JSON.parse(localStorage.getItem("taper-precios-supers")||"null")}catch(e){PS=null}
  try{const f=await getJSON("data/precios_supers.json?t="+Date.now(),true);if(f&&f.supers){PS=f;try{localStorage.setItem("taper-precios-supers",JSON.stringify(PS))}catch(e){}}}catch(e){}
  try{AJ=JSON.parse(localStorage.getItem("taper-ajustes")||"null")}catch(e){AJ=null}
  try{NEWS=(await getJSON("data/novedades.json",true)).versiones}catch(e){NEWS=null}
  try{CFG=await getJSON("data/config.json",true)}catch(e){CFG={}}
  try{if(CFG.avisos&&CFG.avisos.url){const a=await (await fetch(CFG.avisos.url.replace(/\/$/,"")+"/ajustes",{cache:"no-store"})).json();if(a&&a.productos){AJ=a;try{localStorage.setItem("taper-ajustes",JSON.stringify(AJ))}catch(e){}}}}catch(e){}
  // Al abrir, la semana actual y la siguiente tienen menú si ya se había planificado alguna
  if(S.onboarded){
    // Platos ya planificados sin foto (y no elegidos a mano): se cambian por otros
    for(const [s,wk] of Object.entries(S.plans))if(addDays(s,6)>=todayISO())for(const [id,v] of Object.entries(wk.slots||{}))if(v.recipe&&RX[v.recipe]&&!hasPhoto(RX[v.recipe])&&!v.locked)delete wk.slots[id];
    ensureHorizon();for(const s of Object.keys(S.plans))if(addDays(s,6)>=todayISO())ensureWeek(s);save();
    // Si el plan aún no ha empezado, el Menú abre directamente en el mes en que empieza
    if(S.home.start&&S.home.start>todayISO()&&!weeksInMonth(month).some(s=>addDays(s,6)>=S.home.start))month=S.home.start.slice(0,7)}
  render();
  // Tras actualizar: explica qué ha mejorado (no a quien acaba de empezar); y avisa si su receta sugerida ya está
  const approved=checkApprovedSuggestions();
  if(approved)showApproved(approved);
  else if(S.onboarded&&NEWS&&(S.seenVersion||0)<APP_VERSION)openNews(false);
  else if(!S.onboarded){S.seenVersion=APP_VERSION;save()}
  checkUpdate();startCounter();
  if(avisosOn()&&S.notif&&S.notif.on){shareWithSW().catch(()=>{});queueSyncAvisos()}
  trackOnBoot();checkAvisos();applyAccent();applySkin();if(servidorOn())loadStats().then(()=>{applyAccent();applySkin()}).catch(()=>{});
  {const u=new URLSearchParams(location.search),t=u.get("hecho")||u.get("abrir");if(t){notifAction(u.get("hecho")?"hecho":"abrir",t);history.replaceState(null,"",location.pathname)}}
  casaOnBoot().then(j=>{if(!j&&!shareOnBoot())setTimeout(()=>openRateDialog(),1500)});
  navigator.serviceWorker&&navigator.serviceWorker.addEventListener("message",e=>{if(e.data&&e.data.tipo)notifAction(e.data.tipo,e.data.tag)});watchPermission();checkTransferOnBoot();queueTransfer();
}
boot();
if("serviceWorker" in navigator&&location.protocol!=="file:")navigator.serviceWorker.register("sw.js").catch(()=>{});
