import { formatFecha, formatValue } from '../../lib/format.js';

/**
 * El detalle de cualquiera de los números de cobranza, fila por fila.
 *
 * Es uno solo para los cinco KPIs en vez de cinco modales: todos contestan la misma
 * pregunta —"¿de qué está hecho este total?"— y lo único que cambia es cómo se agrupan
 * las filas. Cada grupo lleva su subtotal y el pie repite el total, así se puede
 * comprobar a ojo que las partes suman lo que dice la tarjeta. Un número que no se puede
 * auditar se discute en vez de usarse.
 *
 * @param {{ titulo: string, sub?: string, total: number,
 *           grupos: { clave: string, label: string, nota?: string, filas: any[] }[],
 *           columna?: 'vence' | 'pagada' | 'atraso' | 'ninguna',
 *           onCerrar: () => void }} props
 */

const usd = (v) => formatValue(v ?? 0, 'usd');
const monto = (f) => Number(f.montoUsd ?? f.deudaUsd ?? 0);

function dato(fila, columna) {
  if (columna === 'pagada') return fila.pagadaAt || fila.pagoAt ? formatFecha(fila.pagadaAt ?? fila.pagoAt) : '—';
  if (columna === 'atraso') {
    const d = fila.diasAtraso ?? fila.diasVencida ?? 0;
    return d ? `${d} d de atraso` : '—';
  }
  if (columna === 'vence') return fila.venceAt ? formatFecha(fila.venceAt) : '—';
  return fila.estado || '';
}

function Grupo({ grupo, total, columna }) {
  const suma = grupo.filas.reduce((s, f) => s + monto(f), 0);
  const peso = total ? Math.round((suma / total) * 100) : 0;

  return (
    <section className="detalle-grupo">
      <header>
        <div>
          <h4>{grupo.label}</h4>
          {grupo.nota ? <span className="dim">{grupo.nota}</span> : null}
        </div>
        <div className="detalle-grupo-n">
          <span className="num">{usd(suma)}</span>
          <span className="dim">{grupo.filas.length} · {peso}% del total</span>
        </div>
      </header>

      {grupo.filas.length === 0 ? (
        <div className="empty">Nada en este grupo.</div>
      ) : (
        <div className="detalle-filas">
          {grupo.filas.map((f, i) => (
            <div key={f.id ?? `${f.cliente}-${i}`} className="detalle-fila">
              <span className="detalle-quien">{f.cliente}</span>
              <span className="dim">{f.plan || '—'}</span>
              <span className="dim">{dato(f, columna)}</span>
              <span className="num strong">{usd(monto(f))}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function DetalleCobranza({ titulo, sub, total, grupos, columna = 'vence', onCerrar }) {
  // Un grupo vacío se esconde salvo que sea el único: la lista de grupos describe cómo
  // se parte este total, y una partición con un lado en cero no aporta nada.
  const conFilas = grupos.filter((g) => g.filas.length);
  const visibles = conFilas.length ? conFilas : grupos;

  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <div className="modal-card detalle-cobranza" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label={titulo}>
        <header>
          <div>
            <h3>{titulo}</h3>
            {sub ? <span className="dim">{sub}</span> : null}
          </div>
          <button type="button" className="btn ghost" onClick={onCerrar}>Cerrar</button>
        </header>

        <div className="detalle-grupos">
          {visibles.map((g) => <Grupo key={g.clave} grupo={g} total={total} columna={columna} />)}
        </div>

        <footer className="detalle-total">
          <span>Total</span>
          <span className="num">{usd(total)}</span>
        </footer>
      </div>
    </div>
  );
}
