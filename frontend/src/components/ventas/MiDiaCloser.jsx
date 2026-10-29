import { useMemo, useState } from 'react';
import DetalleMetrica from './DetalleMetrica.jsx';
import { formatValue } from '../../lib/format.js';

const pct = (v) => (v == null ? '—' : `${v}%`);
const fecha = (iso) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });

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

/** Mi día: los números del mes del closer. Abajo va el embudo, que arma la página. */
export default function MiDiaCloser({ data }) {
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
  // La cancelada va con los shows, como en el backend: lo que no es no show, es show.
  const shows = delMes.filter((l) => ['show', 'cierre', 'cancelada'].includes(l.estado));
  // "cierre" tapa a las dos: cerrada y seña. Lo que las separa es el resultado cargado.
  const esSena = (l) => (l.resultado || '').toLowerCase().trim().startsWith('se');
  const cerradas = ventas.filter((l) => !esSena(l));
  const senas = ventas.filter(esSena);
  // Las señas de meses anteriores que se cerraron en este: son cierres de este mes.
  const senasCerradas = (data?.cierresDiferidos ?? []).map((d) => ({
    ...d, id: `sena-${d.id}`, prospecto: `${d.prospecto} · era seña${d.fechaAt ? ` del ${fecha(d.fechaAt)}` : ''}`,
  }));
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
          onVer={ver('Cash cobrado', 'Lo que efectivamente pagó cada cliente que cerró.', [...ventas, ...senasCerradas], dinero, 'Cash')} />
        <Kpi label="Facturación" valor={formatValue(mes.facturacionUsd ?? 0, 'usd')}
          nota={`${mes.cierresDelMes ?? mes.cierres ?? 0} ventas · AOV ${formatValue(mes.aovUsd ?? 0, 'usd')}`}
          onVer={ver('Facturación', 'El precio del programa que compró cada uno.', ventas, (l) => `${l.programa || 'sin programa'} · ${formatValue(l.facturacionUsd ?? 0, 'usd')}`, 'Programa')} />
      </div>

      <div className="kpi-grid">
        <Kpi label="Show rate" valor={pct(mes.showRate)}
          /* La cuenta tiene que cerrar a la vista: agendas = shows + no shows + las que
             no llegaron a ser llamada. Sin nombrarlas, el número parece que pierde dos. */
          nota={`${mes.shows ?? 0} shows${mes.canceladas ? ` (${mes.canceladas} canceladas)` : ''}${mes.noShows ? ` · ${mes.noShows} no show` : ''}${mes.reprogramadas ? ` · ${mes.reprogramadas} reprogramadas` : ''}`}
          onVer={ver('Show rate', 'Todo lo que no fue no show, sobre las agendas del mes. La cancelada entra acá: se avisó antes de la hora, pero el hueco no se perdió por no haberse presentado.', shows, (l) => l.resultado || '', 'Resultado')} />
        <Kpi label="No show" valor={pct(mes.noShowRate)} tono={mes.noShows ? 'var(--warn)' : undefined}
          nota={`${mes.noShows ?? 0} llamadas caídas`}
          onVer={ver('No show', 'Las que no se presentaron o no contestaron, sobre las agendas del mes. La cancelada no es un no show: se avisó antes de la hora.', delMes.filter((l) => l.estado === 'no_show'), (l) => l.resultado || '', 'Resultado')} />
        <Kpi
          label="Close rate"
          valor={pct(mes.closeRate)}
          nota={`${mes.cierres ?? 0} ${mes.cierres === 1 ? 'cerrada' : 'cerradas'}${mes.cierresDeSena ? ` (${mes.cierresDeSena} ${mes.cierresDeSena === 1 ? 'era seña' : 'eran seña'})` : ''} sobre ${mes.shows ?? 0} shows${mes.senas ? ` · ${mes.senas} con seña` : ''}`}
          onVer={() => setDetalle({
            titulo: 'Close rate',
            explicacion: 'Las ventas cerradas sobre las llamadas que sí se presentaron. La seña no cuenta como cierre hasta que se cierra; una seña de otro mes que se cerró en este, sí.',
            resumen: [
              { label: 'Close rate', valor: pct(mes.closeRate),
                nota: `${cerradas.length + senasCerradas.length} sobre ${mes.shows ?? shows.length} shows` },
              { label: 'Proyectado', tenue: true, tono: 'var(--brand-hi)',
                valor: pct(mes.closeRateProyectado
                  ?? (shows.length ? Math.round(((cerradas.length + senasCerradas.length + senas.length) / shows.length) * 1000) / 10 : null)),
                nota: senas.length ? `si cierran las ${senas.length} ${senas.length === 1 ? 'seña' : 'señas'}` : 'sin señas abiertas' },
            ],
            grupos: [
              { titulo: 'Cerradas', llamadas: [...cerradas, ...senasCerradas], columna: dinero, encabezado: 'Cash',
                vacio: 'Todavía no cerró ninguna.' },
              { titulo: 'Señas', llamadas: senas, columna: dinero, encabezado: 'Cash',
                nota: 'Plata que entró con la venta a medio hacer.',
                vacio: 'Sin señas abiertas.' },
            ],
          })} />
        <Kpi label="AOV" valor={formatValue(mes.aovUsd ?? 0, 'usd')}
          nota={`${formatValue(mes.cashUsd ?? 0, 'usd')} de cash sobre ${mes.cierres ?? 0} ${mes.cierres === 1 ? 'cierre' : 'cierres'}`}
          onVer={ver('AOV', 'El cash del mes dividido por los cierres. Las señas suman al cash pero no son un cierre, así que no entran al divisor.', [...cerradas, ...senasCerradas], dinero, 'Cash')} />
      </div>

      {detalle && <DetalleMetrica {...detalle} onCerrar={() => setDetalle(null)} />}

    </div>
  );
}
