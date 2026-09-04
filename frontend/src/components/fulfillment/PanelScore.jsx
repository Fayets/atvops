import { CORTES, PESOS, SEMAFORO } from '../../lib/scoring.js';
import Bar from '../ui/Bar.jsx';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';

/**
 * Desglose del score. Existe para que el semáforo sea discutible: si un cliente
 * está en rojo se tiene que poder ver exactamente qué factor lo hundió.
 * @param {{ salud: import('../../data/types.js').Salud }} props
 */
export default function PanelScore({ salud }) {
  const semaforo = SEMAFORO[salud.semaforo];

  return (
    <Card
      title="Score de salud"
      sub={`Verde desde ${CORTES.verde} · atención desde ${CORTES.amarillo}`}
      actions={<Pill tone={semaforo.tone} dot>{semaforo.label}</Pill>}
      foot="Cada factor sale de contar o clasificar los mensajes del canal. Nadie completa un formulario."
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <span className="num" style={{ fontSize: 38, fontWeight: 600, letterSpacing: '-0.03em', color: semaforo.color }}>
          {salud.score}
        </span>
        <span style={{ color: 'var(--text-3)', fontSize: 13 }}>/ 100</span>
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
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {salud.alertas.map((a) => (
            <div key={a} className="cliente-alerta">
              {a}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
        Pesos: activación {PESOS.activacion} · ritmo {PESOS.ritmo} · mix{' '}
        {PESOS.mix} · outcome {PESOS.outcome}. Silencio de 7 días o más pinta rojo sin importar el puntaje.
      </div>
    </Card>
  );
}
