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
function kidPresentByRule(k,d){
  const pr=k.presence||{type:"siempre"}, w=dow(d);
  if(pr.type==="siempre")return true;
  if(pr.type==="manual")return false;
  if(pr.type==="dias")return (pr.days||[]).includes(w);
  const anchor=mondayOf(pr.anchor||todayISO());
  const even=((Math.round(daysBetween(anchor,mondayOf(d))/7)%2)+2)%2===0;
  if(pr.type==="alternas")return even;
  if(pr.type==="findes")return even&&(w>=5||w===4);   // viernes (cena), sábado y domingo
  return false;
}
function kidsAt(d){
  const o=(S.days[d]||{}).kids||{};
  return kids().filter(k=>o[k.id]!=null?o[k.id]:kidPresentByRule(k,d));
}
function mealState(d,meal){
  const o=S.days[d]||{};
  if(o[meal])return o[meal];
  let st=S.home.weekTpl[dow(d)][meal];
  // Festivo con los niños en casa: se cocina la comida y la cena
  if(isHoliday(d)&&kidsAt(d).length){if(meal==="comida"&&st!=="fuera")st="cocinar";if(meal==="cena"&&st==="libre")st="cocinar"}
  return st;
}
function fixedFor(d,meal){
  const ks=kidsAt(d).length;
  return S.fixed.find(f=>f.dow===dow(d)&&f.meal===meal&&(f.who==="todas"||(f.who==="con"&&ks)||(f.who==="sin"&&!ks)))||null;
}

/* ---------- Entrenos ---------- */
// Sesiones de un día: las de la semana (si se han ajustado al planificar) o la semana habitual
function sessionsOn(d){
  const wk=S.plans[weekStartFor(d)];
  if(wk&&wk.training&&wk.training[d])return wk.training[d];
  const out=[];for(const a of adults())if(a.trains)for(const s of (a.train[dow(d)]||[]))out.push(s);
  return out;
}
const sessLabel=s=>(SPORTS[s.type]||s.type).toLowerCase()+(s.when==="manana"?" por la mañana":" por la tarde");
// Qué necesita un plato según los entrenos de alrededor
function needsFor(slot){
  const d=slot.date, out={carbs:false,prot:false,noHeavy:false,why:[]};
  if(slot.meal==="cena"){
    const sD=sessionsOn(d), sN=slot.tupper.length?sessionsOn(addDays(d,1)):[];
    if(sN.length){out.carbs=true;out.why.push("mañana entrenas: "+sN.map(sessLabel).join(" y "))}
    const pmD=sD.filter(s=>s.when==="tarde");
    if(pmD.length){out.prot=true;out.why.push("recuperación de "+pmD.map(s=>SPORTS[s.type].toLowerCase()).join(" y "));if(pmD.some(s=>ENDURANCE.has(s.type)))out.carbs=true}
    if(sN.some(s=>s.when==="manana"))out.prot=true;
    if(sN.some(s=>ENDURANCE.has(s.type))){out.noHeavy=true}
    if(sN.length>=2){out.prot=true;out.why.push("día doble")}
  }else{
    const sD=sessionsOn(d);
    if(sD.length){out.carbs=true;out.why.push("hoy entrenas: "+sD.map(sessLabel).join(" y "))}
    if(sD.some(s=>s.when==="tarde"&&ENDURANCE.has(s.type)))out.noHeavy=true;
    if(sD.some(s=>s.when==="manana"))out.prot=true;
  }
  return out;
}

