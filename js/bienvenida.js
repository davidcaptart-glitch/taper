/* Táper · asistente de bienvenida (y edición de cada apartado desde Perfil) */
"use strict";

let wiz={i:0,single:null};   // single = id del paso cuando se edita uno suelto desde Perfil

function wizSteps(){
  const st=[
    {id:"hola",title:"Hola 👋"},
    {id:"aparatos",title:"¿Con qué cocinas?"},
    {id:"zona",title:"¿Dónde compras?"},
    {id:"familia",title:"¿Quién come en casa?"},
    ...adults().flatMap(a=>[{id:"objetivos:"+a.id,title:a.id==="yo"?"¿Cuál es tu objetivo?":"Objetivos de "+personName(a)},
      {id:"entreno:"+a.id,title:a.id==="yo"?"¿Entrenas?":"¿"+personName(a)+" entrena?"}]),
    {id:"semana",title:"Tu semana tipo"},
    {id:"cocina",title:"¿Cuándo cocinas?"},
    {id:"plan",title:"¿Cuándo planificas?"},
    {id:"compra",title:"Compra y presupuesto"},
    ...S.people.map(p=>({id:"gustos:"+p.id,title:p.id==="yo"?"Tus gustos":"Gustos de "+personName(p)})),
    {id:"listo",title:"¡Listo!"}
  ];
  return st;
}
function openWizard(stepId){wiz={i:0,single:stepId||null};tab="wizard";render()}
// Persona a la que se refiere un paso ("objetivos:yo", "entreno:k123"…)
const stepPerson=id=>{const i=id.indexOf(":");return i<0?me():(S.people.find(p=>p.id===id.slice(i+1))||me())};
const stepKind=id=>id.split(":")[0];

function renderWizard(){
  const steps=wizSteps();
  const single=wiz.single==="hijos"?"familia":wiz.single==="objetivos"||wiz.single==="entreno"?wiz.single+":yo":wiz.single;
  const step=single?steps.find(s=>s.id===single):steps[Math.min(wiz.i,steps.length-1)];
  if(!step){wiz.single=null;tab="perfil";render();return}
  const n=steps.indexOf(step);
  let h=`<section class="wiz">`;
  if(!wiz.single)h+=`<div class="step">Paso ${n+1} de ${steps.length}</div><div class="progress"><i style="width:${(n+1)/steps.length*100}%"></i></div>`;
  h+=`<h2>${esc(step.title)}</h2>`+stepBody(step.id)+`<div class="nav">`;
  if(wiz.single)h+=`<button class="btn ghost" data-wz="cancel">Volver</button><button class="btn" data-wz="save">Guardar</button>`;
  else h+=`${n>0?`<button class="btn ghost" data-wz="back">Atrás</button>`:"<span></span>"}<button class="btn" data-wz="next">${step.id==="listo"?"Generar mi menú":"Siguiente"}</button>`;
  main.innerHTML=h+`</div></section>`;
  bindStep(step.id);
  main.querySelector("[data-wz=back]")?.addEventListener("click",()=>{wiz.i--;render();scrollTo(0,0)});
  main.querySelector("[data-wz=next]")?.addEventListener("click",()=>{
    if(!validateStep(step.id))return;
    if(step.id==="listo"){finishOnboarding();return}
    wiz.i++;save();render();scrollTo(0,0)});
  main.querySelector("[data-wz=save]")?.addEventListener("click",()=>{if(!validateStep(step.id))return;save();refreshPlans();wiz.single=null;tab="perfil";render();toast("Guardado")});
  main.querySelector("[data-wz=cancel]")?.addEventListener("click",()=>{wiz.single=null;tab="perfil";render()});
}
function finishOnboarding(){
  S.onboarded=true;save();
  const start=weekStartFor(todayISO());
  for(const s of [start,addDays(start,7)])if(!S.plans[s]||!Object.keys(S.plans[s].slots).length)genWeekFromScratch(s);
  save();tab="menu";render();toast("Menú generado. Puedes cambiar lo que quieras");
}
// Tras cambiar ajustes: rellena los huecos nuevos sin tocar los platos ya elegidos
function refreshPlans(){for(const s of Object.keys(S.plans))if(s>=weekStartFor(todayISO()))ensureWeek(s);save()}

