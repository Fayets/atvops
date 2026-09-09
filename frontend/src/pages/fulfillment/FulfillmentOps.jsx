import FulfillmentOpsCalidad from '../../components/fulfillment/FulfillmentOpsCalidad.jsx';
import FulfillmentOpsExpansion from '../../components/fulfillment/FulfillmentOpsExpansion.jsx';
import FulfillmentOpsResumen from '../../components/fulfillment/FulfillmentOpsResumen.jsx';
import FulfillmentOpsSalud from '../../components/fulfillment/FulfillmentOpsSalud.jsx';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import { getFulfillmentOps } from '../../data/api.js';
import { useResource } from '../../lib/hooks.js';

/**
 * Vista OPS de Fulfillment: cartera, Caja 2, salud y calidad agregadas.
 * Para Franco (admin/ops) y reporte al Founder — no el día a día de Mauri.
 */
export default function FulfillmentOps() {
  const { data, loading, error } = useResource(getFulfillmentOps);

  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} />
      </div>
    );
  }

  return (
    <div className="page ff-ops-page">
      <PageHeader
        eyebrow="OPS · Fulfillment"
        title="Salud de cartera"
        desc="Expansión, retención y calidad agregadas. Para decidir y reportar — no para operar cliente a cliente."
        actions={<SourceTag sourceId="discord_transcripts" updatedAt={data?.syncAt} />}
      />

      {loading || !data ? (
        <>
          <SkeletonBlock height={180} />
          <SkeletonBlock height={280} />
          <SkeletonBlock height={240} />
        </>
      ) : (
        <div className="ff-ops">
          <FulfillmentOpsResumen resumen={data.resumen} contexto={data.contexto} />
          <FulfillmentOpsExpansion expansion={data.expansion} />
          <FulfillmentOpsSalud salud={data.salud} />
          <FulfillmentOpsCalidad calidad={data.calidad} />
        </div>
      )}
    </div>
  );
}
