/* Táper · planificador: qué comidas hay cada día, qué necesita cada una y qué plato encaja mejor */
"use strict";

/* ---------- Semanas de planificación ---------- */
// La semana empieza el día en que planificas (por defecto el domingo) y dura 7 días
function weekStartFor(d){return addDays(d,-((dow(d)-S.home.planDay+7)%7))}
function weekDates(start){return [0,1,2,3,4,5,6].map(i=>addDays(start,i))}
function weeksInMonth(m){
  const [y,mm]=m.split("-").map(Number);const out=[];
  let s=weekStartFor(iso(new Date(y,mm-1,1)));if(s.slice(0,7)!==m)s=addDays(s,7);
  while(s.slice(0,7)===m){out.push(s);s=addDays(s,7)}
  return out;
}
const monthOfWeek=start=>start.slice(0,7);

/* ---------- Quién está y qué comida toca ---------- */
// Turnos alternos: el turno empieza el día del cambio (anchor) y se repite cada 14 días.
// Semanas alternas = 7 días; fines de semana alternos = 3 días (p. ej. viernes a domingo).
// El primer día puede llegar a la comida o a la cena; el último puede irse después de comer o de cenar.
function turnInfo(pr){
  let anchor=pr.anchor||mondayOf(todayISO()), arrive=pr.arrive, leave=pr.leave;
  // Datos antiguos: semanas de lunes a domingo; fines de semana del viernes (cena) al domingo
  if(pr.type==="findes"&&!arrive&&dow(anchor)!==4){anchor=addDays(mondayOf(anchor),4);arrive="cena"}
  return {anchor,len:pr.type==="findes"?3:7,arrive:arrive||"comida",leave:leave||"cena"};
}
// Cuándo está cada miembro de la familia (tú estás siempre). Sin comida indicada: si está en algún momento del día
// Cambios planificados (vacaciones, cambios de turno, imprevistos): mandan sobre el turno normal
function changeFor(k,d,meal){
  for(const c of (k.changes||[])){
    if(d<c.from||d>c.to)continue;
    if(meal&&d===c.from&&c.fromMeal==="cena"&&meal==="comida")continue;
    if(meal&&d===c.to&&c.toMeal==="comida"&&meal==="cena")continue;
    return c;
  }
  return null;
}
// Comidas que una persona hace fuera aunque ese día esté contigo (cole, trabajo…): k.away = {comida:[días], cena:[días]}
// Los festivos come en casa salvo que se diga lo contrario (k.awayHolidays)
function eatsAway(k,d,meal){
  if(!meal||!k.away)return false;
  if(!(k.away[meal]||[]).includes(dow(d)))return false;
  return !(isHoliday(d)&&!k.awayHolidays);
}
function mealsAwayText(k){
  const a=k.away||{},t=[];
  for(const m of ["comida","cena"]){const ds=(a[m]||[]).slice().sort();if(!ds.length)continue;
    const lab=ds.join()==="0,1,2,3,4"?"de lunes a viernes":ds.map(i=>DAYS[i].toLowerCase()).join(", ");
    t.push(`${m==="comida"?"Come":"Cena"} fuera ${lab}`)}
  return t.length?t.join(" · ")+(k.awayHolidays?"":" (los festivos, en casa)"):"";
}
function presentByRule(k,d,meal){
  if(k.id==="yo")return true;
  const ch=changeFor(k,d,meal);if(ch)return ch.with;
  if(eatsAway(k,d,meal))return false;
  const pr=k.presence||{type:"siempre"}, w=dow(d);
  if(pr.type==="siempre")return true;
  if(pr.type==="manual")return false;
  if(pr.type==="dias")return (pr.days||[]).includes(w);
  if(pr.type==="alternas"||pr.type==="findes"){
    const t=turnInfo(pr), off=((daysBetween(t.anchor,d)%14)+14)%14;
    if(off>=t.len)return false;
    if(meal&&off===0&&t.arrive==="cena"&&meal==="comida")return false;
    if(meal&&off===t.len-1&&t.leave==="comida"&&meal==="cena")return false;
    return true;
  }
  return false;
}
// Frase que resume el turno, para enseñarla en el asistente y el perfil
function turnText(k){
  const pr=k.presence||{};if(pr.type!=="alternas"&&pr.type!=="findes")return "";
  const t=turnInfo(pr),last=addDays(t.anchor,t.len-1);
  return `Está contigo del ${DAYS[dow(t.anchor)].toLowerCase()} (${t.arrive==="cena"?"cena":"comida"}) al ${DAYS[dow(last)].toLowerCase()} (${t.leave==="cena"?"cena":"comida"}), ${pr.type==="findes"?"fines de semana alternos":"semanas alternas"}. Próximo turno: ${shortDate(nextTurn(t))}.`;
}
function nextTurn(t){const off=((daysBetween(t.anchor,todayISO())%14)+14)%14;return addDays(todayISO(),off<t.len?-off:14-off)}
const kidPresentByRule=presentByRule;
// Quién está un día: lo que diga su horario, salvo que ese día lo hayas cambiado
function peopleAt(d,meal){
  const o=(S.days[d]||{}).kids||{};
  // Marcar a mano que alguien está un día no cambia qué comidas hace en casa (salvo un cambio planificado)
  return S.people.filter(k=>{if(k.id==="yo")return true;if(o[k.id]==null)return presentByRule(k,d,meal);
    if(!o[k.id])return false;const ch=changeFor(k,d,meal);return ch&&ch.with?true:!eatsAway(k,d,meal)});
}
const kidsAt=(d,meal)=>peopleAt(d,meal).filter(p=>p.kind==="nino");
const adultsAt=(d,meal)=>peopleAt(d,meal).filter(p=>p.kind==="adulto");
const others=()=>S.people.filter(p=>p.id!=="yo");
function mealState(d,meal){
  const o=S.days[d]||{};
  if(o[meal])return o[meal];
  let st=S.home.weekTpl[dow(d)][meal];
  // Festivo con los niños en casa: se cocina la comida y la cena
  if(isHoliday(d)&&kidsAt(d,meal).length){if(meal==="comida"&&st!=="fuera")st="cocinar";if(meal==="cena"&&st==="libre")st="cocinar"}
  return st;
}
function fixedFor(d,meal){
  const ks=kidsAt(d,meal).length;
  return S.fixed.find(f=>f.dow===dow(d)&&f.meal===meal&&(f.who==="todas"||(f.who==="con"&&ks)||(f.who==="sin"&&!ks)))||null;
}

