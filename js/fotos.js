/* Táper · imágenes: foto de cada producto (tienda de Mercadona), collage de ingredientes para los platos
   y fotos propias de los platos (se guardan solo en el móvil, en IndexedDB) */
"use strict";

const PHOTO_SKIP=new Set(["cebolla","ajo","limon","caldo_pollo","caldo_pescado","mostaza","teriyaki"]);
let MYPHOTOS={};   // id de receta -> URL de la foto propia (cargada de IndexedDB al arrancar)
let DISHPHOTOS={}; // id de receta -> {archivo, autor, licencia, fuente}: fotos libres de Wikimedia Commons

const prodImg=(pid,cls="pimg")=>{const p=P[pid];return p&&p.img?`<img class="${cls}" src="${esc(p.img)}" alt="" loading="lazy" decoding="async">`:`<span class="${cls} noimg">🥫</span>`};
// Ingredientes principales de un plato: los de más cantidad, sin los que apenas se ven (cebolla, ajo…)
function mainIngs(r,n=3){return r.ing.filter(([p])=>P[p]&&P[p].img&&!PHOTO_SKIP.has(p)).sort((a,b)=>b[1]*(P[b[0]].unit==="ud"?80:1)-a[1]*(P[a[0]].unit==="ud"?80:1)).slice(0,n).map(([p])=>p)}
// Regla: una receta solo se usa si tiene foto (la real del plato o la tuya).
// Si las fotos no se han podido cargar, no se bloquea nada.
// Recetas de un pack: solo si se ha desbloqueado en la tienda
const hasPack=r=>!r.pack||(S.owned||[]).includes("pack_"+r.pack);
const hasPhoto=r=>!!(MYPHOTOS[r.id]||DISHPHOTOS[r.id]||!Object.keys(DISHPHOTOS||{}).length);
function dishImg(r,size="s"){
  if(MYPHOTOS[r.id])return `<span class="dish ${size}"><img src="${MYPHOTOS[r.id]}" alt="${esc(r.name)}" class="mine"></span>`;
  const f=DISHPHOTOS[r.id];if(f)return `<span class="dish ${size} photo"><img src="${esc(f.archivo)}" alt="${esc(r.name)}" class="mine" loading="lazy" decoding="async"></span>`;
  const ps=mainIngs(r,size==="s"?1:3);if(!ps.length)return `<span class="dish ${size} noimg">🍽️</span>`;
  return `<span class="dish ${size} n${ps.length}" aria-hidden="true">${ps.map(p=>`<img src="${esc(P[p].img)}" alt="" loading="lazy" decoding="async">`).join("")}</span>`;
}

/* ---------- Fotos propias (IndexedDB) ---------- */
function photoDB(){return new Promise((ok,ko)=>{const rq=indexedDB.open("taper-fotos",1);rq.onupgradeneeded=()=>rq.result.createObjectStore("fotos");rq.onsuccess=()=>ok(rq.result);rq.onerror=()=>ko(rq.error)})}
async function loadMyPhotos(){
  try{const db=await photoDB();await new Promise(ok=>{const tx=db.transaction("fotos").objectStore("fotos").openCursor();
    tx.onsuccess=()=>{const c=tx.result;if(!c)return ok();MYPHOTOS[c.key]=URL.createObjectURL(c.value);c.continue()};tx.onerror=()=>ok()})}catch(e){}
}
// Reduce la foto a 800 px y la guarda como JPEG
async function saveMyPhoto(rid,file){
  const img=await createImageBitmap(file),k=Math.min(1,800/Math.max(img.width,img.height));
  const c=document.createElement("canvas");c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  const blob=await new Promise(ok=>c.toBlob(ok,"image/jpeg",0.8));
  const db=await photoDB();await new Promise((ok,ko)=>{const tx=db.transaction("fotos","readwrite");tx.objectStore("fotos").put(blob,rid);tx.oncomplete=ok;tx.onerror=()=>ko(tx.error)});
  if(MYPHOTOS[rid])URL.revokeObjectURL(MYPHOTOS[rid]);MYPHOTOS[rid]=URL.createObjectURL(blob);
}
async function deleteMyPhoto(rid){
  const db=await photoDB();await new Promise(ok=>{const tx=db.transaction("fotos","readwrite");tx.objectStore("fotos").delete(rid);tx.oncomplete=ok;tx.onerror=ok});
  if(MYPHOTOS[rid])URL.revokeObjectURL(MYPHOTOS[rid]);delete MYPHOTOS[rid];
}

// Crédito de la foto (lo exige la licencia): autor, licencia y enlace a la ficha original
function photoCredit(r){
  if(MYPHOTOS[r.id])return "";const f=DISHPHOTOS[r.id];if(!f)return "";
  return `<div class="credit">Foto: ${esc(f.autor||"autor desconocido")} · <a href="${esc(f.licencia_url||f.fuente)}" target="_blank" rel="noopener">${esc(f.licencia||"licencia libre")}</a> · <a href="${esc(f.fuente)}" target="_blank" rel="noopener">Wikimedia Commons</a></div>`;
}
