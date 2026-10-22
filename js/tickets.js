/* Táper · tickets de Mercadona: leer el PDF o la foto, interpretar las líneas y ver en qué se va el dinero.
   Todo se procesa en el móvil: el ticket no se envía a ningún sitio. */
"use strict";

const PDFJS="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
const TESSERACT="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
let MC=null;   // catálogo de Mercadona: {cats, p:[[id,nombre,cat]]} + índice

function loadScript(src){return new Promise((ok,ko)=>{if(document.querySelector(`script[src="${src}"]`))return ok();const s=document.createElement("script");s.src=src;s.onload=ok;s.onerror=()=>ko(new Error("No se ha podido descargar "+src));document.head.appendChild(s)})}
const normTxt=s=>String(s||"").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Z0-9 ]/g," ").replace(/\s+/g," ").trim();
const num=s=>Number(String(s).replace(",","."));

/* ---------- Leer el texto ---------- */
// PDF: se reconstruyen las líneas agrupando los trozos de texto por su altura en la página
async function textFromPdf(file){
  await loadScript(PDFJS+"pdf.min.js");
  pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS+"pdf.worker.min.js";
  const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
  const lines=[];
  for(let n=1;n<=pdf.numPages;n++){
    const items=(await (await pdf.getPage(n)).getTextContent()).items.filter(i=>i.str.trim());
    const rows=[];
    for(const it of items){const y=it.transform[5],x=it.transform[4];
      let row=rows.find(r=>Math.abs(r.y-y)<2.5);if(!row){row={y,parts:[]};rows.push(row)}row.parts.push({x,s:it.str})}
    rows.sort((a,b)=>b.y-a.y);
    for(const r of rows)lines.push(r.parts.sort((a,b)=>a.x-b.x).map(p=>p.s.trim()).join("  "));
  }
  return lines.join("\n");
}
// Foto: se mejora el contraste y se reconoce el texto en español
async function textFromImage(file,onProgress){
  await loadScript(TESSERACT);
  const img=await createImageBitmap(file);
  const scale=Math.min(2.5,1800/img.width), c=document.createElement("canvas");
  c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);
  const g=c.getContext("2d");g.filter="grayscale(1) contrast(1.6) brightness(1.1)";g.drawImage(img,0,0,c.width,c.height);
  const res=await Tesseract.recognize(c,"spa",{logger:m=>{if(m.status==="recognizing text"&&onProgress)onProgress(m.progress)}});
  return res.data.text;
}

/* ---------- Interpretar el ticket ---------- */
// Formato de Mercadona: "2 HUEVOS GRANDES L   3,05   6,10" y, para lo que va al peso,
// "1 PLATANO" seguido de "0,862 kg   2,15 €/kg   1,85"
function parseTicket(text){
  const raw=text.split(/\r?\n/).map(l=>l.replace(/\s+/g," ").trim()).filter(Boolean);
  const out={date:null,total:null,lines:[],super:null,store:""};
  // Supermercado y tienda: el nombre de la cadena y la dirección están en las primeras líneas
  const head=raw.slice(0,6), up=normTxt(head.join(" "));
  const sp=(SUPERS||[]).find(x=>x.nombre.split("/").some(n=>up.includes(normTxt(n))));out.super=sp?sp.id:null;
  const addr=head.find(l=>/(C\/|CL\.?|CALLE|AV\.?|AVDA|AVENIDA|PZA|PLAZA|CTRA|PASEO|PG|RAMBLA|CARRER)/i.test(l))||head.find((l,i)=>i>0&&!/S\.A\.|\d{2}\/\d{2}\/\d{4}|TEL|FACTURA|NIF|CIF/i.test(l));
  out.store=addr?addr.replace(/\s+/g," ").trim():"";
  const dm=text.match(/(\d{2})\/(\d{2})\/(\d{4})/);if(dm)out.date=`${dm[3]}-${dm[2]}-${dm[1]}`;
  const money="(\\d{1,4}[,.]\\d{2})";
  const reItem=new RegExp(`^(\\d{1,2})\\s+(.+?)\\s+${money}(?:\\s+${money})?$`);
  const reWeight=new RegExp(`(\\d+[,.]\\d{2,3})\\s*kg\\s+${money}\\s*€?\\s*/\\s*kg\\s+${money}`,"i");
  const reHead=/^(\d{1,2})\s+([A-ZÁÉÍÓÚÑ.].*)$/;
  let started=false,pending=null;
  for(const l of raw){
    if(/^TOTAL/i.test(l)){const t=l.match(new RegExp(money));if(t)out.total=num(t[1]);break}
    if(!started){if(/DESCRIPCI/i.test(l)||reItem.test(l))started=true;if(!reItem.test(l))continue}
    if(/^(IVA|BASE|TARJETA|EFECTIVO|CAMBIO|ENTREGA|FACTURA|OP:|N\.?C|AID|ARC)/i.test(l))continue;
    const w=l.match(reWeight);
    if(w){const target=pending||out.lines[out.lines.length-1];if(target){target.kg=num(w[1]);target.unit=num(w[2]);target.amount=num(w[3])}pending=null;continue}
    const m=l.match(reItem);
    if(m&&!/kg/i.test(m[2])){out.lines.push({qty:Number(m[1]),desc:m[2].trim(),unit:m[4]?num(m[3]):null,amount:num(m[4]||m[3])});pending=null;continue}
    const h=l.match(reHead);
    if(h){const it={qty:Number(h[1]),desc:h[2].trim(),unit:null,amount:null};out.lines.push(it);pending=it}
  }
  out.lines=out.lines.filter(x=>x.amount!=null);
  out.sum=Math.round(out.lines.reduce((t,x)=>t+x.amount,0)*100)/100;
  return out;
}

