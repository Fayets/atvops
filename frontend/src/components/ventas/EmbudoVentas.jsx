import { useEffect, useState } from 'react';
import { claseStatus } from './CeldasLlamada.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * El dashboard de ventas como el de atv-mkt: el mes en plata arriba, el embudo de punta a
 * punta en el medio y las métricas contra el mes anterior abajo.
 *
 * Todo se abre: cada paso del embudo y cada métrica muestran en un pop-up la cuenta que
 * los arma y las llamadas que los forman. Las listas salen del mismo cálculo que los
 * números (`agendasDetalle`, `showsDetalle`…), así que lo que se cuenta y lo que se lista
 * no pueden no coincidir.
 */

const usd = (n) => formatValue(n ?? 0, 'usd');
const pct = (n) => (n == null || Number.isNaN(n) ? '—' : `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`);
const num = (n) => (n == null ? '—' : n.toLocaleString('es-AR'));
// Sin numerador tampoco hay tasa: "0 %" diría que hubo chats y nadie conversó.
const tasa = (a, b) => (a == null || !b ? null : (a / b) * 100);
const ANCHOS = [100, 80, 64, 50, 36];
// La base guarda el resultado como lo escribió cada uno ("seguimiento", "Seguimiento").
const mayuscula = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/** Cuánto cambió contra el mes anterior. Sin base para comparar no se inventa un número. */
function delta(actual, previo) {
  if (actual == null || previo == null || previo === 0) return null;
  return ((actual - previo) / previo) * 100;
}
const flecha = (d) => (d == null ? '—'
  : `${d > 0 ? '▲' : d < 0 ? '▼' : '─'} ${Math.abs(d).toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`);
const tonoDe = (d, subeEsBueno = true) => (d == null || d === 0 ? '' : (d > 0) === subeEsBueno ? 'ok' : 'alert');

function Kpi({ label, valor, d, antes, subeEsBueno = true, onAbrir }) {
  return (
    <button type="button" className="ev-kpi" onClick={onAbrir}>
      <span className="ev-kpi-label">{label}</span>
      <span className="ev-kpi-valor num">{valor}</span>
      <span className={`ev-kpi-delta ${tonoDe(d, subeEsBueno)}`}>
        {flecha(d)}
        <span className="dim"> vs {antes}</span>
      </span>
    </button>
  );
}

