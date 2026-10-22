import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  armarGrilla, armarLayout, dt, fmtD, pagosPorMes, usdK,
} from '../../../lib/lineaPagos.js';
import TipLinea from './TipLinea.jsx';

/**
 * La línea de tiempo: arriba una banda por grupo con la vigencia de cada cliente, abajo los
 * carriles de ingresos, pagos y vencimientos.
 *
 * Mover y hacer zoom no pasa por React. La vista (píxeles por día, día del borde izquierdo
 * y desplazamiento vertical) vive en un ref, y cada capa es un div que se corre con un
 * transform: el navegador lo resuelve en la placa sin volver a dibujar nada. React vuelve a
 * dibujar solo cuando cambia el zoom (las barras se re-ubican), como mucho una vez por
 * cuadro.
 */

const EJE = 50;          // alto de la cabecera con los meses
const PXD_MAX = 60;
const PXD_MIN = 0.25;

// Medir texto con un canvas: hace falta para saber si el nombre entra dentro de la barra y
// para apilar las etiquetas de los puntos sin que se pisen.
let lienzo = null;
const anchos = new Map();
function medir(s) {
  let w = anchos.get(s);
  if (w == null) {
    if (!lienzo) {
      lienzo = document.createElement('canvas').getContext('2d');
      lienzo.font = '11px "Instrument Sans", -apple-system, sans-serif';
    }
    w = lienzo.measureText(s).width;
    anchos.set(s, w);
  }
  return w;
}

const COLOR_GRUPO = { A: 'a', B: 'b', C: 'c', S: 'gris', O: 'gris' };
const ORDEN = ['barra', 'pago', 'alta', 'recompra', 'venc', 'baja'];

/* ------------------------------------------------------------------ capas */

function Barra({ it, rowH, ctx, sel, nota, verD, verE }) {
  const { c, x1, x2, wid, unk } = it;
  const h = rowH - 5;
  const g = COLOR_GRUPO[c.g] || 'gris';
  const linea = `var(--lp-${g})`;
  const caja = { x: x1, y: -h / 2, width: wid, height: h, rx: 3 };
  const tx = x1 + (c.aD >= ctx.WIN0 ? 10 : 18);
  return (
    <g data-k={it.k} transform={`translate(0 ${it.y})`} className="lp-item">
      <rect x={x1 - 3} y={-rowH / 2} width={wid + 6} height={rowH} fill="transparent" />
      <rect {...caja} fill={c.ab ? 'url(#lp-ab)' : `var(--lp-${g}-f)`} stroke={linea} strokeOpacity="0.5"
        {...(unk ? { fillOpacity: 0.35, strokeDasharray: '4 3', strokeOpacity: 1 } : {})} />
      {c.g === 'O' && !unk && <rect {...caja} fill="url(#lp-otro)" />}
      {c.e === 'pausa' && <rect {...caja} fill="url(#lp-pausa)" />}
      {verD && <rect x={x1 - 1} y={-h / 2 - 1} width={wid + 2} height={h + 2} rx="4" fill="none" stroke="var(--lp-marca)" strokeWidth="2.2" />}
      {verE && <rect x={x1 - 3} y={-h / 2 - 3} width={wid + 6} height={h + 6} rx="5" fill="none" stroke="var(--lp-marca)" strokeWidth="2" strokeDasharray="5 3" />}
      {sel && <rect x={x1 - 5} y={-h / 2 - 5} width={wid + 10} height={h + 10} rx="6" fill="none" stroke="var(--text)" strokeWidth="2" />}
      {/* Inicio: punto del color del programa si entró en la ventana; flecha si viene de antes. */}
      {c.aD >= ctx.WIN0 ? (
        <circle cx={x1 + 1} cy="0" r="4.2" fill={`var(--lp-${c.p})`} stroke="var(--surface)" strokeWidth="1.4" />
      ) : (
        <>
          <path d={`M${x1 + 7} ${-h / 2 + 2} L${x1 + 2} 0 L${x1 + 7} ${h / 2 - 2}`} fill="none" stroke={linea} strokeWidth="1.8" />
          <circle cx={x1 + 12} cy="0" r="3.2" fill={`var(--lp-${c.p})`} stroke="var(--surface)" strokeWidth="1.2" />
        </>
      )}
      {/* Fin: flecha si sigue vigente; tope si ya venció. */}
      {!unk && (c.vD > ctx.HOY
        ? <path d={`M${x2 - 6} ${-h / 2 + 2} L${x2 - 1} 0 L${x2 - 6} ${h / 2 - 2}`} fill="none" stroke={linea} strokeWidth="1.8" />
        : <rect x={x2 - 3} y={-h / 2} width="3" height={h} fill="var(--text)" opacity="0.55" />)}
      {c.qm && <text x={x2 + 5} y="4" fontSize="12" fontWeight="700" fill="var(--warn)">?</text>}
      <text x={it.dentro ? tx : x2 + (c.qm ? 16 : 8)} y={it.fs / 2 - 1} fontSize={it.fs} fontWeight={it.dentro ? 600 : 500} fill="var(--text)">
        {it.texto}
      </text>
      {nota && <circle cx={x2} cy={-h / 2} r="3.8" fill="var(--lp-nota)" stroke="var(--surface)" strokeWidth="1.2" />}
    </g>
  );
}

