import { useState } from 'react';
import MetaMesForm from '../components/metas/MetaMesForm.jsx';
import MetasPersonales from '../components/metas/MetasPersonales.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { getCloserDashboard, getMetasMes, getSetterDashboard } from '../data/api.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';
import { useRol } from '../lib/RolContext.jsx';
import { decretoPlantilla, leerDecretos, mesEsInmutable } from '../lib/metasMes.js';
import { nombreMesDesdeId } from '../lib/mes.js';
import {
  puedeEditarMetas,
  puedeVerVentasCloser,
  puedeVerVentasDirector,
  puedeVerVentasSetter,
} from '../lib/roles.js';

/**
 * Metas del mes: todos ven los números del decreto.
 * Closer / Setter ven además su cuota en números (como MetaRow del home).
 * Solo admin y operaciones pueden editar el decreto.
 */
export default function Metas() {
  const { mes, nombreMes, setMes } = useMes();
  const { rol } = useRol();
  const puedeEditar = puedeEditarMetas(rol);
  const esCloser = puedeVerVentasCloser(rol) && !puedeVerVentasDirector(rol);
  const esSetter = puedeVerVentasSetter(rol) && !puedeVerVentasDirector(rol);
  const [tick, setTick] = useState(0);
  const { data, loading, error } = useResource(() => getMetasMes(mes), [mes, tick]);
  const personal = useResource(
    () => (esCloser ? getCloserDashboard() : esSetter ? getSetterDashboard() : Promise.resolve(null)),
    [mes, tick, esCloser, esSetter],
  );
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

  const ctx = personal.data?.contexto ?? data.contexto ?? { diaHoy: 9, diasMes: 30 };
  const cuotaItems = (() => {
    if (esSetter && personal.data?.metaMes) {
      const m = personal.data.metaMes.cuotaMes;
      const act = personal.data.kpisMes ?? [];
      const v = (id) => act.find((k) => k.id === id)?.value ?? 0;
      return [
        { id: 'calendlys', nombre: 'Calendlys enviados', meta: m.aplicaciones, actual: v('apps_mes') },
        { id: 'agendas', nombre: 'Llamadas agendadas', meta: m.agendadas, actual: v('agendadas_mes') },
        { id: 'tasa', nombre: 'Tasa de agendado', meta: m.tasaAgendado, actual: v('tasa'), format: 'pct' },
      ];
    }
    if (esCloser && personal.data?.metaMes) {
      const c = personal.data.metaMes.cuota;
      const act = personal.data.kpis ?? [];
      const v = (id) => act.find((k) => k.id === id)?.value ?? 0;
      return [
        { id: 'llamadas', nombre: 'Llamadas', meta: c.llamadas, actual: v('llamadas') },
        { id: 'shows', nombre: 'Shows', meta: c.shows, actual: v('shows') },
        { id: 'cierres', nombre: 'Cierres', meta: c.cierres, actual: v('cierres') },
        { id: 'cash', nombre: 'Cash', meta: c.cashUsd, actual: v('cash'), format: 'usd' },
      ];
    }
    return null;
  })();

  return (
    <div className="page">
      <PageHeader
        eyebrow="Compromiso mensual"
        title={`Metas · ${nombreMes}`}
        desc={
          editable
            ? 'Acá fijás el decreto del mes: chats, conversaciones, agendas, rates y cash. El resto del tablero compara el real contra estos números.'
            : esCloser || esSetter
              ? 'Tu cuota en números (alineada al decreto) y el compromiso del mes en solo lectura.'
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

      {cuotaItems && (
        <MetasPersonales
          items={cuotaItems}
          diaHoy={ctx.diaHoy}
          diasMes={ctx.diasMes}
        />
      )}

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