/* ---------- Entrenos ---------- */
// Sesiones de un día: las de la semana (si se han ajustado al planificar) o la semana habitual
// Sesiones previstas: las de la semana (si se han ajustado al planificar) o la semana habitual
function plannedSessions(d){
  const wk=S.plans[weekStartFor(d)];
  if(wk&&wk.training&&wk.training[d])return wk.training[d];
  const out=[];for(const a of adultsAt(d))if(a.trains)for(const s of (a.train[dow(d)]||[]))out.push({...s,who:a.id});
  return out;
}
// Sesiones reales: las previstas menos las que no hiciste, con las que cambiaste y las que añadiste
function sessionsOn(d){
  const real=(S.sport||{})[d]||{}, res=real.res||{};
  const out=[];
  plannedSessions(d).forEach((s,i)=>{const r=res[i];if(r&&r.st==="no")return;out.push(r&&r.st==="otro"?{...s,type:r.type||s.type}:s)});
  return out.concat(real.extra||[]);
}
const toMin=t=>{const [h,m]=String(t||"0:0").split(":").map(Number);return h*60+(m||0)};
const sessTime=s=>s.time||(s.when==="tarde"?"19:00":"08:00");
// Antes o después de comer, según la hora del entreno y la de la comida
const whenOf=s=>s.time?(toMin(s.time)<toMin(S.home.mealTimes.comida)?"manana":"tarde"):(s.when||"manana");
const sessWho=s=>{const p=s.who&&s.who!=="yo"&&S.people.find(x=>x.id===s.who);return p?personName(p)+": ":""};
const sessLabel=s=>sessWho(s)+(SPORTS[s.type]||s.type).toLowerCase()+" a las "+sessTime(s);
// Qué necesita un plato según los entrenos de alrededor
function needsFor(slot){
  const d=slot.date, out={carbs:false,prot:false,noHeavy:false,why:[]};
  if(slot.meal==="cena"){
    const sD=sessionsOn(d), sN=slot.tupper.length?sessionsOn(addDays(d,1)):[];
    if(sN.length){out.carbs=true;out.why.push("mañana se entrena: "+sN.map(sessLabel).join(" y "))}
    const pmD=sD.filter(s=>whenOf(s)==="tarde");
    if(pmD.length){out.prot=true;out.why.push("recuperación de "+pmD.map(s=>SPORTS[s.type].toLowerCase()).join(" y "));if(pmD.some(s=>ENDURANCE.has(s.type)))out.carbs=true}
    if(sN.some(s=>whenOf(s)==="manana"))out.prot=true;
    if(sN.some(s=>ENDURANCE.has(s.type))){out.noHeavy=true}
    if(sN.length>=2){out.prot=true;out.why.push("día doble")}
  }else{
    const sD=sessionsOn(d);
    if(sD.length){out.carbs=true;out.why.push("hoy se entrena: "+sD.map(sessLabel).join(" y "))}
    if(sD.some(s=>whenOf(s)==="tarde"&&ENDURANCE.has(s.type)))out.noHeavy=true;
    if(sD.some(s=>whenOf(s)==="manana"))out.prot=true;
  }
  return out;
}