const chip=(attr,val,on,label)=>`<button type="button" class="chip" ${attr}="${esc(val)}" aria-pressed="${!!on}">${label}</button>`;
const dowSelect=(id,val)=>`<select id="${id}">${DAYS.map((d,i)=>`<option value="${i}" ${i===Number(val)?"selected":""}>${d}</option>`).join("")}</select>`;

function stepBody(fullId){
  const H=S.home, a=stepPerson(fullId), id=stepKind(fullId)==="gustos"?fullId:stepKind(fullId), you=a.id==="yo";
  if(id==="hola")return `<p class="lead">Táper te prepara el menú, la lista de la compra y los tápers de la semana, a tu medida. Unas preguntas rápidas y empezamos. Todo se puede cambiar después.</p>
    <div class="field"><label for="wzName">¿Cómo te llamas?</label><input id="wzName" type="text" value="${esc(a.name)}" placeholder="Tu nombre"></div>`;
  if(id==="aparatos")return `<p class="lead">Solo te propondré recetas que puedas hacer.</p><div class="chips">${Object.entries(APP).filter(([k])=>k!=="ninguno").map(([k,v])=>chip("data-app",k,H.apps.includes(k),v)).join("")}</div>`;
  if(id==="zona")return `<p class="lead">¿En qué supermercado compras? Los precios cambian según la zona, y los festivos según el municipio.</p>
    <div class="group">${SUPERS.map(x=>`<button type="button" class="alt" data-super="${x.id}" ${x.estado!=="activo"?"disabled":""} style="${H.super===x.id?"outline:2px solid var(--tomato)":""}${x.estado!=="activo"?";opacity:.55":""}"><b>${esc(x.nombre)}</b><small>${x.estado==="activo"?"Precios, lista con enlaces y tickets":x.estado==="proximamente"?"Próximamente":"Más adelante: no vende alimentación online, solo se podrán leer sus tickets"}</small></button>`).join("")}</div>
    <div class="field"><label for="wzCp">Código postal</label><input id="wzCp" type="text" inputmode="numeric" maxlength="5" value="${esc(H.cp)}" placeholder="08784"></div>
    <div class="field"><label for="wzMun">Municipio (para los festivos locales)</label><input id="wzMun" type="text" list="wzMunList" value="${esc(H.municipio)}" placeholder="Por ejemplo, Piera"><datalist id="wzMunList">${Object.keys((FEST||{}).locales||{}).map(m=>`<option value="${esc(m)}">`).join("")}</datalist>
    <div class="hint">Si tu municipio no sale en la lista, añade sus festivos locales en Perfil > Festivos.</div></div>`;
  if(id==="familia"){
    const ptypes=[["siempre","Siempre"],["alternas","Semanas alternas"],["findes","Fines de semana alternos"],["dias","Días concretos de la semana"],["manual","Lo marco cada semana"]];
    let h=`<p class="lead">Añade a quien come contigo: pareja, hijos, otros familiares, compañeros de piso… Cada uno con cuándo está, su ración y sus propios gustos.</p>`;
    for(const k of others()){const pr=k.presence||{type:"siempre"}, ad=k.kind==="adulto";
      h+=`<div class="kidcard" data-kid="${k.id}"><div class="row"><b>${esc(personName(k))}</b><span class="small muted">${ad?"adulto":"niño o niña"}</span><span class="spacer"></span><button class="btn ghost small" data-delkid="${k.id}">Quitar</button></div>
      <div class="field"><label>¿Cómo se llama?</label><input type="text" data-kf="name" value="${esc(k.name)}" placeholder="Nombre"></div>
      ${ad?`<div class="field"><label>Su ración</label><select data-kf="factor">${[[0.8,"Pequeña"],[1,"Normal"],[1.2,"Grande"]].map(([v,t])=>`<option value="${v}" ${Number(k.factor)===v?"selected":""}>${t}</option>`).join("")}</select></div>
        <label class="row small"><input type="checkbox" data-kf="tupper" ${k.tupper?"checked":""} style="width:auto"> Se lleva táper los días de táper</label>`
      :`<div class="field"><label>Edad</label><input type="number" min="1" max="25" data-kf="age" value="${esc(k.age||"")}"><div class="hint">Su ración: ${String(k.factor).replace(".",",")} de la de un adulto (se calcula con la edad).</div></div>`}
      <div class="field"><label>¿Cuándo come en casa?</label><select data-kf="ptype">${ptypes.map(([v,t])=>`<option value="${v}" ${pr.type===v?"selected":""}>${t}</option>`).join("")}</select></div>
      ${pr.type==="alternas"||pr.type==="findes"?`<div class="field"><label>Un lunes de una semana en que está</label><input type="date" data-kf="anchor" value="${esc(pr.anchor||mondayOf(todayISO()))}"></div>`:""}
      ${pr.type==="dias"?`<div class="chips">${DSHORT.map((d,i)=>chip("data-kday",i,(pr.days||[]).includes(i),d)).join("")}</div>`:""}
      </div>`}
    return h+`<div class="actions"><button class="btn ghost" id="addAdult">+ Pareja u otro adulto</button><button class="btn ghost" id="addKid">+ Hijo o hija</button></div>`;
  }
  if(id==="objetivos"){
    return `<p class="lead">Elige hasta 3, en orden de importancia. El primero manda si chocan.</p>
    <div>${Object.entries(GOALS).map(([k,[t,d]])=>{const i=a.goals.indexOf(k);return `<button type="button" class="alt" data-goal="${k}" style="${i>=0?"outline:2px solid var(--tomato)":""}"><b>${i>=0?`<span class="chip" style="padding:0 7px;margin-right:6px">${i+1}</span>`:""}${t}</b><small>${d}</small></button>`}).join("")}</div>
    ${a.goals.includes("musculo")&&a.goals.includes("adelgazar")?`<div class="warnbox">Ganar músculo y adelgazar a la vez: aplicaré proteína alta con raciones algo ajustadas (recomposición).</div>`:""}
    <div class="field"><label for="wzW">${you?"Tu peso":"Su peso"} en kg (opcional, para calcular la proteína)</label><input id="wzW" type="number" min="30" max="200" step="0.5" value="${esc(a.weight||"")}"></div>
    <div class="hint" style="color:var(--muted)">Son pautas generales, no un plan de un nutricionista.</div>`;
  }
  if(id==="entreno"){
    let h=`<div class="chips">${chip("data-trains","1",a.trains,you?"Sí, entreno":"Sí, entrena")}${chip("data-trains","0",!a.trains,"No")}</div>`;
    if(!a.trains)return h;
    h+=`<div class="group"><h3>¿Qué haces? (puedes elegir varios)</h3><div class="chips">${Object.entries(SPORTS).map(([k,v])=>chip("data-sport",k,a.sports.includes(k),v)).join("")}</div></div>
    <div class="group"><h3>${you?"Tu":"Su"} semana habitual</h3><p class="muted small" style="margin:0 0 8px">Con la hora de cada sesión sé si se entrena antes o después de comer. Cada semana te la propondré ya rellena y solo cambiarás lo que varíe.</p>`;
    for(let d=0;d<7;d++){const ss=a.train[d]||[];
      h+=`<div class="daycard"><div class="row"><b>${DAYS[d]}</b><span class="spacer"></span>${ss.length<2?`<button class="btn ghost small" data-addsess="${d}">+ Sesión</button>`:""}</div>
      ${ss.map((s,i)=>`<div class="sess"><input type="time" data-sw="${d}:${i}" value="${esc(sessTime(s))}" style="width:auto" aria-label="Hora">
      <select data-st="${d}:${i}">${(a.sports.length?a.sports:Object.keys(SPORTS)).map(k=>`<option value="${k}" ${s.type===k?"selected":""}>${SPORTS[k]}</option>`).join("")}</select>
      <button class="btn ghost small" data-delsess="${d}:${i}" aria-label="Quitar sesión">✕</button></div>`).join("")}</div>`}
    return h+`</div>`;
  }
  if(id==="semana"){
    let h=`<p class="lead">Qué haces normalmente en cada comida. "Táper" es la otra ración de la cena de la víspera. Cada semana puedes cambiar cualquier día.</p>`;
    for(let d=0;d<7;d++){const t=H.weekTpl[d];
      h+=`<div class="daycard"><b>${DAYS[d]}</b><div class="row"><label class="small" style="min-width:4.5em">Comida</label><select data-tpl="${d}:comida">${["taper","cocinar","fuera","libre"].map(v=>`<option value="${v}" ${t.comida===v?"selected":""}>${MEALSTATE[v]}</option>`).join("")}</select></div>
      <div class="row"><label class="small" style="min-width:4.5em">Cena</label><select data-tpl="${d}:cena">${["cocinar","fuera","libre"].map(v=>`<option value="${v}" ${t.cena===v?"selected":""}>${MEALSTATE[v]}</option>`).join("")}</select></div></div>`}
    h+=`<div class="group"><h3>Horario</h3><div class="row"><label class="small" style="min-width:4.5em">Comida</label><input type="time" data-mt="comida" value="${esc(H.mealTimes.comida)}" style="width:auto"><label class="small">Cena</label><input type="time" data-mt="cena" value="${esc(H.mealTimes.cena)}" style="width:auto"></div>
      <p class="muted small">¿Haces más comidas? Márcalas con su hora (de momento el menú planifica comida y cena).</p>
      ${Object.entries(EXTRA_MEALS).map(([k,v])=>`<div class="row" style="margin:4px 0"><label class="row small" style="flex:1"><input type="checkbox" data-xm="${k}" ${H.extraMeals[k]?"checked":""} style="width:auto"> ${v}</label>${H.extraMeals[k]?`<input type="time" data-xmt="${k}" value="${esc(H.extraMeals[k])}" style="width:auto">`:""}</div>`).join("")}</div>`;
    h+=`<div class="group"><h3>Platos fijos y caprichos</h3><p class="muted small" style="margin:0 0 8px">Por ejemplo, pizza el viernes por la noche. Los caprichos cuentan para la compra, pero no para tus objetivos.</p>`+fixedEditor()+`</div>`;
    return h;
  }
  if(id==="cocina")return `<div>${[["diario","Cada día","Cocinas la cena y haces doble para el táper del día siguiente"],["lote","Uno o varios días por semana","Cocinas varios platos de una vez (batch cooking) y los guardas en tápers"]].map(([k,t,d])=>`<button type="button" class="alt" data-cook="${k}" style="${H.cookMode===k?"outline:2px solid var(--tomato)":""}"><b>${t}</b><small>${d}</small></button>`).join("")}</div>
    ${H.cookMode==="lote"?`<div class="group"><h3>¿Qué días cocinas?</h3><div class="chips">${DAYS.map((d,i)=>chip("data-cday",i,H.cookDays.includes(i),d)).join("")}</div><div class="hint" style="color:var(--muted)">Elegiré platos que aguanten en la nevera hasta que te los comas; si no aguantan, te diré cuáles congelar.</div></div>`:""}`;
  if(id==="plan")return `<p class="lead">Te avisaré para preparar el menú y la compra.</p>
    <div class="field"><label for="wzFreq">¿Cada cuánto?</label><select id="wzFreq">${[["diaria","Cada día"],["semanal","Cada semana"],["quincenal","Cada dos semanas"],["mensual","Cada mes"]].map(([v,t])=>`<option value="${v}" ${H.planFreq===v?"selected":""}>${t}</option>`).join("")}</select></div>
    <div class="field"><label for="wzPDay">Día (la semana del menú empieza ese día)</label>${dowSelect("wzPDay",H.planDay)}</div>
    <div class="field"><label for="wzPTime">Hora</label><input id="wzPTime" type="time" value="${esc(H.planTime)}"></div>`;
  if(id==="compra"){const sh=H.shop,b=H.budget;
    const modeChips=(k,v)=>chip("data-mode",k+":online",v==="online","Online")+chip("data-mode",k+":tienda",v==="tienda","En tienda");
    return `<div class="group"><h3>Compra del mes (despensa, carne para congelar y congelados)</h3><div class="chips">${modeChips("monthMode",sh.monthMode)}</div></div>
    <div class="group"><h3>Compra de cada semana (fresco)</h3><div class="chips">${modeChips("weekMode",sh.weekMode)}</div></div>
    <div class="field"><label for="wzDel">Día en que llega o haces la compra semanal</label>${dowSelect("wzDel",sh.delivery)}<div class="hint">Lo que cocines antes de ese día sale de lo que ya tienes en casa.</div></div>
    <div class="row"><div class="field" style="flex:1"><label for="wzMin">Pedido mínimo online (€)</label><input id="wzMin" type="number" min="0" step="1" value="${sh.min}"></div>
    <div class="field" style="flex:1"><label for="wzFee">Envío (€)</label><input id="wzFee" type="number" min="0" step="0.01" value="${sh.fee}"></div></div>
    <div class="field"><label for="wzBM">Presupuesto al mes (€)</label><input id="wzBM" type="number" min="0" step="5" value="${b.month}"></div>
    <div class="field"><label for="wzBW">Presupuesto a la semana (€)</label><input id="wzBW" type="number" min="0" step="1" value="${b.week??""}" placeholder="Automático: el del mes entre las semanas"></div>
    <div class="field"><label for="wzBB">Básicos al mes: aceite, sal, especias (€)</label><input id="wzBB" type="number" min="0" step="1" value="${b.basics}"></div>
    <div class="group"><h3>Si no llega el presupuesto, acepto…</h3><p class="muted small" style="margin:0 0 8px">Siempre intento acercarme al máximo. Si no llego, te preguntaré; puedes dejarlo decidido aquí.</p>
    <div class="chips">${Object.entries(SACRIFICES).map(([k,[t]])=>chip("data-sac",k,(H.sacrifice||{})[k],t)).join("")}</div></div>`;
  }
  if(id.startsWith("gustos:"))return tastesEditor(a);
  if(id==="listo")return `<p class="lead">Con esto preparo tu primer menú. Cada vez que valores un plato aprenderé más de lo que os gusta.</p>
    <div class="okbox">Todo se guarda solo en este móvil. Haz una copia de seguridad de vez en cuando desde Perfil.</div>`;
  return "";
}

