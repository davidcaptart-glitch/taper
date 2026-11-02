/* Táper · preparación: antes de encender nada, lo que hay que dejar listo (picar, cortar, batir, pesar…),
   con la cantidad total, para qué plato es y cómo se hace; y en cada paso, lo que se usa en ese momento.
   Todo sale de los pasos de las recetas: no hay que escribir nada aparte. */
"use strict";

const lowTxt=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
// Palabras del nombre que no sirven para encontrar el ingrediente en el texto
const ING_STOP=new Set(["hacendado","bote","bolsa","pack","malla","latas","lata","fileteada","fileteado","congelado","congelada","congelados","ultracongelado","ultracongelada","natural","fresco","fresca","entero","entera","grande","grandes","medianos","docena","cocido","cocida","cocidos","cocidas","para","con","sin","del","las","los","una","unos","sobres","brik","bandeja","envase","tarro"]);
const stemOf=w=>w.length>=4?w.replace(/(es|s)$/,""):w;
// Cómo se llama en las recetas lo que en la tienda tiene otro nombre
const ING_ALIAS=[[/macarr|espagueti|spaghetti|fideo|tallarin|penne|tortellini|lasa|pasta/,"pasta"],[/contramuslo|muslo|pechuga|alas de pollo|jamoncito/,"pollo"],[/merluza|bacalao|salmon|dorada|lubina|abadejo/,"pescado"],[/carne picada|picada/,"carne"],
  [/burger|hamburguesa/,"hamburguesa"],[/^ensalada/,"lechuga"],[/pan de molde/,"rebanada"],[/pan de molde/,"sandwich"],[/pan de molde/,"tostada"],[/pez espada/,"emperador"],[/alas de pollo/,"alita"],
  [/pechuga de pollo/,"filete"],[/^repollo/,"col"],[/queso fresco/,"fresco"]];