/* ---------- Huecos de la semana ---------- */
const sacrifice=k=>!!((S.home.sacrifice||{})[k]);
function adultFactor(a,slot){
  let f=Number(a.factor)||1;
  if(sacrifice("raciones"))f-=0.1;
  if(a.goals.includes("musculo"))f+=0.15;
  if(a.goals[0]==="adelgazar")f-=0.1;
  if(slot&&slot.need&&slot.need.why.includes("día doble"))f+=0.1;
  return Math.round(f*100)/100;
}
// Calcula los huecos (comidas que se cocinan) de una semana a partir de la semana tipo y los cambios
function buildSlots(start){
  const slots=[];
  for(const d of weekDates(start)){
    if(S.home.start&&d<S.home.start)continue;   // antes de empezar el plan no se planifica
    for(const meal of ["comida","cena"]){
      const st=mealState(d,meal);
      if(st!=="cocinar"&&st!=="solotaper")continue;
      const ks=st==="solotaper"?[]:kidsAt(d,meal);
      const as=st==="solotaper"?[]:adultsAt(d,meal);
      // Táper para el día siguiente: los adultos que estén y se lleven táper
      const tupper=meal==="cena"&&mealState(addDays(d,1),"comida")==="taper"?adultsAt(addDays(d,1),"comida").filter(a=>a.id==="yo"||a.tupper):[];
      if(st==="solotaper"&&!tupper.length)continue;
      const f=st==="solotaper"?null:fixedFor(d,meal);
      const slot={id:d+"|"+meal,date:d,meal,eaters:as,kids:ks,tupper,fixed:f};
      slot.need=f&&f.capricho?{carbs:false,prot:false,noHeavy:false,why:[]}:needsFor(slot);
      slot.portions=Math.round((as.concat(tupper).reduce((t,a)=>t+adultFactor(a,slot),0)+ks.reduce((t,k)=>t+(Number(k.factor)||0.6),0))*100)/100;
      slots.push(slot);
    }
  }
  return slots;
}
// Avisos: comidas de táper sin cena cocinada la víspera
function tupperGaps(start){
  const out=[];
  for(const d of weekDates(start)){
    if(mealState(d,"comida")!=="taper")continue;
    const prev=addDays(d,-1), st=mealState(prev,"cena");
    if(st!=="cocinar"&&st!=="solotaper")out.push(d);
  }
  return out;
}

/* ---------- Cocinar por lotes ---------- */
function cookDayFor(d){
  if(S.home.cookMode!=="lote")return d;
  for(let i=0;i<7;i++){const x=addDays(d,-i);if(S.home.cookDays.includes(dow(x)))return x}
  return d;
}
// ¿Aguanta en la nevera desde que se cocina hasta la última ración? Si no, se congela (si se puede)
function keepPlan(r,slot){
  const cook=cookDayFor(slot.date), last=slot.tupper.length?addDays(slot.date,1):slot.date;
  const days=daysBetween(cook,last);
  if(days<=r.fridge)return {ok:true,cook,freeze:false,days};
  if(r.freeze)return {ok:true,cook,freeze:true,days};
  return {ok:false,cook,days};
}