/* ---------- Relacionar cada línea con un producto ---------- */
const ABBR={Q:"QUESO",PECH:"PECHUGA",FTE:"FILETE",FTES:"FILETES",HAC:"HACENDADO",CONG:"CONGELADO",ULTRAC:"ULTRACONGELADO",SEMI:"SEMIDESNATADA",DESN:"DESNATADA",NAT:"NATURAL",TOM:"TOMATE",PAT:"PATATA",ESP:"ESPINACA",CHAMP:"CHAMPINON",ZANAH:"ZANAHORIA",GARB:"GARBANZO",LENT:"LENTEJA"};
async function loadCatalog(){
  if(MC)return MC;
  const d=await getJSON("data/mercadona.json");
  const idx=new Map(), toks=d.p.map(([id,name])=>normTxt(name).split(" ").filter(t=>t.length>=3));
  toks.forEach((ts,i)=>{for(const t of ts){const k=t.slice(0,4);if(!idx.has(k))idx.set(k,new Set());idx.get(k).add(i)}});
  MC={...d,toks,idx};return MC;
}
function matchLine(desc){
  const ours=new Set(Object.values(P).map(p=>p.mid).filter(Boolean));
  const ts=normTxt(desc).split(" ").filter(t=>t.length>=2).map(t=>ABBR[t]||t).filter(t=>t.length>=3);
  if(!ts.length)return null;
  const cand=new Set();for(const t of ts){const s=MC.idx.get(t.slice(0,4));if(s)for(const i of s)cand.add(i)}
  let best=null;
  for(const i of cand){const ct=MC.toks[i];
    let hit=0;for(const t of ts)if(ct.some(c=>c.startsWith(t)||t.startsWith(c)))hit++;
    const sc=hit/ts.length+0.15*hit/Math.max(1,ct.length)+(ours.has(MC.p[i][0])?0.12:0);
    if(!best||sc>best.sc)best={sc,i}}
  if(!best||best.sc<0.55)return null;
  const [mid,name,ci]=MC.p[best.i],cat=MC.cats[ci];
  const pid=Object.values(P).find(p=>p.mid===mid)?.id||null;
  return {mid,name,group:cat.g,food:cat.food,pid,score:Math.round(best.sc*100)/100};
}

