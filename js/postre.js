/* Táper · Postre: una pieza de fruta de temporada o un yogur después de comer o de cenar.
   S.home.postre = {comida:"no"|"fruta"|"yogur"|"alterna", cena:…} (en «Tu semana normal»; sin poner, no hay postre)
   S.days[d].postre = {comida:pid|"no", cena:…}: lo cambiado a mano un día.
   Va a la compra como un ingrediente más (una pieza o un yogur por persona) y la despensa lo descuenta al comerse.
   Con el menú del comedor: si ese mediodía el niño tomó yogur, de postre en la cena le toca fruta, y al revés. */
"use strict";

const POSTRE_MODOS=[["no","Sin postre"],["fruta","🍎 Fruta"],["yogur","🥛 Yogur"],["alterna","Alterna"]];
// Fruta de temporada (de la que hay en el súper) por mes
const FRUTA_MES={1:["mandarina","naranja","kiwi","pera","manzana","platano"],2:["naranja","mandarina","kiwi","pera","manzana","platano"],3:["naranja","kiwi","platano","manzana","pera"],
  4:["platano","naranja","kiwi","manzana","pera"],5:["platano","manzana","pera","naranja"],6:["platano","manzana","pera"],7:["platano","manzana","pera"],8:["platano","manzana","pera"],
  9:["manzana","pera","platano"],10:["manzana","pera","mandarina","platano","kiwi"],11:["mandarina","manzana","kiwi","pera","naranja","platano"],12:["mandarina","naranja","kiwi","manzana","pera","platano"]};
const postreModo=meal=>((S.home||{}).postre||{})[meal]||"no";
const frutaDe=d=>{const l=(FRUTA_MES[Number(d.slice(5,7))]||["manzana"]).filter(p=>P[p]);return l.length?l[(Number(d.slice(8))+(Number(d.slice(5,7))*3))%l.length]:null};
// Quién toma postre en esa comida (los que comen en casa o se llevan el táper)
function postreEaters(d,meal){
  const st=mealState(d,meal);if(!["cocinar","taper","solotaper"].includes(st))return [];
  return peopleAt(d,meal).filter(p=>!(p.kind==="nino"&&Number(p.age)>0&&Number(p.age)<1));
}
// El postre de una comida: {pid, nombre, por} o null. por: la razón si lo ha decidido el comedor
function postreFor(d,meal){
  const man=(((S.days[d]||{}).postre)||{})[meal];
  if(man==="no")return null;
  if(man&&P[man])return {pid:man,nombre:P[man].name,manual:true};
  const modo=postreModo(meal);if(modo==="no")return null;
  if(typeof preShop==="function"&&preShop(d))return null;   // antes de la primera compra no hay fruta ni yogur comprados con la app
  if(!postreEaters(d,meal).length)return null;
  let tipo=modo==="alterna"?(Number(d.slice(8))%2?"fruta":"yogur"):modo,por=null;
  // En la cena, que no repita lo que el niño tomó de postre en el cole
  if(meal==="cena"&&typeof S.comedor==="object")for(const k of kidsAt(d,"cena")){const c=((S.comedor||{})[k.id]||{})[d];if(!c||!c.postre)continue;
    if((c.postre==="yogur"||c.postre==="lacteo")&&tipo==="yogur"){tipo="fruta";por=`${personName(k)} tomó yogur en el cole`}
    else if(c.postre==="fruta"&&tipo==="fruta"&&modo!=="fruta"&&P.yogur){tipo="yogur";por=`${personName(k)} tomó fruta en el cole`}}
  const pid=tipo==="yogur"?(P.yogur?"yogur":null):frutaDe(d);
  return pid?{pid,nombre:P[pid].name,por}:null;
}
// Cuánto: una pieza de fruta o un yogur por persona (los niños pequeños, media pieza)
function postreQty(d,meal,pid){
  const ps=postreEaters(d,meal),n=ps.reduce((t,p)=>t+(p.kind==="nino"&&Number(p.age)>0&&Number(p.age)<4?0.5:1),0);
  return P[pid].unit==="ud"?Math.ceil(n):n*P[pid].env;
}
// Para la compra (monthUses): lo de una semana
// (se guarda mientras no cambie nada: la compra lo pide cientos de veces y depende de quién come, no de los platos)
let postreMemo={k:null,v:{}};
function postreUses(start,wi,deliv){
  const k=S.updatedAt+"|"+todayISO();if(postreMemo.k!==k)postreMemo={k,v:{}};const mk=start+"|"+wi+"|"+deliv;
  if(!postreMemo.v[mk])postreMemo.v[mk]=postreUses_(start,wi,deliv);return postreMemo.v[mk].map(u=>({...u}));
}
function postreUses_(start,wi,deliv){
  const out=[];if(postreModo("comida")==="no"&&postreModo("cena")==="no"&&!Object.keys(S.days).some(d=>d>=start&&d<=addDays(start,6)&&(S.days[d]||{}).postre))return out;
  for(const d of weekDates(start))for(const meal of ["comida","cena"]){const p=postreFor(d,meal);if(!p)continue;
    // r: una «receta» mínima con nombre, porque la despensa y la compra enseñan para qué plato es cada cosa
    const q=postreQty(d,meal,p.pid);if(q>0)out.push({pid:p.pid,q,wi,freshWi:wi>0&&d<deliv?wi-1:wi,date:d,slot:{id:d+"|"+meal+"|postre",date:d,meal},r:{id:"postre",name:"Postre ("+p.nombre.replace(/ \(.*\)$/,"").toLowerCase()+")",ing:[]},postre:true})}
  return out;
}
// Una línea para enseñar en el día: «🍎 Postre: mandarina»
function postreLine(d,meal){
  const p=postreFor(d,meal);if(!p)return "";
  return `<div class="small postrel">${p.pid==="yogur"?"🥛":"🍎"} Postre: ${esc(p.nombre.replace(/ \(.*\)$/,"").toLowerCase())}${p.por?` <span class="muted">· ${esc(p.por)}</span>`:""}</div>`;
}
// Cambiar el postre de un día: el de siempre → fruta de temporada → yogur → ninguno → el de siempre
function cyclePostre(d,meal){
  const o=S.days[d]=S.days[d]||{},pp=o.postre=o.postre||{},cur=pp[meal],f=frutaDe(d);
  const seq=[undefined,f,P.yogur?"yogur":null,"no"].filter((x,i)=>i===0||x);
  const i=seq.findIndex(x=>x===cur),next=seq[(i+1)%seq.length];
  if(next===undefined)delete pp[meal];else pp[meal]=next;
  if(!Object.keys(pp).length)delete o.postre;
  save();
}