/* ---------- Elegir platos ---------- */
function weekRecipes(start,exceptId){
  const wk=S.plans[start];if(!wk)return [];
  return Object.entries(wk.slots||{}).filter(([id])=>id!==exceptId).map(([,v])=>v.recipe).filter(Boolean);
}
function candidates(slot,opts={}){
  const out=[];
  for(const r of R){
    if(!variantFor(r)||!hasPhoto(r))continue;
    const people=slot.eaters.concat(slot.kids,slot.tupper);
    if(!people.every(p=>canEat(p,r)))continue;
    if(slot.eaters.concat(slot.tupper).some(a=>dishPref(a,r.id)<=-1))continue;
    if(slot.kids.length){
      if(!r.kid&&!slot.kids.every(k=>dishPref(k,r.id)>=1))continue;
      if(r.tags.includes("picante")&&slot.kids.some(k=>(Number(k.age)||8)<10))continue;
      if(slot.kids.some(k=>dishPref(k,r.id)<=-1))continue;
    }
    if(slot.need.noHeavy&&r.heavy)continue;
    if(S.home.cookMode==="lote"&&!keepPlan(r,slot).ok)continue;
    if(opts.only&&!opts.only(r))continue;
    out.push(r);
  }
  return out;
}
function scoreRecipe(r,slot,ctx){
  // Objetivos de los adultos que comen: los tuyos pesan más
  const eatA=[...new Set(slot.eaters.concat(slot.tupper))];
  const goals=[...new Set(eatA.sort((a,b)=>(a.id==="yo"?-1:1)).flatMap(a=>a.goals||[]))].slice(0,4);
  let s=Math.random()*(ctx.noise??2.4);
  // Tipo de plato según los entrenos y el objetivo
  const wantCarbs=slot.need.carbs||(goals.includes("musculo")&&slot.meal==="comida");
  if(wantCarbs)s+=r.type==="c"?3:-1.5;
  else if(slot.meal==="cena")s+=r.type==="l"?(goals.includes("adelgazar")?3:1.5):(goals.includes("adelgazar")?-2:0);
  if(slot.need.prot)s+=(r.prot||30)>=38?1.2:0;
  // Objetivos (pesan más los primeros)
  goals.forEach((g,i)=>{const w=[1.6,1,0.6][i]||0.5;
    if(g==="musculo")s+=w*((r.prot||30)-35)/8;
    if(g==="adelgazar"&&r.kcal)s-=w*(r.kcal-500)/150;
    if(g==="ahorrar")s-=w*(rationCost(r)-2.2)/0.8;
    if(g==="rapido")s-=w*(recipeTime(r)-18)/6;
    if(g==="rendimiento"&&(slot.need.carbs||slot.need.prot))s+=w*0.8;
  });
  // Gustos de quien come
  const lm=ctx.lm||{};
  const tw=sacrifice("gustos")?0.5:1;
  for(const a of slot.eaters.concat(slot.tupper.filter(t=>!slot.eaters.includes(t))))s+=tw*tasteScore(a,r,lm[a.id]);
  for(const k of slot.kids)s+=tw*0.8*tasteScore(k,r,lm[k.id]);
  // Variedad: no repetir en la semana y cada vez menos penalización hasta 4 semanas atrás;
  // los "bien, pero no a menudo" esperan más
  // Repetir: lo que la persona acepta para ahorrar (o, por compatibilidad, el antiguo "repetir más platos")
  const rep=S.home.repeat||(sacrifice("repetir")?"semanas":"no");
  if(ctx.used.has(r.id))s-=rep==="semana"?1:8;
  const ago=ctx.hist[r.id];if(ago!=null)s-=(rep==="no"?1:0.3)*([4.5,3,1.8][ago-1]||0);
  // Aprovechar paquetes: si se acepta repetir, premia los platos que comparten ingredientes con la semana
  if(rep!=="no"&&ctx.ingUsed){const sh=r.ing.filter(([p])=>ctx.ingUsed.has(p)&&!COMMON.has(p)).length;s+=sh*(rep==="semana"?0.9:0.5)}
  if(slot.eaters.some(a=>isRare(a,r.id))&&ago!=null)s-=5;
  // Equilibrio semanal: algo de legumbre y pescado, sin pasarse, y variando la proteína principal
  const c=ctx.counts;
  if(sacrifice("proteina")){if(r.group==="legumbre"||r.group==="huevo")s+=1.2;if(r.main==="pescado_azul"||r.main==="marisco"||r.main==="ternera")s-=1.5}
  else if((r.group==="legumbre"&&(c.legumbre||0)<1)||(r.group==="pescado"&&(c.pescado||0)<2))s+=1.6;
  if(r.group==="legumbre"&&(c.legumbre||0)>=2)s-=2.5;
  if(r.group==="pescado"&&(c.pescado||0)>=3)s-=2.5;
  if(!c[r.group])s+=0.8;
  s-=1.4*(ctx.mains[r.main]||0);
  if(r.group==="carne"&&(c.carne||0)>=3)s-=3;
  if(r.red&&(c.red||0)>=(goals.includes("sano")?1:2))s-=3;
  if(r.group==="huevo"&&(c.huevo||0)>=2)s-=3;
  if(ctx.have)s+=ctx.have(r)*1.5;
  if(ctx.oldFrozen&&r.ing.some(([p])=>ctx.oldFrozen.has(p)))s+=2;
  // Facilidad: lo que te resultó complicado sale menos; lo fácil, algo más
  const mineR=S.ratings.filter(x=>x.rid===r.id&&x.ease&&slot.eaters.concat(slot.tupper).some(a=>a.id===x.who));
  if(mineR.some(x=>x.ease==="dificil"))s-=2.5;else if(mineR.some(x=>x.ease==="facil"))s+=0.6;
  return s;
}
function makeCtx(start,exceptId){
  const used=new Set(weekRecipes(start,exceptId));
  // Hace cuántas semanas se comió cada plato (1 a 3), mirando atrás y también las semanas ya planificadas después
  const hist={};for(const k of [3,2,1])for(const sign of [-1,1])for(const id of weekRecipes(addDays(start,sign*7*k)))hist[id]=k;
  const counts={},mains={},ingUsed=new Set();for(const id of used){const r=RX[id];if(!r)continue;for(const [p] of r.ing)ingUsed.add(p);counts[r.group]=(counts[r.group]||0)+1;mains[r.main]=(mains[r.main]||0)+1;if(r.red)counts.red=(counts.red||0)+1}
  const lm=Object.fromEntries(S.people.map(p=>[p.id,learnedMap(p)]));
  // Lo que lleva más de 3 meses en el congelador: mejor gastarlo pronto
  let oldFrozen=null;try{if(typeof freezerState==="function")oldFrozen=new Set(freezerState().filter(e=>e.days>FREEZER_MONTHS*30).map(e=>e.pid))}catch(e){}
  return {used,hist,counts,mains,lm,oldFrozen,ingUsed};
}
function pickFor(slot,ctx){
  let c=candidates(slot);
  if(!c.length)c=candidates({...slot,need:{...slot.need,noHeavy:false}});
  if(!c.length)c=R.filter(r=>variantFor(r));
  let best=null,bs=-1e9;for(const r of c){const s=scoreRecipe(r,slot,ctx);if(s>bs){bs=s;best=r}}
  return best;
}
function addToCtx(ctx,r){ctx.used.add(r.id);if(ctx.ingUsed)for(const [p] of r.ing)ctx.ingUsed.add(p);ctx.counts[r.group]=(ctx.counts[r.group]||0)+1;ctx.mains[r.main]=(ctx.mains[r.main]||0)+1;if(r.red)ctx.counts.red=(ctx.counts.red||0)+1}

