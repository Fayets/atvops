import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import WebinarEmbudo, { FunnelMathBar } from '../components/webinars/WebinarEmbudo.jsx';
import { getWebinar, getWebinars } from '../data/api.js';
import { BENCHMARKS_COLD, fasesDeWebinar, proyeccionDesdeMeta } from '../lib/webinarFases.js';

const ESTADO = {
  en_vivo: ['En vivo', 'alert'], configurado: ['Próximo', 'warn'], finalizado: ['Terminado', 'off'], borrador: ['Borrador', 'off'],
};
// Lo que está pasando arriba, lo que ya pasó abajo.
const ORDEN_ESTADO = ['en_vivo', 'configurado', 'finalizado', 'borrador'];
const fecha = (s) => {
  if (!s) return 'Sin fecha';
  const d = new Date(s.replace(' ', 'T'));
  const dia = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} · ${hora}`;
};

/**
 * Home de Webinars: primero se elige el webinar, después se ve su embudo.
 *
 * Antes abría solo el último que se había mirado, aunque ya hubiera terminado: el
 * director entraba y lo primero que cargaba era un webinar viejo (Franco, 29-10-2026).
 * El elegido va en la dirección (`?webinar=`): recargar o volver desde una fase lo
 * mantiene, y entrar desde el menú vuelve a preguntar.
 */
export default function Webinars() {
  const [lista, setLista] = useState([]);
  const [params, setParams] = useSearchParams();
  const activoId = Number(params.get('webinar')) || null;
  const setActivoId = (id) => setParams(id ? { webinar: String(id) } : {});
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

  const ordenados = [...lista].sort((x, y) => (ORDEN_ESTADO.indexOf(x.estado) - ORDEN_ESTADO.indexOf(y.estado))
    || (y.fechaHora || '').localeCompare(x.fechaHora || ''));

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
        {/* Sin webinar elegido, la lista de abajo ya es el selector: el de arriba repetía lo
            mismo. Aparece cuando hay uno abierto, para cambiar a otro. */}
        {activoId ? (
          <label className="wb-listado-sel">
            <span className="wb-listado-lab">Listado</span>
            <select
              value={activoId || ''}
              onChange={(e) => setActivoId(Number(e.target.value) || null)}
              aria-label="Elegir webinar del listado"
            >
              <option value="">← Todos los webinars</option>
              {lista.map((w) => (
                <option key={w.id} value={w.id}>{w.nombre}</option>
              ))}
            </select>
          </label>
        ) : <span />}
        <div className="webinar-head-actions">
          {activoId && (
            <Link to={`/webinars/${activoId}`} className="btn ghost">Configurar</Link>
          )}
          <Link to="/webinars/nuevo" className="btn primary">+ Crear</Link>
        </div>
      </div>

      {!activoId ? (
        <section className="wb-elegir">
          <h2>¿Qué webinar querés ver?</h2>
          <div className="wb-elegir-lista">
            {ordenados.map((w) => {
              const [etiqueta, tono] = ESTADO[w.estado] ?? [w.estado, 'off'];
              return (
                <button key={w.id} type="button" className="wb-elegir-item" onClick={() => setActivoId(w.id)}>
                  <span className="wb-elegir-nombre">{w.nombre}</span>
                  <span className="dim wb-elegir-fecha">{fecha(w.fechaHora)}</span>
                  <Pill tone={tono}>{etiqueta}</Pill>
                </button>
              );
            })}
          </div>
        </section>
      ) : cargandoDetalle || !detalle ? (
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
