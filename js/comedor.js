/* Táper · Menú del comedor: lo que comen los niños en el cole, para que su cena en casa no repita el mismo tipo de comida.
   S.comedor = {[idNiño]: {"AAAA-MM-DD": {txt:"Lentejas estofadas · Merluza al horno", tipos:["legumbre","pescado"], postre:"fruta", kcal:650}}}
   S.comedorCfg = {[idNiño]: {variante:"Basal"}}: el menú que se eligió (PDFs con un menú por página: sin gluten, halal…)
   Se sube el menú del mes (PDF o foto) o se escribe a mano; se lee en el móvil, se revisa día a día y se guarda.
   Las cenas con ese niño evitan los platos de los mismos tipos (plan.js: candidates, scoreRecipe y pickFor). */
"use strict";

/* ---------- Tipos de comida ---------- */
const CTIPOS={pasta:["🍝","Pasta"],arroz:["🍚","Arroz"],legumbre:["🫘","Legumbre"],patata:["🥔","Patata"],pescado:["🐟","Pescado"],pollo:["🍗","Pollo o pavo"],
  carne:["🥩","Carne"],huevo:["🥚","Huevo"],verdura:["🥦","Verdura o crema"],fritos:["🍕","Pizza o fritos"]};
const CNOUN={pasta:"pasta",arroz:"arroz",legumbre:"legumbre",patata:"patata",pescado:"pescado",pollo:"pollo",carne:"carne",huevo:"huevo",verdura:"verdura",fritos:"fritos"};
const CPOSTRE={fruta:"🍎 Fruta",yogur:"🥛 Yogur",lacteo:"🍮 Lácteo",dulce:"🍰 Dulce"};
const cNorm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/ñ/g,"n").replace(/l·l/g,"ll");
// Palabras de cada tipo, en castellano y en catalán (sin tildes)
const CKW={
  pasta:/\b(macarron|espagueti|spaghetti|fideo|fideu|fideua|lasan|tallarin|canelon|pasta\b|pastas\b|tortellini|raviol|noqui|gnocchi|penne|helices|plumas|lazos|espiral|tiburones|caracolas|estrellitas|galets|maravilla|pistons|llacets|nuggets de pasta)/,
  arroz:/\b(arroz|arros|paella|risotto)\b/,
  legumbre:/\b(lenteja|garbanzo|alubia|judias (blancas|pintas|rojas)|judion|fabada|potaje|(?<!jamon )cocido\b|hummus|pochas|frijol|caparron|habichuela|fabes|llenties|llentia|cigro|monget(?:a|es) (?:blanques|blanca|seques|pintes|del ganxet)|judias? blancas?|fesol|escudella)/,
  patata:/\b(patata|patates|papas\b|cachelo)/,
  pescado:/\b(merluza|bacalao|salmon|atun|pescado|abadejo|calamar|sepia|lenguado|panga|pescadilla|rape\b|dorada|lubina|caballa|sardina|boqueron|bonito|gamba|langostino|mejillon|marisco|surimi|palometa|bacaladilla|fogonero|perca|tilapia|emperador|pez espada|chipiron|gallo\b|jurel|trucha de rio|pota\b|chopitos|lluc|seito|rap\b|bacalla|peix|tonyina|salmo\b|sardines|musclos|gambes|llenguado|orada|llobarro|verat|maira|calamars|anxov)/,
  pollo:/\b(pollo|pavo|pechuga|contramuslo|muslo|alitas|pollastre|gall dindi|indiot)/,
  carne:/\b(ternera|cerdo|lomo|albondiga|hamburguesa|burger|salchicha|filete|carne|carn\b|chuleta|costilla|magro|cordero|bolonesa|bolognesa|bolonyesa|ragu|chorizo|lacon|morcilla|secreto|carrillada|flamenquin|longaniza|butifarra|botifarra|jamon\b|pernil|york|codillo|panceta|bacon|porc|vedella|conill|conejo|mandonguilla|llom|xai|llonganissa|fricando|costella|capcada|salsitxa|frankfurt)/,
  huevo:/\b(tortillas?|huevos?|revueltos?|frittata|truita|ous?|remenat)\b/,
  verdura:/\b(menestra|verdura|verdures|judias verdes|acelga|espinaca|brocoli|broquil|coliflor|calabacin|calabaza|carabass|zanahoria|pastanaga|pisto|gazpacho|salmorejo|vichyssoise|alcachofa|carxofa|guisante|pesols|champinon|xampinyon|berenjena|alberginia|puerro|porro|hortaliza|ratatouille|repollo|lombarda|pimiento|pebrot|esparrago|setas|bolets|monget(?:a|es) verd|panatxe|samfaina|escalivada|trinxat|espinacs|bledes|bajoca)/,
  fritos:/\b(pizza|croqueta|empanadilla|empanada|rebozad|arrebossa|frit[oa]s?\b|fregi|nugget|varitas|san jacobo|flamenquin|a la romana|andalusa|palitos|bunuelo|tempura|churro|calzone)/
};
// Crema, puré, sopa, caldo: verdura si no es otra cosa (sopa de fideos es pasta). La ensalada (amanida) de acompañar no cuenta
const CWEAK=/\b(crema|pure|sopa|caldo|brou)\b/;
// Lo que va «con» algo en el mismo plato es guarnición: la verdura o la patata de guarnición no cuentan
const CGARN=/\s(con|y|amb|i|acompanad[oa]s? de|guarnicion de|sobre)\s/;
const COFF=/\([^)]*\)?|tomate frito|tortillas? de (trigo|maiz)|pan frito|picatostes|crostons|caldo de (pollo|pescado|verduras|carne)|tomate|tomaquet|queso|formatge|amanida|ensalada/g;
function dishTypes(d){
  const t=" "+cNorm(d).replace(COFF," ").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ")+" ",out=new Set();
  const g=t.search(CGARN),head=g>0?t.slice(0,g)+" ":t,garn=g>0?t.slice(g):"";
  for(const [k,rx] of Object.entries(CKW)){if(rx.test(head))out.add(k);else if(garn&&k!=="verdura"&&k!=="patata"&&rx.test(garn))out.add(k)}
  // Carne de algo que no es carne: filete de merluza, hamburguesa de pollo o vegetal (las salchichas, siempre carne)
  if(/fideos? de arroz/.test(t))out.delete("arroz");if(/arroz frito|arros fregit/.test(t))out.delete("fritos");
  if(out.has("carne")&&(out.has("pescado")||out.has("pollo")||out.has("legumbre")||/\b(vegetal|vegana|vegano|seitan|tofu|soja)\b/.test(t))&&!/\b(ternera|cerdo|salchicha|chorizo|jamon\b|york|cordero|bacon|panceta|porc|vedella|conill|bolonyesa)/.test(t))out.delete("carne");
  if(out.has("huevo")&&/\b(truita|tortilla) vegan/.test(t))out.delete("huevo");
  if(!out.has("verdura")&&CWEAK.test(head)&&!out.size)out.add("verdura");
  return out;
}
// Tipos de un texto (un día entero del menú del cole): se mira cada plato por separado
function classifyText(txt){
  const out=new Set();for(const d of String(txt||"").split(/[·\n;|\/•]|\s[-–]\s/))for(const k of dishTypes(d))out.add(k);
  return Object.keys(CTIPOS).filter(k=>out.has(k));
}
// Tipos de una receta: su nombre y sus ingredientes principales (lo que pesa en la ración, no lo que adorna)
function prodTypes(pid){
  const x=P[pid];if(!x)return [];if(x._ct)return x._ct;
  if(/aceite|especias|salsas/i.test(x.sec||"")||/^(caldo|salsa|tinta|pan |tortillas)/i.test(x.name))return x._ct=[];
  const t=[...dishTypes(x.name)];return x._ct=t.includes("fritos")?["fritos"]:t.includes("pasta")?t.filter(k=>k!=="arroz"):t;   // fideos de arroz: pasta
}
function recipeTypes(r){
  if(r._ct)return r._ct;const out=new Set(dishTypes(r.name));
  for(const [pid,q] of r.ing){const x=P[pid];if(!x)continue;
    for(const k of prodTypes(pid)){if(k==="verdura")continue;if(k==="patata"?q>=120:k==="pasta"||k==="arroz"?q>=40:x.unit==="ud"?q>=1:q>=50)out.add(k)}}
  const b=carbBase(r);if(b)out.add(b);
  if(r.group==="legumbre")out.add("legumbre");if(r.group==="pescado")out.add("pescado");if(r.group==="huevo")out.add("huevo");
  if(r.main==="pollo"||r.main==="pavo")out.add("pollo");if(r.main==="cerdo"||r.main==="ternera")out.add("carne");
  if(r.group==="vegetal"&&!["pasta","arroz","legumbre","patata","huevo","fritos"].some(k=>out.has(k)))out.add("verdura");
  return r._ct=Object.keys(CTIPOS).filter(k=>out.has(k));
}

