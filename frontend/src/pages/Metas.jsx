import { useState } from 'react';
import MetaMesForm from '../components/metas/MetaMesForm.jsx';
import DependeDelEquipo from '../components/metas/DependeDelEquipo.jsx';
import MetasIndividuales from '../components/metas/MetasIndividuales.jsx';
import MetasPersonales from '../components/metas/MetasPersonales.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import { getCloserDashboard, getMetasMes, getSetterDashboard, getVentasReal } from '../data/api.js';
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
  const { rol, user } = useRol();
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
  const [vista, setVista] = useState('equipo');
  // Para comparar la meta del equipo con lo que lleva cada uno hace falta el real por persona.
  const ventas = useResource(() => getVentasReal(mes), [mes, tick]);

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

  // Cuánto del mes transcurrió: sirve para saber si alguien va en ritmo o atrasado.
  const esperadoDelMes = Math.min(100, Math.round((ctx.diaHoy / (ctx.diasMes || 30)) * 100));

  const bloquesIndividuales = (() => {
    const d = ventas.data;
    if (!d) return [];
    const bloques = [];
    const soloMio = (lista) => {
      // El closer o setter ve su fila; quien mira todo el área las ve todas.
      if (puedeVerVentasDirector(rol) || puedeEditar) return lista;
      const yo = (personal.data?.closer || personal.data?.setter || user?.nombre || user?.username || '').trim().toLowerCase();
      return yo ? lista.filter((x) => x.nombre.trim().toLowerCase().includes(yo.split(' ')[0])) : lista;
    };

    // La parte de cada uno se calcula sobre todo el equipo, aunque después se muestre
    // una sola fila: si no, al closer le aparecería toda la meta como si fuera suya.
    const todosClosers = (d.porCloser ?? []).filter((c) => c.nombre !== 'Sin asignar');
    const closers = soloMio(todosClosers);
    if (closers.length) {
      const n = todosClosers.length || 1;
      const showsMeta = Math.round((decreto.agendas ?? 0) * ((decreto.showUpRate ?? 0) / 100));
      // El closer no responde por las agendas: eso lo trae el setter. Su trabajo empieza
      // cuando la llamada se hace, así que mide shows, cierres, close rate y cash.
      const cols = [
        { id: 'shows', nombre: 'Shows', meta: showsMeta },
        { id: 'cierres', nombre: 'Cierres', meta: Math.round(showsMeta * ((decreto.closeRateBueno ?? 0) / 100)) },
        { id: 'closeRate', nombre: 'Close rate', format: 'pct', meta: decreto.closeRateBueno ?? 0, sinDividir: true },
        { id: 'cashUsd', nombre: 'Cash cobrado', format: 'usd', meta: decreto.cashMeta ?? 0 },
      ];
      const tasa = (cierres, shows) => (shows > 0 ? Math.round((cierres / shows) * 1000) / 10 : 0);
      const valor = (c, id) => (id === 'closeRate' ? tasa(c.cierres ?? 0, c.shows ?? 0) : (c[id] ?? 0));
      bloques.push({
        id: 'closers',
        titulo: 'Closers',
        sub: 'Lo que lleva cada uno contra la parte que le toca de la meta del mes.',
        columnas: cols,
        gente: n,
        filas: closers.map((c) => ({
          persona: c.nombre,
          metricas: cols.map((col) => ({
            id: col.id, format: col.format,
            actual: valor(c, col.id),
            // Un porcentaje no se reparte: la meta de close rate es la misma para todos.
            parte: col.sinDividir ? col.meta : Math.round(col.meta / n),
          })),
        })),
      });
    }

    const todosSetters = (d.porSetter ?? []).filter((c) => c.nombre !== 'Sin asignar');
    const setters = soloMio(todosSetters);
    if (setters.length) {
      const n = todosSetters.length || 1;
      const cols = [{ id: 'agendados', nombre: 'Llamadas agendadas' }];
      const metas = { agendados: decreto.agendas ?? 0 };
      bloques.push({
        id: 'setters',
        titulo: 'Setters',
        sub: 'Las agendas que trajo cada uno contra la parte que le toca.',
        columnas: cols,
        gente: n,
        filas: setters.map((c) => ({
          persona: c.nombre,
          metricas: cols.map((col) => ({
            id: col.id, format: col.format,
            actual: c[col.id] ?? 0,
            parte: Math.round((metas[col.id] ?? 0) / n),
          })),
        })),
      });
    }
    return bloques;
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

      <Tabs
        value={vista}
        onChange={setVista}
        options={[
          { value: 'equipo', label: 'Metas del equipo' },
          { value: 'individuales', label: 'Metas individuales' },
        ]}
      />

      {vista === 'equipo' ? (
        <MetaMesForm
          decretoInicial={decreto}
          mes={mes}
          nombreMes={nombreMes}
          editable={editable}
          onGuardado={() => setTick((n) => n + 1)}
        />
      ) : (
        <>
          {cuotaItems && (
            <MetasPersonales
              items={cuotaItems}
              diaHoy={ctx.diaHoy}
              diasMes={ctx.diasMes}
            />
          )}
          {bloquesIndividuales.map((b) => (
            <MetasIndividuales key={b.id} {...b} esperado={esperadoDelMes} />
          ))}
          {ventas.data?.actual && (
            <DependeDelEquipo
              decreto={decreto}
              actual={ventas.data.actual}
              semanasRestantes={Math.max(Math.ceil(((ctx.diasMes || 30) - ctx.diaHoy) / 7), 0)}
              setters={(ventas.data.porSetter ?? []).filter((x) => x.nombre !== 'Sin asignar')}
            />
          )}
        </>
      )}
    </div>
  );
}
