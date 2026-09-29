import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import Bars from '../components/charts/Bars.jsx';
import LineArea from '../components/charts/LineArea.jsx';
import MarcarPitch from '../components/webinars/MarcarPitch.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { actualizarWebinar, getWebinar, getWebinarVivo } from '../data/api.js';

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

function Kpi({ label, valor, nota, tono, grande, editable }) {
  return (
    <article className={`vivo-kpi${grande ? ' es-grande' : ''}`}>
      <span className="vivo-kpi-label">{label}</span>
      {editable
        ? <PisoEditable {...editable} valor={valor} tono={tono} />
        : <span className={`vivo-kpi-valor num${tono ? ` zona-${tono}` : ''}`}>{valor}</span>}
      <span className="vivo-kpi-nota">{nota}</span>
    </article>
  );
}

/**
 * Un número del vivo que se puede corregir a mano.
 *
 * Los webhooks solo cuentan desde que existen. Cuando se prenden a mitad del webinar
 * —o cuando Zoom se come un evento— el contador arranca por debajo de la sala real, y
 * el que está conduciendo es el único que sabe el número de verdad: lo tiene en
 * pantalla. Escribirlo acá lo deja como piso y la medición sigue desde ahí.
 */
function PisoEditable({ webinarId, clave, valor, tono, onGuardado, transformar }) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');
  const [optimista, setOptimista] = useState(null);
  const enVuelo = useRef(false);

  useEffect(() => { setOptimista(null); }, [valor]);

  const guardar = async () => {
    if (enVuelo.current) return;
    const n = Number(borrador);
    setEditando(false);
    if (!Number.isFinite(n) || n < 0) return;
    enVuelo.current = true;
    setOptimista(Math.round(n));
    // `transformar` existe para "conectados ahora": ese número no se guarda, se guarda
    // la diferencia contra lo que estamos midiendo. Si guardáramos el número, las
    // salidas no restarían nunca y el contador quedaría clavado toda la hora.
    const aGuardar = transformar ? transformar(Math.round(n)) : Math.round(n);
    try {
      await actualizarWebinar(webinarId, { metricas: { [clave]: aGuardar } });
      onGuardado?.();
    } catch {
      setOptimista(null);
    } finally {
      enVuelo.current = false;
    }
  };

  if (editando) {
    return (
      <input
        className="vivo-kpi-input num" type="number" min="0" inputMode="numeric" autoFocus
        value={borrador}
        onChange={(e) => setBorrador(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') guardar();
          if (e.key === 'Escape') setEditando(false);
        }}
        onBlur={guardar}
      />
    );
  }

  return (
    <span className={`vivo-kpi-valor num${tono ? ` zona-${tono}` : ''}`}>
      {optimista ?? valor}
      <button
        type="button" className="wb-lapiz"
        onClick={() => { setBorrador(String(optimista ?? valor ?? 0)); setEditando(true); }}
        title="Corregir: queda como piso y la medición sigue desde ahí"
      >
        ✎
      </button>
    </span>
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

  // La sala se ocupa desde adelante, como un cine: primero los que están adentro,
  // después los que se fueron, y al fondo las butacas que nunca se llenaron. Con el
  // orden de la lista de inscriptos, los que entran quedan salpicados entre los grises
  // y no se ve llenarse nada, que es justamente lo que hay que ver.
  const ORDEN = { adentro: 0, estuvo: 1, vacia: 2 };
  const enFila = useMemo(
    () => [...butacas].sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado]),
    [butacas],
  );

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
        {enFila.map((b, i) => {
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

  // Se incrementa cuando se guarda el minuto del pitch: fuerza una lectura nueva en
  // vez de esperar hasta diez segundos para ver el número recalculado.
  const [refresco, setRefresco] = useState(0);

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
  }, [id, refresco]);

  if (error && !d) return <div className="page"><ErrorState error={{ message: error }} /></div>;

  const base = d?.registros || d?.inscriptos || 0;
  // En vivo, cuántos entraron. Terminado, el pico: es medido exacto, mientras que
  // "personas distintas" es una inferencia sobre nombres repetidos.
  const llegaron = d?.enVivo ? d?.distintos : d?.picoConcurrentes;
  const showRate = base ? Math.round((llegaron / base) * 100) : null;
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
          {/* Terminado el webinar, "conectados ahora" y "queda del pico" son cero y no
              dicen nada. Ocupan el lugar de la retención promedio, que es la lectura
              que importa después: cuánto se quedó la gente. */}
          {d.enVivo ? (
            <Kpi grande label="Conectados ahora" valor={d.conectados} tono="ok"
            editable={{
              webinarId: id,
              clave: 'conectadosOffset',
              // Se guarda la diferencia contra lo medido, no el número: así lo que
              // Zoom sí escucha —entradas y salidas— sigue moviendo el contador.
              transformar: (n) => Math.max(0, n - (d.medidosDentro ?? 0)),
              onGuardado: () => setRefresco((x) => x + 1),
            }}
              nota={d.sinEscuchar
                ? `${d.sinEscuchar} cargados a mano · ${d.medidosDentro ?? 0} medidos por Zoom`
                : 'adentro en este momento'} />
          ) : (
            <Kpi grande label="Retención de sala"
              valor={d.picoConcurrentes && d.concurrenciaPromedio
                ? `${Math.round((d.concurrenciaPromedio / d.picoConcurrentes) * 100)}%` : '—'}
              tono={d.picoConcurrentes && d.concurrenciaPromedio
                ? ((d.concurrenciaPromedio / d.picoConcurrentes) >= 0.75 ? 'ok'
                  : (d.concurrenciaPromedio / d.picoConcurrentes) >= 0.55 ? 'warn' : 'alert')
                : null}
              nota={`${d.concurrenciaPromedio ?? 0} en la sala en promedio · ${d.minutosPromedio ?? 0} min por persona`} />
          )}
          <Kpi label="Pico" valor={d.picoConcurrentes}
            editable={{ webinarId: id, clave: 'picoConcurrentes', onGuardado: () => setRefresco((n) => n + 1) }}
            nota={d.picoAt ? `el máximo fue ${hora(d.picoAt)}` : 'todavía sin pico'} />
          {d.enVivo ? (
            <Kpi label="Queda del pico" valor={retencion == null ? '—' : `${retencion}%`}
              tono={retencion == null ? null : retencion >= 70 ? 'ok' : retencion >= 50 ? 'warn' : 'alert'}
              nota="de los que llegaron a estar juntos" />
          ) : (
            <Kpi label="Al pitch" valor={d.enElPitch ?? '—'}
              tono={d.enElPitch && d.picoConcurrentes
                ? ((d.enElPitch / d.picoConcurrentes) >= 0.7 ? 'ok'
                  : (d.enElPitch / d.picoConcurrentes) >= 0.5 ? 'warn' : 'alert')
                : null}
              nota={d.minutoPitch
                ? `${Math.round((d.enElPitch / d.picoConcurrentes) * 100)}% del pico · minuto ${d.minutoPitch}`
                : 'marcá el minuto del pitch'} />
          )}
          {d.enVivo ? (
            <Kpi label="Entraron en total" valor={d.distintos}
              editable={{ webinarId: id, clave: 'vivos', onGuardado: () => setRefresco((n) => n + 1) }}
              nota={d.sinEscuchar ? `${d.sinEscuchar} cargados a mano` : 'personas distintas'} />
          ) : null}
          <Kpi label="Show rate" valor={showRate == null ? '—' : `${showRate}%`}
            tono={showRate == null ? null : showRate >= 35 ? 'ok' : showRate >= 20 ? 'warn' : 'alert'}
            nota={base
              ? `${llegaron} ${d.enVivo ? 'de' : 'en simultáneo, de'} ${base} que confirmaron lugar`
              : 'sin confirmados cargados'} />
          {/* Los opt-ins no son butacas: dejaron el mail, no confirmaron el lugar. Van
              aparte, como contraste del embudo entero. */}
          <Kpi label="De los opt-ins" valor={d.optins ? `${Math.round((llegaron / d.optins) * 100)}%` : '—'}
            nota={`${llegaron} de ${d.optins || 0} que dejaron el mail`} />
        </div>
      ) : null}

      {butacas.length ? (
        <Card
          title="La sala"
          sub={`${butacas.length} butacas · la gente de Zoom`}
          foot="Cada butaca es una persona. Las que se apagan durante el contenido son las que no van a estar cuando llegue el pitch."
        >
          <Sala butacas={butacas} />
        </Card>
      ) : null}

      {d?.seFueron?.length ? (
        <Card
          title="Se fueron"
          sub={`${d.seFueron.length} personas · las butacas ámbar`}
          foot="Los que se van durante el contenido son los que no van a estar en el pitch. Con nombre y con cuánto aguantaron: el que se fue al minuto 3 no es el mismo caso que el que aguantó cuarenta."
          flush
        >
          <div className="vivo-gente">
            {d.seFueron.map((p) => (
              <div key={`${p.email || p.nombre}-${p.salioAt}`} className="vivo-persona">
                <span className="strong">{p.nombre || p.email || 'Sin nombre'}</span>
                <span className="dim">{p.email && p.nombre ? p.email : ''}</span>
                <span className="dim">se fue {hora(p.salioAt)}</span>
                <span className="num">{p.minutos != null ? `${p.minutos} min` : '—'}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {d ? (
        <MarcarPitch
          webinarId={id}
          minutoPitch={d.minutoPitch}
          arranqueAt={d.arranqueAt}
          enVivo={d.enVivo}
          enElPitch={d.enElPitch}
          pico={d.picoConcurrentes}
          onGuardado={() => setRefresco((n) => n + 1)}
        />
      ) : null}

      {d?.tramos?.length ? (
        <div className="vivo-dos">
          <Card
            title="Retención por tramo"
            sub="Cuánta gente quedaba en cada momento del guion"
            foot="Contra el pico. Los tramos anteriores al pico van en gris: ahí todavía está entrando gente y un número bajo no es una fuga. El tramo donde cae después es el que hay que reescribir."
          >
            <Bars
              data={d.tramos} x={(p) => p.label} y={(p) => p.pct} format="pct" label="Del pico"
              height={230}
              color={(p) => (p.antesDelPico ? 'var(--s3)'
                : p.pct >= 80 ? 'var(--ok)' : p.pct >= 60 ? 'var(--warn)' : 'var(--alert)')}
              linea={{ key: (p) => p.conectados, label: 'Personas', format: 'count', escala: 'propia' }}
            />
          </Card>

          <Card
            title="El embudo del vivo"
            sub="De dónde salió cada número"
            foot="Los opt-ins no son asistentes: dejaron el mail. El salto que más duele suele ser el de inscripto a entró."
          >
            <div className="vivo-embudo">
              {d.embudo.map((e, i) => {
                const tope = d.embudo[0].n || 1;
                const previo = i ? d.embudo[i - 1].n : null;
                return (
                  <div key={e.label} className="vivo-embudo-fila">
                    <span className="vivo-embudo-label">{e.label}</span>
                    <span className="vivo-embudo-barra">
                      <span style={{ width: `${Math.max(2, (e.n / tope) * 100)}%` }} />
                    </span>
                    <span className="num strong">{e.n}</span>
                    <span className="dim">
                      {previo ? `${Math.round((e.n / previo) * 100)}%` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
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
