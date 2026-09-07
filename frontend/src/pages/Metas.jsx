import { useState } from 'react';
import MetaMesForm from '../components/metas/MetaMesForm.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { getMetasMes } from '../data/api.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';
import { decretoPlantilla, leerDecretos, mesEsInmutable } from '../lib/metasMes.js';
import { nombreMesDesdeId } from '../lib/mes.js';

/**
 * Vista para fijar el decreto de metas de cada mes.
 * El mes activo del topbar es el que se edita.
 */
export default function Metas() {
  const { mes, nombreMes, setMes, opciones } = useMes();
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
  const decreto = data.decreto?.creadoAt
    ? data.decreto
    : decretoPlantilla(mes, data.decreto);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Compromiso mensual"
        title={`Metas · ${nombreMes}`}
        desc="Acá fijás el decreto del mes: chats, conversaciones, agendas, rates y cash. El resto del tablero compara el real contra estos números."
      />

      <div className="metas-page-toolbar">
        <div className="metas-page-status">
          <Pill tone={inmutable ? 'off' : 'ok'} dot>
            {inmutable ? 'Mes cerrado · solo lectura' : 'Mes editable'}
          </Pill>
          {data.decreto?.creadoAt ? (
            <span className="dim" style={{ fontSize: 12.5 }}>
              Decreto cargado
            </span>
          ) : (
            <span className="dim" style={{ fontSize: 12.5 }}>
              Sin decreto guardado · plantilla sugerida
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
        editable={!inmutable}
        onGuardado={() => setTick((n) => n + 1)}
      />

      <p className="dim" style={{ fontSize: 12.5, marginTop: 12, maxWidth: 560 }}>
        Tip: cambiá el mes en el topbar para cargar o editar otro período.
        Opciones disponibles: {opciones.map((o) => o.label).join(', ')}.
      </p>
    </div>
  );
}
