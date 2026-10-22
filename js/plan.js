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
// Deporte de los niños: sus sesiones del día (solo si ese día está contigo)
const kidSessions=(k,d)=>k.trains?(k.train[dow(d)]||[]):[];
// Ración del niño: algo más los días que entrena (cena después del entreno, o comida si entrena por la tarde)
function kidFactor(k,slot){
  let f=Number(k.factor)||0.6;
  const ss=slot?kidSessions(k,slot.date):[];
  if(ss.length&&(slot.meal==="cena"||ss.some(s=>whenOf(s)==="tarde")))f*=1.15;
  return Math.round(f*100)/100;
}
function needsFor(slot){
  const d=slot.date, out={carbs:false,prot:false,noHeavy:false,why:[]};
  // Los niños que entrenan también cuentan: energía antes y recuperación después
  for(const k of slot.kids||[]){const ss=kidSessions(k,d);if(!ss.length)continue;
    if(slot.meal==="comida"&&ss.some(s=>whenOf(s)==="tarde")){out.carbs=true;out.why.push(personName(k)+" tiene "+ss.map(s=>SPORTS[s.type].toLowerCase()).join(" y ")+" esta tarde")}
    if(slot.meal==="cena"){out.prot=true;out.why.push("recuperación de "+personName(k)+" ("+ss.map(s=>SPORTS[s.type].toLowerCase()).join(" y ")+")")}}
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
/* ---------- Preparar el mes ----------
   S.monthPrep["2026-12"] = {mood, more:[], less:[], favs:[rid], budget, done}
   Lo que se pide "más" o "menos" cambia la puntuación de las recetas de ese mes. */
const PREF_OPTS={rapido:"⚡ Rápido",ligero:"🥗 Ligero",proteina:"💪 Proteína",legumbre:"🫘 Legumbre",pescado:"🐟 Pescado",verdura:"🥦 Verdura",ninos:"🧒 Para niños",nuevo:"✨ Platos nuevos",barato:"💶 Barato",horno:"🔥 Horno"};
const prefMatch={rapido:r=>recipeTime(r)<=20,ligero:r=>r.type==="l",proteina:r=>(r.prot||0)>=35,legumbre:r=>r.group==="legumbre",pescado:r=>r.group==="pescado",
  verdura:r=>r.group==="vegetal",ninos:r=>!!r.kid,nuevo:r=>!S.ratings.some(x=>x.rid===r.id),barato:r=>rationCost(r)<=2,horno:r=>r.vars.some(v=>v.app==="horno")};
const monthPrefs=d=>(S.monthPrep||{})[String(d).slice(0,7)]||null;
function monthPrefScore(r,slot,ctx){
  const mp=monthPrefs(slot.date);if(!mp)return 0;let s=0;
  for(const k of mp.more||[])if(prefMatch[k]&&prefMatch[k](r))s+=3.6;
  for(const k of mp.less||[])if(prefMatch[k]&&prefMatch[k](r))s-=2.2;
  if((mp.favs||[]).includes(r.id)&&!ctx.used.has(r.id))s+=4.5;
  return s;
}
// Visitas: raciones de más en una comida (S.days[d].guests = {comida:n, cena:n})
const guestsAt=(d,meal)=>Number((((S.days[d]||{}).guests)||{})[meal])||0;

// Calcula los huecos (comidas que se cocinan) de una semana a partir de la semana tipo y los cambios
function buildSlots(start){
  const slots=[];
  for(const d of weekDates(start)){
    if(S.home.start&&d<S.home.start)continue;   // antes de empezar el plan no se planifica
    for(const meal of ["comida","cena"]){
      if(meal==="comida"&&S.home.startFrom==="cena"&&d===S.home.start)continue;   // empezó por la tarde: ese día solo la cena
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
      slot.guests=st==="solotaper"?0:guestsAt(d,meal);
      slot.portions=Math.round((as.concat(tupper).reduce((t,a)=>t+adultFactor(a,slot),0)+ks.reduce((t,k)=>t+kidFactor(k,slot),0)+slot.guests)*100)/100;
      slots.push(slot);
    }
  }
  return slots;
}
// Avisos: comidas de táper sin cena cocinada la víspera
function tupperGaps(start){
  const out=[];
  if(S.home.cookMode==="lote")return out;   // por lotes, los tápers salen de la sesión de cocina
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
// Por lotes: este plato ya está hecho de un día anterior (solo hay que sacarlo)
const fromBatch=sl=>S.home.cookMode==="lote"&&cookDayFor(sl.date)!==sl.date;
// Días que cubre una sesión de cocina: desde ese día hasta la víspera de la siguiente
function batchCovers(cd){
  let last=cd;for(let i=1;i<7;i++){const x=addDays(cd,i);if(S.home.cookDays.includes(dow(x)))break;last=x}
  return {from:cd,to:last,days:daysBetween(cd,last)+1};
}
// En qué tápers se reparte un plato: uno para la comida o cena de ese día (los que comen en casa)
// y uno por persona para el táper del día siguiente
function tupperSplit(sl){
  const out=[], home=sl.eaters.concat(sl.kids);
  if(home.length||sl.guests){const rac=home.reduce((t,p)=>t+(p.kind==="nino"?kidFactor(p,sl):adultFactor(p,sl)),0)+(sl.guests||0);
    out.push({when:`${DAYS[dow(sl.date)]} · ${sl.meal}${S.home.cookMode==="lote"&&!fromBatch(sl)?" (para hoy, sin táper)":""}`,rac:Math.round(rac*100)/100,who:home.map(p=>isMe(p)?"tú":personName(p)).concat(sl.guests?[`${sl.guests} invitados`]:[])})}
  for(const a of sl.tupper)out.push({when:`Táper del ${DAYS[dow(addDays(sl.date,1))].toLowerCase()} · comida`,rac:adultFactor(a,sl),who:[isMe(a)?"tú":personName(a)]});
  return out;
}
/* ---------- Cocinar varios platos a la vez ----------
   Junta los pasos de todos los platos de una sesión en una sola lista, en un orden práctico:
   lo que se hace solo (horno, air fryer, microondas, algo que cuece o hierve un rato) se arranca cuanto antes
   y, mientras, se avanza con los pasos que piden estar encima. Cada aparato solo hace una cosa a la vez
   (fuegos: hasta 4). Al acabar cada plato, se reparte en sus tápers. */
function cookStepKind(x){
  if(!x)return {passive:false,dur:3,res:null};
  const u=String(x.utensilio||"").toLowerCase(), m=Math.max(1,Number(x.min)||1);
  if(u.includes("horno"))return {passive:true,dur:m,res:"horno"};
  if(u.includes("air"))return {passive:true,dur:m,res:"air"};
  if(u.includes("microondas"))return {passive:true,dur:m,res:"micro"};
  if(x.fuego&&m>=8&&/(cazo|olla|cacerola)/.test(u))return {passive:true,dur:m,res:"fuego"};
  return {passive:false,dur:m,res:x.fuego?"fuego":null};
}
function batchPlan(items){
  // items: [{r, v, sl}]
  const st=items.map((o,i)=>({o,i,next:0,ready:0,left:o.v.steps.reduce((t,_,j)=>t+cookStepKind((o.v.info||[])[j]).dur,0)}));
  const busy={horno:0,air:0,micro:0}, fuegos=[0,0,0,0], out=[];let t=0,guard=0;
  const free=(res,at)=>res==="fuego"?fuegos.some(f=>f<=at):res&&busy[res]!=null?busy[res]<=at:true;
  const take=(res,until,at)=>{if(res==="fuego"){const i=fuegos.findIndex(f=>f<=at);if(i>=0)fuegos[i]=until}else if(res&&busy[res]!=null)busy[res]=until};
  while(st.some(s=>s.next<=s.o.v.steps.length)&&guard++<400){
    const cand=st.filter(s=>s.next<=s.o.v.steps.length&&s.ready<=t);
    if(!cand.length){t=Math.min(...st.filter(s=>s.next<=s.o.v.steps.length).map(s=>s.ready));continue}
    // Paso final de cada plato: repartirlo en tápers
    const done=cand.find(s=>s.next===s.o.v.steps.length);
    if(done){out.push({o:done.o,at:t,tupper:true});done.next++;t+=2;continue}
    const opts=cand.map(s=>{const x=(s.o.v.info||[])[s.next],k=cookStepKind(x);return {s,x,k,ok:free(k.res,t)}});
    const usable=opts.filter(c=>c.ok);
    if(!usable.length){t=Math.min(...Object.values(busy).filter(v=>v>t).concat(fuegos.filter(f=>f>t)),t+1);continue}
    usable.sort((a,b)=>(b.k.passive-a.k.passive)||(b.s.left-a.s.left));
    const c=usable[0],s=c.s;
    const waiting=st.filter(x=>x!==s&&x.ready>t).map(x=>x.o.r.name);
    out.push({o:s.o,at:t,i:s.next,text:s.o.v.steps[s.next],info:c.x,passive:c.k.passive,dur:c.k.dur,meanwhile:waiting});
    s.left-=c.k.dur;s.next++;
    if(c.k.passive){take(c.k.res,t+c.k.dur,t);s.ready=t+c.k.dur;t+=1}
    else{take(c.k.res,t+c.k.dur,t);t+=c.k.dur;s.ready=t}
  }
  return {steps:out,total:Math.max(t,...st.map(s=>s.ready))};
}
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
    if(r.small||(r.cap&&!opts.cap)||!variantFor(r)||!hasPhoto(r)||!hasPack(r))continue;
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
  const c=ctx.counts, wantMore=k=>((monthPrefs(slot.date)||{}).more||[]).includes(k);
  if(sacrifice("proteina")){if(r.group==="legumbre"||r.group==="huevo")s+=1.2;if(r.main==="pescado_azul"||r.main==="marisco"||r.main==="ternera")s-=1.5}
  else if((r.group==="legumbre"&&(c.legumbre||0)<1)||(r.group==="pescado"&&(c.pescado||0)<2))s+=1.6;
  // Si para este mes se ha pedido más legumbre o pescado, el límite semanal sube
  if(r.group==="legumbre"&&(c.legumbre||0)>=(wantMore("legumbre")?4:2))s-=2.5;
  if(r.group==="pescado"&&(c.pescado||0)>=(wantMore("pescado")?5:3))s-=2.5;
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
  s+=monthPrefScore(r,slot,ctx);
  // Recetas de un pack que has desbloqueado: salen más, para que se note lo comprado
  if(r.pack&&hasPack(r))s+=2.5;
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
  // Si nada encaja, se relaja todo (gustos de los niños, pesado, nevera…) menos la dieta y las alergias, que no se saltan nunca
  const all=slot.eaters.concat(slot.kids,slot.tupper);
  if(!c.length)c=R.filter(r=>!r.small&&variantFor(r)&&hasPhoto(r)&&hasPack(r)&&all.every(p=>canEat(p,r)));
  if(!c.length)return null;
  let best=null,bs=-1e9;for(const r of c){const s=scoreRecipe(r,slot,ctx);if(s>bs){bs=s;best=r}}
  return best;
}
function addToCtx(ctx,r){ctx.used.add(r.id);if(ctx.ingUsed)for(const [p] of r.ing)ctx.ingUsed.add(p);ctx.counts[r.group]=(ctx.counts[r.group]||0)+1;ctx.mains[r.main]=(ctx.mains[r.main]||0)+1;if(r.red)ctx.counts.red=(ctx.counts.red||0)+1}

// Asegura que la semana existe y que todos sus huecos tienen plato (respeta los ya elegidos)
function ensureWeek(start,regen){
  const wk=S.plans[start]=S.plans[start]||{start,slots:{},training:null,confirmed:false,createdAt:todayISO()};
  if(regen){for(const [id,v] of Object.entries(wk.slots))if(!v.locked)delete wk.slots[id];wk.confirmed=false}
  const slots=buildSlots(start);
  let changed=safetySweep(start,slots);
  const ctx=makeCtx(start);
  for(const sl of slots){
    if(sl.fixed){
      const fr=sl.fixed.recipe&&RX[sl.fixed.recipe];
      // Un plato fijo que alguien de los que comen ya no puede tomar no se pone: se elige otro
      if(!(fr&&unsafeFor(slotPeople(sl),fr).length)){
        if(fr&&(!wk.slots[sl.id]||wk.slots[sl.id].recipe!==sl.fixed.recipe)){wk.slots[sl.id]={recipe:sl.fixed.recipe,locked:true};changed=true}
        continue;
      }
    }
    const cur=wk.slots[sl.id];
    if(cur&&RX[cur.recipe])continue;
    const r=pickFor(sl,ctx);if(!r)continue;
    wk.slots[sl.id]={recipe:r.id};addToCtx(ctx,r);changed=true;
  }
  ensureSmall(start);
  if(safetySweep(start,slots,true)){ensureSmall(start);changed=true}
  return {wk,slots,changed};
}
/* ---------- Seguridad: alergias, dieta e ingredientes que alguien no puede tomar ----------
   No son gustos: mandan sobre todo, también sobre los platos elegidos a mano y los platos fijos.
   Desde hoy en adelante, cualquier plato que alguien de los que comen no pueda tomar se quita (y se elige otro)
   y se avisa de qué se ha cambiado y por qué. Lo ya pasado no se toca. */
let safetyNotes=[];
const slotPeople=sl=>[...new Set(sl.eaters.concat(sl.kids,sl.tupper))];
const unsafeFor=(people,r)=>people.filter(p=>!canEat(p,r));
// Por qué no puede: "huevo", "gluten", "pollo (vegano)"…
function whyCant(p,r){
  const al=p.allergies||[],a=recipeAllergens(r).filter(x=>al.includes(x));
  if(a.length)return a.map(x=>ALLERGENS[x].split(" (")[0].toLowerCase()).join(" ni ");
  const ing=r.ing.find(([pid])=>ingPref(p,pid)===-9);if(ing)return P[ing[0]].name.toLowerCase();
  const bad=r.ing.find(([pid])=>!dietAllows(p,pid));if(bad)return P[bad[0]].name.toLowerCase()+" ("+DIETS[dietOf(p)][1].toLowerCase()+")";
  if(!rawOk(p,r))return "platos cocinados (crudivegano)";
  return "algún ingrediente";
}
function safetySweep(start,slots,small){
  const wk=S.plans[start];if(!wk)return false;const today=todayISO();let any=false;
  const note=(d,meal,r,bad)=>{if(!safetyNotes.some(n=>n.d===d&&n.meal===meal&&n.rid===r.id))safetyNotes.push({d,meal,rid:r.id,name:r.name,who:bad.map(p=>(isMe(p)?"tú":personName(p))+": "+whyCant(p,r))})};
  if(!small){for(const sl of slots||buildSlots(start)){if(sl.date<today)continue;const v=wk.slots[sl.id],r=v&&RX[v.recipe];if(!r)continue;
    const bad=unsafeFor(slotPeople(sl),r);if(bad.length){delete wk.slots[sl.id];note(sl.date,sl.meal,r,bad);any=true}}}
  else for(const [d,dd] of Object.entries(wk.small||{})){if(d<today)continue;
    for(const [m,v] of Object.entries(dd)){const r=v&&RX[v.recipe];if(!r)continue;const bad=unsafeFor(smallEaters(d,m),r);
      if(bad.length){delete dd[m];note(d,m,r,bad);any=true}}}
  return any;
}
// Repasa todo lo que viene (se llama al pintar cada pantalla: así también la compra queda limpia)
function safetyAll(){let any=false;const today=todayISO();
  for(const s of Object.keys(S.plans))if(addDays(s,6)>=today){const sl=buildSlots(s);if(safetySweep(s,sl)||safetySweep(s,sl,true)){ensureWeek(s);any=true}}
  if(any)save();return any}
/* ---------- Comidas pequeñas: desayuno, almuerzo y merienda ----------
   Cada persona dice, para cada día, si la hace en casa ("casa"), se la lleva ("llevar") o no la hace ("no"):
   p.smallMeals = {desayuno:[7], almuerzo:[7], merienda:[7]} · p.smallSet = true cuando lo ha confirmado.
   Cada día y momento se elige un plato pequeño para todos los que lo hacen; si alguien se lo lleva, que se pueda llevar.
   Se guarda en S.plans[semana].small[día][momento] = {recipe, locked?}. */
const SMALL={desayuno:["☀️","Desayuno"],almuerzo:["🍎","Almuerzo"],merienda:["🥪","Merienda"]};
const smallState=(p,m,d)=>((p.smallMeals||{})[m]||[])[dow(d)]||"no";
// ¿Está ese día para esa comida pequeña? (la mañana va con la comida, la tarde con la cena; aunque coma fuera)
function presentSmall(p,d,m){
  if(p.id==="yo")return true;
  const o=((S.days[d]||{}).kids||{})[p.id];if(o!=null)return o;
  const k={...p,away:null};return presentByRule(k,d,m==="merienda"?"cena":"comida");
}
function smallEaters(d,m){
  return S.people.filter(p=>smallState(p,m,d)!=="no"&&presentSmall(p,d,m)&&!(m!=="merienda"&&(S.days[d]||{}).comida==="fuera"&&p.id==="yo"));
}
function smallCandidates(eaters,m){
  return R.filter(r=>r.small&&r.moments.includes(m)&&variantFor(r)&&hasPhoto(r)&&hasPack(r)&&eaters.every(p=>canEat(p,r)));
}
function ensureSmall(start){
  const wk=S.plans[start];if(!wk)return;wk.small=wk.small||{};
  const usedW={};for(const dd of Object.values(wk.small))for(const v of Object.values(dd))if(v&&v.recipe)usedW[v.recipe]=(usedW[v.recipe]||0)+1;
  for(const d of weekDates(start)){
    if(S.home.start&&d<S.home.start)continue;
    if(S.home.startFrom==="cena"&&d===S.home.start)continue;
    for(const m of Object.keys(SMALL)){
      const eaters=smallEaters(d,m);const cur=(wk.small[d]||{})[m];
      if(!eaters.length){if(cur&&!cur.locked)delete wk.small[d][m];continue}
      if(cur&&RX[cur.recipe])continue;
      const llevar=eaters.some(p=>smallState(p,m,d)==="llevar"), kidsIn=eaters.some(p=>p.kind==="nino");
      const prev=[addDays(d,-1),addDays(d,-2)].map(x=>((wk.small[x]||{})[m]||{}).recipe);
      let best=null,bs=-1e9;
      for(const r of smallCandidates(eaters,m)){
        if(llevar&&!r.portable)continue;
        let s=Math.random()*2;
        for(const p of eaters)s+=tasteScore(p,r)*(p.kind==="nino"?0.8:1);
        if(kidsIn&&r.kid)s+=1.2;
        if(prev.includes(r.id))s-=6;
        if(Object.values(wk.small[d]||{}).some(v=>v&&v.recipe===r.id))s-=8;   // ni repetido el mismo día
        s-=2.5*(usedW[r.id]||0);
        s-=(rationCost(r)-1)*0.8;
        const mp=monthPrefs(d);if(mp)for(const k of mp.more||[])if(prefMatch[k]&&prefMatch[k](r))s+=1.5;
        if(s>bs){bs=s;best=r}
      }
      if(best){(wk.small[d]=wk.small[d]||{})[m]={recipe:best.id};usedW[best.id]=(usedW[best.id]||0)+1}
    }
  }
}
// Raciones de una comida pequeña: la ración normal de cada uno
const smallPortions=(d,m)=>Math.round(smallEaters(d,m).reduce((t,p)=>t+(p.kind==="nino"?(Number(p.factor)||0.6):(Number(p.factor)||1)),0)*100)/100;
/* ---------- Cuándo preparar el mes siguiente ----------
   S.home.monthPrepDay: día de la semana de la última semana del mes (0 lunes … 6 domingo; por defecto martes)
   S.home.monthPrepAlt: si esa semana ya incluye el día 1 del mes siguiente, este día de la semana anterior (por defecto viernes) */
function monthPrepDate(m){
  const W=S.home.monthPrepDay??1, F=S.home.monthPrepAlt??4, [y,mm]=m.split("-").map(Number);
  const last=iso(new Date(y,mm,0));
  let d=last;while(dow(d)!==W)d=addDays(d,-1);           // último "martes" del mes
  const sunday=addDays(d,6-dow(d));                       // domingo de esa semana
  if(sunday>last){const mon=addDays(d,-dow(d)-7);d=addDays(mon,F)}   // esa semana ya cambia de mes: la anterior
  // Si cae en festivo, el día laborable anterior (sin saltar a fin de semana si el día elegido era entre semana)
  const wk=dow(d)<5;for(let i=0;i<10&&(isHoliday(d)||(wk&&dow(d)>=5));i++)d=addDays(d,-1);
  return d;
}
// Tras cambiar la dieta o las alergias de alguien: fuera los platos que ya no puede comer (salvo los elegidos a mano)
function replanIncompatible(){safetyAll();save()}
function refreshSmall(){for(const s of Object.keys(S.plans))if(addDays(s,6)>=todayISO()){const sm=S.plans[s].small||{};
  for(const d of Object.keys(sm))for(const m of Object.keys(sm[d]))if(!smallEaters(d,m).length)delete sm[d][m];ensureSmall(s)}}
function smallOf(d){const wk=S.plans[weekStartFor(d)];return (wk&&wk.small&&wk.small[d])||{}}
function rerollSmall(d,m){const wk=S.plans[weekStartFor(d)];if(!wk||!wk.small||!wk.small[d])return;
  const old=(wk.small[d][m]||{}).recipe;delete wk.small[d][m];
  for(let i=0;i<6;i++){ensureSmall(weekStartFor(d));if(((wk.small[d]||{})[m]||{}).recipe!==old)break;delete wk.small[d][m]}
  ensureSmall(weekStartFor(d));
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
    const packs=Object.values(wk.slots).filter(v=>RX[v.recipe]&&RX[v.recipe].pack&&hasPack(RX[v.recipe])).length;
    const sc=bal*(rep==="semana"?1:2)-cost/(rep==="no"?8:3)+Math.min(packs,2)*1.2;
    tries.push({sc,slots:JSON.parse(JSON.stringify(wk.slots))});
  }
  tries.sort((a,b)=>b.sc-a.sc);
  S.plans[start].slots=tries[Math.floor(Math.random()*Math.min(6,tries.length))].slots;
  // Comidas pequeñas: se rehacen las que no se eligieron a mano
  const sm=S.plans[start].small||{};for(const d of Object.keys(sm))for(const m of Object.keys(sm[d]))if(!sm[d][m].locked)delete sm[d][m];
  ensureSmall(start);
  S.plans[start].budget=fitBudget(start);
}
/* ---------- Presupuesto ---------- */
// Coste aproximado de la comida de una semana (raciones x precio; la lista real redondea a envases)
// Lo fresco y lo congelado se cuenta en paquetes enteros (se compra para la semana); la despensa, solo lo que se gasta
function weekCost(start,slotsIn){
  const wk=S.plans[start];if(!wk)return 0;let t=0;const q={};
  for(const sl of slotsIn||buildSlots(start)){const v=wk.slots[sl.id],r=v&&RX[v.recipe];
    if(r)for(const [p,c] of slotIng(r,sl))q[p]=(q[p]||0)+c;else if(sl.fixed&&!sl.fixed.recipe)t+=Number(sl.fixed.cost)||0}
  for(const [d,dd] of Object.entries(wk.small||{}))for(const [m,v] of Object.entries(dd)){const r=RX[v.recipe];if(r)for(const [p,c] of r.ing)q[p]=(q[p]||0)+c*smallPortions(d,m)}
  for(const [p,c] of Object.entries(q))t+=P[p].keep==="despensa"?c/P[p].env*price(p):packsFor(p,c)*price(p);
  return Math.round(t*100)/100;
}
// Lo que se puede gastar en comida esa semana: presupuesto semanal menos envío y la parte de básicos
function weekFoodTarget(start){
  const m=monthOfWeek(start), n=Math.max(1,weeksInMonth(m).length);
  // Sin presupuesto fijado (alta nueva): sin tope; se propone lo razonable y luego se dice lo que cuesta
  if(!Number(S.home.budget.month)&&!Number(S.home.budget.week)&&!Number(((S.monthPrep||{})[m]||{}).budget))return Infinity;
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
      // Lo que se ha pedido para este mes (más de algo, o repetir un plato) no se cambia por ahorrar
      {const mp=monthPrefs(sl.date);if(mp&&((mp.favs||[]).includes(cur.id)||(mp.more||[]).some(k=>prefMatch[k]&&prefMatch[k](cur))))continue}
      if(cur.pack&&hasPack(cur))continue;   // lo que has desbloqueado en la tienda tampoco
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
// Empezar hoy: si ya ha pasado la comida, hoy solo la cena; si es muy tarde, mañana
function startToday(){
  const n=new Date(),h=n.getHours()+n.getMinutes()/60,today=todayISO();
  return h>=21.5?{start:addDays(today,1),from:null}:h>=15.5?{start:today,from:"cena"}:{start:today,from:null};
}
function setPlanStart(st,from){S.home.start=st;S.home.startFrom=from||null;S.home.startedAt=Date.now()}
function replanFrom(d){for(const s of Object.keys(S.plans))if(addDays(s,6)>=d)ensureWeek(s)}
// Rehace el menú desde hoy con lo que se sabe ahora (tras afinar): lo elegido a mano se respeta
function redoFromToday(){
  const today=todayISO(),cur=weekStartFor(today);
  for(const s of Object.keys(S.plans).sort()){if(addDays(s,6)<today)continue;const wk=S.plans[s];
    if(s>cur){genWeekFromScratch(s);continue}
    for(const [id,v] of Object.entries(wk.slots))if(id.slice(0,10)>=today&&!v.locked)delete wk.slots[id];
    for(const [d,dd] of Object.entries(wk.small||{}))if(d>=today)for(const [m,v] of Object.entries(dd))if(!v.locked)delete dd[m];
    ensureWeek(s)}
  ensureHorizon();save();
}
// Lo que cuesta al mes el menú que hay (para proponer el presupuesto cuando aún no se ha fijado)
function estimateMonthBudget(){
  const today=todayISO(),ws=Object.keys(S.plans).filter(s=>addDays(s,6)>=today).sort();
  const full=ws.slice(1,4).length?ws.slice(1,4):ws.slice(0,1);const c=full.map(s=>weekCost(s)).filter(x=>x>0);
  if(!c.length)return 150;
  const avg=c.reduce((a,b)=>a+b,0)/c.length;
  return Math.ceil((avg*52/12+(Number(S.home.budget.basics)||0))/10)*10;
}

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
  return {state:st,recipe:v&&RX[v.recipe],capricho:!!(f&&f.capricho)||!!(v&&RX[v.recipe]&&RX[v.recipe].cap)};
}
// Lo que lleva la ración de una persona (calorías y macros de la receta por su factor de ración)
function portionNutr(r,f){
  const k=x=>x==null?null:Math.round(x*f);
  return {kcal:k(r.kcal),prot:k(r.prot),carb:k(r.carb),fat:k(r.fat)};
}
const factorOf=(p,slot)=>p.kind==="adulto"?adultFactor(p,slot):kidFactor(p,slot);
// Ingredientes de un plato en un hueco: lo que cada uno elige a su gusto (la pizza de cada uno) se reparte según quién come
function slotIng(r,sl){
  if(!r.ing.some(([p])=>P[p].choice))return r.ing.map(([p,q])=>[p,q*sl.portions]);
  const ps=[...new Set((sl.eaters||[]).concat(sl.kids||[],sl.tupper||[]))],fs=ps.map(p=>factorOf(p,sl)),tot=fs.reduce((a,b)=>a+b,0)||1,out=[];
  for(const [pid,q] of r.ing){const g=P[pid].choice;
    if(!g||!ps.length){out.push([pid,q*sl.portions]);continue}
    ps.forEach((p,i)=>{const c=(p.choices||{})[g];out.push([c&&P[c]?c:pid,q*sl.portions*fs[i]/tot])})}
  return out;
}
// Total de comida y cena de una persona en un día (los caprichos y comidas fuera no se cuentan)
function dayTotals(p,d){
  const t={kcal:0,prot:0,carb:0,fat:0,meals:0,skipped:[]};
  for(const [m,v] of Object.entries(smallOf(d))){const r=RX[v.recipe];if(!r||!smallEaters(d,m).includes(p))continue;
    const n=portionNutr(r,p.kind==="nino"?(Number(p.factor)||0.6):(Number(p.factor)||1));for(const k of ["kcal","prot","carb","fat"])t[k]+=n[k]||0;t.meals++}
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
