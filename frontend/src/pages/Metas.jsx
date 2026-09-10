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
import { formatValue } from '../lib/format.js';
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
    const miNombre = (personal.data?.closer || personal.data?.setter
      || personal.data?.perfil?.nombre || user?.nombre || user?.username || '').trim();
    const soloMio = (lista, deMiRol) => {
      // El closer o setter ve su fila; quien mira todo el área las ve todas.
      if (puedeVerVentasDirector(rol) || puedeEditar) return lista;
      if (!miNombre) return lista;
      const pila = miNombre.toLowerCase().split(' ')[0];
      const mias = lista.filter((x) => x.nombre.trim().toLowerCase().includes(pila));
      // Si todavía no hizo nada este mes no aparece en el corte: igual tiene que ver su
      // fila en cero, si no la pantalla queda vacía y parece rota.
      if (!mias.length && deMiRol) return [{ nombre: miNombre }];
      return mias;
    };
    // La meta del decreto no se reparte: cada uno carga la del equipo entera.
    const armar = (id, titulo, sub, columnas, gente, filas) => {
      if (!filas.length) return;
      bloques.push({
        id, titulo, sub, columnas, gente,
        filas: filas.map((f) => ({
          persona: f.nombre,
          metricas: columnas.map((c) => ({
            id: c.id, format: c.format, actual: c.valor(f), parte: c.meta,
          })),
        })),
      });
    };

    // Quién ocupa cada rol sale de los usuarios de ATV Ops, no de quién aparece en el CRM:
    // así el que todavía no hizo nada este mes igual ve su fila, y no aparece gente de otro rol.
    const gente = (nombres, filasCrm) => {
      if (!nombres?.length) return filasCrm;
      return nombres.map((n) => {
        const pila = n.trim().toLowerCase().split(' ')[0];
        return filasCrm.find((f) => f.nombre.trim().toLowerCase().includes(pila)) ?? { nombre: n };
      });
    };

    // Closer: su trabajo empieza cuando la llamada existe. Mide tasas, no cantidades.
    const closers = gente(d.equipoOps?.closers, (d.porCloser ?? []).filter((c) => c.nombre !== 'Sin asignar'));
    armar(
      'closers', 'Closers',
      `Las tasas del mes contra el decreto. Close rate muy bueno: ${formatValue(decreto.closeRateMuyBueno ?? 0, 'pct')}.`,
      [
        { id: 'showRate', nombre: 'Show rate', format: 'pct', meta: decreto.showUpRate ?? 0, valor: (c) => c.showRate ?? 0 },
        { id: 'closeRate', nombre: 'Close rate', format: 'pct', meta: decreto.closeRateBueno ?? 0, valor: (c) => c.closeRate ?? 0 },
      ],
      closers.length, soloMio(closers, esCloser),
    );

    // Setter: trae las conversaciones y las agendas.
    const setters = gente(d.equipoOps?.setters, (d.porSetter ?? []).filter((c) => c.nombre !== 'Sin asignar'));
    const conversacionesDe = (s) =>
      (d.settersMes ?? []).find((x) => x.nombre === s.nombre)?.metricas?.conversaciones ?? 0;
    armar(
      'setters', 'Setters', 'Lo que tiene que entrar para que haya llamadas que tomar.',
      [
        { id: 'conversaciones', nombre: 'Conversaciones', meta: decreto.conversaciones ?? 0, valor: conversacionesDe },
        { id: 'agendas', nombre: 'Llamadas agendadas', meta: decreto.agendas ?? 0, valor: (s) => s.agendados ?? 0 },
      ],
      setters.length, soloMio(setters, esSetter),
    );

    // Marketing: abre los chats de los que salen las conversaciones.
    const chats = d.topFunnel?.chats ?? 0;
    if (puedeVerVentasDirector(rol) || puedeEditar) {
      armar(
        'marketing', 'Marketing', 'Los chats abiertos, que son el techo de todo lo de abajo.',
        [{ id: 'chats', nombre: 'Chats abiertos', meta: decreto.chats ?? 0, valor: (m) => m.chats ?? 0 }],
        1, [{ nombre: 'Equipo de marketing', chats }],
      );
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
          {/* Es la cadena del closer: cierres, shows y agendas. Al setter no le dice nada
              y encima le muestra metas que no son suyas. */}
          {ventas.data?.actual && !esSetter && (esCloser || puedeVerVentasDirector(rol) || puedeEditar) && (
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
