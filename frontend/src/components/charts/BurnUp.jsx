import { formatCompact, formatValue, niceTicks } from '../../lib/format.js';
import { useMeasure } from '../../lib/hooks.js';

/**
 * Burn-up mensual: la línea ideal (0 → meta a lo largo del mes), lo acumulado
 * real hasta hoy, y la proyección punteada a fin de mes al ritmo actual.
 * Es el gráfico que dice de un vistazo "vamos" o "no vamos".
 *
 * @param {{ meta: number, acumulado: number[], diasMes: number, ritmo: object,
 *           format?: string, height?: number }} props
 */
export default function BurnUp({ meta, acumulado, diasMes, ritmo, format = 'count', height = 132 }) {
  const [ref, width] = useMeasure();
  const M = { top: 10, right: 12, bottom: 20, left: 40 };
  const w = Math.max(width, 200);
  const iw = w - M.left - M.right;
  const ih = height - M.top - M.bottom;

  const top = Math.max(meta, ritmo.proyeccion) * 1.06;
  const ticks = niceTicks(0, top, 3, format === 'count' && top < 50);
  const max = ticks[ticks.length - 1];
  const px = (dia) => M.left + (dia / diasMes) * iw;
  const py = (v) => M.top + ih - (v / max) * ih;

  const dia = ritmo.dia;
  const real = acumulado.map((v, i) => [i + 1, v]);
  const lineaReal = `M${px(0)} ${py(0)} ` + real.map(([d, v]) => `L${px(d).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
  const areaReal = `${lineaReal} L${px(dia)} ${py(0)} Z`;
  const ultimo = acumulado.at(-1) ?? 0;
  const tono = ritmo.estado === 'critico' ? 'var(--brand)' : ritmo.estado === 'atrasado' ? 'var(--warn)' : 'var(--ok)';

  return (
    <div className="chart-wrap" ref={ref}>
      {width > 0 && (
        <svg width={w} height={height}>
          <defs>
            <linearGradient id="burnup-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--s1)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--s1)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={w - M.right} y1={py(v)} y2={py(v)} stroke="var(--border-soft)" />
              <text x={M.left - 8} y={py(v) + 4} textAnchor="end" fontSize="10" fill="var(--text-3)">
                {formatCompact(v, format)}
              </text>
            </g>
          ))}

          {/* meta */}
          <line x1={M.left} x2={w - M.right} y1={py(meta)} y2={py(meta)} stroke="var(--text-3)" strokeDasharray="3 4" />
          <text x={w - M.right} y={py(meta) - 5} textAnchor="end" fontSize="10" fill="var(--text-2)">
            meta {formatValue(meta, format)}
          </text>

          {/* ideal */}
          <line x1={px(0)} y1={py(0)} x2={px(diasMes)} y2={py(meta)} stroke="var(--s4)" strokeWidth="1.5" />

          {/* real */}
          <path d={areaReal} fill="url(#burnup-grad)" />
          <path d={lineaReal} fill="none" stroke="var(--s1)" strokeWidth="2" strokeLinejoin="round" />

          {/* proyección */}
          <line
            x1={px(dia)}
            y1={py(ultimo)}
            x2={px(diasMes)}
            y2={py(Math.min(ritmo.proyeccion, max))}
            stroke={tono}
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <circle cx={px(diasMes)} cy={py(Math.min(ritmo.proyeccion, max))} r="3" fill={tono} />

          {/* hoy */}
          <line x1={px(dia)} x2={px(dia)} y1={M.top} y2={M.top + ih} stroke="var(--border)" strokeDasharray="2 3" />
          <circle cx={px(dia)} cy={py(ultimo)} r="3.5" fill="var(--bg)" stroke="var(--s1)" strokeWidth="2" />

          {[1, Math.round(diasMes / 2), diasMes].map((d) => (
            <text key={d} x={px(d)} y={height - 6} textAnchor={d === 1 ? 'start' : d === diasMes ? 'end' : 'middle'} fontSize="10" fill="var(--text-3)">
              {d === dia ? `hoy · ${d}` : d}
            </text>
          ))}
          {dia !== 1 && dia !== diasMes && Math.abs(dia - Math.round(diasMes / 2)) > 2 && (
            <text x={px(dia)} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--text-2)">
              hoy · {dia}
            </text>
          )}
        </svg>
      )}
    </div>
  );
}
