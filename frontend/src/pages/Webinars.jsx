import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import WebinarEmbudo, { FunnelMathBar } from '../components/webinars/WebinarEmbudo.jsx';
import { getWebinar, getWebinars } from '../data/api.js';
import { BENCHMARKS_COLD, fasesDeWebinar, proyeccionDesdeMeta } from '../lib/webinarFases.js';

const LS_KEY = 'atv.webinar.activo';

/**
 * Home de Webinars: selector de listado arriba → embudo del webinar elegido.
 */
export default function Webinars() {
  const [lista, setLista] = useState([]);
  const [activoId, setActivoId] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [metaCash, setMetaCash] = useState('');
  const [cargando, setCargando] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    getWebinars()
      .then((w) => {
        if (!vivo) return;
        setLista(w);
        setError(null);
        const guardado = Number(localStorage.getItem(LS_KEY) || 0);
        const existe = w.some((x) => x.id === guardado);
        setActivoId(existe ? guardado : (w[0]?.id ?? null));
      })
      .catch((e) => vivo && setError(e))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!activoId) {
      setDetalle(null);
      return undefined;
    }
    let vivo = true;
    setCargandoDetalle(true);
    localStorage.setItem(LS_KEY, String(activoId));
    getWebinar(activoId)
      .then((w) => { if (vivo) setDetalle(w); })
      .catch((e) => vivo && setError(e))
      .finally(() => vivo && setCargandoDetalle(false));
    return () => { vivo = false; };
  }, [activoId]);

  const raw = useMemo(() => {
    if (!detalle) return {};
    return { ...(detalle.metricasCrudas || {}), ...(detalle.metricas || {}) };
  }, [detalle]);

  const fases = useMemo(
    () => fasesDeWebinar(raw, {
      gastoAdsUsd: raw.gastoAdsUsd ?? detalle?.metricas?.gastoAdsUsd,
      benchmarks: detalle?.benchmarks,
      metaCash: metaCash ? Number(metaCash) : undefined,
    }),
    [raw, detalle, metaCash],
  );

  const proyeccion = useMemo(() => {
    if (!metaCash) return null;
    const m = fases[0]?.valores || {};
    return proyeccionDesdeMeta({
      metaCash,
      precio: detalle?.precioUsd,
      closeRate: m.closeRate || BENCHMARKS_COLD.closeRateCalls.verdeMin,
      bookingRate: m.bookingRate || 20,
      showRate: m.showRate || 30,
      costoPorRegistrante: m.costoPorRegistrante || 10,
    });
  }, [metaCash, detalle, fases]);

  if (error) {
    return <div className="page"><ErrorState error={error} /></div>;
  }

  if (cargando) {
    return <div className="page"><SkeletonBlock height={420} /></div>;
  }

  if (lista.length === 0) {
    return (
      <div className="page">
        <PageHeader
          title="Webinars"
          actions={<Link to="/webinars/nuevo" className="btn primary">+ Crear</Link>}
        />
        <Card>
          <div className="empty webinars-vacio">
            <p>Todavía no hay webinars.</p>
            <Link to="/webinars/nuevo" className="btn primary">Crear el primero</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page wb-home">
      <div className="wb-topbar">
        <label className="wb-listado-sel">
          <span className="wb-listado-lab">Listado</span>
          <select
            value={activoId || ''}
            onChange={(e) => setActivoId(Number(e.target.value))}
            aria-label="Elegir webinar del listado"
          >
            {lista.map((w) => (
              <option key={w.id} value={w.id}>{w.nombre}</option>
            ))}
          </select>
        </label>
        <div className="webinar-head-actions">
          {activoId && (
            <Link to={`/webinars/${activoId}`} className="btn ghost">Configurar</Link>
          )}
          <Link to="/webinars/nuevo" className="btn primary">+ Crear</Link>
        </div>
      </div>

      {cargandoDetalle || !detalle ? (
        <SkeletonBlock height={360} />
      ) : (
        <>
          <WebinarEmbudo fases={fases} webinarId={activoId} />
          <Card
            title="Funnel math"
            sub="Desde la meta de cash, qué necesita cada fase para que el webinar llegue."
          >
            <FunnelMathBar
              metaCash={metaCash}
              onMetaCash={setMetaCash}
              proyeccion={proyeccion}
            />
          </Card>
        </>
      )}
    </div>
  );
}
