import { useMemo, useState } from 'react';
import ListaLlamadas from '../components/ventas/ListaLlamadas.jsx';
import Card from '../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import SourceTag from '../components/ui/SourceTag.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import { formatValue } from '../lib/format.js';
import { getMisLlamadas } from '../data/api.js';
import { useResource } from '../lib/hooks.js';
import { useMes } from '../lib/MesContext.jsx';

const FILTROS = [
  { value: 'todas', label: 'Todas' },
  { value: 'cierre', label: 'Ventas' },
  { value: 'show', label: 'Con show' },
  { value: 'no_show', label: 'No show' },
  { value: 'agendado', label: 'Por venir' },
  { value: 'descartada', label: 'Descartadas' },
];

/** Historial de llamadas del closer, con el resultado que cargó en cada una. */
export default function VentasLlamadas() {
  const [tick, setTick] = useState(0);
  const [local, setLocal] = useState(null);
  const [filtro, setFiltro] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
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

  const cargadas = (vista?.llamadas ?? []).filter((l) => !['sin_reportar', 'agendado', 'sin_crm'].includes(l.estado));

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  return (
    <div className="page ventas-page">
      <PageHeader
        eyebrow={vista?.closer ? `Closer · ${vista.closer}` : 'Closer'}
        title="Llamadas"
        desc="Todas tus reuniones del mes elegido, con el resultado que cargaste en cada una. Tocá una para corregirla."
        actions={
          <>
            <SourceTag sourceId="mkt_crm" updatedAt={vista?.generadoAt} />
            <button className="btn" onClick={() => { setLocal(null); setTick((t) => t + 1); }} disabled={loading}>
              <span className={`recargar-icono${loading ? ' girando' : ''}`}>⟳</span> Actualizar
            </button>
          </>
        }
      />

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
            <ListaLlamadas
              llamadas={filas}
              programas={vista?.programas ?? []}
              estados={vista?.estados ?? []}
              onActualizado={setLocal}
              mes={mes}
            />
          </Card>
        </>
      )}
    </div>
  );
}
