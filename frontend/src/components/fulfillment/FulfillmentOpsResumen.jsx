import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import Bar from '../ui/Bar.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * Bloque 1: resumen agregado de la cartera.
 * @param {{ resumen: object, contexto: object }} props
 */
export default function FulfillmentOpsResumen({ resumen: r, contexto }) {
  return (
    <Card
      title="Resumen de cartera"
      sub={`${contexto.nombreMes} · día ${contexto.diaHoy} de ${contexto.diasMes}`}
    >
      <div className="ff-ops-resumen-nums">
        <div>
          <div className="k">Clientes activos</div>
          <div className="n num">{formatValue(r.activos, 'count')}</div>
          <div className="ff-ops-breakdown">
            {r.programas.map((p) => (
              <span key={p.id}>
                {p.label} {p.clientes}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="k">Onboardings del mes</div>
          <div className="n num">{formatValue(r.onboardingsMes, 'count')}</div>
          <div className="dim" style={{ fontSize: 12 }}>
            {r.deltaOnboarding >= 0 ? '+' : ''}
            {r.deltaOnboarding} vs mes anterior
          </div>
        </div>
        <div>
          <div className="k">Churn del mes</div>
          <div className="n num" style={{ color: 'var(--brand-hi)' }}>
            {formatValue(r.churnMes, 'count')}
          </div>
          <div className="dim" style={{ fontSize: 12 }}>
            {formatValue(r.churnRate, 'pct')} churn rate
          </div>
        </div>
        <div>
          <div className="k">Net growth</div>
          <div className="n num" style={{ color: r.netGrowth >= 0 ? 'var(--ok)' : 'var(--brand-hi)' }}>
            {r.netGrowth >= 0 ? '+' : ''}
            {r.netGrowth}
          </div>
          <div className="dim" style={{ fontSize: 12 }}>
            nuevos − perdidos
          </div>
        </div>
        <div>
          <div className="k">Caja 2 del mes</div>
          <div className="n num">{formatValue(r.caja2MesUsd, 'usd')}</div>
          <div className="dim" style={{ fontSize: 12 }}>
            upsells + recompras
          </div>
        </div>
      </div>

      <div className="ff-ops-barra">
        <div className="ff-ops-barra-head">
          <span>Onboarding vs meta</span>
          <Pill tone={r.pctOnboarding >= 100 ? 'ok' : r.pctOnboarding >= 70 ? 'warn' : 'alert'} dot>
            {r.onboardingsMes}/{r.metaOnboarding}
          </Pill>
        </div>
        <Bar
          pct={r.pctOnboarding}
          tone={r.pctOnboarding >= 100 ? 'ok' : r.pctOnboarding >= 70 ? 'warn' : 'alert'}
        />
      </div>
    </Card>
  );
}
