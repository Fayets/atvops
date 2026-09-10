import { useState } from 'react';
import MiDiaCloser from '../components/ventas/MiDiaCloser.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import SourceTag from '../components/ui/SourceTag.jsx';
import { getMisLlamadas } from '../data/api.js';
import { useResource } from '../lib/hooks.js';

/** Mi día: las llamadas del closer, para cargar el resultado de cada una. */
export default function VentasCloser() {
  const [tick, setTick] = useState(0);
  const [local, setLocal] = useState(null);
  const { data, loading, error } = useResource(getMisLlamadas, [tick]);
  const vista = local ?? data;

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  return (
    <div className="page ventas-page">
      <PageHeader
        eyebrow={vista?.closer ? `Closer · ${vista.closer}` : 'Closer'}
        title="Mi día"
        desc="Tus números del mes y el calendario del equipo."
        actions={
          <>
            <SourceTag sourceId="mkt_crm" updatedAt={vista?.generadoAt} />
            <button className="btn" onClick={() => { setLocal(null); setTick((t) => t + 1); }} disabled={loading}>
              <span className={`recargar-icono${loading ? ' girando' : ''}`}>⟳</span> Actualizar
            </button>
          </>
        }
      />

      {loading && !vista ? (
        <>
          <SkeletonKpis n={4} />
          <SkeletonBlock height={320} />
        </>
      ) : !vista?.closer ? (
        <div className="empty">
          No encontramos llamadas a tu nombre en el CRM. Pedile a Franco que revise cómo figurás como closer.
        </div>
      ) : (
        <MiDiaCloser data={vista} />
      )}
    </div>
  );
}