function Punto({ it, sel, nota }) {
  const { c, r } = it;
  const col = `var(--lp-${c.p})`;
  let forma;
  if (it.tipo === 'alta') {
    if (c.anom) {
      forma = (
        <>
          <circle r={r} fill="var(--surface)" stroke="var(--warn)" strokeWidth="2" strokeDasharray="3 2" />
          <text y="3.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--warn)">!</text>
        </>
      );
    } else if (c.coh === 'nuevo') forma = <circle r={r} fill={col} />;
    else forma = <circle r={r - 1} fill="var(--surface)" stroke={col} strokeWidth="2.4" />;
  } else if (it.tipo === 'pago') {
    forma = <circle r={r} fill={col} fillOpacity="0.78" stroke="var(--surface)" strokeWidth="1" />;
  } else if (it.tipo === 'venc') {
    const aviso = c.flags.some((f) => f.startsWith('Inactivo con venc') || f.startsWith('Vigente/recompra'));
    forma = it.est
      ? <rect x={-r} y={-r} width={2 * r} height={2 * r} rx="1.5" fill={col} fillOpacity="0.14" stroke={aviso ? 'var(--warn)' : col} strokeWidth="1.8" strokeDasharray="3 2.5" />
      : <rect x={-r} y={-r} width={2 * r} height={2 * r} rx="1.5" fill={col} {...(aviso ? { stroke: 'var(--warn)', strokeWidth: 2 } : {})} />;
  } else {
    // Baja (rombo lleno) o recompra (rombo hueco).
    const rr = r + 1.5;
    forma = (
      <path d={`M0 -${rr} ${rr} 0 0 ${rr} -${rr} 0Z`} fill={it.tipo === 'baja' ? col : 'var(--surface)'}
        stroke={it.tipo === 'baja' ? 'var(--lp-marca)' : col} strokeWidth="2" />
    );
  }
  return (
    <g data-k={it.k} transform={`translate(${it.x} ${it.y})`} className="lp-item">
      <circle r={r + 5} fill="transparent" />
      {sel && <circle r={r + 4} fill="none" stroke="var(--text)" strokeWidth="2" />}
      {forma}
      {nota && <circle cx={r} cy={-r} r="3.6" fill="var(--lp-nota)" stroke="var(--surface)" strokeWidth="1.2" />}
      {it.label && <text x={r + 5} y="3.8" fontSize="11" fill="var(--text)">{it.label}</text>}
    </g>
  );
}

