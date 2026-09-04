import { useState } from 'react';
import { formatCompact, formatValue, niceTicks } from '../../lib/format.js';
import { useMeasure } from '../../lib/hooks.js';

/**
 * Barras verticales con una línea secundaria opcional (ej. cash + close rate).
 * @param {{ data: any[], x: (d: any) => string, y: (d: any) => number,
 *           linea?: { key: (d: any) => number, label: string, format?: string, escala?: 'propia' | 'compartida' },
 *           height?: number, format?: import('../../data/types.js').MetricFormat,
 *           color?: (d: any, i: number) => string, label?: string,
 *           referencia?: { valor: number, label: string } }} props
 */
export default function Bars({ data, x, y, linea, height = 240, format = 'usd', color, label = 'Valor', referencia }) {
  const [ref, width] = useMeasure();
  const [hover, setHover] = useState(null);

  const M = { top: 12, right: linea ? 40 : 12, bottom: 26, left: 46 };
  const w = Math.max(width, 240);
  const iw = w - M.left - M.right;
  const ih = height - M.top - M.bottom;

  const ticks = niceTicks(
    0,
    Math.max(...data.map(y), referencia?.valor ?? 1),
    4,
    format === 'count' || format === 'days',
  );
  const max = ticks[ticks.length - 1];
  const bw = Math.min(38, (iw / data.length) * 0.58);
  const cx = (i) => M.left + (iw / data.length) * (i + 0.5);
  const py = (v) => M.top + ih - (v / max) * ih;

  const compartida = linea?.escala === 'compartida';
  const maxL = linea ? (compartida ? max : Math.max(...data.map(linea.key), 1) * 1.3) : 1;
  const pyL = (v) => M.top + ih - (v / maxL) * ih;

  return (
    <div className="chart-wrap" ref={ref}>
      {width > 0 && (
        <svg width={w} height={height} onMouseLeave={() => setHover(null)}>
          {ticks.map((v, i) => (
            <g key={i}>
              <line x1={M.left} x2={w - M.right} y1={py(v)} y2={py(v)} stroke="var(--border-soft)" />
              <text x={M.left - 10} y={py(v) + 4} textAnchor="end" fontSize="10.5" fill="var(--text-3)">
                {formatCompact(v, format)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const alto = Math.max(2, ih - (py(y(d)) - M.top));
            const activo = hover === i;
            return (
              <g key={i} onMouseEnter={() => setHover(i)}>
                <rect
                  x={cx(i) - (iw / data.length) / 2}
                  y={M.top}
                  width={iw / data.length}
                  height={ih}
                  fill="transparent"
                />
                <rect
                  x={cx(i) - bw / 2}
                  y={py(y(d))}
                  width={bw}
                  height={alto}
                  rx="4"
                  fill={color ? color(d, i) : 'var(--s1)'}
                  opacity={hover === null || activo ? 1 : 0.42}
                />
                <text x={cx(i)} y={height - 8} textAnchor="middle" fontSize="10.5" fill="var(--text-3)">
                  {x(d)}
                </text>
              </g>
            );
          })}

          {referencia && (
            <g>
              <line
                x1={M.left}
                x2={w - M.right}
                y1={py(referencia.valor)}
                y2={py(referencia.valor)}
                stroke="var(--text-2)"
                strokeWidth="1"
                strokeDasharray="5 4"
              />
              <text x={M.left + 6} y={py(referencia.valor) - 6} textAnchor="start" fontSize="10.5" fill="var(--text-2)">
                {referencia.label}
              </text>
            </g>
          )}

          {linea && !compartida &&
            niceTicks(0, maxL / 1.3, 3, (linea.format ?? 'pct') === 'count').map((v, i) => (
              <text
                key={`r${i}`}
                x={w - M.right + 8}
                y={pyL(v) + 4}
                textAnchor="start"
                fontSize="10.5"
                fill="var(--text-3)"
              >
                {formatCompact(v, linea.format ?? 'pct')}
              </text>
            ))}

          {linea && (
            <>
              <path
                d={data.map((d, i) => `${i === 0 ? 'M' : 'L'}${cx(i)} ${pyL(linea.key(d))}`).join(' ')}
                fill="none"
                stroke="var(--text-2)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              {data.map((d, i) => (
                <circle key={i} cx={cx(i)} cy={pyL(linea.key(d))} r="2.5" fill="var(--bg)" stroke="var(--text-2)" strokeWidth="1.5" />
              ))}
            </>
          )}
        </svg>
      )}

      {hover !== null && (
        <div className="chart-tip" style={{ left: cx(hover), top: py(y(data[hover])) }}>
          <div className="t">{x(data[hover])}</div>
          <div className="v num">
            {label}: {formatValue(y(data[hover]), format)}
          </div>
          {linea && (
            <div className="v num" style={{ color: 'var(--text-2)', fontWeight: 500 }}>
              {linea.label}: {formatValue(linea.key(data[hover]), linea.format ?? 'pct')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