// Asegura que la semana existe y que todos sus huecos tienen plato (respeta los ya elegidos)
function ensureWeek(start,regen){
  const wk=S.plans[start]=S.plans[start]||{start,slots:{},training:null,confirmed:false,createdAt:todayISO()};
  if(regen){for(const [id,v] of Object.entries(wk.slots))if(!v.locked)delete wk.slots[id];wk.confirmed=false}
  const slots=buildSlots(start);
  const ctx=makeCtx(start);
  let changed=false;
  for(const sl of slots){
    if(sl.fixed){
      if(sl.fixed.recipe&&(!wk.slots[sl.id]||wk.slots[sl.id].recipe!==sl.fixed.recipe)){wk.slots[sl.id]={recipe:sl.fixed.recipe,locked:true};changed=true}
      continue;
    }
    const cur=wk.slots[sl.id];
    if(cur&&RX[cur.recipe])continue;
    const r=pickFor(sl,ctx);if(!r)continue;
    wk.slots[sl.id]={recipe:r.id};addToCtx(ctx,r);changed=true;
  }
  return {wk,slots,changed};
}
function genWeekFromScratch(start){
  // Varios intentos; se sortea entre los mejores (equilibrio y precio) para no repetir siempre el mismo
  const tries=[];
  const keep=S.plans[start]?{...S.plans[start]}:null;
  for(let t=0;t<20;t++){
    S.plans[start]=keep?{...keep,slots:Object.fromEntries(Object.entries(keep.slots||{}).filter(([,v])=>v.locked))}:{start,slots:{},training:null,confirmed:false,createdAt:todayISO()};
    const {wk,slots}=ensureWeek(start);
    // Coste real de la semana (paquetes enteros de lo fresco): así se nota el ahorro de compartir ingredientes
    const cost=weekCost(start), rep=S.home.repeat||"no";
    const bal=balanceOf(wk);
    const sc=bal*(rep==="semana"?1:2)-cost/(rep==="no"?8:3);
    tries.push({sc,slots:JSON.parse(JSON.stringify(wk.slots))});
  }
  tries.sort((a,b)=>b.sc-a.sc);
  S.plans[start].slots=tries[Math.floor(Math.random()*Math.min(6,tries.length))].slots;
  S.plans[start].budget=fitBudget(start);
}
/* ---------- Presupuesto ---------- */
// Coste aproximado de la comida de una semana (raciones x precio; la lista real redondea a envases)
// Lo fresco y lo congelado se cuenta en paquetes enteros (se compra para la semana); la despensa, solo lo que se gasta
function weekCost(start,slotsIn){
  const wk=S.plans[start];if(!wk)return 0;let t=0;const q={};
  for(const sl of slotsIn||buildSlots(start)){const v=wk.slots[sl.id],r=v&&RX[v.recipe];
    if(r)for(const [p,c] of r.ing)q[p]=(q[p]||0)+c*sl.portions;else if(sl.fixed&&!sl.fixed.recipe)t+=Number(sl.fixed.cost)||0}
  for(const [p,c] of Object.entries(q))t+=P[p].keep==="despensa"?c/P[p].env*price(p):packsFor(p,c)*price(p);
  return Math.round(t*100)/100;
}
// Lo que se puede gastar en comida esa semana: presupuesto semanal menos envío y la parte de básicos
function weekFoodTarget(start){
  const m=monthOfWeek(start), n=Math.max(1,weeksInMonth(m).length);
  const fee=tarifa(S.home.shop.weekMode).envio, monthFee=tarifa(S.home.shop.monthMode).envio/n;
  return weekBudget(m)-fee-monthFee-(Number(S.home.budget.basics)||0)/n;
}
// Cambia los platos más caros por otros más baratos que sigan encajando, hasta llegar al presupuesto
function fitBudget(start){
  const wk=S.plans[start];if(!wk)return {ok:true};
  const target=weekFoodTarget(start), slots=buildSlots(start);
  for(let it=0;it<12;it++){
    const cost=weekCost(start,slots);if(cost<=target)return {ok:true,cost,target};
    let best=null;
    for(const sl of slots){
      if(sl.fixed)continue;const v=wk.slots[sl.id];if(!v||v.locked)continue;const cur=RX[v.recipe];if(!cur)continue;
      const ctx=makeCtx(start,sl.id);ctx.noise=0;
      const curS=scoreRecipe(cur,sl,ctx);
      const sameWeekOk=(S.home.repeat||"no")==="semana";
      for(const r of candidates(sl)){if(r.id===cur.id||(!sameWeekOk&&ctx.used.has(r.id)))continue;
        // Ahorro real: coste de la semana con este cambio (cuenta los paquetes que se comparten)
        const prev=wk.slots[sl.id];wk.slots[sl.id]={recipe:r.id};const after=weekCost(start,slots);wk.slots[sl.id]=prev;
        const save=cost-after;if(save<=0.3)continue;
        const loss=Math.max(0,curS-scoreRecipe(r,sl,ctx));
        const val=save/(1+loss*0.6);
        if(!best||val>best.val)best={val,id:sl.id,rid:r.id}}
    }
    if(!best)return {ok:false,cost,target};
    wk.slots[best.id]={recipe:best.rid};
  }
  const cost=weekCost(start,slots);return {ok:cost<=target,cost,target};
}
function balanceOf(wk){const c={};for(const v of Object.values(wk.slots)){const r=RX[v.recipe];if(r){c[r.group]=(c[r.group]||0)+1;if(r.red)c.red=(c.red||0)+1}}
  return Math.min(c.legumbre||0,2)+Math.min(c.pescado||0,2)-Math.max(0,(c.carne||0)-3)-Math.max(0,(c.red||0)-1)-Math.max(0,(c.huevo||0)-2)}