/* ---------- Lo que comió en el cole un día y lo que hay que evitar en la cena ---------- */
const comedorOf=(kid,d)=>((S.comedor||{})[kid]||{})[d]||null;
// Tipos a evitar en una cena: los del comedor de cada niño que cena ese día y no ha comido en casa
function comedorAvoid(slot){
  if(!S.comedor||slot.meal!=="cena"||!(slot.kids||[]).length)return null;let out=null;
  for(const k of slot.kids){const e=comedorOf(k.id,slot.date);if(!e||!(e.tipos||[]).length)continue;
    if(peopleAt(slot.date,"comida").includes(k))continue;   // ese día comió en casa: el menú del cole no cuenta
    out=out||[];for(const t of e.tipos)if(!out.includes(t))out.push(t)}
  return out;
}
const comedorClash=(r,av)=>!!(av&&r&&recipeTypes(r).some(t=>av.includes(t)));
const tiposTxt=ts=>ts.map(t=>CNOUN[t]).join(", ").replace(/, ([^,]*)$/," ni $1");

/* ---------- Leer el menú ---------- */
const CMES={enero:1,gener:1,febrero:2,febrer:2,marzo:3,marc:3,abril:4,mayo:5,maig:5,junio:6,juny:6,julio:7,juliol:7,agosto:8,agost:8,
  septiembre:9,setiembre:9,setembre:9,octubre:10,noviembre:11,novembre:11,diciembre:12,desembre:12};
// «MENÚ NOVEMBRE 2026», «Menú de noviembre de 2026» → "2026-11"
function cMonthOf(s){const x=cNorm(s).match(/\b(enero|gener|febrero|febrer|marzo|marc|abril|mayo|maig|junio|juny|julio|juliol|agosto|agost|septiembre|setiembre|setembre|octubre|noviembre|novembre|diciembre|desembre)\b\s*(?:de\s*)?(20\d\d)\b/);
  return x?`${x[2]}-${String(CMES[x[1]]).padStart(2,"0")}`:null}