function ListaPaso({ filas, conDebe = false }) {
  if (!filas.length) return <div className="ev-vacio">No hay llamadas para mostrar.</div>;
  const fila = `ev-fila${conDebe ? ' con-debe' : ''}`;
  return (
    <div className="ev-lista">
      <div className={`${fila} ev-cab`}>
        <span>Prospecto</span><span>Call</span><span>Status</span><span>Closer</span><span className="right">Pagó</span>
        {conDebe && <span className="right">Debe</span>}
      </div>
      <div className="ev-scroll">
        {filas.map((f) => (
          <div key={f.id} className={fila}>
            <span className="strong pl-corta">{f.nombre}</span>
            <span className="num dim">{f.fecha ? new Date(`${f.fecha}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—'}</span>
            <span><span className={`pl-pill ${claseStatus(f.estado)}`} title={mayuscula(f.estado) || undefined}>{mayuscula(f.estado) || 'Falta cargar'}</span></span>
            <span>{f.closer || '—'}</span>
            <span className={`right num${f.pagoUsd ? ' pl-cobrado' : ' dim'}`}>{f.pagoUsd ? usd(f.pagoUsd) : '—'}</span>
            {conDebe && <span className={`right num${f.deudaUsd ? ' pl-debe' : ' dim'}`}>{f.deudaUsd ? usd(f.deudaUsd) : '—'}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Partes({ items }) {
  return (
    <div className="ev-partes">
      {/* Nombre y número, nada en el medio: el texto explicativo entre los dos sobraba. */}
      {items.map(([nombre, valor]) => (
        <div key={nombre}>
          <span>{nombre}</span>
          <b className="num">{valor}</b>
        </div>
      ))}
    </div>
  );
}

/** El pop-up de un paso o de una métrica: la cuenta, el mes anterior y lo que la forma. */
function Detalle({ d, onCerrar }) {
  useEffect(() => {
    const alTeclear = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);
  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <div className="modal-card ev-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        aria-label={d.titulo}>
        <header className="ev-modal-cab">
          <div>
            <h3>{d.titulo} · {d.valor}</h3>
            {d.cuenta && <span className="ev-cuenta num">{d.cuenta}</span>}
          </div>
          <button type="button" className="btn ghost" onClick={onCerrar}>Cerrar</button>
        </header>
        {d.antes && (
          <div className="ev-antes">
            <span><span className="dim">Este mes</span><b className="num">{d.valor}</b></span>
            <span><span className="dim">{d.antes.mes}</span><b className="num">{d.antes.valor}</b></span>
            <span className={`ev-kpi-delta ${tonoDe(d.antes.d, d.antes.subeEsBueno !== false)}`}>{flecha(d.antes.d)}</span>
          </div>
        )}
        {d.partes && <Partes items={d.partes} />}
        {d.vacio && <div className="ev-vacio">{d.vacio}</div>}
        {d.filas && <ListaPaso filas={d.filas} conDebe={d.conDebe} />}
      </div>
    </div>
  );
}

/**
 * @param {{ real: object, embudo: object | null, embudoPrevio: object | null, mesPrevio: string,
 *           soloLlamadas?: boolean }} props
 *   `real` es lo que devuelve /api/ventas; `embudo` lo de /api/ventas/setting (los chats).
 *   `soloLlamadas` es la vista del closer: arranca en las agendas. Los chats y las
 *   conversaciones son del equipo, y dividir las agendas de un closer por los chats de
 *   todos daba una tasa de agendamiento del 1 % que no medía nada.
 */
export default function EmbudoVentas({ real, embudo, embudoPrevio, mesPrevio, soloLlamadas = false }) {
  // Qué está abierto: un paso del embudo o una métrica. Cerrado, la pantalla se lee entera.
  const [abierto, setAbierto] = useState(null);
  const cerrar = () => setAbierto(null);
  const a = real.actual ?? {};
  const p = real.previo ?? {};
  const chats = embudo?.chats ?? null;
  const chatsPrevio = embudoPrevio?.chats ?? null;
  const conversaciones = real.topFunnel?.conversaciones || null;
  const partes = (embudo?.chatsPartes ?? []).filter((x) => x.cuantos || x.clave !== 'otras');
  const facturado = (a.cashUsd ?? 0) + (a.deudaUsd ?? 0);
  const facturadoPrevio = (p.cashUsd ?? 0) + (p.deudaUsd ?? 0);
  const dCash = delta(a.cashUsd, p.cashUsd);
  const setters = (real.settersMes ?? []).filter((s) => s.conversaciones);

  const agendas = a.agendasDetalle ?? [];
  const shows = a.showsDetalle ?? [];
  const noShows = a.noShowsDetalle ?? [];
  const cierres = a.cierresDetalle ?? [];
  const senas = a.senasDetalle ?? [];
  const ventas = a.ventasDetalle ?? [...cierres, ...senas];
  const partesChats = partes.map((x) => [x.fuente, num(x.cuantos)]);
  const resueltas = (a.shows ?? 0) + (a.noShows ?? 0);
  const conSenas = a.senas ? ` + ${a.senas} ${a.senas === 1 ? 'seña' : 'señas'}` : '';

  const pasos = [
    { id: 'chats', label: 'Chats', valor: num(chats),
      sub: partes.map((x) => `${x.fuente.replace(' con CTA', '')} ${num(x.cuantos)}`).join(' · '),
      detalle: { partes: partesChats } },
    { id: 'conversaciones', label: 'Conversaciones', valor: num(conversaciones), sub: 'reporte del setter',
      detalle: setters.length
        ? { partes: setters.map((s) => [s.nombre, num(s.conversaciones)]) }
        : { vacio: 'Sin reportes del setter cargados en el mes' } },
    { id: 'agendas', label: 'Agendas', valor: num(a.agendados), sub: 'calls del mes', detalle: { filas: agendas } },
    { id: 'shows', label: 'Shows', valor: num(a.shows), sub: `${num(a.noShows)} no shows`, detalle: { filas: shows } },
    { id: 'cierres', label: 'Cierres', valor: `${num(a.cierres)}${conSenas}`, sub: a.senas ? `+ ${a.senas} señas` : 'sin señas',
      detalle: { filas: [...cierres, ...senas] } },
  ];
  const DE_CHATS = ['chats', 'conversaciones', 'conversion', 'agendamiento'];
  const pasosVista = soloLlamadas ? pasos.filter((x) => !DE_CHATS.includes(x.id)) : pasos;
  const tasas = [
    ['Tasa de conversión', pct(tasa(conversaciones, chats)), 'conversaciones / chats', 'conversion'],
    ['Tasa de agendamiento', pct(tasa(a.agendados, chats)), `${num(a.agendados)} agendas / ${num(chats)} chats`, 'agendamiento'],
    ['Tasa de show', pct(a.showRate), `${num(a.shows)} shows / ${num(resueltas)} resueltas`, 'show'],
    ['Tasa de cierre', pct(a.closeRate), `${num(a.cierres)} cierres / ${num(a.shows)} shows`, 'close'],
  ];

  const tasasVista = soloLlamadas ? tasas.filter((t) => !DE_CHATS.includes(t[3])) : tasas;

  const tAgend = tasa(a.agendados, chats);
  const tAgendPrevio = tasa(p.agendados, chatsPrevio);
  // Redondeados: un promedio de plata con centavos (US$ 81,43) es precisión que nadie usa.
  const porAgenda = (b) => (b.agendados ? Math.round(b.cashUsd / b.agendados) : null);
  const porShow = (b) => (b.shows ? Math.round(b.cashUsd / b.shows) : null);
  // Cada métrica: el número, contra qué se compara, la cuenta con sus números y la lista
  // de llamadas que la forman. La cuenta va en números, no en palabras: es lo que se
  // necesita para chequearla a mano.
  const kpis = [
    { id: 'cash', label: 'Cash del mes', valor: usd(a.cashUsd), actual: a.cashUsd, previo: p.cashUsd, antes: usd(p.cashUsd),
      cuenta: [`${usd(a.cashUsd - (a.cashDeSenaUsd ?? 0))} de ventas del mes`,
        a.cashDeSenaUsd ? `${usd(a.cashDeSenaUsd)} de señas que cerraron` : null].filter(Boolean).join(' + '),
      filas: ventas },
    { id: 'agendas', label: 'Agendas', valor: num(a.agendados), actual: a.agendados, previo: p.agendados, antes: num(p.agendados),
      cuenta: `${num(a.reuniones)} reuniones − ${num(a.seguimientos)} segundas con el mismo prospecto = ${num(a.agendados)}`,
      filas: agendas },
    { id: 'noshows', label: 'No shows', valor: num(a.noShows), actual: a.noShows, previo: p.noShows, antes: num(p.noShows),
      subeEsBueno: false, filas: noShows },
    { id: 'show', label: 'Show up rate', valor: pct(a.showRate), actual: a.showRate, previo: p.showRate, antes: pct(p.showRate),
      cuenta: `${num(a.shows)} shows ÷ ${num(resueltas)} resueltas (${num(a.shows)} shows + ${num(a.noShows)} no shows)`,
      filas: [...shows, ...noShows] },
    { id: 'close', label: 'Close rate', valor: pct(a.closeRate), actual: a.closeRate, previo: p.closeRate, antes: pct(p.closeRate),
      cuenta: `${num(a.cierres)} cierres ÷ ${num(a.shows)} shows`, filas: cierres },
    { id: 'agendamiento', label: 'T. agendamiento', valor: pct(tAgend), actual: tAgend, previo: tAgendPrevio,
      antes: tAgendPrevio == null ? 'sin chats' : pct(tAgendPrevio),
      cuenta: `${num(a.agendados)} agendas ÷ ${num(chats)} chats`, partes: partesChats, filas: agendas },
    { id: 'aov', label: 'AOV', valor: usd(a.averageSaleUsd), actual: a.averageSaleUsd, previo: p.averageSaleUsd, antes: usd(p.averageSaleUsd),
      cuenta: `${usd(a.cashUsd)} cash ÷ ${num(a.cierres)} cierres`, filas: cierres },
    { id: 'poragenda', label: 'Cash / agenda', valor: usd(porAgenda(a) ?? 0), actual: porAgenda(a), previo: porAgenda(p),
      antes: usd(porAgenda(p) ?? 0), cuenta: `${usd(a.cashUsd)} cash ÷ ${num(a.agendados)} agendas`, filas: ventas },
    { id: 'porshow', label: 'Cash / show', valor: usd(porShow(a) ?? 0), actual: porShow(a), previo: porShow(p),
      antes: usd(porShow(p) ?? 0), cuenta: `${usd(a.cashUsd)} cash ÷ ${num(a.shows)} shows`, filas: ventas },
    { id: 'senas', label: 'Señas', valor: num(a.senas), actual: a.senas, previo: p.senas, antes: num(p.senas), filas: senas },
  ];

  const deben = ventas.filter((v) => (v.deudaUsd ?? 0) > 0);
  // Lo que se abre y no es tarjeta: la plata de arriba y la tasa de conversión. Las otras
  // tres tasas del embudo son las mismas tarjetas de abajo y abren lo mismo.
  const otras = [
    { id: 'facturacion', label: 'Facturación', valor: usd(facturado), actual: facturado, previo: facturadoPrevio,
      antes: usd(facturadoPrevio), cuenta: `${usd(a.cashUsd)} cobrado + ${usd(a.deudaUsd)} por cobrar`,
      filas: ventas, conDebe: true },
    { id: 'porcobrar', label: 'Por cobrar', valor: usd(a.deudaUsd), actual: a.deudaUsd, previo: p.deudaUsd,
      antes: usd(p.deudaUsd), subeEsBueno: false,
      cuenta: `lo que deben ${num(deben.length)} de las ${num(ventas.length)} ventas del mes`, filas: deben, conDebe: true },
    { id: 'ventas', label: 'Ventas', valor: num(a.ventas), actual: a.ventas, previo: p.ventas, antes: num(p.ventas),
      cuenta: `${num(a.cierres)} cierres + ${num(a.senas)} señas`, filas: ventas, conDebe: true },
    { id: 'conversion', label: 'Tasa de conversión', valor: pct(tasa(conversaciones, chats)),
      cuenta: `${num(conversaciones)} conversaciones ÷ ${num(chats)} chats`,
      partes: [...partesChats, ...setters.map((s) => [`Conversaciones de ${s.nombre}`, num(s.conversaciones)])] },
  ];

  const kpisVista = soloLlamadas ? kpis.filter((k) => !DE_CHATS.includes(k.id)) : kpis;

  let detalle = null;
  const paso = pasos.find((x) => `paso:${x.id}` === abierto);
  const kpi = [...kpis, ...otras].find((x) => `kpi:${x.id}` === abierto);
  if (paso) detalle = { titulo: paso.label, valor: paso.valor, cuenta: paso.id === 'chats' || paso.id === 'cierres' ? null : paso.sub, ...paso.detalle };
  if (kpi) {
    detalle = {
      titulo: kpi.label, valor: kpi.valor, cuenta: kpi.cuenta, partes: kpi.partes, filas: kpi.filas, conDebe: kpi.conDebe,
      antes: kpi.antes === undefined ? null
        : { mes: mayuscula(mesPrevio), valor: kpi.antes, d: delta(kpi.actual, kpi.previo), subeEsBueno: kpi.subeEsBueno },
    };
  }

  return (
    <>
      <section className="card ev-plata">
        <div className="ev-plata-izq">
          <button type="button" className="ev-abre" onClick={() => setAbierto('kpi:facturacion')}>
            <span className="dim">Facturación</span>
            <b className="num">{usd(facturado)}</b>
          </button>
          <div>
            <button type="button" className="ev-abre" onClick={() => setAbierto('kpi:cash')}>
              <span className="dim">Cash collected</span>
            </button>
            <div className="ev-cash">
              <button type="button" className="ev-abre" onClick={() => setAbierto('kpi:cash')}>
                <b className="num pl-cobrado">{usd(a.cashUsd)}</b>
              </button>
              <div className="ev-cash-partes">
                <button type="button" className="ev-abre" onClick={() => setAbierto('kpi:porcobrar')}>
                  <span className="dim">Por cobrar</span><b className="num pl-debe">{usd(a.deudaUsd)}</b>
                </button>
                <button type="button" className="ev-abre" onClick={() => setAbierto('kpi:ventas')}>
                  <span className="dim">Ventas</span><b className="num">{num(a.ventas)}</b>
                </button>
              </div>
            </div>
          </div>
        </div>
        <button type="button" className="ev-abre ev-plata-der" onClick={() => setAbierto('kpi:cash')}>
          <b className={dCash == null ? 'dim' : dCash >= 0 ? 'ok' : 'alert'}>{flecha(dCash)}</b>
          <span className="dim">vs {mesPrevio} · {usd(p.cashUsd)} · facturado {usd(facturadoPrevio)}</span>
        </button>
      </section>

      <section className="card ev-embudo">
        <h3 className="ev-titulo">Embudo de ventas</h3>
        <div className="ev-cuerpo">
          <div className="ev-trapecios">
            {pasosVista.map((x, i) => {
              const w = ANCHOS[i];
              const recorte = i < pasosVista.length - 1 ? ((w - ANCHOS[i + 1]) / 2) * (100 / w) : 0;
              const activo = abierto === `paso:${x.id}`;
              return (
                <button
                  key={x.id}
                  type="button"
                  className={`ev-paso${activo ? ' activo' : ''}`}
                  aria-pressed={activo}
                  style={{
                    width: `${w}%`,
                    '--tinta': `var(--ev-capa-${i})`,
                    clipPath: i < pasosVista.length - 1 ? `polygon(0 0, 100% 0, ${100 - recorte}% 100%, ${recorte}% 100%)` : undefined,
                  }}
                  onClick={() => setAbierto(`paso:${x.id}`)}
                >
                  <span className="ev-paso-label">{x.label}</span>
                  <span className="ev-paso-valor num">{x.id === 'cierres' ? num(a.cierres) : x.valor}</span>
                  <span className="ev-paso-sub">{x.sub}</span>
                </button>
              );
            })}
          </div>
          <div className="ev-tasas">
            {tasasVista.map(([label, valor, base, id]) => (
              <button key={label} type="button" className="ev-abre" onClick={() => setAbierto(`kpi:${id}`)}>
                <span className="dim">{label}</span>
                <b className="num">{valor}</b>
                <small className="dim">{base}</small>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="ev-kpis-titulo">Métricas del mes</div>
      <div className="ev-kpis">
        {kpisVista.map((k) => (
          <Kpi key={k.id} label={k.label} valor={k.valor} d={delta(k.actual, k.previo)} antes={k.antes}
            subeEsBueno={k.subeEsBueno !== false} onAbrir={() => setAbierto(`kpi:${k.id}`)} />
        ))}
      </div>

      {detalle && <Detalle d={detalle} onCerrar={cerrar} />}
    </>
  );
}
