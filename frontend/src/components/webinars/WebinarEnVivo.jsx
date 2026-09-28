import { useEffect, useRef, useState } from 'react';
import Card from '../ui/Card.jsx';
import { getWebinarVivo } from '../../data/api.js';

/**
 * El webinar mientras está pasando.
 *
 * Los números salen de los avisos que Zoom manda cada vez que alguien entra o sale, no
 * de su API de métricas en vivo —esa pide plan Business—. Son los mismos datos por otra
 * puerta.
 *
 * Se pregunta cada diez segundos y solo mientras la tarjeta está abierta y la pestaña a
 * la vista: un webinar dura dos horas y nadie necesita que el navegador siga preguntando
 * desde una pestaña que quedó atrás.
 */

const CADA = 10000;

const hora = (iso) =>
  (iso ? new Date(`${iso.endsWith('Z') ? iso : `${iso}Z`}`).toLocaleTimeString('es-AR',
    { hour: '2-digit', minute: '2-digit' }) : '—');

const desdeHace = (iso) => {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(`${iso.endsWith('Z') ? iso : `${iso}Z`}`).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h ${min % 60} min`;
};

export default function WebinarEnVivo({ webinarId, onCerrar }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    let vivo = true;
    const leer = () => {
      if (document.hidden) return;
      getWebinarVivo(webinarId)
        .then((d) => { if (vivo) { setDatos(d); setError(''); } })
        .catch((e) => vivo && setError(e.message));
    };
    leer();
    timer.current = setInterval(leer, CADA);
    return () => { vivo = false; clearInterval(timer.current); };
  }, [webinarId]);

  const d = datos;
  const showRate = d?.registros ? Math.round((d.distintos / d.registros) * 100) : null;

  return (
    <Card
      title={
        <span className="wb-vivo-titulo">
          {d?.enVivo ? <span className="wb-vivo-punto" /> : null}
          {d?.enVivo ? 'En vivo ahora' : 'Webinar en vivo'}
        </span>
      }
      sub={
        d?.enVivo
          ? `Arrancó ${hora(d.arranqueAt)} · ${desdeHace(d.arranqueAt)}`
          : d?.finAt
            ? `Terminó ${hora(d.finAt)}`
            : 'Todavía no arrancó. Los números aparecen solos cuando empiece.'
      }
      actions={<button type="button" className="btn sm ghost" onClick={onCerrar}>Cerrar</button>}
    >
      {error ? <p className="error">{error}</p> : null}

      <div className="wb-vivo-kpis">
        <div><span className="num">{d?.conectados ?? '—'}</span><span className="dim">conectados ahora</span></div>
        <div><span className="num">{d?.picoConcurrentes ?? '—'}</span>
          <span className="dim">pico{d?.picoAt ? ` · ${hora(d.picoAt)}` : ''}</span></div>
        <div><span className="num">{d?.distintos ?? '—'}</span><span className="dim">entraron en total</span></div>
        <div><span className="num">{showRate == null ? '—' : `${showRate}%`}</span>
          <span className="dim">de {d?.registros ?? 0} registrados</span></div>
      </div>

      {d && d.eventos === 0 ? (
        <p className="dim" style={{ fontSize: 12.5 }}>
          Zoom todavía no mandó ningún aviso de este webinar. Si ya arrancó, revisá que el
          webhook esté activado en la app de Zoom y que apunte a este sistema.
        </p>
      ) : null}

      {d?.gente?.length ? (
        <div className="wb-vivo-gente">
          {d.gente.map((p) => (
            <div key={`${p.email || p.nombre}-${p.desdeAt}`} className="wb-vivo-persona">
              <span>{p.nombre || p.email || 'Sin nombre'}</span>
              <span className="dim">{desdeHace(p.desdeAt)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
