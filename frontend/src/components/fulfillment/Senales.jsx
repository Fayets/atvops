import { formatFechaHora } from '../../lib/format.js';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';

const TIPO = {
  primer_resultado: { label: 'primer resultado', tone: 'ok' },
  implementacion: { label: 'implementación', tone: 'ok' },
  hito: { label: 'hito', tone: 'ok' },
  senal_upsell: { label: 'señal de upsell', tone: 'ok' },
  soporte: { label: 'soporte', tone: 'plain' },
  queja: { label: 'queja', tone: 'alert' },
  riesgo_churn: { label: 'riesgo de churn', tone: 'alert' },
  silencio: { label: 'silencio', tone: 'alert' },
};

/**
 * Señales extraídas de los transcripts. Es la evidencia cruda detrás del score:
 * el fragmento real del canal, con fecha.
 * @param {{ senales: import('../../data/types.js').SenalTranscript[], titulo?: string,
 *           nombrePorCliente?: (id: string) => string }} props
 */
export default function Senales({ senales, titulo = 'Señales del canal', nombrePorCliente }) {
  return (
    <Card
      title={titulo}
      sub="Fragmentos detectados en los transcripts de Discord"
      flush
      foot="Cada señal es texto real del canal. El clasificador las etiqueta; la decisión sigue siendo humana."
    >
      {senales.length === 0 ? (
        <div className="empty">Sin señales registradas en el período.</div>
      ) : (
        senales.map((s) => (
          <div key={s.id} className={`senal ${s.peso}`}>
            <i className="marca" />
            <div>
              <blockquote>{s.extracto}</blockquote>
              <div className="meta">
                {nombrePorCliente && <strong style={{ color: 'var(--text-2)' }}>{nombrePorCliente(s.clienteId)}</strong>}
                <span>{formatFechaHora(s.fechaAt)}</span>
              </div>
            </div>
            <Pill tone={TIPO[s.tipo]?.tone ?? 'plain'}>{TIPO[s.tipo]?.label ?? s.tipo}</Pill>
          </div>
        ))
      )}
    </Card>
  );
}