// Tras cambiar quién come cada comida: se recalculan las semanas desde esa fecha
function replanFrom(d){for(const s of Object.keys(S.plans))if(addDays(s,6)>=d)ensureWeek(s)}

/* ---------- Previsión ---------- */
// Siempre hay menú preparado hasta el final del mes siguiente (o del mes en que empieza el plan, si es más tarde)
function ensureHorizon(){
  const today=todayISO(), from=S.home.start&&S.home.start>today?S.home.start:today;
  const base=parseISO(from), end=iso(new Date(base.getFullYear(),base.getMonth()+(from===today?2:1),0));
  let s=weekStartFor(from),n=0;
  while(s<=end&&n<12){if(!S.plans[s]||!Object.keys(S.plans[s].slots||{}).length)genWeekFromScratch(s);s=addDays(s,7);n++}
}

/* ---------- Alternativas para cambiar un plato ---------- */
function alternatives(slot,n=6){
  const start=weekStartFor(slot.date);
  const ctx=makeCtx(start,slot.id);ctx.noise=0.3;
  const inv=inventory(monthOfWeek(start),slot.id);
  if(inv)ctx.have=r=>{const m=missingFor(r,slot,inv);return 1-m.length/Math.max(1,r.ing.length)};
  const cur=(S.plans[start]&&S.plans[start].slots[slot.id]||{}).recipe;
  return candidates(slot).filter(r=>r.id!==cur).map(r=>({r,s:scoreRecipe(r,slot,ctx),miss:inv?missingFor(r,slot,inv):null}))
    .sort((a,b)=>b.s-a.s).slice(0,n);
}
function missingFor(r,slot,inv){return r.ing.filter(([pid,q])=>(inv[pid]||0)<q*slot.portions-1).map(([pid])=>pid)}
function setSlotRecipe(slot,rid){
  const start=weekStartFor(slot.date);const wk=S.plans[start];
  wk.slots[slot.id]={...(wk.slots[slot.id]||{}),recipe:rid,locked:true};save();
}
// Pasa el plato de un hueco al siguiente, y así sucesivamente (el último se descarta)
function shiftForward(start,fromId){
  const wk=S.plans[start];const slots=buildSlots(start).filter(s=>!s.fixed);
  const i=slots.findIndex(s=>s.id===fromId);if(i<0)return;
  for(let j=slots.length-1;j>i;j--){const a=wk.slots[slots[j-1].id];if(a)wk.slots[slots[j].id]={recipe:a.recipe}}
  delete wk.slots[fromId];
}

