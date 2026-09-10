import { useMemo, useState } from 'react';
import CalendarioEquipo from './CalendarioEquipo.jsx';
import DetalleLlamada from './DetalleLlamada.jsx';
import Card from '../ui/Card.jsx';
import { formatValue } from '../../lib/format.js';
import { getLlamadosAgenda } from '../../data/api.js';
import { useResource } from '../../lib/hooks.js';

const pct = (v) => (v == null ? '—' : `${v}%`);
const fecha = (iso) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });

const ESTADO_TEXTO = {
  cierre: 'venta', show: 'con show', no_show: 'no show', sin_reportar: 'sin cargar',
  agendado: 'por venir', descartada: 'descartada',
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
function DetalleMetrica({ titulo, explicacion, llamadas, columna, onCerrar }) {
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
            {llamadas.map((l) => (
              <div key={l.id} className={`detalle-fila${columna ? '' : ' sin-valor'}`}>
                <span className="num dim">{fecha(l.fechaAt)}</span>
                <span className="strong">{l.prospecto}</span>
                <span className="dim">{ESTADO_TEXTO[l.estado] ?? l.estado}</span>
                {columna && <span className="num">{columna(l)}</span>}
              </div>
            ))}
          </div>
        )}
        <footer className="dim">{llamadas.length} llamadas · sale del CRM de ATV Marketing</footer>
      </div>
    </div>
  );
}

/** El mismo calendario de Google que ve el director de ventas. */
function CalendarioReal() {
  const [detalle, setDetalle] = useState(null);
  const [tick, setTick] = useState(0);
  const { data, loading, error } = useResource(
    () => getLlamadosAgenda({ dias: 21, diasAtras: 7, refrescar: tick > 0 }),
    [tick],
  );

  if (error) {
    return <Card title="Calendario" sub="Google Calendar de ATV"><div className="empty">{error.message}</div></Card>;
  }
  // Al refrescar no se desmonta el calendario: queda visible y gira el botón.
  if (!data) return <Card title="Calendario" sub="Google Calendar de ATV"><div className="empty">Cargando…</div></Card>;

  return (
    <>
      <CalendarioEquipo
        llamados={data.llamados ?? []}
        onSelect={setDetalle}
        sub={`${data.calendarId} · ${(data.llamados ?? []).length} eventos entre ${data.desde} y ${data.hasta}`}
        actualizando={loading}
        onActualizar={() => setTick((t) => t + 1)}
      />
      {detalle && <DetalleLlamada llamada={detalle} onCerrar={() => setDetalle(null)} />}
    </>
  );
}

/** Mi día: los números del mes del closer y el calendario del equipo. */
export default function MiDiaCloser({ data }) {
  const { mes = {}, llamadas = [] } = data ?? {};
  const [detalle, setDetalle] = useState(null);

  const delMes = useMemo(() => {
    const inicio = new Date();
    inicio.setDate(1);
    inicio.setHours(0, 0, 0, 0);
    return llamadas.filter((l) => new Date(l.fechaAt) >= inicio);
  }, [llamadas]);

  const ventas = delMes.filter((l) => l.estado === 'cierre');
  const shows = delMes.filter((l) => l.estado === 'show' || l.estado === 'cierre');
  const dinero = (l) => formatValue(l.cashUsd ?? 0, 'usd');
  const ver = (titulo, explicacion, lista, columna) => () => setDetalle({ titulo, explicacion, llamadas: lista, columna });

  return (
    <div className="mi-dia">
      <div className="kpi-grid">
        <Kpi label="Agendas del mes" valor={mes.agendadas ?? 0}
          nota={`${mes.porVenir ?? 0} todavía por venir`}
          onVer={ver('Agendas del mes', 'Todas las llamadas con fecha en este mes.', delMes, (l) => l.origen || l.setter || '')} />
        <Kpi label="Sin cargar" valor={mes.sinReportar ?? 0}
          tono={mes.sinReportar ? 'var(--brand-hi)' : 'var(--ok)'}
          nota="llamadas que ya pasaron sin resultado"
          onVer={ver('Sin cargar', 'Llamadas que ya pasaron y todavía no tienen resultado.', delMes.filter((l) => l.estado === 'sin_reportar'), (l) => `hace ${l.diasDesde} d`)} />
        <Kpi label="Cash cobrado" valor={formatValue(mes.cashUsd ?? 0, 'usd')}
          nota={mes.saldoUsd ? `${formatValue(mes.saldoUsd, 'usd')} por cobrar` : 'este mes'}
          onVer={ver('Cash cobrado', 'Lo que efectivamente pagó cada cliente que cerró.', ventas, dinero)} />
        <Kpi label="Facturación" valor={formatValue(mes.facturacionUsd ?? 0, 'usd')}
          nota={`${mes.cierres ?? 0} ventas · AOV ${formatValue(mes.aovUsd ?? 0, 'usd')}`}
          onVer={ver('Facturación', 'El precio del programa que compró cada uno.', ventas, (l) => `${l.programa || 'sin programa'} · ${formatValue(l.facturacionUsd ?? 0, 'usd')}`)} />
      </div>

      <div className="kpi-grid">
        <Kpi label="Show rate" valor={pct(mes.showRate)} nota={`${mes.shows ?? 0} shows`}
          onVer={ver('Show rate', 'Las que se presentaron, sobre las que se presentaron más las que no.', shows, (l) => l.resultado || '')} />
        <Kpi label="No show" valor={pct(mes.noShowRate)} tono={mes.noShows ? 'var(--warn)' : undefined}
          nota={`${mes.noShows ?? 0} llamadas caídas`}
          onVer={ver('No show', 'Las que no se presentaron o se cancelaron.', delMes.filter((l) => l.estado === 'no_show'), (l) => l.resultado || '')} />
        <Kpi label="Close rate" valor={pct(mes.closeRate)} nota={`${mes.cierres ?? 0} sobre ${mes.shows ?? 0} shows`}
          onVer={ver('Close rate', 'Las ventas sobre las llamadas que sí se presentaron.', shows, (l) => (l.estado === 'cierre' ? dinero(l) : '—'))} />
        <Kpi label="AOV" valor={formatValue(mes.aovUsd ?? 0, 'usd')}
          nota={`cash promedio ${formatValue(mes.cashPromedioUsd ?? 0, 'usd')}`}
          onVer={ver('AOV', 'El precio promedio de los programas vendidos.', ventas, (l) => formatValue(l.facturacionUsd ?? 0, 'usd'))} />
      </div>

      <CalendarioReal />

      {detalle && <DetalleMetrica {...detalle} onCerrar={() => setDetalle(null)} />}

    </div>
  );
}