function tastesEditor(p){
  const groups={};for(const x of Object.values(P))(groups[x.aisle]=groups[x.aisle]||[]).push(x);
  let h=`<p class="lead">Toca cada ingrediente para cambiarlo. Lo que dejes sin marcar lo iré aprendiendo.</p>
  <div class="legend"><span>1 toque: ❤️ me encanta</span><span>2: 👍 me gusta</span><span>3: 👎 no me gusta</span><span>4: 🚫 no puede comerlo</span></div>`;
  for(const [g,list] of Object.entries(groups)){
    h+=`<div class="group"><h3>${esc(g)}</h3><div class="chips">${list.sort((a,b)=>a.name.localeCompare(b.name)).map(x=>{const v=ingPref(p,x.id);
      return `<button type="button" class="chip t${v}" data-ing="${x.id}" data-person="${p.id}">${v===2?"❤️ ":v===1?"👍 ":v===-1?"👎 ":v===-9?"🚫 ":""}${esc(x.name)}</button>`}).join("")}</div></div>`}
  return h;
}
function fixedEditor(){
  let h=S.fixed.map(f=>`<div class="fixed"><span><b>${esc(f.recipe&&RX[f.recipe]?RX[f.recipe].name:f.name)}</b><small>${DAYS[f.dow]}, ${f.meal}${f.capricho?", capricho":""}, ${{todas:"siempre",con:"con los niños",sin:"sin los niños"}[f.who]}${!f.recipe&&f.cost?", "+eur(Number(f.cost)):""}</small></span><button class="btn ghost small" data-delf="${f.id}">Quitar</button></div>`).join("");
  h+=`<div class="field"><label for="fxr">Plato</label><select id="fxr"><option value="">Otro (escribe el nombre)</option>${R.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join("")}</select></div>
  <div class="field" id="fxnameW"><label for="fxn">Nombre</label><input id="fxn" type="text" placeholder="Pizza"></div>
  <div class="field" id="fxcostW"><label for="fxc">Coste aproximado (€)</label><input id="fxc" type="number" min="0" step="0.5" value="6"></div>
  <div class="row"><div style="flex:1">${dowSelect("fxd",4)}</div><select id="fxm" style="flex:1"><option value="cena">Cena</option><option value="comida">Comida</option></select></div>
  <div class="field"><select id="fxw"><option value="todas">Siempre</option><option value="con">Solo con los niños</option><option value="sin">Solo sin los niños</option></select></div>
  <label class="row small"><input type="checkbox" id="fxcap" checked style="width:auto"> Es un capricho (no cuenta para mis objetivos)</label>
  <button class="btn ghost wide" id="addfx" style="margin-top:8px">Añadir plato fijo</button>`;
  return h;
}

