/* Táper · Mes: el calendario del mes, cada día y «Preparar el mes» */
"use strict";

// "cal": el calendario del mes · "semana": la semana en detalle (el Menú de siempre)
let mesSub="cal";
const DLET=["L","M","X","J","V","S","D"];
// Las personas de casa además de ti (hijos, pareja, abuela…); los niños primero
const kidsAll=()=>others().slice().sort((a,b)=>(a.kind==="nino"?0:1)-(b.kind==="nino"?0:1));
// Quien está siempre no lleva etiqueta en el calendario, salvo que ese día cambie
const alwaysHome=p=>(p.presence||{}).type==="siempre"&&!((p.away||{}).comida||[]).length&&!((p.away||{}).cena||[]).length;
const offMeal=v=>v==="fuera"||v==="libre";
// Lo que pasa un día: quién está, entrenos, táper, cena fuera, si repite, festivo y vacaciones
function mesDay(d){
  const o=S.days[d]||{},kc=peopleAt(d,"comida"),kn=peopleAt(d,"cena"),ks=kidsAll().filter(k=>kc.includes(k)||kn.includes(k));
  // A qué comidas está cada niño ese día: "ambas" | "comida" | "cena"
  const km={};for(const k of ks)km[k.id]=kc.includes(k)&&kn.includes(k)?"ambas":kc.includes(k)?"comida":"cena";
  const com=mealState(d,"comida"),cen=mealState(d,"cena"),prev=addDays(d,-1),pst=mealState(prev,"cena");
  const taper=com==="taper",sinTaper=taper&&S.home.cookMode!=="lote"&&((pst!=="cocinar"&&pst!=="solotaper")||!!(S.home.start&&prev<S.home.start));
  const wk=S.plans[weekStartFor(d)],cv=wk&&wk.slots[d+"|cena"],rep=cv&&cv.rep&&RX[cv.recipe]&&cen==="cocinar"?cv.rep.slice(0,10):null;
  const sess=sessionsOn(d).concat(ks.flatMap(k=>kidSessions(k,d).map(s=>({...s,who:k.id}))));
  return {d,o,ks,km,com,cen,taper,sinTaper,rep,sess,hol:isHoliday(d),vac:!!o.away,fuera:com==="fuera"&&cen==="fuera"};
}
// A qué comidas está un niño ese día según su semana normal (sin los cambios del día)
function kidRuleMeals(k,d){const c=presentByRule(k,d,"comida"),n=presentByRule(k,d,"cena");return c&&n?"ambas":c?"comida":n?"cena":"no"}
function mesTags(x){
  return x.ks.filter(k=>!alwaysHome(k)||x.km[k.id]!=="ambas").map(k=>`<i class="mtg k">${esc(personName(k))}${x.km[k.id]==="cena"?" 🌙":x.km[k.id]==="comida"?" ☀":""}</i>`).join("")+(x.sess.length?`<i class="mtg e">Entreno</i>`:"")
    +(x.vac?`<i class="mtg v">Vacaciones</i>`:x.fuera?`<i class="mtg f">Fuera</i>`:x.cen==="fuera"?`<i class="mtg f">Cena fuera</i>`:"")
    +(x.vac?"":x.sinTaper?`<i class="mtg f">Sin táper</i>`:x.taper?`<i class="mtg t">Táper</i>`:"")
    +(x.rep?`<i class="mtg t">Repite</i>`:"")+(x.hol?`<i class="mtg v">Festivo</i>`:"");
}
// Calendario de un mes (lunes primero); attr: el atributo de cada día para tocarlo
function mesCal(m,attr){
  const [y,mm]=m.split("-").map(Number),first=`${m}-01`,n=new Date(y,mm,0).getDate(),lead=dow(first),t=todayISO();
  let h=`<div class="mcal">${DLET.map(l=>`<span class="mdh">${l}</span>`).join("")}`+`<span class="msday out"></span>`.repeat(lead);
  for(let i=1;i<=n;i++){const d=`${m}-${String(i).padStart(2,"0")}`,x=mesDay(d);
    h+=`<button class="msday ${d===t?"today":""} ${d<t?"past":""}" ${attr}="${d}" aria-label="${esc(longDate(d))}"><b>${i}</b><span class="mtags">${mesTags(x)}</span></button>`}
  h+=`<span class="msday out"></span>`.repeat((7-(lead+n)%7)%7);
  const k1=kidsAll()[0];
  return h+`</div><div class="mleg">${k1?`<span><i class="mtg k">${esc(personName(k1))}</i> está (🌙 solo cena · ☀ solo comida)</span>`:""}<span><i class="mtg e">Entreno</i> tuyo o suyo</span><span><i class="mtg t">Táper</i> comida de la cena de antes</span><span><i class="mtg t">Repite</i> cena ya hecha</span><span><i class="mtg f">Fuera</i> no cocinas</span><span><i class="mtg v">Festivo</i> o vacaciones</span></div>`;
}
function mesStats(m){
  const [y,mm]=m.split("-").map(Number),n=new Date(y,mm,0).getDate(),ks=kidsAll().filter(k=>!alwaysHome(k)),kd={};let ent=0,tp=0,din=0;
  for(let i=1;i<=n;i++){const x=mesDay(`${m}-${String(i).padStart(2,"0")}`);x.ks.forEach(k=>kd[k.id]=(kd[k.id]||0)+1);ent+=x.sess.length;if(x.taper&&!x.sinTaper&&!x.vac)tp++;if(x.cen==="cocinar")din++}
  const first=ks.length===1?[kd[ks[0].id]||0,"días con "+personName(ks[0])]:ks.length?[Object.values(kd).length?Math.max(...Object.values(kd)):0,ks.every(k=>k.kind==="nino")?"días con los niños":"días con alguien más"]:[din,"cenas en casa"];
  return `<div class="mstats"><div><b>${first[0]}</b><small>${esc(first[1])}</small></div><div><b>${ent}</b><small>entrenos</small></div><div><b>${tp}</b><small>tápers</small></div></div>`;
}
const mesCap=m=>monthName(m).split(" ")[0];
const dayW=d=>DAYS[dow(d)].toLowerCase();
// Esta semana: si va como se planeó o qué ha cambiado (lo que has tocado a mano, días sin táper)
function mesWeekCard(){
  const t=todayISO(),st=weekStartFor(t),ds=weekDates(st).filter(d=>d>=t),ch=[];
  for(const d of ds){const o=S.days[d]||{},w=dayW(d);
    if(o.away){ch.push(`vacaciones el ${w}`);continue}
    for(const [id,v] of Object.entries(o.kids||{})){const k=S.people.find(p=>p.id===id);if(k)ch.push(typeof v==="object"&&v?`${personName(k)} solo ${v.comida&&!v.cena?"a comer":!v.comida&&v.cena?"a cenar":"comida y cena"} el ${w}`:`${v?"":"sin "}${personName(k)} el ${w}`)}
    if(o.comida)ch.push(`comida ${o.comida==="taper"?"de táper":o.comida==="cocinar"?"en casa":MEALSTATE[o.comida]?MEALSTATE[o.comida].toLowerCase():o.comida} el ${w}`);
    if(o.cena)ch.push(`cena ${o.cena==="cocinar"?"en casa":o.cena==="solotaper"?"solo el táper":MEALSTATE[o.cena]?MEALSTATE[o.cena].toLowerCase():o.cena} el ${w}`)}
  const gaps=tupperGaps(st).filter(d=>d>=t);
  const rng=`${Number(st.slice(8))} ${shortDate(st).split(" ")[1]||""} – ${shortDate(addDays(st,6))}`;
  return `<div class="card mweek"><div class="row" style="justify-content:space-between"><h3>Esta semana <span class="muted small">(${esc(rng)})</span></h3>${ch.length||gaps.length?`<span class="pill carga">${ch.length+gaps.length} ${ch.length+gaps.length===1?"cambio":"cambios"}</span>`:`<span class="pill ligera">Va como planeaste</span>`}</div>
    ${ch.length?`<p class="small" style="margin:6px 0 0">${esc(ch.join(" · ").replace(/^./,c=>c.toUpperCase()))}. Ya he recolocado los platos.</p>`:""}
    ${gaps.map(g=>`<p class="small" style="margin:6px 0 0;color:var(--warn)">El ${esc(dayW(g))} no tienes táper: la víspera no cenas en casa. <button class="linkbtn" data-mday="${g}">Arreglarlo</button></p>`).join("")}
    ${ch.length||gaps.length?"":`<p class="small muted" style="margin:4px 0 0">¿Cambia algo? Toca el día en el calendario y recoloco los platos.</p>`}</div>`;
}
function renderMes(){
  if(mesSub==="semana"){renderMenu();
    main.querySelector(".view")?.insertAdjacentHTML("afterbegin",`<button class="btn ghost small mback" id="mesBack">‹ Volver al mes</button>`);
    document.getElementById("mesBack").onclick=()=>{mesSub="cal";render();scrollTo(0,0)};return}
  const m=month,cur=todayISO().slice(0,7),mp=(S.monthPrep||{})[m]||{},prepared=!!mp.done;
  let h=`<section class="view mes">`+viewHead(monthName(m),"Tu *mes*");
  if(m>=cur&&!prepared)h+=`<div class="mcta"><h2>${esc(mesCap(m))} aún no está preparado</h2><p>Ya lo tengo relleno con tu semana normal. Solo falta que mires las excepciones, el menú y el pedido grande.</p><button class="btn wide" data-mprep="${m}">Preparar ${esc(mesCap(m).toLowerCase())}</button></div>`;
  else if(m===cur)h+=mesWeekCard();
  h+=mesStats(m)+mesCal(m,"data-mday");
  h+=`<p class="small muted" style="margin:8px 2px 0">Toca un día para ver qué se come y cambiar lo que sea distinto: vacaciones, un finde extra, una cena fuera.</p>
    <div class="mlinks"><button class="btn ghost" id="mesWeek">📅 Ver la semana en detalle</button><button class="btn ghost" id="mesRec">📖 Recetas</button><button class="btn ghost" id="mesNormal">🗓️ Tu semana normal</button></div>`;
  main.innerHTML=h+`</section>`;
  main.querySelectorAll("[data-mday]").forEach(b=>b.onclick=()=>openMesDay(b.dataset.mday));
  main.querySelectorAll("[data-mprep]").forEach(b=>b.onclick=()=>openMonthPrep(b.dataset.mprep));
  document.getElementById("mesWeek").onclick=()=>{
    // La semana de hoy si es de este mes; si no, la primera del mes
    const ws=menuWeeks(),tw=weekStartFor(todayISO());weekSel=monthOfWeek(tw)===m&&ws.includes(tw)?tw:(ws.find(s=>monthOfWeek(s)===m)||ws.find(s=>addDays(s,6).slice(0,7)===m)||null);
    menuMonth=weekSel?monthOfWeek(weekSel):null;daySel=null;mesSub="semana";render();scrollTo(0,0)};
  document.getElementById("mesRec").onclick=()=>{tab="recetas";render();scrollTo(0,0)};
  document.getElementById("mesNormal").onclick=()=>openSemanaNormal();
}