/* ---------- Ver el ticket, corregirlo y guardarlo ---------- */
function openTicketScan(){
  showDialog(`<div class="mod">${closeBtn}<h2>Escanear un ticket</h2>
    <p class="small muted">Haz una foto al ticket de papel (bien plano y con luz) o elige el PDF del ticket digital de Mercadona. Se lee en tu móvil. Solo se envían, sin datos personales, los precios que no cuadran, para corregirlos para todos. Cada ticket nuevo te da 3 coins.</p>
    <div class="actions"><label class="btn">📷 Foto del ticket<input type="file" accept="image/*" capture="environment" id="tkImg" hidden></label>
    <label class="btn ghost">📄 PDF o imagen guardada<input type="file" accept="application/pdf,image/*" id="tkFile" hidden></label></div>
    <div id="tkState" class="small muted"></div></div>`);
  const go=async file=>{if(!file)return;const st=dlg.querySelector("#tkState");
    try{
      st.textContent="Preparando…";await loadCatalog();
      let text;
      if(file.type==="application/pdf"||/\.pdf$/i.test(file.name)){st.textContent="Leyendo el PDF…";text=await textFromPdf(file)}
      else{st.textContent="Leyendo la foto… la primera vez tarda un poco más";text=await textFromImage(file,p=>st.textContent=`Leyendo la foto… ${Math.round(p*100)} %`)}
      const tk=parseTicket(text);
      if(!tk.lines.length){st.innerHTML="No he encontrado líneas de productos. Prueba con otra foto más nítida y plana, o con el PDF.";return}
      for(const l of tk.lines){l.match=matchLine(l.desc);l.food=l.match?l.match.food:true;l.pid=l.match?l.match.pid:null;l.group=l.match?l.match.group:"Sin identificar"}
      openTicketReview(tk,text);
    }catch(e){st.textContent="No se ha podido leer: "+e.message+". Comprueba la conexión (la primera vez se descarga el lector)."}};
  dlg.querySelector("#tkImg").onchange=e=>go(e.target.files[0]);
  dlg.querySelector("#tkFile").onchange=e=>go(e.target.files[0]);
}
function ticketListFor(date){
  const m=date.slice(0,7), weeks=weeksInMonth(m);
  const wi=weeks.findIndex(s=>date>=s&&date<addDays(s,7));
  return {m,key:wi>=0?String(wi):"mes",weeks};
}
function openTicketReview(tk,text){
  const date=tk.date||todayISO();let dest=ticketListFor(date);
  const prods=Object.values(P).sort((a,b)=>a.name.localeCompare(b.name));
  const draw=()=>{
    const food=tk.lines.filter(l=>l.food), foodT=food.reduce((t,l)=>t+l.amount,0), nonT=tk.lines.filter(l=>!l.food).reduce((t,l)=>t+l.amount,0);
    const diff=tk.total!=null?Math.round((tk.total-tk.sum)*100)/100:0;
    showDialog(`<div class="mod">${closeBtn}<h2>Ticket del ${esc(longDate(date))}</h2>
      <p>Comida: <b>${eur(foodT)}</b>${nonT?` · No es comida (no se cuenta): ${eur(nonT)}`:""}${tk.total!=null?` · Total del ticket: ${eur(tk.total)}`:""}</p>
      ${Math.abs(diff)>0.05?`<div class="warnbox">Las líneas leídas suman ${eur(tk.sum)} y el ticket dice ${eur(tk.total)}: puede que alguna línea no se haya leído bien. Revisa y corrige.</div>`:""}
      <div class="row"><div class="field" style="flex:1"><label>Supermercado</label><select id="tkSuper">${(SUPERS||[]).map(x=>`<option value="${x.id}" ${tk.super===x.id?"selected":""}>${esc(x.nombre)}</option>`).join("")}<option value="otro" ${!tk.super?"selected":""}>Otro</option></select></div>
        <div class="field" style="flex:1.4"><label>Tienda</label><input type="text" id="tkStore" value="${esc(tk.store)}" placeholder="Dirección o barrio"></div></div>
      <div class="field"><label>¿De qué compra es?</label><select id="tkList"><option value="mes" ${dest.key==="mes"?"selected":""}>Compra del mes</option>${dest.weeks.map((s,i)=>`<option value="${i}" ${dest.key===String(i)?"selected":""}>Semana del ${shortDate(s)}</option>`).join("")}</select></div>
      <table class="wtable">${tk.lines.map((l,i)=>`<tr><td>${l.qty} × ${esc(l.desc)}${l.kg?` <span class="small muted">${String(l.kg).replace(".",",")} kg</span>`:""}
        <div class="small muted">${esc(l.match?l.match.name:"Sin identificar")} · ${esc(l.group)}</div>
        <select data-tkp="${i}" style="margin-top:4px;padding:4px 6px"><option value="">${l.food?"Comida (otro producto)":"No es comida"}</option>${prods.map(p=>`<option value="${p.id}" ${l.pid===p.id?"selected":""}>${esc(p.name)}</option>`).join("")}</select></td>
        <td style="vertical-align:top">${eur(l.amount)}<br><button class="chip" data-tkf="${i}" aria-pressed="${l.food}" style="margin-top:4px;font-size:.75rem">${l.food?"🍽️ Comida":"🧴 No"}</button></td></tr>`).join("")}</table>
      <div class="actions"><button class="btn" id="tkSave">Guardar ticket</button></div>
      <details class="small muted"><summary>Texto leído</summary><pre style="white-space:pre-wrap">${esc(text.slice(0,3000))}</pre></details></div>`);
    dlg.querySelectorAll("[data-tkf]").forEach(b=>b.onclick=()=>{const l=tk.lines[b.dataset.tkf];l.food=!l.food;if(!l.food)l.pid=null;draw()});
    dlg.querySelectorAll("[data-tkp]").forEach(s=>s.onchange=()=>{const l=tk.lines[s.dataset.tkp];l.pid=s.value||null;if(l.pid){l.food=true;l.group=P[l.pid].aisle}});
    dlg.querySelector("#tkList").onchange=e=>{dest={...dest,key:e.target.value}};
    dlg.querySelector("#tkSuper").onchange=e=>{tk.super=e.target.value==="otro"?null:e.target.value};
    dlg.querySelector("#tkStore").onchange=e=>{tk.store=e.target.value.trim()};
    dlg.querySelector("#tkSave").onclick=()=>saveTicket(tk,date,dest);
  };
  draw();
}
// Revisión interna de precios: si lo pagado no cuadra con el precio que usa la app, se manda al servidor
// para revisarlo. No cambia nada en la app de nadie.
function reportTicketPrices(t){
  if(typeof servidorOn!=="function"||!servidorOn())return;
  const sid=(SUPERS||[]).some(x=>x.id===t.super)?t.super:null, items=[];
  for(const l of t.lines){
    if(!l.pid||!(l.amount>0))continue;const p=P[l.pid];
    const ours=sid?superPrice(sid,l.pid):price(l.pid);if(!(ours>0))continue;
    // Precio pagado por un envase como el de la app (al peso: el kilo pasado a su envase)
    const paid=l.kg&&p.unit==="g"?l.amount/l.kg*(p.env/1000):l.amount/Math.max(1,l.qty||1);
    const dif=(paid-ours)/ours;
    if(Math.abs(dif)>=0.08)items.push({pid:l.pid,desc:String(l.desc).slice(0,60),pagado:Math.round(paid*100)/100,app:Math.round(ours*100)/100,dif:Math.round(dif*100)});
  }
  if(!items.length)return;
  fetch(CFG.avisos.url.replace(/\/$/,"")+"/ticket-precios",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({uid:S.uid,cp:S.home.cp||"",super:t.super,tienda:t.store||"",fecha:t.date,items:items.slice(0,40)})}).catch(()=>{});
}
// Coins por ticket: solo tickets recientes, con total y al menos 3 productos de comida
async function rewardTicket(t){
  if(typeof servidorOn!=="function"||!servidorOn())return;
  if(!(t.total>0)||t.lines.filter(l=>l.food).length<3||Math.abs(daysBetween(t.date,todayISO()))>10)return;
  try{const raw=[t.date,t.total,t.store,t.lines.length,t.lines.slice(0,5).map(l=>l.desc+l.amount).join("|")].join("#");
    const h=[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,32);
    const r=await postAvisos("/evento",{uid:S.uid,tipo:"ticket",hash:h});
    if(r&&r.coins)setTimeout(()=>toast(`🪙 +${r.coins} coins por subir el ticket`),1200);
    else if(r&&r.limite)setTimeout(()=>toast("Ticket guardado (esta semana ya has llegado al máximo de coins por tickets)"),1200);
  }catch(e){}
}
function saveTicket(tk,date,dest){
  S.tickets=S.tickets||[];
  const lines=tk.lines.map(l=>({qty:l.qty,desc:l.desc,amount:l.amount,kg:l.kg||null,food:l.food,pid:l.pid||null,mid:l.match?l.match.mid:null,group:l.pid?P[l.pid].aisle:l.group}));
  const t={id:uid("t"),date,m:dest.m,list:dest.key,super:tk.super||"otro",store:tk.store||"",total:tk.total,food:Math.round(lines.filter(l=>l.food).reduce((s,l)=>s+l.amount,0)*100)/100,lines};
  S.tickets.push(t);
  reportTicketPrices(t);
  rewardTicket(t);
  // Lo pagado de esa lista = suma de sus tickets (solo comida)
  S.spent[dest.m+"|"+dest.key]=Math.round(S.tickets.filter(x=>x.m===dest.m&&x.list===dest.key).reduce((s,x)=>s+x.food,0)*100)/100;
  // Marca como comprado lo de la lista que aparece en el ticket
  for(const l of lines)if(l.pid)S.checks[checkKey(dest.m,dest.key,l.pid)]=true;
  save();dlg.close();render();toast("Ticket guardado: "+eur(t.food)+" en comida");
}

