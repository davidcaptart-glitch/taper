/* Táper · gustos: preferencias de cada persona, valoraciones y lo que la app aprende */
"use strict";

// Ingredientes: 2 me encanta · 1 me gusta · -1 no me gusta · -9 no puedo (alergia o intolerancia)
// Platos: 2 me encanta · 1 me gusta · -1 no me gusta
const ING_LABEL={2:"Me encanta",1:"Me gusta","-1":"No me gusta","-9":"No puedo comerlo"};
const ING_CYCLE=[0,2,1,-1,-9];
const REASONS={ingrediente:"No me gusta un ingrediente",preparacion:"No me gusta cómo se prepara",pesado:"Es pesado",sabor:"No me gusta el sabor",trabajo:"Lleva mucho trabajo",otro:"Otro motivo"};
// Ingredientes tan comunes que no se aprenden de las valoraciones (aparecen en todo)
const COMMON=new Set(["cebolla","ajo","tomate_tri","tomate_frito","limon","huevos"]);

const ingPref=(p,pid)=>Number(p.tastes.ing[pid])||0;
function ratingsOf(p,rid){return S.ratings.filter(x=>x.who===p.id&&(!rid||x.rid===rid))}
function dishPref(p,rid){
  const e=p.tastes.dish[rid];if(e!=null)return Number(e);
  const rs=ratingsOf(p,rid);if(!rs.length)return 0;
  return rs.reduce((t,x)=>t+x.v,0)/rs.length;
}
// ¿Ya dijo qué tal este plato alguna vez? Entonces no se le vuelve a preguntar
const ratedBefore=(p,rid)=>p.tastes.dish[rid]!=null||S.ratings.some(x=>x.who===p.id&&x.rid===rid);
// Platos parecidos a los que le han encantado suben; los parecidos a los que no le gustaron, bajan
const _likeC={};
function likeBoost(p,r){
  const k=S.ratings.length+"|"+Object.keys(p.tastes.dish).length+"|"+R.length;let c=_likeC[p.id];
  if(!c||c.k!==k){const love=[],hate=[];for(const x of R){const v=dishPref(p,x.id);if(v>=1.5)love.push(x);else if(v<=-0.5)hate.push(x)}c=_likeC[p.id]={k,love,hate,memo:{}}}
  if(c.memo[r.id]!=null)return c.memo[r.id];
  const sim=a=>{if(a.id===r.id)return 0;const ia=new Set(a.ing.map(([x])=>x).filter(x=>!COMMON.has(x)));return (a.main&&a.main===r.main?1:0)+Math.min(3,r.ing.filter(([x])=>ia.has(x)).length)*0.5};
  const best=xs=>xs.reduce((m,x)=>Math.max(m,sim(x)),0);
  return c.memo[r.id]=Math.min(1.2,best(c.love)*0.5)-Math.min(0.8,best(c.hate)*0.3);
}
const isRare=(p,rid)=>S.ratings.some(x=>x.who===p.id&&x.rid===rid&&x.rare);

// Lo aprendido: media de las valoraciones de los platos que llevan cada ingrediente
function learned(p){
  const acc={};
  for(const x of S.ratings){if(x.who!==p.id)continue;const r=RX[x.rid];if(!r)continue;
    for(const [pid] of r.ing){(acc[pid]=acc[pid]||{sum:0,n:0,dishes:new Set()});acc[pid].sum+=x.v;acc[pid].n++;acc[pid].dishes.add(r.name)}}
  const out=[];
  for(const [pid,a] of Object.entries(acc)){
    if(!P[pid]||p.tastes.ing[pid]!=null||p.tastes.ignore[pid])continue;
    const need=COMMON.has(pid)?4:2, avg=a.sum/a.n;
    if(a.dishes.size<need)continue;
    if(avg<=-0.5)out.push({pid,v:-1,src:`${a.dishes.size} platos con ${P[pid].name.toLowerCase()} valorados 👎`});
    else if(avg>=1.5)out.push({pid,v:1,src:`${a.dishes.size} platos con ${P[pid].name.toLowerCase()} te han encantado`});
  }
  return out;
}
function learnedMap(p){return Object.fromEntries(learned(p).map(x=>[x.pid,x.v*0.7]))}

// Puntuación de gusto de una receta para una persona (positivo = le gusta)
function tasteScore(p,r,lm){
  const dp=dishPref(p,r.id);let s=dp*1.6;
  if(!dp)s+=likeBoost(p,r);
  // Flexitariano: más platos vegetales, menos carne (sin prohibirla)
  if(dietOf(p)==="flexi"){const d=recipeDiet(r);s+=d==="vegano"||d==="vege"?1.4:d==="omni"?-0.8:0}
  let ing=0;for(const [pid] of r.ing){const v=ingPref(p,pid);ing+=v===-9?-20:v!==0?v:(lm&&lm[pid])||0}
  s+=ing/Math.max(2,r.ing.length)*2.2;
  return s;
}
// Tipo de alimentación: ¿puede comer este producto?
const dietOf=p=>DIETS[p.diet]?p.diet:"omni";
const rawOk=(p,r)=>dietOf(p)!=="crudi"||r.vars.some(v=>v.app==="ninguno"&&!(v.info||[]).some(x=>x&&(x.fuego||x.temp||x.potencia)));
const dietAllows=(p,pid)=>{const bl=DIETS[dietOf(p)][2];return !bl.length||!((P[pid]&&P[pid].org)||[]).some(o=>bl.includes(o))};
// Lo que es una receta según sus ingredientes (vegana, vegetariana…)
function recipeDiet(r){const o=new Set(r.ing.flatMap(([pid])=>(P[pid]&&P[pid].org)||[]));
  if(!o.size)return "vegano";if(!o.has("carne")&&!o.has("pescado")&&!o.has("marisco"))return "vege";if(!o.has("carne"))return "pesce";return "omni"}
// Alérgenos de una receta (de sus ingredientes)
const recipeAllergens=r=>[...new Set(r.ing.flatMap(([pid])=>(P[pid]&&P[pid].alg)||[]))];
// ¿Puede comerlo? (alergias e intolerancias de la persona e ingredientes marcados como "no puede")
const canEat=(p,r)=>{const al=p.allergies||[];if(!rawOk(p,r))return false;return !r.ing.some(([pid])=>ingPref(p,pid)===-9||!dietAllows(p,pid)||(al.length&&((P[pid]&&P[pid].alg)||[]).some(a=>al.includes(a))))};

/* ---------- Valoraciones ---------- */
function addRating(o){
  S.ratings=S.ratings.filter(x=>!(x.who===o.who&&x.slot&&x.slot===o.slot));
  S.ratings.push({id:uid("v"),at:todayISO(),...o});
  if(o.reason&&o.reason.type==="ingrediente"&&o.reason.ing){
    const p=S.people.find(x=>x.id===o.who);
    if(p&&p.tastes.ing[o.reason.ing]==null){p.tastes.ing[o.reason.ing]=-1;p.tastes.src["i:"+o.reason.ing]=`Lo dijiste al valorar ${RX[o.rid]?RX[o.rid].name:"un plato"}`}
  }
  save();
}
function setDish(p,rid,v,src){if(v==null){delete p.tastes.dish[rid];delete p.tastes.src["d:"+rid]}else{p.tastes.dish[rid]=v;if(src)p.tastes.src["d:"+rid]=src}save()}
function setIng(p,pid,v,src){if(!v){delete p.tastes.ing[pid];delete p.tastes.src["i:"+pid]}else{p.tastes.ing[pid]=v;p.tastes.src["i:"+pid]=src||"Lo indicaste tú"}save()}
