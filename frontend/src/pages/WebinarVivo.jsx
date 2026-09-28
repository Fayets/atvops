import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import LineArea from '../components/charts/LineArea.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { getWebinar, getWebinarVivo } from '../data/api.js';

/**
 * El webinar mientras pasa, como una sala.
 *
 * Los números salen de los avisos que Zoom manda cada vez que alguien entra o sale, no
 * de su API de métricas en vivo —esa pide plan Business—.
 *
 * La sala es el centro de la pantalla y no los contadores. "18 conectados" no se siente;
 * ciento cincuenta butacas donde se ve cuáles están ocupadas, cuáles se vaciaron y
 * cuáles nunca se llenaron, sí. Es el mismo dato contado de una forma sobre la que se
 * puede actuar mientras todavía hay tiempo: si se apagan durante el contenido, el pitch
 * va a encontrar media sala.
 *
 * Se pregunta cada diez segundos y solo con la pestaña a la vista.
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

const ESTADO_BUTACA = {
  adentro: 'está adentro',
  estuvo: 'entró y se fue',
  vacia: 'no vino',
};

function Kpi({ label, valor, nota, tono, grande }) {
  return (
    <article className={`vivo-kpi${grande ? ' es-grande' : ''}`}>
      <span className="vivo-kpi-label">{label}</span>
      <span className={`vivo-kpi-valor num${tono ? ` zona-${tono}` : ''}`}>{valor}</span>
      <span className="vivo-kpi-nota">{nota}</span>
    </article>
  );
}

/**
 * La sala. Una butaca por inscripto, más los que entraron sin inscribirse.
 *
 * Las butacas recién ocupadas laten unos segundos: con ciento cincuenta iguales, el
 * cambio se pierde si no se señala, y el cambio es justamente lo único que se mira.
 */
function Sala({ butacas }) {
  const previos = useRef(new Set());
  const [nuevos, setNuevos] = useState(new Set());

  useEffect(() => {
    const ahora = new Set(butacas.filter((b) => b.estado === 'adentro').map((b) => b.email || b.nombre));
    const recien = new Set([...ahora].filter((k) => !previos.current.has(k)));
    previos.current = ahora;
    if (!recien.size) return undefined;
    setNuevos(recien);
    const t = setTimeout(() => setNuevos(new Set()), 6000);
    return () => clearTimeout(t);
  }, [butacas]);

  const cuenta = useMemo(() => ({
    adentro: butacas.filter((b) => b.estado === 'adentro').length,
    estuvo: butacas.filter((b) => b.estado === 'estuvo').length,
    vacia: butacas.filter((b) => b.estado === 'vacia').length,
  }), [butacas]);

  return (
    <>
      <div className="sala-leyenda">
        <span><i className="butaca adentro" /> {cuenta.adentro} adentro</span>
        <span><i className="butaca estuvo" /> {cuenta.estuvo} se fueron</span>
        <span><i className="butaca vacia" /> {cuenta.vacia} no vinieron</span>
      </div>
      {/* La barra de arriba es el escenario: sin ella la grilla es una grilla, con ella es una sala. */}
        <div className="sala-pantalla" aria-hidden="true" />
      <div className="sala">
        {butacas.map((b, i) => {
          const llave = b.email || b.nombre || i;
          return (
            <span
              key={`${llave}-${i}`}
              className={`butaca ${b.estado}${nuevos.has(llave) ? ' recien' : ''}${b.inscripto ? '' : ' colado'}`}
              title={b.nombre
                ? `${b.nombre} · ${ESTADO_BUTACA[b.estado]}${b.inscripto ? '' : ' · entró sin inscribirse'}`
                : 'Registrado en la landing · todavía no lo vimos entrar'}
            />
          );
        })}
      </div>
    </>
  );
}

