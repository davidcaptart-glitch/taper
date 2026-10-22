/* Táper · interfaz: menú, compra, recetas, perfil y ventanas */
"use strict";

const main=document.getElementById("main");
const dlg=document.getElementById("dlg");
let tab="menu", month=todayISO().slice(0,7), listSel="mes", recFilter="todas", recSearch="";

/* ---------- Cabecera ---------- */
function renderHeader(){
  const onb=S.onboarded&&tab!=="wizard";
  document.querySelector(".top .ticket").hidden=!onb;
  document.querySelector(".monthnav").style.visibility=onb&&(tab==="menu"||tab==="compra")?"visible":"hidden";
  document.querySelector("nav.tabs").hidden=!onb;
  document.getElementById("monthLabel").textContent=monthName(month);
  document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-current",b.dataset.tab===tab?"page":"false"));
  const pd=document.getElementById("priceDate");
  if(PR&&PR.fecha){const ups=Object.keys(P).filter(rise).length;
    pd.innerHTML=`Precios del <b>${esc(longDate(PR.fecha).replace(/^\w+, /,""))}</b>${prOffline?" (última copia guardada)":""}${ups?` · <span class="up">▲ ${ups} ${ups===1?"producto ha subido":"productos han subido"}</span>`:""}`}
  else pd.textContent="Precios estimados: aún no se han descargado los de Mercadona";
  if(!onb)return;
  const sh=shopping(month), budget=Number(S.home.budget.month)||0, spent=sh.total;
  const real=Object.entries(S.spent).filter(([k])=>k.startsWith(month+"|")).reduce((t,[,v])=>t+(Number(v)||0),0);
  document.getElementById("spent").textContent=eur(spent);
  document.getElementById("budgetOf").textContent="de "+eur(budget);
  const bar=document.getElementById("bar");bar.classList.toggle("over",spent>budget);
  bar.firstElementChild.style.width=Math.min(100,budget?spent/budget*100:0)+"%";
  const note=document.getElementById("budgetNote");note.classList.toggle("over",spent>budget);
  note.textContent=(spent>budget?"Te pasas "+eur(spent-budget)+" con lo previsto. Cambia algún plato o revisa el presupuesto.":"Previsto este mes · te sobran "+eur(budget-spent))+(real?` · Gastado de verdad: ${eur(real)}`:"");
}
function render(){
  if(!S.onboarded&&tab!=="wizard")tab="wizard";
  renderHeader();
  if(tab==="wizard")return renderWizard();
  if(tab==="menu")renderMenu();
  if(tab==="compra")renderCompra();
  if(tab==="recetas")renderRecetas();
  if(tab==="perfil")renderPerfil();
}