/* ---------- Un día del mes (hoja de abajo) ----------
   Quién está, comida y cena, vacaciones y entreno; y qué se come, con «Ver receta» y «Cambiar». back: volver a otra pantalla */
const swRow=(label,sub,on,attr)=>`<div class="msw"><span><b>${label}</b>${sub?`<small>${sub}</small>`:""}</span><button class="mtog" role="switch" aria-checked="${!!on}" ${attr} aria-label="${esc(label.replace(/<[^>]+>/g,""))}"></button></div>`;
function openMesDay(d,back){
  const st=weekStartFor(d),redo=()=>{save();ensureWeek(st);if(S.plans[addDays(st,7)])ensureWeek(addDays(st,7));save();render()};
  const reopen=()=>dlg.addEventListener("close",()=>setTimeout(()=>openMesDay(d,back),0),{once:true});
  const draw=()=>{
    const x=mesDay(d),o=S.days[d]||{},wk=S.plans[st],ks=kidsAll(),past=d<todayISO();
    const ps=plannedSessions(d),res=(((S.sport||{})[d]||{}).res)||{},trainOn=ps.some((s,i)=>!(res[i]&&res[i].st==="no"));
    let h=`<div class="mod mday-sh">${back?"":closeBtn}<div class="veb">${esc(DAYS[dow(d)])}${x.hol?" · "+esc(holidayName(d)):""}</div><h2>${Number(d.slice(8))} de ${esc(monthName(d.slice(0,7)).split(" ")[0].toLowerCase())}</h2>
      ${past?`<p class="small muted">Este día ya ha pasado: lo que se comió no se cambia.</p>`:""}<div class="mscard">`;
    for(const k of ks){const cur=x.km[k.id]||"no",rule=kidRuleMeals(k,d);
      h+=`<div class="msw col"><span><b>${esc(personName(k))}</b><small>${rule===cur?"Según tu semana normal":"Cambiado para este día"}</small></span><div class="chips">${[["ambas","Comida y cena"],["comida","Solo comida"],["cena","Solo cena"],["no","No está"]].map(([v,t])=>chip("data-mdk",k.id+"|"+v,cur===v,t)).join("")}</div></div>`}
    h+=`<div class="msw col"><b>Comida</b><div class="chips">${[["taper","🥡 Táper"],["cocinar","🍳 Cocino"],["fuera","Fuera"]].map(([v,t])=>chip("data-mdm","comida|"+v,x.com===v,t)).join("")}</div></div>
      <div class="msw col"><b>Cena</b><div class="chips">${[["cocinar","🍳 Cocino"],["fuera","Fuera"]].map(([v,t])=>chip("data-mdm","cena|"+v,x.cen===v,t)).join("")}</div></div>`;
    h+=swRow("Vacaciones","Nada que cocinar ni comprar ese día",x.vac,`data-mdv`);
    if(ps.length)h+=swRow(ps.every(s=>!s.who||s.who===me().id)?"Tu entreno":"Entreno",esc(ps.map(s=>sessLabel(s).replace(/^./,c=>c.toUpperCase())).join(" · ")),trainOn,`data-mdt`);
    h+=`</div><h3 class="msec">Qué se come</h3><div class="mscard">`+comedorDayHTML(d)+mesMealHTML(d,"comida",x,wk)+mesMealHTML(d,"cena",x,wk)+mesPostreHTML(d)+`</div>
      <div class="actions"><button class="btn wide" id="mdOk">${back?"Volver":"Listo"}</button></div>
      <button class="linkbtn" id="mdMore" style="margin:4px auto 0;display:block">Más opciones de este día (libre, solo táper, entrenos…)</button></div>`;
    showDialog(h);
    const q=s=>dlg.querySelectorAll(s);
    // Por comidas: igual que la semana normal → sin cambio; si no, sí/no o {comida,cena}
    q("[data-mdk]").forEach(b=>b.onclick=()=>{if(past)return toast("Ese día ya ha pasado");const [id,v]=b.dataset.mdk.split("|"),k=S.people.find(p=>p.id===id),oo=S.days[d]=S.days[d]||{};oo.kids=oo.kids||{};
      if(v===kidRuleMeals(k,d))delete oo.kids[id];else oo.kids[id]=v==="ambas"?{comida:true,cena:true}:v==="no"?false:{comida:v==="comida",cena:v==="cena"};redo();draw()});
    q("[data-mdpos]").forEach(b=>b.onclick=()=>{if(past)return toast("Ese día ya ha pasado");cyclePostre(d,b.dataset.mdpos);draw()});
    q("[data-mdm]").forEach(b=>b.onclick=()=>{if(past)return toast("Ese día ya ha pasado");const [m,v]=b.dataset.mdm.split("|");changeMeal(d,m,v,draw)});
    q("[data-mdv]").forEach(b=>b.onclick=()=>{if(past)return toast("Ese día ya ha pasado");const oo=S.days[d]=S.days[d]||{};
      if(oo.away){delete oo.away;delete oo.comida;delete oo.cena}else{oo.away=true;oo.comida="fuera";oo.cena="fuera"}redo();draw()});
    q("[data-mdt]").forEach(b=>b.onclick=()=>{S.sport=S.sport||{};const sp=S.sport[d]=S.sport[d]||{};sp.res=sp.res||{};
      ps.forEach((s,i)=>{if(trainOn)sp.res[i]={st:"no"};else if(sp.res[i]&&sp.res[i].st==="no")delete sp.res[i]});redo();draw()});
    q("[data-mdopen]").forEach(b=>b.onclick=()=>{const [rid,sid]=b.dataset.mdopen.split("~");reopen();openRecipe(rid,sid)});
    q("[data-mdswap]").forEach(b=>b.onclick=()=>{reopen();openSwap(b.dataset.mdswap)});
    q("[data-mdcm]").forEach(b=>b.onclick=()=>openComedor(b.dataset.mdcm,d.slice(0,7),()=>openMesDay(d,back)));
    q("[data-mdfix]").forEach(b=>b.onclick=()=>changeMeal(addDays(d,-1),"cena","cocinar",draw));
    q("[data-mdcook]").forEach(b=>b.onclick=()=>changeMeal(d,"comida","cocinar",draw));
    dlg.querySelector("#mdOk").onclick=()=>{if(back)back();else dlg.close()};
    dlg.querySelector("#mdMore").onclick=()=>{if(back)reopen();openDay(d)};
  };
  draw();
}
// Una comida del día: qué plato es, para quién, si repite, el táper de mañana y cuánto aguanta en la nevera
// El postre de la comida y de la cena, con «Cambiar» (fruta de temporada → yogur → ninguno → el de siempre)
function mesPostreHTML(d){
  if(typeof postreFor!=="function")return "";
  const rows=["comida","cena"].map(m=>{const p=postreFor(d,m),man=((((S.days[d]||{}).postre)||{})[m]);if(!p&&!man&&postreModo(m)==="no")return "";
    return `<div class="mmeal"><div><b>Postre ${m==="comida"?"de la comida":"de la cena"}</b><div class="small">${p?`${p.pid==="yogur"?"🥛":"🍎"} ${esc(p.nombre.replace(/ \(.*\)$/,""))}${p.por?` <span class="muted">· ${esc(p.por)}</span>`:""}`:`<span class="muted">Sin postre</span>`}</div></div><div class="msbtns"><button class="btn ghost small" data-mdpos="${m}">Cambiar</button></div></div>`}).join("");
  return rows;
}
function mesMealHTML(d,meal,x,wk){
  const lab=meal==="comida"?"Comida":"Cena",stt=meal==="comida"?x.com:x.cen;
  const row=(body,btns)=>`<div class="mmeal"><div><b>${lab}</b><div class="small">${body}</div></div>${btns?`<div class="msbtns">${btns}</div>`:""}</div>`;
  if(x.vac)return row(`<span class="muted">Vacaciones: no se cocina</span>`);
  if(stt==="fuera")return row(`<span class="muted">Fuera: no se cocina${meal==="cena"&&mealState(addDays(d,1),"comida")==="taper"?" · el táper de mañana sale de otra cena o de una bolsa":""}</span>`);
  if(stt==="libre")return row(`<span class="muted">Libre: algo de la despensa o lo que te apetezca</span>`);
  if(meal==="comida"&&stt==="taper"){
    if(x.sinTaper)return row(`<span style="color:var(--warn)">Sin táper: la víspera no cenas en casa</span>`,`<button class="btn small" data-mdfix>Cocinar la víspera</button><button class="btn ghost small" data-mdcook>Cocinarla</button>`);
    const t=dishOfMeal(d,"comida"),r=t.recipe,sid=addDays(d,-1)+"|cena";
    if(t.sinTaper)return row(`<span style="color:var(--warn)">Sin táper: la cena de ayer no se cocinó</span>`,`<button class="btn ghost small" data-mdcook>Cocinarla</button>`);
    return row(r?`Táper de ${esc(r.name.toLowerCase())} <span class="muted">· de la cena de ayer</span>`:`<span class="muted">Táper (aún sin plato)</span>`,r?`<button class="btn ghost small" data-mdopen="${r.id}~${sid}">Ver receta</button>`:"");
  }
  const sl=slotFor(d,meal),v=sl&&wk&&wk.slots[sl.id],r=v&&RX[v.recipe];
  if(!sl||!r){if(casaSlot(v))return row(`<span class="muted">🧺 Aún no has comprado: usa lo que tengas</span>`,`<button class="btn ghost small" data-mdswap="${sl.id}">Elegir</button>`);if(v&&v.despensa)return row(`De tu despensa: ${esc(v.despensa.map(it=>despItemName(it.k)).join(", "))}`);return row(`<span class="muted">${sl&&sl.fixed?esc(sl.fixed.name):"Aún sin plato"}</span>`,sl&&!sl.fixed?`<button class="btn ghost small" data-mdswap="${sl.id}">Elegir</button>`:"")}
  const who=sl.eaters.concat(sl.kids),n=who.length+(sl.guests||0),kidsIn=sl.kids.map(personName);
  let t=`${esc(r.name)}`;
  if(v.rep)t+=` <span class="muted">· lo mismo que el ${esc(dayW(v.rep.slice(0,10)))}: ya está hecho, solo calentar</span>`;
  else{const kids=repChildren(sl);
    t+=` <span class="muted">· para ${n<=1?"ti":n+(kidsIn.length&&n===2?` (tú y ${esc(kidsIn[0])})`:"")}${sl.tupper.length?" + táper de mañana":""}${kids.length?" + la cena del "+esc(kids.map(c=>dayW(c.date)).join(" y ")):""}</span>`}
  if(meal==="cena"&&sl.kids.length)t+=`<div class="small" style="color:var(--kid)">Con ${esc(kidsIn.join(" y "))}: esta cena no se repite en la semana</div>`+comedorDinnerNote(sl,r);
  if(!v.rep&&r.fridge!=null&&(sl.tupper.length||repChildren(sl).length))t+=`<div class="small muted">Aguanta ${r.fridge} ${r.fridge===1?"día":"días"} en la nevera</div>`;
  const done=slotDone(sl.id);
  return row(t,`<button class="btn ghost small" data-mdopen="${r.id}~${sl.id}">Ver receta</button>${done||v.rep?"":`<button class="btn ghost small" data-mdswap="${sl.id}">Cambiar</button>`}`);
}
