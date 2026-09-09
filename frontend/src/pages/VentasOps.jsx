import VentasOpsFunnel from '../components/ventas/VentasOpsFunnel.jsx';
import VentasOpsKpis from '../components/ventas/VentasOpsKpis.jsx';
import VentasOpsProyeccion from '../components/ventas/VentasOpsProyeccion.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import SourceTag from '../components/ui/SourceTag.jsx';
import { getVentasOps } from '../data/api.js';
import { useResource } from '../lib/hooks.js';
import { useMes } from '../lib/MesContext.jsx';

/**
 * Vista OPS de Ventas: ¿llegamos a la meta? ¿dónde está el cuello?
 * Para Franco (admin/ops) y reporte al Founder — sin día a día del equipo.
 */
export default function VentasOps() {
  const { mes } = useMes();
  const { data, loading, error } = useResource(() => getVentasOps(mes), [mes]);

  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} />
      </div>
    );
  }

  return (
    <div className="page ventas-page ventas-ops-page">
      <PageHeader
        eyebrow="OPS · Ventas"
        title="Salud vs meta"
        desc="Proyección, funnel math y rates. Para decidir y reportar — no para operar el día a día."
        actions={<SourceTag sourceId="mkt_crm" updatedAt={data?.syncAt} />}
      />

      {loading || !data ? (
        <>
          <SkeletonBlock height={200} />
          <SkeletonBlock height={280} />
          <SkeletonKpis n={3} />
        </>
      ) : (
        <div className="ventas-ops">
          <VentasOpsProyeccion proyeccion={data.proyeccion} contexto={data.contexto} />
          <VentasOpsFunnel funnel={data.funnel} diagnostico={data.diagnostico} />
          <VentasOpsKpis kpis={data.kpis} alertaKpis={data.alertaKpis} />
        </div>
      )}
    </div>
  );
}