// La fruta y la verdura frescas también se encuentran por el grupo («corta las verduras», «pela la fruta»)
const FRUIT_RE=/^(platano|kiwi|pera|manzana|mandarina|naranja|fresa|melon|sandia|mango|uva|melocoton|nectarina|ciruela|frambuesa|arandano)/;
const groupAlias=(pid,nm)=>(P[pid].sec||"")!=="Fruta y verdura"?[]:FRUIT_RE.test(nm.trim())?["fruta"]:/^(limon|lima|ajo|perejil|cilantro|albahaca|hierbabuena|aguacate|patata|boniato|ensalada)/.test(nm.trim())?[]:["verdura"];
// Cómo encontrar cada ingrediente de una receta en sus pasos (sin las palabras que comparte con otro ingrediente)
// Si las palabras propias de un ingrediente no salen en los pasos (contramuslo → «el pollo»), vale también la compartida
function ingKeyMap(r){
  const words={};for(const [pid] of r.ing){const nm=lowTxt(P[pid].name).replace(/\(.*?\)/g," ");
    words[pid]=[...new Set(nm.split(/[^a-zñ]+/).filter(w=>w.length>=3&&!ING_STOP.has(w)).map(stemOf).concat(ING_ALIAS.filter(([re])=>re.test(nm)).map(([,a])=>a),groupAlias(pid,nm)))]}
  const cnt={};for(const ws of Object.values(words))for(const w of ws)cnt[w]=(cnt[w]||0)+1;
  const all=lowTxt(r.vars.flatMap(v=>v.steps).join(" ")).split(/[^a-zñ]+/),inSteps=k=>all.some(w=>k.length<4?w===k||w===k+"s"||w===k+"es":w.startsWith(k));
  const out={};for(const [pid,ws] of Object.entries(words)){const own=ws.filter(w=>cnt[w]===1),useOwn=own.some(inSteps);out[pid]={own:useOwn?own:[],shared:useOwn?[]:ws.filter(w=>cnt[w]>1).concat(own)}}
  return out;
}
// ¿Qué ingredientes salen en este texto?
function ingsIn(text,r,km){
  const ws=lowTxt(text).split(/[^a-zñ]+/).filter(Boolean),has=k=>ws.some(w=>k.length<4?w===k||w===k+"s"||w===k+"es":w.startsWith(k));
  const own=r.ing.map(([p])=>p).filter(p=>km[p].own.some(has));
  // «tomate» suelto no cuenta si en la frase ya está el «tomate triturado»
  const shared=r.ing.map(([p])=>p).filter(p=>!own.includes(p)&&km[p].shared.some(has)&&!own.some(o=>km[p].shared.some(s=>lowTxt(P[o].name).includes(s))));
  return [...own,...shared];
}
// Cantidad dicha como en la cocina: «9 huevos», «450 g de calabacín», «2 botes de garbanzos (800 g)»
const cleanName=pid=>P[pid].name.replace(/\s*\(.*?\)/g,"").replace(/\s+(xl|l|m|s)$/i,"").toLowerCase();
const vasos=n=>{const v=Math.max(0.5,Math.round(n*2)/2);return `${String(v).replace(".",",")} ${v===1?"vaso":"vasos"}`};
const canPk=pid=>P[pid].unit==="g"&&(P[pid].name.match(/\b(bote|lata|latas|tarro)\b/i)||[])[1];
// Números de cocina: de medio en medio («½», «1½», «2»); las raciones se dicen igual («para 2½»), por dentro se guardan con decimales
const halfTxt=n=>{const v=Math.max(0.5,Math.round(Number(n)*2)/2),i=Math.floor(v);return (i?String(i):"")+(v%1?"½":"")};
const racTxt=n=>halfTxt(n);
// Gramos y mililitros redondeados como en una receta: de 5 en 5 hasta 100 y de 10 en 10 a partir de ahí (lo muy poco, tal cual)
const kitchenQ=q=>q<20?Math.max(1,Math.round(q)):q<100?Math.round(q/5)*5:Math.round(q/10)*10;
// Unidades con nombre: «1 pastilla de caldo», «2 rebanadas de pan de molde»; el resto, «1 huevo», «1½ huevos»
const UD_NAME=[[/pastilla/,"pastilla","pastillas"],[/pan de molde/,"rebanada","rebanadas"]];
const singularName=nm=>nm.replace(/^(\S{3,}?)s\b/,"$1");
function qtyTxt(pid,q){
  const p=P[pid],nm=cleanName(pid);
  if(p.unit==="ud"){const n=Math.max(0.5,Math.round(q*2)/2),u=UD_NAME.find(([re])=>re.test(lowTxt(p.name)));
    return u?`${halfTxt(n)} ${n>1?u[2]:u[1]} de ${nm}`:`${halfTxt(n)} ${n>1?nm:singularName(nm)}`}
  const pk=(p.name.match(/\((bote|lata|brik|bolsa|sobre|tarro|paquete|pack[^)]*)\)/i)||[])[1],n=q/p.env,near=Math.round(n*2)/2;
  if(/^ajo/.test(nm)&&p.unit==="g"){const d=Math.max(1,Math.round(q/5));return `${d} ${d===1?"diente":"dientes"} de ajo`}
  const base=`${fmtQty(kitchenQ(q),p.unit)} de ${nm}`;
  if(pk&&near>=0.5&&Math.abs(n-near)<0.08)return `${base} (${String(near).replace(".",",")} ${near===1?pk.toLowerCase():pk.toLowerCase()+(/[aeiou]$/.test(pk)?"s":"es")})`;
  if(p.unit==="ml"&&q>=150)return `${base} (≈ ${vasos(q/200)} de 200 ml)`;
  if(p.unit==="ml"&&q<=45)return `${base} (${Math.max(1,Math.round(q/15))} cucharada${Math.round(q/15)>1?"s":""})`;
  if(/arroz/.test(nm)&&q>=100)return `${base} (≈ ${vasos(q/180)})`;
  return base;
}
// Tareas de preparación que se leen en los pasos
const PREP_VERBS=[
  ["bate",/\b(bate|batelos|batelas|batidos?|batidas?)\b/],
  ["pica",/\b(pica|picalo|picala|picalos|picalas|picado|picada|picados|picadas)\b/],
  ["ralla",/\b(ralla|rallalo|rallala|rallalos|rallalas)\b/],
  ["pela",/\b(pela|pelalo|pelala|pelalos|pelalas|pelado|pelada|pelados|peladas)\b/],
  ["desmenuza",/\b(desmenuza\w*)\b/],
  ["aplasta",/\b(aplasta|aplastalo|aplastala|aplastalos|aplastalas)\b/],
  ["lava",/\b(lava|lavalo|lavala|lavalos|lavalas|lavados?|lavadas?)\b/],
  ["exprime",/\b(exprime\w*)\b/],
  ["corta",/\b(corta|cortalo|cortala|cortalos|cortalas|trocea\w*|troceado\w*|lamina|laminalo|laminala|laminado\w*)\b/],
];
const FORMS=[["dados",/\bdados\b/],["tiras",/\btiras\b/],["rodajas",/\brodajas\b/],["juliana",/\bjuliana\b/],["láminas",/\b(laminas|lamina\w*|laminado\w*)\b/],["gajos",/\bgajos\b/],["trozos",/\btrozos\b/],["cuartos",/\bcuartos\b/],["aros",/\baros\b/],["mitades",/\bmitades\b/]];
// Verbos que no son de preparar: cortan el «grupo» del verbo de preparar anterior («escurre las lentejas, añade el tomate»)
const OTHER_VERB=/^(anade|echa|incorpora|mezcla\w*|cuece|hierve|saltea|dora\w*|sofrie\w*|sirve|pon|ponlo|ponla|deja|cocina|remueve|vierte|hornea|asa|calienta|monta|reparte|agrega|cubre|tapa|rellena|unta|aliña|alina|adereza|riega|espolvorea|acompaña|acompana|coloca|forma|sazona|tuesta|cuaja|pocha\w*|pochalos|fríe|frie|marca|retira|apaga|baja|sube|corona)$/;
const PARTICIPLE={picado:"pica",picada:"pica",picados:"pica",picadas:"pica",rallado:"ralla",rallada:"ralla",pelado:"pela",pelada:"pela",pelados:"pela",peladas:"pela",troceado:"corta",troceada:"corta",laminado:"corta",laminada:"corta",batidos:"bate",batidas:"bate",desmenuzado:"desmenuza",desmenuzada:"desmenuza"};
// En una frase: qué ingrediente se prepara y cómo. El verbo vale para lo que viene detrás hasta otro verbo;
// la forma («en dados») para los de ese verbo o, sin verbo, solo para el ingrediente justo delante; «cebolla picada» también cuenta
function clausePreps(cl,r,km){
  const ws=cl.split(/[^a-zñ]+/).filter(Boolean),out=[];
  const pos=[];for(const pid of ingsIn(cl,r,km)){const keys=km[pid].own.length?km[pid].own:km[pid].shared;
    const i=ws.findIndex(w=>keys.some(k=>k.length<4?w===k||w===k+"s"||w===k+"es":w.startsWith(k)));if(i>=0)pos.push({pid,i})}
  pos.sort((a,b)=>a.i-b.i);
  const verbAt=i=>{for(const [vb,re] of PREP_VERBS)if(re.test(ws[i]))return vb;return null};
  const formAt=i=>{for(const [f,re] of FORMS)if(re.test(ws[i]))return f;return null};
  for(const x of pos){
    // verbo de preparar antes, sin otro verbo en medio
    let vb=null;for(let j=x.i-1;j>=0;j--){if(OTHER_VERB.test(ws[j]))break;const v=verbAt(j);if(v&&!PARTICIPLE[ws[j]]){vb=v;break}}
    // participio justo detrás («la cebolla picada»), si no es parte del nombre del producto («queso rallado»)
    const nmw=lowTxt(P[x.pid].name);
    for(let j=x.i+1;j<=Math.min(ws.length-1,x.i+3)&&!vb;j++)if(PARTICIPLE[ws[j]]&&!nmw.includes(ws[j]))vb=PARTICIPLE[ws[j]];
    // forma de corte detrás, antes del siguiente ingrediente (o de otro verbo); sin verbo, solo si va pegada
    let form=null;const next=pos.find(y=>y.i>x.i),lim=next?next.i:ws.length;
    for(let j=x.i+1;j<ws.length&&j<x.i+8;j++){if(OTHER_VERB.test(ws[j]))break;const f=formAt(j);if(f){if(j<lim||vb)form=f;break}}
    if(!form&&vb){const j=ws.findIndex((w,k)=>k>x.i&&formAt(k));if(j>0&&!ws.slice(x.i+1,j).some(w=>OTHER_VERB.test(w)))form=formAt(j)}
    if(!vb&&form)vb="corta";
    if(vb==="bate"&&!/huevo/.test(nmw))vb=null;
    if(vb==="corta"&&!form&&ws.some(w=>/^lamina/.test(w)))form="láminas";
    if(vb)out.push({pid:x.pid,verb:vb,form});
  }
  return out;
}
function prepHow(pid,verb,form){
  const nm=lowTxt(P[pid].name);
  if(verb==="abre")return /lenteja|garbanzo|alubia|judia|legumbre/.test(nm)?"Échala en un colador y enjuágala con agua fría: se quita el líquido espeso del bote y la sal de más.":"Ábrela y escúrrela bien en un colador o apretando la tapa.";
  if(verb==="pica"&&/huevo/.test(nm))return "Cuécelos 10 min en agua hirviendo, pásalos a agua fría, pélalos y pícalos con el cuchillo o aplástalos con un tenedor.";
  if(verb==="bate")return "Casca los huevos de uno en uno en un vaso y pásalos al bol (así, si sale alguno malo, no estropea el resto). Añade una pizca de sal y bate con un tenedor hasta que clara y yema queden del todo mezcladas.";
  if(verb==="pica"&&/cebolla/.test(nm))return "Córtala por la mitad de arriba abajo y pélala. Con la parte plana en la tabla, haz cortes finos a lo largo sin llegar a la raíz, luego unos cortes horizontales y, al final, corta en perpendicular: sale en daditos.";
  if(/\bajo/.test(nm)&&(verb==="pica"||verb==="aplasta"||verb==="pela"))return "Aplasta el diente con la hoja del cuchillo: la piel se quita sola. Si hay que picarlo, córtalo en láminas finas y luego pícalo muy menudo. Quítale el germen verde si lo tiene.";
  if(verb==="pica"&&/(perejil|cilantro|albahaca|hierba)/.test(nm))return "Lávalo, sécalo bien y pica solo las hojas, muy fino, con el cuchillo en balanceo.";
  if(verb==="pica")return "Córtalo en trocitos muy pequeños, de unos 3-5 mm.";
  if(verb==="ralla")return "Con la cara gruesa del rallador, sobre un plato. Lo pequeño, sujétalo con un tenedor para no rasparte los dedos.";
  if(verb==="pela")return /patata|zanahoria|boniato|pepino|calabaza/.test(nm)?"Con el pelador, de arriba abajo. Si no lo vas a usar enseguida, déjalo en un bol con agua para que no se oscurezca.":"Con un cuchillo pequeño o con los dedos.";
  if(verb==="desmenuza")return "Con dos tenedores o con los dedos, en hebras o trocitos.";
  if(verb==="lava")return /espinaca|lechuga|ensalada|canonigo|rucula|hoja/.test(nm)?"Las hojas, en un bol grande con agua fría; remueve, sácalas y escúrrelas (mejor con centrifugadora).":"Bajo el grifo con agua fría y sécalo.";
  if(verb==="exprime")return "Hazlo rodar en la mesa apretando con la mano antes de cortarlo: suelta más zumo. Cuela las pepitas.";
  if(form==="dados")return "Primero en rodajas o lonchas de 1-1,5 cm, luego en tiras del mismo ancho y luego en cubos.";
  if(form==="tiras"||form==="juliana")return "Tiras largas y finas, de unos 0,5 cm de ancho (en juliana, más finas aún).";
  if(form==="rodajas")return "Rodajas de 0,5-1 cm de grosor, todas iguales para que se hagan a la vez.";
  if(form==="láminas")return "Lonchas finas de 2-3 mm.";
  if(form==="gajos")return "A lo largo, en 6-8 trozos desde el centro, como una naranja.";
  if(form==="aros")return "Rodajas finas y separa los aros con los dedos.";
  return "En trozos de bocado, de unos 2-3 cm, todos parecidos.";
}
const VERB_TXT={abre:"Abre y escurre",bate:"Bate",pica:"Pica",ralla:"Ralla",pela:"Pela",desmenuza:"Desmenuza",aplasta:"Aplasta",lava:"Lava",exprime:"Exprime",corta:"Corta",pesa:"Pesa",mide:"Mide"};
// items: [{r,v,serv,label}] → ingredientes totales, tareas de preparación (juntas si varios platos piden lo mismo) y lo que hay que tener a mano
function prepPlan(items){
  const ings={},tasks={};
  for(const it of items){const {r,v,serv}=it,km=ingKeyMap(r),done=new Set();
    for(const [pid,q] of r.ing){const x=ings[pid]=ings[pid]||{pid,q:0,dishes:[]};x.q+=q*serv;if(!x.dishes.includes(it.label))x.dishes.push(it.label)}
    for(const step of v.steps)for(const cl of lowTxt(step).split(/[.;:]|\by luego\b|\by despues\b/))
      for(const {pid,verb,form} of clausePreps(cl,r,km)){if(done.has(pid))continue;
        const k=pid+"|"+verb+"|"+(form||"");const t=tasks[k]=tasks[k]||{pid,verb,form,q:0,dishes:[]};
        t.q+=(r.ing.find(([p])=>p===pid)[1])*serv;if(!t.dishes.includes(it.label))t.dishes.push(it.label);done.add(pid)}
  }
  // Lo seco o líquido que no se corta: se pesa o se mide antes (arroz, pasta, legumbre, caldo, nata…)
  const inTask=new Set(Object.values(tasks).map(t=>t.pid)),hand=[];
  for(const x of Object.values(ings)){if(inTask.has(x.pid))continue;const p=P[x.pid];
    if(canPk(x.pid)&&p.keep==="despensa"){tasks[x.pid+"|abre"]={pid:x.pid,verb:"abre",form:null,q:x.q,dishes:x.dishes}}
    else if((p.unit==="g"||p.unit==="ml")&&p.keep==="despensa"&&x.q>=20){const k=x.pid+"|"+(p.unit==="ml"?"mide":"pesa");tasks[k]={pid:x.pid,verb:p.unit==="ml"?"mide":"pesa",form:null,q:x.q,dishes:x.dishes}}
    else hand.push(x)}
  const order=["lava","pela","bate","pica","aplasta","corta","ralla","desmenuza","exprime","abre","pesa","mide"];
  return {ings:Object.values(ings).sort((a,b)=>P[a.pid].name.localeCompare(P[b.pid].name)),tasks:Object.values(tasks).sort((a,b)=>order.indexOf(a.verb)-order.indexOf(b.verb)||P[a.pid].name.localeCompare(P[b.pid].name)),hand};
}
function taskTxt(t){
  const base=`${VERB_TXT[t.verb]} ${qtyTxt(t.pid,t.q)}`;
  if(t.verb==="pica"&&/huevo/.test(lowTxt(P[t.pid].name)))return `Cuece y pica ${qtyTxt(t.pid,t.q)} (huevo duro)`;
  // Si el producto ya viene cortado («calabaza en trozos»), no se repite
  if(t.verb==="corta"&&/\ben (trozos|dados|tiras|rodajas|laminas|láminas)\b/.test(cleanName(t.pid)))return base;
  return t.verb==="corta"?base+(t.form?` en ${t.form}`:" en trozos"):t.verb==="bate"?base.replace(/^Bate (.*)$/,"Bate $1 en un bol"):base;
}
// La lista de preparación (con casillas para ir marcando lo hecho)
function prepHTML(plan,several){
  if(!plan.tasks.length&&!plan.hand.length)return "";
  return `<div class="prep2">${plan.tasks.map((t,i)=>`<label class="ptask"><input type="checkbox" data-ptask="${i}"><span><b>${esc(taskTxt(t))}</b>${several&&t.dishes.length?`<small>Para ${esc(t.dishes.join(" y "))}${t.dishes.length>1?": hazlo todo junto":""}</small>`:""}
      ${t.verb==="pesa"||t.verb==="mide"?"":`<details><summary>Cómo</summary><p>${esc(prepHow(t.pid,t.verb,t.form))}</p></details>`}</span></label>`).join("")}
    ${plan.hand.length?`<div class="phand"><b>Ten a mano</b><div>${plan.hand.map(x=>`<span>${esc(qtyTxt(x.pid,x.q))}</span>`).join("")}</div></div>`:""}</div>`;
}
// Especias, hierbas y aliños que nombran los pasos sin estar en la lista de ingredientes (van «al gusto», sin cantidad ni precio)
const SPICES=["pimienta","vinagre","azúcar","ajo en polvo","pimentón","comino","orégano","romero","tomillo","laurel","canela","nuez moscada","curry","cúrcuma","jengibre","guindilla","cayena","eneldo","perejil","cilantro","albahaca","hierbabuena","garam masala","sésamo"];
function spicesOf(r,v){
  const t=lowTxt((v||r.vars[0]).steps.join(" ")),names=lowTxt(r.ing.map(([p])=>P[p].name).join(" ")),out=[];
  for(const x of SPICES){const k=lowTxt(x);if(new RegExp("\\b"+k+"\\b").test(t)&&!names.includes(k)&&!out.some(o=>lowTxt(o).includes(k)))out.push(x)}
  return out;
}
// Lo que sale en «Usa:» en cada paso: lo que aparece por primera vez, o lo que se vuelve a añadir.
// La cantidad entera solo se dice una vez: si ya salió antes, no se repite (riesgo de echar el doble);
// si en aquel paso se usaba solo una parte («la mitad», «un poco»), ahora sale «el resto de…»
function stepUses(r,v){
  const km=ingKeyMap(r),shown={},seen=new Set();
  return v.steps.map(s=>{const txt=lowTxt(s),adds=/\b(anade|echa|incorpora|vierte|agrega)\b/.test(txt),part=/\b(mitad|parte|un poco)\b/.test(txt),ins=ingsIn(s,r,km);
    const out=[];for(const p of ins){if(seen.has(p)&&!adds)continue;
      if(shown[p]==null){shown[p]=part;out.push({pid:p})}else if(shown[p]){shown[p]=false;out.push({pid:p,rest:true})}}
    ins.forEach(p=>seen.add(p));return out});
}
// En cada paso: lo que se usa en ese momento, ya multiplicado por las raciones
function stepUsesHTML(r,v,i,serv){
  const ps=stepUses(r,v)[i]||[];if(!ps.length)return "";
  return `<div class="uses"><span>Usa:</span>${ps.map(x=>`<b>${esc(x.rest?"el resto de "+cleanName(x.pid):qtyTxt(x.pid,r.ing.find(([p])=>p===x.pid)[1]*serv))}</b>`).join("")}</div>`;
}
// Lo que vas a usar en total y si lo tienes en casa (según la despensa)
function sessionIngsHTML(plan){
  let st={};try{st=despensaState().stock}catch(e){}
  const miss=plan.ings.filter(x=>(st[x.pid]||0)<x.q-Math.max(1,P[x.pid].env*.05));
  return `<details class="sing"><summary><b>Lo que vas a usar</b> <span class="small muted">· ${plan.ings.length} ingredientes${miss.length?` · te faltan ${miss.length}`:" · lo tienes todo"}</span></summary>
    ${plan.ings.map(x=>{const have=st[x.pid]||0,ok=have>=x.q-Math.max(1,P[x.pid].env*.05);return `<div class="fixed"><span>${esc(qtyTxt(x.pid,x.q))}<small>${esc(x.dishes.join(", "))}</small></span><small style="color:${ok?"var(--ok)":"var(--accent)"};font-weight:600">${ok?"✓ en casa":have>0?"tienes "+esc(fmtQty(have,P[x.pid].unit)):"no está en la despensa"}</small></div>`}).join("")}</details>`;
}
/* ---------- Cocinado ----------
   S.cooked[id] = {d: día en que se cocinó, rid: la receta que se cocinó, p: raciones que se cocinaron de verdad (con el +/−)}.
   La despensa descuenta esa receta y esas raciones aunque luego se cambie el plato del día. Los días que repiten
   el plato van con p:0 y by: el hueco donde se cocinó (sus raciones ya van en las de aquel). Antes solo se guardaba la fecha. */
