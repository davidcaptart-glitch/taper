/* Táper · asistente de bienvenida (y edición de cada apartado desde Perfil) */
"use strict";

let wiz={i:0,single:null};   // single = id del paso cuando se edita uno suelto desde Perfil; afinar = lista de pasos elegidos al afinar

// Alta: 3 pantallas y el primer menú. Lo demás se pregunta después, solo si se quiere afinar
const ONBOARD=[{id:"casa",eyebrow:"Casa",title:"¿Quién vive *en casa?*"},{id:"comer",eyebrow:"Cómo coméis",title:"¿Algo que *tener en cuenta?*"},{id:"super",eyebrow:"Tu súper",title:"¿Dónde haces *la compra?*"}];
// Lo que se puede afinar después del primer menú: id, texto, pasos del asistente que lo preguntan
const AFINAR=[
  ["presupuesto","💶 Presupuesto mensual",()=>["compra"]],
  ["quien","🗓️ Quién come y cuándo (custodias, días fuera)",()=>["familia"]],
  ["comidas","🥐 Desayunos, almuerzos y meriendas",()=>["familia"]],
  ["gustos","😋 Gustos de cada uno",()=>S.people.map(p=>"gustos:"+p.id)],
  ["planificar","📅 Cuándo planificas y compras",()=>["plan","compra"]],
  ["cocinar","🍳 Cómo cocinas (cada día o tápers)",()=>["cocina"]],
  ["deporte","🏃 Deporte y objetivos",()=>adults().map(a=>"objetivos:"+a.id).concat(S.people.filter(p=>p.trains).map(p=>"entreno:"+p.id))],
  ["fijos","🍕 Platos fijos y caprichos",()=>["cocina"]],
  ["invitar","📩 Que alguien de casa rellene sus preferencias",()=>[]]];

function wizSteps(){
  // Afinar: solo los pasos de lo que se ha marcado
  if(wiz.afinar){const all=fullSteps();return wiz.afinar.map(id=>all.find(s=>s.id===id)).filter(Boolean)}
  if(!S.onboarded&&!S.joining&&!wiz.single)return ONBOARD;
  return fullSteps();
}
function fullSteps(){
  // Quien entra en una casa compartida solo contesta lo suyo
  if(S.joining){const a=me();return [{id:"unirse",eyebrow:"Bienvenida",title:"Hola, *"+(a.name||"bienvenido")+"*"},
    {id:"objetivos:"+a.id,eyebrow:"Objetivos",title:"¿Qué te *importa?*"},{id:"entreno:"+a.id,eyebrow:"Deporte",title:"¿*Entrenas?*"},
    {id:"dieta",eyebrow:"Dieta y alergias",title:"¿Cómo *comes?*"},{id:"gustos:"+a.id,eyebrow:"Gustos",title:"¿Qué te *gusta?*"},
    {id:"listo",eyebrow:"Todo listo",title:"¡A *comer!*"}]}
  const st=[
    // title: lo que va entre *asteriscos* sale en cursiva de acento
    {id:"hola",eyebrow:"Bienvenida",title:"Hola, *empezamos*"},
    {id:"aparatos",eyebrow:"Tu cocina",title:"¿Qué hay en tu *cocina?*"},
    {id:"zona",eyebrow:"Tu súper",title:"¿Dónde haces *la compra?*"},
    {id:"familia",eyebrow:"Tu casa",title:"¿Quién come *en casa?*"},
    {id:"dieta",eyebrow:"Dieta y alergias",title:"¿Cómo *coméis?*"},
    ...adults().flatMap(a=>[{id:"objetivos:"+a.id,eyebrow:"Objetivos",title:isMe(a)?"¿Qué te *importa?*":"¿Qué le importa a *"+personName(a)+"?*"},
      {id:"entreno:"+a.id,eyebrow:"Deporte",title:isMe(a)?"¿*Entrenas?*":"¿"+personName(a)+" *entrena?*"}]),
    ...kids().map(k=>({id:"entreno:"+k.id,eyebrow:"Deporte",title:"¿"+personName(k)+" hace *deporte?*"})),
    {id:"cocina",eyebrow:"Tu semana",title:"¿Cuándo *cocinas?*"},
    {id:"plan",eyebrow:"Planificación",title:"¿Cuándo *planificas?*"},
    {id:"compra",eyebrow:"Presupuesto",title:"Fija tu *presupuesto*"},
    ...S.people.map(p=>({id:"gustos:"+p.id,eyebrow:"Dieta y gustos",title:isMe(p)?"¿Cómo *comes?*":"¿Cómo come *"+personName(p)+"?*"})),
    {id:"listo",eyebrow:"Todo listo",title:"¡A *cocinar!*"}
  ];
  return st;
}
function openWizard(stepId){wiz={i:0,single:stepId||null};tab="wizard";render()}
// Persona a la que se refiere un paso ("objetivos:yo", "entreno:k123"…)
const stepPerson=id=>{const i=id.indexOf(":");return i<0?me():(S.people.find(p=>p.id===id.slice(i+1))||me())};
const stepKind=id=>id.split(":")[0];

/* ---------- Pantalla de bienvenida (antes de la primera pregunta) ---------- */
function renderWelcome(){
  const pick=["marmitako","padthai","tacospastor","salmorejo","curry"].map(id=>RX[id]).filter(r=>r&&hasPhoto(r)).slice(0,3);
  const days=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  const card=(r,dia,n)=>`<div class="mday">${dia} <small>${n} nov</small></div><div class="mcard"><span class="mimg" style="background-image:url('${esc(dishPhoto(r))}')"></span><span><span class="mtags"><i>${r.type==="c"?"Con hidratos":"Ligera"}</i>${(r.prot||0)>=30?"<i>Alto en proteína</i>":""}</span><b>${esc(r.name)}</b><small>Para 2 · ${recipeTime(r)} min</small></span><span class="mp">${eur(rationCost(r))}<small>/rac.</small></span></div>`;
  const snap=snapshot();
  main.innerHTML=`<section class="welcome">
    <div class="wbrand"><svg class="wlogo" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#D22F2A"/><rect x="72" y="176" width="368" height="52" rx="22" fill="#fff"/><rect x="92" y="244" width="328" height="112" rx="34" fill="#fff"/><rect x="140" y="276" width="232" height="14" rx="7" fill="#D22F2A" opacity=".35"/></svg>Táper</div>
    <div class="wdrift" aria-hidden="true">${["🍗","🥕","🧀","🍤","🥚","🍞","🍝","🥬","🍓","🐟","🍚","🥔"].map((e,i)=>`<span style="left:${(i*8.3+3)%96}%;animation-duration:${9+(i*7)%8}s;animation-delay:-${(i*2.3)%9}s;font-size:${1.1+(i%3)*.35}rem">${e}</span>`).join("")}</div>
    <div class="wstage" aria-hidden="true">
      ${["🥦","🍅","🥑","🧄","🌽","🌶️","🫑","🍋"].map((e,i)=>`<span class="veg v${i}">${e}</span>`).join("")}
      <div class="mphone"><div class="mnotch"></div>
        <div class="mhead"><div class="mring"><b>28%</b><small>usado</small></div><div><b>La semana que viene</b><small>2 – 8 nov · 7 platos</small><small><b>22,53 €</b> de 80 € · 🛒 Mercadona</small></div></div>
        <div class="mdays">${days.map((d,i)=>`<span class="${i===0?"on":""}"><small>${d}</small><b>${i+2}</b></span>`).join("")}</div>
        <div class="mbtns"><span class="a">☰ Lista de la compra</span><span>↻ Rehacer</span></div>
        ${pick.map((r,i)=>card(r,days[i]==="Lun"?"Lunes":days[i]==="Mar"?"Martes":"Miércoles",i+2)).join("")}
      </div>
    </div>
    <h1 class="wtitle2">Deja que <em>Táper</em><br>organice tu semana.</h1>
    <p class="wsub">Ahorra dinero, gana tiempo<br>y come más sano sin esfuerzo.</p>
    <div class="wfoot"><button class="btn cta" id="wStart">Empezar <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
      ${snap?`<button class="wlink" id="wRestore">Recuperar mis datos${snap.nombre?" ("+esc(snap.nombre)+")":""}</button>`:isStandalone()&&servidorOn()?`<button class="wlink" id="wSafari">Ya usaba Táper en Safari</button>`:`<label class="wlink">Tengo una copia de seguridad<input type="file" id="wImp" accept="application/json,.json" hidden></label>`}</div>
  </section>`;
  document.getElementById("wStart").onclick=()=>{wiz.started=true;render();scrollTo(0,0)};
  document.getElementById("wRestore")?.addEventListener("click",()=>{if(restoreSnapshot()){tab="menu";render();toast("Datos recuperados")}});
  document.getElementById("wSafari")?.addEventListener("click",openTransferCode);
  document.getElementById("wImp")?.addEventListener("change",e=>{const f=e.target.files[0];if(f)importBackup(f)});
}

