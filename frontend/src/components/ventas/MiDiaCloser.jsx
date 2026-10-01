import { useCallback, useEffect, useMemo, useState } from 'react';
import CalendarioEquipo from './CalendarioEquipo.jsx';
import EditorReunion from './EditorReunion.jsx';
import NuevaReunion from './NuevaReunion.jsx';
import DetalleLlamada from './DetalleLlamada.jsx';
import DetalleMetrica from './DetalleMetrica.jsx';
import Card from '../ui/Card.jsx';
import { formatValue } from '../../lib/format.js';
import { getEstadoReuniones, getLlamadosAgenda, moverReunion, ocultarReunion, sincronizarLlamadas } from '../../data/api.js';
import { useResource } from '../../lib/hooks.js';
import { alActualizarLlamadas } from '../../lib/llamadasSync.js';

const pct = (v) => (v == null ? '—' : `${v}%`);
const fecha = (iso) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });

const ESTADO_TEXTO = {
  cierre: 'venta', show: 'con show', no_show: 'no show', sin_reportar: 'sin cargar',
  agendado: 'por venir', descartada: 'descartada', reprogramada: 'se movió',
};

function Kpi({ label, valor, nota, tono, onVer }) {
  return (
    <article className={`kpi sm${onVer ? ' clickable' : ''}`} onClick={onVer} role={onVer ? 'button' : undefined} tabIndex={onVer ? 0 : undefined}
      onKeyDown={onVer ? (e) => (e.key === 'Enter' || e.key === ' ') && onVer() : undefined}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value-row"><span className="kpi-value num" style={tono ? { color: tono } : undefined}>{valor}</span></div>
      <div className="kpi-nota">{nota}</div>
      {onVer && <div className="kpi-ver">ver llamadas</div>}
    </article>
  );
}

/** El mismo calendario de Google que ve el director de ventas. */
function CalendarioReal({ onCambio, syncKey = 0 }) {
  const [detalle, setDetalle] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [tick, setTick] = useState(0);
  // El rango lo manda el calendario según la semana o el mes que esté mostrando.
  const [rango, setRango] = useState(null);
  // syncKey: KPIs de Mi día se refrescaron (p. ej. tras el gate) → repintar estados.
  const version = tick + syncKey;
  const { data, loading, error } = useResource(
    () => getLlamadosAgenda({ dias: 21, diasAtras: 7, refrescar: version > 0, ...(rango ?? {}) }),
    [version, rango?.desde, rango?.hasta],
  );
  const onRango = useCallback((desde, hasta) => setRango({ desde, hasta }), []);
  const [editando, setEditando] = useState(null);
  const [agregando, setAgregando] = useState(false);
  const { data: reuniones } = useResource(
    () => (rango ? getEstadoReuniones(rango) : Promise.resolve(null)),
    [version, rango?.desde, rango?.hasta],
  );

  useEffect(() => alActualizarLlamadas(() => setTick((t) => t + 1)), []);

  // Las reuniones cargadas a mano no están en Google: se suman para que el calendario las dibuje.
  const llamadosConManuales = [
    ...(data?.llamados ?? []),
    ...(reuniones?.manuales ?? []).map((m) => ({
      id: m.eventoId, prospecto: m.prospecto, titulo: m.prospecto,
      email: '', telefono: '', instagram: '', facturacion: '', respuestas: [],
      fechaAt: m.fechaAt, duracionMin: 60, todoElDia: false,
      estado: 'pendiente', oferta: 'Cargada a mano',
      closer: m.closer || 'Equipo ATV', invitados: [],
      zoomUrl: null, meetUrl: null, url: null,
      notasSetter: m.reporte || '', montoUsd: m.cashUsd || null, origen: 'atv-ops',
    })),
  ];

  if (error) {
    return <Card title="Calendario" sub="Google Calendar de ATV"><div className="empty">{error.message}</div></Card>;
  }
  // Al refrescar no se desmonta el calendario: queda visible y gira el botón.
  if (!data) return <Card title="Calendario" sub="Google Calendar de ATV"><div className="empty">Cargando…</div></Card>;

  return (
    <>
      <CalendarioEquipo
        llamados={llamadosConManuales}
        onSelect={setDetalle}
        sub={`${data.calendarId} · ${(data.llamados ?? []).length} eventos entre ${data.desde} y ${data.hasta}`}
        actualizando={loading || sincronizando}
        onActualizar={async () => {
          // Actualizar es ir a mirar el calendario de verdad, no releer lo mismo: la
          // vista sale de la base de ATV Ops y el sync es el que la pone al día.
          setSincronizando(true);
          try {
            await sincronizarLlamadas();
          } catch {
            /* si el sync falla igual se refresca: se ve lo último que quedó guardado */
          } finally {
            setSincronizando(false);
            setTick((t) => t + 1);
          }
        }}
        onRango={onRango}
        estados={reuniones?.porEvento}
        ocultos={reuniones?.ocultos}
        onEditar={(reunion, estado) => setEditando({ reunion, estado })}
        onAgregar={() => setAgregando(true)}
        onOcultar={async (l) => {
          await ocultarReunion(l.id, { titulo: l.prospecto, fechaAt: l.fechaAt });
          setTick((t) => t + 1);
          onCambio?.();
        }}
        onMostrar={async (l) => {
          await ocultarReunion(l.id, { mostrar: true });
          setTick((t) => t + 1);
          onCambio?.();
        }}
        // Arrastrar una llamada al día en que pasó de verdad. Lo mueve dentro de ATV Ops:
        // en Google sigue siendo cierto que se había agendado el otro día.
        onMover={async (l, fecha) => {
          await moverReunion(l.id, fecha);
          setTick((t) => t + 1);
          onCambio?.();
        }}
      />
      {detalle && <DetalleLlamada llamada={detalle} onCerrar={() => setDetalle(null)} />}
      {agregando && (
        <NuevaReunion
          programas={reuniones?.programas ?? []}
          estados={reuniones?.estados ?? []}
          onCreada={() => { setTick((t) => t + 1); onCambio?.(); }}
          onCerrar={() => setAgregando(false)}
        />
      )}
      {editando && (
        <EditorReunion
          reunion={editando.reunion}
          estado={editando.estado}
          programas={reuniones?.programas ?? []}
          estados={reuniones?.estados ?? []}
          equipo={data?.equipo ?? reuniones?.equipo ?? []}
          onGuardado={() => { setTick((t) => t + 1); onCambio?.(); }}
          onCerrar={() => setEditando(null)}
        />
      )}
    </>
  );
}

