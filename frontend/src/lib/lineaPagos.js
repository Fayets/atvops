/**
 * Línea de pagos (la de Mauri): fechas, grupos, ajustes y cuentas del resumen, sin nada de
 * pantalla. Es la lógica de su maqueta portada tal cual: si un número cambia acá, cambia
 * lo que Mauri ya validó con dirección.
 *
 * Las fechas se manejan como días enteros desde 1970 en UTC, así la zona horaria de quien
 * mira no corre un vencimiento de día.
 */

/* ---------------------------------------------------------------- fechas y formatos */

export const D = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5);
export const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const dt = (d) => new Date(d * 864e5);
export const iso = (d) => dt(d).toISOString().slice(0, 10);
export const fmtD = (d) => {
  const x = dt(d);
  return `${String(x.getUTCDate()).padStart(2, '0')} ${MES[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
};
/** "05 jun": para listas donde el año sobra. */
export const fmtCorta = (d) => fmtD(d).slice(0, 6);
export const usd = (n) => `US$ ${Math.round(n).toLocaleString('es-AR')}`;
export const usdK = (n) => (n >= 1000 ? `US$ ${(n / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} mil` : usd(n));
export const pct = (x) => (x == null ? '–' : `${(x * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const diaDeMes = (y, m, dia = 1) => Math.round(Date.UTC(y, m, dia) / 864e5);

/* ---------------------------------------------------------------- catálogos */

export const PLANES = ['boost', 'mentoria', 'entry', 'mid', 'advantage'];
export const PNAME = { boost: 'Boost', mentoria: 'Mentoría', entry: 'Entry', mid: 'Mid', advantage: 'Advantage' };

// Los colores son variables de la pantalla (app.css, .lp): acá solo se nombran.
export const GRUPOS = [
  { k: 'A', corto: 'A · Discord', titulo: 'A · Discord activo', desc: 'Activos hoy en Discord', color: 'var(--lp-a)' },
  { k: 'B', corto: 'B · Vencidos', titulo: 'B · Vencidos', desc: 'Estado activo, vencimiento cumplido y fuera de Discord', color: 'var(--lp-b)' },
  { k: 'C', corto: 'C · Salieron', titulo: 'C · Salieron por vencimiento', desc: 'Entraron y salieron por vencimiento de programa', color: 'var(--lp-c)' },
  { k: 'S', corto: 'Señas', titulo: 'Señas', desc: 'Pagos de US$ 50 a 500 sin deuda', color: 'var(--lp-gris)' },
  { k: 'O', corto: 'Sin grupo', titulo: 'Sin grupo', desc: 'Bajas anticipadas y casos fuera de A, B y C', color: 'var(--lp-gris)' },
];
export const GRUPO = Object.fromEntries(GRUPOS.map((g) => [g.k, g]));
export const MARCAS = [
  { k: 'D', corto: 'D · Inconsistencia', desc: 'Ingresante con inconsistencia de fechas o ficha' },
  { k: 'E', corto: 'E · Cuota sin pagar', desc: 'Deuda y más de 30 días sin pago (no hay calendario de cuotas)' },
];
export const CARRILES = [
  { k: 'ing', corto: 'Ingresos', desc: 'Altas de programa y recompras' },
  { k: 'pag', corto: 'Pagos', desc: 'El tamaño del punto sigue el monto' },
  { k: 'ven', corto: 'Vencimientos', desc: 'Fin de programa cumplido y bajas, hasta hoy' },
];
export const ESTADO = {
  vigente: 'Vigente', inactivo: 'Inactivo', vencido: 'Vencido', no_va_a_renovar: 'No va a renovar',
  pausa: 'En pausa', llamada_recompra: 'Llamada de recompra',
};
export const FIN = [
  ['', 'Según la ficha'], ['al_dia', 'Al día'], ['cuota_por_vencer', 'Cuota por vencer'],
  ['cuota_vencida', 'Cuota vencida sin pagar'], ['pagado', 'Programa pagado completo'], ['sin_datos', 'Sin datos financieros'],
];
export const FINN = Object.fromEntries(FIN);
// Con cualquiera de estos estados el cliente cuenta como "activo en la ficha": si además
// ya venció, es B.
const ACTIVO = ['vigente', 'pausa', 'llamada_recompra', 'no_va_a_renovar', 'vencido'];

/* ---------------------------------------------------------------- preparar y ajustar */

/**
 * Pasa las fechas a días y guarda lo que dice la ficha (`o`): los ajustes siempre se
 * aplican sobre la ficha original, nunca uno encima de otro.
 */
/** Cuántos días después de hoy muestra la línea: seis meses (Franco, 30-10-2026). */
export const DIAS_FUTURO = 183;

export function prepararLinea(data) {
  const CUT = D(data.cut);
  const HOY = D(data.hoy);
  const WIN0 = D(data.win0);
  const clientes = data.clients.map((c0) => {
    const c = { ...c0, pg: c0.pg.map(([f, m, tipo]) => ({ f, m, tipo, d: D(f) })) };
    c.aD = D(c.a); c.vD = D(c.v); c.vcD = D(c.vc);
    c.bD = c.b ? D(c.b) : null; c.rcD = c.rc ? D(c.rc) : null; c.veD = c.ve ? D(c.ve) : null;
    c.upD = c.up ? D(c.up) : null; c.fpD = c.fp ? D(c.fp) : null;
    c.inA = c.g === 'A';
    c.anom = c.coh === 'revisar';
    c.o = { vD: c.vD, ad: c.ad, mE: c.mE, g: c.g, ab: c.ab, qm: c.qm, mD: c.mD.slice(), dvd: c.dvd };
    return c;
  });
  // Para adelante: lo que vence o termina en los próximos meses se ve venir, no aparece
  // recién el día que pasa.
  const FIN = HOY + DIAS_FUTURO;
  return { CUT, HOY, FIN, WIN0, D0: WIN0 - 30, clientes, pagos: clientes.reduce((n, c) => n + c.pg.length, 0) };
}

/** El `applyAdj` de la maqueta, sin mutar: devuelve el cliente con el ajuste aplicado. */
export function aplicarAjuste(b, a, { HOY, WIN0 }) {
  const o = b.o;
  const c = { ...b, vD: o.vD, ad: o.ad, mE: o.mE, g: o.g, ab: o.ab, qm: o.qm, mD: o.mD.slice(), dvd: o.dvd, adj: !!a };
  if (a) {
    if (a.v) { c.vD = D(a.v); c.qm = false; }
    if (a.deuda != null && a.deuda !== '') c.ad = +a.deuda;
    // D y E son solo para ingresantes desde el inicio de la ventana (y nunca para señas).
    if (c.aD >= WIN0 && !c.sn) {
      if (a.estado === 'cuota_vencida') c.mE = c.inA ? 1 : 2;
      else if (['al_dia', 'cuota_por_vencer', 'pagado'].includes(a.estado)) c.mE = 0;
    }
    if (a.estado === 'pagado' && (a.deuda == null || a.deuda === '')) c.ad = 0;
  }
  c.endD = c.bD != null && c.bD < c.vD ? c.bD : c.vD;
  c.vence = c.vD <= HOY;
  c.finD = Math.min(c.vD, c.bD == null ? Infinity : c.bD);
  // La maqueta de Mauri deja afuera a Geronimo Robles con nombre y apellido: se respeta.
  if (a && a.v && c.veD != null && c.aD >= WIN0 && !c.sn && c.n !== 'Geronimo Robles') {
    c.dvd = c.vD - c.veD;
    c.mD = c.mD.filter((m) => !m.startsWith('Vencimiento cargado'));
    if (Math.abs(c.dvd) > 5) c.mD.push(`Vencimiento cargado ${c.dvd > 0 ? '+' : ''}${c.dvd} días respecto de la duración del programa`);
  }
  // Los grupos se recalculan con el vencimiento ajustado. A no se mueve: lo decide Discord.
  const act = ACTIVO.includes(c.e);
  if (c.inA) { c.g = 'A'; c.ab = act && c.vD <= HOY; }
  else if (o.g === 'C') { c.g = c.vD > HOY ? 'O' : 'C'; }
  else if (o.g !== 'X') {
    if (act && c.vD <= HOY) c.g = 'B';
    else if (o.g === 'B') c.g = 'O';
  }
  return c;
}

/** `ajustes` es { [clienteId]: ajuste }. */
export const aplicarAjustes = (base, ajustes, ctx) => base.map((b) => aplicarAjuste(b, ajustes[b.id], ctx));

/* ---------------------------------------------------------------- filtros */

/** filtros = { planes, grupos, marcas, carriles }: cuatro Sets. */
// Un rango de fechas en días; sin desde o sin hasta, ese lado queda abierto.
const enRango = (d, r) => !r || ((r.desde == null || d >= r.desde) && (r.hasta == null || d <= r.hasta));
export const visible = (c, f) => c.g !== 'X' && f.planes.has(c.p) && f.grupos.has(c.g)
  && enRango(c.aD, f.inicio) && enRango(c.vD, f.vence);
export const marcaD = (c) => c.mD.length > 0;
export const marcaE = (c) => c.mE > 0;
// Inactivo sin fecha de baja y con vencimiento a futuro: no se sabe cuándo se fue.
const sinBaja = (c, HOY) => c.e === 'inactivo' && !c.bD && c.vD > HOY;

/* ---------------------------------------------------------------- la línea */

function armarEventos(clientes, f, { WIN0, HOY, FIN }) {
  const ing = [];
  const pag = [];
  const ven = [];
  clientes.forEach((c) => {
    if (!visible(c, f)) return;
    if (c.aD >= WIN0 && c.aD <= HOY) ing.push({ c, d: c.aD, tipo: 'alta' });
    if (c.rcD != null && c.rcD >= WIN0 && c.rcD <= HOY) ing.push({ c, d: c.rcD, tipo: 'recompra' });
    c.pg.forEach((p) => { if (p.d >= WIN0 && p.d <= HOY) pag.push({ c, d: p.d, m: p.m, medio: p.tipo, tipo: 'pago' }); });
    if (c.bD != null && c.bD < c.vD) { if (c.bD >= WIN0 && c.bD <= HOY) ven.push({ c, d: c.bD, tipo: 'baja' }); }
    else if (c.vD >= WIN0 && c.vD <= HOY) ven.push({ c, d: c.vD, tipo: 'venc', est: false });
    // Los que vienen: todavía no pasaron, van punteados como estimados.
    else if (c.vD > HOY && c.vD <= FIN && !sinBaja(c, HOY)) ven.push({ c, d: c.vD, tipo: 'venc', est: true });
  });
  return { ing, pag, ven };
}

const radio = (it) => (it.tipo === 'pago' ? Math.max(3, Math.min(11, 2.5 + Math.sqrt(it.m) / 9)) : 6);

/** Las etiquetas de la barra: marcas y estado, abreviadas. */
export const etiquetasBarra = (c) => [
  c.mE ? (c.mE === 1 ? 'E1' : 'E2') : '', c.mD.length ? 'D' : '', c.sn ? 'seña' : '',
  c.e === 'pausa' ? 'pausa' : '', c.ab ? 'A+B' : '',
].filter(Boolean).join(' ');

/**
 * Arriba, una banda por grupo con la barra de vigencia de cada cliente; abajo, los
 * carriles de ingresos, pagos y vencimientos, apilando los puntos que se pisan.
 * `x` en píxeles desde D0 con `pxd` píxeles por día; `y` desde el tope de los carriles.
 * `medir(texto)` da el ancho en píxeles a 11px.
 */
export function armarLayout(clientes, f, pxd, ctx, medir, cerrados = new Set()) {
  const { WIN0, HOY, FIN, D0 } = ctx;
  const ev = armarEventos(clientes, f, ctx);
  const modoEtiqueta = pxd >= 6;
  const rowH = modoEtiqueta ? 22 : 17;
  const carriles = [];
  const items = [];
  let top = 0;
  GRUPOS.forEach((gr) => {
    if (!f.grupos.has(gr.k)) return;
    const todos = clientes.filter((c) => visible(c, f) && c.g === gr.k && c.aD <= HOY);
    const lista = todos
      .filter((c) => c.endD >= WIN0 || sinBaja(c, HOY))
      .sort((a, b) => a.aD - b.aD || a.n.localeCompare(b.n));
    // Un grupo cerrado queda en su título: los clientes siguen contados, no se dibujan.
    const cerrado = cerrados.has(`g${gr.k}`);
    (cerrado ? [] : lista).forEach((c, i) => {
      const unk = sinBaja(c, HOY);
      const x1 = (Math.max(c.aD, WIN0) - D0) * pxd;
      // La barra sigue hasta su fin si cae en lo que se ve del futuro; la de baja sin fecha, hasta hoy.
      const x2 = (Math.min(unk ? HOY : c.endD, FIN) - D0) * pxd;
      const wid = Math.max(x2 - x1, 4);
      const tags = etiquetasBarra(c);
      const ven = modoEtiqueta && c.vD > HOY && !unk ? ` → ${fmtCorta(c.vD)}` : '';
      const texto = c.n + (tags ? `  ${tags}` : '') + ven;
      const fs = modoEtiqueta ? 11.5 : 10.5;
      items.push({
        c, tipo: 'barra', d: Math.max(c.aD, WIN0), x1, x2: x1 + wid, wid, unk,
        y: top + 34 + i * rowH + rowH / 2, texto, fs, dentro: wid > (medir(texto) * fs) / 11 + 24,
      });
    });
    const filas = cerrado ? 0 : lista.length;
    carriles.push({
      key: `g${gr.k}`, titulo: gr.titulo, desc: gr.desc, fuera: todos.length - lista.length,
      top, h: 34 + filas * rowH + (cerrado ? 0 : 10), n: lista.length, col: gr.color, banda: true, cerrado,
    });
    top += 34 + filas * rowH + (cerrado ? 0 : 10) + 8;
  });
  top += 14;
  const paso = modoEtiqueta ? 20 : 16;
  [['ing', ev.ing], ['pag', ev.pag], ['ven', ev.ven]].forEach(([key, lista]) => {
    if (!f.carriles.has(key)) return;
    const def = CARRILES.find((x) => x.k === key);
    if (cerrados.has(key)) {
      carriles.push({ key, titulo: def.corto, desc: def.desc, top, h: 34, n: lista.length, cerrado: true });
      top += 34 + 12;
      return;
    }
    lista.sort((a, b) => a.d - b.d || a.c.id - b.c.id);
    // Cada punto baja de nivel hasta encontrar un hueco donde no pise al anterior.
    const fines = [];
    lista.forEach((it) => {
      it.r = radio(it);
      it.x = (it.d - D0) * pxd;
      let lw = 0;
      if (modoEtiqueta) {
        it.label = it.tipo === 'pago' ? usd(it.m).replace('US$ ', '$') : it.c.n;
        lw = medir(it.label) + 8;
      } else it.label = null;
      const izq = it.x - it.r - 3;
      let l = 0;
      while (l < fines.length && fines[l] > izq) l++;
      fines[l] = it.x + it.r + lw + 4;
      it.lvl = l;
    });
    const niveles = Math.max(1, fines.length);
    const h = 46 + niveles * paso + 12;
    lista.forEach((it) => { it.y = top + 46 + it.lvl * paso + paso / 2; items.push(it); });
    carriles.push({ key, titulo: def.corto, desc: def.desc, top, h, n: lista.length });
    top += h + 12;
  });
  items.forEach((it, i) => { it.k = i; });
  return { carriles, items, total: top, rowH, modoEtiqueta };
}

/** Lo cobrado por mes (y cuántos hicieron su primer pago) de los clientes visibles. */
export function pagosPorMes(clientes, f) {
  const m = new Map();
  const de = (k) => m.get(k) || m.set(k, { usd: 0, primeros: 0 }).get(k);
  clientes.forEach((c) => {
    if (!visible(c, f)) return;
    c.pg.forEach((p) => { de(p.f.slice(0, 7)).usd += p.m; });
    if (c.fp) de(c.fp.slice(0, 7)).primeros++;
  });
  return m;
}

/** Meses y semanas entre `desde` y `hasta` (días), en x de la línea. */
export function armarGrilla(desde, hasta, pxd, D0) {
  const meses = [];
  const x = dt(desde);
  let y = x.getUTCFullYear();
  let m = x.getUTCMonth();
  for (let g = 0; g < 400; g++) {
    const md = diaDeMes(y, m);
    if (md > hasta) break;
    meses.push({ d: md, x: (md - D0) * pxd, mes: MES[m], anio: y, enero: m === 0, clave: `${y}-${String(m + 1).padStart(2, '0')}` });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  const semanas = [];
  if (pxd >= 5) {
    // Día 0 de la época fue jueves: (d + 3) % 7 === 0 cae en lunes.
    for (let d = desde - (((desde + 3) % 7) + 7) % 7; d <= hasta; d += 7) {
      semanas.push({ d, x: (d - D0) * pxd, dia: dt(d).getUTCDate() });
    }
  }
  return { meses, semanas };
}

/* ---------------------------------------------------------------- resumen */

// Los meses de la ventana, del primero hasta el del corte.
function mesesVentana(WIN0, CUT) {
  const a = dt(WIN0);
  const b = dt(CUT);
  const out = [];
  let y = a.getUTCFullYear();
  let m = a.getUTCMonth();
  while (y < b.getUTCFullYear() || (y === b.getUTCFullYear() && m <= b.getUTCMonth())) {
    out.push([y, m]);
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return out;
}

const activosAl = (d, lista) => lista.filter((c) => !c.anom && c.aD < d && c.vD >= d && (c.bD == null || c.bD >= d));

function mesAMes(lista, { WIN0, CUT }) {
  return mesesVentana(WIN0, CUT).map(([y, m]) => {
    const s = diaDeMes(y, m);
    const eFull = diaDeMes(y, m + 1, 0);
    const e = Math.min(eFull, CUT);
    const ya = activosAl(s, lista).length;
    const altas = lista.filter((c) => !c.anom && c.aD >= s && c.aD <= e).length;
    const sal = lista.filter((c) => !c.anom && c.finD >= s && c.finD <= e && c.aD <= e).length;
    const cierre = activosAl(e + 1, lista).length;
    const fpay = lista.filter((c) => c.fpD != null && c.fpD >= s && c.fpD <= e).length;
    const pagadores = new Set();
    let u = 0;
    lista.forEach((c) => c.pg.forEach((p) => { if (p.d >= s && p.d <= e) { pagadores.add(c.id); u += p.m; } }));
    return {
      mes: `${MES[m]} ${y}`, ya, altas, sal, cierre, fpay, pagadores: pagadores.size, u,
      parcial: eFull > CUT, tIng: ya ? altas / ya : null, tEgr: ya ? sal / ya : null,
    };
  });
}

function proyeccion(lista, meses, { HOY }) {
  // Las altas de referencia salen de los meses completos, sin el primero de la ventana
  // (mayo arrastra la carga inicial de la base).
  const completos = meses.slice(1).filter((r) => !r.parcial);
  const h = completos.length ? mean(completos.map((r) => r.altas)) : 0;
  const P = lista.filter((c) => c.e !== 'inactivo' && c.g !== 'X' && c.aD <= HOY && c.vD > HOY);
  const out = [];
  let stock = P.length;
  const x = dt(HOY);
  let y = x.getUTCFullYear();
  let m = x.getUTCMonth();
  for (let i = 0; i < 7; i++) {
    const primero = i === 0;
    const s0 = primero ? HOY + 1 : diaDeMes(y, m);
    const e0 = diaDeMes(y, m + 1, 0);
    const sal = P.filter((c) => c.vD >= s0 && c.vD <= e0);
    const o = {
      mes: `${MES[m]} ${y}${primero ? ' (resto)' : ''}`, ini: stock, sal: sal.length,
      men: sal.filter((c) => c.p === 'mentoria').length, bo: sal.filter((c) => c.p === 'boost').length,
      otros: sal.filter((c) => c.p !== 'mentoria' && c.p !== 'boost').length,
      tEgr: stock ? sal.length / stock : null, ing: primero ? h * ((e0 - HOY) / 30) : h,
    };
    o.tIng = stock ? o.ing / stock : null;
    o.cierre = stock - o.sal + o.ing;
    stock = o.cierre;
    out.push(o);
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return { rows: out, h };
}

/** Permanencia por programa: va sobre toda la cartera, no sobre el filtro. */
export function permanencia(clientes) {
  return PLANES.map((p) => {
    const g = clientes.filter((c) => c.p === p && c.coh !== 'revisar');
    const comp = g.filter((c) => c.cat === 'completo');
    const cur = g.filter((c) => c.cat === 'en_curso');
    return {
      p, n: g.length, cur: cur.length, comp: comp.length,
      bajaF: g.filter((c) => c.cat === 'baja_anticipada_fecha').length,
      bajaS: g.filter((c) => c.cat === 'baja_anticipada_sin_fecha').length,
      abierto: g.filter((c) => c.cat === 'vigente_venc_pasado').length,
      dur: median(g.map((c) => c.d)), permC: median(comp.map((c) => c.perm)), permCur: mean(cur.map((c) => c.perm)),
      avance: mean(cur.map((c) => Math.min(1, c.perm / (c.vD - c.aD)))),
      cobrado: g.reduce((a, c) => a + c.tp, 0), deuda: g.reduce((a, c) => a + c.ad, 0),
      pagadores: g.filter((c) => c.fpD != null).length,
    };
  });
}

/** Todo lo de la pestaña Resumen. Filtra solo por programa: los grupos se cuentan todos. */
export function armarResumen(clientes, planes, ctx) {
  const { HOY } = ctx;
  const lista = clientes.filter((c) => planes.has(c.p) && c.g !== 'X');
  const gl = (k) => lista.filter((c) => c.g === k);
  const grupos = Object.fromEntries(GRUPOS.map((g) => [g.k, gl(g.k)]));
  const meses = mesAMes(lista, ctx);
  const proxMent = (a, b) => lista
    .filter((c) => c.p === 'mentoria' && c.e !== 'inactivo' && c.vD > HOY + a && c.vD <= HOY + b)
    .sort((x, y) => x.vD - y.vD);
  return {
    lista,
    grupos,
    B: lista.filter((c) => c.g === 'B' || c.ab),
    AB: lista.filter((c) => c.ab),
    D: lista.filter((c) => c.mD.length),
    E1: lista.filter((c) => c.mE === 1),
    E2: lista.filter((c) => c.mE === 2),
    porPrograma: GRUPOS.map((g) => ({ k: g.k, n: grupos[g.k].length, ...Object.fromEntries(PLANES.map((p) => [p, grupos[g.k].filter((c) => c.p === p).length])) })),
    mentorias: {
      m30: proxMent(0, 30), m60: proxMent(30, 60), m90: proxMent(60, 90),
      vencidas: lista.filter((c) => c.p === 'mentoria' && c.e !== 'inactivo' && c.vD <= HOY),
    },
    meses,
    proyeccion: proyeccion(lista, meses, ctx),
    programas: permanencia(clientes),
    anomalos: clientes.filter((c) => c.anom),
  };
}

/** Los ajustes cargados a mano con su cliente, los más nuevos arriba. */
export function filasAjustes(clientes, ajustes) {
  const porId = new Map(clientes.map((c) => [c.id, c]));
  return Object.entries(ajustes)
    .map(([id, a]) => ({ c: porId.get(+id), a }))
    .filter((x) => x.c)
    .sort((x, y) => (y.a.at || '').localeCompare(x.a.at || ''));
}

/** La tabla de ajustes en CSV, con lo de la ficha al lado de lo ajustado. */
export function csvAjustes(filas) {
  const rows = [['cliente', 'programa', 'grupo', 'vencimiento_ficha', 'vencimiento_ajustado', 'estado_financiero', 'deuda_usd', 'proxima_cuota', 'monto_cuota_usd']]
    .concat(filas.map(({ c, a }) => [c.n, c.p, c.g, iso(c.o.vD), a.v || '', a.estado || '', a.deuda ?? '', a.prox || '', a.monto ?? '']));
  return rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
}