function bindStep(fullId){
  const H=S.home,a=stepPerson(fullId),q=s=>main.querySelector(s),qa=s=>main.querySelectorAll(s);
  const rerender=()=>{save();render()};
  qa("[data-super]").forEach(b=>b.onclick=()=>{H.super=b.dataset.super;rerender()});
  qa("[data-app]").forEach(b=>b.onclick=()=>{const k=b.dataset.app;H.apps=H.apps.includes(k)?H.apps.filter(x=>x!==k):[...H.apps,k];rerender()});
  q("#addKid")&&(q("#addKid").onclick=()=>{S.people.push({...defaultAdult(),id:uid("k"),kind:"nino",goals:["sano"],factor:0.6,presence:{type:"siempre"}});rerender()});
  q("#addAdult")&&(q("#addAdult").onclick=()=>{S.people.push({...defaultAdult(),id:uid("a"),kind:"adulto",goals:["sano"],factor:1,tupper:false,presence:{type:"siempre"}});rerender()});
  qa("[data-delkid]").forEach(b=>b.onclick=()=>{if(confirm("¿Quitar a esta persona y sus gustos?")){S.people=S.people.filter(p=>p.id!==b.dataset.delkid);rerender()}});
  qa(".kidcard").forEach(c=>{const k=S.people.find(p=>p.id===c.dataset.kid);
    c.querySelectorAll("[data-kf]").forEach(i=>i.onchange=()=>{const f=i.dataset.kf;
      if(f==="name")k.name=i.value.trim();
      if(f==="factor")k.factor=Number(i.value)||1;
      if(f==="tupper")k.tupper=i.checked;
      if(f==="age"){k.age=Number(i.value)||null;k.factor=factorForAge(k.age)}
      if(f==="ptype")k.presence={...k.presence,type:i.value,anchor:k.presence.anchor||mondayOf(todayISO())};
      if(f==="anchor")k.presence.anchor=i.value;
      rerender()});
    c.querySelectorAll("[data-kday]").forEach(b=>b.onclick=()=>{const d=Number(b.dataset.kday),ds=k.presence.days||[];k.presence.days=ds.includes(d)?ds.filter(x=>x!==d):[...ds,d];rerender()})});
  qa("[data-goal]").forEach(b=>b.onclick=()=>{const g=b.dataset.goal;if(a.goals.includes(g))a.goals=a.goals.filter(x=>x!==g);else if(a.goals.length<3)a.goals.push(g);else{toast("Máximo 3 objetivos: quita uno antes");return}rerender()});
  qa("[data-trains]").forEach(b=>b.onclick=()=>{a.trains=b.dataset.trains==="1";rerender()});
  qa("[data-sport]").forEach(b=>b.onclick=()=>{const k=b.dataset.sport;a.sports=a.sports.includes(k)?a.sports.filter(x=>x!==k):[...a.sports,k];rerender()});
  qa("[data-addsess]").forEach(b=>b.onclick=()=>{const d=b.dataset.addsess;const ss=a.train[d]=a.train[d]||[];ss.push({time:ss.length?"19:00":"08:00",type:a.sports[0]||"fuerza"});rerender()});
  qa("[data-delsess]").forEach(b=>b.onclick=()=>{const [d,i]=b.dataset.delsess.split(":");a.train[d].splice(Number(i),1);if(!a.train[d].length)delete a.train[d];rerender()});
  qa("[data-sw]").forEach(s=>s.onchange=()=>{const [d,i]=s.dataset.sw.split(":");a.train[d][i].time=s.value;delete a.train[d][i].when;save()});
  qa("[data-st]").forEach(s=>s.onchange=()=>{const [d,i]=s.dataset.st.split(":");a.train[d][i].type=s.value;save()});
  qa("[data-tpl]").forEach(s=>s.onchange=()=>{const [d,m]=s.dataset.tpl.split(":");H.weekTpl[d][m]=s.value;save()});
  qa("[data-mt]").forEach(i=>i.onchange=()=>{H.mealTimes[i.dataset.mt]=i.value;save()});
  qa("[data-xm]").forEach(c=>c.onchange=()=>{const k=c.dataset.xm;if(c.checked)H.extraMeals[k]={desayuno:"08:00",mediamanana:"11:00",merienda:"17:30",pre:"18:00",post:"20:00",recena:"23:00"}[k];else delete H.extraMeals[k];rerender()});
  qa("[data-xmt]").forEach(i=>i.onchange=()=>{H.extraMeals[i.dataset.xmt]=i.value;save()});
  qa("[data-cook]").forEach(b=>b.onclick=()=>{H.cookMode=b.dataset.cook;rerender()});
  qa("[data-cday]").forEach(b=>b.onclick=()=>{const d=Number(b.dataset.cday);H.cookDays=H.cookDays.includes(d)?H.cookDays.filter(x=>x!==d):[...H.cookDays,d];rerender()});
  qa("[data-sac]").forEach(b=>b.onclick=()=>{const sc=H.sacrifice=H.sacrifice||{},k=b.dataset.sac;if(sc[k])delete sc[k];else sc[k]=true;rerender()});
  qa("[data-mode]").forEach(b=>b.onclick=()=>{const [k,v]=b.dataset.mode.split(":");H.shop[k]=v;rerender()});
  qa("[data-ing]").forEach(b=>b.onclick=()=>{const p=S.people.find(x=>x.id===b.dataset.person),pid=b.dataset.ing;
    const v=ingPref(p,pid),nv=ING_CYCLE[(ING_CYCLE.indexOf(v)+1)%ING_CYCLE.length];
    setIng(p,pid,nv,"Lo indicaste tú");
    b.className="chip t"+nv;b.textContent=(nv===2?"❤️ ":nv===1?"👍 ":nv===-1?"👎 ":nv===-9?"🚫 ":"")+P[pid].name});
  bindFixedEditor(rerender);
}
function bindFixedEditor(after){
  const q=s=>document.querySelector(s);if(!q("#addfx"))return;
  const fxr=q("#fxr");const tog=()=>{const free=!fxr.value;q("#fxnameW").hidden=!free;q("#fxcostW").hidden=!free};tog();fxr.onchange=tog;
  q("#addfx").onclick=()=>{
    const recipe=fxr.value||null,name=q("#fxn").value.trim();
    if(!recipe&&!name){toast("Escribe el nombre del plato");return}
    S.fixed.push({id:uid("f"),recipe,name:recipe?"":name,cost:recipe?0:Number(q("#fxc").value)||0,dow:Number(q("#fxd").value),meal:q("#fxm").value,who:q("#fxw").value,capricho:q("#fxcap").checked});
    // Si ese día esa comida estaba como libre o fuera, pasa a cocinarse
    const t=S.home.weekTpl[Number(q("#fxd").value)];const m=q("#fxm").value;if(t[m]!=="cocinar")t[m]="cocinar";
    after();toast("Plato fijo añadido")};
  document.querySelectorAll("[data-delf]").forEach(b=>b.onclick=()=>{S.fixed=S.fixed.filter(f=>f.id!==b.dataset.delf);after()});
}
function validateStep(fullId){
  const H=S.home,a=stepPerson(fullId),id=stepKind(fullId),v=s=>{const e=main.querySelector(s);return e?e.value:null};
  if(id==="hola"){a.name=(v("#wzName")||"").trim()}
  if(id==="aparatos"&&!H.apps.length){toast("Elige al menos uno");return false}
  if(id==="zona"){const cp=(v("#wzCp")||"").trim();if(cp&&!/^\d{5}$/.test(cp)){toast("El código postal tiene 5 números");return false}H.cp=cp;H.municipio=(v("#wzMun")||"").trim()}
  if(id==="familia"){main.querySelectorAll(".kidcard [data-kf=name]").forEach(i=>{const k=S.people.find(p=>p.id===i.closest(".kidcard").dataset.kid);k.name=i.value.trim()});
    if(others().some(k=>!k.name)){toast("Escribe el nombre de cada persona");return false}}
  if(id==="objetivos"){if(!a.goals.length){toast("Elige al menos un objetivo");return false}a.weight=Number(v("#wzW"))||null}
  if(id==="cocina"&&H.cookMode==="lote"&&!H.cookDays.length){toast("Elige al menos un día para cocinar");return false}
  if(id==="plan"){H.planFreq=v("#wzFreq");H.planDay=Number(v("#wzPDay"));H.planTime=v("#wzPTime")||"17:00"}
  if(id==="compra"){H.shop.delivery=Number(v("#wzDel"));H.shop.min=Number(v("#wzMin"))||0;H.shop.fee=Number(v("#wzFee"))||0;
    H.budget.month=Number(v("#wzBM"))||0;H.budget.week=v("#wzBW")===""?null:Number(v("#wzBW"));H.budget.basics=Number(v("#wzBB"))||0}
  return true;
}
