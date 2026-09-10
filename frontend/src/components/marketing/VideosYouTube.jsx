import Card from '../ui/Card.jsx';
import { SkeletonBlock } from '../ui/Loading.jsx';
import { formatValue } from '../../lib/format.js';

/** Los videos de YouTube del mes. */

const dia = (iso) =>
  (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }) : '—');
const n = (v) => formatValue(v ?? 0, 'count');

export default function VideosYouTube({ yt, cargando }) {
  if (cargando) return <SkeletonBlock height={300} />;
  const videos = yt?.publicaciones ?? [];
  if (!videos.length) {
    return (
      <Card title="YouTube" sub="Nada publicado en este mes">
        <div className="empty">No hay videos cargados en el mes elegido.</div>
      </Card>
    );
  }
  return (
    <Card
      title={`${videos.length} ${videos.length === 1 ? 'video' : 'videos'}`}
      sub={`${n(yt.vistas)} vistas · ${n(yt.chats)} chats abiertos`}
      flush
    >
      <div className="ig-lista">
        {videos.map((v) => (
          <article key={v.url ?? v.titulo} className="ig-item">
            {v.thumbnail ? (
              <a href={v.url || '#'} target="_blank" rel="noreferrer" className="ig-thumb ancho">
                <img src={v.thumbnail} alt="" loading="lazy" />
              </a>
            ) : <div className="ig-thumb ancho ig-thumb--empty" />}
            <div className="ig-item-cuerpo">
              <div className="ig-item-cab">
                <span className="strong">{v.titulo}</span>
                <span className="dim">{dia(v.fecha)}</span>
              </div>
              <div className="ig-datos">
                <span className="ig-dato"><span className="num">{n(v.vistas)}</span><span className="dim">vistas</span></span>
                <span className="ig-dato"><span className="num">{n(v.likes)}</span><span className="dim">likes</span></span>
                <span className="ig-dato"><span className="num">{v.ctr ?? 0}%</span><span className="dim">CTR</span></span>
                <span className="ig-dato"><span className="num">{n(v.chats)}</span><span className="dim">chats</span></span>
              </div>
              {v.url && <a href={v.url} target="_blank" rel="noreferrer" className="dim ig-item-link">Ver en YouTube →</a>}
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}
