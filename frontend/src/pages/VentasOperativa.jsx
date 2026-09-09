import { useState } from 'react';
import VentasOperativa from '../components/ventas/VentasOperativa.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import { getLlamadosAgenda, getVentas } from '../data/api.js';
import { useResource } from '../lib/hooks.js';
import { useMes } from '../lib/MesContext.jsx';

/** Día a día del equipo de ventas. */
export default function VentasOperativaPage() {
  const { mes } = useMes();
  const { data, loading, error } = useResource(() => getVentas(mes), [mes]);
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
