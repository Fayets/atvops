import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import Modal from '../components/ui/Modal.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { fmtMetrica, SEMAFORO_LABEL } from '../components/webinars/WebinarEmbudo.jsx';
import { actualizarWebinar, getWebinar, reiniciarTrackingWebinar, sincronizarZoom, traerAgendas } from '../data/api.js';
import { CAMPOS_RAW, fasesDeWebinar } from '../lib/webinarFases.js';

const FASE_IDS = new Set(['registro', 'dia', 'post']);

/* Los bloques de la Fase 1. Son tres embudos distintos que terminan en el mismo lugar:
 * ads paga por tráfico y lo lleva a la landing, el orgánico entra por DM y va derecho
 * al grupo sin pasar por ninguna página, y las confirmaciones son el paso que decide
 * cuánta de esa gente aparece el día del webinar. Mezclados, ninguna tasa se entiende:
 * el costo por registrante es de ads y el grupo de WhatsApp es de los dos. */
const GRUPOS = {
  confirmaciones: { titulo: 'Confirmaciones', sub: 'Los que van a estar el día del webinar' },
  ads: { titulo: 'Captación por ads', sub: 'Lo que se paga y termina en la landing' },
  organico: { titulo: 'Captación por orgánico' },
};

/* Las métricas que son un número cargado a mano y no una cuenta.
 *
 * Solo estas llevan lápiz. Editar una tasa no tendría sentido —sale de dividir otras
 * dos—, lo que trae Zoom lo pisaría el próximo sync, y las agendas se releen de
 * Typeform en cada carga: un lápiz ahí sería una trampa. Quedan las que de verdad
 * pasan fuera del sistema y nadie mide por vos. */
/* Las métricas que se pueden abrir para ver quiénes son.
 *
 * Un número de personas sin los nombres detrás no se puede trabajar: "8 agendaron" no
 * dice a quién llamar. La lista ya existe en Webinars → Agendas; lo que faltaba era el
 * camino desde el número. */
const SE_ABREN = {
  ctaCompletado: '/webinars/agendas',
  booked: '/webinars/agendas',
};

const A_MANO = {
  registros: 'Confirmados al webinar',
};

/**
 * Detalle de una fase del embudo: portada, métricas, raw y cuello típico.
 */