/* ---------- Menú ---------- */
function slotFor(d,meal){const start=weekStartFor(d);return buildSlots(start).find(s=>s.id===d+"|"+meal)}
const nutrTxt=n=>n.kcal==null?`${n.prot} g proteína`:`${n.kcal.toLocaleString("es-ES")} kcal · ${n.prot} g proteína · ${n.carb} g hidratos · ${n.fat} g grasa`;
function needLine(sl,r){
  if(sl.fixed&&sl.fixed.capricho)return `<div class="need muted">🍕 Capricho: no cuenta para tus objetivos</div>`;
  if(!sl.need.why.length)return "";
  return `<div class="need">${sl.need.carbs?"⚡ Con hidratos":"💪 Con proteína"}: ${esc(sl.need.why.join("; "))}${sl.need.noHeavy?" · nada pesado":""}</div>`;
}
function mealLine(d,meal,wk){
  const st=mealState(d,meal);
  const label=meal==="comida"?"Comida":"Cena";
  if(st==="taper"){const prev=dishOfMeal(d,"comida");
    return `<div class="meta"><b>${label}:</b> táper${prev.recipe?" de "+esc(prev.recipe.name.toLowerCase()):""}</div>${prev.recipe&&!prev.capricho?`<div class="nutr">Tu táper: ${nutrTxt(portionNutr(prev.recipe,adultFactor(me())))}</div>`:""}`}
  if(st==="fuera"||st==="libre")return `<div class="meta"><b>${label}:</b> ${MEALSTATE[st].toLowerCase()}</div>`;
  const sl=slotFor(d,meal);if(!sl)return "";
  const v=wk&&wk.slots[sl.id], r=v&&RX[v.recipe];
  const who=[...(st==="solotaper"?[]:["tú"]),...sl.kids.map(k=>personName(k))];
  let h=`<div style="margin-top:6px"><div class="small muted">${label}${st==="solotaper"?" (solo el táper de mañana)":""}${sl.tupper.length&&st!=="solotaper"?" + táper de mañana":""}${sl.kids.length?" · con "+esc(sl.kids.map(personName).join(" y ")):""}</div>`;
  if(r)h+=`<button class="name" data-open="${r.id}" data-slot="${sl.id}">${esc(r.name)}</button>`;
  else if(sl.fixed)h+=`<b>${esc(sl.fixed.name)}</b>`;
  h+=`<div class="meta">${r?`${recipeTime(r)} min · ${r.prot||"?"} g proteína · ${String(sl.portions).replace(".",",")} raciones`:sl.fixed?"Plato fijo":""}</div>`;
  if(r){const ps=(st==="solotaper"?[]:sl.eaters).concat(sl.kids);
    h+=ps.map(p=>`<div class="nutr">${p.kind==="adulto"?"Tu plato":esc(personName(p))}: ${nutrTxt(portionNutr(r,factorOf(p)))}</div>`).join("")}
  h+=needLine(sl,r);
  if(r){
    if(S.home.cookMode==="lote"){const k=keepPlan(r,sl);
      h+=`<div class="thaw">${k.freeze?`❄️ Se cocina el ${DAYS[dow(k.cook)].toLowerCase()} y se congela: pásalo a la nevera la noche del ${DAYS[dow(addDays(sl.date,-1))].toLowerCase()}`:`Se cocina el ${DAYS[dow(k.cook)].toLowerCase()} · aguanta ${r.fridge} días en la nevera`}</div>`}
    else{const th=r.ing.filter(([p])=>P[p].thaw).map(([p])=>P[p].name.toLowerCase());
      if(th.length)h+=`<div class="thaw">La noche anterior, pasa ${esc(th.join(" y "))} del congelador a la nevera.</div>`}
    h+=`<div class="ops"><button class="btn ghost small" data-swap="${sl.id}">Cambiar plato</button></div>`;
  }
  return h+`</div>`;
}
/* ---------- ¿Qué tal? (después de cada comida) ---------- */
// Comidas ya pasadas sin respuesta: se pregunta hora y media después de la hora de cada comida
function pendingMeals(){
  const now=new Date(), today=todayISO(), mins=now.getHours()*60+now.getMinutes(), out=[];
  const after=m=>{const [hh,mm]=(S.home.mealTimes[m]||"14:00").split(":").map(Number);return hh*60+mm+90};
  S.meals=S.meals||{};
  for(let i=4;i>=0;i--){
    const d=addDays(today,-i);
    for(const meal of ["comida","cena"]){
      if(i===0&&mins<after(meal))continue;
      const key=d+"|"+meal;if(S.meals[key])continue;
      const wk=S.plans[weekStartFor(d)];if(!wk||d<(wk.createdAt||"9"))continue;
      const st=mealState(d,meal);
      if(st==="taper"){const x=dishOfMeal(d,"comida");if(x.recipe)out.push({key,d,meal,r:x.recipe,taper:true,who:[]});continue}
      if(st!=="cocinar")continue;
      const sl=buildSlots(weekStartFor(d)).find(s=>s.id===key);if(!sl)continue;
      const v=wk.slots[sl.id], r=v&&RX[v.recipe];if(!r)continue;
      const who=sl.eaters.concat(sl.kids).filter(p=>!S.ratings.some(x=>x.slot===key&&x.who===p.id));
      if(!who.length){S.meals[key]={status:"ok"};continue}
      out.push({key,d,meal,r,taper:false,who,sl});
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
  const {key,d,meal,r,taper,who}=list[list.length-1];
  const when=(meal==="comida"?"la comida":"la cena")+" del "+longDate(d);
  if(taper)return `<div class="rate"><h3>¿Te comiste el táper de ${esc(r.name.toLowerCase())}?</h3><div class="small muted">${esc(when)}${list.length>1?` · ${list.length-1} más pendientes`:""}</div>
    <div class="actions"><button class="btn small" data-ate="${key}">Sí</button><button class="btn ghost small" data-notate="${key}|${r.id}">No, otra cosa</button></div></div>`;
  return `<div class="rate"><h3>¿Qué tal ${esc(r.name.toLowerCase())}?</h3><div class="small muted">${esc(when)}${list.length>1?` · ${list.length-1} más pendientes`:""}</div>
    ${who.map(p=>`<div class="who"><div class="small"><b>${esc(personName(p))}</b></div><div class="chips">
      <button class="chip" data-rate="${key}|${r.id}|${p.id}|2">❤️ Me encantó</button><button class="chip" data-rate="${key}|${r.id}|${p.id}|1">👍 Bien</button>
      <button class="chip" data-rate="${key}|${r.id}|${p.id}|rare">🙂 Bien, pero no a menudo</button><button class="chip" data-rate="${key}|${r.id}|${p.id}|-1">👎 No me gustó</button></div></div>`).join("")}
    <button class="btn ghost small" style="margin-top:8px" data-notate="${key}|${r.id}">No me lo comí o comí otra cosa</button></div>`;
}
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
function renderMenu(){
  const weeks=weeksInMonth(month);
  let h=`<section class="view">`+rateCard();
  if(!weeks.length)h+=`<div class="empty"><p>No hay semanas que empiecen este mes.</p></div>`;
  for(const start of weeks){
    const wk=S.plans[start], dates=weekDates(start);
    if(dates[6]<todayISO()&&!wk)continue;   // semanas pasadas sin menú: nada que enseñar
    h+=`<div class="week"><div class="weekhead"><h2>${shortDate(start)} – ${shortDate(dates[6])}</h2>${wk&&wk.confirmed?`<span class="badge ok">Planificada</span>`:""}</div>`;
    if(!wk||!Object.keys(wk.slots||{}).length){h+=`<div class="empty"><p>Aún no hay menú para esta semana.</p><button class="btn" data-plan="${start}">Planificar la semana</button></div></div>`;continue}
    const {changed}=ensureWeek(start);if(changed)save();
    h+=`<div class="weekacts"><button class="btn small" data-plan="${start}">${wk.confirmed?"Revisar la semana":"Planificar la semana"}</button><button class="btn ghost small" data-regen="${start}">Rehacer platos</button></div>`;
    for(const g of tupperGaps(start))h+=`<div class="warnbox">El ${DAYS[dow(g)].toLowerCase()} ${shortDate(g)} no tienes táper: la cena de la víspera no se cocina. <button class="btn ghost small" data-day="${g}">Arreglarlo</button></div>`;
    if(S.home.cookMode==="lote"){const cds=[...new Set(buildSlots(start).filter(s=>wk.slots[s.id]).map(s=>cookDayFor(s.date)))].sort();
      for(const cd of cds){const n=buildSlots(start).filter(s=>cookDayFor(s.date)===cd&&wk.slots[s.id]&&RX[wk.slots[s.id].recipe]).length;
        h+=`<div class="session"><b>Sesión de cocina: ${esc(longDate(cd))}</b><div class="small muted">${n} platos</div><button class="btn ghost small" data-session="${cd}">Ver la sesión</button></div>`}}
    for(const d of dates){
      const ks=kidsAt(d), hol=isHoliday(d), a=me(), pt=a?dayProtein(a,d):null;
      const sess=sessionsOn(d);
      const empty=["comida","cena"].every(m=>["fuera","libre"].includes(mealState(d,m)));
      h+=`<div class="slot ${empty?"extra":""}"><div class="day">${DSHORT[dow(d)]}<small>${shortDate(d)}</small></div><div>
        <div class="tags">${hol?`<span class="pill carga">${esc(holidayName(d))}</span>`:""}${ks.map(k=>`<span class="pill kid">${esc(personName(k))}</span>`).join("")}${sess.map(s=>`<span class="pill ligera">${esc(SPORTS[s.type])} ${s.when==="manana"?"mañana":"tarde"}</span>`).join("")}</div>
        ${mealLine(d,"comida",wk)}${mealLine(d,"cena",wk)}
        ${dayCounter(d,pt)}
        <div class="ops"><button class="btn ghost small" data-day="${d}">Cambiar este día</button></div></div></div>`;
    }
    h+=`</div>`;
  }
  main.innerHTML=h+`</section>`;
  main.querySelectorAll("[data-plan]").forEach(b=>b.onclick=()=>openWeekPlanner(b.dataset.plan));
  main.querySelectorAll("[data-regen]").forEach(b=>b.onclick=()=>{if(confirm("¿Rehacer los platos de esta semana? Se mantienen los que elegiste a mano.")){genWeekFromScratch(b.dataset.regen);save();render();toast("Platos rehechos")}});
  main.querySelectorAll("[data-swap]").forEach(b=>b.onclick=()=>openSwap(b.dataset.swap));
  main.querySelectorAll("[data-day]").forEach(b=>b.onclick=()=>openDay(b.dataset.day));
  main.querySelectorAll("[data-session]").forEach(b=>b.onclick=()=>openSession(b.dataset.session));
  main.querySelectorAll("[data-rate]").forEach(b=>b.onclick=()=>{const [sid,rid,who,v]=b.dataset.rate.split("|");
    if(v==="-1"){openDislike(rid,who,sid);return}
    addRating({slot:sid,rid,who,v:v==="rare"?1:Number(v),rare:v==="rare"});if(v==="2")setDish(S.people.find(p=>p.id===who),rid,2,"Te encantó");render();toast("¡Apuntado!")});
  main.querySelectorAll("[data-ate]").forEach(b=>b.onclick=()=>{S.meals[b.dataset.ate]={status:"ok"};save();render()});
  main.querySelectorAll("[data-notate]").forEach(b=>b.onclick=()=>{const v=b.dataset.notate;openNotEaten(v.slice(0,v.lastIndexOf("|")),v.slice(v.lastIndexOf("|")+1))});
  bindOpen();
}

/* ---------- Ventanas ---------- */
function showDialog(html,full){dlg.className=full?"full":"";dlg.innerHTML=html;if(!dlg.open)dlg.showModal();dlg.querySelectorAll("[data-x]").forEach(b=>b.onclick=()=>dlg.close())}
const closeBtn=`<button class="close" aria-label="Cerrar" data-x>✕</button>`;

// Cambiar un día concreto: quién está y qué se hace en cada comida
function openDay(d){
  const o=S.days[d]=S.days[d]||{};
  const draw=()=>{
    const ks=kids();
    showDialog(`<div class="mod">${closeBtn}<h2>${esc(longDate(d))}</h2>${isHoliday(d)?`<span class="pill carga">${esc(holidayName(d))}</span>`:""}
      ${ks.length?`<h3 style="margin-top:12px">¿Quién está?</h3><div class="chips">${ks.map(k=>chip("data-dk",k.id,kidsAt(d).includes(k),esc(personName(k)))).join("")}</div>`:""}
      ${["comida","cena"].map(m=>`<h3 style="margin-top:12px">${m==="comida"?"Comida":"Cena"}</h3><div class="chips">${(m==="comida"?["taper","cocinar","fuera","libre"]:["cocinar","solotaper","fuera","libre"]).map(v=>chip("data-dm",m+":"+v,mealState(d,m)===v,v==="solotaper"?"Solo el táper":MEALSTATE[v])).join("")}</div>`).join("")}
      <div class="actions"><button class="btn ghost" data-reset>Como la semana tipo</button><button class="btn" data-x>Hecho</button></div></div>`);
    dlg.querySelectorAll("[data-dk]").forEach(b=>b.onclick=()=>{const id=b.dataset.dk;o.kids=o.kids||{};o.kids[id]=!kidsAt(d).some(k=>k.id===id);after()});
    dlg.querySelectorAll("[data-dm]").forEach(b=>b.onclick=()=>{const [m,v]=b.dataset.dm.split(":");changeMeal(d,m,v,draw)});
    dlg.querySelector("[data-reset]").onclick=()=>{delete S.days[d];after();dlg.close()};
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
  const sel=R.filter(r=>variantFor(r)).sort((a,b)=>a.name.localeCompare(b.name));
  showDialog(`<div class="mod">${closeBtn}<h2>Cambiar plato</h2><div class="small muted">${esc(longDate(d))}, ${sl.meal}${sl.kids.length?" · con "+esc(sl.kids.map(personName).join(" y ")):""}</div>
    ${needLine(sl)}
    <div style="margin-top:10px">${alts.map(({r,miss})=>`<button class="alt" data-pick="${r.id}"><b>${esc(r.name)}</b><small>${recipeTime(r)} min · ${r.prot||"?"} g proteína · ${eur(rationCost(r))}/ración · ${r.type==="c"?"⚡ hidratos":"🥗 ligera"}</small>
      ${miss?(miss.length?`<span class="badge miss">Te falta: ${esc(miss.slice(0,3).map(p=>P[p].name.toLowerCase()).join(", "))}${miss.length>3?"…":""}</span>`:`<span class="badge ok">Tienes todo</span>`):""}</button>`).join("")||"<p>No hay alternativas con tus filtros.</p>"}</div>
    <div class="field"><label for="anyR">O elige cualquier receta</label><select id="anyR"><option value="">…</option>${sel.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join("")}</select></div></div>`);
  const pick=rid=>{setSlotRecipe(sl,rid);dlg.close();render();
    const inv=inventory(monthOfWeek(weekStartFor(d)),sl.id);const miss=inv?missingFor(RX[rid],sl,inv):[];
    toast(miss.length?"Cambiado. Añadido a la lista: "+miss.map(p=>P[p].name.toLowerCase()).join(", "):"Cambiado por "+RX[rid].name)};
  dlg.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>pick(b.dataset.pick));
  dlg.querySelector("#anyR").onchange=e=>{if(e.target.value)pick(e.target.value)};
}
function openDislike(rid,who,sid){
  const r=RX[rid], p=S.people.find(x=>x.id===who);
  showDialog(`<div class="mod">${closeBtn}<h2>¿Por qué no ${p.kind==="adulto"?"te":"le"} gustó?</h2><div class="small muted">${esc(r.name)} · ${esc(personName(p))}</div>
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
function openRecipe(id,sid){
  const r=RX[id];let serv=2;let vi=Math.max(0,r.vars.indexOf(variantFor(r)));
  const sl=sid?slotFor(sid.slice(0,10),sid.slice(11)):null;if(sl)serv=sl.portions;
  const draw=()=>{
    const v=r.vars[vi], ok=new Set([...S.home.apps,"ninguno"]);
    const cost=rationCost(r);
    showDialog(`<div class="mod">${closeBtn}
      <span class="pill ${r.type==="c"?"carga":"ligera"}">${r.type==="c"?"⚡ Con hidratos":"🥗 Ligera"}</span>${r.kid?` <span class="pill kid">Gusta a niños</span>`:""}${r.heavy?` <span class="pill fixed">Pesada</span>`:""}
      <h2>${esc(r.name)}</h2>
      <div class="stats"><div><b>${v.time} min</b><small>${v.active} de trabajo</small></div><div><b>${r.prot||"?"} g</b><small>proteína</small></div><div><b>${r.kcal?r.kcal+" kcal":eur(cost)}</b><small>${r.kcal?eur(cost)+"/ración":"por ración"}</small></div></div>
      ${r.carb!=null?`<div class="small muted">Por ración: ${r.carb} g hidratos · ${r.fat} g grasa · aguanta ${r.fridge} días en la nevera${r.freeze?" · se puede congelar":""}</div>`:""}
      ${sl?`<div class="nutr" style="margin-top:6px">${(sl.eaters.length?sl.eaters:sl.tupper).concat(sl.kids).map(p=>`<div>${p.kind==="adulto"?"Tu plato":esc(personName(p))}: ${nutrTxt(portionNutr(r,factorOf(p)))}</div>`).join("")}</div>`:""}
      ${r.vars.length>1?`<div class="vtabs">${r.vars.map((x,i)=>`<button class="chip" data-vi="${i}" aria-pressed="${i===vi}" ${ok.has(x.app)?"":"disabled"}>${APP[x.app]}</button>`).join("")}</div>`:""}
      <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0"><h3>Ingredientes</h3>
        <div><button class="btn ghost small" data-s="-0.5" aria-label="Menos raciones">−</button> <b>${String(serv).replace(".",",")}</b> rac. <button class="btn ghost small" data-s="0.5" aria-label="Más raciones">+</button></div></div>
      <table>${r.ing.map(([p,q])=>`<tr><td>${esc(P[p].name)}</td><td>${fmtQty(q*serv,P[p].unit)}</td></tr>`).join("")}<tr><td>Aceite, sal y especias</td><td>al gusto</td></tr></table>
      <h3 style="margin-top:14px">Paso a paso (${APP[v.app].toLowerCase()})</h3>
      <ol>${v.steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol>
      <div class="actions"><button class="btn" data-cook>👩‍🍳 Cocinar paso a paso</button></div>
      <div class="actions"><select id="rWho" style="width:auto">${S.people.map(p=>`<option value="${p.id}">${esc(personName(p))}</option>`).join("")}</select>
        <button class="btn ghost small" data-love>❤️ Me encanta</button><button class="btn ghost small" data-hate>👎 No me gusta</button></div>
      <h3 style="margin-top:10px">Más como esta</h3><div>${similar(r).map(x=>`<button class="alt" data-sim="${x.id}"><b>${esc(x.name)}</b><small>${recipeTime(x)} min · ${x.prot||"?"} g proteína</small></button>`).join("")}</div></div>`);
    dlg.querySelectorAll("[data-vi]").forEach(b=>b.onclick=()=>{vi=Number(b.dataset.vi);draw()});
    dlg.querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>{serv=Math.max(0.5,serv+Number(b.dataset.s));draw()});
    dlg.querySelector("[data-cook]").onclick=()=>openCook(r,r.vars[vi],serv);
    const who=()=>S.people.find(p=>p.id===dlg.querySelector("#rWho").value);
    dlg.querySelector("[data-love]").onclick=()=>{setDish(who(),r.id,2,"Lo marcaste como favorito");toast("❤️ Apuntado para "+personName(who()))};
    dlg.querySelector("[data-hate]").onclick=()=>openDislike(r.id,who().id,null);
    dlg.querySelectorAll("[data-sim]").forEach(b=>b.onclick=()=>openRecipe(b.dataset.sim));
  };
  draw();
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
    const step=v.steps[i], m=step.match(/(\d+)(?:\s*[–-]\s*(\d+))?\s*min/);
    showDialog(`<div class="cook"><div class="top"><span class="n">Paso ${i+1} de ${v.steps.length} · ${esc(r.name)}</span><button class="close" data-x aria-label="Salir">✕</button></div>
      <div class="txt">${esc(step)}</div>
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
  showDialog(`<div class="mod">${closeBtn}<h2>Sesión del ${esc(longDate(cd))}</h2>
    <p class="small muted">${out.length} platos · unos ${Math.max(active,longest)} min si vas encadenando. Empieza por el horno y, mientras, ve con la vitro.</p>
    ${out.map((o,i)=>`<div class="session"><b>${i+1}. ${esc(o.r.name)}</b><div class="small muted">${APP[o.v.app]} · ${o.v.time} min (${o.v.active} de trabajo) · ${String(o.sl.portions).replace(".",",")} raciones</div>
      <div class="small">${esc([o.sl.eaters.length?`cena del ${DAYS[dow(o.sl.date)].toLowerCase()}`:"",o.sl.tupper.length?`táper del ${DAYS[dow(addDays(o.sl.date,1))].toLowerCase()}`:""].filter(Boolean).join(" + "))}${o.k.freeze?" · ❄️ congélalo":""}</div>
      <button class="btn ghost small" data-open2="${o.r.id}" data-sl="${o.sl.id}">Ver receta</button></div>`).join("")}</div>`);
  dlg.querySelectorAll("[data-open2]").forEach(b=>b.onclick=()=>openRecipe(b.dataset.open2,b.dataset.sl));
}

/* ---------- Planificar la semana ---------- */
function openWeekPlanner(start){
  let step=0;
  const wk=S.plans[start]=S.plans[start]||{start,slots:{},training:null,confirmed:false};
  if(!wk.training){wk.training={};for(const d of weekDates(start))wk.training[d]=JSON.parse(JSON.stringify(sessionsOn(d)))}
  const a=me(), sports=a&&a.sports.length?a.sports:Object.keys(SPORTS);
  const draw=()=>{
    let h=`<div class="mod">${closeBtn}<div class="small muted">Semana del ${shortDate(start)} · paso ${step+1} de 4</div>`;
    if(step===0){
      h+=`<h2>¿Cómo entrenas esta semana?</h2><p class="small muted">Viene rellena con tu semana habitual.</p>`;
      for(const d of weekDates(start)){const ss=wk.training[d]||[];
        h+=`<div class="daycard"><div class="row"><b>${DSHORT[dow(d)]} ${shortDate(d)}</b><span class="spacer"></span>${ss.length<2?`<button class="btn ghost small" data-as="${d}">+ Sesión</button>`:""}</div>
        ${ss.map((s,i)=>`<div class="sess"><select data-tw="${d}|${i}"><option value="manana" ${s.when==="manana"?"selected":""}>Mañana</option><option value="tarde" ${s.when==="tarde"?"selected":""}>Tarde</option></select>
        <select data-tt="${d}|${i}">${sports.map(k=>`<option value="${k}" ${s.type===k?"selected":""}>${SPORTS[k]}</option>`).join("")}</select><button class="btn ghost small" data-ds="${d}|${i}">✕</button></div>`).join("")}</div>`}
    }
    if(step===1){
      h+=`<h2>¿Quién está y qué cambia?</h2><p class="small muted">Toca para cambiar cualquier comida: si comes fuera, tienes un plan o están los niños.</p>`;
      for(const d of weekDates(start)){const ks=kidsAt(d);
        h+=`<div class="daycard"><div class="row"><b>${DSHORT[dow(d)]} ${shortDate(d)}</b>${isHoliday(d)?`<span class="pill carga">${esc(holidayName(d))}</span>`:""}</div>
        ${kids().length?`<div class="chips" style="margin-top:6px">${kids().map(k=>chip("data-wk",d+"|"+k.id,ks.includes(k),esc(personName(k)))).join("")}</div>`:""}
        <div class="row small" style="margin-top:6px">Comida: <select data-wm="${d}|comida" style="width:auto">${["taper","cocinar","fuera","libre"].map(v=>`<option value="${v}" ${mealState(d,"comida")===v?"selected":""}>${MEALSTATE[v]}</option>`).join("")}</select>
        Cena: <select data-wm="${d}|cena" style="width:auto">${["cocinar","solotaper","fuera","libre"].map(v=>`<option value="${v}" ${mealState(d,"cena")===v?"selected":""}>${v==="solotaper"?"Solo táper":MEALSTATE[v]}</option>`).join("")}</select></div></div>`}
    }
    if(step===2){
      ensureWeek(start);save();
      h+=`<h2>Los platos</h2><p class="small muted">Toca una alternativa para cambiarlo.</p><button class="btn ghost small" data-rg>Proponer otros platos</button>`;
      for(const sl of buildSlots(start)){const v=wk.slots[sl.id],r=v&&RX[v.recipe];
        h+=`<div class="daycard"><div class="small muted">${DSHORT[dow(sl.date)]} ${shortDate(sl.date)} · ${sl.meal}${sl.kids.length?" · con "+esc(sl.kids.map(personName).join(" y ")):""}</div>
        <b>${r?esc(r.name):esc(sl.fixed?sl.fixed.name:"—")}</b>${needLine(sl)}
        ${r&&!sl.fixed?`<div class="chips" style="margin-top:6px">${alternatives(sl,3).map(({r:x})=>`<button class="chip" data-alt="${sl.id}|${x.id}">${esc(x.name)}</button>`).join("")}</div>`:""}</div>`}
    }
    if(step===3){
      const m=monthOfWeek(start), sh=shopping(m), wi=sh.weeks.indexOf(start), l=sh.lists[wi], wb=weekBudget(m);
      h+=`<h2>La compra</h2>`;
      if(wi===0)h+=`<p>Compra del mes: <b>${eur(sh.lists.mes.cost+sh.lists.mes.fee)}</b> (${sh.lists.mes.mode==="online"?"online":"en tienda"})</p>`;
      h+=`<p>Compra de esta semana: <b>${eur(l?l.cost+l.fee:0)}</b> (${l&&l.mode==="online"?"online":"en tienda"})</p>
        <p>Previsto esta semana: <b>${eur(sh.perWeek[wi]||0)}</b> de ${eur(wb)} de presupuesto semanal.</p>
        ${(sh.perWeek[wi]||0)>wb?`<div class="warnbox">Te pasas ${eur((sh.perWeek[wi]||0)-wb)}. Vuelve al paso anterior y elige platos más baratos, o revisa el presupuesto.</div>`:`<div class="okbox">Dentro del presupuesto.</div>`}
        ${l&&l.belowMin?`<div class="warnbox">El pedido online no llega al mínimo de ${eur(S.home.shop.min)}. En la pestaña Compra puedes completarlo con cosas del mes.</div>`:""}`;
    }
    h+=`<div class="actions">${step>0?`<button class="btn ghost" data-pb>Atrás</button>`:""}<button class="btn" data-pn>${step===3?"Confirmar la semana":"Siguiente"}</button></div></div>`;
    showDialog(h);
    const q=s=>dlg.querySelectorAll(s);
    q("[data-as]").forEach(b=>b.onclick=()=>{const d=b.dataset.as;(wk.training[d]=wk.training[d]||[]).push({when:"tarde",type:sports[0]});save();draw()});
    q("[data-ds]").forEach(b=>b.onclick=()=>{const [d,i]=b.dataset.ds.split("|");wk.training[d].splice(Number(i),1);save();draw()});
    q("[data-tw]").forEach(s=>s.onchange=()=>{const [d,i]=s.dataset.tw.split("|");wk.training[d][i].when=s.value;save()});
    q("[data-tt]").forEach(s=>s.onchange=()=>{const [d,i]=s.dataset.tt.split("|");wk.training[d][i].type=s.value;save()});
    q("[data-wk]").forEach(b=>b.onclick=()=>{const [d,id]=b.dataset.wk.split("|");const o=S.days[d]=S.days[d]||{};o.kids=o.kids||{};o.kids[id]=!kidsAt(d).some(k=>k.id===id);save();draw()});
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
function renderCompra(){
  const sh=shopping(month);
  if(!sh.weeks.length||!sh.weeks.some(s=>S.plans[s])){main.innerHTML=`<section class="view"><div class="empty"><h2>Sin lista todavía</h2><p>Planifica alguna semana de este mes y aquí aparecerá la compra.</p><button class="btn" id="goMenu">Ir al menú</button></div></section>`;document.getElementById("goMenu").onclick=()=>{tab="menu";render()};return}
  if(listSel!=="mes"&&!sh.lists[listSel])listSel="mes";
  const l=sh.lists[listSel], wi=listSel==="mes"?null:Number(listSel);
  let h=`<section class="view"><div class="seg" role="group" aria-label="Lista"><button aria-pressed="${listSel==="mes"}" data-list="mes">Compra del mes</button>`;
  sh.weeks.forEach((s,i)=>h+=`<button aria-pressed="${listSel===String(i)}" data-list="${i}">Semana ${shortDate(s)}</button>`);
  h+=`</div><div class="listtotal"><h2>${listSel==="mes"?"Despensa, congelados y carne":"Fresco de la semana"}</h2><b>${eur(l.cost+l.fee)}</b></div>
  <div class="modes">${chip("data-lm","online",l.mode==="online","🛒 Online")}${chip("data-lm","tienda",l.mode==="tienda","🏪 En tienda")}</div>`;
  if(wi!=null)h+=`<p class="small muted" style="margin:0">Llega o se compra el ${esc(longDate(deliveryDate(sh.weeks[wi])))}. Lo que se cocina antes sale de lo que ya hay en casa.</p>`;
  if(l.mode==="online"){
    h+=`<p class="shophint">Toca 🛒 para abrir el producto en Mercadona y añadirlo al carro. Incluye ${eur(l.fee)} de envío.</p>`;
    if(l.belowMin)h+=`<div class="warnbox">No llegas al pedido mínimo online (${eur(S.home.shop.min)}): faltan ${eur(S.home.shop.min-l.cost)}.${wi!=null?` <button class="btn small" id="fillMin">Completar con cosas del mes</button>`:" Pásala a compra en tienda o junta compras."}</div>`;
  }
  if(l.items.length)h+=orderBlock(l,listSel==="mes"?"mes":"semana");
  const bySec={};for(const it of l.items)(bySec[P[it.pid].aisle]=bySec[P[it.pid].aisle]||[]).push(it);
  const order=["Carne y pescado","Congelados","Fruta y verdura","Huevos y lácteos","Despensa"];
  for(const sec of [...order,...Object.keys(bySec).filter(s=>!order.includes(s))]){if(!bySec[sec])continue;
    h+=`<div class="aisle"><h3>${esc(sec)}</h3>`;
    for(const it of bySec[sec].sort((a,b)=>P[a.pid].name.localeCompare(P[b.pid].name))){
      const key=checkKey(month,listSel,it.pid),done=!!S.checks[key],moved=(S.assign[month]||{})[it.pid]!=null&&listSel!=="mes";
      h+=`<label class="item ${done?"done":""}"><input type="checkbox" data-ck="${key}" ${done?"checked":""}><span class="t">${it.packs} × ${esc(P[it.pid].name)}<small>Necesitas ${fmtQty(it.q,P[it.pid].unit)}${P[it.pid].keep==="congelar"?", para congelar":""}${moved?" · adelantado de la compra del mes":""}</small></span><span class="p">${eur(it.cost)}${upTag(it.pid)}</span>${l.mode==="online"&&P[it.pid].mid?`<a class="mlink" href="https://tienda.mercadona.es/product/${encodeURIComponent(P[it.pid].mid)}/" target="_blank" rel="noopener" aria-label="Abrir ${esc(P[it.pid].name)} en Mercadona">🛒</a>`:""}</label>`}
    h+=`</div>`}
  const sk=month+"|"+listSel;
  h+=`<div class="card"><h2>Lo que he pagado</h2><div class="spend"><span class="small muted">Apunta el total del ticket o del pedido para comparar con lo previsto (${eur(l.cost+l.fee)}).</span><input type="number" min="0" step="0.01" id="spentIn" value="${S.spent[sk]??""}" placeholder="0,00"></div></div>`;
  if(listSel==="mes"){
    h+=`<p class="small muted">Básicos (aceite, sal, especias): ${eur(Number(S.home.budget.basics))}.${sh.extrasTotal?` Platos fijos sin receta: ${eur(sh.extrasTotal)}.`:""}</p>`;
    const u=Object.entries(sh.freezeGuide);
    if(u.length){h+=`<div class="guide"><h3>Al llegar a casa: reparte y congela</h3><p>Una bolsa por plato, con la etiqueta del día.</p><ul>`;
      for(const [pid,arr] of u)h+=`<li><b>${esc(P[pid].name)}</b>: `+arr.map(a=>`${fmtQty(a.q,P[pid].unit)} para ${a.label} (${esc(a.name)})`).join("; ")+`</li>`;
      h+=`</ul></div>`}
  }
  const wb=weekBudget(month);
  h+=`<div class="card"><h2>Presupuesto por semana</h2><table class="wtable">${sh.weeks.map((s,i)=>`<tr><td>Semana del ${shortDate(s)}${i===0?" (con la compra del mes)":""}</td><td class="${sh.perWeek[i]>wb?"up":""}">${eur(sh.perWeek[i])} / ${eur(wb)}</td></tr>`).join("")}</table></div>`;
  main.innerHTML=h+`</section>`;
  main.querySelectorAll("[data-list]").forEach(b=>b.onclick=()=>{listSel=b.dataset.list;render()});
  main.querySelectorAll("[data-lm]").forEach(b=>b.onclick=()=>{S.modes[month+"|"+listSel]=b.dataset.lm;save();render()});
  main.querySelectorAll("[data-ck]").forEach(i=>i.onchange=()=>{if(i.checked)S.checks[i.dataset.ck]=true;else delete S.checks[i.dataset.ck];i.closest(".item").classList.toggle("done",i.checked);save()});
  document.getElementById("spentIn").onchange=e=>{const v=e.target.value;if(v==="")delete S.spent[sk];else S.spent[sk]=Number(v);save();renderHeader()};
  main.querySelectorAll("[data-saveorder]").forEach(b=>b.onclick=()=>{const items={};for(const it of l.items)items[it.pid]=it.packs;S.orders[b.dataset.saveorder]={items,savedAt:todayISO()};save();render();toast("Pedido guardado")});
  const fm=document.getElementById("fillMin");if(fm)fm.onclick=()=>{const r=fillToMinimum(month,wi);render();toast(r.moved.length?(r.ok?"Completado con: ":"No llega del todo. Añadido: ")+r.moved.join(", ").toLowerCase():"No hay nada del mes que se pueda adelantar")};
}

/* ---------- Recetas ---------- */
function renderRecetas(){
  const a=me();
  const fl={todas:"Todas",fav:"Favoritas",nuevas:"Sin probar",no:"Descartadas",c:"⚡ Hidratos",l:"🥗 Ligeras",kid:"Gustan a niños"};
  for(const k of S.home.apps)fl[k]=APP[k];
  let h=`<section class="view"><div class="field"><input type="text" id="rq" placeholder="Buscar receta o ingrediente" value="${esc(recSearch)}"></div><div class="filters">`+Object.entries(fl).map(([k,v])=>`<button class="btn ${recFilter===k?"":"ghost"} small" data-f="${k}">${v}</button>`).join("")+`</div>`;
  const qn=recSearch.toLowerCase();
  const tried=new Set(S.ratings.map(x=>x.rid));
  const list=R.filter(r=>{
    if(qn&&!(r.name.toLowerCase().includes(qn)||r.ing.some(([p])=>P[p].name.toLowerCase().includes(qn))))return false;
    const dp=dishPref(a,r.id);
    switch(recFilter){case "fav":return dp>=1.5;case "nuevas":return !tried.has(r.id);case "no":return dp<=-1;case "c":return r.type==="c";case "l":return r.type==="l";case "kid":return r.kid;case "todas":return true;default:return r.vars.some(v=>v.app===recFilter)}
  });
  h+=`<p class="small muted">${list.length} recetas</p>`;
  for(const r of list){const dp=dishPref(a,r.id),can=!!variantFor(r);
    h+=`<button class="rcard ${dp<=-1||!can?"no":""}" data-open="${r.id}"><span class="t"><b>${dp>=1.5?"❤️ ":""}${esc(r.name)}</b><small>${recipeTime(r)} min · ${r.prot||"?"} g proteína${r.kcal?" · "+r.kcal+" kcal":""}${!can?" · no tienes el aparato":""}${dp<=-1?" · descartada":""}</small></span><span class="pill ${r.type==="c"?"carga":"ligera"}">${r.type==="c"?"⚡":"🥗"}</span></button>`}
  main.innerHTML=h+"</section>";
  main.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{recFilter=b.dataset.f;render()});
  const rq=document.getElementById("rq");rq.oninput=()=>{recSearch=rq.value;clearTimeout(rq._t);rq._t=setTimeout(()=>{render();const x=document.getElementById("rq");x.focus();x.setSelectionRange(x.value.length,x.value.length)},250)};
  bindOpen();
}

/* ---------- Perfil ---------- */
let calMonth=null;
// Calendario del mes con los días que cada hijo está contigo (tocar un día lo cambia)
function kidCalendar(k){
  const m=calMonth||month, [y,mm]=m.split("-").map(Number);
  const first=iso(new Date(y,mm-1,1)), n=new Date(y,mm,0).getDate();
  let days=0,h=`<div class="row" style="margin-top:12px"><b>Calendario de ${esc(personName(k))}</b><span class="spacer"></span><button class="btn ghost small" data-cal="-1" aria-label="Mes anterior">‹</button><span class="small" style="text-transform:capitalize">${monthName(m)}</span><button class="btn ghost small" data-cal="1" aria-label="Mes siguiente">›</button></div>
  <div class="cal">${DSHORT.map(d=>`<span class="cal-h">${d.slice(0,1)}</span>`).join("")}${"<span></span>".repeat(dow(first))}`;
  for(let i=0;i<n;i++){const d=addDays(first,i),on=kidsAt(d).includes(k),ov=((S.days[d]||{}).kids||{})[k.id]!=null;if(on)days++;
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
  const lr=learned(p), y=p.kind==="adulto";
  const le=y?"te":"le", Le=y?"Te":"Le", puede=y?"puedes":"puede";
  return `<div class="know">
    <h3>🚫 No ${puede} comer</h3>${ichips(by(-9))}
    <h3>👎 Ingredientes que no ${le} gustan</h3>${ichips(by(-1))}
    <h3>❤️ Ingredientes que ${le} gustan</h3>${ichips(by(1))}
    <h3>Platos que ${le} gustan</h3>${dchips(dl(1))}
    <h3>Platos que no ${le} gustan</h3>${dchips(dl(-1))}
    ${lr.length?`<h3>He notado que…</h3>${lr.map(x=>`<div class="fixed"><span><b>${x.v>0?Le+" gusta":"No "+le+" gusta"} ${esc(P[x.pid].name.toLowerCase())}</b><small>${esc(x.src)}</small></span><span><button class="btn small" data-lok="${p.id}|${x.pid}|${x.v}">Es así</button> <button class="btn ghost small" data-lno="${p.id}|${x.pid}">No</button></span></div>`).join("")}`:""}
    <p class="small muted">${S.ratings.filter(x=>x.who===p.id).length} valoraciones hasta ahora.</p>
    <button class="btn ghost small" data-edit="gustos:${p.id}">Editar ingredientes</button></div>`;
}
function renderPerfil(){
  let h=`<section class="view">`;
  const RV={2:"❤️",1:"👍",rare:"🙂","-1":"👎"};
  for(const p of S.people){const hist=historyOf(p,20);
    h+=`<div class="person"><h2>${p.kind==="adulto"?"Lo que sé de ti":esc(personName(p))}</h2>${p.kind==="nino"?`<div class="small muted">${p.age?p.age+" años · ":""}ración ${String(p.factor).replace(".",",")}</div>${kidCalendar(p)}<h3 style="margin-top:14px">Lo que sé de ${esc(personName(p))}</h3>`:""}${knowHTML(p)}
    <details style="margin-top:10px"><summary><b>Historial</b> <span class="small muted">(${hist.length} ${hist.length===1?"comida reciente":"comidas recientes"})</span></summary>
    ${hist.length?`<table class="wtable">${hist.map(x=>`<tr><td>${DSHORT[dow(x.date)]} ${shortDate(x.date)} · ${x.meal}</td><td style="text-align:left;padding-left:8px">${esc(x.name)}${x.note?` <span class="small muted">${esc(x.note)}</span>`:""}</td><td>${x.v!=null?RV[x.v]:""}</td></tr>`).join("")}</table>`:`<p class="small muted">Aún no hay comidas pasadas.</p>`}</details></div>`}
  const items=[["aparatos","Aparatos",Object.entries(APP).filter(([k])=>S.home.apps.includes(k)).map(([,v])=>v).join(", ")],["zona","Código postal y municipio",[S.home.cp,S.home.municipio].filter(Boolean).join(" · ")||"Sin indicar"],["hijos","Quién come contigo",kids().map(personName).join(", ")||"Solo tú"],
    ["objetivos","Objetivos",me().goals.map(g=>GOALS[g][0]).join(", ")],["entreno","Entrenamiento",me().trains?me().sports.map(s=>SPORTS[s]).join(", "):"No entrenas"],["semana","Semana tipo y caprichos",S.fixed.length+" platos fijos"],
    ["cocina","Cuándo cocinas",S.home.cookMode==="lote"?"Por lotes: "+S.home.cookDays.map(d=>DAYS[d].toLowerCase()).join(" y "):"Cada día"],["plan","Planificación",{diaria:"Cada día",semanal:"Cada semana",quincenal:"Cada dos semanas",mensual:"Cada mes"}[S.home.planFreq]+", "+DAYS[S.home.planDay].toLowerCase()+" a las "+S.home.planTime],
    ["compra","Compra y presupuesto",eur(S.home.budget.month)+" al mes"]];
  h+=`<div class="card settingslist"><h2>Ajustes</h2>${items.map(([id,t,d])=>`<button data-edit="${id}">${t}<small>${esc(d)}</small></button>`).join("")}</div>`;
  h+=`<div class="card"><h2>Festivos</h2><p class="small muted">Se usan los de Cataluña${S.home.municipio&&FEST&&FEST.locales[S.home.municipio]?" y los locales de "+esc(S.home.municipio):""}. Añade los locales de tu municipio u otros días especiales.</p>
    ${S.home.festivosExtra.map(d=>`<div class="fixed"><span>${esc(longDate(d))}</span><button class="btn ghost small" data-delfest="${d}">Quitar</button></div>`).join("")}
    <div class="row"><input type="date" id="festIn" style="flex:1"><button class="btn small" id="festAdd">Añadir</button></div></div>`;
  h+=`<div class="card prices"><h2>Precios</h2><div class="hint" style="color:var(--muted);margin-bottom:8px">Se actualizan solos cada domingo con los de Mercadona. Si corriges uno, manda tu precio hasta que vuelvas al de Mercadona.</div>
    ${Object.values(P).sort((a,b)=>a.name.localeCompare(b.name)).map(p=>{const m=mprice(p.id),own=S.prices[p.id]!=null;
      return `<div class="pr"><span>${esc(p.name)}${upTag(p.id)}<small>${fmtQty(p.env,p.unit)}${own?` · corregido a mano${m?` (Mercadona: ${eur(m.precio)})`:""} <button class="reset" data-reset="${p.id}">Usar el de Mercadona</button>`:m?" · Mercadona":" · estimado"}</small></span><input type="number" step="0.01" min="0" data-price="${p.id}" value="${price(p.id).toFixed(2)}" aria-label="Precio de ${esc(p.name)}"></div>`}).join("")}</div>
  <div class="card"><h2>Copia de seguridad</h2><div class="hint" style="color:var(--muted)">Todo se guarda solo en este móvil. Descarga una copia de vez en cuando y antes de cambiar de móvil.</div>
    <div class="actions"><button class="btn" id="exp">Exportar copia</button><button class="btn ghost" id="imp">Importar copia</button></div><input type="file" id="impFile" accept="application/json,.json" hidden>
    <button class="btn ghost small" id="restartWiz">Repetir el asistente de bienvenida</button></div></section>`;
  main.innerHTML=h;
  const q=s=>main.querySelectorAll(s), find=id=>S.people.find(p=>p.id===id);
  q("[data-edit]").forEach(b=>b.onclick=()=>{openWizard(b.dataset.edit);scrollTo(0,0)});
  q("[data-cal]").forEach(b=>b.onclick=()=>{const [y,m]=(calMonth||month).split("-").map(Number);calMonth=iso(new Date(y,m-1+Number(b.dataset.cal),1)).slice(0,7);render()});
  q("[data-kcal]").forEach(b=>b.onclick=()=>{const [id,d]=b.dataset.kcal.split("|"),k=find(id);const o=S.days[d]=S.days[d]||{};o.kids=o.kids||{};
    const ruleOn=kidPresentByRule(k,d), nowOn=kidsAt(d).includes(k);
    if(!nowOn===ruleOn)delete o.kids[id];else o.kids[id]=!nowOn;
    save();if(S.plans[weekStartFor(d)])ensureWeek(weekStartFor(d));save();render()});
  q("[data-unI]").forEach(b=>b.onclick=e=>{e.preventDefault();const [pp,pid]=b.dataset.uni.split("|");setIng(find(pp),pid,0);render()});
  q("[data-unD]").forEach(b=>b.onclick=()=>{const [pp,rid]=b.dataset.und.split("|");setDish(find(pp),rid,null);render()});
  q("[data-lok]").forEach(b=>b.onclick=()=>{const [pp,pid,v]=b.dataset.lok.split("|");setIng(find(pp),pid,Number(v),"Aprendido de tus valoraciones");render()});
  q("[data-lno]").forEach(b=>b.onclick=()=>{const [pp,pid]=b.dataset.lno.split("|");find(pp).tastes.ignore[pid]=true;save();render()});
  q("[data-delfest]").forEach(b=>b.onclick=()=>{S.home.festivosExtra=S.home.festivosExtra.filter(d=>d!==b.dataset.delfest);save();refreshPlans();render()});
  document.getElementById("festAdd").onclick=()=>{const v=document.getElementById("festIn").value;if(v&&!S.home.festivosExtra.includes(v)){S.home.festivosExtra.push(v);S.home.festivosExtra.sort();save();refreshPlans();render()}};
  q("[data-price]").forEach(i=>i.onchange=()=>{const v=Number(i.value);if(v>=0){S.prices[i.dataset.price]=v;save();render()}});
  q("[data-reset]").forEach(b=>b.onclick=()=>{delete S.prices[b.dataset.reset];save();render()});
  document.getElementById("exp").onclick=exportBackup;
  const f=document.getElementById("impFile");document.getElementById("imp").onclick=()=>f.click();f.onchange=()=>{if(f.files[0])importBackup(f.files[0]);f.value=""};
  document.getElementById("restartWiz").onclick=()=>{S.onboarded=false;wiz={i:0,single:null};save();render()};
}

/* ---------- Navegación y arranque ---------- */
document.querySelectorAll("nav.tabs button").forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();scrollTo(0,0)});
function shiftMonth(n){const [y,m]=month.split("-").map(Number);const d=new Date(y,m-1+n,1);month=iso(d).slice(0,7);listSel="mes";render()}
document.getElementById("prevM").onclick=()=>shiftMonth(-1);
document.getElementById("nextM").onclick=()=>shiftMonth(1);
dlg.addEventListener("click",e=>{if(e.target===dlg)dlg.close()});

async function getJSON(url,fresh){const r=await fetch(url,{cache:fresh?"no-store":"no-cache"});if(!r.ok)throw new Error(url+": "+r.status);return r.json()}
async function boot(){
  try{
    const [prods,recs]=await Promise.all([getJSON("data/productos.json"),getJSON("data/recetas.json")]);
    setProducts(prods.productos);setRecipes(recs.recetas);
  }catch(e){main.innerHTML=`<section class="view"><div class="empty"><h2>No se han podido cargar las recetas</h2><p>Comprueba la conexión y vuelve a abrir la app.</p></div></section>`;return}
  try{FEST=await getJSON("data/festivos.json")}catch(e){FEST=null}
  PR=loadSavedPrices();
  try{const fresh=await getJSON("data/precios.json?t="+Date.now(),true);
    if(fresh&&fresh.productos){PR=fresh;prOffline=false;try{localStorage.setItem("taper-precios",JSON.stringify(PR))}catch(e){}}}
  catch(e){prOffline=!!PR}
  // Al abrir, la semana actual y la siguiente tienen menú si ya se había planificado alguna
  if(S.onboarded){const s=weekStartFor(todayISO());if(!S.plans[s])genWeekFromScratch(s);save()}
  render();
}
boot();
if("serviceWorker" in navigator&&location.protocol!=="file:")navigator.serviceWorker.register("sw.js").catch(()=>{});
