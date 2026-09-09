import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import { formatValue } from '../../lib/format.js';

const TONE = { ok: 'ok', warn: 'warn', alert: 'alert' };

/**
 * Bloque 2: funnel math con gap, ritmo semanal y diagnóstico.
 * @param {{ funnel: object[], diagnostico: string }} props
 */
export default function VentasOpsFunnel({ funnel, diagnostico }) {
  return (
    <Card
      title="Funnel math"
      sub="Meta · actual · gap · ritmo semanal necesario"
      flush
      foot={diagnostico || undefined}
    >
      <div className="table-wrap">
        <table className="data ventas-ops-funnel">
          <thead>
            <tr>
              <th>Etapa</th>
              <th className="right">Meta</th>
              <th className="right">Actual</th>
              <th className="right">Gap</th>
              <th className="right">% mes</th>
              <th className="right">Ritmo / sem</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {funnel.map((f) => (
              <tr key={f.id}>
                <td className="strong">{f.label}</td>
                <td className="right num">{formatValue(f.meta, f.format)}</td>
                <td className="right num">{formatValue(f.actual, f.format)}</td>
                <td className="right num" style={{ color: f.gap > 0 ? 'var(--warn)' : 'var(--ok)' }}>
                  {f.gap > 0 ? formatValue(f.gap, f.format) : '—'}
                </td>
                <td className="right num">{formatValue(f.pctCompletado, 'pct')}</td>
                <td className="right num">
                  {f.gap > 0 ? formatValue(f.ritmoSemana, f.format === 'usd' ? 'usd' : 'count') : '—'}
                </td>
                <td>
                  <Pill tone={TONE[f.estado] ?? 'plain'} dot>
                    {f.estado === 'ok' ? 'ok' : f.estado === 'warn' ? 'atención' : 'crítico'}
                  </Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
