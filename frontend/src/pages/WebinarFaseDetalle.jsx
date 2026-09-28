import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import Modal from '../components/ui/Modal.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { fmtMetrica, SEMAFORO_LABEL } from '../components/webinars/WebinarEmbudo.jsx';
import { getWebinar, reiniciarTrackingWebinar, sincronizarZoom } from '../data/api.js';
import { CAMPOS_RAW, fasesDeWebinar } from '../lib/webinarFases.js';

const FASE_IDS = new Set(['registro', 'dia', 'post']);

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

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    getWebinar(id)
      .then((w) => {
        if (!vivo) return;
        setWebinar(w);
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

      <Card title="Métricas de la fase">
        <ul className="wb-fase-detalle-grid">
          {(fase.todas || [portada, ...fase.metricas].filter(Boolean)).map((m) => (
            <li
              key={m.key}
              className={`${m.portada ? 'es-portada' : ''}${
                m.key === 'frecuencia' && campanias.length ? ' se-abre' : ''}`}
              onClick={m.key === 'frecuencia' && campanias.length
                ? () => setVerCampanias(true) : undefined}
              title={m.key === 'frecuencia' && campanias.length
                ? 'Ver la frecuencia de cada campaña' : undefined}
            >
              <span className="num">{fmtMetrica(m.valor, m.formato)}</span>
              <span className="dim" title={m.ayuda || undefined}>{m.label}</span>
              {m.detalle ? <span className="wb-cuenta">{m.detalle}</span> : null}
              {m.ayuda ? <span className="wb-ayuda">{m.ayuda}</span> : null}
            </li>
          ))}
        </ul>
      </Card>

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
