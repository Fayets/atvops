import { useState } from 'react';
import PlanillaCalls from '../components/ventas/PlanillaCalls.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { getMisLlamadas, sincronizarLlamadas } from '../data/api.js';
import { mesId } from '../lib/format.js';
import { useResource } from '../lib/hooks.js';
import { useMes } from '../lib/MesContext.jsx';

/**
 * Las llamadas del closer, en la misma planilla que ve el director. Cambia qué llamadas
 * entran —las suyas y las que todavía no tienen dueño—, no cómo se ven ni cómo se cargan.
 */
export default function VentasLlamadas() {
  const { mes: elegido } = useMes();
  const mes = elegido || mesId();
  const [tick, setTick] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const { data, loading, error } = useResource(() => getMisLlamadas(undefined, mes), [mes, tick]);
  const recargar = () => setTick((t) => t + 1);

  // Actualizar es ir a mirar el calendario de verdad, no releer lo mismo: la vista sale
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
      {!data ? <SkeletonBlock height={520} /> : (
        <PlanillaCalls
          datos={{
            llamadas: data.llamadas ?? [],
            programas: data.programas ?? [],
            estados: data.estados ?? [],
            equipo: data.equipo ?? [],
          }}
          mes={mes}
          onRecargar={recargar}
        />
      )}
    </div>
  );
}
