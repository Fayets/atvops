import { Link } from 'react-router-dom';
import { formatFecha, formatValue, hace } from '../../lib/format.js';
import { SEMAFORO } from '../../lib/scoring.js';
import Sparkline from '../charts/Sparkline.jsx';

const CAT_LABEL = {
  boost: 'Boost',
  advantage: 'Advantage',
  avanzados: 'Avanzados',
  principiantes: 'Principiantes',
  mentoria: 'Mentoría',
};

/**
 * Tarjeta de cliente con señales reales del canal Discord.
 * @param {{ cliente: import('../../data/types.js').Cliente & { salud: import('../../data/types.js').Salud },
 *           serie: number[] }} props
 */
export default function ClienteCard({ cliente, serie }) {
  const { salud, engagement } = cliente;
  const semaforo = SEMAFORO[salud.semaforo];
  const cat = CAT_LABEL[cliente.categoria] ?? cliente.categoria ?? '—';

  return (
    <Link to={`/fulfillment/clientes/${cliente.id}`} className={`cliente-card ${salud.semaforo}`}>
      <div className="cliente-top">
        <div className="cliente-identidad">
          <h3>{cliente.nombre}</h3>
          <div className="meta" title={cat}>
            {cat}
          </div>
        </div>
        <span className={`score-badge ${salud.semaforo}`} title={`${semaforo.label} — score ${salud.score}/100`}>
          {salud.score}
        </span>
      </div>

      <Sparkline data={serie} height={28} color={semaforo.color} />

      <dl className="cliente-datos">
        <div className="cliente-dato">
          <dt>Último mensaje</dt>
          <dd style={{ color: engagement.diasSinMensaje >= 5 ? 'var(--warn)' : undefined }}>
            {hace(cliente.ultimaActividadAt)}
          </dd>
        </div>
        <div className="cliente-dato">
          <dt>Msg / sem</dt>
          <dd>{formatValue(engagement.mensajesClienteSemana ?? 0, 'ratio')}</dd>
        </div>
        <div className="cliente-dato">
          <dt>Msgs</dt>
          <dd className="num">{formatValue(cliente.mensajes ?? 0, 'count')}</dd>
        </div>
        <div className="cliente-dato">
          <dt>Entrada</dt>
          <dd>{formatFecha(cliente.entradaAt)}</dd>
        </div>
      </dl>
    </Link>
  );
}
