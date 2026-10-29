import { useState } from 'react';
import PlanillaCalls from '../components/ventas/PlanillaCalls.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { getLlamadasDelMes, sincronizarLlamadas } from '../data/api.js';
import { mesId } from '../lib/format.js';
import { useResource } from '../lib/hooks.js';
import { useMes } from '../lib/MesContext.jsx';

/**
 * Día a día del equipo de ventas: todas las llamadas del mes en una planilla.
 *
 * Antes era un calendario: para cambiar el estado de una llamada había que encontrarla
 * en su semana. Ahora están todas, una por fila, como en la lista de atv-mkt.
 */
export default function VentasOperativaPage() {
  const { mes: elegido } = useMes();
  const mes = elegido || mesId();
  const [tick, setTick] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const { data, loading, error } = useResource(() => getLlamadasDelMes(mes), [mes, tick]);
  const recargar = () => setTick((t) => t + 1);

  // Actualizar es ir a mirar el calendario de verdad, no releer lo mismo: la lista sale
  // de la base de ATV Ops y el sync es el que la pone al día.
  const actualizar = async () => {
    setSincronizando(true);
    try {
      await sincronizarLlamadas();
    } catch {
      /* si el sync falla igual se refresca: se ve lo último que quedó guardado */
    } finally {
      setSincronizando(false);
      recargar();
    }
  };

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  return (
    <div className="page ventas-page pagina-ancha">
      <div className="pag-acciones">
        <button className="btn" onClick={actualizar} disabled={loading || sincronizando}>
          <span className={`recargar-icono${loading || sincronizando ? ' girando' : ''}`}>⟳</span> Actualizar
        </button>
      </div>
      {!data ? <SkeletonBlock height={520} /> : <PlanillaCalls datos={data} mes={mes} onRecargar={recargar} />}
    </div>
  );
}