export default function WebinarVivo() {
  const { id } = useParams();
  const [webinar, setWebinar] = useState(null);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => { getWebinar(id).then(setWebinar).catch(() => {}); }, [id]);

  useEffect(() => {
    let vivo = true;
    const leer = () => {
      getWebinarVivo(id)
        .then((r) => { if (vivo) { setD(r); setError(''); } })
        .catch((e) => vivo && setError(e.message));
    };
    // El ahorro es no seguir preguntando desde una pestaña que quedó atrás, no dejar la
    // pantalla vacía: la primera carga va siempre, y al volver a la pestaña se refresca
    // en el acto en vez de esperar al próximo tick con datos viejos en pantalla.
    const tick = () => { if (!document.hidden) leer(); };
    const alVolver = () => { if (!document.hidden) leer(); };

    leer();
    timer.current = setInterval(tick, CADA);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vivo = false;
      clearInterval(timer.current);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [id]);

  if (error && !d) return <div className="page"><ErrorState error={{ message: error }} /></div>;

  const showRate = d?.registros ? Math.round((d.distintos / d.registros) * 100) : null;
  const retencion = d?.picoConcurrentes ? Math.round((d.conectados / d.picoConcurrentes) * 100) : null;
  const serie = d?.serie ?? [];
  const butacas = d?.butacas ?? [];

  return (
    <div className={`page vivo-page${d?.enVivo ? ' esta-en-vivo' : ''}`}>
      <PageHeader
        eyebrow={<Link to={`/webinars/${id}/fase/dia`}>← Fase 2</Link>}
        title={webinar?.nombre || 'Webinar en vivo'}
        desc={
          d?.enVivo
            ? `Arrancó ${hora(d.arranqueAt)} · va ${desdeHace(d.arranqueAt)}`
            : d?.arranqueAt
              ? `Arrancó ${hora(d.arranqueAt)} · no queda nadie conectado`
              : 'Todavía no entró nadie'
        }
        actions={
          <Pill tone={d?.enVivo ? 'alert' : 'off'} dot>
            {d?.enVivo ? 'en vivo' : d?.arranqueAt ? 'sin nadie adentro' : 'sin arrancar'}
          </Pill>
        }
      />

      {!d ? <SkeletonBlock height={260} /> : null}

      {d ? (
        <div className="vivo-kpis">
          <Kpi grande label="Conectados ahora" valor={d.conectados} tono={d.enVivo ? 'ok' : null}
            nota={d.enVivo ? 'adentro en este momento' : 'no hay nadie conectado'} />
          <Kpi label="Pico" valor={d.picoConcurrentes}
            nota={d.picoAt ? `el máximo fue ${hora(d.picoAt)}` : 'todavía sin pico'} />
          <Kpi label="Queda del pico" valor={retencion == null ? '—' : `${retencion}%`}
            tono={retencion == null ? null : retencion >= 70 ? 'ok' : retencion >= 50 ? 'warn' : 'alert'}
            nota="de los que llegaron a estar juntos" />
          <Kpi label="Entraron en total" valor={d.distintos} nota="personas distintas" />
          <Kpi label="Show rate" valor={showRate == null ? '—' : `${showRate}%`}
            tono={showRate == null ? null : showRate >= 35 ? 'ok' : showRate >= 20 ? 'warn' : 'alert'}
            nota={d.registros
              ? `${d.distintos} de ${d.registros} registrados`
              : 'falta cargar los registrados en la Fase 2'} />
        </div>
      ) : null}

      {butacas.length ? (
        <Card
          title="La sala"
          sub={`${butacas.length} butacas · una por inscripto`}
          foot="Cada butaca es una persona. Las que se apagan durante el contenido son las que no van a estar cuando llegue el pitch."
        >
          <Sala butacas={butacas} />
        </Card>
      ) : null}

      <div className="vivo-dos">
        {serie.length > 1 ? (
          <Card title="Minuto a minuto" sub="Cuánta gente hubo desde que arrancó"
            foot="Lo que importa no es la altura: es la pendiente.">
            <LineArea
              data={serie} x={(p) => `${p.minuto}′`} height={220} format="count"
              series={[{ key: (p) => p.conectados, label: 'Conectados', color: 'var(--s5)' }]}
            />
          </Card>
        ) : null}

        {d?.ultimos?.length ? (
          <Card title="Movimiento" sub="Lo último que pasó" flush>
            <div className="vivo-feed">
              {d.ultimos.map((m, i) => (
                <div key={`${m.quien}-${m.at}-${i}`} className={`vivo-mov ${m.tipo}`}>
                  <span className="vivo-mov-icono">{m.tipo === 'entra' ? '↓' : '↑'}</span>
                  <span className="strong">{m.quien}</span>
                  <span className="dim">{m.tipo === 'entra' ? 'entró' : 'se fue'}</span>
                  <span className="dim num">{hora(m.at)}</span>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>

      {d && d.eventos === 0 ? (
        <Card title="Zoom todavía no mandó nada">
          <p className="dim">
            No llegó ningún aviso de este webinar. Si ya arrancó, revisá en la app de Zoom
            que <strong>Event Subscriptions</strong> esté prendido y apunte a{' '}
            <code>https://ops.atvos.io/api/track/zoom</code>.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
