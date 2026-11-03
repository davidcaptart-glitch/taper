/* Táper · Tu semana normal: quién está, entrenos, comida y cena de cada día y si se repiten cenas */
"use strict";

/* Se guarda en lo que ya había:
   - niños: k.presence (días fijos → type "dias" + days; fines de semana alternos → type "findes" o, con días fijos, type "dias" + findes:true y anchor)
   - entrenos: p.train[día] = [{time, type}] · comida y cena: S.home.weekTpl[día] · repetir cena: S.home.repeatMeals.cena
   - cómo compras: S.home.buyMode "mes" | "semana" · presupuesto: el asistente de compra de siempre
   Al cerrar, si algo ha cambiado, se rehace el menú desde hoy (lo pasado, lo cocinado y lo elegido a mano no se tocan). */
// La custodia de un niño vista como días fijos + fines de semana alternos (semanas alternas se cambian en «Más opciones de custodia»)
function kidWeek(k){
  const pr=k.presence||{type:"siempre"};
  if(pr.type==="siempre")return {days:[0,1,2,3,4,5,6],alt:false,ok:true};
  if(pr.type==="dias")return {days:(pr.days||[]).map(Number),alt:!!pr.findes,ok:true};
  if(pr.type==="findes")return {days:[],alt:true,ok:true};
  if(pr.type==="manual")return {days:[],alt:false,ok:true,manual:true};
  return {days:[],alt:false,ok:false};
}
const nextFri=()=>{const t=todayISO(),f=addDays(mondayOf(t),4);return t>addDays(f,2)?addDays(f,7):f};
function setKidWeek(k,days,alt,anchor){
  const pr={...(k.presence||{})},turn={anchor:anchor||pr.anchor||nextFri(),arrive:pr.arrive||"cena",leave:pr.leave||"cena"};
  days=[...new Set(days)].sort();delete pr.findes;
  if(days.length===7&&!alt)k.presence={...pr,type:"siempre"};
  else if(!days.length&&alt)k.presence={...pr,...turn,type:"findes"};
  else k.presence={...pr,type:"dias",days,...(alt?{...turn,findes:true}:{})};
}
// A qué comidas está un niño un día de la semana normal: "ambas" | "cena" | "comida" | "no".
// Se guarda en lo de siempre: el día en k.presence (días fijos) y la comida o la cena que hace fuera en k.away[comida|cena]
function kidMeals(k,i){
  if(!kidWeek(k).days.includes(i))return "no";
  const aw=m=>((k.away||{})[m]||[]).includes(i),c=aw("comida"),n=aw("cena");
  return c&&n?"no":c?"cena":n?"comida":"ambas";
}
function setKidMeals(k,i,st){
  const w=kidWeek(k),on=st!=="no";
  setKidWeek(k,on?[...w.days.filter(x=>x!==i),i]:w.days.filter(x=>x!==i),w.alt);
  k.away=k.away||{};
  for(const m of ["comida","cena"]){const fuera=on&&(st==="cena"&&m==="comida"||st==="comida"&&m==="cena"),a=(k.away[m]||[]).filter(x=>x!==i);k.away[m]=fuera?[...a,i].sort():a}
}
// Hora y deporte de siempre de una persona (para añadir una sesión con un toque)
function usualSession(p){
  const all=Object.values(p.train||{}).flat(),cnt=f=>{const c={};all.forEach(s=>{const v=f(s);if(v)c[v]=(c[v]||0)+1});return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]};
  return {time:(cnt(s=>s.time)||["19:00"])[0],type:(cnt(s=>s.type)||[(p.sports||[])[0]||"fuerza"])[0]};
}
function openSemanaNormal(){
  let dirty=false;
  const ks=()=>others(),H=S.home;
  const trainers=()=>[me(),...S.people.filter(p=>!isMe(p)&&p.trains)];
  const draw=()=>{
    const y=dlg.open?dlg.scrollTop:0,kids=ks(),rr=repRule("cena"),repOn=(rr.days||1)>=2;
    const cell=(attr,on,cls,txt,lab,dis)=>`<button class="scell ${cls} ${on?"on":""}" ${attr} aria-pressed="${!!on}" aria-label="${esc(lab)}" ${dis?"disabled":""}>${txt}</button>`;
    let g=`<div class="snorm"><span></span>${DLET.map(l=>`<span class="h">${l}</span>`).join("")}`;
    for(const k of kids){const w=kidWeek(k),nm=esc(personName(k));
      g+=`<span class="rl">${nm}</span>${DLET.map((_,i)=>{if(!w.ok)return cell("",false,"alt","½",`${personName(k)}: semanas alternas`,true);
        const st=kidMeals(k,i),KT={ambas:"☀🌙",cena:"🌙",comida:"☀",no:""},KL={ambas:"comida y cena",cena:"solo la cena",comida:"solo la comida",no:"no está"};
        return cell(`data-snk="${k.id}|${i}"`,st!=="no","k",KT[st],`${personName(k)} el ${DAYS[i].toLowerCase()}: ${KL[st]}`)}).join("")}`}
    for(const p of trainers()){const lab=isMe(p)?"Tu entreno":"Entreno "+personName(p);
      g+=`<span class="rl">${esc(lab)}</span>${DLET.map((_,i)=>{const ss=(p.train||{})[i]||[];return cell(`data-snt="${p.id}|${i}"`,ss.length,"e",ss.length?esc(String(sessTime(ss[0])).replace(/:00$/,"h").replace(/^0/,"")):"",`${lab} el ${DAYS[i].toLowerCase()}`)}).join("")}`}
    const MI={taper:["🥡","t"],cocinar:["🍳","c"],fuera:["—","f"],libre:["·","f"],solotaper:["🥡","t"]};
    for(const m of ["comida","cena"])g+=`<span class="rl">${m==="comida"?"Comida":"Cena"}</span>${DLET.map((_,i)=>{const v=H.weekTpl[i][m],x=MI[v]||["?","f"];return cell(`data-snm="${m}|${i}"`,true,x[1],x[0],`${m} del ${DAYS[i].toLowerCase()}: ${MEALSTATE[v]||v}`)}).join("")}`;
    g+=`</div>`;
    const k1=kids[0],kn=kids.map(personName).join(" y "),kidsN=kids.filter(p=>p.kind==="nino").map(personName).join(" y ");
    let h=`<div class="mod">${closeBtn}<div class="veb">Perfil</div><h2 class="vh mph">Tu semana <em>normal</em></h2>
      <p class="small muted" style="margin:0 0 12px">Se pone una vez. Con esto relleno cada mes y luego solo tocas lo que cambia.</p>
      <div class="mscard" style="padding:12px">${g}
        <p class="small muted" style="margin:8px 0 0">${kids.length?`Toca el día de ${esc(kn)} para decir a qué está: ☀🌙 comida y cena · 🌙 solo la cena · ☀ solo la comida · vacío, no está. `:""}Toca la comida o la cena para cambiarla: 🥡 táper (sale de la cena de la víspera) · 🍳 cocino · — fuera.${trainers().length?" Toca un entreno para quitarlo o ponerlo a su hora de siempre.":""}</p></div>
      <div class="mscard" style="padding:12px 14px"><b>Postre</b><small class="muted" style="display:block;margin:2px 0 6px">Una pieza de fruta de temporada o un yogur por persona. Lo pongo en la compra.</small>
        ${["comida","cena"].map(m=>`<div class="msw col"><small style="color:var(--muted)">${m==="comida"?"Después de comer":"Después de cenar"}</small><div class="chips">${POSTRE_MODOS.map(([v,t])=>chip("data-snpos",m+"|"+v,((H.postre||{})[m]||"no")===v,t)).join("")}</div></div>`).join("")}</div>
      <div class="mscard">${swRow("Solo, repetir la cena dos noches",`Cocinas una vez y otra noche calientas, sin que caiga el día que comes su táper y sin pasar de lo que aguanta en la nevera.${kidsN?` Con ${esc(kidsN)}, las cenas de la semana nunca se repiten.`:""}`,repOn,"data-snrep")}
        ${kids.map(k=>{const w=kidWeek(k),siempre=(k.presence||{}).type==="siempre";
          const sw=swRow(`${esc(personName(k))} está siempre`,siempre?"Come y cena en casa todos los días":"Toca sus días arriba: a qué comidas está cada día",siempre,`data-snsiempre="${k.id}"`);
          if(siempre)return sw;if(!w.ok)return sw+ `<div class="msw"><span><b>${esc(personName(k))}: semanas alternas</b><small>${esc(turnText(k))}</small></span></div>`;
          let s=sw+swRow(`Fines de semana alternos con ${esc(personName(k))}`,w.alt?"":"Viernes (cena), sábado y domingo, uno sí y otro no",w.alt,`data-snalt="${k.id}"`);
          if(w.alt){const f=nextFri(),pr=k.presence||{},t=turnInfo({...pr,type:"findes"}),on=((daysBetween(t.anchor,f)%14)+14)%14===0;
            s+=`<div class="msw col"><small style="color:var(--muted)">¿Cuál le toca?</small><div class="chips">${[[f,on],[addDays(f,7),!on]].map(([d,o])=>chip("data-snnext",k.id+"|"+d,o,`${d===f?"Este":"El siguiente"}: ${shortDate(d)} – ${shortDate(addDays(d,2))}`)).join("")}</div></div>`}
          return s+`<div class="msw"><button class="linkbtn" data-snmore="${k.id}">${k.kind==="nino"?"Más opciones de custodia de":"Más opciones de"} ${esc(personName(k))} ›</button></div>`
            +(k.kind==="nino"?`<div class="msw"><button class="linkbtn" data-sncm="${k.id}">🏫 Menú del comedor de ${esc(personName(k))} · ${cDaysIn(k.id,todayISO().slice(0,7))||cDaysIn(k.id,nextMonthOf(todayISO().slice(0,7)))?"ver":"subir"} ›</button></div>`:"")}).join("")}</div>
      <div class="mscard" style="padding:12px 14px"><b>¿Cómo compras?</b><div class="chips" style="margin-top:8px">${chip("data-snbuy","mes",(H.buyMode||"mes")==="mes","Pedido al mes + fresco cada semana")}${chip("data-snbuy","semana",H.buyMode==="semana","Todo cada semana")}</div></div>
      <button class="mscard msw" id="snBudget" style="width:100%;border:0;text-align:left;padding:12px 14px;color:inherit"><span><b>Presupuesto al mes</b><small>Tocar para cambiarlo</small></span><b>${budgetSet()?eur(Number(H.budget.month)||Number(H.budget.week)*4.33||0):"Sin presupuesto"}</b></button>
      <p class="small muted" style="margin:12px 2px 0">Lo de cada persona (alergias, gustos, hora y tipo de entreno), los aparatos y los avisos, en tu perfil.</p>
      <div class="actions"><button class="btn wide" data-x>Listo</button></div></div>`;
    showDialog(h);dlg.scrollTop=y;
    const q=s=>dlg.querySelectorAll(s),ch=()=>{dirty=true;save();draw()};
    // Cada toque: comida y cena → solo la cena → solo la comida → no está
    q("[data-snk]").forEach(b=>b.onclick=()=>{const [id,i]=b.dataset.snk.split("|"),k=S.people.find(p=>p.id===id),cur=kidMeals(k,Number(i)),ord=["no","ambas","cena","comida"];
      setKidMeals(k,Number(i),ord[(ord.indexOf(cur)+1)%ord.length]);k.mealsSet=true;ch()});
    // Está siempre: todos los días a comida y cena (y fuera los turnos); al quitarlo, ningún día marcado para que toques los suyos
    q("[data-snsiempre]").forEach(b=>b.onclick=()=>{const k=S.people.find(p=>p.id===b.dataset.snsiempre),on=(k.presence||{}).type==="siempre";
      if(on)k.presence={...(k.presence||{}),type:"dias",days:[]};else{k.presence={type:"siempre"};k.away={comida:[],cena:[]}}k.mealsSet=true;ch()});
    q("[data-snalt]").forEach(b=>b.onclick=()=>{const k=S.people.find(p=>p.id===b.dataset.snalt),w=kidWeek(k);setKidWeek(k,w.days,!w.alt);ch()});
    q("[data-snnext]").forEach(b=>b.onclick=()=>{const [id,d]=b.dataset.snnext.split("|"),k=S.people.find(p=>p.id===id),w=kidWeek(k);setKidWeek(k,w.days,true,d);ch()});
    q("[data-snt]").forEach(b=>b.onclick=()=>{const [id,i]=b.dataset.snt.split("|"),p=S.people.find(x=>x.id===id);p.train=p.train||{};
      if((p.train[i]||[]).length)delete p.train[i];else{const u=usualSession(p);p.train[i]=[u];p.trains=true;p.sports=p.sports||[];if(!p.sports.includes(u.type))p.sports.push(u.type)}ch()});
    q("[data-snm]").forEach(b=>b.onclick=()=>{const [m,i]=b.dataset.snm.split("|"),opts=m==="comida"?["taper","cocinar","fuera"]:["cocinar","fuera"],cur=H.weekTpl[i][m];
      H.weekTpl[i][m]=opts[(opts.indexOf(cur)+1)%opts.length];ch()});
    q("[data-snrep]").forEach(b=>b.onclick=()=>{const rm=H.repeatMeals=H.repeatMeals||{},on=(repRule("cena").days||1)>=2;
      rm.cena=on?{...(rm.cena||{}),days:1}:{days:2,who:ks().length?"sin":"todas"};ch()});
    q("[data-snpos]").forEach(b=>b.onclick=()=>{const [m,v]=b.dataset.snpos.split("|");H.postre={...(H.postre||{}),[m]:v};ch()});
    q("[data-snbuy]").forEach(b=>b.onclick=()=>{H.buyMode=b.dataset.snbuy;save();draw()});
    q("[data-snmore]").forEach(b=>b.onclick=()=>{const id=b.dataset.snmore;finish(false);personTab="cuando";openPerson(id);
      dlg.addEventListener("close",()=>setTimeout(openSemanaNormal,0),{once:true})});
    q("[data-sncm]").forEach(b=>b.onclick=()=>{finish(false);openComedor(b.dataset.sncm,null,()=>openSemanaNormal())});
    dlg.querySelector("#snBudget").onclick=()=>{finish(false);dlg.close();openWizard("compra","perfil")};
  };
  // Al cerrar: si ha cambiado algo, el menú se rehace desde hoy (nunca lo pasado)
  let closed=false;
  const finish=redraw=>{if(closed)return;closed=true;dlg.removeEventListener("close",onClose);
    if(dirty){dirty=false;save();redoScreen(()=>toast("Menú rehecho con tu semana normal"))}else if(redraw!==false)render()};
  const onClose=()=>finish();
  draw();dlg.addEventListener("close",onClose);
}
// Resumen en una línea (para el Perfil)
function semanaResumen(){
  const t=[],DS2=DSHORT.map(x=>x.toLowerCase());
  for(const k of others().filter(p=>p.kind==="nino")){const w=kidWeek(k);
    t.push(personName(k)+" "+(!w.ok?"semanas alternas":w.days.length===7?"siempre":[w.days.length?w.days.slice().sort().map(i=>DS2[i]).join(", "):"",w.alt?"findes alternos":""].filter(Boolean).join(" + ")||"lo marcas tú"))}
  const ent=Object.values(me().train||{}).flat().length,tp=S.home.weekTpl.filter(x=>x.comida==="taper").length;
  if(ent)t.push(ent+(ent===1?" entreno":" entrenos"));t.push(tp+(tp===1?" táper":" tápers"));
  if((repRule("cena").days||1)>=2)t.push("repites cena solo");
  return t.join(" · ");
}
