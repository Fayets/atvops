import VentasPerformance from '../components/ventas/VentasPerformance.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import SourceTag from '../components/ui/SourceTag.jsx';
import { getVentas } from '../data/api.js';
import { useResource } from '../lib/hooks.js';

/** Salud del funnel y rendimiento del equipo. */
export default function VentasPerformancePage() {
  const { data, loading, error } = useResource(getVentas);

  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} />
      </div>
    );
  }

  return (
    <div className="page ventas-page">
      <PageHeader
        eyebrow="Director de Ventas · Lucas"
        title="Performance"
        desc="KPIs, tablas por closer/setter, embudo y proyección vs meta."
        actions={<SourceTag sourceId="manual" updatedAt={data?.syncAt} />}
      />

      {loading || !data ? (
        <>
          <SkeletonKpis />
          <SkeletonBlock height={360} />
        </>
      ) : (
        <VentasPerformance data={data} />
      )}
    </div>
  );
}