/* ---------- En qué se va el dinero ---------- */
function spendingOf(m){
  const tks=(S.tickets||[]).filter(t=>t.m===m);if(!tks.length)return null;
  const sh=shopping(m), inList=new Set();for(const l of Object.values(sh.lists))for(const it of l.items)inList.add(it.pid);
  const groups={},offList=[],shops={};let food=0,non=0;
  const superName=id=>((SUPERS||[]).find(x=>x.id===id)||{nombre:"Otro"}).nombre;
  for(const t of tks){const k=superName(t.super)+(t.store?" · "+t.store:"");shops[k]=(shops[k]||0)+t.food}
  for(const t of tks)for(const l of t.lines){
    if(!l.food){non+=l.amount;continue}
    food+=l.amount;const g=l.pid?({"Carne y pescado":"Carne y pescado"}[P[l.pid]?.aisle]||P[l.pid]?.aisle||l.group):l.group;groups[g]=(groups[g]||0)+l.amount;
    if(!l.pid||!inList.has(l.pid))offList.push(l);
  }
  const off=offList.reduce((t,l)=>t+l.amount,0);
  const top=Object.values(offList.reduce((a,l)=>{const k=l.desc;a[k]=a[k]||{desc:k,amount:0};a[k].amount+=l.amount;return a},{})).sort((a,b)=>b.amount-a.amount).slice(0,5);
  return {tickets:tks.length,food,non,off,top,groups:Object.entries(groups).sort((a,b)=>b[1]-a[1]),shops:Object.entries(shops).sort((a,b)=>b[1]-a[1])};
}
function spendingHTML(m){
  const sp=spendingOf(m);
  let h=`<div class="card"><h2>Tickets</h2><button class="btn wide" id="tkScan">📷 Escanear un ticket</button>`;
  if(!sp)return h+`<p class="small muted">Escanea tus tickets (foto o PDF) y verás en qué se va el dinero. Lo que no es comida se descarta solo.</p></div>`;
  const max=sp.groups[0][1];
  h+=`<p style="margin-top:10px">${sp.tickets} ${sp.tickets===1?"ticket":"tickets"} · comida <b>${eur(sp.food)}</b>${sp.non?` · no comida (no cuenta) ${eur(sp.non)}`:""}</p>
    <h3 style="font-size:1rem;margin:10px 0 6px">En qué se va el dinero</h3>
    ${sp.groups.map(([g,v])=>`<div class="spbar"><span>${esc(g)}</span><i style="width:${Math.max(4,v/max*100)}%"></i><b>${eur(v)}</b></div>`).join("")}
    ${sp.off>0.5?`<p class="small" style="margin-top:10px"><b>Fuera de la lista: ${eur(sp.off)}</b> (${Math.round(sp.off/sp.food*100)} % de la comida). Lo que más: ${sp.top.map(t=>esc(t.desc.toLowerCase())+" "+eur(t.amount)).join(", ")}.</p>`:`<p class="small okbox">Casi todo lo que compraste estaba en la lista.</p>`}
    ${sp.shops.length>1?`<h3 style="font-size:1rem;margin:10px 0 6px">Dónde compras</h3>${sp.shops.map(([s,v])=>`<div class="spbar"><span>${esc(s)}</span><i style="width:${Math.max(4,v/sp.shops[0][1]*100)}%"></i><b>${eur(v)}</b></div>`).join("")}`:`<p class="small muted">Comprado en ${esc(sp.shops[0][0])}.</p>`}
    <details class="small"><summary>Ver tickets</summary>${(S.tickets||[]).filter(t=>t.m===m).map(t=>`<div class="fixed"><span>${esc(longDate(t.date))}<small>${esc(((SUPERS||[]).find(x=>x.id===t.super)||{nombre:"Otro"}).nombre)}${t.store?" · "+esc(t.store):""} · ${eur(t.food)} en comida · ${t.lines.length} líneas</small></span><button class="btn ghost small" data-tkdel="${t.id}">Borrar</button></div>`).join("")}</details></div>`;
  return h;
}
function bindSpending(){
  const b=document.getElementById("tkScan");if(b)b.onclick=openTicketScan;
  document.querySelectorAll("[data-tkdel]").forEach(x=>x.onclick=()=>{if(!confirm("¿Borrar este ticket?"))return;
    const t=S.tickets.find(t=>t.id===x.dataset.tkdel);S.tickets=S.tickets.filter(y=>y!==t);
    const k=t.m+"|"+t.list,rest=S.tickets.filter(y=>y.m===t.m&&y.list===t.list);if(rest.length)S.spent[k]=rest.reduce((s,y)=>s+y.food,0);else delete S.spent[k];
    save();render()});
}
