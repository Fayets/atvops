import { useCallback, useMemo, useState } from 'react';
import CalendarioEquipo from './CalendarioEquipo.jsx';
import EditorReunion from './EditorReunion.jsx';
import NuevaReunion from './NuevaReunion.jsx';
import DetalleLlamada from './DetalleLlamada.jsx';
import Card from '../ui/Card.jsx';
import { formatValue } from '../../lib/format.js';
import { getEstadoReuniones, getLlamadosAgenda, ocultarReunion } from '../../data/api.js';
import { useResource } from '../../lib/hooks.js';

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

/** De dónde sale cada número: las llamadas que lo componen. */
function DetalleMetrica({ titulo, explicacion, llamadas, columna, encabezado, onCerrar }) {
  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <div className="modal-card detalle-metrica" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <header>
          <div>
            <h3>{titulo}</h3>
            <p className="dim">{explicacion}</p>
          </div>
          <button type="button" className="btn ghost" onClick={onCerrar}>Cerrar</button>
        </header>
        {llamadas.length === 0 ? (
          <div className="empty">No hay llamadas en este número.</div>
        ) : (
          <div className="detalle-lista">
            <div className={`detalle-fila cabecera${columna ? '' : ' sin-valor'}`}>
              <span>Fecha</span>
              <span>Prospecto</span>
              <span>Estado</span>
              {columna && <span>{encabezado ?? 'Detalle'}</span>}
            </div>
            {llamadas.map((l) => (
              <div key={l.id} className={`detalle-fila${columna ? '' : ' sin-valor'}`}>
                <span className="num dim">{fecha(l.fechaAt)}</span>
                <span className="strong">{l.prospecto}</span>
                <span className="dim">{ESTADO_TEXTO[l.estado] ?? l.estado}</span>
                {columna && <span className="valor">{columna(l)}</span>}
              </div>
            ))}
          </div>
        )}
        <footer className="dim">{llamadas.length} llamadas · base de ATV Ops</footer>
      </div>
    </div>
  );
}

/** El mismo calendario de Google que ve el director de ventas. */
function CalendarioReal({ onCambio }) {
  const [detalle, setDetalle] = useState(null);
  const [tick, setTick] = useState(0);
  // El rango lo manda el calendario según la semana o el mes que esté mostrando.
  const [rango, setRango] = useState(null);
  const { data, loading, error } = useResource(
    () => getLlamadosAgenda({ dias: 21, diasAtras: 7, refrescar: tick > 0, ...(rango ?? {}) }),
    [tick, rango?.desde, rango?.hasta],
  );
  const onRango = useCallback((desde, hasta) => setRango({ desde, hasta }), []);
  const [editando, setEditando] = useState(null);
  const [agregando, setAgregando] = useState(false);
  const { data: reuniones } = useResource(
    () => (rango ? getEstadoReuniones(rango) : Promise.resolve(null)),
    [tick, rango?.desde, rango?.hasta],
  );

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
        actualizando={loading}
        onActualizar={() => setTick((t) => t + 1)}
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
          onGuardado={() => { setTick((t) => t + 1); onCambio?.(); }}
          onCerrar={() => setEditando(null)}
        />
      )}
    </>
  );
}

/** Mi día: los números del mes del closer y el calendario del equipo. */
export default function MiDiaCloser({ data, onCambio }) {
  const { mes = {}, llamadas = [] } = data ?? {};
  const [detalle, setDetalle] = useState(null);

  // Afuera de todo, igual que en el backend: la descartada porque la sacaste a mano, y la
  // que se cayó y se rehízo el mismo día porque no es una reunión distinta.
  const FUERA = ['descartada', 'reprogramada'];
  const delMes = useMemo(() => {
    const inicio = new Date();
    inicio.setDate(1);
    inicio.setHours(0, 0, 0, 0);
    return llamadas.filter((l) => new Date(l.fechaAt) >= inicio && !FUERA.includes(l.estado));
  }, [llamadas]);

  const ventas = delMes.filter((l) => l.estado === 'cierre');
  const shows = delMes.filter((l) => l.estado === 'show' || l.estado === 'cierre');
  const dinero = (l) => formatValue(l.cashUsd ?? 0, 'usd');
  const ver = (titulo, explicacion, lista, columna, encabezado) => () =>
    setDetalle({ titulo, explicacion, llamadas: lista, columna, encabezado });

  return (
    <div className="mi-dia">
      <div className="kpi-grid">
        <Kpi label="Agendas del mes" valor={mes.agendadas ?? 0}
          nota={`${mes.porVenir ?? 0} por venir${mes.seguimientos ? ` · ${mes.seguimientos} son segunda reunión` : ''}`}
          onVer={ver('Agendas del mes', 'Todas las reuniones del mes. Solo quedan afuera las que descartaste a mano.', delMes, (l) => l.origen || l.setter || '', 'Origen')} />
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
        <Kpi label="Show rate" valor={pct(mes.showRate)} nota={`${mes.shows ?? 0} shows`}
          onVer={ver('Show rate', 'Las que se presentaron, sobre las que se presentaron más las que no.', shows, (l) => l.resultado || '', 'Resultado')} />
        <Kpi label="No show" valor={pct(mes.noShowRate)} tono={mes.noShows ? 'var(--warn)' : undefined}
          nota={`${mes.noShows ?? 0} llamadas caídas`}
          onVer={ver('No show', 'Las que no se presentaron o se cancelaron.', delMes.filter((l) => l.estado === 'no_show'), (l) => l.resultado || '', 'Resultado')} />
        <Kpi
          label="Close rate"
          valor={pct(mes.closeRate)}
          nota={`${mes.cierres ?? 0} ${mes.cierres === 1 ? 'cerrada' : 'cerradas'} sobre ${mes.shows ?? 0} shows${mes.senas ? ` · ${mes.senas} con seña` : ''}`}
          onVer={ver('Close rate', 'Las ventas cerradas sobre las llamadas que sí se presentaron. Las señas no cuentan: la venta todavía no está hecha.', shows, (l) => (l.estado === 'cierre' ? dinero(l) : '—'), 'Cash')} />
        <Kpi label="AOV" valor={formatValue(mes.aovUsd ?? 0, 'usd')}
          nota={`cash promedio ${formatValue(mes.cashPromedioUsd ?? 0, 'usd')}`}
          onVer={ver('AOV', 'El precio promedio de los programas vendidos.', ventas, (l) => formatValue(l.facturacionUsd ?? 0, 'usd'), 'Facturación')} />
      </div>

      <CalendarioReal onCambio={onCambio} />

      {detalle && <DetalleMetrica {...detalle} onCerrar={() => setDetalle(null)} />}

    </div>
  );
}
