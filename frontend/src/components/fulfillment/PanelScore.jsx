import { CORTES, SEMAFORO } from '../../lib/scoring.js';
import Bar from '../ui/Bar.jsx';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';

/**
 * Desglose del score. Auditable: si está en rojo se ve qué factor lo hundió.
 * @param {{ salud: import('../../data/types.js').Salud, compact?: boolean }} props
 */
export default function PanelScore({ salud, compact = false }) {
  const semaforo = SEMAFORO[salud.semaforo];

  return (
    <Card
      title="Score"
      sub={compact ? undefined : `Verde ≥ ${CORTES.verde} · atención ≥ ${CORTES.amarillo}`}
      actions={<Pill tone={semaforo.tone} dot>{semaforo.label}</Pill>}
    >
      <div className="panel-score-hero">
        <span className="num panel-score-n" style={{ color: semaforo.color }}>
          {salud.score}
        </span>
        <span className="panel-score-den">/ 100</span>
      </div>

      <div>
        {salud.factores.map((f) => (
          <div key={f.nombre} className="factor">
            <span className="nombre">{f.nombre}</span>
            <span className="puntos num">
              {Math.round(f.puntos * 10) / 10}
              <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> / {f.max}</span>
            </span>
            <div style={{ gridColumn: '1 / -1', margin: '2px 0 1px' }}>
              <Bar
                pct={(f.puntos / f.max) * 100}
                tone={f.puntos / f.max >= 0.75 ? 'ok' : f.puntos / f.max >= 0.4 ? 'warn' : 'brand'}
              />
            </div>
            <span className="detalle">{f.detalle}</span>
          </div>
        ))}
      </div>

      {salud.alertas.length > 0 && (
        <div className="panel-score-alertas">
          {salud.alertas.map((a) => (
            <div key={a} className="cliente-alerta">{a}</div>
          ))}
        </div>
      )}
    </Card>
  );
}
