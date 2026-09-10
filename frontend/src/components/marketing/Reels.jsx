import Card from '../ui/Card.jsx';
import { formatValue } from '../../lib/format.js';

/** Los reels del mes con lo que midió Instagram. */

const dia = (iso) =>
  (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }) : '—');
const n = (v) => formatValue(v ?? 0, 'count');

function Dato({ label, valor }) {
  return (
    <span className="ig-dato">
      <span className="num">{valor}</span>
      <span className="dim">{label}</span>
    </span>
  );
}

export default function Reels({ items }) {
  if (!items.length) {
    return (
      <Card title="Reels" sub="Nada publicado en este mes">
        <div className="empty">No hay reels publicados en el mes elegido.</div>
      </Card>
    );
  }
  const vistas = items.reduce((t, r) => t + (r.views ?? 0), 0);
  return (
    <Card
      title={`${items.length} ${items.length === 1 ? 'reel' : 'reels'}`}
      sub={`${n(vistas)} reproducciones en total`}
      flush
    >
      <div className="ig-lista">
        {items.map((r) => (
          <article key={r.id} className="ig-item">
            {r.thumbnail ? (
              <a href={r.url || '#'} target="_blank" rel="noreferrer" className="ig-thumb">
                <img src={r.thumbnail} alt="" loading="lazy" />
              </a>
            ) : <div className="ig-thumb ig-thumb--empty" />}
            <div className="ig-item-cuerpo">
              <div className="ig-item-cab">
                <span className="strong">{r.titulo}</span>
                <span className="dim">{dia(r.fecha)}</span>
              </div>
              <div className="ig-datos">
                <Dato label="vistas" valor={n(r.views)} />
                <Dato label="alcance" valor={n(r.reach)} />
                <Dato label="guardados" valor={n(r.saved)} />
                <Dato label="compartidos" valor={n(r.shares)} />
                <Dato label="likes" valor={n(r.likes)} />
                <Dato label="comentarios" valor={n(r.comments)} />
              </div>
              {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="dim ig-item-link">Ver en Instagram →</a>}
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}