export default function WebinarFaseDetalle() {
  const { id, faseId } = useParams();
  const [webinar, setWebinar] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [verCampanias, setVerCampanias] = useState(false);
  const [tick, setTick] = useState(0);
  const [reiniciando, setReiniciando] = useState(false);
  const [trayendo, setTrayendo] = useState(false);
  const [avisoZoom, setAvisoZoom] = useState('');
  const [errorAccion, setErrorAccion] = useState('');
  const webinarRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    // El esqueleto solo la primera vez. Cuando la recarga viene de corregir un número
    // o de traer Zoom, la pantalla ya tiene contenido: vaciarla para volver a
    // dibujarla la hace parpadear entera por cambiar un dígito.
    setCargando((antes) => antes || webinarRef.current === null);
    getWebinar(id)
      .then((w) => {
        if (!vivo) return;
        setWebinar(w);
        webinarRef.current = w;
        setError(null);
        localStorage.setItem('atv.webinar.activo', String(w.id));
      })
      .catch((e) => vivo && setError(e))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [id, tick]);

  const fases = useMemo(() => {
    if (!webinar) return [];
    const raw = { ...(webinar.metricasCrudas || {}), ...(webinar.metricas || {}) };
    return fasesDeWebinar(raw, {
      gastoAdsUsd: raw.gastoAdsUsd ?? webinar.metricas?.gastoAdsUsd,
      benchmarks: webinar.benchmarks,
    });
  }, [webinar]);

  const fase = fases.find((f) => f.id === faseId);
  const camposRaw = CAMPOS_RAW.filter((c) => c.fase === faseId);
  // Solo se puede poner en cero lo que entra solo. Lo cargado a mano se edita.
  const campanias = webinar?.campaniasMetricas ?? [];
  const delScript = camposRaw.filter((c) => c.origen === 'script');
  // El total lo dice el backend, no la pantalla: `optins` puede venir deducido de los
  // registros cuando el script no contó ninguno, y entonces ofreceríamos borrar
  // eventos que no existen.
  const totalScript = Number(webinar?.trackingEventos) || 0;

  async function traerDeZoom() {
    setTrayendo(true);
    setErrorAccion('');
    setAvisoZoom('');
    try {
      const r = await sincronizarZoom(id);
      setAvisoZoom(
        r.aviso
          || `Listo: ${r.zoom.vivos} entraron, pico de ${r.zoom.picoConcurrentes}.`,
      );
      setTick((n) => n + 1);
    } catch (e) {
      setErrorAccion(e.message);
    } finally {
      setTrayendo(false);
    }
  }

  async function reiniciarScript() {
    if (!totalScript) return;
    const ok = window.confirm(
      `¿Poner en cero lo que el script cuenta en esta fase?\n\n` +
        `Se borran ${totalScript} eventos —${delScript.map((c) => c.label.toLowerCase()).join(', ')}— ` +
        `y no se pueden recuperar.\n\n` +
        `Lo que cargaste a mano no se toca, y el script sigue midiendo desde cero.`,
    );
    if (!ok) return;
    setErrorAccion('');
    setReiniciando(true);
    try {
      await reiniciarTrackingWebinar(id);
      setTick((n) => n + 1);
    } catch (e) {
      setErrorAccion(e.message || 'No se pudieron poner en cero.');
    } finally {
      setReiniciando(false);
    }
  }

  if (!FASE_IDS.has(faseId)) {
    return (
      <div className="page">
        <ErrorState error={new Error('Esa fase no existe.')} />
        <Link to="/webinars" className="btn ghost">← Embudo</Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} />
        <Link to="/webinars" className="btn ghost">← Embudo</Link>
      </div>
    );
  }

  if (cargando || !fase) {
    return <div className="page"><SkeletonBlock height={360} /></div>;
  }

  const portada = fase.portada;

  return (
    <div className={`page wb-fase-page fase-${faseId}`}>
      <PageHeader
        title={`Fase ${fase.n} · ${fase.titulo}`}
        desc={`${fase.desde} → ${fase.hasta}`}
        actions={(
          <div className="webinar-head-actions">
            <Link to="/webinars" className="btn ghost">← Embudo</Link>
            <Link to={`/webinars/${id}`} className="btn ghost">Configurar</Link>
          </div>
        )}
      />

      <div className={`wb-fase-hero fase-${faseId} sem-${fase.semaforo}`}>
        <div className="wb-fase-hero-portada">
          <span className="wb-semaforo" title={SEMAFORO_LABEL[fase.semaforo]} />
          <div>
            <span className="wb-fase-valor">{fmtMetrica(portada?.valor, portada?.formato)}</span>
            <span className="wb-fase-label">{portada?.label || fase.portadaLabel}</span>
          </div>
        </div>
      </div>

      {(() => {
        const todas = (fase.todas || [portada, ...fase.metricas].filter(Boolean)).filter((m) => !m.oculto);
        const conGrupo = todas.filter((m) => m.grupo);
        // Solo la Fase 1 viene agrupada. Las otras siguen en una grilla sola: partir en
        // bloques dos métricas no ordena nada, agrega marcos.
        const bloques = conGrupo.length
          ? Object.keys(GRUPOS)
            .map((g) => ({ g, items: todas.filter((m) => m.grupo === g) }))
            .filter((b) => b.items.length)
          : [{ g: null, items: todas }];

        return bloques.map(({ g, items }) => (
          <Card
            key={g || 'todas'}
            title={g ? GRUPOS[g].titulo : 'Métricas de la fase'}
            sub={g ? GRUPOS[g].sub : undefined}
          >
            <ul className="wb-fase-detalle-grid">
              {items.map((m) => (
            <li
              key={m.key}
              className={`${m.portada ? 'es-portada' : ''}${
                m.key === 'frecuencia' && campanias.length ? ' se-abre' : ''}`}
              onClick={m.key === 'frecuencia' && campanias.length
                ? () => setVerCampanias(true) : undefined}
              title={m.key === 'frecuencia' && campanias.length
                ? 'Ver la frecuencia de cada campaña' : undefined}
            >
              {SE_ABREN[m.key] ? (
                <Link to={SE_ABREN[m.key]} className="wb-abre" title="Ver quiénes son">
                  <span className="num">{fmtMetrica(m.valor, m.formato)}</span>
                  <span className="wb-abre-flecha">→</span>
                </Link>
              ) : A_MANO[m.key] ? (
                <MetricaEditable
                  webinarId={id}
                  clave={m.key}
                  valor={m.valor}
                  onGuardado={() => setTick((n) => n + 1)}
                />
              ) : (
                <span className="num">{fmtMetrica(m.valor, m.formato)}</span>
              )}
              <span className="dim" title={m.ayuda || undefined}>{m.label}</span>
              {m.detalle ? <span className="wb-cuenta">{m.detalle}</span> : null}
              {m.ayuda ? <span className="wb-ayuda">{m.ayuda}</span> : null}
            </li>
              ))}
            </ul>
          </Card>
        ));
      })()}

      <Card
        title="Números cargados"
        sub="Raw que alimentan esta fase. Se editan en Configurar."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {faseId === 'dia' ? (
            webinar?.zoomWebinarId ? (
              <Link
                to={`/webinars/${id}/vivo`}
                className="btn sm"
                title="Cuánta gente hay conectada ahora, con la curva del vivo."
              >
                Webinar en vivo
              </Link>
            ) : (
              <button type="button" className="btn sm" disabled
                title="Falta vincular el webinar de Zoom, se elige en Configurar">
                Webinar en vivo
              </button>
            )
          ) : null}
          {faseId === 'dia' ? (

            <button
              type="button"
              className="btn sm"
              onClick={traerDeZoom}
              disabled={trayendo || !webinar?.zoomWebinarId}
              title={
                webinar?.zoomWebinarId
                  ? 'Lee el reporte de asistencia y llena vivos, pico y retenidos.'
                  : 'Falta el ID del webinar en Zoom, se carga en Configurar'
              }
            >
              {trayendo ? 'Trayendo…' : 'Traer de Zoom'}
            </button>
          ) : null}
          {delScript.length ? (
            <button
              type="button"
              className="btn sm alerta"
              onClick={reiniciarScript}
              disabled={reiniciando || !totalScript}
              title={
                totalScript
                  ? 'Borra lo que contó el script. Lo cargado a mano queda igual.'
                  : 'El script todavía no contó nada'
              }
            >
              {reiniciando ? 'Reiniciando…' : 'Poner en cero el script'}
            </button>
          ) : null}
          </div>
        }
      >
        <ul className="wb-fase-raw">
          {camposRaw.map((c) => {
            const v = fase.valores?.[c.key];
            return (
              <li key={c.key} className={c.origen === 'script' ? 'es-script' : ''}>
                <span className="dim">
                  {c.label}
                  {c.origen === 'script' ? (
                    <span className="wb-raw-origen" title="Lo cuenta el script de la landing">
                      auto
                    </span>
                  ) : null}
                </span>
                <span className="num">{fmtMetrica(v, c.tipo === 'usd' ? 'usd' : 'count')}</span>
              </li>
            );
          })}
        </ul>
        {errorAccion ? <p className="error">{errorAccion}</p> : null}
        {avisoZoom ? <p className="dim" style={{ fontSize: 12.5 }}>{avisoZoom}</p> : null}
        <Link to={`/webinars/${id}`} className="btn sm" style={{ marginTop: 12 }}>
          Editar números
        </Link>
      </Card>
      <Modal
        open={verCampanias}
        onClose={() => setVerCampanias(false)}
        title="Frecuencia por campaña"
        wide
      >
        <p className="dim" style={{ marginTop: 0 }}>
          La frecuencia del cuadro no es el promedio de estas: se recalcula como
          impresiones sobre alcance del conjunto. Promediar frecuencias le daría el mismo
          peso a una campaña que alcanzó a cien personas que a una que alcanzó a diez mil.
        </p>
        <ul className="camp-frec">
          {campanias.map((c) => (
            <li key={c.id}>
              <span className="camp-frec-nombre">
                {c.nombre}
                {c.estado ? <span className="dim"> · {c.estado}</span> : null}
              </span>
              <span className="num">{c.frecuencia != null
                ? c.frecuencia.toLocaleString('es-AR', { maximumFractionDigits: 2 })
                : '—'}</span>
              <span className="dim">
                {fmtMetrica(c.impresiones, 'count')} impresiones ·{' '}
                {fmtMetrica(c.alcance, 'count')} personas ·{' '}
                {fmtMetrica(c.gastoUsd, 'usd')}
              </span>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}


/**
 * Un número cargado a mano, editable en el lugar.
 *
 * Los confirmados se mueven todos los días hasta el webinar y el booked se carga
 * después: mandar a otra pantalla a editar un formulario para cambiar un dígito
 * termina en que el número queda viejo. Con Enter se guarda, con Escape se cancela.
 */
function MetricaEditable({ webinarId, clave, valor, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Lo último que se guardó desde acá. Se muestra hasta que la recarga traiga el
  // número del servidor: si no, al guardar se ve un momento el valor viejo, que es
  // exactamente lo que uno acaba de corregir y da la sensación de que no funcionó.
  const [optimista, setOptimista] = useState(null);
  // Enter dispara el guardado y el blur del input al desmontarse lo dispara otra vez.
  // Dos PATCH y dos recargas compitiendo: la que llega segunda puede traer el valor
  // de antes. Con esto, el segundo intento no hace nada.
  const enVuelo = useRef(false);

  useEffect(() => { setOptimista(null); }, [valor]);

  const abrir = () => { setBorrador(String(valor ?? 0)); setEditando(true); };

  const guardar = async () => {
    if (enVuelo.current) return;
    const n = Number(borrador);
    if (!Number.isFinite(n) || n < 0) { setEditando(false); return; }
    if (n === Number(valor ?? 0)) { setEditando(false); return; }
    enVuelo.current = true;
    setGuardando(true);
    setOptimista(Math.round(n));
    setEditando(false);
    try {
      await actualizarWebinar(webinarId, { metricas: { [clave]: Math.round(n) } });
      onGuardado?.();
    } catch {
      setOptimista(null);  // no se guardó: mejor el número viejo que uno que no existe
    } finally {
      setGuardando(false);
      enVuelo.current = false;
    }
  };

  const mostrado = optimista ?? valor;

  if (!editando) {
    return (
      <span className={`wb-editable${guardando ? ' guardando' : ''}`}>
        <span className="num">{fmtMetrica(mostrado, 'count')}</span>
        <button type="button" className="wb-lapiz" onClick={abrir} title="Cambiar este número">
          ✎
        </button>
      </span>
    );
  }

  return (
    <span className="wb-editable editando">
      <input
        type="number" min="0" inputMode="numeric" autoFocus
        value={borrador}
        onChange={(e) => setBorrador(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') guardar();
          if (e.key === 'Escape') setEditando(false);
        }}
        onBlur={guardar}
      />
    </span>
  );
}
