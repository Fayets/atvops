import { useState } from 'react';
import { formatCompact, formatValue, niceTicks } from '../../lib/format.js';
import { useMeasure } from '../../lib/hooks.js';

/**
 * Puente de revenue. Muestra de dónde sale el número final: cuánto sumó la
 * expansión y cuánto se llevaron la contracción y el churn. Es la forma honesta
 * de mirar el NRR, porque separa lo que la base existente aportó de lo que
 * trajeron los clientes nuevos.
 *
 * @param {{ pasos: { label: string, delta?: number, valor?: number, tipo: 'base' | 'delta' | 'total' }[],
 *           height?: number }} props
 */
export default function Waterfall({ pasos, height = 260 }) {
  const [ref, width] = useMeasure();
  const [hover, setHover] = useState(null);

  const M = { top: 14, right: 12, bottom: 42, left: 52 };
  const w = Math.max(width, 320);
  const iw = w - M.left - M.right;
  const ih = height - M.top - M.bottom;

  // Acumula para saber dónde arranca y termina cada barra.
  const barras = pasos.reduce((acc, p) => {
    const acumulado = acc.length ? acc[acc.length - 1].hasta : 0;
    if (p.tipo === 'base' || p.tipo === 'total') {
      const valor = p.valor ?? acumulado;
      acc.push({ ...p, desde: 0, hasta: valor, valor });
    } else {
      acc.push({ ...p, desde: acumulado, hasta: acumulado + (p.delta ?? 0), valor: p.delta ?? 0 });
    }
    return acc;
  }, []);

  const max = Math.max(...barras.map((b) => Math.max(b.desde, b.hasta)));
  const ticks = niceTicks(0, max, 4);
  const tope = ticks[ticks.length - 1];
  const py = (v) => M.top + ih - (v / tope) * ih;
  const paso = iw / barras.length;
  const bw = Math.min(56, paso * 0.6);

  const color = (b) =>
    b.tipo !== 'delta' ? 'var(--s4)' : (b.valor ?? 0) >= 0 ? 'var(--ok)' : 'var(--brand)';

  return (
    <div className="chart-wrap" ref={ref}>
      {width > 0 && (
        <svg width={w} height={height} onMouseLeave={() => setHover(null)}>
          {ticks.map((v, i) => (
            <g key={i}>
              <line x1={M.left} x2={w - M.right} y1={py(v)} y2={py(v)} stroke="var(--border-soft)" />
              <text x={M.left - 10} y={py(v) + 4} textAnchor="end" fontSize="10.5" fill="var(--text-3)">
                {formatCompact(v, 'usd')}
              </text>
            </g>
          ))}

          {barras.map((b, i) => {
            const cx = M.left + paso * (i + 0.5);
            const y = py(Math.max(b.desde, b.hasta));
            const alto = Math.max(2, Math.abs(py(b.desde) - py(b.hasta)));
            return (
              <g key={b.label} onMouseEnter={() => setHover(i)}>
                <rect x={cx - paso / 2} y={M.top} width={paso} height={ih} fill="transparent" />
                {i > 0 && barras[i].tipo === 'delta' && (
                  <line
                    x1={M.left + paso * (i - 0.5) + bw / 2}
                    x2={cx - bw / 2}
                    y1={py(b.desde)}
                    y2={py(b.desde)}
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                  />
                )}
                <rect
                  x={cx - bw / 2}
                  y={y}
                  width={bw}
                  height={alto}
                  rx="3"
                  fill={color(b)}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
                <text
                  x={cx}
                  y={height - 24}
                  textAnchor="middle"
                  fontSize="10.5"
                  fill={hover === i ? 'var(--text)' : 'var(--text-3)'}
                >
                  {b.label}
                </text>
                <text x={cx} y={height - 10} textAnchor="middle" fontSize="10.5" fill="var(--text-3)">
                  {b.tipo === 'delta' && (b.valor ?? 0) > 0 ? '+' : ''}
                  {formatCompact(b.valor ?? 0, 'usd')}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {hover !== null && (
        <div
          className="chart-tip"
          style={{ left: M.left + paso * (hover + 0.5), top: py(Math.max(barras[hover].desde, barras[hover].hasta)) }}
        >
          <div className="t">{barras[hover].label}</div>
          <div className="v num">{formatValue(barras[hover].valor ?? 0, 'usd')}</div>
        </div>
      )}
    </div>
  );
}
