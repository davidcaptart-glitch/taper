/* Táper · datos: catálogo, recetas, precios de Mercadona y festivos (archivos de data/) */
"use strict";

// P[id] = {id, name, env, unit, est, keep, aisle, thaw, mid}
let P = {}, R = [], RX = {}, FEST = null;
let PR = null, prOffline = false;

function setProducts(list){
  P={};
  for(const p of list)P[p.id]={id:p.id,name:p.nombre,env:p.envase,unit:p.unidad,est:p.precio_estimado,keep:p.conservacion,aisle:p.pasillo,thaw:!!p.descongelar,mid:p.mercadona_id||null};
}
// Acepta recetas.json v1 (un aparato) y v2 (variantes por aparato, nutrición y conservación)
function setRecipes(list){
  R=list.map(r=>{
    const vars=r.variantes?r.variantes.map(v=>({app:v.aparato,time:v.minutos,active:v.minutos_trabajo,steps:v.pasos}))
      :[{app:r.aparato,time:r.minutos,active:r.minutos_trabajo,steps:r.pasos}];
    const n=r.nutricion||{kcal:null,proteina:r.proteina,hidratos:null,grasa:null};
    return {id:r.id,name:r.nombre,group:r.grupo,main:r.proteina_principal||r.grupo,type:r.tipo==="hidratos"?"c":"l",
      heavy:!!r.pesada,kid:!!r.gusta_ninos,tags:r.etiquetas||[],ing:r.ingredientes.map(i=>[i.producto,i.cantidad]).filter(([p])=>P[p]),
      kcal:n.kcal,prot:n.proteina,carb:n.hidratos,fat:n.grasa,vars,
      fridge:r.conserva?r.conserva.nevera_dias:3,freeze:r.conserva?!!r.conserva.congelable:false,
      red:r.proteina_principal==="ternera"||r.proteina_principal==="cerdo"};
  });
  RX=Object.fromEntries(R.map(r=>[r.id,r]));
}
// Variante que se puede hacer con los aparatos de casa (la primera disponible)
function variantFor(r,pref){
  const apps=new Set([...S.home.apps,"ninguno"]);
  return (pref&&r.vars.find(v=>v.app===pref&&apps.has(v.app)))||r.vars.find(v=>apps.has(v.app))||null;
}
const recipeTime=r=>{const v=variantFor(r);return v?v.time:r.vars[0].time};

/* ---------- Precios ---------- */
function loadSavedPrices(){try{const raw=localStorage.getItem("taper-precios");return raw?JSON.parse(raw):null}catch(e){return null}}
const mprice=pid=>{const x=PR&&PR.productos&&PR.productos[pid];return x&&typeof x.precio==="number"?x:null};
// Prioridad: precio corregido a mano > precio de Mercadona > estimación del catálogo
const price=pid=>S.prices[pid]!=null?S.prices[pid]:mprice(pid)?mprice(pid).precio:(P[pid]?P[pid].est:0);
function rise(pid){const x=mprice(pid);return x&&typeof x.anterior==="number"&&x.precio>x.anterior+0.004?x.precio-x.anterior:0}
const upTag=pid=>{const d=rise(pid);return d?` <span class="up" title="Ha subido respecto a la semana anterior">▲ +${eur(d)}</span>`:""};
const packsFor=(pid,q)=>Math.max(1,Math.ceil(q/P[pid].env-0.03));
// Coste de una ración de adulto (para el objetivo "ahorrar" y la ficha)
const rationCost=r=>r.ing.reduce((t,[p,q])=>t+q/P[p].env*price(p),0);

/* ---------- Festivos ---------- */
function isHoliday(d){
  if(S.home.festivosExtra.includes(d))return true;
  if(!FEST)return false;
  const y=d.slice(0,4);
  if((FEST.cataluna[y]||[]).includes(d))return true;
  const loc=FEST.locales[S.home.municipio];
  return !!(loc&&(loc[y]||[]).includes(d));
}
function holidayName(d){
  if(!FEST)return "";const n=FEST.nombres||{};return n[d]||"Festivo";
}
