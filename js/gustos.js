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
  let s=dishPref(p,r.id)*1.6;
  let ing=0;for(const [pid] of r.ing){const v=ingPref(p,pid);ing+=v===-9?-20:v!==0?v:(lm&&lm[pid])||0}
  s+=ing/Math.max(2,r.ing.length)*2.2;
  return s;
}
// Alérgenos de una receta (de sus ingredientes)
const recipeAllergens=r=>[...new Set(r.ing.flatMap(([pid])=>(P[pid]&&P[pid].alg)||[]))];
// ¿Puede comerlo? (alergias e intolerancias de la persona e ingredientes marcados como "no puede")
const canEat=(p,r)=>{const al=p.allergies||[];return !r.ing.some(([pid])=>ingPref(p,pid)===-9||(al.length&&((P[pid]&&P[pid].alg)||[]).some(a=>al.includes(a))))};

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