function cookedOf(id){
  const c=(S.cooked||{})[id];if(!c)return null;if(typeof c==="object")return c;
  // Formato antiguo (solo la fecha): la receta que tiene el hueco y sus raciones del plan; se guarda ya convertido
  const d=id.slice(0,10),wk=S.plans[weekStartFor(d)],v=wk&&wk.slots[id];if(!v||!RX[v.recipe])return {d:c,rid:null,p:0};
  let p=0;try{const sl=buildSlots(weekStartFor(d)).find(s=>s.id===id);p=sl?sl.portions:0}catch(e){}
  return S.cooked[id]={d:c,rid:v.recipe,p};
}
// Al terminar un plato: se da por cocinado y la despensa lo descuenta ya (también los días que repiten ese plato).
// Devuelve cómo estaba antes, para poder deshacerlo
function markCooked(sl,serv){
  if(!sl)return null;S.cooked=S.cooked||{};const t=todayISO(),wk=S.plans[weekStartFor(sl.date)],v=wk&&wk.slots[sl.id],rid=(v&&RX[v.recipe])?v.recipe:null,prev={};
  const set=(id,x)=>{if(!(id in prev))prev[id]=S.cooked[id]??null;S.cooked[id]=x};
  set(sl.id,{d:t,rid,p:Math.round((Number(serv)>0?Number(serv):cookPortions(sl))*100)/100});
  try{for(const c of repChildren(sl))set(c.id||c.date+"|"+c.meal,{d:t,rid,p:0,by:sl.id})}catch(e){}
  save();return prev;
}
function unmarkCooked(prev){S.cooked=S.cooked||{};for(const [id,x] of Object.entries(prev||{}))if(x==null)delete S.cooked[id];else S.cooked[id]=x;save()}
// Lo que se gastó al cocinar (para la despensa), desde el día from: ingredientes de la receta cocinada por sus raciones
function cookedUses(from){
  const out=[],memo={};
  for(const id of Object.keys(S.cooked||{})){const c=cookedOf(id);if(!c||!c.p||!c.d||c.d<from)continue;const r=RX[c.rid];if(!r)continue;
    const d=id.slice(0,10),meal=id.slice(11),ws=weekStartFor(d);let sl=null;try{sl=(memo[ws]=memo[ws]||buildSlots(ws)).find(s=>s.id===id)}catch(e){}
    sl=sl||{id,date:d,meal,eaters:[],kids:[],tupper:[]};
    for(const [pid,q] of slotIng(r,{...sl,portions:c.p}))if(P[pid])out.push({pid,d:c.d,k:1,q,out:true,u:{slot:{id,date:d,meal},r,date:c.d,pid,q}})}
  return out;
}
// Aviso con un botón («Deshacer»): dura algo más y solo el botón recibe el toque (el aviso deja pasar los toques)
function toastAction(msg,label,fn){
  const t=document.getElementById("toast");if(!t)return;t.textContent=msg+" ";const b=document.createElement("button");
  b.textContent=label;b.style.cssText="pointer-events:auto;margin-left:10px;background:none;border:1px solid currentColor;color:inherit;border-radius:10px;padding:4px 10px;font:inherit;cursor:pointer";
  b.onclick=()=>{t.classList.remove("on");fn()};t.appendChild(b);t.classList.add("on");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("on"),7000);
}
