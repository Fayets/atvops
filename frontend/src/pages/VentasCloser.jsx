import { useCallback, useEffect, useState } from 'react';
import EmbudoVentas from '../components/ventas/EmbudoVentas.jsx';
import MiDiaCloser from '../components/ventas/MiDiaCloser.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import { getEmbudoSetting, getMiEmbudo, getMisLlamadas } from '../data/api.js';
import { mesAnterior, mesId, nombreDelMes } from '../lib/format.js';
import { useResource } from '../lib/hooks.js';
import { alActualizarLlamadas } from '../lib/llamadasSync.js';
import { useMes } from '../lib/MesContext.jsx';

/**
 * Mi día: los números del mes del closer y, abajo, el mismo embudo que ve el director,
 * con sus llamadas. Los chats del embudo son del equipo: los abre el setter para todos.
 */
export default function VentasCloser() {
  const { mes } = useMes();
  const elMes = mes || mesId();
  const previo = mesAnterior(elMes);
  const [tick, setTick] = useState(0);
  const [local, setLocal] = useState(null);
  // El mes en curso: así entran las del calendario del 1° al 30, no solo ±30 días.
  const { data, loading, error } = useResource(
    () => getMisLlamadas(undefined, mes || mesId()),
    [tick, mes],
  );
  const vista = local ?? data;
  const embudo = useResource(() => getMiEmbudo(elMes), [tick, elMes]);
  const chats = useResource(() => getEmbudoSetting(elMes), [elMes]);
  const chatsPrevio = useResource(() => getEmbudoSetting(previo), [previo]);
  // Cargar un resultado o agregar una reunión tiene que mover los números de arriba.
  const refrescar = useCallback(() => { setLocal(null); setTick((t) => t + 1); }, []);

  // Si el closer cargó pendientes en el gate, el calendario de atrás tiene que
  // repintarse sin esperar un F5.
  useEffect(() => alActualizarLlamadas(refrescar), [refrescar]);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  return (
    <div className="page ventas-page">
      <div className="pag-acciones">
        <button className="btn" onClick={() => { setLocal(null); setTick((t) => t + 1); }} disabled={loading}>
          <span className={`recargar-icono${loading ? ' girando' : ''}`}>⟳</span> Actualizar
        </button>
      </div>

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
        <>
          <MiDiaCloser data={vista} onCambio={refrescar} syncKey={tick} />
          {embudo.data ? (
            <EmbudoVentas real={embudo.data} embudo={chats.data} embudoPrevio={chatsPrevio.data}
              mesPrevio={nombreDelMes(previo)} />
          ) : <SkeletonBlock height={420} />}
        </>
      )}
    </div>
  );
}
