import Card from '../ui/Card.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * Los reels del mes con lo que midió Instagram, en columnas.
 *
 * Una tabla y no tarjetas sueltas: lo que se hace acá es comparar un reel contra otro, y
 * para eso los números tienen que caer en la misma columna.
 */

const dia = (iso) =>
  (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—');
const n = (v) => formatValue(v ?? 0, 'count');

const COLUMNAS = [
  { id: 'views', label: 'Vistas' },
  { id: 'reach', label: 'Alcance' },
  { id: 'likes', label: 'Likes' },
  { id: 'comments', label: 'Coment.' },
  { id: 'shares', label: 'Comp.' },
  { id: 'saved', label: 'Guard.' },
  { id: 'total_interactions', label: 'Interac.' },
];

export default function Reels({ items }) {
  if (!items.length) {
    return (
      <Card title="Reels" sub="Nada publicado en este mes">
        <div className="empty">No hay reels publicados en el mes elegido.</div>
      </Card>
    );
  }

  const total = (campo) => items.reduce((t, r) => t + (r[campo] ?? 0), 0);
  const conChats = items.some((r) => r.conversaciones != null);

  return (
    <Card
      title={`${items.length} ${items.length === 1 ? 'reel' : 'reels'}`}
      sub={`${n(total('views'))} vistas · ${n(total('reach'))} de alcance · ${n(total('total_interactions'))} interacciones`}
      flush
      foot="Vistas son reproducciones; alcance son cuentas distintas. Instagram las refresca cada tres horas."
    >
      <div className="reel-tabla" style={{ '--reel-cols': COLUMNAS.length + (conChats ? 1 : 0) }}>
        <div className="reel-fila cabecera">
          <span>Reel</span>
          <span>Fecha</span>
          {COLUMNAS.map((c) => <span key={c.id}>{c.label}</span>)}
          {conChats && <span>Chats</span>}
        </div>
        {items.map((r) => (
          <div key={r.id} className="reel-fila">
            <span className="reel-pieza">
              {r.thumbnail
                ? <img src={r.thumbnail} alt="" loading="lazy" />
                : <span className="reel-sinfoto dim">—</span>}
              <span className="reel-titulo">
                {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.titulo}</a> : r.titulo}
                {r.keyword && <code className="reel-keyword">{r.keyword}</code>}
              </span>
            </span>
            <span className="num dim">{dia(r.fecha)}</span>
            {COLUMNAS.map((c) => <span key={c.id} className="num">{n(r[c.id])}</span>)}
            {conChats && (
              <span className={`num${r.conversaciones ? ' reel-chats' : ' dim'}`}>{n(r.conversaciones)}</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
