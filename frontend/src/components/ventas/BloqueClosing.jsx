import { useState } from 'react';
import { formatValue } from '../../lib/format.js';

/**
 * El closing: los cuatro números, el PIF con sus dos lecturas y la disposición.
 *
 * Cada métrica se puede abrir: muestra de dónde sale el número, con los leads detrás.
 * El close rate solo mira Cerrado / shows; las señas no entran, y al tocarlo también
 * se ve la proyección si esas señas cierran antes de fin de mes.
 */

const COLOR = {
  Cerrado: '#15803d',
  'Seña': '#4d9c6d',
  'No show': '#b91c1c',
  Descalificado: '#b45309',
  Seguimiento: '#a8a29e',
};
const TINTA_CLARA = new Set(['Seguimiento']);
const CON_CASH = new Set(['Cerrado', 'Seña']);

const fecha = (iso) => (iso
  ? new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
  : '—');

function Kpi({ titulo, valor, pie, tono, onVer, verLabel }) {
  return (
    <div
      className={`card kpi-closing${onVer ? ' clickable' : ''}`}
      onClick={onVer}
      role={onVer ? 'button' : undefined}
      tabIndex={onVer ? 0 : undefined}
      onKeyDown={onVer ? (e) => (e.key === 'Enter' || e.key === ' ') && onVer() : undefined}
    >
      <div className="kpi-closing-titulo">{titulo}</div>
      <div className={`kpi-closing-valor${tono ? ` ${tono}` : ''}`}>{valor}</div>
      <div className="kpi-closing-pie">{pie}</div>
      {onVer && <div className="kpi-closing-ver">{verLabel ?? 'ver de dónde sale'}</div>}
    </div>
  );
}

/** Lista de leads detrás de una métrica. Columnas opcionales según el caso. */
function ListaLeads({ leads, columnas = ['cash'] }) {
  if (!leads?.length) return <div className="empty">Nadie en este número este mes.</div>;
  const conCash = columnas.includes('cash');
  const conDeuda = columnas.includes('deuda');
  const conEstado = columnas.includes('estado');
  const cols = 3 + (conEstado ? 1 : 0) + (conCash ? 1 : 0) + (conDeuda ? 1 : 0);

  return (
    <div className="close-proyeccion-lista" style={{ '--disp-cols': cols }}>
      <div className="close-proyeccion-fila cabecera disp-metric-fila">
        <span>Fecha</span>
        <span>Prospecto</span>
        <span>Closer</span>
        {conEstado && <span>Estado</span>}
        {conCash && <span>Cash</span>}
        {conDeuda && <span>Deuda</span>}
      </div>
      {leads.map((l) => (
        <div key={l.id || `${l.nombre}-${l.fecha}`} className="close-proyeccion-fila disp-metric-fila">
          <span className="num dim">{fecha(l.fecha)}</span>
          <span className="strong" title={l.programa || undefined}>{l.nombre}</span>
          <span className="dim">{l.closer || '—'}</span>
          {conEstado && <span className="dim">{l.estado || l.resultado || '—'}</span>}
          {conCash && <span className="num valor">{formatValue(l.pagoUsd ?? 0, 'usd')}</span>}
          {conDeuda && <span className="num valor">{formatValue(l.deudaUsd ?? 0, 'usd')}</span>}
        </div>
      ))}
    </div>
  );
}