/* ---------- Huecos de la semana ---------- */
function adultFactor(a,slot){
  let f=Number(a.factor)||1;
  if(a.goals.includes("musculo"))f+=0.15;
  if(a.goals[0]==="adelgazar")f-=0.1;
  if(slot&&slot.need&&slot.need.why.includes("día doble"))f+=0.1;
  return Math.round(f*100)/100;
}
// Calcula los huecos (comidas que se cocinan) de una semana a partir de la semana tipo y los cambios
function buildSlots(start){
  const slots=[];
  for(const d of weekDates(start)){
    for(const meal of ["comida","cena"]){
      const st=mealState(d,meal);
      if(st!=="cocinar"&&st!=="solotaper")continue;
      const ks=st==="solotaper"?[]:kidsAt(d);
      const as=st==="solotaper"?[]:adults();
      const tupper=meal==="cena"&&mealState(addDays(d,1),"comida")==="taper"?adults():[];
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
    if(!variantFor(r))continue;
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
  const main=me(), goals=main?main.goals:[];
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
  for(const a of slot.eaters.concat(slot.tupper.filter(t=>!slot.eaters.includes(t))))s+=tasteScore(a,r,lm[a.id]);
  for(const k of slot.kids)s+=0.8*tasteScore(k,r,lm[k.id]);
  // Variedad: no repetir en la semana y cada vez menos penalización hasta 4 semanas atrás;
  // los "bien, pero no a menudo" esperan más
  if(ctx.used.has(r.id))s-=8;
  const ago=ctx.hist[r.id];if(ago!=null)s-=[4.5,3,1.8][ago-1]||0;
  if(slot.eaters.some(a=>isRare(a,r.id))&&ago!=null)s-=5;
  // Equilibrio semanal: algo de legumbre y pescado, sin pasarse, y variando la proteína principal
  const c=ctx.counts;
  if((r.group==="legumbre"&&(c.legumbre||0)<1)||(r.group==="pescado"&&(c.pescado||0)<2))s+=1.6;
  if(r.group==="legumbre"&&(c.legumbre||0)>=2)s-=2.5;
  if(r.group==="pescado"&&(c.pescado||0)>=3)s-=2.5;
  if(!c[r.group])s+=0.8;
  s-=1.4*(ctx.mains[r.main]||0);
  if(r.group==="carne"&&(c.carne||0)>=3)s-=3;
  if(r.red&&(c.red||0)>=(goals.includes("sano")?1:2))s-=3;
  if(r.group==="huevo"&&(c.huevo||0)>=2)s-=3;
  if(ctx.have)s+=ctx.have(r)*1.5;
  return s;
}
function makeCtx(start,exceptId){
  const used=new Set(weekRecipes(start,exceptId));
  // Hace cuántas semanas se comió cada plato (1 a 3), mirando atrás y también las semanas ya planificadas después
  const hist={};for(const k of [3,2,1])for(const sign of [-1,1])for(const id of weekRecipes(addDays(start,sign*7*k)))hist[id]=k;
  const counts={},mains={};for(const id of used){const r=RX[id];if(!r)continue;counts[r.group]=(counts[r.group]||0)+1;mains[r.main]=(mains[r.main]||0)+1;if(r.red)counts.red=(counts.red||0)+1}
  const lm=Object.fromEntries(S.people.map(p=>[p.id,learnedMap(p)]));
  return {used,hist,counts,mains,lm};
}
function pickFor(slot,ctx){
  let c=candidates(slot);
  if(!c.length)c=candidates({...slot,need:{...slot.need,noHeavy:false}});
  if(!c.length)c=R.filter(r=>variantFor(r));
  let best=null,bs=-1e9;for(const r of c){const s=scoreRecipe(r,slot,ctx);if(s>bs){bs=s;best=r}}
  return best;
}
function addToCtx(ctx,r){ctx.used.add(r.id);ctx.counts[r.group]=(ctx.counts[r.group]||0)+1;ctx.mains[r.main]=(ctx.mains[r.main]||0)+1;if(r.red)ctx.counts.red=(ctx.counts.red||0)+1}

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
    const cost=slots.reduce((t,sl)=>{const v=wk.slots[sl.id];const r=v&&RX[v.recipe];return t+(r?rationCost(r)*sl.portions:0)},0);
    const bal=balanceOf(wk);
    const sc=bal*2-cost/8;
    tries.push({sc,slots:JSON.parse(JSON.stringify(wk.slots))});
  }
  tries.sort((a,b)=>b.sc-a.sc);
  S.plans[start].slots=tries[Math.floor(Math.random()*Math.min(6,tries.length))].slots;
}
function balanceOf(wk){const c={};for(const v of Object.values(wk.slots)){const r=RX[v.recipe];if(r){c[r.group]=(c[r.group]||0)+1;if(r.red)c.red=(c.red||0)+1}}
  return Math.min(c.legumbre||0,2)+Math.min(c.pescado||0,2)-Math.max(0,(c.carne||0)-3)-Math.max(0,(c.red||0)-1)-Math.max(0,(c.huevo||0)-2)}

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
    if(p.kind!=="adulto"){const sl=buildSlots(weekStartFor(d)).find(s=>s.id===d+"|"+meal);if(!sl||!sl.kids.includes(p))continue}
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
