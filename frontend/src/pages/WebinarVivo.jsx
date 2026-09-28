import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import LineArea from '../components/charts/LineArea.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { getWebinar, getWebinarVivo } from '../data/api.js';

/**
 * El webinar mientras pasa.
 *
 * Los números salen de los avisos que Zoom manda cada vez que alguien entra o sale, no
 * de su API de métricas en vivo —esa pide plan Business—. Son los mismos datos por otra
 * puerta.
 *
 * Se pregunta cada diez segundos y solo con la pestaña a la vista: un webinar dura dos
 * horas y no hace falta que una pestaña olvidada siga preguntando.
 *
 * La curva es lo que de verdad se mira en vivo. Un número de conectados dice cuántos
 * hay; la curva dice si se están yendo, que es lo único sobre lo que se puede hacer
 * algo mientras todavía está pasando.
 */

const CADA = 10000;

const utc = (iso) => (iso ? new Date(iso.endsWith('Z') ? iso : `${iso}Z`) : null);

const hora = (iso) =>
  (utc(iso)?.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) ?? '—');

const desdeHace = (iso) => {
  const d = utc(iso);
  if (!d) return '';
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
};

function Kpi({ label, valor, nota, tono }) {
  return (
    <article className="vivo-kpi">
      <span className="vivo-kpi-label">{label}</span>
      <span className={`vivo-kpi-valor num${tono ? ` zona-${tono}` : ''}`}>{valor}</span>
      <span className="vivo-kpi-nota">{nota}</span>
    </article>
  );
}

export default function WebinarVivo() {
  const { id } = useParams();
  const [webinar, setWebinar] = useState(null);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    getWebinar(id).then(setWebinar).catch(() => {});
  }, [id]);

  useEffect(() => {
    let vivo = true;
    const leer = () => {
      if (document.hidden) return;
      getWebinarVivo(id)
        .then((r) => { if (vivo) { setD(r); setError(''); } })
        .catch((e) => vivo && setError(e.message));
    };
    leer();
    timer.current = setInterval(leer, CADA);
    return () => { vivo = false; clearInterval(timer.current); };
  }, [id]);

  if (error && !d) return <div className="page"><ErrorState error={{ message: error }} /></div>;

  const showRate = d?.registros ? Math.round((d.distintos / d.registros) * 100) : null;
  // Cuánto queda del pico: si cae, la gente se está yendo y todavía se puede hacer algo.
  const retencion = d?.picoConcurrentes ? Math.round((d.conectados / d.picoConcurrentes) * 100) : null;
  const serie = d?.serie ?? [];

  return (
    <div className="page">
      <PageHeader
        eyebrow={<Link to={`/webinars/${id}/fase/dia`}>← Fase 2</Link>}
        title={webinar?.nombre || 'Webinar en vivo'}
        desc={
          d?.enVivo
            ? `Arrancó ${hora(d.arranqueAt)} · va ${desdeHace(d.arranqueAt)}`
            : d?.finAt
              ? `Terminó ${hora(d.finAt)} · duró ${desdeHace(d.arranqueAt)}`
              : 'Todavía no arrancó'
        }
        actions={
          <Pill tone={d?.enVivo ? 'alert' : 'off'} dot>
            {d?.enVivo ? 'en vivo' : d?.finAt ? 'terminado' : 'sin arrancar'}
          </Pill>
        }
      />

      {!d ? <SkeletonBlock height={220} /> : null}

      {d ? (
        <div className="vivo-kpis">
          <Kpi label="Conectados ahora" valor={d.conectados} tono={d.enVivo ? 'ok' : null}
            nota={d.enVivo ? 'adentro en este momento' : 'el webinar no está en curso'} />
          <Kpi label="Pico" valor={d.picoConcurrentes}
            nota={d.picoAt ? `el máximo fue ${hora(d.picoAt)}` : 'todavía sin pico'} />
          <Kpi label="Queda del pico" valor={retencion == null ? '—' : `${retencion}%`}
            tono={retencion == null ? null : retencion >= 70 ? 'ok' : retencion >= 50 ? 'warn' : 'alert'}
            nota="de los que llegaron a estar juntos" />
          <Kpi label="Entraron en total" valor={d.distintos}
            nota="personas distintas, no conexiones" />
          <Kpi label="Show rate" valor={showRate == null ? '—' : `${showRate}%`}
            nota={`${d.distintos} de ${d.registros || 0} registrados`} />
        </div>
      ) : null}

      {serie.length > 1 ? (
        <Card
          title="Cuánta gente hubo, minuto a minuto"
          sub="Desde que arrancó hasta ahora"
          foot="Lo que importa no es la altura sino la pendiente. Si baja durante el contenido, el pitch va a encontrar menos gente de la que dice el pico."
        >
          <LineArea
            data={serie} x={(p) => `${p.minuto}′`} height={230} format="count"
            series={[{ key: (p) => p.conectados, label: 'Conectados', color: 'var(--s5)' }]}
          />
        </Card>
      ) : null}

      {d && d.eventos === 0 ? (
        <Card title="Zoom todavía no mandó nada">
          <p className="dim">
            No llegó ningún aviso de este webinar. Si ya arrancó, revisá en la app de Zoom
            que <strong>Event Subscriptions</strong> esté prendido y apunte a{' '}
            <code>https://ops.atvos.io/api/track/zoom</code>, y que el secret token esté
            cargado en Claves API.
          </p>
        </Card>
      ) : null}

      {d?.gente?.length ? (
        <Card title="Quién está adentro" sub={`${d.gente.length} personas`} flush>
          <div className="vivo-gente">
            {d.gente.map((p) => (
              <div key={`${p.email || p.nombre}-${p.desdeAt}`} className="vivo-persona">
                <span className="strong">{p.nombre || p.email || 'Sin nombre'}</span>
                <span className="dim">{p.email && p.nombre ? p.email : ''}</span>
                <span className="dim">entró {hora(p.desdeAt)}</span>
                <span className="num">{desdeHace(p.desdeAt)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
