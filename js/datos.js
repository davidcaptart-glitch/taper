/* Táper · datos: catálogo, recetas, precios de Mercadona y festivos (archivos de data/) */
"use strict";

// P[id] = {id, name, env, unit, est, keep, aisle, thaw, mid}
let P = {}, R = [], RX = {}, FEST = null;
let PR = null, prOffline = false, SUPERS = [], ZONES = null, zoneMissing = false;
let PS = null;   // precios de los demás supermercados (data/precios_supers.json)
let AJ = null;   // correcciones automáticas sacadas de los tickets de todos (servidor /ajustes)

function setProducts(list){
  P={};
  for(const p of list)P[p.id]={id:p.id,name:p.nombre,env:p.envase,unit:p.unidad,est:p.precio_estimado,keep:p.conservacion,aisle:p.pasillo,sec:p.seccion||p.pasillo,thaw:!!p.descongelar,mid:p.mercadona_id||null,img:p.foto||null,alg:p.alergenos||[],org:p.origen||[],choice:p.eleccion||null};
}
// Secciones de Mercadona en el orden habitual de recorrido de la tienda (congelados al final)
const STORE_ORDER=["Fruta y verdura","Panadería y pastelería","Charcutería y quesos","Carne","Marisco y pescado","Huevos, leche y mantequilla","Postres y yogures",
  "Pizzas y platos preparados","Aceite, especias y salsas","Arroz, legumbres y pasta","Conservas, caldos y cremas","Cereales y galletas","Cacao, café e infusiones",
  "Azúcar, caramelos y chocolate","Aperitivos","Agua y refrescos","Zumos","Bodega","Alimentación infantil","Congelados"];
// Acepta recetas.json v1 (un aparato) y v2 (variantes por aparato, nutrición y conservación)
function setRecipes(list){
  R=list.map(r=>{
    const vars=r.variantes?r.variantes.map(v=>({app:v.aparato,time:v.minutos,active:v.minutos_trabajo,steps:v.pasos,tools:v.utensilios||[],info:v.info||[]}))
      :[{app:r.aparato,time:r.minutos,active:r.minutos_trabajo,steps:r.pasos}];
    const n=r.nutricion||{kcal:null,proteina:r.proteina,hidratos:null,grasa:null};
    return {id:r.id,name:r.nombre,group:r.grupo,main:r.proteina_principal||r.grupo,type:r.tipo==="hidratos"?"c":"l",
      heavy:!!r.pesada,kid:!!r.gusta_ninos,tags:r.etiquetas||[],ing:r.ingredientes.map(i=>[i.producto,i.cantidad]).filter(([p])=>P[p]),
      kcal:n.kcal,prot:n.proteina,carb:n.hidratos,fat:n.grasa,vars,
      fridge:r.conserva?r.conserva.nevera_dias:3,freeze:r.conserva?!!r.conserva.congelable:false,
      red:r.proteina_principal==="ternera"||r.proteina_principal==="cerdo",
      sug:r.sugerida||null,author:r.autor||null,
      small:!!r.pequena,moments:r.momentos||[],portable:!!r.para_llevar,pack:r.pack||null,cap:!!r.capricho,diff:r.dificultad||"facil"};
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
/* ---------- Varios supermercados ----------
   S.home.super: el principal · S.home.supers: todos donde te viene bien comprar (en tienda o a domicilio)
   S.home.shop.strategy: "principal" (todo en el principal) o "barato" (cada producto donde salga más barato) */
const superById=sid=>(SUPERS||[]).find(x=>x.id===sid)||{id:sid,nombre:sid};
const superHasPrices=sid=>sid==="mercadona"||!!(PS&&PS.supers&&PS.supers[sid]&&Object.keys(PS.supers[sid].productos||{}).length);
const mainSuper=()=>S.home.super||"mercadona";
const chosenSupers=()=>{const c=(S.home.supers||[]).filter(superHasPrices);return c.includes(mainSuper())?c:[mainSuper(),...c]};
const cheapestMode=()=>S.home.shop.strategy==="barato"&&chosenSupers().length>1;
// Precio del envase de Táper en un supermercado (se escala por tamaño si su envase es distinto)
function superPrice(sid,pid){
  const aj=AJ&&AJ.productos&&AJ.productos[sid]&&AJ.productos[sid][pid];
  if(aj&&aj.excluir&&sid!=="mercadona")return null;
  const f=aj&&aj.factor||1;
  if(sid==="mercadona"){const m=mprice(pid);return m?Math.round(m.precio*f*100)/100:null}
  const x=PS&&PS.supers&&PS.supers[sid]&&PS.supers[sid].productos[pid];
  if(!x||!(x.precio>0)||!(x.envase>0)||!P[pid])return null;
  return Math.round(x.precio/x.envase*P[pid].env*f*100)/100;
}
// Dónde se compra cada producto
function superFor(pid){
  const main=mainSuper();let best=superPrice(main,pid)!=null?main:null,bp=best?superPrice(main,pid):null;
  if(cheapestMode())for(const s of chosenSupers()){const v=superPrice(s,pid);if(v!=null&&(bp==null||v<bp-0.005)){best=s;bp=v}}
  return best||main;
}
const price=pid=>{const v=superPrice(superFor(pid),pid);if(v!=null)return v;return mprice(pid)?mprice(pid).precio:(P[pid]?P[pid].est:0)};
function rise(pid){const x=mprice(pid);return x&&typeof x.anterior==="number"&&x.precio>x.anterior+0.004?x.precio-x.anterior:0}
const upTag=pid=>{const d=rise(pid);return d?` <span class="up" title="Ha subido respecto a la semana anterior">▲ +${eur(d)}</span>`:""};
const packsFor=(pid,q)=>Math.max(1,Math.ceil(q/P[pid].env-0.03));
// Coste de una ración de adulto (para el objetivo "ahorrar" y la ficha)
/* ---------- Utensilios y detalles de cada paso ---------- */
const TOOL_ICO=[["air fryer","🧺"],["airfryer","🧺"],["horno","🔥"],["bandeja","🔥"],["fuente","🔥"],["papel de horno","📜"],["microondas","📡"],["sartén","🍳"],["wok","🍳"],
  ["olla exprés","♨️"],["olla","🍲"],["cacerola","🥘"],["cazo","🫕"],["tabla","🔪"],["cuchillo","🔪"],["bol","🥣"],["plato","🍽️"],["rallador","🧀"],["batidora","🌀"],
  ["colador","🥢"],["espumadera","🥄"],["tostadora","🍞"],["vaso","🥛"],["tarro","🫙"],["táper","🥡"],["fiambrera","🥡"],["brocheta","🍢"],["molde","🧁"]];
const toolIco=t=>{const l=String(t).toLowerCase();const m=TOOL_ICO.find(([k])=>l.includes(k));return m?m[1]:"🥄"};
// Etiquetas cortas de un paso: utensilio, fuego / temperatura y modo, potencia, minutos
function stepTags(x){
  if(!x)return [];const t=[];
  if(x.utensilio)t.push(toolIco(x.utensilio)+" "+x.utensilio.charAt(0).toUpperCase()+x.utensilio.slice(1));
  if(x.fuego)t.push("🔥 Fuego "+x.fuego);
  if(x.temp)t.push("🌡️ "+x.temp+" °C");
  if(x.modo)t.push(x.modo.charAt(0).toUpperCase()+x.modo.slice(1));
  if(x.potencia)t.push("⚡ "+x.potencia+" W");
  if(x.min)t.push("⏱ "+x.min+" min");
  if(x.nota)t.push(x.nota);
  return t;
}
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
