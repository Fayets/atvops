import { useState } from 'react';
import MetaMesForm from '../components/metas/MetaMesForm.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { getMetasMes } from '../data/api.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';
import { useRol } from '../lib/RolContext.jsx';
import { decretoPlantilla, leerDecretos, mesEsInmutable } from '../lib/metasMes.js';
import { nombreMesDesdeId } from '../lib/mes.js';
import { puedeEditarMetas } from '../lib/roles.js';

/**
 * Metas del mes: todos ven los números del decreto.
 * Solo admin y operaciones pueden editarlos.
 */
export default function Metas() {
  const { mes, nombreMes, setMes } = useMes();
  const { rol } = useRol();
  const puedeEditar = puedeEditarMetas(rol);
  const [tick, setTick] = useState(0);
  const { data, loading, error } = useResource(() => getMetasMes(mes), [mes, tick]);
  const guardados = Object.keys(leerDecretos()).sort().reverse();

  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (loading || !data) {
    return (
      <div className="page">
        <SkeletonBlock height={80} />
        <SkeletonBlock height={420} />
      </div>
    );
  }

  const inmutable = mesEsInmutable(mes);
  const editable = puedeEditar && !inmutable;
  const decreto = data.decreto?.creadoAt
    ? data.decreto
    : decretoPlantilla(mes, data.decreto);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Compromiso mensual"
        title={`Metas · ${nombreMes}`}
        desc={
          editable
            ? 'Acá fijás el decreto del mes: chats, conversaciones, agendas, rates y cash. El resto del tablero compara el real contra estos números.'
            : 'Números del decreto del mes. Solo Admin y Operaciones pueden modificarlos.'
        }
      />

      <div className="metas-page-toolbar">
        <div className="metas-page-status">
          <Pill tone={editable ? 'ok' : 'off'} dot>
            {inmutable
              ? 'Mes cerrado · solo lectura'
              : editable
                ? 'Mes editable'
                : 'Solo lectura'}
          </Pill>
          {data.decreto?.creadoAt ? (
            <span className="dim" style={{ fontSize: 12.5 }}>
              Decreto cargado
            </span>
          ) : (
            <span className="dim" style={{ fontSize: 12.5 }}>
              {editable ? 'Sin decreto guardado · plantilla sugerida' : 'Sin decreto guardado · plantilla de referencia'}
            </span>
          )}
        </div>

        {guardados.length > 0 ? (
          <div className="metas-page-hist">
            <span className="dim" style={{ fontSize: 12 }}>Meses con decreto</span>
            <div className="metas-page-chips">
              {guardados.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`btn${m === mes ? ' primary' : ''}`}
                  onClick={() => setMes(m)}
                >
                  {nombreMesDesdeId(m)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <MetaMesForm
        decretoInicial={decreto}
        mes={mes}
        nombreMes={nombreMes}
        editable={editable}
        onGuardado={() => setTick((n) => n + 1)}
      />
    </div>
  );
}
