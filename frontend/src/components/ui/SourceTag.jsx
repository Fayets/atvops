import { SOURCES } from '../../data/sources.js';
import { hace } from '../../lib/format.js';

/**
 * Procedencia de un dato: de qué fuente sale, en qué estado está y hace cuánto
 * se actualizó. Es el detalle que hace visible qué se carga a mano.
 * @param {{ sourceId: import('../../data/types.js').SourceId, updatedAt?: string | null,
 *           conNombre?: boolean }} props
 */
export default function SourceTag({ sourceId, updatedAt, conNombre = true }) {
  // Un id desconocido no puede tumbar la pantalla: se muestra como sin conectar.
  const fuente = SOURCES[sourceId] ?? { id: sourceId, nombre: sourceId, status: 'sin_conectar', lastSyncAt: null };
  const sync = updatedAt ?? fuente.lastSyncAt;
  const etiqueta = {
    conectada: 'automatizado',
    manual: 'carga manual',
    sin_conectar: 'sin conectar',
  }[fuente.status];

  return (
    <span
      className="source-tag"
      title={`${fuente.nombre} — ${etiqueta}${sync ? ` · actualizado ${hace(sync)}` : ''}`}
    >
      <i className={`dot ${fuente.status}`} />
      {conNombre && <span>{fuente.nombre}</span>}
      {sync && <span>· {hace(sync)}</span>}
    </span>
  );
}