const CALG=/^\d{1,2}T?(-\d{1,2}T?)*$/;   // alérgenos: «1-3T-6T-7-10T», «12»
const CPOS=/^(fruit|fruta|iogurt|yogur|postre|lacti|lacteo|natilla|flan|gelatina|mato\b|cuajada|quallada|gelat|helado|pastis|pastel|bizcocho|coca\b|batido)/;
const postreOf=s=>{const n=cNorm(s);return /iogurt|yogur/.test(n)?"yogur":/fruit|fruta/.test(n)?"fruta":/natilla|flan|cuajada|quallada|mato\b|lact|batido/.test(n)?"lacteo":"dulce"};
const CHEAD=/^(menu|comedor|colegio|ceip|escola|escuela|semana|setmana|curso|curs|mes de|primer plato|segundo plato|1er plato|2o plato|primer plat|segon plat|guarnicion|energia|valor|proteinas|hidratos|lipidos|grasas|alergenos|al lergens|informacio|telefono|tel\b|www|http|nota|festiu|festivo|no lectiu|no lectivo|vacaciones|vacances|empresa|dieta|cocina|cuina|la fruita|la fruta|menus elaborats|en compliment|elaborado|pan\b|pa\b|pa integral|pan integral|agua|aigua|lunes|martes|miercoles|jueves|viernes|dilluns|dimarts|dimecres|dijous|divendres|sabado|domingo|dissabte|diumenge)/;
// Lo de un día: platos, postre, kcal y lo que se añade («Tastet: brownie…»). lines: las líneas de su casilla, de arriba abajo
function cellParse(lines){
  const dishes=[],o={dishes,postre:null,kcal:null,extra:null};let last=null;
  for(const raw of lines){
    const s=String(raw).split(/\s+/).filter(w=>!CALG.test(w)).join(" ").replace(/\[[^\]]*\]|\*+|\(\s*[\d,\s\-T]*\)/g," ").replace(/\s+/g," ").trim(),n=cNorm(s);
    if(!s||!/[a-z]{2}/i.test(s)){continue}
    const kc=n.match(/^kcal\s*:?\s*([\d.,]+)/);if(kc){o.kcal=Number(kc[1].replace(/\.(?=\d{3}\b)/,"").replace(",","."))||null;last=null;continue}
    if(/^(lip|prot|hc|hidr|gras)\b/.test(n)){last=null;continue}
    if(CPOS.test(n)){o.postre=o.postre||postreOf(s);last=null;continue}
    if(/^(tastet|degustacio|degustacion)\b/.test(n)){o.extra=s.replace(/^(\w+)\s*:?\s*/,(m,w)=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()+": ");last="extra";continue}
    if(last==="extra"&&s===s.toUpperCase()){o.extra+=" "+s;continue}
    if(CHEAD.test(n)&&!/\b(amb|con)\b/.test(n)&&n.split(" ").length<6){last=null;continue}
    // Continuación del plato de antes: empieza en minúscula o con paréntesis, o el de antes se quedó a medias
    if(last==="dish"&&dishes.length&&(/^[a-zà-ÿ(]/.test(s)||/(,|\bde|\bamb|\bcon|\bi|\by|\ba la)$/i.test(dishes[dishes.length-1]))){dishes[dishes.length-1]+=" "+s;continue}
    dishes.push(s);last="dish";
  }
  if(o.extra)o.extra=o.extra.replace(/\s+\.?$/,"").replace(/\.$/,"").replace(/: (.)(.*)/,(m,a,b)=>": "+a.toUpperCase()+b.toLowerCase());
  o.dishes=dishes.map(d=>d.replace(/\s+/g," ").replace(/[\s,.;]+$/,"").trim()).filter(d=>d.length>2);
  return o;
}
// Menús por página de un PDF (página → nombre del menú: «Basal», «Sense Gluten», «Menú Halal»…) y el mes que pone
function pdfMenus(pages){
  const out=[];
  for(const pg of pages){const it=pg.items.map(i=>({...i,s:String(i.s).trim()})).filter(i=>i.s);
    const f=it.find(i=>cMonthOf(i.s));
    const g=gridOf(it);if(!g)continue;
    let name=null;if(f){const v=it.find(i=>i!==f&&Math.abs(i.y-f.y)<1.5&&/\s-\s/.test(i.s)&&!CALG.test(i.s));if(v)name=v.s.split(/\s+-\s+/)[0].trim()}
    out.push({page:pg.n,name:name||"Menú de la página "+pg.n,m:f?cMonthOf(f.s):null,it,g})}
  // Nombres repetidos (dos páginas del mismo menú): se distinguen por la página
  out.forEach(x=>{if(out.filter(y=>y.name===x.name).length>1)x.name+=" (pág. "+x.page+")"});
  return out;
}
// La cuadrícula de una página: filas con los números de los días (más grandes que el texto o solos en su fila)
function gridOf(it){
  const hs={};for(const i of it)if(/[a-z]{3}/i.test(i.s)){const k=Math.round(i.h*2)/2;hs[k]=(hs[k]||0)+1}
  const textH=Number((Object.entries(hs).sort((a,b)=>b[1]-a[1])[0]||[0])[0]);
  const isN=i=>/^\d{1,2}$/.test(i.s)&&Number(i.s)>=1&&Number(i.s)<=31;
  const rowOf=i=>it.filter(j=>Math.abs(j.y-i.y)<2.5);
  const nums=it.filter(i=>isN(i)&&(i.h>textH+0.4||(()=>{const r=rowOf(i);return r.length>=3&&r.every(isN)})()));
  const rows=[];for(const i of nums.sort((a,b)=>b.y-a.y)){let r=rows.find(r=>Math.abs(r.y-i.y)<2.5);if(!r){r={y:i.y,nums:[]};rows.push(r)}r.nums.push({n:Number(i.s),x:i.x,it:i});r.y=Math.max(r.y,i.y)}
  for(const r of rows)r.nums.sort((a,b)=>a.x-b.x);
  const ok=rows.filter(r=>r.nums.every((v,k)=>!k||v.n>r.nums[k-1].n));
  const full=ok.slice().sort((a,b)=>b.nums.length-a.nums.length)[0];
  if(!full||full.nums.length<3)return null;
  return {xs:full.nums.map(v=>v.x),rows:ok.sort((a,b)=>b.y-a.y)};
}
// Una página en días: cada número de día marca su casilla; lo que hay debajo (hasta la fila siguiente) va a la columna más cercana
function parsePdfMenu(menu){
  const {it,g}=menu,xs=g.xs,colOf=x=>{if(x<xs[0]-10)return -1;let c=0;for(let i=0;i<xs.length;i++)if(x>=xs[i]-10)c=i;return c};
  const nearCol=x=>xs.reduce((b,v,i)=>Math.abs(v-x)<Math.abs(xs[b]-x)?i:b,0);
  const hdr=new Set(g.rows.flatMap(r=>r.nums.map(v=>v.it)));
  const cell={};const put=(b,c,i)=>{(cell[b+"|"+c]=cell[b+"|"+c]||[]).push(i)};
  const blockOf=y=>{let b=-1;g.rows.forEach((r,k)=>{if(r.y+2>=y)b=k});return b};
  for(const i of it){if(hdr.has(i)||CALG.test(i.s))continue;const c=colOf(i.x),b=blockOf(i.y);if(c<0||b<0)continue;put(b,c,i)}
  // Lo que queda por debajo de la línea de kcal de una casilla ya es de la semana siguiente («Tastet…» encima de los números)
  for(const k of Object.keys(cell)){const [b,c]=k.split("|").map(Number),kc=cell[k].find(i=>/^kcal/i.test(i.s));if(!kc||b+1>=g.rows.length)continue;
    const below=cell[k].filter(i=>i.y<kc.y-1.5);if(!below.length)continue;cell[k]=cell[k].filter(i=>!below.includes(i));below.forEach(i=>put(b+1,c,i))}
  const days={},m=menu.m;
  g.rows.forEach((r,b)=>{for(const v of r.nums){const c=nearCol(v.x),its=(cell[b+"|"+c]||[]).sort((p,q)=>q.y-p.y||p.x-q.x),lines=[];
    for(const i of its){const l=lines.find(l=>Math.abs(l.y-i.y)<2.5);if(l)l.p.push(i);else lines.push({y:i.y,p:[i]})}
    const o=cellParse(lines.map(l=>l.p.sort((p,q)=>p.x-q.x).map(i=>i.s).join(" ")));
    if(m&&(o.dishes.length||o.postre))days[`${m}-${String(v.n).padStart(2,"0")}`]=o}});
  return days;
}
// El menú que encaja con un niño: el que se eligió otros meses, si no el de su dieta o alergias, y si no el general («Basal»)
function pickMenu(menus,k){
  const prev=((S.comedorCfg||{})[k.id]||{}).variante;if(prev){const x=menus.find(v=>v.name===prev);if(x)return x}
  const al=k.allergies||[],dt=(k.diet||"omni"),need=[];
  const R={gluten:/gluten|celiac/,lacteos:/lactosa|plv|llet|leche|lactis/,huevo:/\b(ou|huevo)\b/,frutos_cascara:/fruits secs|frutos secos/,cacahuete:/fruits secs|frutos secos|cacahu/,
    pescado:/peix|pescado/,crustaceos:/marisc/,moluscos:/marisc/};
  for(const a of al)if(R[a])need.push(R[a]);
  if(dt==="vege"||dt==="ovo"||dt==="lacto")need.push(/vegetari|ovolacto/);if(dt==="vegano"||dt==="crudi")need.push(/vegan/);
  if(dt==="halal")need.push(/halal/);if(dt==="sincerdo")need.push(/porc|cerdo|halal/);if(dt==="pesce")need.push(/sense carn|sin carne/);
  if(need.length){const sc=v=>need.filter(rx=>rx.test(cNorm(v.name))).length;const best=menus.slice().sort((a,b)=>sc(b)-sc(a)||a.name.length-b.name.length)[0];if(sc(best))return best}
  return menus.find(v=>/basal|general|normal|basic/.test(cNorm(v.name)))||menus[0];
}
/* Texto sin posiciones (fotos, o lo escrito a mano): entiende «Lunes 3» como título (y los platos debajo), líneas que empiezan
   por el día («3 Lentejas…»), filas en las que cada casilla empieza por el día («3 Lentejas  4 Macarrones…») y cuadrículas con una
   fila de días («3  4  5  6  7») y debajo una fila por plato con una casilla por día. Lo que no entiende lo devuelve aparte. */
