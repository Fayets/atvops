import { useState } from 'react';
import { formatCompact, formatValue, niceTicks } from '../../lib/format.js';
import { useMeasure } from '../../lib/hooks.js';

/**
 * Serie temporal con área y tooltip. Se mide el contenedor para dibujar en
 * píxeles reales (nada de escalar el viewBox y deformar los trazos).
 *
 * @param {{ data: any[], x: (d: any) => string, series: { key: (d: any) => number, label: string, color?: string }[],
 *           height?: number, format?: import('../../data/types.js').MetricFormat, ticks?: number,
 *           referencia?: { valor: number, label: string } }} props
 */
export default function LineArea({ data, x, series, height = 240, format = 'count', ticks = 4, referencia }) {
  const [ref, width] = useMeasure();
  const [hover, setHover] = useState(null);

  const M = { top: 12, right: 12, bottom: 26, left: 46 };
  const w = Math.max(width, 240);
  const iw = w - M.left - M.right;
  const ih = height - M.top - M.bottom;

  const valores = data.flatMap((d) => series.map((s) => s.key(d)));
  const maxRaw = Math.max(...valores, referencia?.valor ?? -Infinity);
  const minRaw = Math.min(...valores, referencia?.valor ?? Infinity);
  const piso = minRaw > 0 ? Math.max(0, minRaw - (maxRaw - minRaw) * 0.4) : minRaw;
  const gridVals = niceTicks(piso, maxRaw, ticks, format === 'count' || format === 'days');
  const min = gridVals[0];
  const max = gridVals[gridVals.length - 1];

  const px = (i) => M.left + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const py = (v) => M.top + ih - ((v - min) / (max - min || 1)) * ih;
  const activo = hover !== null ? data[hover] : null;

  return (
    <div className="chart-wrap" ref={ref}>
      {width > 0 && (
        <svg
          width={w}
          height={height}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const rel = e.clientX - rect.left - M.left;
            const i = Math.round((rel / iw) * (data.length - 1));
            setHover(Math.max(0, Math.min(data.length - 1, i)));
          }}
        >
          <defs>
            {series.map((s, si) => (
              <linearGradient key={si} id={`la-grad-${si}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color ?? 'var(--s1)'} stopOpacity="0.26" />
                <stop offset="100%" stopColor={s.color ?? 'var(--s1)'} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {gridVals.map((v, i) => (
            <g key={i}>
              <line x1={M.left} x2={w - M.right} y1={py(v)} y2={py(v)} stroke="var(--border-soft)" strokeWidth="1" />
              <text x={M.left - 10} y={py(v) + 4} textAnchor="end" fontSize="10.5" fill="var(--text-3)">
                {formatCompact(v, format)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            // Se etiqueta uno de cada N y siempre el último, pero sin dejar que
            // el penúltimo se pise con el del borde.
            const cada = Math.ceil(data.length / 8);
            const mostrar = i === data.length - 1 || (i % cada === 0 && data.length - 1 - i >= cada);
            return mostrar ? (
              <text
                key={i}
                x={px(i)}
                y={height - 8}
                textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                fontSize="10.5"
                fill="var(--text-3)"
              >
                {x(d)}
              </text>
            ) : null;
          })}

          {series.map((s, si) => {
            const color = s.color ?? 'var(--s1)';
            const linea = data
              .map((d, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)} ${py(s.key(d)).toFixed(1)}`)
              .join(' ');
            const area = `${linea} L${px(data.length - 1)} ${M.top + ih} L${px(0)} ${M.top + ih} Z`;
            return (
              <g key={si}>
                <path d={area} fill={`url(#la-grad-${si})`} />
                <path d={linea} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {data.map((d, i) => (
                  <circle
                    key={i}
                    cx={px(i)}
                    cy={py(s.key(d))}
                    r={hover === i ? 4 : 0}
                    fill="var(--bg)"
                    stroke={color}
                    strokeWidth="2"
                  />
                ))}
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
                stroke="var(--text-3)"
                strokeWidth="1"
                strokeDasharray="5 4"
              />
              <text x={M.left + 6} y={py(referencia.valor) - 6} textAnchor="start" fontSize="10.5" fill="var(--text-3)">
                {referencia.label}
              </text>
            </g>
          )}

          {hover !== null && (
            <line
              x1={px(hover)}
              x2={px(hover)}
              y1={M.top}
              y2={M.top + ih}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}
        </svg>
      )}

      {activo && (
        <div className="chart-tip" style={{ left: px(hover), top: py(series[0].key(activo)) }}>
          <div className="t">{x(activo)}</div>
          {series.map((s, si) => (
            <div key={si} className="v num">
              {series.length > 1 && <span style={{ color: s.color ?? 'var(--s1)' }}>{s.label}: </span>}
              {formatValue(s.key(activo), format)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
