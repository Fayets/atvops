import Pill from '../ui/Pill.jsx';
import { formatFechaHora, formatValue } from '../../lib/format.js';

const ESTADO = {
  agendado: { tone: 'plain', label: 'agendado' },
  show: { tone: 'ok', label: 'show' },
  no_show: { tone: 'warn', label: 'no show' },
  cerrado: { tone: 'alert', label: 'cerrado' },
  perdido: { tone: 'off', label: 'perdido' },
};

const ORIGEN = {
  ads: 'Ads',
  organico: 'Orgánico',
  referido: 'Referido',
  outbound: 'Outbound',
};

/**
 * Modal de detalle de una llamada.
 * @param {{ llamada: object, onCerrar: () => void }} props
 */
export default function DetalleLlamada({ llamada, onCerrar }) {
  if (!llamada) return null;
  const est = ESTADO[llamada.estado] ?? ESTADO.agendado;

  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <div
        className="modal-card ventas-detalle"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Llamada con ${llamada.prospecto}`}
      >
        <header className="ventas-detalle-head">
          <div>
            <h3>{llamada.prospecto}</h3>
            <div className="dim" style={{ fontSize: 12.5, marginTop: 4 }}>
              {formatFechaHora(llamada.fechaAt)} · {llamada.closer}
            </div>
          </div>
          <button type="button" className="btn ghost" onClick={onCerrar}>
            Cerrar
          </button>
        </header>

        <div className="ventas-detalle-grid">
          <div>
            <div className="k">Estado</div>
            <Pill tone={est.tone} dot>
              {est.label}
            </Pill>
          </div>
          <div>
            <div className="k">Oferta</div>
            <div className="v">{llamada.oferta}</div>
          </div>
          <div>
            <div className="k">Origen</div>
            <div className="v">{ORIGEN[llamada.origen] ?? llamada.origen}</div>
          </div>
          <div>
            <div className="k">Setter</div>
            <div className="v">{llamada.setter || '—'}</div>
          </div>
          <div>
            <div className="k">Email</div>
            <div className="v">{llamada.email || '—'}</div>
          </div>
          <div>
            <div className="k">Teléfono</div>
            <div className="v">{llamada.telefono || '—'}</div>
          </div>
          {llamada.montoUsd != null && (
            <div>
              <div className="k">Cash</div>
              <div className="v num">{formatValue(llamada.montoUsd, 'usd')}</div>
            </div>
          )}
        </div>

        <div className="ventas-detalle-notas">
          <div className="k">Notas del setter</div>
          <p>{llamada.notasSetter || 'Sin notas cargadas.'}</p>
        </div>
      </div>
    </div>
  );
}
