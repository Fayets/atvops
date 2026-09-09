import Pill from '../ui/Pill.jsx';
import { formatFechaHora, formatValue } from '../../lib/format.js';
import { ESTADO } from './CalendarioEquipo.jsx';

/**
 * Modal de detalle de una llamada.
 * @param {{ llamada: object, onCerrar: () => void }} props
 */
export default function DetalleLlamada({ llamada, onCerrar }) {
  if (!llamada) return null;
  const est = ESTADO[llamada.estado] ?? ESTADO.pendiente;
  const externos = (llamada.invitados ?? []).filter((i) => !i.equipo);

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
              {formatFechaHora(llamada.fechaAt)}{llamada.titulo && llamada.titulo !== llamada.prospecto ? ` · ${llamada.titulo}` : ''}
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
          {llamada.facturacion && (
            <div>
              <div className="k">Factura hoy</div>
              <div className="v">{llamada.facturacion}</div>
            </div>
          )}
          <div>
            <div className="k">Email</div>
            <div className="v">{llamada.email || '—'}</div>
          </div>
          <div>
            <div className="k">Teléfono</div>
            <div className="v">
              {llamada.telefono
                ? <a href={`https://wa.me/${llamada.telefono.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">{llamada.telefono}</a>
                : '—'}
            </div>
          </div>
          {llamada.instagram && (
            <div>
              <div className="k">Instagram</div>
              <div className="v">
                <a href={`https://instagram.com/${llamada.instagram}`} target="_blank" rel="noreferrer">@{llamada.instagram}</a>
              </div>
            </div>
          )}
          {llamada.duracionMin && (
            <div>
              <div className="k">Duración</div>
              <div className="v">{llamada.duracionMin} min</div>
            </div>
          )}
          {(llamada.zoomUrl || llamada.meetUrl) && (
            <div>
              <div className="k">Videollamada</div>
              <div className="v">
                <a href={llamada.zoomUrl || llamada.meetUrl} target="_blank" rel="noreferrer">
                  {llamada.zoomUrl ? 'Abrir Zoom' : 'Abrir Meet'}
                </a>
              </div>
            </div>
          )}
          {externos.length > 0 && (
            <div>
              <div className="k">Invitados</div>
              <div className="v">{externos.map((i) => i.email || i.nombre).join(', ')}</div>
            </div>
          )}
          {llamada.montoUsd != null && (
            <div>
              <div className="k">Cash</div>
              <div className="v num">{formatValue(llamada.montoUsd, 'usd')}</div>
            </div>
          )}
        </div>

        {(llamada.respuestas ?? []).length > 0 ? (
          <div className="ventas-detalle-notas">
            <div className="k">Formulario de Calendly</div>
            <dl className="ventas-detalle-qa">
              {llamada.respuestas.map((r, i) => (
                <div key={i}>
                  <dt>{r.pregunta}</dt>
                  <dd>{r.respuesta}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <div className="ventas-detalle-notas">
            <div className="k">Notas</div>
            <p>{llamada.notasSetter || 'El evento no trae formulario cargado.'}</p>
          </div>
        )}
        {llamada.url && (
          <div className="ventas-detalle-notas">
            <a href={llamada.url} target="_blank" rel="noreferrer">Abrir en Google Calendar</a>
          </div>
        )}
      </div>
    </div>
  );
}
