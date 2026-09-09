import Bars from '../charts/Bars.jsx';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import Bar from '../ui/Bar.jsx';
import { formatValue } from '../../lib/format.js';

const ESTADO = {
  ok: { tone: 'ok', label: 'en camino' },
  warn: { tone: 'warn', label: 'atención' },
  alert: { tone: 'alert', label: 'crítico' },
};

/**
 * Bloque 2: expansión Caja 2.
 * @param {{ expansion: object }} props
 */
export default function FulfillmentOpsExpansion({ expansion: e }) {
  const est = ESTADO[e.estadoCaja2] ?? ESTADO.warn;

  return (
    <Card
      title="Expansión · Caja 2"
      sub="Upsells, recompras y downsells del mes"
      actions={
        <Pill tone={est.tone} dot>
          {est.label}
        </Pill>
      }
    >
      <div className="ff-ops-exp-grid">
        <div className="ff-ops-exp-card">
          <div className="k">Upsells</div>
          <div className="n num">{e.upsells.cantidad}</div>
          <div className="dim">{formatValue(e.upsells.revenueUsd, 'usd')}</div>
        </div>
        <div className="ff-ops-exp-card">
          <div className="k">Recompras</div>
          <div className="n num">{e.recompras.cantidad}</div>
          <div className="dim">{formatValue(e.recompras.revenueUsd, 'usd')}</div>
        </div>
        <div className="ff-ops-exp-card">
          <div className="k">Downsells</div>
          <div className="n num" style={{ color: 'var(--warn)' }}>
            {e.downsells.cantidad}
          </div>
          <div className="dim">bajaron de tier</div>
        </div>
        <div className="ff-ops-exp-card">
          <div className="k">Caja 2 total</div>
          <div className="n num">{formatValue(e.caja2Usd, 'usd')}</div>
          <div className="dim">meta {formatValue(e.metaCaja2Usd, 'usd')}</div>
        </div>
      </div>

      <div className="ff-ops-exp-meta">
        <div>
          <span className="k">Gap</span>
          <span className="num" style={{ color: e.gapCaja2 > 0 ? 'var(--warn)' : 'var(--ok)' }}>
            {formatValue(e.gapCaja2, 'usd')}
          </span>
        </div>
        <div>
          <span className="k">% completado</span>
          <span className="num">{formatValue(e.pctCaja2, 'pct')}</span>
        </div>
      </div>
      <Bar pct={e.pctCaja2} tone={e.estadoCaja2 === 'ok' ? 'ok' : e.estadoCaja2 === 'warn' ? 'warn' : 'alert'} />

      <div style={{ marginTop: 18 }}>
        <div className="k" style={{ marginBottom: 8 }}>
          Caja 2 por semana
        </div>
        <Bars
          data={e.porSemana}
          x={(s) => s.label}
          y={(s) => s.usd}
          format="usd"
          label="Caja 2"
          height={180}
        />
      </div>
    </Card>
  );
}
