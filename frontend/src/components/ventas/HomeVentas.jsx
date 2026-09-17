import { useMemo, useState } from 'react';
import { formatValue } from '../../lib/format.js';

const PERIODO_LABEL = {
  hoy: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  anio: 'Este año',
  rango: 'Rango',
};

/** Valor real o guión cuando aún no hay fuente. */
function mostrar(value, format) {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return formatValue(value, format);
}

/**
 * Home del Director de Ventas: cash + métricas por segmento.
 * @param {{ data: object }} props
 */
export default function HomeVentas({ data }) {
  const [periodo, setPeriodo] = useState('mes');
  const [programa, setPrograma] = useState('todos');
  const [closer, setCloser] = useState('todos');

  const filtros = data.filtros;
  const segmentos = useMemo(() => {
    const porPeriodo = data.segmentosPorPeriodo?.[periodo] ?? null;
    if (!porPeriodo) return data.segmentosVacios ?? [];
    // Programa: no hay corte por oferta en el CRM todavía → se mantiene UI.
    void programa;
    if (closer !== 'todos' && data.segmentosPorCloser?.[closer]) {
      return data.segmentosPorCloser[closer];
    }
    return porPeriodo;
  }, [data, periodo, programa, closer]);

  const cash = useMemo(() => {
    if (periodo !== 'mes') return null;
    if (closer !== 'todos') {
      const c = data.cashPorCloser?.[closer];
      return c === undefined ? null : c;
    }
    return data.cashPorPeriodo?.mes ?? null;
  }, [data, periodo, closer]);

  return (
    <div className="home-ventas">
      <header className="home-ventas-top">
        <div className="home-ventas-hero">
          <div className="home-ventas-periodo-label">{PERIODO_LABEL[periodo] ?? 'Este mes'}</div>
          <div className="home-ventas-cash num">{mostrar(cash, 'usd')}</div>
          <div className="home-ventas-cash-sub">Cash collected</div>
        </div>

        <div className="home-ventas-filters">
          <div className="home-ventas-periodos" role="tablist" aria-label="Periodo">
            {filtros.periodos.map((p) => (
              <button
                key={p.value}
                type="button"
                role="tab"
                aria-selected={periodo === p.value}
                className={`home-ventas-periodo${periodo === p.value ? ' active' : ''}`}
                onClick={() => setPeriodo(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="home-ventas-select">
            <span>Programa</span>
            <select value={programa} onChange={(e) => setPrograma(e.target.value)}>
              {filtros.programas.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="home-ventas-select">
            <span>Closer</span>
            <select value={closer} onChange={(e) => setCloser(e.target.value)}>
              {filtros.closers.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="home-ventas-segmentos">
        {segmentos.map((seg) => (
          <section key={seg.id} className="home-ventas-seg">
            <div className="home-ventas-seg-head">
              <div>
                <h3>{seg.titulo}</h3>
                {seg.subtitulo && <div className="home-ventas-seg-sub">{seg.subtitulo}</div>}
              </div>
              <div className="home-ventas-seg-badge">
                <span>{seg.badge ?? '--'}</span>
                {seg.badgeExtra != null && <span className="extra">{seg.badgeExtra}</span>}
              </div>
            </div>
            <div className="home-ventas-metrics">
              {seg.metricas.map((m) => (
                <article key={m.id} className="home-ventas-metric">
                  <div className="home-ventas-metric-label">{m.label}</div>
                  <div className="home-ventas-metric-value num">
                    {mostrar(m.value, m.format)}
                  </div>
                  {m.detalle && <div className="home-ventas-metric-detalle">{m.detalle}</div>}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
