import { useCallback, useState } from 'react';
import VentasOperativa from '../components/ventas/VentasOperativa.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import { getEstadoReuniones, getLlamadosAgenda, getVentas } from '../data/api.js';
import { useResource } from '../lib/hooks.js';
import { useMes } from '../lib/MesContext.jsx';

/** Día a día del equipo de ventas. */
export default function VentasOperativaPage() {
  const { mes } = useMes();
  const { data, loading, error } = useResource(() => getVentas(mes), [mes]);
  const [tick, setTick] = useState(0);
  // El calendario avisa qué semana o mes está mostrando y se trae justo ese rango.
  const [rango, setRango] = useState(null);
  const onRango = useCallback((desde, hasta) => setRango({ desde, hasta }), []);
  const { data: agenda, loading: cargandoAgenda, error: agendaError } = useResource(
    () => getLlamadosAgenda({ refrescar: tick > 0, ...(rango ?? {}) }),
    [tick, rango?.desde, rango?.hasta],
  );
  // Qué reunión ya tiene resultado cargado, para pintarla y poder editarla ahí mismo.
  const { data: reuniones } = useResource(
    () => (rango ? getEstadoReuniones(rango) : Promise.resolve(null)),
    [tick, rango?.desde, rango?.hasta],
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
          onRango={onRango}
          reuniones={reuniones}
          onCargado={() => setTick((t) => t + 1)}
        />
      )}
    </div>
  );
}