function renderWizard(){
  if(!wiz.single&&!wiz.started&&wiz.i===0&&!S.onboarded)return renderWelcome();
  const steps=wizSteps();
  const single=wiz.single==="hijos"?"familia":wiz.single==="semana"?"cocina":wiz.single==="objetivos"||wiz.single==="entreno"?wiz.single+":"+me().id:wiz.single;
  const step=single?steps.find(s=>s.id===single):steps[Math.min(wiz.i,steps.length-1)];
  if(!step){wiz.single=null;tab="perfil";render();return}
  const n=steps.indexOf(step), N=steps.length;
  const back=wiz.single||(wiz.afinar&&n===0)?"cancel":n>0?"back":!S.onboarded?"welcome":null;
  let h=`<section class="wiz"><div class="wtop">${back?`<button class="wback" data-wz="${back}" aria-label="Atrás"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>`:`<span class="wback ph"></span>`}
    ${wiz.single?`<span class="wtitle">Editar</span>`:`<div class="segs" role="progressbar" aria-valuemin="1" aria-valuemax="${N}" aria-valuenow="${n+1}">${steps.map((_,i)=>`<i class="${i<n?"done":i===n?"now":""}"></i>`).join("")}</div><span class="wcount">${n+1}/${N}</span>`}</div>
    <div class="eyebrow">${esc(step.eyebrow||"")}</div><h2 class="wh">${accentTitle(step.title)}</h2>`+stepBody(step.id)+`<div class="wcta">`;
  if(wiz.single)h+=`<button class="btn cta" data-wz="save">Guardar</button>`;
  else h+=`<button class="btn cta" data-wz="next">${wiz.afinar&&n===N-1?"Rehacer mi menú":!S.onboarded&&!S.joining&&step.id==="super"?"Ver mi menú":step.id==="listo"?(S.joining?"Ver nuestro menú":"Crear mi menú"):"Continuar"} <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>`;
  main.innerHTML=h+`</div></section>`;
  bindStep(step.id);
  main.querySelector("[data-wz=back]")?.addEventListener("click",()=>{wiz.i--;render();scrollTo(0,0)});
  main.querySelector("[data-wz=welcome]")?.addEventListener("click",()=>{wiz.started=false;render();scrollTo(0,0)});
  main.querySelector("[data-wz=next]")?.addEventListener("click",()=>{
    if(!validateStep(step.id))return;
    if(wiz.afinar&&n===N-1){finishAfinar();return}
    if(!S.onboarded&&!S.joining&&step.id==="super"){finishOnboarding();return}
    if(step.id==="listo"){if(S.joining)finishJoin();else finishOnboarding();return}
    wiz.i++;save();render();scrollTo(0,0)});
  main.querySelector("[data-wz=save]")?.addEventListener("click",()=>{if(!validateStep(step.id))return;save();refreshPlans();wiz.single=null;tab="perfil";render();toast("Guardado")});
  main.querySelector("[data-wz=cancel]")?.addEventListener("click",()=>{const af=!!wiz.afinar;wiz={i:0,single:null};tab=af?"menu":"perfil";render()});
}
// Título con una parte en cursiva de acento: "¿Dónde haces *la compra?*"
const accentTitle=t=>esc(t).replace(/\*(.+?)\*/g,"<em>$1</em>");
function finishOnboarding(){
  // Lo de antes de hoy no se planifica ni se compra: el plan empieza hoy (o el día que elegiste)
  if(!S.home.start||S.home.start<todayISO())S.home.start=todayISO();
  const quick=!S.afinar;
  if(quick){
    // Lo que se supone hasta que se afine: comida y cena en casa cada día, se cocina cada día, compra en tienda, sin tope de presupuesto
    S.home.weekTpl=[0,1,2,3,4,5,6].map(()=>({comida:"cocinar",cena:"cocinar"}));S.home.cookMode="diario";
    S.home.shop.monthMode="tienda";S.home.shop.weekMode="tienda";S.home.budget.month=0;S.home.budget.week=null;
    S.afinar={state:"ask"};
  }
  S.onboarded=true;save();
  if(typeof trackOnBoot==="function")trackOnBoot();
  if(S.home.cp&&S.home.cp!==S.home.cpLooked)lookupCp(S.home.cp).then(()=>save()).catch(()=>{});
  preparingScreen(()=>{ensureHorizon();if(quick&&!Number(S.home.budget.month)){S.home.budget.month=estimateMonthBudget();S.afinar.cost=S.home.budget.month}save()},()=>{tab="menu";if(S.home.start&&S.home.start>todayISO())month=S.home.start.slice(0,7);render();toast("Menú generado. Puedes cambiar lo que quieras")});
}
// Pantalla "Preparando tu semana": hace el trabajo y enseña lo que va haciendo
function preparingScreen(work,done){
  const b=Number(S.home.budget.week)||weekBudget((S.home.start&&S.home.start>todayISO()?S.home.start:todayISO()).slice(0,7));
  const msgs=["Ajustando a vuestros gustos…","Teniendo en cuenta quién come cada día…",b?`Manteniendo la compra por debajo de ${b} € a la semana…`:"Buscando lo más barato…","Preparando tu lista de la compra…"];
  const ov=document.createElement("div");ov.className="prep";
  ov.innerHTML=`<div class="prepin"><h2 class="wh">Preparando <em>tu semana</em></h2><p>Un momento, nos encargamos.</p>
    <div class="prepart" aria-hidden="true"><span>🍲</span><span>🥗</span><span>🍝</span><span>🐟</span><span>🥘</span><div class="pot">🍳</div></div>
    <div class="prepbar"><i></i></div><p class="prepmsg"><span class="dot"></span><span id="prepTxt">${msgs[0]}</span></p></div>`;
  document.body.appendChild(ov);
  let i=0;const t=setInterval(()=>{i++;if(i<msgs.length)ov.querySelector("#prepTxt").textContent=msgs[i]},750);
  setTimeout(()=>{try{work()}catch(e){console.error(e)}},60);
  setTimeout(()=>{clearInterval(t);ov.classList.add("out");done();setTimeout(()=>ov.remove(),350)},3100);
}
// Cocina dibujada: cada aparato se toca para elegirlo (se ilumina en rojo con su etiqueta)
function kitchenSVG(apps){
  const on=k=>apps.includes(k);
  const tag=(k,x,y,w)=>`<g class="ktag" transform="translate(${x} ${y})"><rect x="${-w/2}" y="-13" width="${w}" height="26" rx="13"/><text y="5" text-anchor="middle">${on(k)?"✓ ":""}${esc(APP[k].replace("Vitro o fogones","Vitro / fuegos"))}</text></g>`;
  const g=(k,body,glow,tg)=>`<g class="kapp ${on(k)?"on":""}" data-app="${k}" role="button" tabindex="0" aria-pressed="${on(k)}" aria-label="${esc(APP[k])}">${glow}${body}${tg}</g>`;
  return `<div class="kit"><svg viewBox="0 0 360 300" xmlns="http://www.w3.org/2000/svg">
  <defs><filter id="kglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter></defs>
  <rect class="kwall" x="0" y="0" width="360" height="300" rx="28"/>
  <g class="ktiles">${Array.from({length:5},(_,i)=>`<line x1="0" y1="${44+i*22}" x2="360" y2="${44+i*22}"/>`).join("")}${Array.from({length:11},(_,i)=>`<line x1="${16+i*33}" y1="44" x2="${16+i*33}" y2="154"/>`).join("")}</g>
  <rect class="kshelf" x="196" y="40" width="130" height="7" rx="3"/>
  <rect class="kjar" x="206" y="18" width="18" height="22" rx="5"/><rect class="kjar b" x="232" y="22" width="16" height="18" rx="5"/><rect class="kjar" x="256" y="16" width="20" height="24" rx="5"/>
  <g class="kplant"><rect x="296" y="26" width="18" height="14" rx="3"/><path d="M305 26c-6-8-2-16 0-18 2 2 6 10 0 18zM305 26c4-6 10-7 13-6-1 3-5 7-13 6zM305 26c-4-6-10-7-13-6 1 3 5 7 13 6z"/></g>
  <rect class="kfloor" x="0" y="268" width="360" height="32" rx="0"/>
  <rect class="kcab" x="18" y="190" width="324" height="80" rx="6"/>
  ${[150,206,262].map(x=>`<rect class="kdoor" x="${x}" y="198" width="50" height="64" rx="5"/><rect class="khandle" x="${x+20}" y="206" width="10" height="3" rx="1.5"/>`).join("")}
  <rect class="ktop" x="12" y="178" width="336" height="14" rx="5"/>
  ${g("horno",`<rect class="kbody" x="26" y="196" width="112" height="70" rx="7"/><rect class="kpanel" x="32" y="201" width="100" height="11" rx="3"/><circle class="kknob" cx="42" cy="206.5" r="3"/><circle class="kknob" cx="54" cy="206.5" r="3"/><rect class="kdisp" x="96" y="203" width="28" height="7" rx="2"/><rect class="kwin" x="36" y="218" width="92" height="40" rx="6"/><rect class="khandle2" x="42" y="214" width="80" height="3" rx="1.5"/>`,
    `<ellipse class="kg" cx="82" cy="232" rx="66" ry="48" filter="url(#kglow)"/>`,tag("horno",82,284,78))}
  ${g("vitro",`<path class="kbody dark" d="M24 170h116l8 10H16z"/><ellipse class="kburn" cx="50" cy="174.5" rx="13" ry="3.2"/><ellipse class="kburn" cx="82" cy="174.5" rx="11" ry="2.8"/><ellipse class="kburn" cx="114" cy="174.5" rx="13" ry="3.2"/>`,
    `<ellipse class="kg" cx="82" cy="172" rx="70" ry="22" filter="url(#kglow)"/>`,tag("vitro",82,150,112))}
  ${g("air",`<path class="kbody" d="M168 112c0-12 8-18 24-18h4c16 0 24 6 24 18v58c0 5-4 8-8 8h-36c-4 0-8-3-8-8z"/><rect class="kdisp" x="184" y="104" width="24" height="12" rx="4"/><circle class="kknob" cx="196" cy="124" r="5"/><path class="kwin" d="M174 134h46v32c0 4-3 6-6 6h-34c-3 0-6-2-6-6z"/><rect class="khandle2" x="188" y="146" width="18" height="6" rx="3"/>`,
    `<ellipse class="kg" cx="194" cy="140" rx="44" ry="50" filter="url(#kglow)"/>`,tag("air",194,80,92))}
  ${g("micro",`<rect class="kbody" x="236" y="116" width="106" height="62" rx="8"/><rect class="kwin" x="244" y="124" width="66" height="46" rx="5"/><rect class="kpanel" x="316" y="124" width="20" height="46" rx="4"/><circle class="kknob" cx="326" cy="134" r="3.4"/><circle class="kknob" cx="326" cy="146" r="3.4"/><rect class="kdisp" x="320" y="156" width="12" height="8" rx="2"/>`,
    `<ellipse class="kg" cx="289" cy="148" rx="66" ry="44" filter="url(#kglow)"/>`,tag("micro",289,100,104))}
  </svg></div>`;
}