const CapaMundo = memo(function CapaMundo({ layout, ancho, ctx, sel, conNotas, marcas, pagosMes, meses }) {
  const ordenados = useMemo(
    () => [...layout.items].sort((a, b) => ORDEN.indexOf(a.tipo) - ORDEN.indexOf(b.tipo)),
    [layout],
  );
  // El recorrido del cliente elegido: une sus puntos en orden.
  const trazo = sel == null ? [] : layout.items.filter((i) => i.c.id === sel && i.tipo !== 'barra').sort((a, b) => a.d - b.d);
  const carrilPagos = layout.carriles.find((l) => l.key === 'pag');
  const verD = marcas.has('D');
  const verE = marcas.has('E');
  return (
    <svg width={ancho} height={layout.total + 20}>
      <defs>
        <pattern id="lp-ab" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="8" fill="var(--lp-a-f2)" /><rect x="4" width="4" height="8" fill="var(--lp-b-f2)" />
        </pattern>
        <pattern id="lp-pausa" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width="2" height="6" fill="var(--text)" opacity="0.14" />
        </pattern>
        <pattern id="lp-otro" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3" height="6" fill="var(--lp-gris)" opacity="0.3" />
        </pattern>
      </defs>
      {pagosMes && carrilPagos && meses.map((m) => {
        const o = pagosMes.get(m.clave);
        if (!o) return null;
        return (
          <text key={m.clave} x={m.x + 6} y={carrilPagos.top + 38} fontSize="11" fill="var(--text-2)" className="num">
            {usdK(o.usd)}{o.primeros ? ` · ${o.primeros} 1.º pago` : ''}
          </text>
        );
      })}
      {trazo.length > 1 && (
        <path d={`M${trazo.map((p) => `${p.x} ${p.y}`).join(' L')}`} fill="none" stroke="var(--text)" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.6" />
      )}
      {ordenados.map((it) => (it.tipo === 'barra'
        ? <Barra key={it.k} it={it} rowH={layout.rowH} ctx={ctx} sel={sel === it.c.id} nota={conNotas.has(it.c.id)}
          verD={verD && it.c.mD.length > 0} verE={verE && it.c.mE > 0} />
        : <Punto key={it.k} it={it} sel={sel === it.c.id} nota={conNotas.has(it.c.id)} />))}
    </svg>
  );
});

/** Meses y semanas como líneas finas, y lo que queda fuera de la ventana en gris. */
const CapaGrilla = memo(function CapaGrilla({ grilla, ancho, alto, ctx, pxd }) {
  const xr = (ctx.WIN0 - ctx.D0) * pxd;
  const xc = (ctx.HOY - ctx.D0) * pxd;
  return (
    <svg width={ancho} height={alto}>
      <rect x={-4000} y={EJE} width={xr + 4000} height={alto} fill="var(--lp-fuera)" />
      <rect x={xc} y={EJE} width={ancho - xc + 4000} height={alto} fill="var(--lp-fuera)" />
      {grilla.meses.map((m) => (
        <line key={m.d} x1={m.x} x2={m.x} y1={EJE} y2={alto} stroke="var(--border-soft)" strokeWidth={m.enero ? 1.5 : 1} />
      ))}
      {grilla.semanas.map((s) => (
        <line key={s.d} x1={s.x} x2={s.x} y1={EJE} y2={alto} stroke="var(--border-soft)" strokeWidth="0.6" opacity="0.7" />
      ))}
    </svg>
  );
});

