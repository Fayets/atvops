import Card from '../ui/Card.jsx';
import { SkeletonBlock } from '../ui/Loading.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * Los videos del canal, en columnas.
 *
 * Salen de la base de ATV Ops: el canal se sincroniza solo cada tres horas con la clave
 * propia. El CTR y la retención no están porque la API de YouTube no los da: eso vive
 * únicamente en Studio.
 */

const dia = (iso) =>
  (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—');
const n = (v) => formatValue(v ?? 0, 'count');

/** 1986 segundos son 33:06. Un short y un video de media hora no se leen igual. */
const duracion = (seg) => {
  if (!seg) return '—';
  const m = Math.floor(seg / 60);
  const s = String(seg % 60).padStart(2, '0');
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

export default function VideosYouTube({ yt, cargando }) {
  if (cargando) return <SkeletonBlock height={300} />;
  const videos = yt?.videos ?? [];
  const t = yt?.totales ?? {};

  if (!videos.length) {
    return (
      <Card title="YouTube" sub="Nada publicado en este mes">
        <div className="empty">
          {yt?.conectado === false
            ? 'Falta la clave del canal en ATV Ops: se carga en Sistemas.'
            : 'No hay videos publicados en el mes elegido.'}
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={`${videos.length} ${videos.length === 1 ? 'video' : 'videos'}`}
      sub={`${n(t.vistas)} vistas · ${n(t.vistasPromedio)} de promedio · ${n(t.likes)} likes`}
      flush
      foot="Un video sigue sumando vistas durante meses: los números se refrescan en cada pasada."
    >
      <div className="reel-tabla" style={{ '--reel-cols': 4 }}>
        <div className="reel-fila cabecera">
          <span>Video</span>
          <span>Fecha</span>
          <span>Duración</span>
          <span>Vistas</span>
          <span>Likes</span>
          <span>Coment.</span>
        </div>
        {videos.map((v) => (
          <div key={v.id} className="reel-fila">
            <span className="reel-pieza">
              {v.thumbnail
                ? <img className="ancho" src={v.thumbnail} alt="" loading="lazy" />
                : <span className="reel-sinfoto dim">—</span>}
              <span className="reel-titulo">
                {v.url ? <a href={v.url} target="_blank" rel="noreferrer">{v.titulo}</a> : v.titulo}
                {v.short && <code className="reel-keyword">short</code>}
              </span>
            </span>
            <span className="num dim">{dia(v.fecha)}</span>
            <span className="num dim">{duracion(v.duracionSeg)}</span>
            <span className="num">{n(v.vistas)}</span>
            <span className="num">{n(v.likes)}</span>
            <span className="num">{n(v.comentarios)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