/* ---------- Proteína del día ---------- */
function proteinTarget(a,d){
  if(!a.weight)return null;
  const n=sessionsOn(d).length;
  let k=1.6;if(n||a.goals.includes("musculo"))k=1.8;if(n>=2)k=2.0;
  // Solo cuentan comida y cena: alrededor del 70 % de la proteína del día (el resto, desayuno y meriendas)
  return Math.round(a.weight*k*0.7);
}
function dishOfMeal(d,meal){
  const st=mealState(d,meal);
  let sid=null;
  if(meal==="comida"&&st==="taper")sid=addDays(d,-1)+"|cena";
  else if(st==="cocinar")sid=d+"|"+meal;
  if(!sid)return {state:st};
  const wk=S.plans[weekStartFor(sid.slice(0,10))];const v=wk&&wk.slots[sid];
  const f=fixedFor(sid.slice(0,10),sid.slice(11));
  return {state:st,recipe:v&&RX[v.recipe],capricho:!!(f&&f.capricho)};
}
// Lo que lleva la ración de una persona (calorías y macros de la receta por su factor de ración)
function portionNutr(r,f){
  const k=x=>x==null?null:Math.round(x*f);
  return {kcal:k(r.kcal),prot:k(r.prot),carb:k(r.carb),fat:k(r.fat)};
}
const factorOf=p=>p.kind==="adulto"?adultFactor(p):(Number(p.factor)||0.6);
// Total de comida y cena de una persona en un día (los caprichos y comidas fuera no se cuentan)
function dayTotals(p,d){
  const t={kcal:0,prot:0,carb:0,fat:0,meals:0,skipped:[]};
  for(const meal of ["comida","cena"]){
    const x=dishOfMeal(d,meal);
    if(p.id!=="yo"){const sl=buildSlots(weekStartFor(d)).find(s=>s.id===d+"|"+meal);if(!sl||!sl.eaters.concat(sl.kids,sl.tupper).includes(p))continue}
    if(!x.recipe||x.capricho){if(x.state==="fuera"||x.capricho)t.skipped.push(meal);continue}
    const n=portionNutr(x.recipe,factorOf(p));
    for(const k of ["kcal","prot","carb","fat"])t[k]+=n[k]||0;
    t.meals++;
  }
  return t;
}
function dayProtein(a,d){
  const t=proteinTarget(a,d);if(!t)return null;
  let got=0,unknown=false;
  for(const meal of ["comida","cena"]){const x=dishOfMeal(d,meal);if(x.recipe&&!x.capricho)got+=(x.recipe.prot||0)*adultFactor(a);else unknown=true}
  return {got:Math.round(got),target:t,unknown};
}

