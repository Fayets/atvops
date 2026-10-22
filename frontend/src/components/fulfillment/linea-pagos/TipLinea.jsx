import { useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { ESTADO, GRUPO, PNAME, fmtD, usd } from '../../../lib/lineaPagos.js';

/** Qué pasó en ese punto de la línea, en una línea. */
function evento(it, HOY) {
  const c = it.c;
  if (it.tipo === 'alta') return `Ingreso · ${fmtD(it.d)}`;
  if (it.tipo === 'recompra') return `Recompra · ${fmtD(it.d)}`;
  if (it.tipo === 'pago') return `Pago ${usd(it.m)} · ${fmtD(it.d)} · ${it.medio}`;
  if (it.tipo === 'baja') return `Baja anticipada · ${fmtD(it.d)}`;
  if (it.tipo === 'barra') return `Ingreso ${fmtD(c.aD)} · ${c.vD > HOY ? 'vence' : 'venció'} ${fmtD(c.vD)}`;
  return `${it.est ? 'Vencimiento estimado' : 'Vencimiento'} · ${fmtD(it.d)}`;
}

/**
 * El cartel de la línea. Se maneja desde afuera con `api` (mostrar / mover / ocultar) para
 * que pasar el mouse no vuelva a dibujar la línea entera: solo cambia este cartel, y
 * solo cuando cambia el punto; seguir al puntero es un transform.
 */
export default function TipLinea({ api, HOY, notas }) {
  const [it, setIt] = useState(null);
  const ref = useRef(null);
  const pos = useRef({ x: 0, y: 0, caja: null });
  const actual = useRef(null);

  const ubicar = () => {
    const el = ref.current;
    const { x: cx, y: cy, caja } = pos.current;
    if (!el || !caja) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = cx - caja.left + 14;
    let y = cy - caja.top + 14;
    if (x + w > caja.width - 6) x = cx - caja.left - w - 14;
    if (x < 6) x = 6;
    if (y + h > caja.height - 6) y = cy - caja.top - h - 14;
    if (y < 6) y = 6;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  useImperativeHandle(api, () => ({
    mostrar(item, e, caja) {
      pos.current = { x: e.clientX, y: e.clientY, caja };
      if (item === actual.current) { ubicar(); return; }
      actual.current = item;
      setIt(item);
    },
    ocultar() {
      actual.current = null;
      setIt(null);
    },
  }), []);

  useLayoutEffect(ubicar, [it]);

  if (!it) return null;
  const c = it.c;
  const n = (notas[c.id] || []).length;
  const g = GRUPO[c.g];
  return (
    <div className="lp-tip" ref={ref}>
      <b>{c.n}</b>
      <span className="dim">{PNAME[c.p]} · {ESTADO[c.e] || c.e}</span>
      <span>{evento(it, HOY)}</span>
      {(it.tipo === 'venc' || it.tipo === 'alta' || it.tipo === 'barra') && (
        <>
          <span className="dim">Inicio {fmtD(c.aD)} · {c.d} días de programa</span>
          {Math.abs(c.vD - c.vcD) > 7 && <span className="dim">Inicio + duración: {fmtD(c.vcD)}</span>}
        </>
      )}
      {it.tipo === 'pago' && <span className="dim">Cobrado {usd(c.tp)} · deuda {usd(c.ad)}</span>}
      <span className="lp-tip-grupo" style={{ color: g?.color || 'var(--text-3)' }}>
        {g?.titulo || 'A revisar'}{c.ab ? ' · también B' : ''}
      </span>
      {c.sn && <span className="dim">Seña o adelanto</span>}
      {c.mE > 0 && <span className="lp-marca-txt">{c.mE === 1 ? 'E1 · cuota sin pagar, sigue en Discord' : 'E2 · cuota sin pagar, fuera de Discord'}</span>}
      {c.mD.map((m) => <span key={m} className="lp-marca-txt">D · {m}</span>)}
      {c.qm && <span className="lp-warn">Vencimiento a confirmar: la ficha suma {c.dvd} días al año de Boost</span>}
      {c.e === 'pausa' && <span className="dim">En pausa</span>}
      {n > 0 && <span className="dim">{n} {n === 1 ? 'nota' : 'notas'}</span>}
      {c.flags.filter((f) => !f.startsWith('Total pagado')).slice(0, 2).map((f) => <span key={f} className="lp-warn">{f}</span>)}
    </div>
  );
}
