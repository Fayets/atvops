import { Link } from 'react-router-dom';
import { formatFecha, hace } from '../../lib/format.js';
import { SEMAFORO } from '../../lib/scoring.js';
import Pill from '../ui/Pill.jsx';

const CAT_LABEL = {
  boost: 'Boost',
  advantage: 'Advantage',
  avanzados: 'Avanzados',
  principiantes: 'Principiantes',
  mentoria: 'Mentoría',
};

/**
 * @param {{
 *   cliente: object,
 *   pago?: { label: string, tone: string } | null,
 * }} props
 */
export default function ClienteCard({ cliente, pago = null }) {
  const { salud, engagement, ficha, activacion } = cliente;
  const semaforo = SEMAFORO[salud.semaforo];
  const cat = CAT_LABEL[cliente.categoria] ?? cliente.categoria ?? null;
  const faseLabel = cliente.fase?.label || ficha?.faseLabel || null;
  const resumen = (ficha?.resumen || '').trim();
  const negocioHint =
    activacion?.activado && activacion?.descripcion
      ? activacion.descripcion
      : ficha?.upsellMotivo || null;

  return (
    <Link to={`/fulfillment/clientes/${cliente.id}`} className={`cliente-card ${salud.semaforo}`}>
      <div className="cliente-top">
        <div className="cliente-identidad">
          <h3>{cliente.nombre}</h3>
          <div className="cliente-tags">
            {cat && <span className="cliente-tag">{cat}</span>}
            {faseLabel && (
              <span className={`cliente-tag fase-pill fase-${cliente.fase?.id || ficha?.fase || 'onboarding'}`}>
                {faseLabel}
              </span>
            )}
            {activacion?.activado ? (
              <span className="cliente-tag ok">Activado</span>
            ) : (
              <span className="cliente-tag warn">Sin activar</span>
            )}
            {pago && (
              <Pill tone={pago.tone} dot>
                {pago.label}
              </Pill>
            )}
          </div>
        </div>
        <span
          className={`score-badge ${salud.semaforo}`}
          title={`${semaforo.label} — score ${salud.score}/100`}
        >
          {salud.score}
        </span>
      </div>

      {resumen ? (
        <p className="cliente-quien" title={resumen}>
          {resumen}
        </p>
      ) : (
        <p className="cliente-quien dim">Sin ficha de onboarding todavía.</p>
      )}

      {negocioHint && (
        <p className="cliente-negocio dim" title={negocioHint}>
          {negocioHint}
        </p>
      )}

      <dl className="cliente-datos">
        <div className="cliente-dato">
          <dt>Último mensaje</dt>
          <dd style={{ color: engagement.diasSinMensaje >= 5 ? 'var(--warn)' : undefined }}>
            {hace(cliente.ultimaActividadAt)}
          </dd>
        </div>
        <div className="cliente-dato">
          <dt>Entrada</dt>
          <dd>{formatFecha(cliente.entradaAt)}</dd>
        </div>
      </dl>
    </Link>
  );
}