const CWD="(lunes|lune5|iunes|martes|mattes|miercoles|mlercoles|jueves|juebes|viernes|vlernes|dilluns|dimarts|dimecres|dijous|divendres)";
const cFixNum=s=>s.replace(/\b([0-3]?[0-9OoIl|]{1,2})\b/g,m=>/\d/.test(m)&&/[OoIl|]/.test(m)&&m.length<=2?m.replace(/[Oo]/g,"0").replace(/[Il|]/g,"1"):m)
  .replace(/([a-záéíóúñ])0(?=[a-záéíóúñ]|\b)/gi,"$1o").replace(/([a-záéíóúñ])1(?=[a-záéíóúñ])/gi,"$1l");
const CALC=/^\(\s*[\d,\s\-T]+\)$|^\d{1,2}T?([-,]\d{1,2}T?)+$|^\d{1,2}T$/;   // alérgenos sueltos en una casilla: «(1,7)», «1-3T»
function parseComedor(text,m){
  const [y,mm]=m.split("-").map(Number),nd=new Date(y,mm,0).getDate(),dateOf=n=>`${m}-${String(n).padStart(2,"0")}`;
  const okDay=n=>n>=1&&n<=nd&&dow(dateOf(n))<5;
  const lines={},unknown=[],wdBad=[];let cur=null,cols=null,last=0;
  const isText=s=>{const c=String(s).split(/\s+/).filter(w=>!CALG.test(w)).join(" "),n=cNorm(c).replace(/[^a-z ]/g," ").replace(/\s+/g," ").trim();return n.length>=3};
  const add=(n,s)=>{if(isText(s))(lines[n]=lines[n]||[]).push(s.trim())};
  const note=s=>{const c=s.trim(),n=cNorm(c);if(isText(c)&&!CHEAD.test(n)&&!CPOS.test(n)&&!/^(kcal|lip|prot|hc)\b/.test(n)&&!unknown.includes(c))unknown.push(c)};
  const WDN=new RegExp("^"+CWD+"[\\s,.:]*(?:dia\\s*)?(\\d{1,2})$");
  const WDI=new RegExp("\\b"+CWD+"\\b[\\s,.:]*(?:dia\\s*)?(\\d{1,2})\\b","g");
  const WDX=["lu","ma","mi","ju","vi"],WDC={dl:0,dm:1,dx:2,dj:3,dv:4};
  const checkWd=(w,n)=>{const c=w.replace(/^ml/,"mi").replace(/^iu/,"lu").replace(/^vl/,"vi"),i=c.startsWith("di")?["dillu","dimar","dimec","dijou","diven"].indexOf(c.slice(0,5)):WDX.indexOf(c.slice(0,2));
    if(i>=0&&okDay(n)&&dow(dateOf(n))!==i)wdBad.push(n)};
  for(const raw0 of String(text||"").split(/\r?\n/)){
    const raw=cFixNum(raw0).replace(/\t/g,"  ").trim();if(!raw)continue;
    const cells=raw.split(/\s{2,}/).map(c=>c.trim()).filter(c=>c&&!CALC.test(c)),cn=cells.map(c=>cNorm(c).replace(/[,.:]+$/,"").trim());
    // Fila de días de una cuadrícula: «3  4  5  6  7» o «Lunes 3  Martes 4 …»
    const nums=cn.map(c=>{if(/^\d{1,2}$/.test(c))return Number(c);const w=c.match(WDN);if(w){checkWd(w[1],Number(w[2]));return Number(w[2])}return null});
    if(cells.length>=2&&nums.every(n=>n!=null&&okDay(n))&&nums.every((n,i)=>!i||n>nums[i-1])){cols=nums;cur=null;last=Math.max(...nums);continue}
    // Marcas de día dentro de la línea: al principio, tras dos espacios o con el nombre del día
    const n0=cNorm(raw),marks=[];
    for(const x of n0.matchAll(WDI)){const n=Number(x[2]);if(okDay(n)){checkWd(x[1],n);marks.push({at:x.index,end:x.index+x[0].length,n})}}
    const lead=n0.match(/^(?:dia\s*)?(\d{1,2})(?:\s*[.\-:)]\s*|\s+)(?=[a-z])/);
    if(lead&&okDay(Number(lead[1]))&&!marks.some(k=>k.at===0))marks.push({at:0,end:lead[0].length,n:Number(lead[1])});
    for(const x of n0.matchAll(/\s{2,}(\d{1,2})(?:\s*[.\-:)]\s*|\s+)(?=[a-z])/g)){const n=Number(x[1]),at=x.index+x[0].indexOf(x[1]);
      if(okDay(n)&&n>(marks.length?marks[marks.length-1].n:last)-1&&!marks.some(k=>Math.abs(k.at-at)<12))marks.push({at,end:x.index+x[0].length,n})}
    marks.sort((a,b)=>a.at-b.at);
    if(marks.length){
      const pre=raw.slice(0,marks[0].at);if(isText(pre)){if(cur)add(cur,pre);else note(pre)}
      marks.forEach((k,i)=>{cur=k.n;last=Math.max(last,k.n);lines[cur]=lines[cur]||[];const seg=raw.slice(k.end,i+1<marks.length?marks[i+1].at:raw.length);
        for(const p of seg.split(/\s{2,}/))add(cur,p)});
      cols=null;continue;
    }
    // Filas de una cuadrícula: una casilla por día
    if(cols&&cells.length===cols.length){cells.forEach((c,i)=>add(cols[i],c));continue}
    if(cols&&cells.length>1){cells.forEach(note);continue}
    // Una línea sin día: sigue el plato del día de antes (o no se sabe de qué día es)
    if(cur&&!cols){for(const p of cells)add(cur,p);continue}
    note(raw);
  }
  const days={};for(const [n,a] of Object.entries(lines)){const o=cellParse(a);if(o.dishes.length||o.postre)days[dateOf(Number(n))]=o}
  return {days,unknown,wdBad:[...new Set(wdBad)]};
}
// Lo que se guarda de un día leído
const cEntry=o=>{const txt=o.dishes.join(" · ");return {txt,tipos:classifyText(txt),...(o.postre?{postre:o.postre}:{}),...(o.kcal?{kcal:o.kcal}:{}),...(o.extra?{extra:o.extra}:{})}};
// PDF con la posición de cada trozo de texto (para leer la cuadrícula por columnas). Mismo pdf.js que los tickets
async function textItemsFromPdf(file){
  await loadScript(PDFJS+"pdf.min.js");pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS+"pdf.worker.min.js";
  const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,pages=[];
  for(let n=1;n<=pdf.numPages;n++){const pg=await pdf.getPage(n);
    pages.push({n,items:(await pg.getTextContent()).items.filter(i=>i.str.trim()).map(i=>({s:i.str,x:i.transform[4],y:i.transform[5],w:i.width,h:Math.abs(i.transform[3])}))})}
  return pages;
}
// Las páginas como texto, fila a fila (para los PDF sin cuadrícula)
const pagesText=pages=>pages.map(p=>{const rows=[];for(const i of p.items){let r=rows.find(r=>Math.abs(r.y-i.y)<2.5);if(!r){r={y:i.y,p:[]};rows.push(r)}r.p.push(i)}
  return rows.sort((a,b)=>b.y-a.y).map(r=>r.p.sort((a,b)=>a.x-b.x).map(i=>i.s.trim()).join("  ")).join("\n")}).join("\n");

