// La línea de pagos de Mauri, tal como la armó. Lo único que cambia respecto del archivo
// original es de dónde salen los datos (la API de ATV Ops, en vivo) y dónde se guardan las
// notas y los ajustes (la base de Ops, compartidas): ver index.html.
const DATA = window.LINEA_DATA;
(function(){
"use strict";
/* ---------- utilidades de fecha ---------- */
const D = s => Math.round(Date.UTC(+s.slice(0,4), +s.slice(5,7)-1, +s.slice(8,10))/864e5);
const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const dt = d => new Date(d*864e5);
const fmtD = d => { const x = dt(d); return String(x.getUTCDate()).padStart(2,'0')+' '+MES[x.getUTCMonth()]+' '+x.getUTCFullYear(); };
const usd = n => 'US$ '+Math.round(n).toLocaleString('es-AR');
const usdK = n => n>=1000 ? 'US$ '+(n/1000).toLocaleString('es-AR',{maximumFractionDigits:1})+' mil' : usd(n);
const esc = s => String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const median = a => { if(!a.length) return null; const s=[...a].sort((x,y)=>x-y), m=s.length>>1; return s.length%2 ? s[m] : (s[m-1]+s[m])/2; };
const mean = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null;

const CUT = D(DATA.cut), HOY = D(DATA.hoy), WIN0 = D(DATA.win0), D0 = WIN0-30;
const PLANES = ['boost','mentoria','entry','mid','advantage'];
const PNAME = {boost:'Boost',mentoria:'Mentoría',entry:'Entry',mid:'Mid',advantage:'Advantage'};
const GR = [['A','A · Discord activo','Los 58 clientes activos hoy en Discord (verde). Si además están vencidos por fecha, la barra lleva franjas verdes y naranjas.'],['B','B · Vencidos','Estado activo en la ficha, vencimiento cumplido y fuera de Discord (naranja)'],['C','C · Salieron por vencimiento','Entraron y salieron por vencimiento de programa (azul)'],['S','Señas','Ingresantes con pagos de US$ 50 a 500 y sin deuda: adelanto o seña (gris)'],['O','Sin grupo','Bajas anticipadas y casos fuera de A, B y C (gris rayado)']];
const GNAME = Object.fromEntries(GR.map(x=>[x[0],x[1]])); GNAME.X='A revisar';
const MARKS = [['D','D · Inconsistencia','Ingresante con inconsistencia de fechas o ficha'],['E','E · Cuota sin pagar (proxy)','Deuda y más de 30 días sin pago; sin calendario de cuotas aún']];
const CNAME = {base:'Ya estaba en ATV al primer pago de junio',nuevo:'Ingreso nuevo desde junio',previo:'Salió antes del primer pago de junio',revisar:'Dato a revisar'};
const DUR = {boost_old:'Boost hasta mayo: 12 meses',boost_new:'Boost desde junio: 6 meses',mentoria:'Mentoría: 4 meses (más pausa y prórroga)'};
const ESTADO = {vigente:'Vigente',inactivo:'Inactivo',vencido:'Vencido',no_va_a_renovar:'No va a renovar',pausa:'En pausa',llamada_recompra:'Llamada de recompra'};
const CLIENTS = DATA.clients;
const BYID = new Map();
CLIENTS.forEach(c => {
  c.aD=D(c.a); c.vD=D(c.v); c.vcD=D(c.vc); c.bD=c.b?D(c.b):null; c.rcD=c.rc?D(c.rc):null;
  c.pg.forEach(p => p.D=D(p[0]));
  c.finD = Math.min(c.vD, c.bD==null?Infinity:c.bD); c.veD = c.ve?D(c.ve):null;
  c.endD = (c.bD!=null && c.bD<c.vD) ? c.bD : c.vD; c.vence = c.vD<=HOY;
  c.inA = c.g==='A'; c.o = {vD:c.vD, ad:c.ad, mE:c.mE, g:c.g, ab:c.ab, qm:c.qm, mD:c.mD.slice(), dvd:c.dvd};
  c.anom = c.coh==='revisar';
  c.upD = c.up?D(c.up):null; c.fpD = c.fp?D(c.fp):null;
  BYID.set(c.id,c);
});

/* ---------- estado ---------- */
const S = {plans:new Set(PLANES), grs:new Set(GR.map(x=>x[0])), marks:new Set(['D','E']), lanes:new Set(['ing','pag','ven']),
  pxd:4, x0:WIN0, ty:0, sel:null, tab:'res'};
const notes = new Map(); // cid -> [{id,t,at}]
const adj = new Map();   // cid -> {v, estado, deuda, prox, monto, at}: ajustes cargados a mano
const FIN = [['','Según la ficha (sin cambios)'],['al_dia','Al día'],['cuota_por_vencer','Cuota por vencer'],['cuota_vencida','Cuota vencida sin pagar'],['pagado','Programa pagado completo'],['sin_datos','Sin datos financieros']];
const FINN = Object.fromEntries(FIN);
const ACTIVO = ['vigente','pausa','llamada_recompra','no_va_a_renovar','vencido'];
const iso = d => dt(d).toISOString().slice(0,10);
function applyAdj(c){
  const a=adj.get(c.id), o=c.o;
  c.vD=o.vD; c.ad=o.ad; c.mE=o.mE; c.g=o.g; c.ab=o.ab; c.qm=o.qm; c.mD=o.mD.slice(); c.dvd=o.dvd; c.adj=!!a;
  if(a){
    if(a.v){ c.vD=D(a.v); c.qm=false; }
    if(a.deuda!=null && a.deuda!=='') c.ad=+a.deuda;
    if(c.aD>=WIN0 && !c.sn){
      if(a.estado==='cuota_vencida') c.mE=c.inA?1:2; else if(['al_dia','cuota_por_vencer','pagado'].includes(a.estado)) c.mE=0;
    }
    if(a.estado==='pagado' && (a.deuda==null||a.deuda==='')) c.ad=0;
  }
  c.endD=(c.bD!=null&&c.bD<c.vD)?c.bD:c.vD; c.vence=c.vD<=HOY; c.finD=Math.min(c.vD,c.bD==null?Infinity:c.bD);
  if(a && a.v && c.veD!=null && c.aD>=WIN0 && !c.sn && c.n!=='Geronimo Robles'){
    c.dvd=c.vD-c.veD; c.mD=c.mD.filter(m=>!m.startsWith('Vencimiento cargado'));
    if(Math.abs(c.dvd)>5) c.mD.push('Vencimiento cargado '+(c.dvd>0?'+':'')+c.dvd+' días respecto de la duración del programa');
  }
  const act=ACTIVO.includes(c.e);
  if(c.inA){ c.g='A'; c.ab=act && c.vD<=HOY; }
  else if(o.g==='C'){ c.g = c.vD>HOY ? 'O' : 'C'; }
  else if(o.g!=='X'){ if(act && c.vD<=HOY) c.g='B'; else if(o.g==='B') c.g='O'; }
}
const applyAll = () => CLIENTS.forEach(applyAdj);
const LSA='atv-linea-pagos-ajustes';
function lsLoadA(){ try{ const o=JSON.parse(localStorage.getItem(LSA)||'{}'); Object.keys(o).forEach(k=>adj.set(+k,o[k])); }catch(e){} }
function lsSaveA(){ try{ const o={}; adj.forEach((v,k)=>o[k]=v); localStorage.setItem(LSA,JSON.stringify(o)); }catch(e){} }
function persistAdj(cid){
  if(!dbNs){ lsSaveA(); return Promise.resolve(); }
  const ref=dbNs.collection('ajustes').doc('c'+cid), a=adj.get(cid);
  return (a ? ref.set(a) : ref.delete()).catch(e=>{ const n=$('asave'); if(n) n.textContent='No se pudo guardar: '+(e&&e.message||e); });
}
let dbNs = null, dbReady = false;
const $ = id => document.getElementById(id);
const stage=$('stage'), svg=$('svg'), gBg=$('gBg'), gWorld=$('gWorld'), gFg=$('gFg'), tip=$('tip');
const AXIS = 50;
const vis = c => c.g!=='X' && S.plans.has(c.p) && S.grs.has(c.g);

/* ---------- cabecera ---------- */
$('sub').textContent = 'Corte de datos: '+fmtD(CUT)+' · '+CLIENTS.length+' · ventana '+fmtD(WIN0)+' a '+fmtD(HOY)+' · '+CLIENTS.length+' clientes · '+CLIENTS.reduce((a,c)=>a+c.pg.length,0)+' pagos registrados desde may 2026';
const CHIPS=[];
function chipRow(host, items, set, onChange){
  items.forEach(([k,label,color,count]) => {
    const b=document.createElement('button'); b.className='chip'; b.type='button'; b.setAttribute('aria-pressed',set.has(k));
    if(color) b.style.setProperty('--c',color);
    b.innerHTML=(color?'<span class="dot"></span>':'')+esc(label)+(count!=null?' <span class="n"></span>':'');
    const n=b.querySelector('.n'); if(n) CHIPS.push({n,fn:count});
    b.addEventListener('click',()=>{ if(set.has(k)) set.delete(k); else set.add(k); b.setAttribute('aria-pressed', set.has(k)); onChange(); });
    host.appendChild(b);
  });
}
const refreshChips=()=>CHIPS.forEach(c=>c.n.textContent=c.fn());
const cnt = (f) => CLIENTS.filter(f).length;
chipRow($('gPlan'), PLANES.map(p=>[p,PNAME[p],'var(--c-'+p+')',()=>cnt(c=>c.p===p)]), S.plans, ()=>fullRender());
chipRow($('gGr'), GR.map(([k,l])=>[k,l,null,()=>cnt(c=>c.g===k)]), S.grs, ()=>fullRender());
chipRow($('gMk'), MARKS.map(([k,l])=>[k,l,'var(--g-vio)',()=>cnt(c=>k==='D'?c.mD.length>0:c.mE>0)]), S.marks, ()=>fullRender());
chipRow($('gLane'), [['ing','Ingresos'],['pag','Pagos'],['ven','Vencimientos']].map(x=>[x[0],x[1],null,null]), S.lanes, ()=>fullRender());

/* ---------- eventos de la línea ---------- */
function buildEvents(){
  const ing=[], pag=[], ven=[];
  CLIENTS.forEach(c => {
    if(!vis(c)) return;
    if(c.aD>=WIN0 && c.aD<=HOY) ing.push({c, d:c.aD, type:'alta'});
    if(c.rcD!=null && c.rcD>=WIN0 && c.rcD<=HOY) ing.push({c, d:c.rcD, type:'recompra'});
    c.pg.forEach(p => { if(p.D>=WIN0 && p.D<=HOY) pag.push({c, d:p.D, m:p[1], tipo:p[2], type:'pago'}); });
    if(c.bD!=null && c.bD<c.vD){ if(c.bD>=WIN0 && c.bD<=HOY) ven.push({c, d:c.bD, type:'baja'}); }
    else if(c.vD>=WIN0 && c.vD<=HOY) ven.push({c, d:c.vD, type:'venc', est:false});
  });
  return {ing,pag,ven};
}
const measure = document.createElement('canvas').getContext('2d');
measure.font = '11px "IBM Plex Sans", sans-serif';
const wcache = new Map();
const tw = s => { let w=wcache.get(s); if(w==null){ w=measure.measureText(s).width; wcache.set(s,w);} return w; };
const radius = it => it.type==='pago' ? Math.max(3, Math.min(11, 2.5+Math.sqrt(it.m)/9)) : (it.type==='alta'?6:6);

let L = null; // layout
const barFill = c => c.ab ? 'url(#pAB)' : c.g==='A' ? 'var(--g-act)' : c.g==='B' ? 'var(--g-ven)' : c.g==='C' ? 'var(--g-azul)' : 'var(--g-gris)';
const GCOL = {A:'var(--g-act)',B:'var(--g-ven)',C:'var(--g-azul)',S:'var(--g-gris)',O:'var(--g-gris)'};
function layout(){
  const ev = buildEvents();
  const labelMode = S.pxd >= 6;
  const rowH = labelMode ? 22 : 17;
  const lanes = [], items = [];
  let top = 0;
  // áreas de barras de vigencia (arriba), una por grupo
  GR.forEach(([key,title,desc]) => {
    if(!S.grs.has(key)) return;
    const all = CLIENTS.filter(c => vis(c) && c.g===key && c.aD<=HOY);
    const list = all.filter(c => c.endD>=WIN0 || (c.e==='inactivo' && !c.bD && c.vD>HOY)).sort((a,b)=>a.aD-b.aD || a.n.localeCompare(b.n));
    const fuera = all.length-list.length;
    list.forEach((c,i) => {
      const unk = c.e==='inactivo' && !c.bD && c.vD>HOY;
      const x1 = (Math.max(c.aD,WIN0)-D0)*S.pxd, x2 = (Math.min(unk?HOY:c.endD,HOY)-D0)*S.pxd;
      items.push({c, type:'bar', d:Math.max(c.aD,WIN0), x1, x2, unk, y: top+34+i*rowH+rowH/2, r:rowH/2, lane:'bar'});
    });
    lanes.push({key:'g'+key, title, desc:desc+(fuera?` · ${fuera} salieron antes de la ventana`:''), top, h:34+list.length*rowH+10, n:list.length, col:GCOL[key], band:true});
    top += 34+list.length*rowH+10 + 8;
  });
  top += 14;
  const defs = [['ing','Ingresos','Altas de programa y recompras',ev.ing],['pag','Pagos','Cada punto es un pago; el tamaño sigue el monto',ev.pag],['ven','Vencimientos','Fin de programa cumplido y bajas, hasta hoy',ev.ven]];
  defs.forEach(([key,title,desc,list]) => {
    if(!S.lanes.has(key)) return;
    list.sort((a,b)=>a.d-b.d || a.c.id-b.c.id);
    const ends=[];
    list.forEach(it => {
      it.r = radius(it);
      it.x = (it.d-D0)*S.pxd;
      let lw = 0;
      if(labelMode){ it.label = it.type==='pago' ? usd(it.m).replace('US$ ','$') : it.c.n; lw = tw(it.label)+8; } else it.label = null;
      const left = it.x - it.r - 3;
      let l=0; while(l<ends.length && ends[l] > left) l++;
      ends[l] = it.x + it.r + lw + 4;
      it.lvl = l; it.lane = key;
    });
    const levels = Math.max(1, ends.length);
    const h = 46 + levels*(labelMode?20:16) + 12;
    list.forEach(it => { it.y = top + 46 + it.lvl*(labelMode?20:16) + (labelMode?20:16)/2; items.push(it); });
    lanes.push({key,title,desc,top,h,n:list.length});
    top += h + 12;
  });
  items.forEach((it,i)=>it.k=i);
  L = {lanes, items, total: top, rowH, labelMode};
}

/* ---------- dibujo ---------- */
const W = () => stage.clientWidth, H = () => stage.clientHeight;
const sx = d => (d - S.x0)*S.pxd;
const laneY = () => AXIS + 8 + S.ty;

function pagosPorMes(){
  const m = new Map();
  CLIENTS.forEach(c => { if(!vis(c)) return;
    c.pg.forEach(p => { const k=p[0].slice(0,7); const o=m.get(k)||{usd:0,first:0}; o.usd+=p[1]; m.set(k,o); });
    if(c.fp){ const k=c.fp.slice(0,7); const o=m.get(k)||{usd:0,first:0}; o.first++; m.set(k,o); }
  });
  return m;
}

function drawBg(){
  const w=W(), h=H(), d0=S.x0, d1=S.x0+w/S.pxd, ly=laneY();
  let s='';
  // bandas de carril
  L.lanes.forEach(l => { s+=`<rect x="0" y="${ly+l.top}" width="${w}" height="${l.h}" fill="var(--lane)"/>`+(l.col?`<rect x="0" y="${ly+l.top}" width="4" height="${l.h}" fill="${l.col}"/>`:''); });
  // fuera de la ventana (antes del 01/05 y después de hoy)
  const xr=sx(WIN0), xc=sx(HOY);
  if(xr>0) s+=`<rect x="0" y="${AXIS}" width="${Math.min(w,xr)}" height="${h-AXIS}" fill="var(--est)" opacity=".55"/>`;
  if(xc<w) s+=`<rect x="${Math.max(0,xc)}" y="${AXIS}" width="${w-Math.max(0,xc)}" height="${h-AXIS}" fill="var(--est)" opacity=".55"/>`;
  // rejilla
  const monthPx = S.pxd*30.4;
  const x=dt(d0); let y=x.getUTCFullYear(), m=x.getUTCMonth();
  const pm = monthPx>=110 && S.lanes.has('pag') ? pagosPorMes() : null;
  let guard=0;
  while(guard++<400){
    const md = Math.round(Date.UTC(y,m,1)/864e5);
    if(md>d1) break;
    const mx = sx(md);
    s+=`<line x1="${mx}" x2="${mx}" y1="${m===0?0:AXIS-14}" y2="${h}" stroke="var(--line)" stroke-width="${m===0?1.5:1}"/>`;
    if(monthPx>=40) s+=`<text x="${mx+5}" y="${AXIS-20+14}" font-size="11.5" fill="var(--muted)">${MES[m]}${monthPx>=70?'':''}</text>`;
    if(m===0 || guard===1) s+=`<text x="${Math.max(mx,0)+5}" y="15" font-size="12" font-weight="600" fill="var(--fg)" class="mono">${y}</text>`;
    if(pm){
      const key=y+'-'+String(m+1).padStart(2,'0'); const o=pm.get(key);
      const pl=L.lanes.find(l=>l.key==='pag');
      if(o && pl) s+=`<text x="${mx+6}" y="${ly+pl.top+38}" font-size="11" fill="var(--fg)" class="mono">${usdK(o.usd)}${o.first?' · '+o.first+' 1.º pago':''}</text>`;
    }
    m++; if(m>11){m=0;y++;}
  }
  if(S.pxd>=5){
    const first=Math.floor(d0/7)*7; // lunes = (d+3)%7==0 -> epoch día 0 jueves
    for(let d=d0-((d0+3)%7+7)%7; d<=d1; d+=7){
      const wx=sx(d); s+=`<line x1="${wx}" x2="${wx}" y1="${AXIS-8}" y2="${h}" stroke="var(--line)" stroke-width=".6" opacity=".7"/>`;
      if(S.pxd>=9) s+=`<text x="${wx+3}" y="${AXIS-2}" font-size="10" fill="var(--muted)" class="mono">${dt(d).getUTCDate()}</text>`;
    }
  }
  gBg.innerHTML=s;
}
function drawFg(){
  const w=W(), h=H(), ly=laneY();
  let s='';
  s+=`<rect x="0" y="0" width="${w}" height="${AXIS}" fill="var(--surface)"/><line x1="0" x2="${w}" y1="${AXIS}" y2="${AXIS}" stroke="var(--line)"/>`;
  // redibuja etiquetas de mes/año sobre el encabezado (el fondo queda detrás)
  const d0=S.x0, d1=S.x0+w/S.pxd, monthPx=S.pxd*30.4;
  const x=dt(d0); let y=x.getUTCFullYear(), m=x.getUTCMonth(), g=0;
  while(g++<400){
    const md=Math.round(Date.UTC(y,m,1)/864e5); if(md>d1) break; const mx=sx(md);
    s+=`<line x1="${mx}" x2="${mx}" y1="${m===0?0:AXIS-18}" y2="${AXIS}" stroke="var(--line)" stroke-width="${m===0?1.5:1}"/>`;
    if(monthPx>=40) s+=`<text x="${mx+5}" y="${AXIS-8}" font-size="11.5" fill="var(--muted)">${MES[m]}</text>`;
    if(m===0||g===1) s+=`<text x="${Math.max(mx,0)+5}" y="15" font-size="12" font-weight="600" fill="var(--fg)" class="mono">${y}</text>`;
    m++; if(m>11){m=0;y++;}
  }
  if(S.pxd>=5){
    for(let d=d0-((d0+3)%7+7)%7; d<=d1; d+=7){ const wx=sx(d); if(S.pxd>=9) s+=`<text x="${wx+3}" y="${AXIS-22}" font-size="10" fill="var(--muted)" class="mono">${dt(d).getUTCDate()}</text>`; }
  }
  // referencias
  const xr=sx(WIN0), xc=sx(HOY), xk=sx(CUT);
  s+=`<line x1="${xr}" x2="${xr}" y1="${AXIS}" y2="${h}" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="5 4"/>`;
  s+=`<line x1="${xk}" x2="${xk}" y1="${AXIS}" y2="${h}" stroke="var(--muted)" stroke-width=".8" stroke-dasharray="2 3"/>`;
  s+=`<line x1="${xc}" x2="${xc}" y1="${AXIS}" y2="${h}" stroke="var(--accent)" stroke-width="1.6"/>`;
  const lab=(xx,t,col,anchor)=>{ const tw2=tw(t)+12; const rx = anchor==='end'? xx-tw2-2 : xx+2; return `<rect x="${rx}" y="${AXIS+4}" width="${tw2}" height="18" rx="4" fill="var(--surface)" stroke="${col}" stroke-width="1"/><text x="${rx+6}" y="${AXIS+17}" font-size="11" fill="${col}">${t}</text>`; };
  s+=lab(xr,'Inicio de ventana · '+fmtD(WIN0),'var(--muted)','start');
  s+=lab(xc,'Hoy · '+fmtD(HOY),'var(--accent)','end');
  // títulos de carril fijos a la izquierda
  L.lanes.forEach(l => {
    const t=ly+l.top; if(t+l.h<AXIS||t>h) return;
    const yy=Math.max(t+16, AXIS+16+ (t<AXIS? 0:0));
    const ty2 = l.band ? t+16 : Math.min(Math.max(t+16, AXIS+44), t+l.h-10);
    s+=`<g pointer-events="none"><rect x="8" y="${ty2-14}" width="${Math.min(w-16,Math.max(tw(l.title)+16, tw(l.desc)+16)+14)}" height="34" rx="6" fill="var(--surface)" opacity=".94" stroke="${l.col||'var(--line)'}" stroke-width="${l.col?1.6:1}"/><text x="16" y="${ty2}" font-size="13" font-weight="600" fill="var(--fg)" style="font-family:var(--f-display)">${l.title} <tspan fill="var(--muted)" font-weight="400" class="mono" font-size="11">${l.n}</tspan></text><text x="16" y="${ty2+13}" font-size="10.5" fill="var(--muted)">${l.desc}</text></g>`;
  });
  gFg.innerHTML=s;
}
function barSvg(it){
  const c=it.c, rh=L.rowH, h=rh-5, x1=it.x1, wid=Math.max(it.x2-it.x1,4), x2=x1+wid, sel=S.sel===c.id, hasN=notes.has(c.id);
  const mD=S.marks.has('D')&&c.mD.length>0, mE=S.marks.has('E')&&c.mE>0;
  let g=`<g data-k="${it.k}" transform="translate(0 ${it.y})" style="cursor:pointer">`;
  g+=`<rect x="${x1-3}" y="${-rh/2}" width="${wid+6}" height="${rh}" fill="transparent"/>`;
  g+=`<rect x="${x1}" y="${-h/2}" width="${wid}" height="${h}" rx="3" fill="${barFill(c)}"${it.unk?' fill-opacity=".3" stroke="var(--g-gris)" stroke-dasharray="4 3"':''}/>`;
  if(c.g==='O'&&!it.unk) g+=`<rect x="${x1}" y="${-h/2}" width="${wid}" height="${h}" rx="3" fill="url(#pOt)"/>`;
  if(c.e==='pausa') g+=`<rect x="${x1}" y="${-h/2}" width="${wid}" height="${h}" rx="3" fill="url(#pPa)"/>`;
  if(mD) g+=`<rect x="${x1-1}" y="${-h/2-1}" width="${wid+2}" height="${h+2}" rx="4" fill="none" stroke="var(--g-vio)" stroke-width="2.2"/>`;
  if(mE) g+=`<rect x="${x1-3}" y="${-h/2-3}" width="${wid+6}" height="${h+6}" rx="5" fill="none" stroke="var(--g-vio)" stroke-width="2" stroke-dasharray="5 3"/>`;
  if(sel) g+=`<rect x="${x1-5}" y="${-h/2-5}" width="${wid+10}" height="${h+10}" rx="6" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
  // inicio: punto del color del programa si el alta cae en la ventana; flecha si viene de antes
  if(c.aD>=WIN0) g+=`<circle cx="${x1+1}" cy="0" r="4.2" fill="var(--c-${c.p})" stroke="var(--surface)" stroke-width="1.4"/>`;
  else g+=`<path d="M${x1+7} ${-h/2+2} L${x1+2} 0 L${x1+7} ${h/2-2}" fill="none" stroke="var(--surface)" stroke-width="1.8"/><circle cx="${x1+12}" cy="0" r="3.2" fill="var(--c-${c.p})" stroke="var(--surface)" stroke-width="1.2"/>`;
  // fin
  if(c.vD>HOY && !it.unk) g+=`<path d="M${x2-6} ${-h/2+2} L${x2-1} 0 L${x2-6} ${h/2-2}" fill="none" stroke="var(--surface)" stroke-width="1.8"/>`;
  else if(!it.unk) g+=`<rect x="${x2-3}" y="${-h/2}" width="3" height="${h}" fill="var(--fg)" opacity=".55"/>`;
  if(c.qm) g+=`<text x="${x2+5}" y="4" font-size="12" font-weight="700" fill="var(--warn)">?</text>`;
  // etiqueta
  const tags=[c.mE?(c.mE===1?'E1':'E2'):'', c.mD.length?'D':'', c.sn?'seña':'', c.e==='pausa'?'pausa':'', c.ab?'A+B':''].filter(Boolean).join(' ');
  const ven = L.labelMode && c.vD>HOY && !it.unk ? ' → '+fmtD(c.vD).slice(0,6) : '';
  const txt = c.n+(tags?'  '+tags:'')+ven;
  const fs = L.labelMode ? 11.5 : 10.5;
  const tx = x1+(c.aD>=WIN0?10:18);
  const inside = wid > tw(txt)*fs/11 + 24;
  g+=`<text x="${inside?tx:x2+(c.qm?16:8)}" y="${fs/2-1}" font-size="${fs}" font-weight="${inside?600:500}" fill="${inside?'#fff':'var(--fg)'}"${inside?' stroke="rgba(0,0,0,.42)" stroke-width="2.4" paint-order="stroke"':''}>${esc(txt)}</text>`;
  if(hasN) g+=`<circle cx="${x2}" cy="${-h/2}" r="3.8" fill="var(--accent)" stroke="var(--surface)" stroke-width="1.2"/>`;
  return g+'</g>';
}
function markerSvg(it){
  if(it.type==='bar') return barSvg(it);
  const c=it.c, col=`var(--c-${c.p})`, r=it.r, sel=S.sel===c.id, hasN=notes.has(c.id);
  let g=`<g data-k="${it.k}" transform="translate(${it.x} ${it.y})" style="cursor:pointer">`;
  g+=`<circle r="${r+5}" fill="transparent"/>`;
  if(sel) g+=`<circle r="${r+4}" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
  if(it.type==='alta'){
    const nuevo = c.coh==='nuevo';
    if(c.anom) g+=`<circle r="${r}" fill="var(--surface)" stroke="var(--warn)" stroke-width="2" stroke-dasharray="3 2"/><text y="3.5" text-anchor="middle" font-size="10" font-weight="700" fill="var(--warn)">!</text>`;
    else g+= nuevo ? `<circle r="${r}" fill="${col}"/>` : `<circle r="${r-1}" fill="var(--surface)" stroke="${col}" stroke-width="2.4"/>`;
  } else if(it.type==='pago'){
    g+=`<circle r="${r}" fill="${col}" fill-opacity=".78" stroke="var(--surface)" stroke-width="1"/>`;
  } else if(it.type==='venc'){
    const warn = c.flags.some(f=>f.startsWith('Inactivo con venc')) || c.flags.some(f=>f.startsWith('Vigente/recompra'));
    if(it.est) g+=`<rect x="-${r}" y="-${r}" width="${2*r}" height="${2*r}" rx="1.5" fill="${col}" fill-opacity=".14" stroke="${warn?'var(--warn)':col}" stroke-width="1.8" stroke-dasharray="3 2.5"/>`;
    else g+=`<rect x="-${r}" y="-${r}" width="${2*r}" height="${2*r}" rx="1.5" fill="${col}" ${warn?'stroke="var(--warn)" stroke-width="2"':''}/>`;
  } else { // baja / recompra
    const rr=r+1.5; g+=`<path d="M0 -${rr} ${rr} 0 0 ${rr} -${rr} 0Z" fill="${it.type==='baja'?col:'var(--surface)'}" stroke="${it.type==='baja'?'var(--accent)':col}" stroke-width="2"/>`;
  }
  if(hasN) g+=`<circle cx="${r}" cy="-${r}" r="3.6" fill="var(--accent)" stroke="var(--surface)" stroke-width="1.2"/>`;
  if(it.label) g+=`<text x="${r+5}" y="3.8" font-size="11" fill="var(--fg)">${esc(it.label)}</text>`;
  return g+'</g>';
}
function drawWorld(){
  const tx = -(S.x0-D0)*S.pxd;
  let s='';
  // trazo del cliente elegido
  if(S.sel!=null){
    const pts = L.items.filter(i=>i.c.id===S.sel && i.type!=='bar').sort((a,b)=>a.d-b.d);
    if(pts.length>1) s+=`<path d="M${pts.map(p=>p.x+' '+p.y).join(' L')}" fill="none" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="4 3" opacity=".8"/>`;
  }
  // orden: pagos al fondo, resto encima
  const order=['bar','pago','alta','recompra','venc','baja'];
  const sorted=[...L.items].sort((a,b)=>order.indexOf(a.type)-order.indexOf(b.type));
  const x0=S.x0-60/S.pxd, x1=S.x0+(W()+200)/S.pxd;
  sorted.forEach(it => { if(it.type!=='bar' && (it.d<x0-40/S.pxd||it.d>x1)) return; s+=markerSvg(it); });
  gWorld.innerHTML=s;
  applyPan();
}
function applyPan(){ gWorld.setAttribute('transform', `translate(${-(S.x0-D0)*S.pxd} ${laneY()})`); }

let raf=0;
function schedule(kind){ schedule.k = Math.max(schedule.k||0, kind); if(raf) return; raf=requestAnimationFrame(()=>{ const k=schedule.k; schedule.k=0; raf=0; if(k>=2){ layout(); drawWorld(); } else applyPan(); drawBg(); drawFg(); }); }
function fullRender(){ layout(); drawWorld(); drawBg(); drawFg(); refreshChips(); renderRes(); if(S.tab==='cli') renderCli(); renderAj(); }

/* ---------- navegación ---------- */
function clampView(){
  const minP = Math.max(0.5, (W()-40)/(HOY-WIN0));
  S.pxd = Math.max(minP, Math.min(60, S.pxd));
  const xlo = WIN0-20/S.pxd, xhi = HOY+20/S.pxd-W()/S.pxd;
  S.x0 = xhi<xlo ? (xlo+xhi)/2 : Math.max(xlo, Math.min(xhi, S.x0));
  if(!L) return;
  const lo = -(L.total+40) + (H()-AXIS)*0.5, hi = 30;
  S.ty = Math.max(lo, Math.min(hi, S.ty));
}
function zoomAt(mx, f){
  const day = S.x0 + mx/S.pxd; S.pxd*=f; S.pxd=Math.max(0.25,Math.min(60,S.pxd)); S.x0 = day - mx/S.pxd; clampView(); schedule(2);
}
function fit(a,b){ const w=W()-40; S.pxd=Math.max(0.25,Math.min(60,w/(D(b)-D(a)))); S.x0=D(a)-20/S.pxd; S.ty=0; clampView(); schedule(2); }
$('zIn').onclick=()=>zoomAt(W()/2,1.5); $('zOut').onclick=()=>zoomAt(W()/2,1/1.5);
$('vJun').onclick=()=>fit(DATA.win0,DATA.hoy);
$('vNow').onclick=()=>{ S.pxd=Math.max(S.pxd,8); S.x0=HOY-(W()*0.75)/S.pxd; clampView(); schedule(2); };
stage.addEventListener('wheel', e => {
  e.preventDefault(); const r=stage.getBoundingClientRect();
  if(e.shiftKey){ S.x0 += (e.deltaY||e.deltaX)/S.pxd; schedule(1); }
  else zoomAt(e.clientX-r.left, Math.exp(-e.deltaY*(e.ctrlKey?0.01:0.0016)));
},{passive:false});
stage.addEventListener('keydown', e => {
  const k=e.key;
  if(k==='+'||k==='='){zoomAt(W()/2,1.3);} else if(k==='-'){zoomAt(W()/2,1/1.3);}
  else if(k==='ArrowLeft'){S.x0-=60/S.pxd;schedule(1);} else if(k==='ArrowRight'){S.x0+=60/S.pxd;schedule(1);}
  else if(k==='ArrowUp'){S.ty+=60;clampView();schedule(1);} else if(k==='ArrowDown'){S.ty-=60;clampView();schedule(1);} else return;
  e.preventDefault();
});
const ptrs=new Map(); let pinch=null, moved=0, downTarget=null;
stage.addEventListener('pointerdown', e => {
  if(e.button>0) return;
  stage.setPointerCapture(e.pointerId); ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  moved=0; downTarget=e.target.closest('[data-k]');
  if(ptrs.size===2){ const [a,b]=[...ptrs.values()]; pinch={d:Math.hypot(a.x-b.x,a.y-b.y)}; }
  stage.classList.add('drag'); hideTip();
});
stage.addEventListener('pointermove', e => {
  const p=ptrs.get(e.pointerId);
  if(!p){ if(e.pointerType==='mouse') hover(e); return; }
  const dx=e.clientX-p.x, dy=e.clientY-p.y; p.x=e.clientX; p.y=e.clientY; moved+=Math.abs(dx)+Math.abs(dy);
  if(ptrs.size===2 && pinch){
    const [a,b]=[...ptrs.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y), r=stage.getBoundingClientRect();
    zoomAt((a.x+b.x)/2-r.left, d/pinch.d); pinch.d=d; return;
  }
  S.x0 -= dx/S.pxd; S.ty += dy; clampView(); schedule(1);
});
const endPtr = e => {
  const had=ptrs.delete(e.pointerId); if(!had) return; if(ptrs.size<2) pinch=null; if(!ptrs.size) stage.classList.remove('drag');
  if(e.type==='pointerup' && moved<6 && downTarget){ const it=L.items[+downTarget.dataset.k]; if(it){ select(it.c.id, true); showTip(it,e); } }
  else if(e.type==='pointerup' && moved<6 && !downTarget){ hideTip(); }
};
stage.addEventListener('pointerup', endPtr); stage.addEventListener('pointercancel', endPtr);
stage.addEventListener('pointerleave', e=>{ if(e.pointerType==='mouse') hideTip(); });
new ResizeObserver(()=>{ if(L) schedule(2); }).observe(stage);

/* ---------- tooltip ---------- */
function grpLine(c){
  let h=`<div class="r" style="color:${GCOL[c.g]||'var(--muted)'}"><b style="font-size:12.5px">${esc(GNAME[c.g]||'')}</b>${c.ab?' · también B (vencido por fecha)':''}</div>`;
  if(c.sn) h+='<div class="r">Seña o adelanto: pago de US$ 50 a 500 sin deuda</div>';
  if(c.mE) h+=`<div class="warn" style="color:var(--g-vio)">${c.mE===1?'E1 · cuota sin pagar, sigue en Discord':'E2 · posible abandono silencioso, fuera de Discord'} (proxy: deuda y 30+ días sin pago)</div>`;
  c.mD.forEach(m=>{ h+=`<div class="warn" style="color:var(--g-vio)">D · ${esc(m)}</div>`; });
  if(c.qm) h+=`<div class="warn">Vencimiento a confirmar: el año de Boost ya se cumplió y la ficha suma ${c.dvd} días</div>`;
  if(c.e==='pausa') h+='<div class="r">En pausa (sin fechas de pausa cargadas)</div>';
  return h;
}
function tipHtml(it){
  const c=it.c; const nn=(notes.get(c.id)||[]).length;
  let ev='';
  if(it.type==='alta') ev=`Ingreso · ${fmtD(it.d)}`;
  else if(it.type==='recompra') ev=`Recompra · ${fmtD(it.d)}`;
  else if(it.type==='pago') ev=`Pago ${usd(it.m)} · ${fmtD(it.d)} · ${it.tipo}`;
  else if(it.type==='baja') ev=`Baja anticipada · ${fmtD(it.d)}`;
  else if(it.type==='bar') ev=`Ingreso ${fmtD(c.aD)} · ${c.vD>HOY?'vence':'venció'} ${fmtD(c.vD)}`;
  else ev = it.est ? `Vencimiento estimado · ${fmtD(it.d)}` : `Vencimiento · ${fmtD(it.d)}`;
  let extra='';
  if(it.type==='venc'||it.type==='alta'||it.type==='bar'){ extra=`<div class="r">Inicio ${fmtD(c.aD)} · ${c.d} días de programa</div>`; if(Math.abs(c.vD-c.vcD)>7) extra+=`<div class="r">Inicio + duración daría ${fmtD(c.vcD)}</div>`; }
  if(it.type==='pago') extra=`<div class="r">Total cobrado: ${usd(c.tp)} · deuda: ${usd(c.ad)}</div>`;
  return `<b>${esc(c.n)}</b><div class="r">${PNAME[c.p]} · ${ESTADO[c.e]||c.e}</div><div>${ev}</div>${extra}${grpLine(c)}${nn?`<div class="r">${nn} nota${nn>1?'s':''}</div>`:''}${c.flags.filter(f=>!f.startsWith('Total pagado')).slice(0,2).map(f=>`<div class="warn">${esc(f)}</div>`).join('')}`;
}
function placeTip(e){
  const r=stage.getBoundingClientRect(); let x=e.clientX-r.left+14, y=e.clientY-r.top+14;
  const tw2=tip.offsetWidth, th=tip.offsetHeight;
  if(x+tw2>r.width-6) x=e.clientX-r.left-tw2-14; if(x<6) x=6;
  if(y+th>r.height-6) y=e.clientY-r.top-th-14; if(y<6) y=6;
  tip.style.left=x+'px'; tip.style.top=y+'px';
}
function showTip(it,e){ tip.innerHTML=tipHtml(it); tip.style.display='block'; placeTip(e); }
function hideTip(){ tip.style.display='none'; }
function hover(e){
  const t=e.target.closest&&e.target.closest('[data-k]');
  if(!t){ hideTip(); return; }
  const it=L.items[+t.dataset.k]; if(it) showTip(it,e);
}

/* ---------- panel ---------- */
function setTab(t){
  S.tab=t; $('tabRes').setAttribute('aria-selected',t==='res'); $('tabCli').setAttribute('aria-selected',t==='cli'); $('tabAj').setAttribute('aria-selected',t==='aj');
  $('paneRes').hidden = t!=='res'; $('paneCli').hidden = t!=='cli'; $('paneAj').hidden = t!=='aj';
  if(t==='cli') renderCli(); if(t==='aj') renderAj();
}
$('tabRes').onclick=()=>setTab('res'); $('tabCli').onclick=()=>setTab('cli'); $('tabAj').onclick=()=>setTab('aj');
$('goF').onclick=()=>{ setTab('cli'); $('panel').scrollIntoView({behavior:'smooth',block:'start'}); };
function nmBtn(c,extra){ return `<button type="button" class="nm" data-cid="${c.id}" style="--c:var(--c-${c.p})"><span class="dot"></span>${esc(c.n)}${extra?` <span class="mono" style="color:var(--muted);font-size:11px">${extra}</span>`:''}</button>`; }
function activeAt(d, list){ return list.filter(c=>!c.anom && c.aD<d && c.vD>=d && (c.bD==null||c.bD>=d)); }
function monthRows(list){
  const rows=[];
  for(const [y,m] of [[2026,4],[2026,5],[2026,6],[2026,7],[2026,8],[2026,9]]){
    const s=Math.round(Date.UTC(y,m,1)/864e5), eFull=Math.round(Date.UTC(y,m+1,0)/864e5), e=Math.min(eFull,CUT);
    const ya=activeAt(s,list).length;
    const altas=list.filter(c=>!c.anom&&c.aD>=s&&c.aD<=e).length;
    const sal=list.filter(c=>!c.anom&&c.finD>=s&&c.finD<=e&&c.aD<=e).length;
    const cierre=activeAt(e+1,list).length;
    const fpay=list.filter(c=>c.fpD!=null&&c.fpD>=s&&c.fpD<=e).length;
    const pays=[]; let u=0; list.forEach(c=>c.pg.forEach(p=>{ if(p.D>=s&&p.D<=e){ pays.push(c.id); u+=p[1]; } }));
    rows.push({mes:MES[m]+' '+y, ya, altas, sal, cierre, fpay, pagadores:new Set(pays).size, u, parcial: eFull>CUT, tIng: ya?altas/ya:null, tEgr: ya?sal/ya:null});
  }
  return rows;
}
const pct = x => x==null ? '–' : (x*100).toLocaleString('es-AR',{maximumFractionDigits:1})+'%';
function proyeccion(list, mr){
  const full = mr.filter(r=>!r.parcial && r.mes.indexOf('may')<0);
  const h = full.length ? mean(full.map(r=>r.altas)) : 0;
  const P = list.filter(c=>c.e!=='inactivo' && c.g!=='X' && c.aD<=HOY && c.vD>HOY);
  const out=[]; let stock=P.length;
  [[2026,9,true],[2026,10],[2026,11],[2027,0],[2027,1],[2027,2],[2027,3]].forEach(([y,m,first])=>{
    const s0 = first ? HOY+1 : Math.round(Date.UTC(y,m,1)/864e5), e0 = Math.round(Date.UTC(y,m+1,0)/864e5);
    const sal = P.filter(c=>c.vD>=s0 && c.vD<=e0);
    const o={mes:MES[m]+' '+y+(first?' (resto)':''), ini:stock, sal:sal.length, men:sal.filter(c=>c.p==='mentoria').length, bo:sal.filter(c=>c.p==='boost').length, otros:sal.filter(c=>c.p!=='mentoria'&&c.p!=='boost').length, tEgr: stock?sal.length/stock:null, ing:first?h*((e0-HOY)/30):h};
    o.tIng = stock?o.ing/stock:null; o.cierre = stock-o.sal+o.ing; stock=o.cierre; out.push(o);
  });
  return {rows:out, h};
}
function planTable(){
  return PLANES.map(p=>{
    const g=CLIENTS.filter(c=>c.p===p && c.coh!=='revisar');
    const comp=g.filter(c=>c.cat==='completo'), cur=g.filter(c=>c.cat==='en_curso');
    const avance=mean(cur.map(c=>Math.min(1,c.perm/(c.vD-c.aD))));
    return {p, n:g.length, cur:cur.length, comp:comp.length, bajaF:g.filter(c=>c.cat==='baja_anticipada_fecha').length, bajaS:g.filter(c=>c.cat==='baja_anticipada_sin_fecha').length, abierto:g.filter(c=>c.cat==='vigente_venc_pasado').length,
      dur:median(g.map(c=>c.d)), permC:median(comp.map(c=>c.perm)), permCur:mean(cur.map(c=>c.perm)), avance, cobrado:g.reduce((a,c)=>a+c.tp,0), deuda:g.reduce((a,c)=>a+c.ad,0), pagadores:g.filter(c=>c.fpD!=null).length};
  });
}
function renderRes(){
  const list=CLIENTS.filter(c=>S.plans.has(c.p) && c.g!=='X');
  const byPlan = arr => PLANES.filter(p=>arr.some(c=>c.p===p)).map(p=>`${PNAME[p]} ${arr.filter(c=>c.p===p).length}`).join(' · ');
  const mr=monthRows(list);
  const pt=planTable();
  const pj=proyeccion(list, mr);
  const gl=(k)=>list.filter(c=>c.g===k);
  const nB=list.filter(c=>c.g==='B'||c.ab).length, nD=list.filter(c=>c.mD.length).length, nE1=list.filter(c=>c.mE===1).length, nE2=list.filter(c=>c.mE===2).length;
  const names=(arr,ex)=>arr.map(c=>nmBtn(c,ex?ex(c):ESTADO[c.e]||c.e)).join('')||'<span class="note">Sin datos con este filtro</span>';
  const prox=(a,b)=>list.filter(c=>c.p==='mentoria' && c.e!=='inactivo' && c.vD>HOY+a && c.vD<=HOY+b).sort((x,y)=>x.vD-y.vD);
  const m30=prox(0,30), m60=prox(30,60), m90=prox(60,90);
  const mentVencidas=list.filter(c=>c.p==='mentoria' && c.e!=='inactivo' && c.vD<=HOY);
  const kp=(v,l,col)=>`<div class="kpi" style="border-left:4px solid ${col}"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  $('paneRes').innerHTML=`
  <div class="kpis full">
    ${kp(gl('A').length,'A · activos en Discord','var(--g-act)')}
    ${kp(nB,'B · vencidos con estado activo ('+list.filter(c=>c.ab).length+' también en A)','var(--g-ven)')}
    ${kp(gl('C').length,'C · salieron por vencimiento','var(--g-azul)')}
    ${kp(gl('S').length,'Señas o adelantos','var(--g-gris)')}
    ${kp(nD,'D · ingresantes con inconsistencia','var(--g-vio)')}
    ${kp(nE1+nE2,'E · cuota sin pagar (proxy): '+nE1+' en Discord, '+nE2+' fuera','var(--g-vio)')}
  </div>
  <div class="note full">Fuente de verdad: los 58 canales activos de Discord. D y E marcan solo a ingresantes desde el 01/05. Sin grupo: ${gl('O').length}. El estado financiero detallado sigue pendiente: no hay calendario de cuotas, así que E se calcula con deuda y más de 30 días sin pago.</div>
  <section>
    <h2>Grupos por programa</h2>
    <div class="tw"><table><thead><tr><th>Grupo</th>${PLANES.map(p=>`<th>${PNAME[p]}</th>`).join('')}<th>Total</th></tr></thead><tbody>
    ${GR.map(([k,l])=>`<tr><td><span class="pill" style="--c:${GCOL[k]}">${esc(l.split(' · ')[0])}</span></td>${PLANES.map(p=>`<td>${gl(k).filter(c=>c.p===p).length}</td>`).join('')}<td>${gl(k).length}</td></tr>`).join('')}
    </tbody></table></div>
  </section>
  <section>
    <h2>Mentorías: próximos vencimientos</h2>
    <div class="row"><span>Hasta 30 días</span><span>${m30.length}</span></div>
    <div class="row"><span>31 a 60 días</span><span>${m60.length}</span></div>
    <div class="row"><span>61 a 90 días</span><span>${m90.length}</span></div>
    <div class="row"><span>Ya vencidas con estado activo</span><span>${mentVencidas.length}</span></div>
    <details style="margin-top:8px"><summary>Quiénes vencen en los próximos 90 días</summary>
      <div class="gl">Hasta 30 días · ${m30.length}</div><div class="names">${names(m30,c=>fmtD(c.vD).slice(0,6))}</div>
      <div class="gl">31 a 60 días · ${m60.length}</div><div class="names">${names(m60,c=>fmtD(c.vD).slice(0,6))}</div>
      <div class="gl">61 a 90 días · ${m90.length}</div><div class="names">${names(m90,c=>fmtD(c.vD).slice(0,6))}</div>
    </details>
    <div class="note" style="margin-top:6px">Duraciones: Mentoría 4 meses, con pausa y prórroga; Boost hasta mayo 12 meses; Boost desde junio 6 meses.</div>
  </section>
  <section class="full">
    <h2>Mes a mes</h2>
    <div class="tw"><table><thead><tr><th>Mes</th><th title="Activos el día 1 del mes">Ya estaban</th><th>Altas</th><th>Salidas</th><th>Cierre</th><th title="Altas sobre los que ya estaban">Tasa ing.</th><th title="Salidas sobre los que ya estaban">Tasa egr.</th><th>1.er pago</th><th>Pagaron</th><th>USD</th></tr></thead><tbody>
    ${mr.map(r=>`<tr><td>${r.mes}${r.parcial?' *':''}</td><td>${r.ya}</td><td>${r.altas}</td><td>${r.sal}</td><td>${r.cierre}</td><td>${pct(r.tIng)}</td><td>${pct(r.tEgr)}</td><td>${r.fpay}</td><td>${r.pagadores}</td><td>${Math.round(r.u).toLocaleString('es-AR')}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="note">Ya estaban + altas − salidas = cierre. Salida = vencimiento (según la duración del programa: Mentoría 4 meses, Boost 12 o 6) o baja anticipada con fecha. Tasas sobre los activos al inicio del mes. * mes parcial hasta el corte.</div>
  </section>
  <section class="full">
    <h2>Proyección por duración de programa</h2>
    <div class="tw"><table><thead><tr><th>Período</th><th>Activos al inicio</th><th>Vencen</th><th>Mentoría</th><th>Boost</th><th>Otros</th><th>Tasa egr.</th><th>Ingresos (prom.)</th><th>Tasa ing.</th><th>Cierre proy.</th></tr></thead><tbody>
    ${pj.rows.map(r=>`<tr><td>${r.mes}</td><td>${Math.round(r.ini)}</td><td>${r.sal}</td><td>${r.men}</td><td>${r.bo}</td><td>${r.otros}</td><td>${pct(r.tEgr)}</td><td>${r.ing.toLocaleString('es-AR',{maximumFractionDigits:1})}</td><td>${pct(r.tIng)}</td><td>${Math.round(r.cierre)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="note">Egresos: clientes que siguen en curso cuyo vencimiento (el cargado o el que ajustes) cae en el período; no incluye renovaciones ni prórrogas. Ingresos: supuesto igual al promedio mensual de altas de junio a septiembre (${pj.h.toLocaleString('es-AR',{maximumFractionDigits:1})} por mes). Se recalcula al cargar ajustes.</div>
  </section>
  <section class="full">
    <h2>Permanencia por programa</h2>
    <div class="tw"><table><thead><tr><th>Programa</th><th>Clientes</th><th>En curso</th><th>Terminaron</th><th>Bajas</th><th>Duración</th><th>Perm. final</th><th>Avance</th><th>Cobrado</th><th>Deuda</th></tr></thead><tbody>
    ${pt.map(r=>`<tr class="${S.plans.has(r.p)?'':'dim'}"><td><span class="pill" style="--c:var(--c-${r.p})">${PNAME[r.p]}</span></td><td>${r.n}</td><td>${r.cur}</td><td>${r.comp}</td><td>${r.bajaF+r.bajaS}</td><td>${r.dur?Math.round(r.dur)+' d':'–'}</td><td>${r.permC!=null?Math.round(r.permC)+' d':'–'}</td><td>${r.avance!=null?Math.round(r.avance*100)+'%':'–'}</td><td>${Math.round(r.cobrado/1000)} k</td><td>${Math.round(r.deuda/1000)} k</td></tr>`).join('')}
    </tbody></table></div>
    <div class="note">Duración: mediana contractual. Perm. final: mediana de días en los que terminaron su programa. Avance: porcentaje medio del programa ya recorrido por los que siguen en curso. Bajas incluye ${pt.reduce((a,r)=>a+r.bajaS,0)} inactivos sin fecha de baja (su permanencia no se puede medir). USD en miles.</div>
  </section>
  <details open><summary>A · Discord activo (${gl('A').length})</summary><div class="note" style="margin-top:6px">${byPlan(gl('A'))}</div><div class="names">${names(gl('A'),c=>c.ab?'A+B':(c.qm?'?':ESTADO[c.e]||c.e))}</div></details>
  <details><summary>B · Vencidos (${nB})</summary><div class="names">${names(list.filter(c=>c.g==='B'||c.ab),c=>(c.ab?'A+B · ':'')+fmtD(c.vD).slice(0,6))}</div></details>
  <details><summary>C · Salieron por vencimiento (${gl('C').length})</summary><div class="note" style="margin-top:6px">${byPlan(gl('C'))}</div><div class="names">${names(gl('C'),c=>fmtD(c.vD).slice(0,6))}</div></details>
  <details><summary>D · Inconsistencias (${nD})</summary><div class="names">${names(list.filter(c=>c.mD.length),c=>c.mD[0].slice(0,26))}</div></details>
  <details><summary>E · Cuota sin pagar, proxy (${nE1+nE2})</summary>
    <div class="gl">E1 · sigue en Discord · ${nE1}</div><div class="names">${names(list.filter(c=>c.mE===1),c=>usd(c.ad))}</div>
    <div class="gl">E2 · fuera de Discord, posible abandono silencioso · ${nE2}</div><div class="names">${names(list.filter(c=>c.mE===2),c=>usd(c.ad))}</div></details>
  <details><summary>Señas (${gl('S').length})</summary><div class="names">${names(gl('S'),c=>usd(c.tp))}</div></details>
  <details><summary>Sin grupo (${gl('O').length})</summary><div class="names">${names(gl('O'))}</div></details>
  ${CLIENTS.some(c=>c.anom)?`<div class="warn">Revisar: ${CLIENTS.filter(c=>c.anom).map(c=>esc(c.n)).join(', ')} tiene fecha de inicio ${fmtD(CLIENTS.find(c=>c.anom).aD)}, posterior al corte. No cuenta en ningún total.</div>`:''}`;
}
$('paneRes').addEventListener('click', e=>{ const b=e.target.closest('[data-cid]'); if(b) select(+b.dataset.cid, true, true); });

/* ---------- selección ---------- */
function select(id, openTab, pan){
  S.sel=id; if(openTab) setTab('cli'); else if(S.tab==='cli') renderCli();
  { const gf=$('goF'), c0=BYID.get(id); if(c0){ gf.hidden=false; gf.textContent='Ficha y ajustes de '+c0.n+' ↓'; } }
  if(pan){ const c=BYID.get(id); S.pxd=Math.max(S.pxd,3); S.x0=Math.max(c.aD,WIN0)-(W()*0.3)/S.pxd; clampView(); }
  schedule(2); if(S.tab==='cli') renderCli();
}

/* ---------- notas ---------- */
const LS='atv-linea-pagos-notas';
function lsLoad(){ try{ const o=JSON.parse(localStorage.getItem(LS)||'{}'); Object.keys(o).forEach(k=>notes.set(+k,o[k])); }catch(e){} }
function lsSave(){ try{ const o={}; notes.forEach((v,k)=>o[k]=v); localStorage.setItem(LS,JSON.stringify(o)); }catch(e){} }
const queue=new Map();
function persist(cid){
  const items=notes.get(cid)||[];
  if(!dbNs){ lsSave(); return Promise.resolve(); }
  const prev=queue.get(cid)||Promise.resolve();
  const next=prev.catch(()=>{}).then(()=>{ const ref=dbNs.collection('notes').doc('c'+cid); return items.length ? ref.set({items}) : ref.delete(); }).catch(e=>{ $('nsave') && ($('nsave').textContent='No se pudo guardar: '+(e&&e.message||e)); });
  queue.set(cid,next); return next;
}
const uid=()=>Math.random().toString(36).slice(2,9);
let editing=null, delArm=null, delTimer=0;
function renderNotes(){
  const host=$('nlist'); if(!host||S.sel==null) return; if(editing) return;
  const items=notes.get(S.sel)||[];
  host.innerHTML = items.length ? [...items].reverse().map(n=>`<div class="ni" data-nid="${n.id}"><div class="meta"><span>${new Date(n.at).toLocaleString('es-AR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}${n.ed?' · editada':''}</span></div><p>${esc(n.t)}</p><div class="acts"><button type="button" class="btn" data-a="edit">Editar</button><button type="button" class="btn" data-a="del">Eliminar</button></div></div>`).join('') : '<div class="note">Todavía no hay notas para este cliente.</div>';
}
function renderCli(){
  const host=$('paneCli'); const c=S.sel!=null?BYID.get(S.sel):null;
  const q=host.querySelector('#csearch'); const qv=q?q.value:'';
  const colA=`<div class="col"><input type="search" id="csearch" placeholder="Buscar cliente por nombre" value="${esc(qv)}" aria-label="Buscar cliente"><div class="clist" id="clist" style="max-height:360px"></div></div>`;
  if(!c){ host.innerHTML=colA+'<div class="col"><div class="note">Elegí un cliente en la lista o hacé clic en una barra o punto del lienzo para ver su ficha, ajustar su vencimiento y estado financiero, y cargar notas.</div></div>'; bindSearch(); fillList(); return; }
  const dias = c.upD!=null ? CUT-c.upD : null;
  const stalled = c.ad>0 && dias!=null && dias>=30;
  const esTerm = c.cat==='completo'||c.cat==='baja_anticipada_fecha';
  const prog = c.vD>c.aD ? Math.max(0,Math.min(1,(c.perm??0)/(c.vD-c.aD))) : 0;
  const a=adj.get(c.id)||{};
  const colB=`<div class="col"><div><h2 style="margin-bottom:4px">${esc(c.n)}</h2>
    <span class="pill" style="--c:var(--c-${c.p})">${PNAME[c.p]}</span> <span class="pill">${ESTADO[c.e]||c.e}</span> <span class="pill" style="--c:${GCOL[c.g]||'var(--line)'}">${esc(GNAME[c.g]||'')}${c.ab?' + B':''}</span>${c.mE?`<span class="pill" style="--c:var(--g-vio)">E${c.mE}</span>`:''}${c.mD.length?'<span class="pill" style="--c:var(--g-vio)">D</span>':''}${c.sn?'<span class="pill">Seña</span>':''}${c.adj?'<span class="pill" style="--c:var(--accent)">Ajustado</span>':''}</div>
    <div>
      <div class="row"><span>Ingreso</span><span>${fmtD(c.aD)}</span></div>
      <div class="row"><span>${c.vD>HOY?'Vencimiento':'Vencimiento (cumplido)'}</span><span>${fmtD(c.vD)}${a.v?' · ajustado':''}</span></div>
      <div class="row"><span>Inicio + ${c.d} días</span><span>${fmtD(c.vcD)}</span></div>
      ${c.veD!=null?`<div class="row"><span>Según duración del programa</span><span>${fmtD(c.veD)}</span></div>`:''}
      ${c.rcD!=null?`<div class="row"><span>Recompra</span><span>${fmtD(c.rcD)}</span></div>`:''}
      ${c.bD!=null?`<div class="row"><span>Baja</span><span>${fmtD(c.bD)}</span></div>`:''}
      <div class="row"><span>Permanencia</span><span>${c.perm!=null?c.perm+' d'+(esTerm?'':' hasta hoy'):'sin fecha de baja'}</span></div>
    </div>
    ${c.perm!=null?`<div class="bar" style="--c:var(--c-${c.p})" aria-hidden="true"><i style="width:${Math.round(prog*100)}%"></i></div><div class="note">${Math.round(prog*100)}% del programa recorrido</div>`:''}
    <div>
      <h2>Pagos</h2>
      <div class="row"><span>Cobrado (con fecha)</span><span>${usd(c.tp)}</span></div>
      <div class="row"><span>Deuda${a.deuda!=null&&a.deuda!==''?' (ajustada)':''}</span><span>${usd(c.ad)}</span></div>
      <div class="row"><span>Pagos / primero / último</span><span>${c.pg.length}${c.fpD!=null?' · '+fmtD(c.fpD).slice(0,6)+' · '+fmtD(c.upD).slice(0,6):''}</span></div>
      ${dias!=null?`<div class="row"><span>Días desde el último pago</span><span>${dias}</span></div>`:''}
      ${a.estado?`<div class="row"><span>Estado financiero cargado</span><span>${esc(FINN[a.estado]||a.estado)}</span></div>`:''}
      ${a.prox?`<div class="row"><span>Próxima cuota</span><span>${fmtD(D(a.prox))}${a.monto?' · '+usd(+a.monto):''}</span></div>`:''}
      ${stalled?`<div class="warn" style="margin-top:6px">Tiene deuda y pasaron ${dias} días sin pagar (proxy: no hay calendario de cuotas).</div>`:''}
      ${c.fpD==null?'<div class="note" style="margin-top:6px">Sin pagos registrados.</div>':''}
    </div>
    ${(c.flags.length||c.mD.length||c.qm)?`<div>${c.flags.map(f=>`<div class="warn">• ${esc(f)}</div>`).join('')}${c.qm?'<div class="warn">• Vencimiento a confirmar (marca ?)</div>':''}</div>`:''}</div>`;
  const colC=`<div class="col">
    <div>
      <h2>Ajustes del cliente</h2>
      <div class="note" style="margin-bottom:8px">Cargá el dato real y se recalculan los grupos, las barras, las tasas y la proyección. En la ficha original: vencimiento ${fmtD(c.o.vD)}, deuda ${usd(c.o.ad)}. Las marcas D y E se aplican solo a ingresantes desde el 01/05.</div>
      <div class="frow">
        <label class="f">Vencimiento del programa<input type="date" id="aV" value="${a.v||iso(c.vD)}"></label>
        <label class="f">Estado financiero<select id="aE">${FIN.map(([k,l])=>`<option value="${k}"${(a.estado||'')===k?' selected':''}>${esc(l)}</option>`).join('')}</select></label>
        <label class="f">Deuda actual (US$)<input type="number" min="0" step="50" id="aD" placeholder="${Math.round(c.o.ad)}" value="${a.deuda!=null&&a.deuda!==''?a.deuda:''}"></label>
        <label class="f">Próxima cuota (fecha)<input type="date" id="aP" value="${a.prox||''}"></label>
        <label class="f">Monto de esa cuota (US$)<input type="number" min="0" step="50" id="aM" value="${a.monto||''}"></label>
      </div>
      <div class="acts"><button type="button" class="btn pri" id="asv">Guardar ajustes</button><button type="button" class="btn" id="arst">Restablecer a la ficha</button><span class="note" id="asave">${dbNs?'Los ajustes se comparten con quien abra esta página.':'Los ajustes se guardan solo en este navegador.'}</span></div>
    </div>
    <div>
      <h2>Notas</h2>
      <textarea id="ntext" placeholder="Escribí una nota sobre este cliente" aria-label="Nueva nota"></textarea>
      <div class="acts"><button type="button" class="btn pri" id="nadd">Agregar nota</button><span class="note" id="nsave">${dbNs?'Las notas se comparten con quien abra esta página.':'Las notas se guardan solo en este navegador.'}</span></div>
      <div class="nl" id="nlist" style="margin-top:10px"></div>
    </div></div>`;
  host.innerHTML=colA+colB+colC; bindSearch(); fillList(); renderNotes();
  $('asv').onclick=()=>{
    const v=$('aV').value, e=$('aE').value, d=$('aD').value, pr=$('aP').value, m=$('aM').value;
    const o={}; if(v && v!==iso(c.o.vD)) o.v=v; if(e) o.estado=e; if(d!=='') o.deuda=+d; if(pr) o.prox=pr; if(m!=='') o.monto=+m;
    if(Object.keys(o).length){ o.at=new Date().toISOString(); adj.set(c.id,o); } else adj.delete(c.id);
    persistAdj(c.id); applyAll(); fullRender(); $('asave') && ($('asave').textContent='Ajustes guardados.');
  };
  $('arst').onclick=()=>{ adj.delete(c.id); persistAdj(c.id); applyAll(); fullRender(); };
  $('nadd').onclick=()=>{ const t=$('ntext').value.trim(); if(!t) return; const arr=(notes.get(c.id)||[]).slice(); arr.push({id:uid(),t,at:new Date().toISOString()}); notes.set(c.id,arr); $('ntext').value=''; persist(c.id); renderNotes(); schedule(2); };
  $('nlist').onclick=e=>{
    const b=e.target.closest('[data-a]'); if(!b) return; const card=b.closest('[data-nid]'); const nid=card.dataset.nid; const arr=(notes.get(c.id)||[]).slice(); const i=arr.findIndex(n=>n.id===nid); if(i<0) return;
    if(b.dataset.a==='edit'){
      editing=nid; card.querySelector('p').outerHTML=`<textarea id="nedit">${esc(arr[i].t)}</textarea>`;
      card.querySelector('.acts').innerHTML='<button type="button" class="btn pri" data-a="save">Guardar</button><button type="button" class="btn" data-a="cancel">Cancelar</button>'; card.querySelector('#nedit').focus();
    } else if(b.dataset.a==='save'){
      const t=card.querySelector('#nedit').value.trim(); editing=null; if(t){ arr[i]={...arr[i],t,ed:true}; notes.set(c.id,arr); persist(c.id); } renderNotes();
    } else if(b.dataset.a==='cancel'){ editing=null; renderNotes(); }
    else if(b.dataset.a==='del'){
      if(delArm===nid){ arr.splice(i,1); notes.set(c.id,arr); if(!arr.length) notes.delete(c.id); persist(c.id); delArm=null; renderNotes(); schedule(2); }
      else { delArm=nid; b.textContent='Confirmar'; clearTimeout(delTimer); delTimer=setTimeout(()=>{ delArm=null; if(b.isConnected) b.textContent='Eliminar'; },3000); }
    }
  };
}
function renderAj(){
  const host=$('paneAj'); const arr=[...adj.entries()].map(([id,a])=>({c:BYID.get(id),a})).filter(x=>x.c).sort((x,y)=>(y.a.at||'').localeCompare(x.a.at||''));
  $('tabAj').textContent='Ajustes cargados'+(arr.length?' ('+arr.length+')':'');
  if(!arr.length){ host.innerHTML='<div class="note full">Todavía no cargaste ajustes. Elegí un cliente, completá vencimiento o estado financiero en su ficha y guardá: aparecen acá y se aplican a la línea, las tasas y la proyección.</div>'; return; }
  host.innerHTML=`<div class="full"><div class="tw"><table><thead><tr><th>Cliente</th><th>Grupo</th><th>Vencimiento</th><th>Estado financiero</th><th>Deuda</th><th>Próxima cuota</th><th></th></tr></thead><tbody>
  ${arr.map(({c,a})=>`<tr><td>${nmBtn(c)}</td><td>${esc(c.g)}${c.ab?'+B':''}</td><td>${a.v?fmtD(c.o.vD).slice(0,6)+' → '+fmtD(D(a.v)):'–'}</td><td>${a.estado?esc(FINN[a.estado]||a.estado):'–'}</td><td>${a.deuda!=null&&a.deuda!==''?usd(+a.deuda):'–'}</td><td>${a.prox?fmtD(D(a.prox))+(a.monto?' · '+usd(+a.monto):''):'–'}</td><td><button type="button" class="btn" data-rst="${c.id}">Quitar</button></td></tr>`).join('')}
  </tbody></table></div>
  <div class="acts"><button type="button" class="btn pri" id="acsv">Copiar como CSV</button><span class="note" id="acopy"></span></div></div>`;
  host.onclick=e=>{
    const r=e.target.closest('[data-rst]'); if(r){ const id=+r.dataset.rst; adj.delete(id); persistAdj(id); applyAll(); fullRender(); return; }
    const b=e.target.closest('[data-cid]'); if(b){ select(+b.dataset.cid,true,true); return; }
    if(e.target.id==='acsv'){
      const rows=[['cliente','programa','grupo','vencimiento_ficha','vencimiento_ajustado','estado_financiero','deuda_usd','proxima_cuota','monto_cuota_usd']].concat(arr.map(({c,a})=>[c.n,c.p,c.g,iso(c.o.vD),a.v||'',a.estado||'',a.deuda??'',a.prox||'',a.monto??'']));
      const csv=rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\n');
      const done=ok=>{ const n=$('acopy'); if(n) n.textContent=ok?'CSV copiado.':'No se pudo copiar.'; };
      try{ navigator.clipboard.writeText(csv).then(()=>done(true),()=>done(false)); }catch(err){ done(false); }
    }
  };
}
function bindSearch(){ const q=$('csearch'); q.oninput=fillList; }
function fillList(){
  const q=($('csearch').value||'').toLowerCase(); const host=$('clist'); if(!host) return;
  const arr=CLIENTS.filter(c=>vis(c)&&c.n.toLowerCase().includes(q)).sort((a,b)=>b.aD-a.aD).slice(0,80);
  host.innerHTML=arr.map(c=>`<button type="button" data-cid="${c.id}"><span style="display:flex;gap:6px;align-items:center;min-width:0"><span class="dot" style="width:8px;height:8px;border-radius:50%;background:var(--c-${c.p});flex:none"></span><span style="overflow:hidden;text-overflow:ellipsis">${esc(c.n)}</span>${notes.has(c.id)?'<span style="color:var(--accent)">●</span>':''}</span><span class="d">${esc(c.g)} · ${fmtD(c.aD).slice(0,6)} ${String(dt(c.aD).getUTCFullYear()).slice(2)}</span></button>`).join('') || '<div class="note" style="padding:8px">Sin resultados</div>';
  host.onclick=e=>{ const b=e.target.closest('[data-cid]'); if(b) select(+b.dataset.cid,true,true); };
}

/* ---------- arranque ---------- */
function start(){
  const w=W(); fit(DATA.win0,DATA.hoy);
  lsLoad(); lsLoadA(); applyAll();
  fullRender();
  setTab('res');
  (async()=>{
    try{
      const c=window.claude; if(!c||!c.use) return;
      dbNs = await c.use('db');
      if(!dbNs){ return; }
      notes.clear(); // las notas compartidas reemplazan las locales
      dbNs.collection('ajustes').onSnapshot(snap=>{ adj.clear(); snap.docs.forEach(d=>{ const dd=d.data(); if(dd && Object.keys(dd).length) adj.set(+d.id.slice(1),dd); }); applyAll(); fullRender(); }, e=>{});
      dbNs.collection('notes').onSnapshot(snap=>{
        notes.clear();
        snap.docs.forEach(d=>{ const dd=d.data(); const id=+d.id.slice(1); if(dd && Array.isArray(dd.items) && dd.items.length) notes.set(id,dd.items); });
        dbReady=true; schedule(2); if(S.tab==='cli' && S.sel!=null){ renderNotes(); const ns=$('nsave'); if(ns && ns.textContent.startsWith('Las notas se guardan solo')) ns.textContent='Las notas se comparten con quien abra esta página.'; } if(S.tab==='cli') fillList();
      }, e=>{ dbNs=null; lsLoad(); });
    }catch(e){ dbNs=null; }
  })();
}
requestAnimationFrame(start);
})();