/** Modal genérico: título, explicación, número y la lista de leads. */
function DetalleMetrica({ titulo, explicacion, valor, pie, secciones, onCerrar }) {
  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <div
        className="modal-card close-proyeccion disp-detalle"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={titulo}
      >
        <header className="modal-cab">
          <div>
            <h3>{titulo}</h3>
            {explicacion && <p className="dim">{explicacion}</p>}
          </div>
          <button type="button" className="btn sm" onClick={onCerrar}>Cerrar</button>
        </header>

        <div className="close-proyeccion-cuerpo">
          {(valor != null || pie) && (
            <div className="close-proyeccion-kpi">
              {valor != null && <div className="kpi-closing-valor">{valor}</div>}
              {pie && <div className="kpi-closing-pie">{pie}</div>}
            </div>
          )}
          {(secciones ?? []).map((s) => (
            <div key={s.titulo} className="disp-metric-seccion">
              <div className="disp-metric-seccion-tit">
                <strong>{s.titulo}</strong>
                {s.nota && <span className="dim">{s.nota}</span>}
              </div>
              <ListaLeads leads={s.leads} columnas={s.columnas} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DetalleDisposicion({ tajada, onCerrar }) {
  const conCash = CON_CASH.has(tajada.disposicion);
  return (
    <DetalleMetrica
      titulo={tajada.disposicion}
      explicacion={`${tajada.n} ${tajada.n === 1 ? 'llamada' : 'llamadas'}${
        tajada.pct ? ` · ${formatValue(tajada.pct, 'num')}% del embudo` : ''
      }`}
      secciones={[{
        titulo: 'Leads',
        leads: tajada.leads ?? [],
        columnas: conCash ? ['cash'] : [],
      }]}
      onCerrar={onCerrar}
    />
  );
}

/**
 * @param {{ data: object }} props
 */
export default function BloqueClosing({ data = {} }) {
  const d = data ?? {};
  const [detalle, setDetalle] = useState(null);
  const [tajadaAbierta, setTajadaAbierta] = useState(null);
  const disp = d.disposiciones ?? { total: 0, sinReportar: 0, tajadas: [] };
  const conVolumen = (disp.tajadas ?? []).filter((t) => t.n > 0);
  const masGrande = conVolumen[0]
    ? [...conVolumen].sort((a, b) => b.n - a.n)[0]
    : null;

  const resueltas = (d.shows ?? 0) + (d.noShows ?? 0);
  const showFragil = d.sinReportar > resueltas / 3;
  const senas = d.senas ?? 0;
  const cierres = d.cierres ?? 0;
  const shows = d.shows ?? 0;

  function abrirTajada(t) {
    if (!t?.n) return;
    setTajadaAbierta(t);
  }

  function verCloseRate() {
    const secciones = [
      {
        titulo: `Cierres (${cierres})`,
        nota: 'solo Cerrado · numerador del close rate',
        leads: d.cierresDetalle ?? [],
        columnas: ['cash'],
      },
    ];
    if (senas > 0) {
      secciones.push({
        titulo: `Señas (${senas}) · proyección ${d.closeRateProyectado == null ? '—' : `${formatValue(d.closeRateProyectado, 'num')}%`}`,
        nota: 'no cuentan hoy · si cierran suben el close rate',
        leads: d.senasDetalle ?? [],
        columnas: ['cash'],
      });
    }
    setDetalle({
      titulo: 'Close rate',
      explicacion: 'Cierres sobre shows. Las señas no entran: la venta todavía no está hecha.',
      valor: d.closeRate == null ? '—' : `${formatValue(d.closeRate, 'num')}%`,
      pie: `${cierres} cierres sobre ${shows} shows`,
      secciones,
    });
  }

  function verAov() {
    setDetalle({
      titulo: 'AOV',
      explicacion: 'Cash collected del mes dividido por la cantidad de cierres (no por señas).',
      valor: formatValue(d.averageSaleUsd ?? 0, 'usd'),
      pie: `${formatValue(d.cashUsd ?? 0, 'usd')} ÷ ${cierres || '—'} cierres`,
      secciones: [{
        titulo: `Cierres del divisor (${cierres})`,
        nota: 'el cash del numerador incluye también lo que dejaron las señas',
        leads: d.cierresDetalle ?? [],
        columnas: ['cash'],
      }],
    });
  }

  function verCash() {
    setDetalle({
      titulo: 'Cash collected',
      explicacion: 'Lo que entró de verdad este mes: cierres y señas.',
      valor: formatValue(d.cashUsd ?? 0, 'usd'),
      pie: `de ${d.ventas ?? 0} ventas`,
      secciones: [{
        titulo: `Ventas (${d.ventas ?? 0})`,
        leads: d.ventasDetalle ?? [],
        columnas: ['estado', 'cash'],
      }],
    });
  }

  function verShowRate() {
    setDetalle({
      titulo: 'Show rate',
      explicacion: 'Shows sobre llamadas ya resueltas (show + no show). Las sin reportar no entran.',
      valor: d.showRate == null ? '—' : `${formatValue(d.showRate, 'num')}%`,
      pie: `${shows} de ${resueltas} resueltas${d.sinReportar ? ` · ${d.sinReportar} sin reportar` : ''}`,
      secciones: [
        {
          titulo: `Shows (${shows})`,
          leads: d.showsDetalle ?? [],
          columnas: ['estado'],
        },
        {
          titulo: `No shows (${d.noShows ?? 0})`,
          leads: d.noShowsDetalle ?? [],
          columnas: ['estado'],
        },
      ],
    });
  }

  function verPifDeuda() {
    const saldadas = d.saldadasDetalle ?? [];
    const conPlan = d.conPlanDetalle ?? [];
    setDetalle({
      titulo: 'PIF por deuda',
      explicacion: 'De las ventas del mes, cuántas no deben nada. Independiente del estado Cerrado/Seña.',
      valor: d.pifPorDeuda == null ? '—' : `${formatValue(d.pifPorDeuda, 'num')}%`,
      pie: `${saldadas.length} de ${d.ventas ?? 0} no debe nada`,
      secciones: [
        {
          titulo: `Saldadas (${saldadas.length})`,
          nota: 'deuda cero',
          leads: saldadas,
          columnas: ['estado', 'cash'],
        },
        {
          titulo: `Con plan / deuda (${conPlan.length})`,
          leads: conPlan,
          columnas: ['estado', 'cash', 'deuda'],
        },
      ],
    });
  }

  function verPifEstado() {
    setDetalle({
      titulo: 'PIF por estado',
      explicacion: 'Qué proporción de las ventas figura Cerrado y no Seña. Es lo que cargó el closer.',
      valor: d.pifPorEstado == null ? '—' : `${formatValue(d.pifPorEstado, 'num')}%`,
      pie: `${cierres} de ${d.ventas ?? 0} figuran Cerrado`,
      secciones: [
        {
          titulo: `Cerrado (${cierres})`,
          leads: d.cierresDetalle ?? [],
          columnas: ['cash'],
        },
        {
          titulo: `Seña (${senas})`,
          leads: d.senasDetalle ?? [],
          columnas: ['cash'],
        },
      ],
    });
  }

  return (
    <div className="closing">
      <div className="closing-kpis">
        <Kpi
          titulo="Close rate"
          valor={d.closeRate == null ? '—' : `${formatValue(d.closeRate, 'num')}%`}
          pie={`${cierres} cierres sobre ${shows} shows${
            senas ? ` · ${senas} ${senas === 1 ? 'seña' : 'señas'} no cuentan` : ' · solo Cerrado'
          }`}
          onVer={verCloseRate}
        />
        <Kpi
          titulo="AOV"
          valor={formatValue(d.averageSaleUsd ?? 0, 'usd')}
          pie="cash sobre cierres, no sobre señas"
          onVer={verAov}
        />
        <Kpi
          titulo="Cash collected"
          valor={formatValue(d.cashUsd ?? 0, 'usd')}
          pie={`de ${d.ventas ?? 0} ventas · lo que entró de verdad`}
          onVer={verCash}
        />
        <Kpi
          titulo="Show rate"
          valor={d.showRate == null ? '—' : `${formatValue(d.showRate, 'num')}%`}
          pie={`${shows} de ${resueltas} resueltas${d.sinReportar ? ` · ${d.sinReportar} sin reportar` : ''}`}
          tono={showFragil ? 'warn' : ''}
          onVer={verShowRate}
        />
      </div>

      <section className="card pif">
        <div className="pif-titulo">
          <div className="pif-etiqueta">PIF rate</div>
          <div className="dim">pagado completo · tocá cada lectura</div>
        </div>
        <button type="button" className="pif-lectura clickable" onClick={verPifDeuda}>
          <div className="pif-n warn">{d.pifPorDeuda == null ? '—' : `${formatValue(d.pifPorDeuda, 'num')}%`}</div>
          <div className="pif-detalle">
            por deuda
            <span className="dim">{(d.ventas ?? 0) - (d.ventasConPlan ?? 0)} de {d.ventas ?? 0} no debe nada</span>
          </div>
        </button>
        <div className="pif-sep" />
        <button type="button" className="pif-lectura clickable" onClick={verPifEstado}>
          <div className="pif-n dim">{d.pifPorEstado == null ? '—' : `${formatValue(d.pifPorEstado, 'num')}%`}</div>
          <div className="pif-detalle">
            por estado
            <span className="dim">{cierres} de {d.ventas ?? 0} figuran Cerrado</span>
          </div>
        </button>
        <div className="pif-nota">
          {d.ventasConPlan > 0 ? (
            <>
              <strong>{d.ventasConPlan} de {d.ventas} ventas tienen plan de pago.</strong> La diferencia
              entre los dos números es plata que todavía no está.
            </>
          ) : (
            'Todas las ventas del mes están saldadas.'
          )}
        </div>
      </section>

      <section className="card disp">
        <header className="disp-head">
          <h3>Disposición en llamada</h3>
          <span className="dim">
            {disp.total} llamadas resueltas · tocá una fase para ver los leads
          </span>
        </header>

        {disp.total === 0 ? (
          <div className="empty">Todavía no hay llamadas con resultado este mes.</div>
        ) : (
          <>
            <div className="disp-barra">
              {conVolumen.map((t) => (
                <button
                  key={t.disposicion}
                  type="button"
                  className="disp-tajada clickable"
                  style={{ width: `${t.pct}%`, background: COLOR[t.disposicion] ?? '#a8a29e' }}
                  title={`${t.disposicion}: ${t.n} · ver leads`}
                  onClick={() => abrirTajada(t)}
                >
                  <span style={{ color: TINTA_CLARA.has(t.disposicion) ? '#1c1917' : '#ffffff' }}>
                    {t.pct >= 7 ? `${t.pct}%` : ''}
                  </span>
                </button>
              ))}
            </div>

            <div className="disp-leyenda">
              {(disp.tajadas ?? []).map((t) => (
                <button
                  key={t.disposicion}
                  type="button"
                  className={`disp-item${t.n === 0 ? ' vacio' : ' clickable'}`}
                  onClick={() => abrirTajada(t)}
                  disabled={!t.n}
                  title={t.n ? `Ver ${t.n} leads` : 'Nadie en este estado'}
                >
                  <i style={{ background: COLOR[t.disposicion] ?? '#a8a29e' }} />
                  <span>{t.disposicion}</span>
                  <strong>{t.n}</strong>
                </button>
              ))}
            </div>
          </>
        )}

        <footer className="disp-pie">
          {masGrande && (
            <div>
              <strong>{masGrande.disposicion} se lleva el {masGrande.pct}%</strong>
              {masGrande.disposicion === 'Seguimiento'
                ? ' — es el cajón donde se esconde todo. Se va a abrir a medida que Fathom lea las llamadas y separe la plata de la duda.'
                : '.'}
            </div>
          )}
          {disp.sinReportar > 0 && (
            <div className="disp-pie-aparte">
              <strong>{disp.sinReportar} llamadas sin reportar</strong> no entran en el reparto.
              Repartirlas maquillaría justo el número que se mira para decidir.
            </div>
          )}
        </footer>
      </section>

      {detalle && <DetalleMetrica {...detalle} onCerrar={() => setDetalle(null)} />}
      {tajadaAbierta && (
        <DetalleDisposicion tajada={tajadaAbierta} onCerrar={() => setTajadaAbierta(null)} />
      )}
    </div>
  );
}