/* ---------- Guardar y rehacer las cenas ---------- */
// Días de cole de un niño en un mes: los que come fuera según su semana normal (si no lo tiene puesto, de lunes a viernes)
function cSchoolDays(k,m){
  const [y,mm]=m.split("-").map(Number),n=new Date(y,mm,0).getDate(),aw=((k.away||{}).comida||[]).some(i=>i<5),out=[];
  for(let i=1;i<=n;i++){const d=`${m}-${String(i).padStart(2,"0")}`;if(dow(d)>4||isHoliday(d))continue;if(!aw||eatsAway(k,d,"comida"))out.push(d)}
  return out;
}
const cDaysIn=(kid,m)=>Object.keys((S.comedor||{})[kid]||{}).filter(d=>d.startsWith(m)).length;
// Tras guardar: las cenas que vienen (no las pasadas, cocinadas ni elegidas a mano) que repiten lo del cole se vuelven a elegir
function comedorReplan(dates){
  const today=todayISO();let n=0;
  withCandMemo(()=>{for(const s of [...new Set(dates.filter(d=>d>=today).map(weekStartFor))]){const wk=S.plans[s];if(!wk)continue;let ch=false;
    // Lo ya comprado (o de antes de la primera compra) no se cambia: su compra ya está hecha para ese plato
    for(const sl of buildSlots(s)){if(sl.meal!=="cena"||!sl.kids.length||sl.past||sl.fixed||slotDone(sl.id)||slotNoShop(sl.id))continue;const v=wk.slots[sl.id];
      if(!v||v.locked||v.manual||v.despensa||v.rep||!RX[v.recipe])continue;
      if(comedorClash(RX[v.recipe],comedorAvoid(sl))){delete wk.slots[sl.id];n++;ch=true}}
    if(ch){ensureWeek(s);wk.budget=fitBudget(s)}}});
  save();return n;
}

