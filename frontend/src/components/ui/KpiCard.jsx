import { formatValue } from '../../lib/format.js';
import Sparkline from '../charts/Sparkline.jsx';
import Bar from './Bar.jsx';
import Delta from './Delta.jsx';
import SourceTag from './SourceTag.jsx';

/**
 * Renderiza una `Metric`. Toda tarjeta muestra de dónde sale el número: si no
 * se ve la procedencia, el dato no es confiable.
 * @param {{ metric: import('../../data/types.js').Metric, size?: 'md' | 'sm', spark?: boolean }} props
 */
export default function KpiCard({ metric, size = 'md', spark = true }) {
  const { label, value, format, previous, sourceId, updatedAt, good, nota, objetivo, serie } = metric;
  const pctObjetivo = objetivo ? (objetivo === 0 ? (value === 0 ? 100 : 0) : (value / objetivo) * 100) : null;
  const cumple = objetivo !== null && objetivo !== undefined
    ? good === 'down'
      ? value <= objetivo
      : value >= objetivo
    : null;

  return (
    <article className={`kpi${size === 'sm' ? ' sm' : ''}`}>
      <div className="kpi-label">{label}</div>

      <div className="kpi-value-row">
        <span className="kpi-value num">{formatValue(value, format)}</span>
        <Delta value={value} previous={previous} good={good} />
      </div>

      {objetivo !== null && objetivo !== undefined && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Bar
            pct={good === 'down' ? Math.min(100, (objetivo / Math.max(value, 0.001)) * 100) : pctObjetivo}
            tone={cumple ? 'ok' : 'warn'}
          />
          <div className="kpi-objetivo">
            <span>Objetivo {formatValue(objetivo, format)}</span>
            <span style={{ color: cumple ? 'var(--ok)' : 'var(--warn)' }}>{cumple ? 'en meta' : 'fuera de meta'}</span>
          </div>
        </div>
      )}

      {nota && <div className="kpi-nota">{nota}</div>}

      {spark && serie && serie.length > 1 && (
        <div className="kpi-spark">
          <Sparkline data={serie} />
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
        <SourceTag sourceId={sourceId} updatedAt={updatedAt} />
      </div>
    </article>
  );
}