// Próximos avisos de "prepara el mes", para ver cómo queda la regla
function monthPrepPreview(H){
  const out=[];let m=todayISO().slice(0,7);
  for(let i=0;i<3;i++){const d=monthPrepDate(m);out.push(`${monthName(m).split(" ")[0]}: ${DAYS[dow(d)].toLowerCase()} ${Number(d.slice(8))}`);m=nextMonthOf(m)}
  return "Próximos avisos · "+out.join(" · ");
}
// Desayuno, almuerzo y merienda de una persona: cada casilla pasa por – (no) → 🏠 (en casa) → 🎒 (se lo lleva)
const SMALL_ICO={no:"–",casa:"🏠",llevar:"🎒"};
function smallGrid(k){
  const sm=k.smallMeals||{};
  return `<div class="field"><label>¿Desayuna, almuerza y merienda?</label>
    <div class="hint" style="margin:0 0 6px">Toca cada casilla: – no la hace · 🏠 en casa · 🎒 se la lleva (cole, trabajo).</div>
    ${k.smallSet?"":`<div class="warnbox small" style="margin:0 0 8px">Sin confirmar: marca sus comidas pequeñas (si no hace ninguna, toca «Ninguna»).</div>`}
    <table class="mealgrid"><tr><th></th>${DSHORT.map(d=>`<th>${d}</th>`).join("")}</tr>
    ${Object.entries(SMALL).map(([m,[e,t]])=>`<tr><td>${t}</td>${DSHORT.map((_,i)=>{const v=(sm[m]||[])[i]||"no";return `<td><button type="button" class="mg sm ${v}" data-sm="${m}|${i}" aria-label="${t} ${DAYS[i]}: ${v}">${SMALL_ICO[v]}</button></td>`}).join("")}</tr>`).join("")}</table>
    <div class="chips" style="margin-top:8px">${chip("data-smq","cole",false,"Desayuno en casa y almuerzo para llevar entre semana, merienda")}${chip("data-smq","todo",false,"Las tres en casa")}${chip("data-smq","desayuno",false,"Solo desayuno")}${chip("data-smq","nada",false,"Ninguna")}</div></div>`;
}

// Días como pastillas verticales (L M X J V S D)
const dayPills=(attr,sel)=>`<div class="daypills">${["L","M","X","J","V","S","D"].map((d,i)=>`<button type="button" class="dp" ${attr}="${i}" aria-pressed="${sel.includes(i)}" aria-label="${DAYS[i]}"><b>${d}</b><i></i></button>`).join("")}</div><p class="dpcount">${sel.length} ${sel.length===1?"día":"días"} a la semana</p>`;
// Tras cambiar ajustes: rellena los huecos nuevos sin tocar los platos ya elegidos
function refreshPlans(){for(const s of Object.keys(S.plans))if(s>=weekStartFor(todayISO()))ensureWeek(s);save()}

const chip=(attr,val,on,label)=>`<button type="button" class="chip" ${attr}="${esc(val)}" aria-pressed="${!!on}">${label}</button>`;
const dowSelect=(id,val)=>`<select id="${id}">${DAYS.map((d,i)=>`<option value="${i}" ${i===Number(val)?"selected":""}>${d}</option>`).join("")}</select>`;

