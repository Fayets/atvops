/**
 * De dónde sale un número: las llamadas que lo componen.
 *
 * Lo usan la pantalla del closer y el reporte mensual. Vive aparte porque un número que
 * no se puede abrir obliga a creerle al sistema, y acá se trata justamente de poder
 * discutirlo con el que lo mira.
 */

const fecha = (iso) => (iso
  ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
  : '—');

export const ESTADO_TEXTO = {
  cierre: 'venta', show: 'con show', no_show: 'no show', sin_reportar: 'sin cargar',
  agendado: 'por venir', descartada: 'descartada', reprogramada: 'se movió',
  cancelada: 'cancelada',
  sin_crm: 'solo calendario', duplicada: 'duplicada',
};

export default function DetalleMetrica({ titulo, explicacion, llamadas = [], columna,
                                         encabezado, onCerrar }) {
  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <div className="modal-card detalle-metrica" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label={titulo}>
        <header>
          <div>
            <h3>{titulo}</h3>
            <p className="dim">{explicacion}</p>
          </div>
          <button type="button" className="btn ghost" onClick={onCerrar}>Cerrar</button>
        </header>
        {llamadas.length === 0 ? (
          <div className="empty">No hay llamadas en este número.</div>
        ) : (
          <div className="detalle-lista">
            <div className={`detalle-fila cabecera${columna ? '' : ' sin-valor'}`}>
              <span>Fecha</span>
              <span>Prospecto</span>
              <span>Estado</span>
              {columna && <span>{encabezado ?? 'Detalle'}</span>}
            </div>
            {llamadas.map((l) => (
              <div key={l.eventoId || l.id} className={`detalle-fila${columna ? '' : ' sin-valor'}`}>
                <span className="num dim">{fecha(l.fechaAt)}</span>
                <span className="strong">{l.prospecto}</span>
                <span className="dim">{ESTADO_TEXTO[l.estado] ?? l.estado}</span>
                {columna && <span className="valor">{columna(l)}</span>}
              </div>
            ))}
          </div>
        )}
        <footer className="dim">
          {llamadas.length} {llamadas.length === 1 ? 'llamada' : 'llamadas'} · base de ATV Ops
        </footer>
      </div>
    </div>
  );
}
