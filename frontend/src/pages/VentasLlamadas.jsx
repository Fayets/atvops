import { useMemo, useState } from 'react';
import NuevaReunion from '../components/ventas/NuevaReunion.jsx';
import TablaLlamadas from '../components/ventas/TablaLlamadas.jsx';
import Card from '../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import { formatValue } from '../lib/format.js';
import { getMisLlamadas, sincronizarLlamadas } from '../data/api.js';
import { useResource } from '../lib/hooks.js';
import { useMes } from '../lib/MesContext.jsx';

const FILTROS = [
  { value: 'todas', label: 'Todas' },
  { value: 'sin_reportar', label: 'Falta cargar' },
  { value: 'cierre', label: 'Ventas' },
  { value: 'show', label: 'Con show' },
  { value: 'no_show', label: 'No show' },
  { value: 'agendado', label: 'Por venir' },
  { value: 'descartada', label: 'Descartadas' },
];

/** Las llamadas del closer, con el resultado que cargó en cada una. */
export default function VentasLlamadas() {
  const [tick, setTick] = useState(0);
  const [local, setLocal] = useState(null);
  const [filtro, setFiltro] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const [sincronizando, setSincronizando] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const { mes } = useMes();
  const { data, loading, error } = useResource(() => getMisLlamadas(undefined, mes), [tick, mes]);
  const vista = local ?? data;

  const filas = useMemo(() => {
    const todas = vista?.llamadas ?? [];
    const q = busqueda.trim().toLowerCase();
    return todas
      .filter((l) => (filtro === 'todas' ? l.estado !== 'descartada' : l.estado === filtro))
      .filter((l) => (q ? l.prospecto.toLowerCase().includes(q) : true));
  }, [vista, filtro, busqueda]);

  // Sobre las mismas que se muestran: contarlas sobre todas incluía las descartadas y
  // daba más cargadas que reuniones ("44 reuniones · 51 con resultado cargado").
  const cargadas = filas.filter((l) => !['sin_reportar', 'agendado', 'sin_crm'].includes(l.estado));

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
    <div className="page ventas-page">
      <div className="pag-acciones">
        <button className="btn" onClick={() => setAgregando(true)}>+ Reunión</button>
        <button className="btn" onClick={actualizar} disabled={loading || sincronizando}>
          <span className={`recargar-icono${loading || sincronizando ? ' girando' : ''}`}>⟳</span> Actualizar
        </button>
      </div>

      {loading && !vista ? (
        <SkeletonBlock height={420} />
      ) : (
        <>
          <div className="filtros">
            <div className="buscador">
              <span style={{ color: 'var(--text-3)' }}>⌕</span>
              <input
                type="search"
                placeholder="Buscar prospecto"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                aria-label="Buscar prospecto"
              />
            </div>
            <Tabs value={filtro} onChange={setFiltro} options={FILTROS} />
          </div>

          <Card
            title={`${filas.length} reuniones`}
            sub={`${cargadas.length} con resultado cargado · ${formatValue(vista?.mes?.cashUsd ?? 0, 'usd')} cobrados en el mes`}
            flush
          >
            <TablaLlamadas
              llamadas={filas}
              programas={vista?.programas ?? []}
              estados={vista?.estados ?? []}
              equipo={vista?.equipo ?? []}
              onActualizado={(nuevo) => {
                // El backend avisa cuando guardó pero no pudo rearmar la lista: se recarga.
                if (nuevo?.guardado) refrescar(); else setLocal(nuevo);
              }}
              mes={mes}
            />
          </Card>
        </>
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
