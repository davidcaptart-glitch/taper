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
// Foto: se recorta el papel, se pasa a blanco y negro según la luz de cada zona (sombras, arrugas) y se lee.
// Se prueban dos formas de prepararla y se queda la lectura que cuadra con el total del ticket
async function textFromImage(file,onProgress){
  await loadScript(TESSERACT);
  const img=await createImageBitmap(file), box=paperBox(img);
  const sc=Math.min(2.5,Math.max(1100,Math.min(1600,box.w))/box.w), c=document.createElement("canvas");
  c.width=Math.round(box.w*sc);c.height=Math.round(box.h*sc);
  const g=c.getContext("2d",{willReadFrequently:true});g.drawImage(img,box.x,box.y,box.w,box.h,0,0,c.width,c.height);
  const gray=toGray(g.getImageData(0,0,c.width,c.height));
  let pass=0,best=null;
  const worker=await Tesseract.createWorker("spa",1,{logger:m=>{if(m.status==="recognizing text"&&onProgress)onProgress(Math.min(1,(pass+m.progress)/2))}});
  try{
    await worker.setParameters({tessedit_pageseg_mode:"6",preserve_interword_spaces:"1"});
    for(const mode of ["local","contraste"]){
      g.putImageData(grayImage(g,gray,c.width,c.height,mode),0,0);
      const text=(await worker.recognize(c)).data.text, tk=parseTicket(text), score=ticketScore(tk);
      if(!best||score>best.score)best={text,score};
      if(tk.total!=null&&tk.lines.length&&Math.abs(tk.total-tk.sum)<0.05)break;   // ya cuadra: no hace falta otra pasada
      pass++;
    }
  }finally{worker.terminate()}
  return best.text;
}
// Dónde está el ticket en la foto: la zona más grande de papel (claro y sin color); si no está clara, la foto entera
function paperBox(img){
  const all={x:0,y:0,w:img.width,h:img.height};
  const k=Math.min(1,320/img.width),w=Math.round(img.width*k),h=Math.round(img.height*k),c=document.createElement("canvas");c.width=w;c.height=h;
  const g=c.getContext("2d",{willReadFrequently:true});g.drawImage(img,0,0,w,h);const d=g.getImageData(0,0,w,h).data;
  const v=[];for(let i=0;i<d.length;i+=16)v.push(Math.max(d[i],d[i+1],d[i+2]));v.sort((a,b)=>a-b);const hi=v[Math.floor(v.length*.97)]||255;
  const m=new Uint8Array(w*h);
  for(let p=0,i=0;p<w*h;p++,i+=4){const mx=Math.max(d[i],d[i+1],d[i+2]),mn=Math.min(d[i],d[i+1],d[i+2]);m[p]=mx>hi*.55&&mx-mn<mx*.09?1:0}
  // Zonas conectadas de papel; la más grande es el ticket
  const seen=new Uint8Array(w*h),st=[],comps=[];
  for(let p0=0;p0<w*h;p0++){if(!m[p0]||seen[p0])continue;
    let n=0,x0=w,y0=h,x1=0,y1=0;st.push(p0);seen[p0]=1;
    while(st.length){const p=st.pop(),x=p%w,y=(p-x)/w;n++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      for(const q of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(q>=0&&m[q]&&!seen[q]){seen[q]=1;st.push(q)}}
    if(n>w*h*.004)comps.push({n,x0,y0,x1,y1})}
  comps.sort((a,b)=>b.n-a.n);const bestN=comps[0]?comps[0].n:0;let bb=comps[0];
  if(!bb||bestN<w*h*.04)return all;
  // El código de barras o una línea gruesa parten el papel: se juntan los trozos que están justo encima o debajo, a lo ancho del ticket
  bb={...bb};for(let again=true;again;){again=false;
    for(const c of comps){if(c.x0>=bb.x0&&c.x1<=bb.x1&&c.y0>=bb.y0&&c.y1<=bb.y1)continue;
      const ov=Math.min(c.x1,bb.x1)-Math.max(c.x0,bb.x0),gapY=Math.max(c.y0-bb.y1,bb.y0-c.y1);
      if(ov>(bb.x1-bb.x0)*.6&&c.x1-c.x0<(bb.x1-bb.x0)*1.25&&gapY<(bb.y1-bb.y0)*.2){bb={n:bb.n,x0:Math.min(bb.x0,c.x0),y0:Math.min(bb.y0,c.y0),x1:Math.max(bb.x1,c.x1),y1:Math.max(bb.y1,c.y1)};again=true}}}
  // Y se sigue hacia arriba y hacia abajo mientras las filas, a lo ancho del ticket, sean casi todas papel (saltando el código de barras)
  const frac=y=>{let n=0;for(let x=bb.x0;x<=bb.x1;x++){const i=(y*w+x)*4,mx=Math.max(d[i],d[i+1],d[i+2]),mn=Math.min(d[i],d[i+1],d[i+2]);if(mx>hi*.6&&mx-mn<mx*.12)n++}return n/(bb.x1-bb.x0+1)};
  const gapMax=Math.round((bb.y1-bb.y0)*.12);
  for(let y=bb.y0-1;y>=0;y--){if(frac(y)>=.6){bb.y0=y;continue}let j=y-1;while(j>=Math.max(0,y-gapMax)&&frac(j)<.6)j--;if(j>=Math.max(0,y-gapMax)){bb.y0=j;y=j}else break}
  for(let y=bb.y1+1;y<h;y++){if(frac(y)>=.6){bb.y1=y;continue}let j=y+1;while(j<=Math.min(h-1,y+gapMax)&&frac(j)<.6)j++;if(j<=Math.min(h-1,y+gapMax)){bb.y1=j;y=j}else break}
  const bw=bb.x1-bb.x0+1,bh=bb.y1-bb.y0+1;if(bw*bh>w*h*.8)return all;
  const mx=Math.round(bw*.03),my=Math.round(bh*.02),x=Math.max(0,bb.x0-mx),y=Math.max(0,bb.y0-my);
  return {x:Math.round(x/k),y:Math.round(y/k),w:Math.round((Math.min(w,bb.x1+1+mx)-x)/k),h:Math.round((Math.min(h,bb.y1+1+my)-y)/k)};
}
function toGray(im){const d=im.data,g=new Uint8ClampedArray(d.length/4);for(let p=0,i=0;p<g.length;p++,i+=4)g[p]=d[i]*.3+d[i+1]*.59+d[i+2]*.11;return g}
// local: blanco y negro comparando cada punto con su alrededor (aguanta sombras); contraste: niveles estirados
function grayImage(ctx,gray,w,h,mode){
  const out=ctx.createImageData(w,h),o=out.data;let f;
  if(mode==="local"){
    const W=w+1,I=new Float64Array(W*(h+1));
    for(let y=0;y<h;y++){let r=0;for(let x=0;x<w;x++){r+=gray[y*w+x];I[(y+1)*W+x+1]=I[y*W+x+1]+r}}
    const R=Math.max(8,Math.round(w/28));
    f=(x,y)=>{const x0=Math.max(0,x-R),y0=Math.max(0,y-R),x1=Math.min(w,x+R+1),y1=Math.min(h,y+R+1);
      const mean=(I[y1*W+x1]-I[y0*W+x1]-I[y1*W+x0]+I[y0*W+x0])/((x1-x0)*(y1-y0));
      return gray[y*w+x]<mean*.84?0:255}}
  else{const v=[];for(let i=0;i<gray.length;i+=7)v.push(gray[i]);v.sort((a,b)=>a-b);const lo=v[Math.floor(v.length*.03)],hi=v[Math.floor(v.length*.9)]||255;
    f=(x,y)=>(gray[y*w+x]-lo)/Math.max(1,hi-lo)*255}
  for(let y=0,p=0;y<h;y++)for(let x=0;x<w;x++,p++){const c=f(x,y);o[p*4]=o[p*4+1]=o[p*4+2]=c;o[p*4+3]=255}
  return out;
}
// Cuánto se fía uno de una lectura: líneas leídas y, sobre todo, que sumen el total
const ticketScore=tk=>tk.lines.length+(tk.total!=null?2:0)+(tk.total!=null&&tk.lines.length&&Math.abs(tk.total-tk.sum)<0.05?30:0)+(tk.date?1:0);

/* ---------- Interpretar el ticket ---------- */
const MONEY=/(\d{1,4})\s?[,.]\s?(\d{2})(?![\d,.])/g;
const moneys=s=>[...s.matchAll(MONEY)].map(m=>({v:Number(m[1]+"."+m[2]),i:m.index}));
// Fecha: la primera que sea válida (en las fotos el 3 a veces se lee como 9)
function ticketDate(text){
  for(const m of text.matchAll(/\b(\d{1,2})\s?[\/.-]\s?(\d{1,2})\s?[\/.-]\s?(\d{4}|\d{2})\b/g)){
    let d=m[1],y=m[3];if(Number(d)>31&&d[0]==="9")d="3"+d[1];if(y.length===2)y="20"+y;
    const D=Number(d),M=Number(m[2]),Y=Number(y);
    if(D>=1&&D<=31&&M>=1&&M<=12&&Y>=2020&&Y<=2040)return `${Y}-${String(M).padStart(2,"0")}-${String(D).padStart(2,"0")}`}
  return null;
}
// Supermercado: por su nombre como palabra entera («DIA» no vale dentro de «MEDIANOS») o por el NIF de Mercadona.
// Primero se mira la cabecera (lo que antes aparece); los nombres cortos solo cuentan ahí
function ticketSuper(text){
  const find=(t,short)=>{const up=" "+normTxt(t)+" ";let best=null;
    for(const x of SUPERS||[])for(const n of x.nombre.split("/")){const k=" "+normTxt(n)+" ";if(!short&&k.length<=6)continue;const i=up.indexOf(k);if(i>=0&&(!best||i<best.i))best={id:x.id,i}}
    return best&&best.id};
  return find(text.split(/\r?\n/).slice(0,8).join(" "),true)||find(text,false)||(text.replace(/[\s-]/g,"").includes("46103834")?"mercadona":null);
}
// Descripción limpia: sin restos sueltos al final (signos o letras sueltas que deja la foto)
function cleanDesc(s){
  const t=s.replace(/[^\wÀ-ÿ.%/ ]/g," ").trim().split(/\s+/);
  while(t.length>1&&!/[A-ZÀ-Ý]{2}/i.test(t[t.length-1]))t.pop();
  return t.join(" ").replace(/^[^A-Z0-9À-Ý]+/i,"");
}
// Cualquier supermercado: elige la lectura que cuadra con el total (formato de Mercadona o el general)
function parseTicket(text){
  const raw=text.split(/\r?\n/).map(l=>l.replace(/[—–_|“”"'`´¿»«]/g," ").replace(/\s+/g," ").trim()).filter(Boolean);
  if(raw.some(l=>/NOMBRE PRODUCTO/i.test(l)))return parseOnline(raw,text);
  const a=parseMercadona(raw,text),ok=x=>x.total!=null&&x.lines.length&&Math.abs(x.total-x.sum)<0.05;
  if(ok(a)&&(!a.super||a.super==="mercadona"))return a;
  const b=parseGeneric(raw,text);
  return ok(b)&&!ok(a)?b:ok(a)&&!ok(b)?a:ticketScore(b)>ticketScore(a)?b:a;
}
// Nombre del súper cuando no es uno conocido: la primera línea con letras de la cabecera
function headName(raw){
  const l=raw.slice(0,6).find(x=>/[A-ZÀ-Ý]{3}/i.test(x)&&!/\b(C\/|CL\.?|CALLE|CARRER|AV\.?|AVDA|AVENIDA|NIF|CIF|TEL|FACTURA|TICKET|\d{5})\b/i.test(x)&&!/\d{2}[\/.-]\d{2}/.test(x));
  return l?cleanDesc(l).slice(0,40):"";
}
// Formato general (Lidl, Carrefour, Dia, Bonpreu, Condis, Consum…): "DESCRIPCIÓN  1,25 A", con la cantidad delante
// ("2 LECHE…"), en medio ("LECHE 2 x 0,89 1,78") o en la línea de al lado ("2 x 0,89"), el peso ("0,456 kg x 2,99 €/kg")
// y los descuentos ("Descuento -0,30") restando al producto de encima
function parseGeneric(raw,text){
  const out={date:ticketDate(text),total:null,lines:[],super:ticketSuper(text),store:""};
  const head=raw.slice(0,14);
  const street=head.find(l=>/\b(C\/|CL\.?|CALLE|CARRER|AV\.?|AVDA|AVENIDA|AVINGUDA|PZA|PLAZA|CTRA|PASEO|PASSEIG|RAMBLA)(?=[\s.,]|$)/i.test(l)),town=head.find(l=>/\b\d{5}\s+[A-ZÀ-Ý]{3}/i.test(l));
  const name=out.super?"":headName(raw);
  out.store=[name,street,town&&town!==street&&town.match(/\d{5}\s+(.+)/)[1]].filter(Boolean).map(cleanDesc).join(" · ").slice(0,80);
  const isTotal=l=>/^(?:\S{1,3}\s+)?(TOTAL|IMPORTE TOTAL|A PAGAR|TOTAL A PAGAR|TOTAL COMPRA)\b/i.test(l)&&!/SUB\s?TOTAL/i.test(l)&&moneys(l).length;
  let i1=raw.findIndex(isTotal);if(i1<0)i1=raw.length;
  const skip=/(SUB\s?TOTAL|FACTURA|\bNIF\b|\bCIF\b|TEL[EÉ]F|\bHORA\b|FECHA|\bCAJA\b|OPERACI|ATENDID|GRACIAS|WWW|HTTP|DEVOLUCI|CLIENTE|SOCIO|PUNTOS|\bIVA\b|BASE IMP|CUOTA|ART[IÍ]CULOS|UNIDADES|N[ºO°]\s?ART)/i;
  const qtyLine=/^(\d{1,3})(?:[,.]0{1,3})?\s*(?:UDS?|UN|U)?\.?\s*[xX*]\s*(\d{1,4}[,.]\d{2})\b/;
  const wRe=/(\d+[,.]\d{3})\s*KG?\b\.?\s*[xX*]?\s*(\d{1,4}[,.]\d{2})\s*(?:€|EUR)?\s*\/\s*KG/i;
  let last=null,pend=null;
  for(const l of raw.slice(0,i1)){
    if(skip.test(l)||/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/.test(l))continue;
    const ms=moneys(l),letters=/[A-ZÀ-Ý]{3}/i.test(l);
    const w=l.match(wRe);
    if(w&&!/[A-ZÀ-Ý]{4}/i.test(l.replace(/KG|EUR/gi,""))){const kg=num(w[1]),u=num(w[2]),amt=ms.length>2?ms[ms.length-1].v:Math.round(kg*u*100)/100;
      if(last&&Math.abs(last.amount-amt)<0.03){last.kg=kg;last.unit=u}else pend={kg,unit:u,amount:amt};continue}
    const q=l.match(qtyLine);
    if(q&&!letters){const n=Number(q[1]),u=num(q[2]),amt=ms.length>1?ms[ms.length-1].v:Math.round(n*u*100)/100;
      if(last&&Math.abs(last.amount-amt)<0.03&&last.qty===1){last.qty=n;last.unit=u}else pend={qty:n,unit:u,amount:amt};continue}
    if(!ms.length||!letters)continue;
    // Descuento: resta al producto de encima
    const neg=new RegExp("-\\s?"+String(ms[ms.length-1].v.toFixed(2)).replace(".","[,.]")).test(l);
    if(neg||/\b(DTO|DESCUENTO|DESC\.|PROMO|AHORRO|REBAJA|CUP[OÓ]N|OFERTA)\b/i.test(l)){if(last)last.amount=Math.round((last.amount-ms[ms.length-1].v)*100)/100;continue}
    let rest=l.slice(0,ms[ms.length-1].i).trim(),qty=1,unit=null;
    const lead=rest.match(/^(\d{1,2})\s*[xX]?\s+(?=[A-ZÀ-Ý])/i);if(lead){qty=Number(lead[1]);rest=rest.slice(lead[0].length)}
    // «LECHE 2 x 0,89»: la cantidad y el precio por unidad en medio
    const mid=rest.match(/\s(\d{1,3})\s*[xX*]\s*(\d{1,4}[,.]\d{2})\s*(?:€)?\s*$/);if(mid){qty=Number(mid[1]);unit=num(mid[2]);rest=rest.slice(0,mid.index)}
    else if(ms.length>1&&qty>1){unit=ms[ms.length-2].v;rest=l.slice(0,ms[ms.length-2].i).replace(/^(\d{1,2})\s*[xX]?\s+/,"")}
    const desc=cleanDesc(rest.replace(/\s+\d+[,.]\d{3}\s*KG.*$/i,""));if(!/[A-ZÀ-Ý]{3}/i.test(desc))continue;
    const it={qty,desc,unit,amount:ms[ms.length-1].v};
    if(pend&&Math.abs(pend.amount-it.amount)<0.03){Object.assign(it,pend.kg?{kg:pend.kg,unit:pend.unit}:{qty:pend.qty,unit:pend.unit})}
    pend=null;out.lines.push(it);last=it;
  }
  // Total: igual que en el de Mercadona
  const cands=[];
  for(const l of raw.slice(i1)){const ms=moneys(l);if(!ms.length)continue;
    if(isTotal(l)||/TARJETA|TARGETA|EFECTIVO|IMPORTE|VISA|MASTERCARD|PAGADO/i.test(l)&&!/ENTREGAD|CAMBIO/i.test(l))cands.push(ms[ms.length-1].v)}
  const sum=Math.round(out.lines.reduce((t,x)=>t+x.amount,0)*100)/100,freq=c=>cands.filter(x=>Math.abs(x-c)<0.005).length;
  out.total=cands.find(c=>Math.abs(c-sum)<0.05)??(cands.length?cands.slice().sort((a,b)=>freq(b)-freq(a))[0]:null);
  out.sum=sum;
  return out;
}
function parseMercadona(raw,text){
  // Ticket de papel. Formato de Mercadona: "2 HUEVOS GRANDES L  3,05  6,10" y, para lo que va al peso,
  // "1 PLATANO" seguido de "0,862 kg  2,15 €/kg  1,85". Vale en castellano y en catalán
  const out={date:ticketDate(text),total:null,lines:[],super:ticketSuper(text),store:""};
  const head=raw.slice(0,14);
  const street=head.find(l=>/\b(C\/|CL\.?|CALLE|CARRER|AV\.?|AVDA|AVENIDA|AVINGUDA|PZA|PLAZA|CTRA|PASEO|PASSEIG|RAMBLA)(?=[\s.,]|$)/i.test(l)),town=head.find(l=>/\b\d{5}\s+[A-ZÀ-Ý]{3}/i.test(l));
  out.store=[street,town&&town.match(/\d{5}\s+(.+)/)[1]].filter(Boolean).map(cleanDesc).join(" · ").slice(0,80);
  const isItem=l=>/^(?:[^\d\s]{1,2}\s+){0,3}\d{1,2}\s+[A-ZÀ-Ý]{2}/i.test(l);
  let i0=raw.findIndex(l=>/DESCRIP/i.test(l));if(i0<0)i0=raw.findIndex(isItem)-1;
  let i1=raw.findIndex((l,i)=>i>i0&&/^(?:\S{1,3}\s+)?(TOTAL|TARGETA|TARJETA|EFECTIVO|ENTREGA)/i.test(l));if(i1<0)i1=raw.length;
  let pending=null;
  for(const l of raw.slice(i0+1,i1)){
    if(/^(IVA|BASE|OP:|N\.?C|AID|ARC|DESCRIP)/i.test(l))continue;
    const w=l.match(/(\d+\s?[,.]\s?\d{3})\s*kg/i);
    if(w){const ms=moneys(l.slice(w.index+w[0].length)),target=pending||out.lines[out.lines.length-1];
      if(target&&ms.length){target.kg=num(w[1].replace(/\s/g,""));target.unit=ms.length>1?ms[0].v:null;target.amount=ms[ms.length-1].v}pending=null;continue}
    // Cantidad delante (a veces la foto mete restos o un número suelto antes: «7 1 GRANA…»); si no se lee, 1
    let m=l.match(/^(?:[^\d\s]{1,2}\s+){0,3}(\d{1,2})\s+(.+)$/);
    if(m){const n2=m[2].match(/^([1-9])\s+([A-ZÀ-Ý]{3}.*)$/i);if(n2)m=[m[0],n2[1],n2[2]]}
    else if(moneys(l).length&&/[A-ZÀ-Ý]{4}/i.test(l))m=[l,"1",l.replace(/^(?:\S{1,2}\s+){1,3}(?=[A-ZÀ-Ý]{3})/i,"")];
    if(!m)continue;
    const rest=m[2],ms=moneys(rest),desc=cleanDesc(ms.length?rest.slice(0,ms[0].i):rest);
    if(!/[A-ZÀ-Ý]{3}/i.test(desc))continue;
    const it={qty:Number(m[1])||1,desc,unit:ms.length>1?ms[ms.length-2].v:null,amount:ms.length?ms[ms.length-1].v:null};
    // Si el precio por unidad y el importe no cuadran, se guarda la otra posibilidad (para cuadrar con el total)
    if(it.unit&&it.qty>1&&Math.abs(it.unit*it.qty-it.amount)>0.02)it.alt=Math.round(it.unit*it.qty*100)/100;
    out.lines.push(it);pending=ms.length?null:it;
  }
  out.lines=out.lines.filter(x=>x.amount!=null);
  // Total: el que aparece en el ticket (TOTAL, pago con tarjeta, importe, base + IVA). Se queda el que cuadra con las líneas o el que más se repite
  const cands=[];
  for(const l of raw.slice(i1)){const ms=moneys(l);if(!ms.length)continue;
    if(/^(?:\S{1,3}\s+)?TOTAL/i.test(l)&&ms.length>=2)cands.push(Math.round((ms[ms.length-2].v+ms[ms.length-1].v)*100)/100);
    else if(/TOTAL|TARGETA|TARJETA|EFECTIVO|IMPORT/i.test(l))cands.push(ms[ms.length-1].v)}
  const sum=()=>Math.round(out.lines.reduce((t,x)=>t+x.amount,0)*100)/100;
  const gap=()=>cands.length?Math.min(...cands.map(c=>Math.abs(c-sum()))):Infinity;
  if(gap()>=0.05)for(const it of out.lines)if(it.alt!=null){const was=it.amount,g0=gap();it.amount=it.alt;if(gap()>=g0)it.amount=was}
  const freq=c=>cands.filter(x=>Math.abs(x-c)<0.005).length;
  out.total=cands.find(c=>Math.abs(c-sum())<0.05)??(cands.length?cands.slice().sort((a,b)=>freq(b)-freq(a))[0]:null);
  out.sum=sum();
  return out;
}
// Pedido online (PDF de Mercadona): "Nombre del producto  cantidad  importe €", el coste de preparación o envío y el TOTAL.
// La dirección y los datos personales del pedido no se guardan
function parseOnline(raw,text){
  const out={date:ticketDate(text),total:null,lines:[],super:ticketSuper(text),store:"Pedido online",online:true};
  let on=false;
  for(const l of raw){
    if(/NOMBRE PRODUCTO/i.test(l)){on=true;continue}
    if(/^PRODUCTOS\s/i.test(l)){on=false;continue}
    const t=l.match(/^TOTAL\s+(\d{1,4}[,.]\d{2})/i);if(t){if(out.total==null)out.total=num(t[1]);continue}   // el primero: el otro es el del IVA
    const f=l.match(/^(COSTE DE PREPARACI[OÓ]N|COSTE DE ENV[IÍ]O|GASTOS DE ENV[IÍ]O|ENV[IÍ]O)\s+(\d{1,4}[,.]\d{2})/i);
    if(f){out.lines.push({qty:1,desc:f[1],unit:null,amount:num(f[2]),fee:true});continue}
    if(!on)continue;
    const m=l.match(/^(.+?)\s+(\d{1,3})\s+(\d{1,4}[,.]\d{2})\s*€?$/);
    if(m)out.lines.push({qty:Number(m[2]),desc:m[1].trim(),unit:null,amount:num(m[3])});
  }
  out.sum=Math.round(out.lines.reduce((t,x)=>t+x.amount,0)*100)/100;
  return out;
}

/* ---------- Relacionar cada línea con un producto ---------- */
// Tickets en catalán: cada palabra a su nombre en castellano (el catálogo está en castellano)
const CAT={TRUITA:"TORTILLA",FORMATGE:"QUESO",FORMATGES:"QUESOS",OUS:"HUEVOS",OU:"HUEVO",QUS:"HUEVOS","0US":"HUEVOS",DUS:"HUEVOS",MITJANS:"MEDIANOS",GRANS:"GRANDES",PASTANAGA:"ZANAHORIA",PASTANAGUES:"ZANAHORIAS",
  BOSSA:"BOLSA",LLIMONA:"LIMON",LLIMONES:"LIMONES",RATLLAT:"RALLADO",SALSIT:"SALCHICHA",SALSITXES:"SALCHICHAS",PLASTIC:"PLASTICO",POMA:"MANZANA",POMES:"MANZANAS",PLATAN:"PLATANO",
  CEBA:"CEBOLLA",CEBES:"CEBOLLAS",ALL:"AJO",ALLS:"AJOS",PEBROT:"PIMIENTO",ENCIAM:"LECHUGA",TOMAQUET:"TOMATE",TOMAQUETS:"TOMATES",LLET:"LECHE",PA:"PAN",POLLASTRE:"POLLO",PIT:"PECHUGA",
  VEDELLA:"TERNERA",PORC:"CERDO",PEIX:"PESCADO",LLUC:"MERLUZA",SALMO:"SALMON",TONYINA:"ATUN",ARROS:"ARROZ",MONGETES:"ALUBIAS",CIGRONS:"GARBANZOS",LLENTIES:"LENTEJAS",OLI:"ACEITE",
  SUCRE:"AZUCAR",FARINA:"HARINA",IOGURT:"YOGUR",IOGURTS:"YOGURES",MANTEGA:"MANTEQUILLA",XOCOLATA:"CHOCOLATE",GALETES:"GALLETAS",CARBASSO:"CALABACIN",ALBERGINIA:"BERENJENA",
  ESPINACS:"ESPINACAS",BROQUIL:"BROCOLI",CARXOFA:"ALCACHOFA",MAJONESA:"MAHONESA",CONGELAT:"CONGELADO",FUMAT:"AHUMADO",PERNIL:"JAMON",CUIT:"COCIDO",GALL:"PAVO",
  FILET:"FILETE",FILETS:"FILETES",LLESQUES:"LONCHAS",AIGUA:"AGUA",SUC:"ZUMO",TARONJA:"NARANJA",TARONGES:"NARANJAS",MADUIXES:"FRESAS",RAIM:"UVA",PRESSEC:"MELOCOTON",CARBASSA:"CALABAZA",
  PESOLS:"GUISANTES",FIDEUS:"FIDEOS",MACARRONS:"MACARRONES",TAC:"TACO",TACS:"TACOS",FAM:"FAMILIAR",F:"FAMILIAR",NEGRE:"NEGRO",BLANC:"BLANCO",VERD:"VERDE",VERMELL:"ROJO",
  FRUITS:"FRUTOS",ENTREPA:"BOCADILLO",PIZZES:"PIZZAS",CARN:"CARNE",MANDARINES:"MANDARINAS",PERES:"PERAS",CINDRIA:"SANDIA",MELO:"MELON",COGOMBRE:"PEPINO",PATATES:"PATATAS",
  FREGIDES:"FRITAS",BOTIFARRA:"BUTIFARRA",LLONGANISSA:"LONGANIZA",SENCERA:"ENTERA",SENCER:"ENTERO",DESNATADA:"DESNATADA",SEMIDESNATADA:"SEMIDESNATADA",
  NEGRA:"NEGRO",PAGES:"PAYES",OLIVES:"ACEITUNAS",NOUS:"NUECES",AMETLLES:"ALMENDRAS",CALAMARS:"CALAMARES",GAMBES:"GAMBAS",MUSCLOS:"MEJILLONES",PREPARAT:"PREPARADO"};
const ABBR={Q:"QUESO",PECH:"PECHUGA",FTE:"FILETE",FTES:"FILETES",HAC:"HACENDADO",CONG:"CONGELADO",ULTRAC:"ULTRACONGELADO",SEMI:"SEMIDESNATADA",DESN:"DESNATADA",NAT:"NATURAL",TOM:"TOMATE",PAT:"PATATA",ESP:"ESPINACA",CHAMP:"CHAMPINON",ZANAH:"ZANAHORIA",GARB:"GARBANZO",LENT:"LENTEJA"};
async function loadCatalog(){
  if(MC)return MC;
  const d=await getJSON("data/mercadona.json");
  const idx=new Map(), toks=d.p.map(([id,name])=>normTxt(name).split(" ").filter(t=>t.length>=3));
  toks.forEach((ts,i)=>{for(const t of ts){const k=t.slice(0,4);if(!idx.has(k))idx.set(k,new Set());idx.get(k).add(i)}});
  MC={...d,toks,idx};return MC;
}
// Dos palabras son la misma si son iguales o una empieza por la otra (abreviada), con al menos 4 letras («MAC» no es «MACARRONES»)
const tokSame=(c,t)=>c===t||c.length>=4&&t.length>=4&&(c.startsWith(t)||t.startsWith(c));
// Palabras que no dicen qué producto es
const NOISE=new Set(["PACK","UNIDADES","UNIDAD","UDS","APROX","BANDEJA","MALLA","GRS","CLASICO","CLASICA","FORMATO","AHORRO","OFERTA"]);
// Palabras de una línea del ticket, ya en castellano y sin abreviaturas
function lineTokens(desc){
  // Sin tamaños ni cantidades («500G», «1KG», «12U»): no dicen qué producto es
  const ts=normTxt(desc).split(" ").map(t=>CAT[t]||ABBR[t]||t).filter(t=>t.length>=3&&!/^\d/.test(t));
  // Huevos: en la foto «OUS» sale a veces como «OS», «QUS»…; la docena y el tamaño lo delatan
  if(!ts.includes("HUEVOS")&&/\b(6|12|18|24|30|17)\b/.test(normTxt(desc))&&ts.some(t=>/^(MEDIANOS|GRANDES|MITJANS|GRANS)$/.test(t)))ts.push("HUEVOS");
  // La talla de los huevos con una letra: M, L, XL
  if(ts.includes("HUEVOS")&&!ts.some(t=>/^(MEDIANOS|GRANDES)$/.test(t))){const sz=normTxt(desc).match(/\b(XL|L|M)\b/);if(sz)ts.push({M:"MEDIANOS",L:"GRANDES",XL:"SUPER"}[sz[1]])}
  return ts;
}
// Productos de Táper con su nombre real en otro súper (los que tienen precio): se miran antes que el catálogo de Mercadona
const SUPIDX={};
function superIndex(sid){
  if(SUPIDX[sid])return SUPIDX[sid];
  const ps=PS&&PS.supers&&PS.supers[sid]&&PS.supers[sid].productos;if(!ps)return null;
  const brand=new Set(normTxt(superById(sid).nombre).split(" "));
  return SUPIDX[sid]=Object.entries(ps).filter(([pid,x])=>P[pid]&&x.nombre).map(([pid,x])=>({pid,x,ct:lineTokens(x.nombre).filter(t=>!brand.has(t)&&!NOISE.has(t))}));   // igual que las líneas (la talla de los huevos, sin tamaños)
}
function superMatch(ts,sid){
  const idx=superIndex(sid);if(!idx)return null;const brand=new Set(normTxt(superById(sid).nombre).split(" "));
  const tt=ts.filter(t=>!brand.has(t)&&!/^\d/.test(t));if(!tt.length)return null;let best=null;
  for(const e of idx){let hit=0;for(const t of tt)if(e.ct.some(c=>tokSame(c,t)))hit++;if(!hit)continue;
    const sc=hit/tt.length+0.15*hit/Math.max(1,e.ct.length);if(!best||sc>best.sc)best={sc,e}}
  if(!best||best.sc<0.6)return null;
  return {mid:null,name:best.e.x.nombre,group:P[best.e.pid].aisle,food:true,pid:best.e.pid,score:Math.round(best.sc*100)/100,sup:sid};
}
// sid: el súper del ticket. Primero sus productos (nombre real) y, si no, el más parecido de Mercadona
function matchLine(desc,sid){
  const ours=new Set(Object.values(P).map(p=>p.mid).filter(Boolean));
  // Las marcas de los súper («CONDIS», «DIA»…) no dicen qué producto es
  const brands=new Set((SUPERS||[]).flatMap(x=>normTxt(x.nombre).split(" ")).filter(t=>t.length>=3&&t!=="MERCADONA"));
  const ts=lineTokens(desc).filter(t=>!brands.has(t)&&!NOISE.has(t));
  if(!ts.length)return null;
  if(sid&&sid!=="mercadona"){const m=superMatch(ts,sid);if(m)return m}
  const cand=new Set();for(const t of ts){const s=MC.idx.get(t.slice(0,4));if(s)for(const i of s)cand.add(i)}
  let best=null;
  for(const i of cand){const ct=MC.toks[i];
    let hit=0;for(const t of ts)if(ct.some(c=>tokSame(c,t)))hit++;
    const sc=hit/ts.length+0.15*hit/Math.max(1,ct.length)+(ours.has(MC.p[i][0])?0.12:0);
    if(!best||sc>best.sc)best={sc,i}}
  if(!best||best.sc<0.55)return null;
  const [mid,name,ci]=MC.p[best.i],cat=MC.cats[ci];
  const pid=Object.values(P).find(p=>p.mid===mid)?.id||null;
  return {mid,name,group:cat.g,food:cat.food,pid,score:Math.round(best.sc*100)/100};
}

/* ---------- Ver el ticket, corregirlo y guardarlo ---------- */
// online: la compra se hizo por internet, así que el ticket es un PDF o una captura (se ofrece primero subirlo)
// ctx {m,key}: la compra desde la que se sube (si no, se deduce de la fecha del ticket). Se puede subir cuando sea, también días después
function openTicketScan(online,shared,ctx){
  const up=`<label class="btn ${online?"":"ghost"} wide">${ico("receipt")} Subir PDF o captura<input type="file" accept="application/pdf,.pdf,image/*" id="tkFile" hidden></label>`;
  const ph=`<label class="btn ${online?"ghost":""} wide">${ico("camera")} Hacer foto al ticket<input type="file" accept="image/*" capture="environment" id="tkImg" hidden></label>`;
  showDialog(`<div class="mod">${closeBtn}<h2>Sube tu ticket</h2><p class="small" style="margin-top:-4px">De cualquier supermercado${ctx&&ctx.key==="suelta"?", también de una compra que no estaba en la lista":""}.</p>
    <p class="small muted">${online?"Si compraste online, sube el PDF del ticket o la factura que te enviaron por correo (o que descargas en su app), o una captura de pantalla.":"Hazle una foto al ticket de papel, bien plano y con luz. Si es un ticket digital, sube el PDF o una captura."} Se lee en tu móvil. Solo se envían, sin datos personales, los precios que no cuadran, para corregirlos para todos. Puedes subirlo cuando quieras, aunque sea días después. Los de los últimos 10 días te dan 3 coins.</p>
    <div class="actions" style="flex-direction:column;align-items:stretch">${online?up+ph:ph+up}</div>
    ${online&&!isIOS()?`<p class="small muted">También puedes compartirlo directamente: en el correo o en la app del súper, toca Compartir en el PDF y elige Táper.</p>`:""}
    <div id="tkState" class="small muted"></div></div>`);
  const go=async file=>{if(!file)return;const st=dlg.querySelector("#tkState");
    try{
      st.textContent="Preparando…";await loadCatalog();
      let text;
      if(file.type==="application/pdf"||/\.pdf$/i.test(file.name)){st.textContent="Leyendo el PDF…";text=await textFromPdf(file)}
      else{st.textContent="Leyendo la foto… la primera vez tarda un poco más";text=await textFromImage(file,p=>st.textContent=`Leyendo la foto… ${Math.round(p*100)} %`)}
      const tk=parseTicket(text);
      if(!tk.lines.length){st.innerHTML="No he encontrado líneas de productos. Prueba con otra foto más nítida y plana, o con el PDF.";return}
      for(const l of tk.lines){
        // Bolsas de la caja y costes del pedido (preparación, envío): no son comida
        if(l.fee||/^(BOSSA|BOLSA)\b/i.test(l.desc)&&l.amount/Math.max(1,l.qty)<=0.5){l.match=null;l.food=false;l.pid=null;l.group=l.fee?"Preparación y envío":"Bolsas";continue}
        l.match=matchLine(l.desc,tk.super);l.food=l.match?l.match.food:true;l.pid=l.match?l.match.pid:null;l.group=l.match?l.match.group:"Sin identificar"}
      openTicketReview(tk,text,ctx);
    }catch(e){st.textContent="No se ha podido leer: "+e.message+". Comprueba la conexión (la primera vez se descarga el lector)."}};
  dlg.querySelector("#tkImg").onchange=e=>go(e.target.files[0]);
  if(shared)go(shared);
  dlg.querySelector("#tkFile").onchange=e=>go(e.target.files[0]);
}
function ticketListFor(date){
  const m=date.slice(0,7), weeks=weeksInMonth(m);
  const wi=weeks.findIndex(s=>date>=s&&date<addDays(s,7));
  return {m,key:wi>=0?String(wi):"mes",weeks};
}
function openTicketReview(tk,text,ctx){
  let date=tk.date||todayISO(),dest=ctx&&ctx.m?{m:ctx.m,key:String(ctx.key),weeks:weeksInMonth(ctx.m)}:ticketListFor(date);
  const prods=Object.values(P).sort((a,b)=>a.name.localeCompare(b.name));
  const draw=()=>{
    const inList=listPids(dest.m);
    const food=tk.lines.filter(l=>l.food), foodT=food.reduce((t,l)=>t+l.amount,0), nonT=tk.lines.filter(l=>!l.food).reduce((t,l)=>t+l.amount,0);
    const diff=tk.total!=null?Math.round((tk.total-tk.sum)*100)/100:0;
    showDialog(`<div class="mod">${closeBtn}<h2>Ticket del ${esc(longDate(date))}</h2>
      ${tk.date?"":`<div class="warnbox">No he podido leer bien la fecha: comprueba que es la de la compra.</div>`}
      <p>Comida: <b>${eur(foodT)}</b>${nonT?` · No es comida (no se cuenta): ${eur(nonT)}`:""}${tk.total!=null?` · Total del ticket: ${eur(tk.total)}`:""}</p>
      ${Math.abs(diff)>0.05?`<div class="warnbox">Las líneas leídas suman ${eur(tk.sum)} y el ticket dice ${eur(tk.total)}: puede que alguna línea no se haya leído bien. Revisa y corrige.</div>`:""}
      <div class="row"><div class="field" style="flex:1"><label>Supermercado</label><select id="tkSuper">${(SUPERS||[]).map(x=>`<option value="${x.id}" ${tk.super===x.id?"selected":""}>${esc(x.nombre)}</option>`).join("")}<option value="otro" ${!tk.super?"selected":""}>Otro</option></select></div>
        <div class="field" style="flex:1.4"><label>Tienda</label><input type="text" id="tkStore" value="${esc(tk.store)}" placeholder="Dirección o barrio"></div></div>
      <div class="field"><label for="tkDate">Fecha de la compra</label><input type="date" id="tkDate" value="${esc(date)}" max="${todayISO()}"></div>
      <div class="field"><label>¿De qué compra es?</label><select id="tkList"><option value="suelta" ${dest.key==="suelta"?"selected":""}>Compra suelta (fuera de la lista)</option><option value="mes" ${dest.key==="mes"?"selected":""}>Compra del mes</option>${dest.weeks.map((s,i)=>`<option value="${i}" ${dest.key===String(i)?"selected":""}>Semana del ${shortDate(s)}</option>`).join("")}</select></div>
      <table class="wtable">${tk.lines.map((l,i)=>`<tr><td>${l.qty} × ${esc(l.desc)}${l.kg?` <span class="small muted">${String(l.kg).replace(".",",")} kg</span>`:""}
        <div class="small muted">${esc(l.match?l.match.name:"Sin identificar")} · ${esc(l.group)}${priceCheckHTML(l,tk.super)}${l.food&&!(l.pid&&inList.has(l.pid))?` · <b style="color:var(--accent)">fuera de la lista</b>`:""}</div>
        <select data-tkp="${i}" style="margin-top:4px;padding:4px 6px"><option value="">${l.food?"Comida (otro producto)":"No es comida"}</option>${prods.map(p=>`<option value="${p.id}" ${l.pid===p.id?"selected":""}>${esc(p.name)}</option>`).join("")}</select></td>
        <td style="vertical-align:top">${eur(l.amount)}<br><button class="chip" data-tkf="${i}" aria-pressed="${l.food}" style="margin-top:4px;font-size:.75rem">${l.food?"🍽️ Comida":"🧴 No"}</button></td></tr>`).join("")}</table>
      <div class="actions"><button class="btn" id="tkSave">Guardar ticket</button></div>
      <details class="small muted"><summary>Texto leído</summary><pre style="white-space:pre-wrap">${esc(text.slice(0,3000))}</pre></details></div>`);
    dlg.querySelectorAll("[data-tkf]").forEach(b=>b.onclick=()=>{const l=tk.lines[b.dataset.tkf];l.food=!l.food;if(!l.food)l.pid=null;draw()});
    dlg.querySelectorAll("[data-tkp]").forEach(s=>s.onchange=()=>{const l=tk.lines[s.dataset.tkp];l.pid=s.value||null;l.manual=true;if(l.match&&l.match.pid!==l.pid)l.match={...l.match,sup:null};if(l.pid){l.food=true;l.group=P[l.pid].aisle}draw()});
    dlg.querySelector("#tkList").onchange=e=>{dest={...dest,key:e.target.value}};
    dlg.querySelector("#tkDate").onchange=e=>{if(!e.target.value)return;date=e.target.value;tk.date=date;if(!(ctx&&ctx.m))dest=ticketListFor(date);const y=dlg.scrollTop;draw();dlg.scrollTop=y};
    // Otro súper: se vuelve a reconocer cada línea con sus productos (menos las que has cambiado a mano)
    dlg.querySelector("#tkSuper").onchange=e=>{tk.super=e.target.value==="otro"?null:e.target.value;
      for(const l of tk.lines)if(!l.manual&&!l.fee&&l.group!=="Bolsas"){l.match=matchLine(l.desc,tk.super);l.food=l.match?l.match.food:true;l.pid=l.match?l.match.pid:null;l.group=l.match?l.match.group:"Sin identificar"}
      const y=dlg.scrollTop;draw();dlg.scrollTop=y};
    dlg.querySelector("#tkStore").onchange=e=>{tk.store=e.target.value.trim()};
    dlg.querySelector("#tkSave").onclick=()=>saveTicket(tk,date,dest);
  };
  draw();
}
// Envase del producto en ese súper (en la unidad de Táper)
const supEnv=(sid,pid)=>{const x=PS&&PS.supers&&PS.supers[sid]&&PS.supers[sid].productos[pid];return x&&x.envase>0?x.envase:null};
// Lo pagado por envase y el precio que tenemos de ese súper para el mismo envase (si la línea es de un producto suyo, su envase; si no, el de Táper)
function ticketRef(l,sid){
  if(!l.pid||!P[l.pid]||!(l.amount>0)||!sid)return null;const p=P[l.pid];
  const own=l.env||(l.match&&l.match.sup===sid&&l.match.pid===l.pid?supEnv(sid,l.pid):null);
  if(own&&sid!=="mercadona"){const x=PS.supers[sid].productos[l.pid];const paid=l.kg&&p.unit==="g"?l.amount/l.kg*(own/1000):l.amount/Math.max(1,l.qty||1);return {paid,ref:x.precio}}
  const ref=superPrice(sid,l.pid);if(!(ref>0))return null;
  const paid=l.kg&&p.unit==="g"?l.amount/l.kg*(p.env/1000):l.amount/Math.max(1,l.qty||1);
  return {paid,ref};
}
// En la revisión: lo que costaba en ese súper y si pagaste más o menos
function priceCheckHTML(l,sid){
  const rc=ticketRef(l,sid);if(!rc)return "";const d=(rc.paid-rc.ref)/rc.ref,nm=esc(superById(sid).nombre.split(" /")[0]);
  return ` · en ${nm} ${eur(rc.ref)}${Math.abs(d)>=0.08?` <b style="color:${d>0?"var(--accent)":"var(--ok)"}">${d>0?"▲":"▼"} pagaste ${Math.round(Math.abs(d)*100)} % ${d>0?"más":"menos"}</b>`:" ✓"}`;
}
// Revisión interna de precios: si lo pagado no cuadra con el precio que usa la app, se manda al servidor
// para revisarlo. No cambia nada en la app de nadie.
function reportTicketPrices(t){
  if(typeof servidorOn!=="function"||!servidorOn())return;
  const sid=(SUPERS||[]).some(x=>x.id===t.super)?t.super:null, items=[];if(!sid)return;   // de un súper que no conozco no se comparan precios
  for(const l of t.lines){
    const rc=ticketRef(l,sid);if(!rc)continue;const {paid,ref:ours}=rc;
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
  // Comida que no estaba en ninguna lista del mes: compra de más (cuenta como gastado y como que la tienes en casa)
  const inList=listPids(dest.m);
  const lines=tk.lines.map(l=>({qty:l.qty,desc:l.desc,amount:l.amount,kg:l.kg||null,food:l.food,pid:l.pid||null,mid:l.match?l.match.mid:null,name:l.match?l.match.name:null,env:l.match&&l.match.sup&&l.match.pid===l.pid?supEnv(l.match.sup,l.pid):null,group:l.pid?P[l.pid].aisle:l.group,extra:!!(l.food&&!(l.pid&&inList.has(l.pid)))}));
  const t={id:uid("t"),date,m:dest.m,list:dest.key,super:tk.super||"otro",store:tk.store||"",total:tk.total,food:Math.round(lines.filter(l=>l.food).reduce((s,l)=>s+l.amount,0)*100)/100,lines};
  S.tickets.push(t);
  if(S.ticketSkip)delete S.ticketSkip[dest.m+"|"+dest.key];
  reportTicketPrices(t);
  rewardTicket(t);
  // Lo pagado de esa lista = suma de sus tickets (solo comida)
  S.spent[dest.m+"|"+dest.key]=Math.round(S.tickets.filter(x=>x.m===dest.m&&x.list===dest.key).reduce((s,x)=>s+x.food,0)*100)/100;
  // Marca como comprado lo de la lista que aparece en el ticket
  if(dest.key!=="suelta")for(const l of lines)if(l.pid&&!l.extra)S.checks[checkKey(dest.m,dest.key,l.pid)]=true;
  save();dlg.close();render();
  const ex=lines.filter(l=>l.extra&&l.amount>0);
  if(ex.length)setTimeout(()=>askExtras(t,ex),250);else toast("Ticket guardado: "+eur(t.food)+" en comida");
}
// Productos de las listas de un mes (para saber qué del ticket estaba fuera)
function listPids(m){const out=new Set();try{for(const l of Object.values(shopping(m).lists))for(const it of l.items)out.add(it.pid)}catch(e){}return out}
const nextMonthKey=m=>{const [y,mo]=m.split("-").map(Number);return mo===12?`${y+1}-01`:`${y}-${String(mo+1).padStart(2,"0")}`};
// Lo comprado de más: ya cuenta como gastado; se pregunta si se va a comprar también otros meses
function askExtras(t,ex){
  const choice=ex.map(l=>{const same=(S.recurring||[]).find(r=>r.pid?r.pid===l.pid:r.desc===(l.name||l.desc));return same?same.freq:"no"});
  // El nombre del producto real (no el texto abreviado o en catalán del ticket)
  const name=l=>l.pid?P[l.pid].name:l.name||l.desc.charAt(0)+l.desc.slice(1).toLowerCase();
  const draw=()=>{
    showDialog(`<div class="mod">${closeBtn}<div class="veb">Ticket guardado · ${eur(t.food)} en comida</div><h2 class="vh" style="font-size:1.7rem">Has comprado cosas <em>fuera de la lista</em></h2>
      <p class="small">Ya cuentan en lo que has gastado (${eur(ex.reduce((s,l)=>s+l.amount,0))})${ex.some(l=>l.pid)?" y las que conozco las apunto como que las tienes en casa":""}. Tu menú no cambia.</p>
      <p><b>¿Las vas a comprar también otros meses?</b> Si me dices que sí, las añado a la lista de la compra a partir de ${esc(monthName(nextMonthKey(t.m)).toLowerCase())} y las cuento en el presupuesto.</p>
      ${ex.map((l,i)=>`<div class="exrow"><div><b>${esc(name(l))}</b> <span class="small muted">· ${l.kg?String(l.kg).replace(".",",")+" kg":l.qty+" ud"} · ${eur(l.amount)}</span></div>
        <div class="chips">${[["no","Solo esta vez"],["semana","Cada semana"],["mes","Cada mes"]].map(([k,tx])=>chip("data-exf",i+"|"+k,choice[i]===k,tx)).join("")}</div></div>`).join("")}
      <div class="actions"><button class="btn wide" id="exOk">Guardar</button></div></div>`);
    dlg.querySelectorAll("[data-exf]").forEach(b=>b.onclick=()=>{const [i,k]=b.dataset.exf.split("|");choice[i]=k;const y=dlg.scrollTop;draw();dlg.scrollTop=y});
    dlg.querySelector("#exOk").onclick=()=>{
      S.recurring=S.recurring||[];let n=0;
      ex.forEach((l,i)=>{const k=choice[i];S.recurring=S.recurring.filter(r=>!(r.pid?r.pid===l.pid:r.desc===(l.name||l.desc)));
        if(k==="no")return;n++;
        S.recurring.push({id:uid("r"),pid:l.pid||null,desc:l.name||l.desc,amount:l.amount,q:l.pid?lineQty(l):0,freq:k,from:nextMonthKey(t.m)})});
      save();dlg.close();render();toast(n?`Añadido a tu compra a partir de ${monthName(nextMonthKey(t.m)).toLowerCase()}`:"Apuntado solo esta vez")};
  };
  draw();
}
// En la compra del mes: lo que compras siempre fuera del menú, para poder quitarlo
function recurringHTML(m){
  const rs=recurringFor(m);if(!rs.length)return "";
  return `<div class="card"><h2>Lo que compras siempre</h2><p class="small muted">Cosas fuera del menú que me dijiste al subir un ticket. Ya están en la lista y en el presupuesto.</p>
    ${rs.map(r=>`<div class="fixed"><span>${esc(r.pid&&P[r.pid]?P[r.pid].name:r.desc.charAt(0)+r.desc.slice(1).toLowerCase())}<small>${r.freq==="semana"?"Cada semana":"Cada mes"} · unos ${eur(r.pid&&P[r.pid]?packsFor(r.pid,r.q)*price(r.pid):r.amount)}${r.pid&&P[r.pid]?"":" (no lo tengo en el catálogo: lo sumo al gasto)"}</small></span><button class="btn ghost small" data-rdel="${r.id}">Quitar</button></div>`).join("")}</div>`;
}
function bindRecurring(){
  document.querySelectorAll("[data-rdel]").forEach(b=>b.onclick=()=>{S.recurring=(S.recurring||[]).filter(r=>r.id!==b.dataset.rdel);save();render();toast("Quitado de tu compra")});
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
  let h=`<div class="card"><h2>Tickets</h2><button class="btn wide" id="tkScan">${ico("receipt")} Subir un ticket (foto, captura o PDF)</button>`;
  if(!sp)return h+`<p class="small muted">Sube tus tickets (foto, captura o PDF) y verás en qué se va el dinero. Lo que no es comida se descarta solo.</p></div>`;
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
  const b=document.getElementById("tkScan");if(b)b.onclick=()=>openTicketScan(true);
  document.querySelectorAll("[data-tkdel]").forEach(x=>x.onclick=()=>{if(!confirm("¿Borrar este ticket?"))return;
    const t=S.tickets.find(t=>t.id===x.dataset.tkdel);S.tickets=S.tickets.filter(y=>y!==t);
    const k=t.m+"|"+t.list,rest=S.tickets.filter(y=>y.m===t.m&&y.list===t.list);if(rest.length)S.spent[k]=rest.reduce((s,y)=>s+y.food,0);else delete S.spent[k];
    save();render()});
}

// Ticket que llega compartido desde otra app (Android): el service worker lo deja guardado y aquí se lee
async function checkSharedTicket(){
  if(new URLSearchParams(location.search).get("ticket")!=="compartido")return false;
  history.replaceState(null,"",location.pathname);
  try{const c=await caches.open("taper-meta"),r=await c.match("/__ticket-compartido");if(!r){toast("No me ha llegado el ticket. Prueba a subirlo desde Compra");return true}
    const b=await r.blob(),name=decodeURIComponent(r.headers.get("X-Nombre")||"ticket");await c.delete("/__ticket-compartido");
    tab="compra";render();openTicketScan(true,new File([b],name,{type:b.type}));
  }catch(e){toast("No se ha podido abrir el ticket compartido")}
  return true;
}