/** Inicio de la ventana, corte de datos y hoy: encima de las barras. */
const CapaReferencias = memo(function CapaReferencias({ ancho, alto, ctx, pxd }) {
  const x = (d) => (d - ctx.D0) * pxd;
  // Las etiquetas van abajo: arriba las tapaba el nombre del primer carril.
  const etiqueta = (xx, t, col, alFinal) => {
    const w = medir(t) + 12;
    const rx = alFinal ? xx - w - 2 : xx + 2;
    return (
      <g>
        <rect x={rx} y={alto - 26} width={w} height="18" rx="4" fill="var(--surface)" stroke={col} />
        <text x={rx + 6} y={alto - 13} fontSize="11" fill={col}>{t}</text>
      </g>
    );
  };
  return (
    <svg width={ancho} height={alto}>
      <line x1={x(ctx.WIN0)} x2={x(ctx.WIN0)} y1={EJE} y2={alto} stroke="var(--text-3)" strokeWidth="1.2" strokeDasharray="5 4" />
      <line x1={x(ctx.CUT)} x2={x(ctx.CUT)} y1={EJE} y2={alto} stroke="var(--text-3)" strokeWidth="0.8" strokeDasharray="2 3">
        <title>Corte de datos · {fmtD(ctx.CUT)}</title>
      </line>
      <line x1={x(ctx.HOY)} x2={x(ctx.HOY)} y1={EJE} y2={alto} stroke="var(--text)" strokeWidth="1.6" />
      {etiqueta(x(ctx.WIN0), `Inicio de ventana · ${fmtD(ctx.WIN0)}`, 'var(--text-3)', false)}
      {etiqueta(x(ctx.HOY), `Hoy · ${fmtD(ctx.HOY)}`, 'var(--text)', true)}
    </svg>
  );
});

const CapaEje = memo(function CapaEje({ grilla, ancho, pxd }) {
  const mesPx = pxd * 30.4;
  return (
    <svg width={ancho} height={EJE}>
      {grilla.meses.map((m) => (
        <g key={m.d}>
          <line x1={m.x} x2={m.x} y1={m.enero ? 0 : EJE - 18} y2={EJE} stroke="var(--border)" strokeWidth={m.enero ? 1.5 : 1} />
          {mesPx >= 40 && <text x={m.x + 5} y={EJE - 8} fontSize="11.5" fill="var(--text-3)">{m.mes}</text>}
          {m.enero && <text x={m.x + 5} y="15" fontSize="12" fontWeight="600" fill="var(--text)" className="num">{m.anio}</text>}
        </g>
      ))}
      {pxd >= 9 && grilla.semanas.map((s) => (
        <text key={s.d} x={s.x + 3} y={EJE - 22} fontSize="10" fill="var(--text-3)" className="num">{s.dia}</text>
      ))}
    </svg>
  );
});

/** Fondo de cada carril, con la franja del color del grupo a la izquierda. */
const CapaBandas = memo(function CapaBandas({ layout }) {
  return (
    <svg width="100%" height={layout.total + 20} style={{ width: '100%' }}>
      {layout.carriles.map((l) => (
        <g key={l.key}>
          <rect x="0" y={l.top} width="100%" height={l.h} fill="var(--lp-carril)" />
          {l.col && <rect x="0" y={l.top} width="4" height={l.h} fill={l.col} />}
        </g>
      ))}
    </svg>
  );
});

