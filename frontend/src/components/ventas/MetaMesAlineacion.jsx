import Bar from '../ui/Bar.jsx';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import { formatValue } from '../../lib/format.js';

const ESTADO = {
  en_camino: { tone: 'ok', label: 'en camino' },
  atencion: { tone: 'warn', label: 'atención' },
  critico: { tone: 'alert', label: 'crítico' },
};

/**
 * Strip de alineación a la proyección / decreto del mes.
 * @param {{
 *   titulo?: string,
 *   proyeccion: object,
 *   contexto: { nombreMes?: string, diaHoy: number, diasMes: number },
 *   cuotaLabel: string,
 *   cuotaItems: Array<{ label: string, value: number, format?: string }>,
 *   equipo: { label: string, meta: number, actual: number, format?: string, gap?: number },
 *   ritmoEsperado: number,
 *   estado: 'en_camino' | 'atencion' | 'critico',
 *   insight?: string,
 * }} props
 */
export default function MetaMesAlineacion({
  titulo = 'Meta del mes',
  proyeccion,
  contexto,
  cuotaLabel,
  cuotaItems,
  equipo,
  ritmoEsperado,
  estado,
  insight,
}) {
  const est = ESTADO[estado] ?? ESTADO.atencion;
  const fmt = equipo.format || 'count';
  const pct = equipo.meta ? (equipo.actual / equipo.meta) * 100 : 0;
  const toneBar = estado === 'en_camino' ? 'ok' : estado === 'atencion' ? 'warn' : 'alert';

  return (
    <Card
      className="meta-alineacion"
      title={titulo}
      sub={`${contexto.nombreMes ?? proyeccion.mes} · día ${contexto.diaHoy} de ${contexto.diasMes} · fuente ${proyeccion.fuente === 'decreto' ? 'decreto' : 'proyección default'}`}
      actions={
        <Pill tone={est.tone} dot>
          {est.label}
        </Pill>
      }
    >
      <div className="meta-alineacion-grid">
        <div>
          <div className="k">{equipo.label}</div>
          <div className="n num">{formatValue(equipo.meta, fmt)}</div>
        </div>
        <div>
          <div className="k">Actual equipo</div>
          <div className="n num">{formatValue(equipo.actual, fmt)}</div>
        </div>
        <div>
          <div className="k">Gap</div>
          <div className="n num" style={{ color: 'var(--warn)' }}>
            {formatValue(equipo.gap ?? Math.max(0, equipo.meta - equipo.actual), fmt)}
          </div>
        </div>
        <div>
          <div className="k">Ritmo esperado</div>
          <div className="n num">{formatValue(ritmoEsperado, 'pct')}</div>
        </div>
      </div>

      <Bar pct={pct} tone={toneBar} />
      <div className="meta-alineacion-barra-meta">
        <span>{formatValue(pct, 'pct')} de la meta</span>
        <span className="dim">ritmo {formatValue(ritmoEsperado, 'pct')}</span>
      </div>

      <div className="meta-alineacion-cuota">
        <div className="meta-alineacion-cuota-title">{cuotaLabel}</div>
        <div className="meta-alineacion-cuota-items">
          {cuotaItems.map((it) => (
            <div key={it.label}>
              <div className="k">{it.label}</div>
              <div className="v num">{formatValue(it.value, it.format || 'count')}</div>
            </div>
          ))}
        </div>
      </div>

      {insight && <p className="closer-insight">{insight}</p>}
    </Card>
  );
}
