import { useState } from 'react';
import ListaCloser from '../components/ventas/ListaCloser.jsx';
import NuevaReunion from '../components/ventas/NuevaReunion.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { getMisLlamadas, sincronizarLlamadas } from '../data/api.js';
import { useResource } from '../lib/hooks.js';
import { useMes } from '../lib/MesContext.jsx';

/** Las llamadas del closer, por día, con la ficha de la que está mirando al costado. */
export default function VentasLlamadas() {
  const [tick, setTick] = useState(0);
  const [local, setLocal] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const { mes } = useMes();
  const { data, loading, error } = useResource(() => getMisLlamadas(undefined, mes), [tick, mes]);
  const vista = local ?? data;

  const refrescar = () => { setLocal(null); setTick((t) => t + 1); };

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
      refrescar();
    }
  };

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  return (
    <div className="page ventas-page pagina-ancha">
      <div className="pag-acciones">
        <button className="btn" onClick={() => setAgregando(true)}>+ Reunión</button>
        <button className="btn" onClick={actualizar} disabled={loading || sincronizando}>
          <span className={`recargar-icono${loading || sincronizando ? ' girando' : ''}`}>⟳</span> Actualizar
        </button>
      </div>

      {loading && !vista ? (
        <SkeletonBlock height={420} />
      ) : (
        <ListaCloser
          datos={{
            llamadas: vista?.llamadas ?? [],
            programas: vista?.programas ?? [],
            estados: vista?.estados ?? [],
            equipo: vista?.equipo ?? [],
          }}
          mes={mes}
          // El backend avisa cuando guardó pero no pudo rearmar la lista: se recarga.
          onActualizado={(nuevo) => { if (!nuevo || nuevo.guardado) refrescar(); else setLocal(nuevo); }}
        />
      )}

      {agregando && (
        <NuevaReunion
          programas={vista?.programas ?? []}
          estados={vista?.estados ?? []}
          onCreada={refrescar}
          onCerrar={() => setAgregando(false)}
        />
      )}
    </div>
  );
}