/* ---------- Subir, revisar y guardar el menú ----------
   back: volver a otra pantalla (Preparar el mes, Tu semana normal, el día) en vez de cerrar */
function openComedor(kidId,m0,back){
  const k=S.people.find(p=>p.id===kidId);if(!k)return;const nm=esc(personName(k)),cur=todayISO().slice(0,7),nx=nextMonthOf(cur);
  const left=m=>cSchoolDays(k,m).filter(d=>d>=todayISO()).length;
  // Por defecto, este mes si aún le quedan días de cole (las vacaciones del cole no se saben); si no, el que viene
  const st={m:m0||(left(cur)>=5||left(cur)>=left(nx)?cur:nx),step:"subir",rows:{},unknown:[],wdBad:[],menus:null,sel:null,note:"",txt:"",prog:0};
  const finish=()=>{if(back)back();else{dlg.close();render()}};
  // Filas de la revisión: los días de cole que quedan del mes, los que salen en el menú y los ya guardados
  const fill=(days)=>{const from=st.m===cur?todayISO():st.m+"-01",mine=(S.comedor||{})[k.id]||{};
    const ds=[...new Set(cSchoolDays(k,st.m).concat(Object.keys(days||{}),Object.keys(mine).filter(d=>d.startsWith(st.m))))].filter(d=>d>=from&&d.startsWith(st.m)).sort();
    st.rows={};for(const d of ds){const p=days&&days[d],e=p?cEntry(p):mine[d]?{...mine[d]}:{txt:"",tipos:[]};st.rows[d]={...e,tipos:[...(e.tipos||[])],found:!!p}}
    st.step="revisar"};
  const fromText=t=>{const r=parseComedor(t,st.m);st.unknown=r.unknown;st.wdBad=r.wdBad;fill(r.days);draw()};
  const useMenu=mn=>{st.sel=mn.name;if(mn.m)st.m=mn.m;st.unknown=[];st.wdBad=[];fill(parsePdfMenu(mn));
    st.note=`${mn.m?"Menú de "+mName(mn.m)+" "+mn.m.slice(0,4):""}${st.menus&&st.menus.length>1?" · "+mn.name:""}`;draw()};
  const onFile=async f=>{st.step="leyendo";st.prog=0;draw();
    try{
      if(/pdf/i.test(f.type)||/\.pdf$/i.test(f.name)){const pages=await textItemsFromPdf(f),ms=pdfMenus(pages);
        if(ms.length>1){st.menus=ms;st.sel=pickMenu(ms,k).name;st.step="menu";draw();return}
        if(ms.length===1){st.menus=ms;useMenu(ms[0]);return}
        fromText(pagesText(pages));return}
      fromText(await textFromImage(f,p=>{st.prog=p;const e=dlg.querySelector("#cmProg");if(e)e.textContent=Math.round(p*100)+" %"}));
    }catch(e){console.error(e);st.step="subir";draw();toast("No he podido leerlo. Prueba con otra foto o escríbelo a mano")}};
  const chipsOf=d=>{const r=st.rows[d];return Object.entries(CTIPOS).map(([t,[e,l]])=>{const on=r.tipos.includes(t);return `<button class="cmc" data-cmc="${t}" aria-pressed="${on}" aria-label="${esc(l)}" title="${esc(l)}">${e}${on?` ${esc(l.split(" ")[0])}`:""}</button>`}).join("")+(r.postre?`<span class="cmpos">${CPOSTRE[r.postre]||""}</span>`:"")};
  const bindRow=box=>box.querySelectorAll("[data-cmc]").forEach(b=>b.onclick=()=>{const d=box.dataset.cmrow,t=b.dataset.cmc,r=st.rows[d];r.touched=true;
    r.tipos=r.tipos.includes(t)?r.tipos.filter(x=>x!==t):Object.keys(CTIPOS).filter(x=>x===t||r.tipos.includes(x));redrawRow(d)});
  const redrawRow=d=>{const box=dlg.querySelector(`[data-cmrow="${d}"]`);if(box){box.innerHTML=chipsOf(d);bindRow(box)}};
  const top=`<div class="mod cmsheet">${back?`<button class="btn ghost small mback" data-cmback>‹ Volver</button>`:closeBtn}<div class="veb">Menú del comedor</div>`;
  const draw=()=>{
    const y=dlg.open?dlg.scrollTop:0;let h=top;
    if(st.step==="subir"||st.step==="escribir"){
      const have=cDaysIn(k.id,st.m);
      h+=`<h2 class="vh mph">Lo que come <em>${nm}</em> en el cole</h2>
        <p class="small muted">Sube el menú del comedor y sus cenas en casa no repetirán lo que comió ese día: si come legumbre, de cena otra cosa.</p>
        <div class="chips" style="margin:10px 0">${[cur,nx].map(m=>chip("data-cmm",m,st.m===m,esc(monthName(m).split(" ")[0]))).join("")}</div>
        ${have?`<div class="mscard msw cmhave"><span><b>Ya tienes ${have} ${have===1?"día":"días"} de ${esc(mName(st.m))}</b><small>Puedes revisarlos o subir otro menú</small></span><button class="btn ghost small" id="cmSee">Revisar</button></div>`:""}
        ${st.step==="escribir"?`<div class="field"><label for="cmTxt">Escribe o pega el menú</label><textarea id="cmTxt" rows="8" placeholder="Lunes 3&#10;Lentejas estofadas&#10;Merluza al horno&#10;Martes 4&#10;…">${esc(st.txt)}</textarea></div>
          <div class="actions"><button class="btn wide" id="cmRead">Seguir</button></div>`
        :`<label class="btn wide cmup">📄 Subir el PDF o una foto<input type="file" accept="application/pdf,image/*" id="cmFile" hidden></label>
          <button class="btn ghost wide" id="cmHand" style="margin-top:8px">✍️ Escribirlo a mano</button>`}
        <p class="small muted" style="margin-top:12px">Se lee en tu móvil: el menú no se envía a ningún sitio. Luego lo revisas día a día.</p>`;
    }
    if(st.step==="leyendo")h+=`<h2 class="vh mph">Leyendo <em>el menú</em>…</h2><p class="small muted">Un momento. Con una foto tarda un poco más <span id="cmProg"></span></p><div class="prepbar loop"><i></i></div>`;
    if(st.step==="menu"){
      h+=`<h2 class="vh mph">¿Qué menú <em>come ${nm}</em>?</h2><p class="small muted">El PDF trae ${st.menus.length} menús. Elige el suyo y lo recordaré para los meses que vienen.</p>
        <div class="mscard cmmenus">${st.menus.map(mn=>`<button class="msw cmopt" data-cmv="${esc(mn.name)}" aria-pressed="${st.sel===mn.name}"><span><b>${esc(mn.name)}</b></span><i>${st.sel===mn.name?"✓":""}</i></button>`).join("")}</div>
        <div class="actions"><button class="btn wide" id="cmUse">Seguir</button></div>`;
    }
    if(st.step==="revisar"){
      const ds=Object.keys(st.rows),found=ds.filter(d=>st.rows[d].found).length;
      h+=`<h2 class="vh mph">Revisa <em>${esc(mName(st.m))}</em></h2>
        <p class="small muted">${st.note?esc(st.note)+". ":""}${found?`He leído ${found} ${found===1?"día":"días"}. `:""}Corrige lo que no esté bien y toca los tipos para quitar o poner. Deja vacío un día que no va al comedor.</p>
        ${st.wdBad.length?`<p class="small cmwarn">Los días de la semana no cuadran con ${esc(mName(st.m))}: ¿es el menú de otro mes?</p>`:""}
        <div class="cmlist">${ds.map(d=>{const r=st.rows[d];return `<div class="cmrow"><b class="cmd">${DLET[dow(d)]} ${Number(d.slice(8))}</b><div class="cmb">
          <textarea class="cmtx" data-cmt="${d}" rows="${Math.min(4,Math.max(2,Math.ceil(r.txt.length/34)))}" placeholder="Qué come ese día" aria-label="Comida del ${esc(longDate(d))}">${esc(r.txt)}</textarea>
          <div class="cmch" data-cmrow="${d}">${chipsOf(d)}</div></div></div>`}).join("")||`<p class="small muted">No quedan días de cole este mes.</p>`}</div>
        ${st.unknown.length?`<details class="more cmunk"><summary>No he entendido ${st.unknown.length} ${st.unknown.length===1?"línea":"líneas"}</summary><p class="small muted">No sé de qué día son. Si es un plato, cópialo en su día.</p>${st.unknown.slice(0,40).map(u=>`<div class="small">${esc(u)}</div>`).join("")}</details>`:""}
        <div class="actions sticky"><button class="btn ghost" id="cmAgain">Subir otro</button><button class="btn wide" id="cmSave">Guardar</button></div>`;
    }
    showDialog(h+`</div>`);dlg.scrollTop=y;
    const q=s=>dlg.querySelectorAll(s),on=(s,f)=>{const e=dlg.querySelector(s);if(e)e.onclick=f};
    on("[data-cmback]",finish);
    q("[data-cmm]").forEach(b=>b.onclick=()=>{st.m=b.dataset.cmm;draw()});
    on("#cmSee",()=>{st.unknown=[];st.wdBad=[];st.note="";fill(null);draw()});
    on("#cmHand",()=>{st.step="escribir";draw()});
    on("#cmRead",()=>{st.txt=dlg.querySelector("#cmTxt").value;st.note="";fromText(st.txt)});
    const fi=dlg.querySelector("#cmFile");if(fi)fi.onchange=e=>{const f=e.target.files[0];if(f)onFile(f)};
    q("[data-cmv]").forEach(b=>b.onclick=()=>{st.sel=b.dataset.cmv;draw()});
    on("#cmUse",()=>useMenu(st.menus.find(x=>x.name===st.sel)||st.menus[0]));
    // Al cambiar el texto se vuelven a calcular los tipos (salvo que los hayas tocado tú); solo se repinta esa fila
    q("[data-cmt]").forEach(i=>{const d=i.dataset.cmt,r=st.rows[d];i.oninput=()=>{r.txt=i.value};
      i.onchange=()=>{r.txt=i.value;if(!r.touched){r.tipos=classifyText(r.txt);redrawRow(d)}}});
    q("[data-cmrow]").forEach(bindRow);
    on("#cmAgain",()=>{st.step="subir";draw()});
    on("#cmSave",()=>{
      S.comedor=S.comedor||{};const mine=S.comedor[k.id]=S.comedor[k.id]||{},ds=Object.keys(st.rows);let n=0;
      for(const d of ds){const r=st.rows[d],txt=r.txt.trim();
        if(txt||r.tipos.length){mine[d]={txt,tipos:r.tipos,...(r.postre?{postre:r.postre}:{}),...(r.kcal?{kcal:r.kcal}:{}),...(r.extra?{extra:r.extra}:{})};n++}else delete mine[d]}
      // Se guardan unos 3 meses: lo de antes del mes pasado se borra
      const keep=iso(new Date(Number(cur.slice(0,4)),Number(cur.slice(5))-2,1));for(const d of Object.keys(mine))if(d<keep)delete mine[d];
      if(st.sel){S.comedorCfg=S.comedorCfg||{};S.comedorCfg[k.id]={...(S.comedorCfg[k.id]||{}),variante:st.sel}}
      save();const ch=comedorReplan(ds);
      toast(n?`Guardado. ${ch?`He cambiado ${ch} ${ch===1?"cena":"cenas"} con ${personName(k)}`:`Las cenas con ${personName(k)} no repiten lo del cole`}`:"Guardado");finish()});
  };
  draw();
}