/** El nombre de cada carril, fijo a la izquierda mientras la línea se mueve. */
const CapaTitulos = memo(function CapaTitulos({ layout }) {
  return (
    <svg width="100%" height={layout.total + 20} style={{ width: '100%' }}>
      {layout.carriles.map((l) => {
        const extra = l.fuera ? ` · ${l.fuera} antes` : '';
        const w = medir(l.titulo) * 1.18 + medir(`${l.n}${extra}`) + 30;
        return (
          <g key={l.key} className="lp-titulo">
            <title>{l.desc}{l.fuera ? ` · ${l.fuera} salieron antes de la ventana` : ''}</title>
            <rect x="8" y={l.top + 4} width={w} height="24" rx="6" fill="var(--surface)" opacity="0.95"
              stroke={l.col || 'var(--border-soft)'} strokeWidth={l.col ? 1.4 : 1} />
            <text x="16" y={l.top + 20} fontSize="13" fontWeight="600" fill="var(--text)">
              {l.titulo} <tspan fill="var(--text-3)" fontWeight="400" fontSize="11" className="num">{l.n}{extra}</tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
});

/* ------------------------------------------------------------------ la línea */

/**
 * @param {{ linea: object, clientes: object[], filtros: object, sel: number|null,
 *           conNotas: Set<number>, notas: object, foco: {id:number}|null,
 *           irAFicha: (() => void)|null, onElegir: (id:number) => void }} props
 */
export default function LineaTiempo({ linea, clientes, filtros, sel, conNotas, notas, foco, irAFicha, onElegir }) {
  const escenario = useRef(null);
  const capas = { mundo: useRef(null), grilla: useRef(null), refs: useRef(null), eje: useRef(null), bandas: useRef(null), titulos: useRef(null) };
  const anio = useRef(null);
  const tip = useRef(null);
  const vista = useRef({ pxd: 4, x0: linea.WIN0, ty: 0 });
  const pxdPintado = useRef(null);
  const raf = useRef(0);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  const [pxd, setPxd] = useState(null);

  const ctx = linea;
  const layout = useMemo(
    () => (pxd ? armarLayout(clientes, filtros, pxd, ctx, medir) : null),
    [clientes, filtros, pxd, ctx],
  );
  const grilla = useMemo(() => (pxd ? armarGrilla(ctx.D0 - 30, ctx.HOY + 60, pxd, ctx.D0) : null), [pxd, ctx]);
  // Lo cobrado por mes solo entra cuando el mes es lo bastante ancho para leerlo.
  const conPagosMes = pxd && pxd * 30.4 >= 110 && filtros.carriles.has('pag');
  const pagosMes = useMemo(() => (conPagosMes ? pagosPorMes(clientes, filtros) : null), [conPagosMes, clientes, filtros]);

  // Los manejadores de eventos se registran una vez: leen lo último de acá.
  const vivo = useRef({});
  vivo.current = { ctx, layout, tam, onElegir };

  const limitar = () => {
    const v = vista.current;
    const { ctx: { WIN0, HOY }, layout: lay, tam: { w, h } } = vivo.current;
    const minP = Math.max(0.5, (w - 40) / (HOY - WIN0));
    v.pxd = Math.max(minP, Math.min(PXD_MAX, v.pxd));
    const xlo = WIN0 - 20 / v.pxd;
    const xhi = HOY + 20 / v.pxd - w / v.pxd;
    v.x0 = xhi < xlo ? (xlo + xhi) / 2 : Math.max(xlo, Math.min(xhi, v.x0));
    if (lay) v.ty = Math.max(-(lay.total + 40) + (h - EJE) * 0.5, Math.min(30, v.ty));
  };

  // Corre las capas según la vista. Es lo único que pasa en cada cuadro de un arrastre.
  const pintar = () => {
    const p = pxdPintado.current;
    if (!p) return;
    const v = vista.current;
    const tx = -(v.x0 - vivo.current.ctx.D0) * p;
    const ly = EJE + 8 + v.ty;
    const mover = (r, x, y) => { if (r.current) r.current.style.transform = `translate3d(${x}px, ${y}px, 0)`; };
    mover(capas.grilla, tx, 0); mover(capas.refs, tx, 0); mover(capas.eje, tx, 0);
    mover(capas.bandas, 0, ly); mover(capas.titulos, 0, ly);
    mover(capas.mundo, tx, ly);
    if (anio.current) {
      const y = String(dt(Math.floor(v.x0)).getUTCFullYear());
      if (anio.current.textContent !== y) anio.current.textContent = y;
    }
  };

  // Una vez por cuadro: si cambió el zoom, React re-ubica las barras; si no, solo se corre.
  const programar = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      if (vista.current.pxd !== pxdPintado.current) setPxd(vista.current.pxd);
      else pintar();
    });
  };

  const zoomEn = (mx, f) => {
    const v = vista.current;
    const dia = v.x0 + mx / v.pxd;
    v.pxd = Math.max(PXD_MIN, Math.min(PXD_MAX, v.pxd * f));
    v.x0 = dia - mx / v.pxd;
    limitar();
    programar();
  };
  const encuadrar = (a, b) => {
    const v = vista.current;
    v.pxd = Math.max(PXD_MIN, Math.min(PXD_MAX, (vivo.current.tam.w - 40) / (b - a)));
    v.x0 = a - 20 / v.pxd;
    v.ty = 0;
    limitar();
    programar();
  };
  const verHoy = () => {
    const v = vista.current;
    v.pxd = Math.max(v.pxd, 8);
    v.x0 = ctx.HOY - (tam.w * 0.75) / v.pxd;
    limitar();
    programar();
  };

  useLayoutEffect(() => {
    pxdPintado.current = pxd;
    pintar();
  });

  // Tamaño del escenario: la primera medida encuadra la ventana entera.
  useLayoutEffect(() => {
    const el = escenario.current;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      const h = Math.round(e.contentRect.height);
      setTam((t) => (t.w === w && t.h === h ? t : { w, h }));
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf.current); };
  }, []);
  const encuadrada = useRef(false);
  useEffect(() => {
    if (!tam.w) return;
    if (!encuadrada.current) { encuadrada.current = true; encuadrar(ctx.WIN0, ctx.HOY); return; }
    limitar();
    programar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tam]);

  // Elegir un cliente desde una lista lleva la línea hasta su barra.
  useEffect(() => {
    if (!foco) return;
    const c = clientes.find((x) => x.id === foco.id);
    if (!c) return;
    const v = vista.current;
    v.pxd = Math.max(v.pxd, 3);
    v.x0 = Math.max(c.aD, ctx.WIN0) - (tam.w * 0.3) / v.pxd;
    const barra = layout?.items.find((i) => i.tipo === 'barra' && i.c.id === c.id);
    if (barra) v.ty = -barra.y + (tam.h - EJE) * 0.3;
    limitar();
    programar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco]);

  // La rueda sola baja la página, como en el resto de Ops: en la maqueta hacía zoom y al
  // bajar por el resumen quedaba uno enganchado en la línea. Zoom con pellizco (el trackpad
  // lo manda como ctrl + rueda) o Ctrl/⌘ + rueda; el deslizamiento de costado corre el tiempo.
  // No es pasiva porque esos dos casos sí frenan el scroll.
  useEffect(() => {
    const el = escenario.current;
    const rueda = (e) => {
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomEn(e.clientX - r.left, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)));
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        vista.current.x0 += (e.deltaX || e.deltaY) / vista.current.pxd;
        limitar();
        programar();
      }
    };
    el.addEventListener('wheel', rueda, { passive: false });
    return () => el.removeEventListener('wheel', rueda);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- arrastre, pellizco, clic y hover */
  const punteros = useRef(new Map());
  const gesto = useRef({ pinza: null, movido: 0, objetivo: null });
  const itemDe = (el) => {
    const t = el?.closest?.('[data-k]');
    return t ? vivo.current.layout?.items[+t.dataset.k] : null;
  };

  const alBajar = (e) => {
    if (e.button > 0 || e.target.closest('button')) return;
    escenario.current.setPointerCapture(e.pointerId);
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesto.current.movido = 0;
    gesto.current.objetivo = e.target;
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      gesto.current.pinza = Math.hypot(a.x - b.x, a.y - b.y);
    }
    escenario.current.classList.add('arrastrando');
    tip.current?.ocultar();
  };
  const alMover = (e) => {
    const p = punteros.current.get(e.pointerId);
    if (!p) {
      if (e.pointerType !== 'mouse') return;
      const it = itemDe(e.target);
      if (it) tip.current?.mostrar(it, e, escenario.current.getBoundingClientRect());
      else tip.current?.ocultar();
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    gesto.current.movido += Math.abs(dx) + Math.abs(dy);
    if (punteros.current.size === 2 && gesto.current.pinza) {
      const [a, b] = [...punteros.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = escenario.current.getBoundingClientRect();
      zoomEn((a.x + b.x) / 2 - r.left, d / gesto.current.pinza);
      gesto.current.pinza = d;
      return;
    }
    vista.current.x0 -= dx / vista.current.pxd;
    vista.current.ty += dy;
    limitar();
    programar();
  };
  const alSoltar = (e) => {
    if (!punteros.current.delete(e.pointerId)) return;
    if (punteros.current.size < 2) gesto.current.pinza = null;
    if (!punteros.current.size) escenario.current.classList.remove('arrastrando');
    if (e.type !== 'pointerup' || gesto.current.movido >= 6) return;
    // Un clic sin arrastre: sobre una barra o un punto abre la ficha; en el vacío, cierra el cartel.
    const it = itemDe(gesto.current.objetivo);
    if (it) {
      vivo.current.onElegir(it.c.id);
      tip.current?.mostrar(it, e, escenario.current.getBoundingClientRect());
    } else tip.current?.ocultar();
  };
  const alTeclear = (e) => {
    const v = vista.current;
    const k = e.key;
    if (k === '+' || k === '=') zoomEn(tam.w / 2, 1.3);
    else if (k === '-') zoomEn(tam.w / 2, 1 / 1.3);
    else if (k === 'ArrowLeft') { v.x0 -= 60 / v.pxd; limitar(); programar(); }
    else if (k === 'ArrowRight') { v.x0 += 60 / v.pxd; limitar(); programar(); }
    else if (k === 'ArrowUp') { v.ty += 60; limitar(); programar(); }
    else if (k === 'ArrowDown') { v.ty -= 60; limitar(); programar(); }
    else return;
    e.preventDefault();
  };

  const ancho = pxd ? (ctx.HOY + 60 - ctx.D0) * pxd : 0;
  const elegido = sel != null ? clientes.find((c) => c.id === sel) : null;
  return (
    <div
      className="lp-escenario"
      ref={escenario}
      tabIndex={0}
      aria-label="Línea de pagos: arrastrá para mover, pellizco o Ctrl + rueda para el zoom, clic en una barra o punto para la ficha"
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse' && !punteros.current.size) tip.current?.ocultar(); }}
      onKeyDown={alTeclear}
    >
      {layout && (
        <>
          <div className="lp-capa" ref={capas.bandas} style={{ right: 0 }}><CapaBandas layout={layout} /></div>
          <div className="lp-capa" ref={capas.grilla}><CapaGrilla grilla={grilla} ancho={ancho} alto={tam.h} ctx={ctx} pxd={pxd} /></div>
          <div className="lp-capa" ref={capas.mundo}>
            <CapaMundo layout={layout} ancho={ancho} ctx={ctx} sel={sel} conNotas={conNotas} marcas={filtros.marcas}
              pagosMes={pagosMes} meses={grilla.meses} />
          </div>
          <div className="lp-capa sin-puntero" ref={capas.refs}><CapaReferencias ancho={ancho} alto={tam.h} ctx={ctx} pxd={pxd} /></div>
          <div className="lp-capa" ref={capas.titulos} style={{ right: 0, pointerEvents: 'none' }}><CapaTitulos layout={layout} /></div>
          <div className="lp-cabecera">
            <div className="lp-capa" ref={capas.eje}><CapaEje grilla={grilla} ancho={ancho} pxd={pxd} /></div>
            <span className="lp-anio num" ref={anio} />
          </div>
        </>
      )}
      <div className="lp-zoom">
        <button type="button" className="btn sm" onClick={() => zoomEn(tam.w / 2, 1 / 1.5)} aria-label="Alejar">−</button>
        <button type="button" className="btn sm" onClick={() => zoomEn(tam.w / 2, 1.5)} aria-label="Acercar">+</button>
        <button type="button" className="btn sm" onClick={() => encuadrar(ctx.WIN0, ctx.HOY)}>Ventana</button>
        <button type="button" className="btn sm" onClick={verHoy}>Hoy</button>
      </div>
      {elegido && irAFicha && (
        <button type="button" className="btn primary sm lp-ir-ficha" onClick={irAFicha}>Ficha de {elegido.n} ↓</button>
      )}
      <TipLinea api={tip} HOY={ctx.HOY} notas={notas} />
    </div>
  );
}
