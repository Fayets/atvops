import { formatValue } from '../../lib/format.js';

/**
 * Barras horizontales para comparar pocas categorías (gasto por canal).
 * @param {{ data: { label: string, value: number, sub?: string }[],
 *           format?: import('../../data/types.js').MetricFormat, colores?: string[],
 *           participacion?: boolean }} props
 */
export default function HBars({
  data,
  format = 'usd',
  participacion = true,
  colores = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'],
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {data.map((d, i) => (
        <div key={d.label}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{d.label}</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>
                {formatValue(d.value, format)}
              </span>
              {participacion && (
                <span className="num" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  {Math.round((d.value / total) * 100)}%
                </span>
              )}
            </span>
          </div>
          <div className="bar" style={{ height: 8 }}>
            <span style={{ width: `${(d.value / max) * 100}%`, background: colores[i % colores.length] }} />
          </div>
          {d.sub && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>{d.sub}</div>}
        </div>
      ))}
    </div>
  );
}
