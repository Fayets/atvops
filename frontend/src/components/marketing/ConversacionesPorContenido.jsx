import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import SourceTag from '../ui/SourceTag.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * Qué contenido abrió conversaciones, y cuántas.
 *
 * Cuando alguien comenta la palabra de un reel, ManyChat le abre el DM en Instagram y
 * queda registrado con esa palabra. Contar esos registros es contar las conversaciones:
 * nadie las reporta a mano, salen solas.
 */

const fecha = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—');

export default function ConversacionesPorContenido({ marketing }) {
  const conv = marketing?.conversaciones ?? {};
  const publicaciones = (marketing?.contenido?.publicaciones ?? [])
    .map((p) => ({ ...p, conversaciones: p.conversaciones ?? 0 }))
    .sort((a, b) => b.conversaciones - a.conversaciones || b.reproducciones - a.reproducciones);

  const conPalabra = publicaciones.filter((p) => p.keyword);
  const sinPalabra = publicaciones.filter((p) => !p.keyword);
  const atribuidas = conPalabra.reduce((t, p) => t + p.conversaciones, 0);

  return (
    <Card
      title="Qué contenido abre conversaciones"
      sub={`${formatValue(conv.total ?? 0, 'count')} conversaciones abiertas este mes · ${formatValue(atribuidas, 'count')} vienen de un reel del mes`}
      actions={<SourceTag sourceId="mkt_crm" updatedAt={marketing?.syncAt} />}
      flush
      foot={
        sinPalabra.length
          ? `${sinPalabra.length} ${sinPalabra.length === 1 ? 'reel no tiene' : 'reels no tienen'} palabra clave cargada: sin eso no se puede saber qué conversaciones trajo.`
          : 'Todos los reels del mes tienen su palabra clave cargada.'
      }
    >
      {publicaciones.length === 0 ? (
        <div className="empty">No hay reels publicados este mes.</div>
      ) : (
        <div className="conv-tabla">
          <div className="conv-fila cabecera">
            <span>Fecha</span>
            <span>Reel</span>
            <span>Palabra</span>
            <span>Reproducciones</span>
            <span>Conversaciones</span>
          </div>
          {publicaciones.map((p) => (
            <div key={p.url ?? p.titulo} className="conv-fila">
              <span className="num dim">{fecha(p.fecha)}</span>
              <span className="conv-titulo">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer">{p.titulo}</a>
                ) : (
                  p.titulo
                )}
              </span>
              <span className="conv-palabra">
                {p.keyword ? <code>{p.keyword}</code> : <Pill tone="warn" dot>sin palabra</Pill>}
              </span>
              <span className="num dim">{formatValue(p.reproducciones, 'count')}</span>
              <span className="num conv-valor">
                {p.keyword ? formatValue(p.conversaciones, 'count') : '—'}
                {p.keyword && p.conversacionesTotales > p.conversaciones ? (
                  <span className="dim"> · {formatValue(p.conversacionesTotales, 'count')} de siempre</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