function stepBody(fullId){
  const H=S.home, a=stepPerson(fullId), id=stepKind(fullId)==="gustos"?fullId:stepKind(fullId), you=isMe(a);
  if(id==="unirse"){const o=S.people.find(x=>x.id==="yo");return `<p class="lead">${o&&o.name&&!isMe(o)?esc(o.name)+" te ha añadido a su casa en Táper.":"Te han añadido a una casa en Táper."} Tendréis el mismo menú y la misma lista de la compra, y los dos podréis cambiar cosas.</p>
    <p>Te hago unas preguntas rápidas sobre <b>ti</b>: qué te importa, si entrenas, cómo comes y qué te gusta. Así el menú también será a tu medida.</p>
    <div class="field"><label for="wzName">¿Cómo te llamas?</label><input id="wzName" type="text" value="${esc(a.name)}" placeholder="Tu nombre"></div>`}
  if(id==="casa"){const named=S.people.filter(p=>p.name),ed=wiz.editP&&S.people.find(p=>p.id===wiz.editP),first=!named.length;
    const n=H.apps.filter(k=>k!=="ninguno").length;
    return `<p class="lead">${first?"Empieza por ti y luego añade a cada persona.":"Añade a cada persona."} La edad me dice cuánto come cada uno.</p>
    <div class="addp"><input id="cName" type="text" placeholder="${first?"Tu nombre":"Nombre"}" value="${esc(ed?ed.name:"")}" autocomplete="${first?"given-name":"off"}">
      <select id="cAge" aria-label="Edad"><option value="">Edad</option>${AGE_RANGES.filter(r=>!(first||(ed&&ed.id==="yo"))||ageOf(r[0])>=18).map(([k,t])=>`<option value="${k}" ${ed&&ed.ageRange===k?"selected":""}>${t}</option>`).join("")}</select>
      <button type="button" class="btn" id="cAdd" aria-label="${ed?"Guardar":"Añadir"}">${ed?"✓":"+"}</button></div>
    ${named.length?`<div class="pchips">${named.map(p=>`<span class="pchip ${wiz.editP===p.id?"on":""}"><button type="button" data-pedit="${p.id}">${esc(p.name)} <small>${p.id==="yo"?"tú · ":""}${esc(ageLabel(p.ageRange)||(p.kind==="nino"&&p.age?p.age+" años":""))}</small></button>${p.id==="yo"?"":`<button type="button" class="px" data-pdel="${p.id}" aria-label="Quitar a ${esc(p.name)}">✕</button>`}</span>`).join("")}</div>`:""}
    <h3 class="kith">Selecciona con qué cocinas</h3>${kitchenSVG(H.apps)}
    <p class="kitcount">${n?`${n} ${n===1?"aparato":"aparatos"}: ${H.apps.filter(k=>APP[k]&&k!=="ninguno").map(k=>APP[k].toLowerCase()).join(", ")}`:"Toca los aparatos de tu cocina"}</p>`}
  if(id==="comer"){
    const mainDiets=["omni","vege","vegano","halal"],mainAlg=["gluten","lacteos","huevo","frutos_cascara","pescado"];
    let h=`<p class="lead">Solo planificaré platos que encajen con cada uno.</p>`;
    for(const p of S.people){const dt=dietOf(p),al=p.allergies||[],more=(wiz.more||{})[p.id];
      const ds=more?Object.keys(DIETS):[...new Set(mainDiets.concat(dt))],as=more?Object.keys(ALLERGENS):[...new Set(mainAlg.concat(al))];
      h+=`<div class="kidcard"><div class="row"><b>${esc(isMe(p)?(p.name||"Tú"):personName(p))}</b><span class="small muted">${isMe(p)?"tú":esc(ageLabel(p.ageRange))}</span></div>
        <div class="field"><label>Forma de comer</label><div class="chips">${ds.map(k=>chip("data-diet",p.id+"|"+k,dt===k,DIETS[k][0]+" "+esc(DIETS[k][1]))).join("")}</div></div>
        <div class="field"><label>Alergias o intolerancias</label><div class="chips">${chip("data-alg-none",p.id,!al.length,"🍽️ Ninguna")}${as.map(k=>chip("data-alg",p.id+"|"+k,al.includes(k),ALLERGEN_ICO[k]+" "+esc(ALLERGENS[k].split(" (")[0]))).join("")}</div></div>
        ${more?"":`<button type="button" class="btn ghost small" data-more="${p.id}">Más formas de comer y alergias</button>`}
        <div class="field"><label>¿Hace deporte?</label><div class="chips">${chip("data-trainp",p.id+"|1",p.trains,"Sí")}${chip("data-trainp",p.id+"|0",!p.trains,"No")}</div>${p.trains?`<div class="hint">Los días y horas, cuando afines el menú.</div>`:""}</div></div>`}
    const n=R.filter(r=>!r.small&&!r.pack&&S.people.every(p=>canEat(p,r))).length;
    return h+`<div class="okbox small">${n<10?"⚠️ ":"✓ "}<b>${n}</b> ${n===1?"plato encaja":"platos encajan"} con vuestra casa.</div><div class="hint">Es orientativo: revisa siempre la etiqueta.</div>`;
  }
  if(id==="super"){const ch=H.supers&&H.supers.length?H.supers:[H.super||"mercadona"],ok=x=>superHasPrices(x.id);
    const tile=x=>{const on=ch.includes(x.id);return `<button type="button" class="suptile" data-super="${x.id}" aria-pressed="${on}" ${ok(x)?"":"disabled"} style="--brand:${x.color||"var(--ink)"}"><span class="tick">✓</span>${x.logo?`<img class="slogo" src="${esc(x.logo)}" alt="${esc(x.nombre)}">`:`<b class="wm">${esc(x.nombre)}</b>`}<small>${ok(x)?(x.id==="mercadona"?"Precios de tu zona":"Precios semanales"):"Próximamente"}</small></button>`};
    return `<div class="field"><label for="wzCp">Tu código postal</label><input id="wzCp" type="text" inputmode="numeric" maxlength="5" value="${esc(H.cp)}" placeholder="Por ejemplo, 08784" autocomplete="postal-code">
      <div class="hint">${H.municipio&&H.cp===H.cpLooked?`📍 ${esc(H.municipio)} · tus precios y tus festivos`:"Con él sé tus precios, qué súper te lo lleva a casa y tus festivos."}</div></div>
    ${(H.cpPlaces||[]).length>1&&H.cp===H.cpLooked?`<div class="field"><label>¿Cuál es tu pueblo?</label><div class="chips">${H.cpPlaces.map(p=>chip("data-place",p,H.municipio===p,esc(p))).join("")}</div></div>`:""}
    <h3 class="kith">Marca los supermercados que te vengan bien</h3><p class="small muted" style="margin:-4px 0 10px">Aunque solo vayas a la tienda: comparo sus precios cada semana.</p>
    <div class="supgrid">${SUPERS.filter(ok).map(tile).join("")}</div>
    <details class="more"><summary>Ver más supermercados</summary><div class="supgrid" style="margin-top:8px">${SUPERS.filter(x=>!ok(x)).map(tile).join("")}</div></details>`}
  if(id==="hola")return `<p class="lead">Táper te prepara el menú, la lista de la compra y los tápers de la semana, a tu medida. Unas preguntas rápidas y empezamos. Todo se puede cambiar después.</p>
    <div class="field"><label for="wzName">¿Cómo te llamas?</label><input id="wzName" type="text" value="${esc(a.name)}" placeholder="Tu nombre"></div>
    ${isStandalone()&&servidorOn()?`<button type="button" class="btn ghost small" id="wzTr">¿Ya usabas Táper en Safari? Trae tus datos</button>`:""}
    ${snapshot()?`<div class="okbox small" style="margin-top:14px">Tienes tus datos guardados del ${esc(new Date(snapshot().at).toLocaleString("es-ES",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}))}${snapshot().nombre?" ("+esc(snapshot().nombre)+")":""}.<br><button type="button" class="btn small" id="wzRestore" style="margin-top:8px">Recuperar mis datos</button></div>`:""}`;
  if(id==="aparatos"){const n=H.apps.filter(k=>k!=="ninguno").length;
    return `<p class="lead">Toca lo que tienes. Solo te propondré recetas que puedas hacer.</p>${kitchenSVG(H.apps)}
    <p class="kitcount">${n?`${n} ${n===1?"aparato":"aparatos"}: ${H.apps.filter(k=>APP[k]&&k!=="ninguno").map(k=>APP[k].toLowerCase()).join(", ")}`:"Toca los aparatos de tu cocina"}</p>`}
  if(id==="zona"){const ch=H.supers&&H.supers.length?H.supers:[H.super||"mercadona"],ok=x=>superHasPrices(x.id);
    return `<p class="lead">¿Dónde te viene bien comprar? Marca todos los supermercados, aunque solo vayas a la tienda: comparo sus precios cada semana.</p>
    <div class="supgrid">${SUPERS.slice().sort((a,b)=>ok(b)-ok(a)).map(x=>{const on=ch.includes(x.id),sin=(x.sin_reparto||[]).includes(H.cp);
      return `<button type="button" class="suptile" data-super="${x.id}" aria-pressed="${on}" ${ok(x)?"":"disabled"} style="--brand:${x.color||"var(--ink)"}"><span class="tick">✓</span>${x.logo?`<img class="slogo" src="${esc(x.logo)}" alt="${esc(x.nombre)}">`:`<b class="wm">${esc(x.nombre)}</b>`}<small>${ok(x)?(H.super===x.id&&ch.length>1?"Principal":sin?"Solo en tienda":x.id==="mercadona"?"Precios de tu zona":"Precios semanales"):"Próximamente"}</small></button>`}).join("")}</div>
    <p class="small muted" style="margin:-8px 0 14px">Los logotipos son de sus marcas y solo sirven para reconocer cada súper (imágenes de <a href="https://commons.wikimedia.org" target="_blank" rel="noopener">Wikimedia Commons</a>).</p>
    ${ch.length>1?`<div class="field"><label>Tu supermercado principal</label><div class="chips">${ch.map(s=>chip("data-mainsup",s,H.super===s,esc(superById(s).nombre))).join("")}</div></div>
    <div class="field"><label>¿Cómo hago la lista?</label><div class="chips">${chip("data-strat","barato",H.shop.strategy==="barato","Cada cosa donde sea más barata")}${chip("data-strat","principal",H.shop.strategy!=="barato","Todo en el principal")}</div>
      <div class="hint">Puedes cambiarlo cuando quieras desde la lista de la compra.</div></div>`:""}
    <div class="field"><label for="wzCp">Tu código postal</label><input id="wzCp" type="text" inputmode="numeric" maxlength="5" value="${esc(H.cp)}" placeholder="Por ejemplo, 08784" autocomplete="postal-code">
      <div class="hint">Lo uso para los precios de tu zona, saber qué supermercados te llevan la compra a casa y tus festivos.</div></div>
    ${(H.cpPlaces||[]).length>1?`<div class="field"><label>¿Cuál es tu municipio?</label><div class="chips">${H.cpPlaces.map(p=>chip("data-place",p,H.municipio===p,esc(p))).join("")}</div></div>`:""}
    <div class="field"><label for="wzMun">Municipio (para los festivos locales)</label><input id="wzMun" type="text" list="wzMunList" value="${esc(H.municipio)}" placeholder="Por ejemplo, Piera"><datalist id="wzMunList">${Object.keys((FEST||{}).locales||{}).map(m=>`<option value="${esc(m)}">`).join("")}</datalist>
    <div class="hint">Si tu municipio no sale en la lista, añade sus festivos locales en Perfil > Festivos.</div></div>
    ${zoneMissing&&H.cp?`<div class="okbox small">Tu zona aún no tiene precios propios: ya los he pedido y los tendrás en uno o dos días. Mientras, verás los de la zona más cercana (suelen variar unos céntimos).</div>`:""}`;}
  if(id==="dieta"){
    let h=`<p class="lead">Elige la forma de comer de cada persona y sus alergias. Solo planificaré platos que encajen y no os preguntaré por ingredientes que no tomáis.</p>`;
    for(const p of (S.joining?[me()]:S.people)){const dt=dietOf(p),al=p.allergies||[];
      h+=`<div class="kidcard"><div class="row"><b>${esc(isMe(p)?(p.name||"Tú"):personName(p))}</b><span class="small muted">${isMe(p)?"tú":p.kind==="nino"?"niño o niña":"adulto"}</span></div>
        <div class="field"><label>Forma de comer</label><div class="chips">${Object.entries(DIETS).map(([k,[e,t]])=>chip("data-diet",p.id+"|"+k,dt===k,e+" "+esc(t))).join("")}</div>
        <div class="okbox small" style="margin-top:8px"><b>${DIETS[dt][0]} ${esc(DIETS[dt][1])}:</b> ${esc(DIET_INFO[dt]||"")}${dt==="halal"?" Los supermercados no indican el sello halal en su web.":""}
          ${(()=>{const n=R.filter(r=>!r.small&&!r.pack&&canEat(p,r)).length;return dt==="omni"?"":`<br>${n<10?"⚠️ ":""}Hay <b>${n}</b> ${n===1?"plato principal que encaja":"platos principales que encajan"}${n<10?": tus menús se repetirán bastante hasta que añada más.":"."}`})()}</div></div>
        <div class="field"><label>Alergias o intolerancias</label><div class="chips">${chip("data-alg-none",p.id,!al.length,"🍽️ Ninguna")}${Object.entries(ALLERGENS).map(([k,t])=>chip("data-alg",p.id+"|"+k,al.includes(k),ALLERGEN_ICO[k]+" "+esc(t))).join("")}</div>
          <div class="hint">Es orientativo: revisa siempre la etiqueta.</div></div></div>`}
    return h+`<p class="small muted">Si en casa coméis el mismo plato, buscaré platos que encajen con todos.</p>`;
  }
  if(id==="familia"){
    const ptypes=[["siempre","Siempre"],["alternas","Semanas alternas"],["findes","Fines de semana alternos"],["dias","Días concretos de la semana"],["manual","Lo marco cada semana"]];
    let h=`<p class="lead">Añade a quien come contigo: pareja, hijos, otros familiares, compañeros de piso… Cada uno con cuándo está, su ración y sus propios gustos.</p>
    <div class="kidcard" data-kid="yo"><div class="row"><b>${esc(me().name||"Tú")}</b><span class="small muted">tú</span></div>${smallGrid(me())}</div>`;
    for(const k of others()){const pr=k.presence||{type:"siempre"}, ad=k.kind==="adulto";
      h+=`<div class="kidcard" data-kid="${k.id}"><div class="row"><b>${esc(personName(k))}</b><span class="small muted">${ad?"adulto":"niño o niña"}</span><span class="spacer"></span><button class="btn ghost small" data-delkid="${k.id}">Quitar</button></div>
      <div class="field"><label>¿Cómo se llama?</label><input type="text" data-kf="name" value="${esc(k.name)}" placeholder="Nombre"></div>
      ${ad?`<div class="field"><label>Su ración</label><select data-kf="factor">${[[0.8,"Pequeña"],[1,"Normal"],[1.2,"Grande"]].map(([v,t])=>`<option value="${v}" ${Number(k.factor)===v?"selected":""}>${t}</option>`).join("")}</select></div>
        <label class="row small"><input type="checkbox" data-kf="tupper" ${k.tupper?"checked":""} style="width:auto"> Se lleva táper los días de táper</label>`
      :`<div class="field"><label>Edad</label><input type="number" min="1" max="25" data-kf="age" value="${esc(k.age||"")}"><div class="hint">Su ración: ${String(k.factor).replace(".",",")} de la de un adulto (se calcula con la edad).</div></div>`}
      <div class="field"><label>¿Cuándo come en casa?</label><select data-kf="ptype">${ptypes.map(([v,t])=>`<option value="${v}" ${pr.type===v?"selected":""}>${t}</option>`).join("")}</select></div>
      ${pr.type==="alternas"||pr.type==="findes"?(()=>{const t=turnInfo(pr);return `<div class="field"><label>Un día en que empieza su turno contigo (el día del cambio)</label><input type="date" data-kf="anchor" value="${esc(t.anchor)}"><div class="hint">Por ejemplo, un viernes en que viene contigo.</div></div>
        <div class="row"><div class="field" style="flex:1"><label>Ese día llega para</label><select data-kf="arrive"><option value="comida" ${t.arrive==="comida"?"selected":""}>la comida</option><option value="cena" ${t.arrive==="cena"?"selected":""}>la cena</option></select></div>
        <div class="field" style="flex:1"><label>El último día se va</label><select data-kf="leave"><option value="cena" ${t.leave==="cena"?"selected":""}>después de cenar</option><option value="comida" ${t.leave==="comida"?"selected":""}>después de comer</option></select></div></div>
        <div class="okbox small">${esc(turnText(k))}</div>`})():""}
      ${pr.type==="dias"?dayPills("data-kday",pr.days||[]):""}
      ${pr.type!=="manual"?(()=>{const aw=k.away||{};return `<div class="field"><label>Cuando está contigo, ¿qué comidas hace en casa?</label>
        <div class="hint" style="margin:0 0 6px">Cada persona es distinta: marca solo las que hace en casa. Las que haga fuera (comedor del cole, trabajo…), déjalas sin marcar.</div>
        ${k.mealsSet?"":`<div class="warnbox small" style="margin:0 0 8px">Sin confirmar: marca sus comidas${k.away?"":" (ahora cuento que hace todas en casa)"}.</div>`}
        <table class="mealgrid"><tr><th></th>${DSHORT.map(d=>`<th>${d}</th>`).join("")}</tr>
        ${["comida","cena"].map(m=>`<tr><td>${m==="comida"?"Comida":"Cena"}</td>${DSHORT.map((_,i)=>{const home=!(aw[m]||[]).includes(i);return `<td><button type="button" class="mg" data-away="${m}|${i}" aria-pressed="${home}" aria-label="${m} ${DAYS[i]}: ${home?"en casa":"fuera"}">${home?"✓":""}</button></td>`}).join("")}</tr>`).join("")}</table>
        <div class="chips" style="margin-top:8px">${chip("data-awayq","cole",k.mealsSet&&(aw.comida||[]).join()==="0,1,2,3,4"&&!(aw.cena||[]).length,"Entre semana solo cena en casa")}${chip("data-awayq","todo",k.mealsSet&&!(aw.comida||[]).length&&!(aw.cena||[]).length,"Todas en casa")}${chip("data-awayq","nada",false,"Desmarcar todo")}</div>
        <label class="row small" style="margin-top:6px"><input type="checkbox" data-kf="awayhol" ${k.awayHolidays?"":"checked"} style="width:auto"> Los festivos come en casa</label></div>`})():""}
      ${pr.type!=="manual"?smallGrid(k):""}
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
    const kid=a.kind==="nino";
    let h=`${kid?`<p class="lead">Los días que entrena le pongo algo más de ración y platos que le den energía antes y le ayuden a recuperar después. Nada de dietas de adulto.</p>`:""}<div class="chips">${chip("data-trains","1",a.trains,you?"Sí, entreno":kid?"Sí, hace deporte":"Sí, entrena")}${chip("data-trains","0",!a.trains,"No")}</div>`;
    if(!a.trains)return h;
    h+=`<div class="group"><h3>¿Qué ${you?"haces":"hace"}? (puedes elegir varios)</h3>${Object.entries(kid?{"Los más habituales":KID_SPORTS}:SPORT_GROUPS).map(([g,ks])=>`<div class="small muted" style="margin:8px 0 4px">${g}</div><div class="chips">${ks.map(k=>chip("data-sport",k,a.sports.includes(k),SPORTS[k])).join("")}</div>`).join("")}</div>
    <div class="group"><h3>${you?"Tu":"Su"} semana habitual</h3><p class="muted small" style="margin:0 0 8px">Con la hora de cada sesión sé si se entrena antes o después de comer. Cada semana te la propondré ya rellena y solo cambiarás lo que varíe.</p>`;
    for(let d=0;d<7;d++){const ss=a.train[d]||[];
      h+=`<div class="daycard"><div class="row"><b>${DAYS[d]}</b><span class="spacer"></span>${ss.length<2?`<button class="btn ghost small" data-addsess="${d}">+ Sesión</button>`:""}</div>
      ${ss.map((s,i)=>`<div class="sess"><input type="time" data-sw="${d}:${i}" value="${esc(sessTime(s))}" style="width:auto" aria-label="Hora">
      <select data-st="${d}:${i}">${(a.sports.length?a.sports:Object.keys(SPORTS)).map(k=>`<option value="${k}" ${s.type===k?"selected":""}>${SPORTS[k]}</option>`).join("")}</select>
      <button class="btn ghost small" data-delsess="${d}:${i}" aria-label="Quitar sesión">✕</button></div>`).join("")}</div>`}
    return h+`</div>`;
  }
  if(id==="cocina"){
    const modes=[["diario","🍳","Cada día","Cocinas la cena y haces doble para el táper de mañana"],["lote","🥡","Por lotes","Uno o varios días cocinas varios platos y los guardas en tápers"]];
    let h=`<div class="cookmodes">${modes.map(([k,e,t,d])=>`<button type="button" class="cmode" data-cook="${k}" aria-pressed="${H.cookMode===k}"><span class="ce">${e}</span><b>${t}</b><small>${d}</small></button>`).join("")}</div>
    ${H.cookMode==="lote"?`<div class="group"><h3>¿Qué días cocinas?</h3>${dayPills("data-cday",H.cookDays)}<div class="hint" style="color:var(--muted)">Elegiré platos que aguanten en la nevera hasta que te los comas; si no aguantan, te diré cuáles congelar.</div></div>`:""}
    <div class="group"><h3>Tu semana normal</h3><p class="muted small" style="margin:0 0 10px">Toca cada comida para cambiarla. Cada semana podrás cambiar cualquier día.</p>
    <div class="wgrid"><span></span>${DSHORT.map(d=>`<b>${d.slice(0,1)}</b>`).join("")}
    ${["comida","cena"].map(m=>`<span class="wl">${m==="comida"?"Comida":"Cena"}</span>${[0,1,2,3,4,5,6].map(d=>{const v=H.weekTpl[d][m];return `<button type="button" class="wc ${v}" data-wt="${d}:${m}" aria-label="${DAYS[d]}, ${m}: ${MEALSTATE[v]}"><span>${WT_ICO[v]}</span></button>`}).join("")}`).join("")}</div>
    <div class="wlegend">${Object.entries(MEALSTATE).map(([k,v])=>`<span><i class="wc ${k}">${WT_ICO[k]}</i>${k==="taper"?"Táper (de la cena de antes)":k==="cocinar"?"Cocino":k==="fuera"?"Como fuera":"Libre"}</span>`).join("")}</div></div>
    <details class="more"><summary>⏰ Horario y otras comidas</summary><div class="group" style="margin-top:6px"><div class="row"><label class="small" style="min-width:4.5em">Comida</label><input type="time" data-mt="comida" value="${esc(H.mealTimes.comida)}" style="width:auto"><label class="small">Cena</label><input type="time" data-mt="cena" value="${esc(H.mealTimes.cena)}" style="width:auto"></div>
      <p class="muted small">¿Haces más comidas? Márcalas con su hora (de momento el menú planifica comida y cena).</p>
      ${Object.entries(EXTRA_MEALS).map(([k,v])=>`<div class="row" style="margin:4px 0"><label class="row small" style="flex:1"><input type="checkbox" data-xm="${k}" ${H.extraMeals[k]?"checked":""} style="width:auto"> ${v}</label>${H.extraMeals[k]?`<input type="time" data-xmt="${k}" value="${esc(H.extraMeals[k])}" style="width:auto">`:""}</div>`).join("")}</div></details>`;
    h+=`<details class="more" ${S.fixed.length?"open":""}><summary>🍕 Platos fijos y caprichos${S.fixed.length?` (${S.fixed.length})`:""}</summary><p class="muted small" style="margin:6px 0 8px">Por ejemplo, pizza el viernes por la noche. Los caprichos cuentan para la compra, pero no para tus objetivos.</p>`+fixedEditor()+`</details>`;
    return h;
  }
  if(id==="plan")return `<p class="lead">Te avisaré para preparar el menú y la compra.</p>
    <div class="field"><label for="wzStart">¿Desde cuándo empieza el plan?</label><input id="wzStart" type="date" value="${esc(H.start||todayISO())}">
      <div class="hint">Hasta ese día no hago compra: te ayudo a gastar lo que ya tienes en casa.</div></div>
    <div class="field"><label for="wzFreq">¿Cada cuánto?</label><select id="wzFreq">${[["diaria","Cada día"],["semanal","Cada semana"],["quincenal","Cada dos semanas"],["mensual","Cada mes"]].map(([v,t])=>`<option value="${v}" ${H.planFreq===v?"selected":""}>${t}</option>`).join("")}</select></div>
    <div class="field"><label for="wzPDay">Día (la semana del menú empieza ese día)</label>${dowSelect("wzPDay",H.planDay)}</div>
    <div class="field"><label for="wzPTime">Hora</label><input id="wzPTime" type="time" value="${esc(H.planTime)}"></div>
    <div class="group"><h3>¿Cuándo preparamos el mes siguiente?</h3>
      <div class="field"><label for="wzMPD">Avísame el día de la última semana del mes</label>${dowSelect("wzMPD",H.monthPrepDay??1)}</div>
      <div class="field"><label for="wzMPA">Si en esa semana ya cambia el mes, avísame antes, el día de la semana anterior</label>${dowSelect("wzMPA",H.monthPrepAlt??4)}</div>
      <div class="okbox small" id="mpPrev">${monthPrepPreview(H)}</div></div>`;
  if(id==="compra"){const sh=H.shop,b=H.budget;
    const modeChips=(k,v)=>Object.entries(SHOP_MODES).map(([m,t])=>chip("data-mode",k+":"+m,v===m,t)).join("");
    const tf=Object.entries(SHOP_MODES).map(([m,t])=>{const x=tarifa(m);return `${t}: ${x.envio?eur(x.envio)+" de envío":"sin envío"}${x.minimo?", pedido mínimo "+eur(x.minimo):""}`}).join(" · ");
    return `<div class="budget"><div class="bnum"><span id="bVal">${Math.round(b.month)}</span><sup>€</sup></div><div class="bsub">al mes · unos <b id="bWeek">${eur((Number(b.month)||0)/weeksInMonth(todayISO().slice(0,7)).length)}</b> a la semana</div>
      <input type="range" id="wzBM" min="40" max="900" step="5" value="${Math.min(900,Math.max(40,Number(b.month)||150))}" style="--p:${(Math.min(900,Math.max(40,Number(b.month)||150))-40)/8.6}%" aria-label="Presupuesto al mes">
      <div class="brange"><span>40 €</span><span>900 €</span></div>
      <div class="bcount"><span class="ico">👥</span><span><b>Cocinas para</b><small>${S.people.length===1?"Solo tú":S.people.map(personName).join(", ")}</small></span><span class="bn">${S.people.length}</span></div></div>
    <details class="more"><summary>Más ajustes del presupuesto</summary>
    <div class="field"><label for="wzBW">Presupuesto a la semana (€)</label><input id="wzBW" type="number" min="0" step="1" value="${b.week??""}" placeholder="Automático: el del mes entre las semanas"></div>
    <div class="field"><label for="wzBB">Básicos al mes: aceite, sal, especias (€)</label><input id="wzBB" type="number" min="0" step="1" value="${b.basics}"></div></details>
    <p class="small muted" style="margin:18px 0 0">💡 Truco: la compra del mes (lo que pesa y aguanta) online y el fresco de cada semana en tienda suele salir más barato: un solo envío al mes. En la lista de la compra te comparo las opciones.</p>
    <div class="group"><h3>Compra del mes (despensa, carne para congelar y congelados)</h3><div class="chips">${modeChips("monthMode",sh.monthMode)}</div></div>
    <div class="group"><h3>Compra de cada semana (fresco)</h3><div class="chips">${modeChips("weekMode",sh.weekMode)}</div></div>
    <div class="field"><label for="wzDel">Día en que llega o haces la compra semanal</label>${dowSelect("wzDel",sh.delivery)}<div class="hint">Lo que cocines antes de ese día sale de lo que ya tienes en casa.</div></div>
    <p class="small muted">Tarifas de ${esc(superInfo().nombre||"tu supermercado")}: ${esc(tf)}. Las pone la app y se actualizan si cambian.</p>

    <div class="group"><h3>¿Te importa repetir platos para ahorrar?</h3><div>${Object.entries(REPEAT).map(([k,[t,d]])=>`<button type="button" class="alt" data-rep="${k}" style="${(H.repeat||"no")===k?"outline:2px solid var(--tomato)":""}"><b>${t}</b><small>${d}</small></button>`).join("")}</div></div>
    <div class="group"><h3>Si no llega el presupuesto, acepto…</h3><p class="muted small" style="margin:0 0 8px">Siempre intento acercarme al máximo. Si no llego, te preguntaré; puedes dejarlo decidido aquí.</p>
    <div class="chips">${Object.entries(SACRIFICES).map(([k,[t]])=>chip("data-sac",k,(H.sacrifice||{})[k],t)).join("")}</div></div>`;
  }
  if(id.startsWith("gustos:"))return tastesEditor(a);
  if(id==="listo"&&S.joining)return `<p class="lead">Listo. Ajusto el menú de la casa para que también tenga en cuenta lo tuyo. Después de cada comida te preguntaré qué tal, y así aprendo lo que te gusta.</p>`;
  if(id==="listo")return `<p class="lead">Con esto preparo tu primer menú. Cada vez que valores un plato aprenderé más de lo que os gusta.</p>
    <div class="okbox">Todo se guarda solo en este móvil. Haz una copia de seguridad de vez en cuando desde Perfil.</div>`;
  return "";
}

function tastesEditor(p){
  const groups={};for(const x of Object.values(P))if(dietAllows(p,x.id))(groups[x.aisle]=groups[x.aisle]||[]).push(x);
  const al=p.allergies||[], dt=dietOf(p);
  let h=`<p class="lead">Toca cada ingrediente para cambiarlo. Lo que dejes sin marcar lo iré aprendiendo.</p>
  <div class="legend"><span>1 toque: ❤️ me encanta</span><span>2: 👍 me gusta</span><span>3: 👎 no me gusta</span><span>4: 🚫 no puede comerlo</span></div>`;
  for(const [g,list] of Object.entries(groups)){
    h+=`<div class="group"><h3>${esc(g)}</h3><div class="chips">${list.sort((a,b)=>a.name.localeCompare(b.name)).map(x=>{const v=ingPref(p,x.id);
      return `<button type="button" class="chip t${v}" data-ing="${x.id}" data-person="${p.id}">${v===2?"❤️ ":v===1?"👍 ":v===-1?"👎 ":v===-9?"🚫 ":""}${esc(x.name)}</button>`}).join("")}</div></div>`}
  return h;
}
function fixedEditor(){
  let h=S.fixed.map(f=>`<div class="fixed"><span><b>${esc(f.recipe&&RX[f.recipe]?RX[f.recipe].name:f.name)}</b><small>${DAYS[f.dow]}, ${f.meal}${f.capricho?", capricho":""}, ${{todas:"siempre",con:"con los niños",sin:"sin los niños"}[f.who]}${!f.recipe&&f.cost?", "+eur(Number(f.cost)):""}</small></span><button class="btn ghost small" data-delf="${f.id}">Quitar</button></div>`).join("");
  h+=`<div class="field"><label for="fxr">Plato</label><select id="fxr"><option value="">Otro (escribe el nombre)</option><optgroup label="🍔 Caprichos">${R.filter(r=>r.cap).map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join("")}</optgroup><optgroup label="Recetas">${R.filter(r=>!r.cap&&!r.small).map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join("")}</optgroup></select></div>
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
  q("#askZone")&&(q("#askZone").onclick=async()=>{const c=CFG.sugerenciasEnvio;if(!c){toast("Pídeselo a quien te pasó la app");return}
    const fd=new URLSearchParams();fd.append(c.campos.tipo,"Otra cosa");fd.append(c.campos.texto,`AÑADIR CÓDIGO POSTAL: ${H.cp}
USUARIO: ${S.uid}`);fd.append(c.campos.contacto,[me().name,S.uid].filter(Boolean).join(" · "));fd.append(c.campos.version,String(APP_VERSION));
    try{await fetch(c.url,{method:"POST",mode:"no-cors",body:fd});S.zoneAsked=H.cp;save();rerender();toast("Pedido enviado")}catch(e){toast("Sin conexión: inténtalo más tarde")}});
  q("#wzTr")&&(q("#wzTr").onclick=openTransferCode);
  q("#wzRestore")&&(q("#wzRestore").onclick=()=>{if(restoreSnapshot()){wiz={i:0,single:null};tab="menu";render();toast("Datos recuperados")}});
  ["#wzMPD","#wzMPA"].forEach(sel=>q(sel)&&(q(sel).onchange=()=>{H.monthPrepDay=Number(q("#wzMPD").value);H.monthPrepAlt=Number(q("#wzMPA").value);save();q("#mpPrev").textContent=monthPrepPreview(H)}));
  q("#wzBM")&&(q("#wzBM").oninput=e=>{const v=Number(e.target.value);e.target.style.setProperty("--p",(v-40)/8.6+"%");q("#bVal").textContent=v;q("#bWeek").textContent=eur(v/weeksInMonth(todayISO().slice(0,7)).length)});
  // Código postal: al escribir los 5 números, busco el municipio (y, si hay varios, los ofrezco)
  q("#wzCp")&&(q("#wzCp").oninput=async e=>{const cp=e.target.value.trim();if(!/^\d{5}$/.test(cp)||cp===H.cpLooked)return;
    try{await lookupCp(cp);rerender();setTimeout(()=>{const i=document.getElementById("wzCp");if(i){i.focus();i.setSelectionRange(5,5)}},0)}
    catch(err){H.cp=cp;H.cpPlaces=[]}});
  qa("[data-place]").forEach(b=>b.onclick=()=>{H.municipio=b.dataset.place;rerender()});
  qa("[data-super]").forEach(b=>b.onclick=()=>{const sid=b.dataset.super;let ch=H.supers&&H.supers.length?[...H.supers]:[H.super||"mercadona"];
    if(ch.includes(sid)){if(ch.length===1){toast("Elige al menos un supermercado");return}ch=ch.filter(x=>x!==sid)}else ch.push(sid);
    H.supers=ch;if(!ch.includes(H.super))H.super=ch[0];rerender()});
  qa("[data-mainsup]").forEach(b=>b.onclick=()=>{H.super=b.dataset.mainsup;rerender()});
  qa("[data-strat]").forEach(b=>b.onclick=()=>{H.shop.strategy=b.dataset.strat;rerender()});
  qa("[data-app]").forEach(b=>{const t=()=>{const k=b.dataset.app;H.apps=H.apps.includes(k)?H.apps.filter(x=>x!==k):[...H.apps,k];rerender()};
    b.onclick=t;b.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();t()}}});
  q("#addKid")&&(q("#addKid").onclick=()=>{S.people.push({...defaultAdult(),id:uid("k"),kind:"nino",goals:["sano"],factor:0.6,presence:{type:"siempre"},away:{comida:[0,1,2,3,4,5,6],cena:[0,1,2,3,4,5,6]},mealsSet:false});rerender()});
  q("#addAdult")&&(q("#addAdult").onclick=()=>{S.people.push({...defaultAdult(),id:uid("a"),kind:"adulto",goals:["sano"],factor:1,tupper:false,presence:{type:"siempre"},away:{comida:[0,1,2,3,4,5,6],cena:[0,1,2,3,4,5,6]},mealsSet:false});rerender()});
  qa("[data-delkid]").forEach(b=>b.onclick=()=>{if(confirm("¿Quitar a esta persona y sus gustos?")){S.people=S.people.filter(p=>p.id!==b.dataset.delkid);rerender()}});
  qa(".kidcard").forEach(c=>{const k=S.people.find(p=>p.id===c.dataset.kid);
    // Comidas pequeñas
    c.querySelectorAll("[data-sm]").forEach(b=>b.onclick=()=>{const [m,i]=b.dataset.sm.split("|"),n=Number(i);k.smallMeals=k.smallMeals||{};
      const a=k.smallMeals[m]=k.smallMeals[m]||Array(7).fill("no");const order=["no","casa","llevar"];a[n]=order[(order.indexOf(a[n]||"no")+1)%3];k.smallSet=true;refreshSmall();rerender()});
    c.querySelectorAll("[data-smq]").forEach(b=>b.onclick=()=>{const q=b.dataset.smq,w=v=>[0,1,2,3,4].map(()=>v).concat([v==="llevar"?"casa":v,v==="llevar"?"casa":v]);
      k.smallMeals=q==="cole"?{desayuno:Array(7).fill("casa"),almuerzo:w("llevar"),merienda:Array(7).fill("casa")}:q==="todo"?{desayuno:Array(7).fill("casa"),almuerzo:Array(7).fill("casa"),merienda:Array(7).fill("casa")}
        :q==="desayuno"?{desayuno:Array(7).fill("casa"),almuerzo:Array(7).fill("no"),merienda:Array(7).fill("no")}:{};
      k.smallSet=true;refreshSmall();rerender()});
    c.querySelectorAll("[data-kf]").forEach(i=>i.onchange=()=>{const f=i.dataset.kf;
      if(f==="name")k.name=i.value.trim();
      if(f==="factor")k.factor=Number(i.value)||1;
      if(f==="tupper")k.tupper=i.checked;
      if(f==="age"){k.age=Number(i.value)||null;k.factor=factorForAge(k.age)}
      if(f==="ptype"){const fri=addDays(mondayOf(todayISO()),4);k.presence={...k.presence,type:i.value,anchor:k.presence.anchor||fri,arrive:k.presence.arrive||(i.value==="findes"?"cena":"comida"),leave:k.presence.leave||"cena"}}
      if(f==="anchor")k.presence.anchor=i.value;
      if(f==="awayhol")k.awayHolidays=!i.checked;
      if(f==="arrive")k.presence.arrive=i.value;
      if(f==="leave")k.presence.leave=i.value;
      rerender()});
    c.querySelectorAll("[data-away]").forEach(b=>b.onclick=()=>{const [m,d]=b.dataset.away.split("|"),n=Number(d);k.away=k.away||{};const ds=k.away[m]||[];
      k.away[m]=ds.includes(n)?ds.filter(x=>x!==n):[...ds,n];k.mealsSet=true;replanFrom(todayISO());rerender()});
    c.querySelectorAll("[data-awayq]").forEach(b=>b.onclick=()=>{const q=b.dataset.awayq,all=[0,1,2,3,4,5,6];
      k.away=q==="cole"?{comida:[0,1,2,3,4],cena:[]}:q==="nada"?{comida:all,cena:all}:{};k.mealsSet=q!=="nada";replanFrom(todayISO());rerender()});
    c.querySelectorAll("[data-kday]").forEach(b=>b.onclick=()=>{const d=Number(b.dataset.kday),ds=k.presence.days||[];k.presence.days=ds.includes(d)?ds.filter(x=>x!==d):[...ds,d];rerender()})});
  qa("[data-goal]").forEach(b=>b.onclick=()=>{const g=b.dataset.goal;if(a.goals.includes(g))a.goals=a.goals.filter(x=>x!==g);else if(a.goals.length<3)a.goals.push(g);else{toast("Máximo 3 objetivos: quita uno antes");return}rerender()});
  qa("[data-trains]").forEach(b=>b.onclick=()=>{a.trains=b.dataset.trains==="1";rerender()});
  qa("[data-sport]").forEach(b=>b.onclick=()=>{const k=b.dataset.sport;a.sports=a.sports.includes(k)?a.sports.filter(x=>x!==k):[...a.sports,k];rerender()});
  qa("[data-addsess]").forEach(b=>b.onclick=()=>{const d=b.dataset.addsess;const ss=a.train[d]=a.train[d]||[];ss.push({time:ss.length?"19:00":"08:00",type:a.sports[0]||"fuerza"});rerender()});
  qa("[data-delsess]").forEach(b=>b.onclick=()=>{const [d,i]=b.dataset.delsess.split(":");a.train[d].splice(Number(i),1);if(!a.train[d].length)delete a.train[d];rerender()});
  qa("[data-sw]").forEach(s=>s.onchange=()=>{const [d,i]=s.dataset.sw.split(":");a.train[d][i].time=s.value;delete a.train[d][i].when;save()});
  qa("[data-st]").forEach(s=>s.onchange=()=>{const [d,i]=s.dataset.st.split(":");a.train[d][i].type=s.value;save()});
  qa("[data-wt]").forEach(b=>b.onclick=()=>{const [d,m]=b.dataset.wt.split(":"),opts=m==="comida"?["cocinar","taper","fuera","libre"]:["cocinar","fuera","libre"];
    const cur=H.weekTpl[d][m];H.weekTpl[d][m]=opts[(opts.indexOf(cur)+1)%opts.length];rerender()});
  qa("[data-tpl]").forEach(s=>s.onchange=()=>{const [d,m]=s.dataset.tpl.split(":");H.weekTpl[d][m]=s.value;save()});
  qa("[data-mt]").forEach(i=>i.onchange=()=>{H.mealTimes[i.dataset.mt]=i.value;save()});
  qa("[data-xm]").forEach(c=>c.onchange=()=>{const k=c.dataset.xm;if(c.checked)H.extraMeals[k]={desayuno:"08:00",mediamanana:"11:00",merienda:"17:30",pre:"18:00",post:"20:00",recena:"23:00"}[k];else delete H.extraMeals[k];rerender()});
  qa("[data-xmt]").forEach(i=>i.onchange=()=>{H.extraMeals[i.dataset.xmt]=i.value;save()});
  qa("[data-cook]").forEach(b=>b.onclick=()=>{H.cookMode=b.dataset.cook;rerender()});
  qa("[data-cday]").forEach(b=>b.onclick=()=>{const d=Number(b.dataset.cday);H.cookDays=H.cookDays.includes(d)?H.cookDays.filter(x=>x!==d):[...H.cookDays,d];rerender()});
  qa("[data-rep]").forEach(b=>b.onclick=()=>{H.repeat=b.dataset.rep;rerender()});
  qa("[data-sac]").forEach(b=>b.onclick=()=>{const sc=H.sacrifice=H.sacrifice||{},k=b.dataset.sac;if(sc[k])delete sc[k];else sc[k]=true;rerender()});
  qa("[data-mode]").forEach(b=>b.onclick=()=>{const [k,v]=b.dataset.mode.split(":");H.shop[k]=v;rerender()});
  qa("[data-diet]").forEach(b=>b.onclick=()=>{const [pid,k]=b.dataset.diet.split("|");const p=S.people.find(x=>x.id===pid);p.diet=k;replanIncompatible();rerender()});
  qa("[data-alg]").forEach(b=>b.onclick=()=>{const [pid,k]=b.dataset.alg.split("|");const p=S.people.find(x=>x.id===pid);const al=p.allergies=p.allergies||[];
    if(al.includes(k))p.allergies=al.filter(x=>x!==k);else al.push(k);replanIncompatible();rerender()});
  qa("[data-alg-none]").forEach(b=>b.onclick=()=>{const p=S.people.find(x=>x.id===b.dataset.algNone);p.allergies=[];rerender()});
  qa("[data-ing]").forEach(b=>b.onclick=()=>{const p=S.people.find(x=>x.id===b.dataset.person),pid=b.dataset.ing;
    const v=ingPref(p,pid),nv=ING_CYCLE[(ING_CYCLE.indexOf(v)+1)%ING_CYCLE.length];
    setIng(p,pid,nv,"Lo indicaste tú");
    b.className="chip t"+nv;b.textContent=(nv===2?"❤️ ":nv===1?"👍 ":nv===-1?"👎 ":nv===-9?"🚫 ":"")+P[pid].name});
  // Casa: añadir, editar y quitar personas
  const addP=()=>{const name=(q("#cName").value||"").trim(),rg=q("#cAge").value,ed=wiz.editP&&S.people.find(p=>p.id===wiz.editP);
    if(!name){toast("Escribe el nombre");q("#cName").focus();return}
    if(!rg){toast("Elige su edad");q("#cAge").focus();return}
    const yo=S.people.find(p=>p.id==="yo");
    const set=p=>{p.name=name;p.ageRange=rg;const ad=isAdultRange(rg);
      if(p.id!=="yo"){p.kind=ad?"adulto":"nino";p.age=ad?null:ageOf(rg);p.factor=ad?1:factorForAge(p.age)}};
    if(ed)set(ed);
    else if(yo&&!yo.name){if(!isAdultRange(rg)){toast("La primera persona eres tú: elige una edad de adulto");return}set(yo)}
    else{const ad=isAdultRange(rg);const p={...defaultAdult(),id:uid(ad?"a":"k"),kind:ad?"adulto":"nino",goals:["sano"],factor:1,tupper:false,presence:{type:"siempre"},away:{},mealsSet:true};set(p);S.people.push(p)}
    wiz.editP=null;rerender();setTimeout(()=>document.getElementById("cName")?.focus(),0)};
  q("#cAdd")&&(q("#cAdd").onclick=addP);
  q("#cName")&&(q("#cName").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();addP()}});
  qa("[data-pedit]").forEach(b=>b.onclick=()=>{wiz.editP=wiz.editP===b.dataset.pedit?null:b.dataset.pedit;render()});
  qa("[data-pdel]").forEach(b=>b.onclick=()=>{S.people=S.people.filter(p=>p.id!==b.dataset.pdel);if(wiz.editP===b.dataset.pdel)wiz.editP=null;rerender()});
  // Cómo coméis
  qa("[data-more]").forEach(b=>b.onclick=()=>{wiz.more={...(wiz.more||{}),[b.dataset.more]:true};render()});
  qa("[data-trainp]").forEach(b=>b.onclick=()=>{const [pid,v]=b.dataset.trainp.split("|"),p=S.people.find(x=>x.id===pid);p.trains=v==="1";rerender()});
  bindFixedEditor(rerender);
}
// Código postal -> pueblo (y, si hay varios, se elige); de ahí salen los festivos locales
async function lookupCp(cp){
  const H=S.home;H.cpLooked=cp;const r=await fetch("https://api.zippopotam.us/es/"+cp);if(!r.ok)throw 0;const d=await r.json();
  const places=[...new Set((d.places||[]).map(p=>p["place name"]))],known=Object.keys((FEST||{}).locales||{});
  H.cp=cp;H.cpPlaces=places;H.cpRegion=(d.places||[])[0]?.state||"";
  // Un código postal puede tener varios núcleos (El Badorc, La Fortesa… son de Piera): se prefiere el que no es un barrio o masía
  const main=places.filter(p=>!/^(El|La|Els|Les|Los|Las|L'|Sant|Santa|Can|Ca l|Mas)\b/i.test(p));
  if(!H.municipio||!places.includes(H.municipio))H.municipio=places.find(p=>known.includes(p))||main[0]||places[0]||"";
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
  if(id==="hola"||id==="unirse"){a.name=(v("#wzName")||"").trim()}
  if(id==="casa"){const yo=S.people.find(p=>p.id==="yo");
    // Si ha escrito a alguien y no ha tocado "+", se añade igual
    if((v("#cName")||"").trim()&&v("#cAge")){main.querySelector("#cAdd").click();return false}
    if(!yo||!yo.name){toast("Empieza por ti: tu nombre y tu edad");document.getElementById("cName")?.focus();return false}
    const sin=S.people.find(p=>p.name&&!p.ageRange&&!(p.kind==="nino"&&p.age));if(sin){toast("Falta la edad de "+sin.name+": tócalo para ponerla");return false}
    S.people=S.people.filter(p=>p.id==="yo"||p.name);
    if(!H.apps.filter(k=>k!=="ninguno").length){toast("Marca al menos un aparato de tu cocina");return false}}
  if(id==="super"){const cp=(v("#wzCp")||"").trim();if(!/^\d{5}$/.test(cp)){toast(cp?"El código postal tiene 5 números":"Pon tu código postal: lo necesito para tus precios");document.getElementById("wzCp")?.focus();return false}H.cp=cp}
  if(id==="aparatos"&&!H.apps.length){toast("Elige al menos uno");return false}
  if(id==="zona"){const cp=(v("#wzCp")||"").trim();if(!/^\d{5}$/.test(cp)){toast(cp?"El código postal tiene 5 números":"Pon tu código postal: lo necesito para tus precios");document.getElementById("wzCp")?.focus();return false}H.cp=cp;H.municipio=(v("#wzMun")||"").trim()}
  if(id==="familia"){main.querySelectorAll(".kidcard [data-kf=name]").forEach(i=>{const k=S.people.find(p=>p.id===i.closest(".kidcard").dataset.kid);k.name=i.value.trim()});
    if(others().some(k=>!k.name)){toast("Escribe el nombre de cada persona");return false}
    const sin=others().find(k=>(k.presence||{}).type!=="manual"&&(!k.mealsSet||(((k.away||{}).comida||[]).length===7&&((k.away||{}).cena||[]).length===7)));
    if(sin){toast(`Marca qué comidas hace ${personName(sin)} en casa`);return false}}
  if(id==="objetivos"){if(!a.goals.length){toast("Elige al menos un objetivo");return false}a.weight=Number(v("#wzW"))||null}
  if(id==="cocina"&&H.cookMode==="lote"&&!H.cookDays.length){toast("Elige al menos un día para cocinar");return false}
  if(id==="plan"){const st=v("#wzStart");H.start=st&&st>todayISO()?st:(H.start&&H.start<=todayISO()?H.start:null);
    // Los menús de semanas que ya no cuentan (antes del inicio) se borran
    if(H.start)for(const s of Object.keys(S.plans))if(addDays(s,6)<H.start)delete S.plans[s];
    H.planFreq=v("#wzFreq");H.planDay=Number(v("#wzPDay"));H.planTime=v("#wzPTime")||"17:00"}
  if(id==="compra"){H.shop.delivery=Number(v("#wzDel"));
    H.budget.month=Number(v("#wzBM"))||0;H.budget.week=v("#wzBW")===""?null:Number(v("#wzBW"));H.budget.basics=Number(v("#wzBB"))||0}
  return true;
}

/* ---------- Afinar el menú: se pregunta solo lo que se marca ---------- */
function startAfinar(keys){
  const ids=[];for(const k of keys){const a=AFINAR.find(x=>x[0]===k);if(a)for(const id of a[2]())if(!ids.includes(id))ids.push(id)}
  S.afinar={...(S.afinar||{}),state:"done",invite:keys.includes("invitar"),last:keys};save();
  if(!ids.length){finishAfinar();return}
  wiz={i:0,single:null,afinar:ids,started:true};tab="wizard";render();scrollTo(0,0);
}
function finishAfinar(){
  const inv=S.afinar&&S.afinar.invite;wiz={i:0,single:null};
  preparingScreen(()=>{redoFromToday()},()=>{
    if(inv){S.afinar.invite=false;tab="perfil";accOpen.add("casa");render();toast("Invita desde aquí a tu familiar")}
    else{tab="menu";render();toast("Menú rehecho con lo que me has contado")}});
}
// En el Menú: después del primer menú, "¿Quieres afinarlo más?" (y luego, siempre a mano)
function afinarCard(){
  const A=S.afinar;
  if(!A||A.state!=="ask")return `<div class="row" style="justify-content:flex-start;margin:6px 0"><button class="btn ghost small" id="afinarOpen">✨ Afinar mi menú</button></div>`;
  return `<div class="afcard"><b class="aft">Tu menú está listo</b>
    <p class="small" style="margin:4px 0 8px">${A.cost?`Sale por unos <b>${eur(A.cost)} al mes</b>. `:""}He supuesto <b>comida y cena en casa todos los días</b>, que cocinas cada día y que compras en tienda.</p>
    ${afinarList()}</div>`;
}
function afinarList(){
  return `<h3 style="margin:6px 0 2px">¿Quieres afinarlo más?</h3><p class="small muted" style="margin:0 0 6px">Marca lo que quieras ajustar y te pregunto solo eso.</p>
    <div class="aflist">${AFINAR.filter(([k])=>k!=="invitar"||servidorOn()).map(([k,t])=>`<label class="afi"><input type="checkbox" data-af="${k}"> ${esc(t)}</label>`).join("")}</div>
    <div class="actions"><button class="btn" id="afGo">Afinar</button>${S.afinar&&S.afinar.state==="ask"?`<button class="btn ghost" id="afNo">Así está bien</button>`:""}</div>`;
}
function bindAfinar(root){
  const go=r=>{const ks=[...r.querySelectorAll("[data-af]:checked")].map(i=>i.dataset.af);if(!ks.length){toast("Marca al menos una cosa");return}if(dlg.open)dlg.close();startAfinar(ks)};
  const upd=r=>{const b=r.querySelector("#afGo");if(b){const n=r.querySelectorAll("[data-af]:checked").length;b.textContent=n?`Afinar (${n})`:"Afinar"}};
  root.querySelectorAll("[data-af]").forEach(i=>i.onchange=()=>upd(root));
  root.querySelector("#afGo")?.addEventListener("click",()=>go(root));
  root.querySelector("#afNo")?.addEventListener("click",()=>{S.afinar.state="done";save();render();toast("Perfecto. Cuando quieras, toca «Afinar mi menú»")});
  root.querySelector("#afinarOpen")?.addEventListener("click",()=>{showDialog(`<div class="mod">${closeBtn}${afinarList()}</div>`);bindAfinar(dlg)});
}
