import { Link } from 'react-router-dom';
import { formatFecha } from '../../lib/format.js';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';

const TIPO = {
  primer_resultado: { label: 'win', tone: 'ok' },
  implementacion: { label: 'impl.', tone: 'ok' },
  hito: { label: 'hito', tone: 'ok' },
  senal_upsell: { label: 'upsell', tone: 'ok' },
  soporte: { label: 'soporte', tone: 'plain' },
  queja: { label: 'queja', tone: 'alert' },
  riesgo_churn: { label: 'churn', tone: 'alert' },
  silencio: { label: 'silencio', tone: 'alert' },
};

/**
 * Vista rápida de señales del canal.
 * @param {{
 *   senales: import('../../data/types.js').SenalTranscript[],
 *   titulo?: string,
 *   nombrePorCliente?: (id: string) => string,
 *   compacto?: boolean,
 *   max?: number,
 * }} props
 */
export default function Senales({
  senales,
  titulo = 'Señales',
  nombrePorCliente,
  compacto = false,
  max = compacto ? 5 : 20,
}) {
  const items = [...senales]
    .sort((a, b) => new Date(b.fechaAt) - new Date(a.fechaAt))
    .slice(0, max);

  return (
    <Card
      title={titulo}
      sub={`${senales.length} señales · vista rápida`}
      flush
      className={compacto ? 'senales-card compacto' : undefined}
      foot={compacto ? null : 'Texto real del canal. El clasificador etiqueta; la decisión es humana.'}
    >
      {items.length === 0 ? (
        <div className="empty">Sin señales recientes.</div>
      ) : (
        items.map((s) => {
          const nombre = nombrePorCliente?.(s.clienteId);
          const cuerpo = (
            <>
              <Pill tone={TIPO[s.tipo]?.tone ?? 'plain'} dot>
                {TIPO[s.tipo]?.label ?? s.tipo}
              </Pill>
              {nombre && <span className="who">{nombre}</span>}
              <span className="q">{s.extracto}</span>
              <span className="right">
                <span className="dim" style={{ fontSize: 11 }}>
                  {formatFecha(s.fechaAt)}
                </span>
              </span>
            </>
          );
          return s.clienteId ? (
            <Link key={s.id} to={`/fulfillment/clientes/${s.clienteId}`} className="lista-item senal-rapida">
              {cuerpo}
            </Link>
          ) : (
            <div key={s.id} className="lista-item senal-rapida">
              {cuerpo}
            </div>
          );
        })
      )}
    </Card>
  );
}
