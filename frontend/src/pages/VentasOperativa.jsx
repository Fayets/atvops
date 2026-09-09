import { useState } from 'react';
import VentasOperativa from '../components/ventas/VentasOperativa.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import SourceTag from '../components/ui/SourceTag.jsx';
import { getLlamadosAgenda, getVentas } from '../data/api.js';
import { useResource } from '../lib/hooks.js';

/** Día a día del equipo de ventas. */
export default function VentasOperativaPage() {
  const { data, loading, error } = useResource(getVentas);
  const [tick, setTick] = useState(0);
  const { data: agenda, loading: cargandoAgenda, error: agendaError } = useResource(
    () => getLlamadosAgenda({ refrescar: tick > 0 }),
    [tick],
  );

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
        title="Operativa"
        desc="La agenda real de Google Calendar, reportes del equipo, pipeline y follow-ups del día."
        actions={<SourceTag sourceId="calendly" updatedAt={agenda?.generadoAt ?? data?.syncAt} />}
      />

      {loading || !data ? (
        <>
          <SkeletonKpis />
          <SkeletonBlock height={360} />
        </>
      ) : (
        <VentasOperativa
          data={data}
          agenda={agenda}
          agendaError={agendaError}
          actualizando={cargandoAgenda}
          onActualizar={() => setTick((t) => t + 1)}
        />
      )}
    </div>
  );
}
