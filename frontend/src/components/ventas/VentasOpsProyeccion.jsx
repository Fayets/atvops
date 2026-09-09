import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import Bar from '../ui/Bar.jsx';
import { formatValue } from '../../lib/format.js';

const ESTADO = {
  en_camino: { tone: 'ok', label: 'en camino' },
  atencion: { tone: 'warn', label: 'atención' },
  critico: { tone: 'alert', label: 'crítico' },
};

/**
 * Bloque 1: proyección de cash vs meta del mes.
 * @param {{ proyeccion: object, contexto: object }} props
 */
export default function VentasOpsProyeccion({ proyeccion: p, contexto }) {
  const est = ESTADO[p.estado] ?? ESTADO.atencion;
  const toneBar = p.estado === 'en_camino' ? 'ok' : p.estado === 'atencion' ? 'warn' : 'alert';

  return (
    <Card
      className="ventas-ops-proyeccion"
      title="Proyección contra meta"
      sub={`${contexto.nombreMes} · día ${contexto.diaHoy} de ${contexto.diasMes}`}
      actions={
        <Pill tone={est.tone} dot>
          {est.label}
        </Pill>
      }
    >
      <div className="ventas-ops-proyeccion-nums">
        <div>
          <div className="k">Meta del mes</div>
          <div className="n num">{formatValue(p.metaUsd, 'usd')}</div>
        </div>
        <div>
          <div className="k">Revenue actual</div>
          <div className="n num">{formatValue(p.actualUsd, 'usd')}</div>
        </div>
        <div>
          <div className="k">Gap</div>
          <div className="n num" style={{ color: 'var(--warn)' }}>
            {formatValue(p.gapUsd, 'usd')}
          </div>
        </div>
        <div>
          <div className="k">Proyectado al ritmo</div>
          <div className="n num">{formatValue(p.proyectadoUsd, 'usd')}</div>
        </div>
        <div>
          <div className="k">Probabilidad de meta</div>
          <div className="n num" style={{ color: `var(--${est.tone === 'alert' ? 'brand-hi' : est.tone === 'warn' ? 'warn' : 'ok'})` }}>
            {formatValue(p.probabilidad, 'pct')}
          </div>
        </div>
      </div>

      <div className="ventas-ops-barra">
        <Bar pct={p.pctMeta} tone={toneBar} />
        <div className="ventas-ops-barra-meta">
          <span>{formatValue(p.pctMeta, 'pct')} de la meta</span>
          <span className="dim">ritmo esperado {formatValue(p.pctRitmo, 'pct')}</span>
        </div>
      </div>

      <p className="ventas-ops-insight">{p.insight}</p>
    </Card>
  );
}