/* ---------- Historial ---------- */
// Lo que ha comido cada persona (de los menús ya pasados), con su valoración si la dio
function historyOf(p,limit=30){
  const today=todayISO(), out=[];S.meals=S.meals||{};
  for(const start of Object.keys(S.plans).sort().reverse()){
    if(start>today)continue;const wk=S.plans[start];
    for(const sl of buildSlots(start).reverse()){
      if(sl.date>=today||sl.date<(wk.createdAt||"9"))continue;
      const inSlot=sl.eaters.concat(sl.kids).includes(p);
      const tupperNext=p.kind==="adulto"&&sl.tupper.includes(p)&&addDays(sl.date,1)<today;
      const v=wk.slots[sl.id],r=v&&RX[v.recipe];if(!r)continue;
      const m=S.meals[sl.id];
      if(inSlot){
        if(m&&m.status==="otro")out.push({date:sl.date,meal:sl.meal,name:m.rid&&RX[m.rid]?RX[m.rid].name:(m.text||"Otra cosa"),note:"en vez de lo previsto",rid:m.rid});
        else if(m&&m.status!=="ok")out.push({date:sl.date,meal:sl.meal,name:m.status==="fuera"?"Fuera de casa":"No se cocinó",note:""});
        else{const rt=S.ratings.find(x=>x.slot===sl.id&&x.who===p.id);out.push({date:sl.date,meal:sl.meal,name:r.name,rid:r.id,v:rt?(rt.rare?"rare":rt.v):null})}
      }
      if(tupperNext){const k=addDays(sl.date,1)+"|comida",mm=S.meals[k];
        out.push({date:addDays(sl.date,1),meal:"comida",name:mm&&mm.status!=="ok"?(mm.status==="otro"?(mm.rid&&RX[mm.rid]?RX[mm.rid].name:mm.text||"Otra cosa"):"Fuera de casa"):"Táper de "+r.name.toLowerCase(),rid:r.id})}
      if(out.length>=limit*2)break;
    }
  }
  return out.sort((a,b)=>(b.date+b.meal).localeCompare(a.date+a.meal)).slice(0,limit);
}
