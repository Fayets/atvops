import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { fmtMetrica, SEMAFORO_LABEL } from '../components/webinars/WebinarEmbudo.jsx';
import { getWebinar } from '../data/api.js';
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
  }, [id]);

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
            <li key={m.key} className={m.portada ? 'es-portada' : ''}>
              <span className="num">{fmtMetrica(m.valor, m.formato)}</span>
              <span className="dim" title={m.ayuda || undefined}>{m.label}</span>
              {m.ayuda ? <span className="wb-ayuda">{m.ayuda}</span> : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Números cargados" sub="Raw que alimentan esta fase. Se editan en Configurar.">
        <ul className="wb-fase-raw">
          {camposRaw.map((c) => {
            const v = fase.valores?.[c.key];
            return (
              <li key={c.key}>
                <span className="dim">{c.label}</span>
                <span className="num">{fmtMetrica(v, c.tipo === 'usd' ? 'usd' : 'count')}</span>
              </li>
            );
          })}
        </ul>
        <Link to={`/webinars/${id}`} className="btn sm" style={{ marginTop: 12 }}>
          Editar números
        </Link>
      </Card>
    </div>
  );
}