/** Mi día: los números del mes del closer y el calendario del equipo. */
export default function MiDiaCloser({ data, onCambio, syncKey = 0 }) {
  const { mes = {}, llamadas = [] } = data ?? {};
  const [detalle, setDetalle] = useState(null);

  // Afuera solo las descartadas a mano. Las reprogramadas cuentan en el total
  // y se muestran como detalle debajo del KPI.
  //
  // No se filtra por fecha: lo que llega ya es el mes elegido. Antes se cortaba desde el
  // día 1 del mes *corriente*, así que un 1° de octubre mirando septiembre las listas de
  // los KPIs quedaban vacías —"no hay llamadas en este número"— aunque el número de
  // arriba, que lo calcula el backend, mostrara sesenta y pico.
  const FUERA = ['descartada'];
  const delMes = useMemo(
    () => llamadas.filter((l) => !FUERA.includes(l.estado)),
    [llamadas],
  );

  const reprogramadasMes = useMemo(
    () => delMes.filter((l) => l.estado === 'reprogramada'),
    [delMes],
  );


  const ventas = delMes.filter((l) => l.estado === 'cierre');
  const shows = delMes.filter((l) => l.estado === 'show' || l.estado === 'cierre');
  // "cierre" tapa a las dos: cerrada y seña. Lo que las separa es el resultado cargado.
  const esSena = (l) => (l.resultado || '').toLowerCase().trim().startsWith('se');
  const cerradas = ventas.filter((l) => !esSena(l));
  const senas = ventas.filter(esSena);
  const dinero = (l) => formatValue(l.cashUsd ?? 0, 'usd');
  const ver = (titulo, explicacion, lista, columna, encabezado) => () =>
    setDetalle({ titulo, explicacion, llamadas: lista, columna, encabezado });

  const nReprog = mes.reprogramadas ?? reprogramadasMes.length;
  const notaAgendas = [
    nReprog > 0 ? `${nReprog} reprogramadas` : null,
    mes.porVenir ? `${mes.porVenir} por venir` : null,
    // Las segundas reuniones sí cuentan: se dicen igual, porque saber cuántas del mes
    // fueron reuniones repetidas cambia cómo se lee el número.
    mes.seguimientos ? `${mes.seguimientos} son segundas reuniones` : null,
    mes.canceladas ? `${mes.canceladas} canceladas` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="mi-dia">
      <div className="kpi-grid">
        <Kpi label="Agendas del mes" valor={mes.agendadas ?? delMes.length}
          nota={notaAgendas || 'la primera de cada prospecto'}
          onVer={ver('Agendas del mes', 'Todas las reuniones del mes, incluidas las segundas y las que se cancelaron: el setter las trajo igual. Afuera queda solo lo descartado a mano.', delMes, (l) => (l.estado === 'reprogramada' ? 'reprogramada' : l.estado === 'cancelada' ? 'cancelada' : (l.seguimiento ? 'segunda reunión' : (l.origen || l.setter || ''))), 'Detalle')} />
        <Kpi label="Sin cargar" valor={mes.sinReportar ?? 0}
          tono={mes.sinReportar ? 'var(--brand-hi)' : 'var(--ok)'}
          nota="llamadas que ya pasaron sin resultado"
          onVer={ver('Sin cargar', 'Llamadas que ya pasaron y todavía no tienen resultado.', delMes.filter((l) => l.estado === 'sin_reportar'), (l) => `hace ${l.diasDesde} d`, 'Antigüedad')} />
        <Kpi label="Cash cobrado" valor={formatValue(mes.cashUsd ?? 0, 'usd')}
          nota={mes.saldoUsd ? `${formatValue(mes.saldoUsd, 'usd')} por cobrar` : 'este mes'}
          onVer={ver('Cash cobrado', 'Lo que efectivamente pagó cada cliente que cerró.', ventas, dinero, 'Cash')} />
        <Kpi label="Facturación" valor={formatValue(mes.facturacionUsd ?? 0, 'usd')}
          nota={`${mes.cierres ?? 0} ventas · AOV ${formatValue(mes.aovUsd ?? 0, 'usd')}`}
          onVer={ver('Facturación', 'El precio del programa que compró cada uno.', ventas, (l) => `${l.programa || 'sin programa'} · ${formatValue(l.facturacionUsd ?? 0, 'usd')}`, 'Programa')} />
      </div>

      <div className="kpi-grid">
        <Kpi label="Show rate" valor={pct(mes.showRate)}
          /* La cuenta tiene que cerrar a la vista: agendas = shows + no shows + las que
             no llegaron a ser llamada. Sin nombrarlas, el número parece que pierde dos. */
          nota={`${mes.shows ?? 0} shows${mes.noShows ? ` · ${mes.noShows} no show` : ''}${mes.canceladas ? ` · ${mes.canceladas} canceladas` : ''}${mes.reprogramadas ? ` · ${mes.reprogramadas} reprogramadas` : ''}`}
          onVer={ver('Show rate', 'Las que se presentaron, sobre las agendas del mes. Con el no show no suma 100: lo que falta son las canceladas, que no llegaron a ser llamada.', shows, (l) => l.resultado || '', 'Resultado')} />
        <Kpi label="No show" valor={pct(mes.noShowRate)} tono={mes.noShows ? 'var(--warn)' : undefined}
          nota={`${mes.noShows ?? 0} llamadas caídas`}
          onVer={ver('No show', 'Las que no se presentaron o no contestaron, sobre las agendas del mes. La cancelada no es un no show: se avisó antes de la hora.', delMes.filter((l) => l.estado === 'no_show'), (l) => l.resultado || '', 'Resultado')} />
        <Kpi
          label="Close rate"
          valor={pct(mes.closeRate)}
          nota={`${mes.cierres ?? 0} ${mes.cierres === 1 ? 'cerrada' : 'cerradas'} sobre ${mes.shows ?? 0} shows${mes.senas ? ` · ${mes.senas} con seña` : ''}`}
          onVer={() => setDetalle({
            titulo: 'Close rate',
            explicacion: 'Las ventas cerradas sobre las llamadas que sí se presentaron. La seña no cuenta como cierre: la venta todavía no está hecha, pero si cierra sube el rate.',
            resumen: [
              { label: 'Close rate', valor: pct(mes.closeRate),
                nota: `${cerradas.length} sobre ${mes.shows ?? shows.length} shows` },
              { label: 'Proyectado', tenue: true, tono: 'var(--brand-hi)',
                valor: pct(mes.closeRateProyectado
                  ?? (shows.length ? Math.round(((cerradas.length + senas.length) / shows.length) * 1000) / 10 : null)),
                nota: senas.length ? `si cierran las ${senas.length} ${senas.length === 1 ? 'seña' : 'señas'}` : 'sin señas abiertas' },
            ],
            grupos: [
              { titulo: 'Cerradas', llamadas: cerradas, columna: dinero, encabezado: 'Cash',
                vacio: 'Todavía no cerró ninguna.' },
              { titulo: 'Señas', llamadas: senas, columna: dinero, encabezado: 'Cash',
                nota: 'Plata que entró con la venta a medio hacer.',
                vacio: 'Sin señas abiertas.' },
            ],
          })} />
        <Kpi label="AOV" valor={formatValue(mes.aovUsd ?? 0, 'usd')}
          nota={`${formatValue(mes.cashUsd ?? 0, 'usd')} de cash sobre ${mes.cierres ?? 0} ${mes.cierres === 1 ? 'cierre' : 'cierres'}`}
          onVer={ver('AOV', 'El cash del mes dividido por los cierres. Las señas suman al cash pero no son un cierre, así que no entran al divisor.', ventas.filter((l) => l.estado === 'cierre'), dinero, 'Cash')} />
      </div>

      <CalendarioReal onCambio={onCambio} syncKey={syncKey} />

      {detalle && <DetalleMetrica {...detalle} onCerrar={() => setDetalle(null)} />}

    </div>
  );
}
