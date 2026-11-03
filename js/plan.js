/* Táper · planificador: qué comidas hay cada día, qué necesita cada una y qué plato encaja mejor */
"use strict";

/* ---------- Semanas de planificación ---------- */
// La semana empieza el día en que planificas (por defecto el domingo) y dura 7 días
// La semana del menú va siempre de lunes a domingo (el día en que se planifica es aparte: S.home.planDay)
function weekStartFor(d){return mondayOf(d)}
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
  // Días fijos de la semana y, si se marca (pr.findes, desde «Tu semana normal»), también fines de semana alternos
  if(pr.type==="dias"&&((pr.days||[]).includes(w)||!pr.findes))return (pr.days||[]).includes(w);
  if(pr.type==="alternas"||pr.type==="findes"||pr.type==="dias"){
    const t=turnInfo(pr.type==="dias"?{...pr,type:"findes"}:pr), off=((daysBetween(t.anchor,d)%14)+14)%14;
    if(off>=t.len)return false;
    if(meal&&off===0&&t.arrive==="cena"&&meal==="comida")return false;
    if(meal&&off===t.len-1&&t.leave==="comida"&&meal==="cena")return false;
    return true;
  }
  return false;
}
// Frase que resume el turno, para enseñarla en el asistente y el perfil
function turnText(k){
  const pr0=k.presence||{},pr=pr0.type==="dias"&&pr0.findes?{...pr0,type:"findes"}:pr0;if(pr.type!=="alternas"&&pr.type!=="findes")return "";
  const t=turnInfo(pr),last=addDays(t.anchor,t.len-1);
  return `${pr0.type==="dias"&&(pr0.days||[]).length?"Además de "+pr0.days.slice().sort().map(i=>DAYS[i].toLowerCase()).join(", ")+", e":"E"}stá contigo del ${DAYS[dow(t.anchor)].toLowerCase()} (${t.arrive==="cena"?"cena":"comida"}) al ${DAYS[dow(last)].toLowerCase()} (${t.leave==="cena"?"cena":"comida"}), ${pr.type==="findes"?"fines de semana alternos":"semanas alternas"}. Próximo turno: ${shortDate(nextTurn(t))}.`;
}
function nextTurn(t){const off=((daysBetween(t.anchor,todayISO())%14)+14)%14;return addDays(todayISO(),off<t.len?-off:14-off)}
const kidPresentByRule=presentByRule;
// Quién está un día: lo que diga su horario, salvo que ese día lo hayas cambiado
function peopleAt(d,meal){
  const o=(S.days[d]||{}).kids||{};
  // Marcar a mano que alguien está un día no cambia qué comidas hace en casa (salvo un cambio planificado)
  // El cambio de un día puede ser sí/no o, por comidas, {comida:bool, cena:bool} («ese día solo viene a cenar»)
  return S.people.filter(k=>{if(k.id==="yo")return true;const ov=o[k.id];if(ov==null)return presentByRule(k,d,meal);
    if(typeof ov==="object"){if(!meal)return !!(ov.comida||ov.cena);return ov[meal]!=null?!!ov[meal]:presentByRule(k,d,meal)}
    if(!ov)return false;const ch=changeFor(k,d,meal);return ch&&ch.with?true:!eatsAway(k,d,meal)});
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
// Una semana a caballo entre dos meses es del mes en que empieza (el lunes), igual que su presupuesto y su compra
const _prefMonth={};
const monthPrefs=d=>{if(!S.monthPrep)return null;const k=String(d).slice(0,10);return S.monthPrep[_prefMonth[k]||(_prefMonth[k]=monthOfWeek(weekStartFor(k)))]||null};
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
  const slots=[],wk=S.plans[start],today=todayISO();
  for(const d of weekDates(start)){
    if(S.home.start&&d<S.home.start)continue;   // antes de empezar el plan no se planifica
    for(const meal of ["comida","cena"]){
      if(meal==="comida"&&S.home.startFrom==="cena"&&d===S.home.start)continue;   // empezó por la tarde: ese día solo la cena
      const st=mealState(d,meal);
      // Lo ya pasado no cambia: si después cambia la semana tipo, ese día se cocinó igual (salvo que se dijera a mano que no)
      if(st!=="cocinar"&&st!=="solotaper"){const v=d<today&&wk&&wk.slots[d+"|"+meal];
        if(v&&v.p!=null&&RX[v.recipe]&&!(S.days[d]||{})[meal])slots.push({id:d+"|"+meal,date:d,meal,eaters:[],kids:[],tupper:[],fixed:null,need:{carbs:false,prot:false,noHeavy:false,why:[]},guests:0,portions:v.p,past:true});
        continue}
      const ks=st==="solotaper"?[]:kidsAt(d,meal);
      const as=st==="solotaper"?[]:adultsAt(d,meal);
      // Táper para el día siguiente: los adultos que estén y se lleven táper
      const tupper=meal==="cena"&&mealState(addDays(d,1),"comida")==="taper"?adultsAt(addDays(d,1),"comida"):[];   // tú y quien come en casa ese mediodía (la abuela que está siempre) comen del táper
      if(st==="solotaper"&&!tupper.length)continue;
      const f=st==="solotaper"?null:fixedFor(d,meal);
      const slot={id:d+"|"+meal,date:d,meal,eaters:as,kids:ks,tupper,fixed:f};
      slot.need=f&&f.capricho?{carbs:false,prot:false,noHeavy:false,why:[]}:needsFor(slot);
      slot.guests=st==="solotaper"?0:guestsAt(d,meal);
      slot.portions=Math.round((as.concat(tupper).reduce((t,a)=>t+adultFactor(a,slot),0)+ks.reduce((t,k)=>t+kidFactor(k,slot),0)+slot.guests)*100)/100;
      // Al pasar el día se guardan sus raciones (v.p): si luego cambia la familia, lo ya comido no se reescribe
      if(d<today&&wk){const v=wk.slots[slot.id];if(v&&RX[v.recipe]){if(v.p==null)v.p=slot.portions;else slot.portions=v.p}}
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
    if(mealState(d,"comida")!=="taper"||(S.home.start&&d<S.home.start))continue;
    const prev=addDays(d,-1), st=mealState(prev,"cena");
    // La víspera del primer día del plan no hay cena planificada (no hay táper aunque la semana tipo diga que se cocina)
    if((st!=="cocinar"&&st!=="solotaper")||(S.home.start&&prev<S.home.start))out.push(d);
  }
  return out;
}
/* ---------- Lo que ya pasó no se toca ----------
   Días anteriores a hoy, la comida o cena de hoy si ya es su hora, lo que ya se cocinó y lo que ya se ha contestado («¿qué tal?»).
   Rehacer el menú, ajustarlo al presupuesto o aplicar medidas nunca cambia estos huecos. */
// Hasta qué día está comprado lo fresco: hasta la víspera de la próxima compra semanal que aún no se ha hecho.
// Lo de esos días no se rehace (ni al cambiar el presupuesto): se compró para esos platos
let boughtMemo={k:null,v:null};
function boughtUntil(){
  const k=S.updatedAt+"|"+todayISO();if(boughtMemo.k===k)return boughtMemo.v;
  const today=todayISO();let v=addDays(today,-1);
  boughtMemo={k,v};   // mientras se calcula (la compra mira los platos), nada se da por comprado
  try{let m=today.slice(0,7);
    for(let n=0;n<2;n++,m=nextMonthOf(m)){const sh=shopping(m,true),ws=sh.weeks;
      for(let i=0;i<ws.length;i++){const l=sh.lists[i];if(!l||(ws[i].slice(0,7)!==m&&i>0))continue;
        // Cada compra cubre hasta la víspera de la siguiente (aunque su semana ya haya pasado: la del lunes es de la semana anterior)
        const nx=ws[i+1]?deliveryDate(ws[i+1]):deliveryDate(addDays(ws[i],7)),end=addDays(nx,-1);if(end<today)continue;
        const done=l.items.length&&shopIsDone(m,l);
        if(!done){boughtMemo={k,v};return v}
        v=[v,end].sort()[1]}}}catch(e){}
  boughtMemo={k,v};return v;
}
const slotBought=id=>id.slice(0,10)>=todayISO()&&id.slice(0,10)<=boughtUntil();
// Los días de antes de la primera compra del plan: lo fresco de esos días no lo trae ninguna lista (se come lo que haya en casa)
let fsMemo={k:null,v:null};
const firstShopDay=()=>{const k=S.home.start+"|"+((S.home.shop||{}).delivery);if(fsMemo.k!==k)fsMemo={k,v:S.home.start?deliveryDate(weekStartFor(S.home.start)):null};return fsMemo.v};
const preShop=d=>!!S.home.start&&d>=S.home.start&&d<(firstShopDay()||d);
// ¿Lo de este hueco ya no lo trae ninguna compra por hacer? (ya está comprado o es antes de la primera compra)
// Esos huecos no se rehacen; si hay que cambiarlos, el plato sale de lo que hay en casa (pickFromHome)
const slotNoShop=id=>slotBought(id)||(id.slice(0,10)>=todayISO()&&preShop(id.slice(0,10)));
// «Aún no has comprado: usa lo que tengas»: un hueco de antes de la primera compra sin ningún plato que salga de lo que hay en casa
const casaSlot=v=>!!(v&&v.casa&&v.despensa&&!v.despensa.length);
function slotDone(id){
  const d=id.slice(0,10),t=todayISO(),meal=id.slice(11);if(d<t||(S.cooked||{})[id])return true;if(d>t)return false;
  if((S.meals||{})[id])return true;
  const n=new Date();return n.getHours()*60+n.getMinutes()>=toMin((S.home.mealTimes||{})[meal]||(meal==="comida"?"14:00":"21:00"));
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
/* ---------- Cocinar una vez para varios días ----------
   S.home.repeatMeals = {comida:{days:1|2|3, who:"todas"|"sin"|"con"}, cena:{…}}: cuántos días seguidos se come lo mismo
   y si solo cuando no están los niños (o solo cuando están). El hueco que repite guarda v.rep = id del primero:
   se cocina una vez (en el primero) con las raciones de todos. */
const repRule=meal=>((S.home.repeatMeals||{})[meal])||{days:1,who:"todas"};
const repApplies=sl=>{const r=repRule(sl.meal);if((r.days||1)<2)return false;if(sl.meal==="cena"&&sl.kids.length)return false;if(r.who==="con")return sl.kids.length>0;if(r.who==="sin")return sl.kids.length===0;return true};
/* ---------- Reglas de las cenas ----------
   (a) Con niños: la receta de una cena en la que come algún niño no se repite en toda la semana (lunes a domingo),
       ni seguida ni otro día; las cenas de cuando estás solo sí pueden repetirse (S.home.repeatMeals).
   (b) Una cena repetida nunca cae el día en que al mediodía se come el táper de ese plato, un plato da como mucho
       3 raciones (cena, táper y cena repetida) y la repetida tiene que estar dentro de los días que aguanta en la nevera.
   (c) Seguridad: un plato cocinado nunca se come (táper o repetido) más tarde de los días que aguanta en la nevera (r.fridge). */
const kidDinner=s=>s.meal==="cena"&&s.kids.length>0;
// Días en que se come lo cocinado en un hueco: ese día y, si sale táper, el siguiente
const eatDays=s=>s.tupper.length?[s.date,addDays(s.date,1)]:[s.date];
// ¿Poner la receta rid en el hueco sl rompe la regla (a)?
function kidClash(wk,slots,sl,rid){
  for(const o of slots){if(o.id===sl.id)continue;const v=wk.slots[o.id];if(!v||v.recipe!==rid)continue;
    if((kidDinner(sl)&&(o.meal==="cena"||o.kids.length))||(kidDinner(o)&&(sl.meal==="cena"||sl.kids.length)))return true}
  return false;
}
// ¿Puede el hueco sl repetir el plato cocinado en hid? (reglas a, b y c)
function repeatOk(wk,sl,hid,slots){
  const hv=wk.slots[hid],r=hv&&!hv.rep&&RX[hv.recipe],head=slots.find(s=>s.id===hid);
  if(!r||r.cap||!head||head.fixed||!repApplies(head)||!repApplies(sl)||hid>=sl.id)return false;
  const kids=Object.entries(wk.slots).filter(([id,v])=>v.rep===hid&&id!==sl.id).map(([id])=>slots.find(s=>s.id===id)).filter(Boolean);
  if(1+kids.length>=(repRule(sl.meal).days||1))return false;
  const uses=[head,...kids];
  if(uses.some(u=>eatDays(u).includes(sl.date)))return false;                        // nunca dos veces el mismo día
  if(uses.concat([sl]).reduce((t,u)=>t+eatDays(u).length,0)>3)return false;          // como mucho 3 raciones
  if(daysBetween(cookDayFor(head.date),eatDays(sl).slice(-1)[0])>r.fridge)return false;   // aguanta en la nevera
  if(!slotPeople(sl).every(p=>canEat(p,r)))return false;
  if(sl.kids.length&&!r.kid&&!sl.kids.every(k=>dishPref(k,r.id)>=1))return false;
  return !kidClash(wk,slots,sl,r.id);
}
// Cocinar una vez y repetir: el plato más reciente de los 3 días anteriores de la misma semana que cumpla las reglas
function repeatFrom(wk,sl,slots){
  if(!repApplies(sl)||sl.fixed||mealState(sl.date,sl.meal)!=="cocinar")return null;
  for(let b=1;b<=3;b++){const d=addDays(sl.date,-b);if(weekStartFor(d)!==weekStartFor(sl.date))break;
    const hid=d+"|"+sl.meal;if(repeatOk(wk,sl,hid,slots))return {recipe:wk.slots[hid].recipe,rep:hid}}
  return null;
}
// Repasa la semana: fuera lo que ya no cumple las reglas (sin tocar lo pasado, lo cocinado ni lo elegido a mano)
function rulesSweep(wk,slots){
  let any=false;const free=sl=>{const v=wk.slots[sl.id];return v&&RX[v.recipe]&&!slotDone(sl.id)&&!sl.past};
  for(const sl of slots.slice().reverse()){if(!free(sl))continue;const v=wk.slots[sl.id],r=RX[v.recipe];
    if(v.rep||v.locked||v.despensa||sl.fixed)continue;
    // Lo ya comprado no se cambia por repetir con los niños (se cambia el otro día, que aún no está comprado); por seguridad, sí
    const unsafe=S.home.cookMode!=="lote"&&sl.tupper.length&&r.fridge<1;
    if(unsafe||(kidClash(wk,slots,sl,v.recipe)&&!slotNoShop(sl.id))){delete wk.slots[sl.id];any=true}}
  for(const sl of slots){if(!free(sl))continue;const v=wk.slots[sl.id];if(!v.rep||v.sobra)continue;
    const keep=v;delete wk.slots[sl.id];if(repeatOk(wk,sl,keep.rep,slots)&&wk.slots[keep.rep].recipe===keep.recipe)wk.slots[sl.id]=keep;else any=true}
  return any;
}
// Fallos de las reglas en una semana (para comprobarlas)
function rulesBroken(start){
  const wk=S.plans[start];if(!wk)return [];const slots=buildSlots(start),out=[];
  for(const sl of slots){const v=wk.slots[sl.id],r=v&&RX[v.recipe];if(!r)continue;
    if(kidClash(wk,slots,sl,v.recipe))out.push(["a",sl.id,r.name]);
    if(v.rep){const h=slots.find(s=>s.id===v.rep);if(h&&eatDays(h).includes(sl.date))out.push(["b-día",sl.id,r.name]);
      const uses=slots.filter(s=>s.id===v.rep||(wk.slots[s.id]||{}).rep===v.rep);if(uses.reduce((t,u)=>t+eatDays(u).length,0)>3)out.push(["b-raciones",sl.id,r.name])}
    const head=v.rep?slots.find(s=>s.id===v.rep):sl;
    if(head&&S.home.cookMode!=="lote"&&daysBetween(cookDayFor(head.date),eatDays(sl).slice(-1)[0])>r.fridge)out.push(["c",sl.id,r.name+" ("+r.fridge+" d)"])}
  return out;
}
// Huecos que repiten el plato de este (se cocinan con él) y raciones totales a cocinar
// Los días que comen lo mismo que este hueco (en su semana y, por las sobras de un domingo, en la siguiente)
const repChildren=sl=>{const ws=weekStartFor(sl.date),ids=[];for(const w of [ws,addDays(ws,7)]){const wk=S.plans[w];if(wk)for(const id of Object.keys(wk.slots))if(wk.slots[id].rep===sl.id)ids.push(id)}
  return ids.sort().map(id=>slotFor(id.slice(0,10),id.slice(11))).filter(Boolean)};
const cookPortions=sl=>Math.round((sl.portions+repChildren(sl).reduce((t,c)=>t+c.portions,0))*100)/100;
// En qué tápers se reparte un plato: uno para la comida o cena de ese día (los que comen en casa)
// y uno por persona para el táper del día siguiente
function tupperSplit(sl){
  const out=[], home=sl.eaters.concat(sl.kids);
  if(home.length||sl.guests){const rac=home.reduce((t,p)=>t+(p.kind==="nino"?kidFactor(p,sl):adultFactor(p,sl)),0)+(sl.guests||0);
    out.push({when:`${DAYS[dow(sl.date)]} · ${sl.meal}${S.home.cookMode==="lote"&&!fromBatch(sl)?" (para hoy, sin táper)":""}`,rac:Math.round(rac*100)/100,who:home.map(p=>isMe(p)?"tú":personName(p)).concat(sl.guests?[`${sl.guests} invitados`]:[])})}
  for(const a of sl.tupper)out.push({when:`Táper del ${DAYS[dow(addDays(sl.date,1))].toLowerCase()} · comida`,rac:adultFactor(a,sl),who:[isMe(a)?"tú":personName(a)]});
  for(const c of repChildren(sl))out.push({when:`${DAYS[dow(c.date)]} · ${c.meal} (mismo plato)`,rac:c.portions,who:c.eaters.concat(c.kids).map(p=>isMe(p)?"tú":personName(p))});
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
// candMemo: mientras se rehace el menú, las recetas que encajan en cada tipo de comida no cambian (se piden cientos de veces)
let candMemo=null;
const withCandMemo=f=>{const own=!candMemo;if(own)candMemo={};try{return f()}finally{if(own)candMemo=null}};
// Menú del comedor: si el niño ya comió legumbre (pasta, pescado…) en el cole, su cena no lo repite (si quedan platos; si no, puntúa muy poco)
const cAvoid=slot=>typeof comedorAvoid==="function"?comedorAvoid(slot):null;
function candidates(slot,opts={}){
  let key=null;const av=cAvoid(slot);
  if(candMemo&&!opts.only){const ids=a=>a.map(p=>p.id).join(",");
    key=[ids(slot.eaters),ids(slot.kids),ids(slot.tupper),slot.need&&slot.need.noHeavy?1:0,opts.cap?1:0,S.home.cookMode==="lote"?slot.date+"|"+cookDayFor(slot.date):"",av?av.join(","):""].join("|");
    if(candMemo[key])return candMemo[key].slice()}
  let out=[];
  for(const r of R){
    if(r.small||(r.cap&&!opts.cap)||!variantFor(r)||!hasPhoto(r)||!hasPack(r))continue;
    if(!opts.cap&&diffRank(r.diff)>diffRank(maxDiff()))continue;   // no más difícil de lo que quiere cocinar
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
    // Cocinando cada día: si sale táper para mañana, el plato tiene que aguantar al menos una noche en la nevera (regla c)
    if(S.home.cookMode!=="lote"&&slot.tupper.length&&!(r.fridge>=1))continue;
    if(opts.only&&!opts.only(r))continue;
    out.push(r);
  }
  if(av){const ok=out.filter(r=>!comedorClash(r,av));if(ok.length>=4)out=ok}
  if(key)candMemo[key]=out.slice();
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
  // Niños pequeños: mejor un plato caliente y de los que suelen gustar; en la primera comida del plan, sobre todo
  if(slot.kids.some(k=>(Number(k.age)||8)<10)){const first=slot.date===S.home.start,cold=r.tags.includes("frio")||r.tags.includes("sin_cocinar");
    if(cold)s-=first?6:1.5;if(first&&r.kid)s+=2}
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
  if(slot.meal==="cena"&&slot.kids.length){const av=cAvoid(slot);if(av&&comedorClash(r,av))s-=14}
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
  return {used,hist,counts,mains,lm,oldFrozen,ingUsed,...baseCounts(S.plans[start],exceptId)};
}
/* ---------- Variedad ----------
   Pasta y arroz: como mucho 3 platos de cada uno a la semana y nunca dos de la misma base el mismo día.
   El mismo plato, como mucho una vez cada 2 semanas (salvo que se acepte repetir). Solo se salta si nada más encaja
   o si el presupuesto obliga (y entonces se dice en la semana). Los días que repiten el plato de otro no cuentan. */
const BASE_MAX=3;
function carbBase(r){
  if(r._base!==undefined)return r._base;let b=null;
  for(const [p,q] of r.ing){const x=P[p];if(!x||q<30||!/arroz, legumbres y pasta/i.test(x.sec||""))continue;
    const nm=lowName(x.name);if(/^arroz/.test(nm)){b="arroz";break}if(/^(macarr|espagu|fideo|placas de lasa|pasta|noqui|tallar|penne|tortell)/.test(nm)){b="pasta";break}}
  return r._base=b;
}
const lowName=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
function baseCounts(wk,exceptId){
  const bases={},dayBases={};
  if(wk)for(const [id,v] of Object.entries(wk.slots||{})){if(id===exceptId||v.rep)continue;const r=RX[v.recipe],b=r&&carbBase(r);
    if(b){bases[b]=(bases[b]||0)+1;(dayBases[id.slice(0,10)]=dayBases[id.slice(0,10)]||[]).push(b)}}
  return {bases,dayBases};
}
// ¿Rompe la variedad poner r en este hueco?
function breaksVariety(r,slot,ctx){
  const b=carbBase(r),rep=S.home.repeat||"no";
  if(b&&((ctx.bases[b]||0)>=BASE_MAX||(ctx.dayBases[slot.date]||[]).includes(b)))return true;
  if(rep!=="semana"&&ctx.used.has(r.id))return true;
  return rep==="no"&&ctx.hist[r.id]===1;   // ni la semana anterior ni la siguiente
}
// Cuánto se salta la variedad una semana (platos de más de pasta o arroz y días con dos de la misma base)
function varietyOver(wk){const {bases,dayBases}=baseCounts(wk);return Object.values(bases).reduce((t,n)=>t+Math.max(0,n-BASE_MAX),0)+Object.values(dayBases).reduce((t,a)=>t+a.length-new Set(a).size,0)}
function varietyNote(start){
  const wk=S.plans[start];if(!wk)return "";const {bases,dayBases}=baseCounts(wk),t=[];
  for(const [b,n] of Object.entries(bases))if(n>BASE_MAX)t.push(`${n} platos de ${b}`);
  const dd=Object.values(dayBases).filter(a=>a.length>new Set(a).size).length;if(dd)t.push(`${dd} ${dd===1?"día":"días"} con dos platos de la misma base`);
  return t.join(" y ");
}
function pickFor(slot,ctx){
  let c=candidates(slot);
  if(!c.length)c=candidates({...slot,need:{...slot.need,noHeavy:false}});
  // Si nada encaja, se relaja casi todo (gustos de los niños, pesado, nevera…) menos la dieta y las alergias, que no se saltan nunca;
  // tampoco salen caprichos, platos más difíciles de lo que quieres cocinar ni picante para los niños
  const all=slot.eaters.concat(slot.kids,slot.tupper),young=slot.kids.some(k=>(Number(k.age)||8)<10);
  if(!c.length)c=R.filter(r=>!r.small&&!r.cap&&diffRank(r.diff)<=diffRank(maxDiff())&&!(young&&r.tags.includes("picante"))&&variantFor(r)&&hasPhoto(r)&&hasPack(r)&&all.every(p=>canEat(p,r))&&(S.home.cookMode==="lote"||!slot.tupper.length||r.fridge>=1));
  // Con niños en la cena, su plato no se repite en la semana (regla a): tampoco se relaja
  const start=weekStartFor(slot.date),wk=S.plans[start];
  if(wk){const sls=ctx.slots||(ctx.slots=buildSlots(start));c=c.filter(r=>!kidClash(wk,sls,slot,r.id))}
  if(!c.length)return null;
  {const av=cAvoid(slot);if(av){const ok=c.filter(r=>!comedorClash(r,av));if(ok.length)c=ok}}
  // Variedad: primero lo que no repite ni se pasa de pasta o arroz; si no queda nada, lo que haya
  const v=c.filter(r=>!breaksVariety(r,slot,ctx));if(v.length)c=v;
  let best=null,bs=-1e9;for(const r of c){const s=scoreRecipe(r,slot,ctx);if(s>bs){bs=s;best=r}}
  return best;
}
function addToCtx(ctx,r,slot){ctx.used.add(r.id);if(ctx.ingUsed)for(const [p] of r.ing)ctx.ingUsed.add(p);ctx.counts[r.group]=(ctx.counts[r.group]||0)+1;ctx.mains[r.main]=(ctx.mains[r.main]||0)+1;if(r.red)ctx.counts.red=(ctx.counts.red||0)+1;
  const b=carbBase(r);if(b&&ctx.bases){ctx.bases[b]=(ctx.bases[b]||0)+1;if(slot)(ctx.dayBases[slot.date]=ctx.dayBases[slot.date]||[]).push(b)}}

// Asegura que la semana existe y que todos sus huecos tienen plato (respeta los ya elegidos)
function ensureWeek(start,regen){
  const wk=S.plans[start]=S.plans[start]||{start,slots:{},training:null,confirmed:false,createdAt:todayISO()};
  if(regen){for(const [id,v] of Object.entries(wk.slots))if(!v.locked&&!slotDone(id)&&!slotNoShop(id))delete wk.slots[id];wk.confirmed=false}
  const slots=buildSlots(start),today=todayISO(),isNew=!Object.keys(wk.slots).length;
  let changed=safetySweep(start,slots);
  // Un hueco que repetía el plato de otro, si ese otro ha cambiado, se vuelve a elegir (si no ha pasado ya)
  // (las sobras de algo ya cocinado no: su plato es el que se cocinó)
  for(const [id,v] of Object.entries(wk.slots))if(v.rep&&!v.sobra&&!slotDone(id)&&(!wk.slots[v.rep]||wk.slots[v.rep].recipe!==v.recipe)){delete wk.slots[id];changed=true}
  // Reglas de las cenas (con niños no se repite, repetir solo cuando toca y nada fuera de sus días de nevera)
  if(rulesSweep(wk,slots))changed=true;
  const ctx=makeCtx(start);ctx.slots=slots;
  for(const sl of slots){
    // Días ya pasados: no se rellenan a posteriori (salvo la primera vez que se hace la semana)
    if(sl.date<today&&!isNew)continue;
    if(sl.fixed&&!slotDone(sl.id)){
      const fr=sl.fixed.recipe&&RX[sl.fixed.recipe],cur=wk.slots[sl.id];
      // Un plato fijo que alguien de los que comen ya no puede tomar no se pone: se elige otro
      // Si ese día elegiste otro plato a mano (manual), se respeta
      if(!(fr&&unsafeFor(slotPeople(sl),fr).length)){
        if(fr&&!(cur&&(cur.despensa||(cur.manual&&RX[cur.recipe])))&&(!cur||cur.recipe!==sl.fixed.recipe)){wk.slots[sl.id]={recipe:sl.fixed.recipe,locked:true};changed=true}
        continue;
      }
    }
    const cur=wk.slots[sl.id];
    // «Usa lo que tengas» (antes de la primera compra): si ya sale un plato de lo que hay en casa (lo que dijiste que tenías), se pone
    if(casaSlot(cur)&&!cur.locked&&!slotDone(sl.id)){const x=pickFromHome(sl,ctx,wk,slots,true);if(x&&x.recipe){wk.slots[sl.id]=x;addToCtx(ctx,RX[x.recipe],sl);changed=true}continue}
    if(cur&&(RX[cur.recipe]||cur.despensa))continue;   // con receta o con algo de la despensa
    if(slotDone(sl.id)&&cur)continue;
    // Lo de este día ya no se compra (ya se hizo su compra, o es antes de la primera): un plato con lo que hay en casa
    if(slotNoShop(sl.id)){const x=pickFromHome(sl,ctx,wk,slots);if(x){wk.slots[sl.id]=x;if(x.recipe)addToCtx(ctx,RX[x.recipe],sl);changed=true}continue}
    // Cocinar una vez para varios días: mismo plato que el día anterior si toca
    const rp=repeatFrom(wk,sl,slots);if(rp){wk.slots[sl.id]=rp;changed=true;continue}
    const r=pickFor(sl,ctx);if(!r)continue;
    wk.slots[sl.id]={recipe:r.id};addToCtx(ctx,r,sl);changed=true;
  }
  ensureSmall(start);
  if(safetySweep(start,slots,true)){ensureSmall(start);changed=true}
  return {wk,slots,changed};
}
/* ---------- Días cuya compra ya está hecha (o que van antes de la primera) ----------
   Su fresco ya está en casa (o no lo trae nadie): si hay que poner un plato, sale de lo que hay (despensa, nevera, congelador).
   Si no sale ninguno: antes de la primera compra, «Aún no has comprado: usa lo que tengas»; si ya se compró, el que menos falta,
   y lo que falta va a la próxima compra por hacer (y se dice en el Menú) */
let homeNotes=[];
// Lo que hay en casa para un hueco: la despensa menos lo que piden los demás platos que ya no traerá ninguna compra
// (los de días ya comprados o de antes de la primera compra y, de la despensa y el congelador, los del mes si su pedido ya se hizo).
// Lo de los demás días lo traen sus compras, que se recalculan con lo que haya en casa (null si no se puede mirar)
function homeInv(sl){
  let st;try{st=despensaState().stock}catch(e){return null}
  const today=todayISO(),f=firstShopDay(),until=[boughtUntil(),f?addDays(f,-1):today].sort()[1],inv={...st},mes={};
  const mesDone=m=>{if(!(m in mes)){let x=false;try{const sh=shopping(m,true);x=!!sh.lists.mes.items.length&&shopIsDone(m,sh.lists.mes)}catch(e){}mes[m]=x}return mes[m]};
  try{for(const u of upcomingUses(today,addDays(today,35),sl.id))if(u.date<=until||(P[u.pid].keep!=="fresco"&&mesDone(u.date.slice(0,7))))inv[u.pid]=(inv[u.pid]||0)-u.q}catch(e){return null}
  return inv;
}
function pickFromHome(sl,ctx,wk,slots,onlyFull){
  const inv=homeInv(sl)||{};
  const c=candidates(sl).filter(r=>!kidClash(wk,slots,sl,r.id)),best=pool=>{let b=null,bs=-1e9;for(const r of pool){const s=scoreRecipe(r,sl,ctx);if(s>bs){bs=s;b=r}}return b};
  const full=c.filter(r=>!missingFor(r,sl,inv).length);
  if(full.length){const v=full.filter(r=>!breaksVariety(r,sl,ctx));return {recipe:best(v.length?v:full).id}}
  if(onlyFull)return null;
  if(!slotBought(sl.id))return {despensa:[],casa:true};
  // Ya comprado y no sale nada entero: lo que menos falta (cada cosa que falta pesa como un plato peor)
  let b=null;for(const r of c){const s=scoreRecipe(r,sl,ctx)-5*missingFor(r,sl,inv).length;if(!b||s>b.s)b={s,r}}
  if(!b)return null;
  const miss=shopForChange(sl,b.r.id,inv);
  if(miss.length&&!homeNotes.some(n=>n.id===sl.id))homeNotes.push({id:sl.id,d:sl.date,meal:sl.meal,name:b.r.name,miss});
  return {recipe:b.r.id};
}
// Un plato nuevo en un día ya comprado: lo que no hay en casa se añade a la próxima compra por hacer. Devuelve sus nombres
function shopForChange(sl,rid,inv){
  const r=RX[rid];if(!r||!slotNoShop(sl.id))return [];inv=inv||homeInv(sl)||{};
  const need=slotIng(r,sl).map(([pid,q])=>({pid,q:q-Math.max(0,inv[pid]||0)})).filter(x=>x.q>Math.max(dpEps(x.pid),P[x.pid].env*.05));
  if(!need.length)return [];
  const x=typeof nextOpenList==="function"?nextOpenList():null;if(!x)return need.map(n=>P[n.pid].name.toLowerCase());
  S.extraBuy=S.extraBuy||{};const L=(S.extraBuy[x.m]=S.extraBuy[x.m]||{})[x.key]=S.extraBuy[x.m][x.key]||{};
  for(const n of need)L[n.pid]=(L[n.pid]||0)+n.q;
  return need.map(n=>P[n.pid].name.toLowerCase());
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
  if(isBaby(p)){const b=r.ing.find(([pid])=>babyNo(pid));if(b)return P[b[0]].name.toLowerCase()+" (menores de 3 años)"}
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
  const o=((S.days[d]||{}).kids||{})[p.id],mm=m==="merienda"?"cena":"comida";if(o!=null&&typeof o!=="object")return o;if(o&&o[mm]!=null)return !!o[mm];
  const k={...p,away:null};return presentByRule(k,d,m==="merienda"?"cena":"comida");
}
function smallEaters(d,m){
  // Días fuera de casa (vacaciones, «días fuera» al preparar el mes): ni desayunos ni meriendas para nadie, tampoco los niños
  const o=S.days[d]||{};if(o.away||(o.comida==="fuera"&&o.cena==="fuera"))return [];
  return S.people.filter(p=>smallState(p,m,d)!=="no"&&presentSmall(p,d,m)&&!(m!=="merienda"&&o.comida==="fuera"&&p.id==="yo"));
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
    if(d<todayISO()&&wk.small[d])continue;   // lo ya pasado no se toca
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

function genWeekFromScratch(start,nTries=6){
  // Varios intentos; se sortea entre los mejores (equilibrio y precio) para no repetir siempre el mismo
  const tries=[];
  const keep=S.plans[start]?{...S.plans[start]}:null;
  for(let t=0;t<nTries;t++){
    // Se quedan los elegidos a mano, lo que ya pasó (días anteriores, lo de hoy si ya es la hora, lo cocinado) y lo ya comprado
    S.plans[start]=keep?{...keep,slots:JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(keep.slots||{}).filter(([id,v])=>v.locked||slotDone(id)||slotNoShop(id)))))}:{start,slots:{},training:null,confirmed:false,createdAt:todayISO()};
    const {wk,slots}=ensureWeek(start);
    // Coste real de la semana (paquetes enteros de lo fresco): así se nota el ahorro de compartir ingredientes
    const cost=weekCost(start), rep=S.home.repeat||"no";
    const bal=balanceOf(wk);
    const packs=Object.values(wk.slots).filter(v=>RX[v.recipe]&&RX[v.recipe].pack&&hasPack(RX[v.recipe])).length;
    const sc=bal*(rep==="semana"?1:2)-cost/(rep==="no"?8:3)+Math.min(packs,2)*1.2;
    tries.push({sc,slots:JSON.parse(JSON.stringify(wk.slots))});
  }
  tries.sort((a,b)=>b.sc-a.sc);
  S.plans[start].slots=tries[Math.floor(Math.random()*Math.min(3,tries.length))].slots;
  // Comidas pequeñas: se rehacen las que no se eligieron a mano
  const sm=S.plans[start].small||{};for(const d of Object.keys(sm))if(d>=todayISO())for(const m of Object.keys(sm[d]))if(!sm[d][m].locked)delete sm[d][m];
  ensureSmall(start);
  S.plans[start].budget=fitBudget(start);
}
/* ---------- Presupuesto ---------- */
// Coste aproximado de la comida de una semana (raciones x precio; la lista real redondea a envases)
// Lo fresco y lo congelado se cuenta en paquetes enteros (se compra para la semana); la despensa, solo lo que se gasta
function weekCost(start,slotsIn){
  const wk=S.plans[start];if(!wk)return 0;let t=0;const q={};
  for(const sl of slotsIn||buildSlots(start)){const v=wk.slots[sl.id],r=v&&RX[v.recipe];
    if(r)for(const [p,c] of slotIng(r,sl))q[p]=(q[p]||0)+c;else if(sl.fixed&&!sl.fixed.recipe&&!(v&&v.despensa))t+=Number(sl.fixed.cost)||0}
  for(const [d,dd] of Object.entries(wk.small||{}))for(const [m,v] of Object.entries(dd)){const r=RX[v.recipe];if(r)for(const [p,c] of r.ing)q[p]=(q[p]||0)+c*smallPortions(d,m)}
  for(const [p,c] of Object.entries(q))t+=P[p].keep==="despensa"?c/P[p].env*price(p):packsFor(p,c)*price(p);
  return Math.round(t*100)/100;
}
// Lo que se puede gastar en comida esa semana: presupuesto semanal menos envío y la parte de básicos.
// raw: la parte del presupuesto que le toca a la semana, sin el apretón interno (tscale); es la que se enseña
function weekFoodTarget(start,raw){
  const m=monthOfWeek(start), n=Math.max(1,weeksInMonth(m).length);
  // Sin presupuesto fijado (alta nueva): sin tope; se propone lo razonable y luego se dice lo que cuesta
  if(!Number(S.home.budget.month)&&!Number(S.home.budget.week)&&!Number(((S.monthPrep||{})[m]||{}).budget))return Infinity;
  const fee=tarifa(S.home.shop.weekMode).envio, monthFee=tarifa(S.home.shop.monthMode).envio/n;
  // tscale: cuánto se aprietan las semanas para que la compra real del mes (con la despensa en paquetes enteros) quepa
  return (weekBudget(m)-fee-monthFee-(Number(S.home.budget.basics)||0)/n)*(raw?1:(((S.home.tscale||{})[m])||1));
}
// Cambia los platos más caros por otros más baratos que sigan encajando, hasta llegar al presupuesto
function fitBudget(start){
  const wk=S.plans[start];if(!wk)return {ok:true};
  const target=weekFoodTarget(start), slots=buildSlots(start);
  const ownMemo=!priceMemo;if(ownMemo)priceMemo={};
  // Por cada comida, sus alternativas con su coste y su puntuación: se calculan una sola vez
  const info={};
  const getInfo=sl=>{if(info[sl.id])return info[sl.id];const ctx=makeCtx(start,sl.id);ctx.noise=0;
    const list=candidates(sl).map(r=>({r,rc:rationCost(r)*sl.portions,sc:scoreRecipe(r,sl,ctx)}));
    return info[sl.id]={ctx,list,by:Object.fromEntries(list.map(x=>[x.r.id,x]))}};
  // Solo se cambia lo que se puede cambiar: ni lo elegido a mano, ni los fijos, ni lo que ya pasó o ya se cocinó
  const free=x=>{const v=wk.slots[x.id];return v&&!v.locked&&!v.rep&&!x.fixed&&!x.past&&!slotDone(x.id)&&!slotNoShop(x.id)&&!Object.values(wk.slots).some(y=>y.rep===x.id)};
  // relaxed: el presupuesto ha obligado a saltarse la variedad (se mantiene mientras la semana siga saltándosela)
  const rep=S.home.repeat||"no",sameWeekOk=rep==="semana";let relaxed=!!(wk.budget&&wk.budget.relaxed&&varietyOver(wk)>0);
  // Primero sin saltarse la variedad (pasta/arroz y repetir platos); si así no se llega, se salta y se avisa (relaxed)
  const search=(cost,strict)=>{
    const used=new Set(Object.values(wk.slots).map(v=>v.recipe)),over=strict?varietyOver(wk):0,bc=baseCounts(wk);
    let best=null;const pre=[];
    for(const sl of slots){
      if(!free(sl))continue;const cur=RX[wk.slots[sl.id].recipe];if(!cur)continue;
      // Lo que se ha pedido para este mes (más de algo, o repetir un plato) no se cambia por ahorrar
      {const mp=monthPrefs(sl.date);if(mp&&((mp.favs||[]).includes(cur.id)||(mp.more||[]).some(k=>prefMatch[k]&&prefMatch[k](cur))))continue}
      if(cur.pack&&hasPack(cur))continue;   // lo que has desbloqueado en la tienda tampoco
      const I=getInfo(sl),curS=I.by[cur.id]?I.by[cur.id].sc:scoreRecipe(cur,sl,I.ctx),cc=rationCost(cur)*sl.portions;
      for(const x of I.list){if(x.r.id===cur.id||(!sameWeekOk&&used.has(x.r.id))||kidClash(wk,slots,sl,x.r.id))continue;
        if(strict&&rep==="no"&&I.ctx.hist[x.r.id]===1)continue;   // ni el plato de la semana anterior o la siguiente
        if(strict){const b=carbBase(x.r);if(b&&b!==carbBase(cur)&&((bc.bases[b]||0)>=BASE_MAX||(bc.dayBases[sl.date]||[]).includes(b)))continue}
        // Si se puede repetir en la semana, un plato que ya está ahorra aunque la ración no sea más barata (comparte paquetes)
        const est=cc-x.rc+(sameWeekOk&&used.has(x.r.id)?x.rc*0.6:0);if(est<=0.2)continue;
        const loss=Math.max(0,curS-x.sc);pre.push({est:est/(1+loss*0.6),loss,sl,rid:x.r.id})}
    }
    // Los mejores se calculan de verdad (coste de la semana con el cambio: cuenta los paquetes que se comparten),
    // de 14 en 14; y si el plato sale varias veces, también cambiándolas todas a la vez
    // (solo en los días en que ese plato también encaja: niños, picante, gustos, dificultad…)
    pre.sort((a,b)=>b.est-a.est);
    for(let from=0;from<pre.length&&from<42&&!best;from+=14)for(const c of pre.slice(from,from+14)){
      const curId=wk.slots[c.sl.id].recipe;
      const group=slots.filter(x=>free(x)&&wk.slots[x.id].recipe===curId&&getInfo(x).by[c.rid]);
      for(const ids of group.length>1&&!group.some(kidDinner)?[[c.sl],group]:[[c.sl]]){
        const prev=ids.map(x=>wk.slots[x.id]);ids.forEach(x=>wk.slots[x.id]={recipe:c.rid});const ov=strict?varietyOver(wk):0,after=strict&&ov>over?null:weekCost(start,slots);ids.forEach((x,k)=>wk.slots[x.id]=prev[k]);
        if(after==null)continue;
        const save=cost-after;if(save<=0.3)continue;
        const val=save/(1+c.loss*0.6*ids.length);
        if(!best||val>best.val)best={val,ids:ids.map(x=>x.id),rid:c.rid}}}
    return best;
  };
  try{
  // Con presupuesto se apura de verdad: se siguen cambiando platos mientras alguno abarate la semana
  for(let it=0;it<60;it++){
    const cost=weekCost(start,slots);if(cost<=target)return {ok:true,cost,target,relaxed};
    // Cuando ya no queda ningún cambio que respete la variedad, se deja de buscarlo (no vuelve a aparecer al abaratar)
    let best=relaxed?null:search(cost,true);if(!best){best=search(cost,false);if(best)relaxed=true}
    if(!best)return {ok:false,cost,target,relaxed};
    for(const id of best.ids)wk.slots[id]={recipe:best.rid};
  }
  const cost=weekCost(start,slots);return {ok:cost<=target,cost,target,relaxed};
  }finally{if(ownMemo)priceMemo=null}
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
function redoFromToday(){return withCandMemo(redoFromToday_)}
function redoFromToday_(){
  const today=todayISO(),cur=weekStartFor(today);
  // Se rehace desde cero: el apretón anterior (tscale) se vuelve a calcular con el menú nuevo
  if(S.home.tscale)for(const m of budgetMonths())delete S.home.tscale[m];
  for(const s of Object.keys(S.plans).sort()){if(addDays(s,6)<today)continue;const wk=S.plans[s];
    if(s>cur&&s>boughtUntil()){genWeekFromScratch(s);continue}
    // Lo de hoy que ya se ha comido o cocinado tampoco se rehace
    for(const [id,v] of Object.entries(wk.slots))if(id.slice(0,10)>=today&&!v.locked&&!slotDone(id)&&!slotNoShop(id))delete wk.slots[id];
    for(const [d,dd] of Object.entries(wk.small||{}))if(d>today)for(const [m,v] of Object.entries(dd))if(!v.locked)delete dd[m];
    ensureWeek(s);wk.budget=fitBudget(s)}
  ensureHorizon();
  if(budgetSet())for(const m of budgetMonths())fitMonthBudget(m);
  save();
}
// Ajusta un mes entero a su presupuesto: si la compra real (con la despensa) se pasa, aprieta las semanas (tscale) y vuelve a probar.
// Siempre se prueba primero sin apretar, y si hace falta se busca el apretón más suave que cabe: si sube el presupuesto, se recupera
function fitMonthBudget(m){
  if(!budgetSet())return;const ts=S.home.tscale=S.home.tscale||{},today=todayISO(),cur=weekStartFor(today);
  const ws=weeksInMonth(m).filter(s=>S.plans[s]&&addDays(s,6)>=today);
  const fits=()=>shopping(m).total<=monthBudget(m)+0.5;
  const refit=x=>{ts[m]=x;for(const s of ws)S.plans[s].budget=fitBudget(s)};
  const snap=()=>JSON.stringify(ws.map(s=>S.plans[s].slots)),back=j=>JSON.parse(j).forEach((sl,i)=>{S.plans[ws[i]].slots=sl});
  refit(1);if(fits())return;
  const base=snap();refit(0.01);
  if(!fits()){
    // Ni apretando del todo cabe: lo más barato posible (nunca se salta la dieta, las alergias ni lo elegido a mano).
    // Según cómo empiece, el ajuste se queda en un punto u otro: se prueban varios menús y se queda el más barato
    for(const s of ws)if(s>cur&&weekCost(s)>weekFoodTarget(s)+0.5)bestOfRestarts(s,2);
    return}
  // Cabe apretando: búsqueda binaria del apretón más suave que cabe, empezando cada vez desde el mismo menú (el ajuste solo abarata)
  let lo=0.01,hi=1,ok={x:0.01,j:snap(),b:ws.map(s=>S.plans[s].budget)};
  for(let i=0;i<5;i++){const mid=Math.round((lo+hi)/2*1000)/1000;back(base);refit(mid);
    if(fits()){ok={x:mid,j:snap(),b:ws.map(s=>S.plans[s].budget)};lo=mid}else hi=mid}
  back(ok.j);ts[m]=ok.x;ws.forEach((s,i)=>{S.plans[s].budget=ok.b[i]});
}
function bestOfRestarts(s,n){
  let best={cost:weekCost(s),slots:JSON.stringify(S.plans[s].slots),small:JSON.stringify(S.plans[s].small||{})};
  for(let i=0;i<n;i++){genWeekFromScratch(s,3);const c=weekCost(s);if(c<best.cost-0.01)best={cost:c,slots:JSON.stringify(S.plans[s].slots),small:JSON.stringify(S.plans[s].small||{})}}
  S.plans[s].slots=JSON.parse(best.slots);S.plans[s].small=JSON.parse(best.small);S.plans[s].budget=fitBudget(s);
}
// ¿Se cumple el presupuesto del mes? Si no, se guarda lo más ajustado que se ha podido y por qué (se enseña en el Menú)
const budgetMonths=()=>{const m=(S.home.start&&S.home.start>todayISO()?S.home.start:todayISO()).slice(0,7),[y,mo]=m.split("-").map(Number);return [m,mo===12?`${y+1}-01`:`${y}-${String(mo+1).padStart(2,"0")}`]};
function checkBudget(){
  if(!budgetSet()){delete S.budgetInfo;save();return}
  S.budgetInfo={};for(const m of budgetMonths())checkBudgetMonth(m);save();
}
function checkBudgetMonth(m){
  const sh=shopping(m),cost=Math.round(sh.total),budget=Math.round(monthBudget(m));
  const ws=activeWeeks(m).filter(s=>S.plans[s]);let meals=0,rac=0,food=0;
  for(const s of ws){food+=weekCost(s);for(const sl of buildSlots(s))if(S.plans[s].slots[sl.id]){meals++;rac+=sl.portions}}
  S.budgetInfo[m]={m,cost,budget,ok:cost<=budget+1,meals:Math.round(meals/Math.max(1,ws.length)),perRac:rac?food/rac:0,
    leftover:Object.values(sh.lists).reduce((t,l)=>t+l.items.filter(it=>P[it.pid].keep==="despensa").reduce((u,it)=>u+Math.max(0,it.packs*P[it.pid].env-it.q)/P[it.pid].env*price(it.pid),0),0),
    basics:Number(S.home.budget.basics)||0,fees:Object.values(sh.lists).reduce((t,l)=>t+l.fee,0),extras:sh.extrasTotal||0,recur:sh.recurTotal||0,at:todayISO()};
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
function ensureHorizon(){return withCandMemo(ensureHorizon_)}
function ensureHorizon_(){
  const today=todayISO(), from=S.home.start&&S.home.start>today?S.home.start:today;
  const base=parseISO(from), end=iso(new Date(base.getFullYear(),base.getMonth()+(from===today?2:1),0));
  let s=weekStartFor(from),n=0;
  while(s<=end&&n<12){if(!S.plans[s]||!Object.keys(S.plans[s].slots||{}).length)genWeekFromScratch(s);s=addDays(s,7);n++}
}

/* ---------- Alternativas para cambiar un plato ---------- */
function alternatives(slot,n=6){
  const start=weekStartFor(slot.date);
  const ctx=makeCtx(start,slot.id);ctx.noise=0.3;
  const inv=slotNoShop(slot.id)?homeInv(slot):inventory(monthOfWeek(start),slot.id);   // ya comprado: lo que hay en casa para ese día
  if(inv)ctx.have=r=>{const m=missingFor(r,slot,inv);return 1-m.length/Math.max(1,r.ing.length)};
  const cur=(S.plans[start]&&S.plans[start].slots[slot.id]||{}).recipe,wk=S.plans[start],sls=wk?buildSlots(start):[];
  // Si lo de ese día ya está comprado (o aún no hay compra), primero lo que sale de lo que hay en casa
  const home=slotNoShop(slot.id),nm=x=>home&&x.miss?x.miss.length:0;
  return candidates(slot).filter(r=>r.id!==cur&&!(wk&&kidClash(wk,sls,slot,r.id))).map(r=>({r,s:scoreRecipe(r,slot,ctx),miss:inv?missingFor(r,slot,inv):null}))
    .sort((a,b)=>nm(a)-nm(b)||b.s-a.s).slice(0,n);
}
function missingFor(r,slot,inv){return r.ing.filter(([pid,q])=>(inv[pid]||0)<q*slot.portions-1).map(([pid])=>pid)}
function setSlotRecipe(slot,rid){
  const start=weekStartFor(slot.date);const wk=S.plans[start];
  // Elegido a mano: deja de repetir el plato de otro día (los días que lo repetían se rehacen solos)
  // manual: lo has elegido tú (también manda sobre un plato fijo); p: raciones ya guardadas de un día pasado
  // Si ese día ya está comprado (o va antes de la primera compra), lo que falta para el plato nuevo va a la próxima compra.
  // Devuelve lo que se ha añadido (para decirlo)
  const old=wk.slots[slot.id],miss=slotDone(slot.id)?[]:shopForChange(slot,rid);wk.slots[slot.id]={recipe:rid,locked:true,manual:true,...(old&&old.p!=null?{p:old.p}:{})};
  // Los días que repetían el plato de antes ya no tienen qué repetir: se eligen otra vez ya (no al abrir la app mañana)
  if(!old||old.recipe!==rid)for(const w of [start,addDays(start,7)]){const wx=S.plans[w];if(!wx)continue;let ch=false;
    for(const [id,v] of Object.entries(wx.slots))if(v.rep===slot.id&&!v.sobra&&!slotDone(id)){delete wx.slots[id];ch=true}
    if(ch)ensureWeek(w)}
  save();
  return miss;
}
// Pasa el plato de un hueco al siguiente, y así sucesivamente (el último se descarta). Se mueve el hueco entero
// (bloqueo incluido); los que no se pueden mover (fijos, elegidos a mano, de la despensa, ya cocinados o pasados) se saltan
function shiftForward(start,fromId){
  const wk=S.plans[start];
  const movable=s=>{const v=wk.slots[s.id];return !s.fixed&&!s.past&&!slotDone(s.id)&&!(v&&(v.locked||v.despensa))};
  const slots=buildSlots(start).filter(s=>s.id===fromId||(s.id>fromId&&movable(s)));
  const i=slots.findIndex(s=>s.id===fromId);if(i<0)return;
  const take=v=>{const x=JSON.parse(JSON.stringify(v));delete x.rep;delete x.p;return x};
  for(let j=slots.length-1;j>i;j--){const a=wk.slots[slots[j-1].id];if(a)wk.slots[slots[j].id]=take(a);else delete wk.slots[slots[j].id]}
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
  // Si la cena de la víspera no se cocinó (comiste fuera, no hiciste nada u otra cosa), no hay táper
  if(meal==="comida"&&st==="taper"&&!(S.cooked||{})[sid]&&["fuera","nada","otro"].includes(((S.meals||{})[sid]||{}).status))return {state:st,sinTaper:true};
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