/* ---------- Lo que se enseña ---------- */
// En el día del mes: lo que come en el cole cada niño (o un aviso para apuntarlo)
function comedorDayHTML(d){
  let h="";
  for(const k of others().filter(p=>p.kind==="nino")){const e=comedorOf(k.id,d),pc=peopleAt(d,"comida").includes(k);if(pc)continue;
    if(!e&&!(eatsAway(k,d,"comida")&&peopleAt(d,"cena").includes(k)))continue;
    h+=`<div class="mmeal cmday"><div><b>En el cole</b><div class="small">${e?`${esc(personName(k))} come: ${esc(e.txt.replace(/\s*\([^)]*\)/g,"").toLowerCase())}${e.postre?` <span class="muted">· ${esc((CPOSTRE[e.postre]||"").split(" ")[1]||"").toLowerCase()} de postre</span>`:""}`:`<span class="muted">¿Qué come ${esc(personName(k))}? Apúntalo y su cena no lo repetirá.</span>`}</div></div>
      <div class="msbtns"><button class="btn ghost small" data-mdcm="${k.id}">${e?"Cambiar":"Apuntar"}</button></div></div>`}
  return h;
}
// En la cena: por qué es así (o un aviso si se ha elegido a mano algo de lo mismo)
function comedorDinnerNote(sl,r){
  const av=comedorAvoid(sl);if(!av||!r)return "";const same=recipeTypes(r).filter(t=>av.includes(t));
  return same.length?`<div class="small cmwarn">Ojo: también es ${esc(tiposTxt(same))}, como lo que comió en el cole</div>`:`<div class="small" style="color:var(--kid)">Sin ${esc(tiposTxt(av))}: es lo que comió en el cole</div>`;
}
// En Preparar el mes: si un niño come en el cole y aún no está su menú, se pide
function comedorPrepCard(m){
  return others().filter(p=>p.kind==="nino"&&((p.away||{}).comida||[]).some(i=>i<5)).map(k=>{const n=cDaysIn(k.id,m),nm=esc(personName(k));
    return n?`<div class="mscard msw cmprep"><span><b>🏫 Menú del comedor de ${nm}</b><small>${n} ${n===1?"día":"días"} de ${esc(mName(m))}: sus cenas no lo repiten</small></span><button class="btn ghost small" data-mpcm="${k.id}">Ver</button></div>`
      :`<div class="mscard cmprep"><b>🏫 ¿Tienes el menú del comedor de ${nm} de ${esc(mName(m))}?</b><p class="small muted" style="margin:4px 0 8px">Súbelo y las cenas con ${nm} no repetirán lo que comió.</p><button class="btn small" data-mpcm="${k.id}">Subir el menú</button></div>`}).join("");
}
