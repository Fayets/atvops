import { useState } from 'react';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import Tabs from '../ui/Tabs.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * Reels, historias y YouTube, cada uno por separado.
 *
 * Reels e historias salen de Instagram con el token propio y se sincronizan cada tres
 * horas: las historias duran un día allá, así que traerlas seguido es lo único que
 * permite mirar una secuencia entera después.
 */

const dia = (iso) =>
  (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }) : '—');
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '');
const n = (v) => formatValue(v ?? 0, 'count');

function Dato({ label, valor }) {
  return (
    <span className="ig-dato">
      <span className="num">{valor}</span>
      <span className="dim">{label}</span>
    </span>
  );
}

function Reels({ items, conversacionesPorPalabra }) {
  if (!items.length) return <div className="empty">No hay reels publicados en este mes.</div>;
  return (
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
            {r.url && (
              <a href={r.url} target="_blank" rel="noreferrer" className="dim ig-item-link">Ver en Instagram →</a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function Secuencias({ items }) {
  const [abierta, setAbierta] = useState(items[0]?.fecha ?? null);
  if (!items.length) {
    return (
      <div className="empty">
        Todavía no se guardó ninguna secuencia. Instagram borra las historias a las 24 horas:
        se guardan las que estén activas en cada sincronización.
      </div>
    );
  }
  return (
    <div className="ig-secuencias">
      {items.map((s) => {
        const abierto = abierta === s.fecha;
        return (
          <div key={s.fecha} className={`ig-secuencia-dia${abierto ? ' abierta' : ''}`}>
            <button type="button" className="ig-secuencia-cab" onClick={() => setAbierta(abierto ? null : s.fecha)}>
              <span className="strong">{dia(s.fecha)}</span>
              <span className="ig-datos">
                <Dato label="piezas" valor={s.piezas} />
                <Dato label="vistas" valor={n(s.vistas)} />
                <Dato label="respuestas" valor={n(s.respuestas)} />
                {s.retencion != null && (
                  <Pill tone={s.retencion >= 70 ? 'ok' : s.retencion >= 50 ? 'warn' : 'alert'} dot>
                    {s.retencion}% llega al final
                  </Pill>
                )}
              </span>
            </button>
            {abierto && (
              <ol className="ig-secuencia-piezas">
                {s.historias.map((h, i) => (
                  <li key={h.id} className="ig-pieza">
                    <span className="ig-seq-n num dim">{i + 1}</span>
                    {h.thumbnail ? (
                      <a href={h.url || '#'} target="_blank" rel="noreferrer" className="ig-thumb chico">
                        <img src={h.thumbnail} alt="" loading="lazy" />
                      </a>
                    ) : <div className="ig-thumb chico ig-thumb--empty" />}
                    <div className="ig-item-cuerpo">
                      <div className="dim">{hora(h.fecha)}</div>
                      <div className="ig-datos">
                        <Dato label="vistas" valor={n(h.views)} />
                        <Dato label="alcance" valor={n(h.reach)} />
                        <Dato label="respuestas" valor={n(h.replies)} />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}

function YouTube({ yt }) {
  const videos = yt?.publicaciones ?? [];
  if (!videos.length) {
    return <div className="empty">No hay videos cargados en este mes.</div>;
  }
  return (
    <div className="ig-lista">
      {videos.map((v) => (
        <article key={v.url ?? v.titulo} className="ig-item">
          <div className="ig-item-cuerpo">
            <div className="ig-item-cab">
              <span className="strong">{v.titulo}</span>
              <span className="dim">{dia(v.fecha)}</span>
            </div>
            <div className="ig-datos">
              <Dato label="vistas" valor={n(v.vistas)} />
              <Dato label="likes" valor={n(v.likes)} />
              <Dato label="CTR" valor={`${v.ctr ?? 0}%`} />
              <Dato label="chats" valor={n(v.chats)} />
            </div>
            {v.url && <a href={v.url} target="_blank" rel="noreferrer" className="dim ig-item-link">Ver en YouTube →</a>}
          </div>
        </article>
      ))}
    </div>
  );
}

/**
 * @param {{ instagram: object, youtube: object, sincronizando: boolean,
 *           onSincronizar: () => void }} props
 */
export default function ContenidoInstagram({ instagram, youtube, sincronizando, onSincronizar }) {
  const [pestania, setPestania] = useState('reels');
  const reels = instagram?.reels ?? [];
  const secuencias = instagram?.secuencias ?? [];
  const videos = youtube?.publicaciones ?? [];
  const estado = instagram?.estado ?? {};

  const opciones = [
    { value: 'reels', label: `Reels (${reels.length})` },
    { value: 'historias', label: `Historias (${secuencias.length})` },
    { value: 'youtube', label: `YouTube (${videos.length})` },
  ];

  return (
    <Card
      title="Contenido publicado"
      sub={estado.ultimaAt
        ? `Instagram se trae solo cada ${estado.cadaHoras ?? 3} horas · última vez ${new Date(estado.ultimaAt).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
        : 'Instagram todavía no se sincronizó'}
      actions={
        <button className="btn sm" onClick={onSincronizar} disabled={sincronizando}>
          <span className={`recargar-icono${sincronizando ? ' girando' : ''}`}>⟳</span>
          {sincronizando ? ' Trayendo…' : ' Traer ahora'}
        </button>
      }
      flush
      foot="Las historias duran 24 horas en Instagram: acá quedan guardadas para siempre."
    >
      <div className="ig-tabs">
        <Tabs value={pestania} onChange={setPestania} options={opciones} />
      </div>
      {pestania === 'reels' && <Reels items={reels} />}
      {pestania === 'historias' && <Secuencias items={secuencias} />}
      {pestania === 'youtube' && <YouTube yt={youtube} />}
    </Card>
  );
}
