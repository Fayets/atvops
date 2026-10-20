import { useEffect, useState } from 'react';
import Card from '../ui/Card.jsx';
import CtaReel from './CtaReel.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * Los reels del mes con lo que midió Instagram, en columnas.
 *
 * Una tabla y no tarjetas sueltas: lo que se hace acá es comparar un reel contra otro, y
 * para eso los números tienen que caer en la misma columna.
 *
 * Chats sale solo: cada persona que comentó la palabra del reel es un chat (la palabra la
 * detecta Ops del texto del reel o del comentario que más se repite). Sin ManyChat y sin
 * marcar nada a mano.
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
  const [filas, setFilas] = useState(items);
  useEffect(() => { setFilas(items); }, [items]);
  // Al corregir el CTA de un reel, la fila toma lo recontado sin recargar la página.
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

  const sub = [
    `${n(total('views'))} vistas`,
    `${n(total('reach'))} de alcance`,
    `${n(total('total_interactions'))} interacciones`,
    conPalabra
      ? `${n(total('chats'))} chats (${conPalabra} ${conPalabra === 1 ? 'reel' : 'reels'} con palabra)`
      : '0 chats',
  ].join(' · ');

  return (
    <Card
      title={`${filas.length} ${filas.length === 1 ? 'reel' : 'reels'}`}
      sub={sub}
      flush
      foot="Vistas son reproducciones; alcance son cuentas distintas. Instagram las refresca cada tres horas. Chats: personas que comentaron la palabra del reel, contadas solas de los comentarios. Si Ops se equivocó con el CTA de un reel, tocá su etiqueta para corregirlo."
    >
      <div className="reel-tabla" style={{ '--reel-cols': COLUMNAS.length + 1 }}>
        <div className="reel-fila cabecera">
          <span>Reel</span>
          <span>Fecha</span>
          {COLUMNAS.map((c) => <span key={c.id}>{c.label}</span>)}
          <span>Chats</span>
        </div>
        {filas.map((r) => (
          <div key={r.id} className="reel-fila">
            <span className="reel-pieza">
              {r.thumbnail
                ? <img src={r.thumbnail} alt="" loading="lazy" />
                : <span className="reel-sinfoto dim">—</span>}
              <span className="reel-titulo">
                {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.titulo}</a> : r.titulo}
                <CtaReel reelId={r.id} cta={r.cta} onCambio={(c) => actualizar(r.id, c)} />
              </span>
            </span>
            <span className="num dim">{dia(r.fecha)}</span>
            {COLUMNAS.map((c) => <span key={c.id} className="num">{n(r[c.id])}</span>)}
            <span className={`num${r.chats ? ' reel-chats' : ' dim'}`}
              title={r.cta?.esCta
                ? `Personas que comentaron "${r.keyword}"${r.chats ? '' : '. Instagram no devolvió comentarios de este reel.'}`
                : 'Este reel no tiene CTA'}>
              {/* 0 es "pidió la palabra y no contamos a nadie"; — es "no pidió nada". */}
              {r.chats ? n(r.chats) : (r.cta?.esCta ? '0' : '—')}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
