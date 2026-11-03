import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../ui/Card.jsx';
import CtaReel from './CtaReel.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * Los reels del mes, uno por tarjeta vertical: la pieza como se publicó y debajo lo que midió
 * Instagram.
 *
 * Al pie de cada una, la calidad de lo que trajo: qué parte de los que comentaron califica
 * como lead, según Audiencia. El alcance dice cuánta gente lo vio; eso dice qué gente era.
 *
 * Chats sale solo: cada persona que comentó la palabra del reel es un chat (la palabra la
 * detecta Ops del texto del reel o del comentario que más se repite). Sin ManyChat y sin
 * marcar nada a mano.
 */

const dia = (iso) =>
  (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—');
const n = (v) => formatValue(v ?? 0, 'count');
const pct = (v) => `${String(v).replace('.', ',')}%`;

/** Qué parte de los que comentaron este reel califica como lead. Lleva a sus perfiles. */
function Calidad({ reelId, a }) {
  const destino = `/marketing/audiencia?reel=${reelId}`;
  if (!a?.analizados) {
    return (
      <Link to={destino} className="reel-calidad sin" title="Analizar a los que comentaron este reel">
        <span className="lab-k">Calificados</span>
        <b>{a?.personas ? `${n(a.personas)} sin analizar` : 'Sin analizar'}</b>
      </Link>
    );
  }
  return (
    <Link to={destino} className="reel-calidad" title="Ver los perfiles de este reel">
      <span className="reel-calidad-fila">
        <span className="lab-k">Calificados</span>
        <b className="num">{pct(a.pct)}</b>
      </span>
      <span className="dim num">{n(a.calificados)} de {n(a.analizados)} perfiles</span>
    </Link>
  );
}

export default function Reels({ items }) {
  const [filas, setFilas] = useState(items);
  useEffect(() => { setFilas(items); }, [items]);
  // Al corregir el CTA de un reel, la tarjeta toma lo recontado sin recargar la página.
  const actualizar = (id, cta) => setFilas((fs) => fs.map((r) => (r.id === id
    ? { ...r, cta, chats: cta?.chats ?? 0, keyword: cta?.palabra ?? '' } : r)));

  if (!filas.length) {
    return (
      <Card title="Reels" sub="Nada publicado en este mes">
        <div className="empty">No hay reels publicados en el mes elegido.</div>
      </Card>
    );
  }

  const total = (campo) => filas.reduce((t, r) => t + (r[campo] ?? 0), 0);
  // Los que pidieron una palabra, tengan o no chats contados: un reel con CTA del que
  // Instagram no devuelve comentarios igual pidió que le escriban.
  const conPalabra = filas.filter((r) => r.cta?.esCta).length;
  const analizados = filas.reduce((t, r) => t + (r.audiencia?.analizados ?? 0), 0);
  const calificados = filas.reduce((t, r) => t + (r.audiencia?.calificados ?? 0), 0);

  const sub = [
    `${n(total('views'))} vistas`,
    `${n(total('reach'))} de alcance`,
    `${n(total('total_interactions'))} interacciones`,
    conPalabra
      ? `${n(total('chats'))} chats (${conPalabra} ${conPalabra === 1 ? 'reel' : 'reels'} con palabra)`
      : '0 chats',
    analizados ? `${pct(Math.round((calificados / analizados) * 1000) / 10)} calificados sobre ${n(analizados)} perfiles` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Card title={`${filas.length} ${filas.length === 1 ? 'reel' : 'reels'}`} sub={sub} flush>
      <div className="reel-grilla">
        {filas.map((r) => (
          <article key={r.id} className="reel-tarjeta">
            <div className="reel-foto">
              {r.thumbnail
                ? <img src={r.thumbnail} alt="" loading="lazy" />
                : <span className="reel-foto-sin dim">Reel</span>}
              <span className="reel-dia num">{dia(r.fecha)}</span>
            </div>
            <h3 className="reel-tit">
              {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.titulo}</a> : r.titulo}
            </h3>
            <CtaReel reelId={r.id} cta={r.cta} onCambio={(c) => actualizar(r.id, c)} />
            {/* Todos los números en la misma grilla y con la misma altura: así una tarjeta
                con el título en dos líneas no desalinea la fila entera. */}
            <dl className="reel-stats">
              <div><dt className="lab-k">Vistas</dt><dd className="num">{n(r.views)}</dd></div>
              <div><dt className="lab-k">Alcance</dt><dd className="num">{n(r.reach)}</dd></div>
              <div><dt className="lab-k">Interac.</dt><dd className="num">{n(r.total_interactions)}</dd></div>
              <div>
                <dt className="lab-k">Chats</dt>
                {/* 0 es "pidió la palabra y no contamos a nadie"; — es "no pidió nada". */}
                <dd className={`num${r.chats ? ' reel-chats' : ' dim'}`}
                  title={r.cta?.esCta
                    ? `Personas que comentaron "${r.keyword}"${r.chats ? '' : '. Instagram no devolvió comentarios de este reel.'}`
                    : 'Este reel no tiene CTA'}>
                  {r.chats ? n(r.chats) : (r.cta?.esCta ? '0' : '—')}
                </dd>
              </div>
            </dl>
            <dl className="reel-stats chicas">
              <div><dt className="lab-k">Likes</dt><dd className="num">{n(r.likes)}</dd></div>
              <div><dt className="lab-k">Coment.</dt><dd className="num">{n(r.comments)}</dd></div>
              <div><dt className="lab-k">Comp.</dt><dd className="num">{n(r.shares)}</dd></div>
              <div><dt className="lab-k">Guard.</dt><dd className="num">{n(r.saved)}</dd></div>
            </dl>
            <Calidad reelId={r.id} a={r.audiencia} />
          </article>
        ))}
      </div>
    </Card>
  );
}
