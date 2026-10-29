import { useEffect, useState } from 'react';
import { claseStatus } from './CeldasLlamada.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * El dashboard de ventas como el de atv-mkt: el mes en plata arriba, el embudo de punta a
 * punta en el medio y las métricas contra el mes anterior abajo.
 *
 * Cada paso del embudo se abre: al tocarlo se ven las llamadas que lo forman. La lista
 * sale del mismo cálculo que el número (`agendasDetalle`, `showsDetalle`…), así que lo
 * que se cuenta y lo que se lista no pueden no coincidir.
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

function Kpi({ label, valor, d, antes, subeEsBueno = true }) {
  const tono = d == null || d === 0 ? '' : (d > 0) === subeEsBueno ? 'ok' : 'alert';
  return (
    <div className="ev-kpi">
      <span className="ev-kpi-label">{label}</span>
      <span className="ev-kpi-valor num">{valor}</span>
      <span className={`ev-kpi-delta ${tono}`}>
        {d == null ? '—' : `${d > 0 ? '▲' : d < 0 ? '▼' : '─'} ${Math.abs(d).toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`}
        <span className="dim"> vs {antes}</span>
      </span>
    </div>
  );
}

function ListaPaso({ filas }) {
  if (!filas.length) return <div className="ev-vacio">No hay llamadas en este paso.</div>;
  return (
    <div className="ev-lista">
      <div className="ev-fila ev-cab">
        <span>Prospecto</span><span>Call</span><span>Status</span><span>Closer</span><span>Origen</span><span className="right">Pagó</span>
      </div>
      <div className="ev-scroll">
        {filas.map((f) => (
          <div key={f.id} className="ev-fila">
            <span className="strong pl-corta">{f.nombre}</span>
            <span className="num dim">{f.fecha ? new Date(`${f.fecha}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—'}</span>
            <span><span className={`pl-pill ${claseStatus(f.estado)}`}>{mayuscula(f.estado) || 'Falta cargar'}</span></span>
            <span>{f.closer || '—'}</span>
            <span className="dim">{f.origen || '—'}</span>
            <span className={`right num${f.pagoUsd ? ' pl-cobrado' : ' dim'}`}>{f.pagoUsd ? usd(f.pagoUsd) : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * @param {{ real: object, embudo: object | null, embudoPrevio: object | null, mesPrevio: string }} props
 *   `real` es lo que devuelve /api/ventas; `embudo` lo de /api/ventas/setting (los chats).
 */
export default function EmbudoVentas({ real, embudo, embudoPrevio, mesPrevio }) {
  // El detalle de un paso se abre en un pop-up al tocarlo; cerrado, el embudo se lee entero.
  const [paso, setPaso] = useState(null);
  useEffect(() => {
    if (!paso) return undefined;
    const alTeclear = (e) => e.key === 'Escape' && setPaso(null);
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [paso]);
  const a = real.actual ?? {};
  const p = real.previo ?? {};
  const chats = embudo?.chats ?? null;
  const chatsPrevio = embudoPrevio?.chats ?? null;
  const conversaciones = real.topFunnel?.conversaciones || null;
  const partes = (embudo?.chatsPartes ?? []).filter((x) => x.cuantos || x.clave !== 'otras');
  const facturado = (a.cashUsd ?? 0) + (a.deudaUsd ?? 0);
  const facturadoPrevio = (p.cashUsd ?? 0) + (p.deudaUsd ?? 0);
  const dCash = delta(a.cashUsd, p.cashUsd);

  const pasos = [
    { id: 'chats', label: 'Chats', valor: num(chats),
      sub: partes.map((x) => `${x.fuente.replace(' con CTA', '')} ${num(x.cuantos)}`).join(' · ') },
    { id: 'conversaciones', label: 'Conversaciones', valor: num(conversaciones), sub: 'reporte del setter' },
    { id: 'agendas', label: 'Agendas', valor: num(a.agendados), sub: 'calls del mes' },
    { id: 'shows', label: 'Shows', valor: num(a.shows), sub: `${num(a.noShows)} no shows` },
    { id: 'cierres', label: 'Cierres', valor: num(a.cierres), sub: a.senas ? `+ ${a.senas} señas` : 'sin señas' },
  ];
  const tasas = [
    ['Tasa de conversión', pct(tasa(conversaciones, chats)), 'conversaciones / chats'],
    ['Tasa de agendamiento', pct(tasa(a.agendados, chats)), `${num(a.agendados)} agendas / ${num(chats)} chats`],
    ['Tasa de show', pct(a.showRate), `${num(a.shows)} shows / ${num((a.shows ?? 0) + (a.noShows ?? 0))} resueltas`],
    ['Tasa de cierre', pct(a.closeRate), `${num(a.cierres)} cierres / ${num(a.shows)} shows`],
  ];

  const tAgend = tasa(a.agendados, chats);
  const tAgendPrevio = tasa(p.agendados, chatsPrevio);
  const kpis = [
    ['Cash del mes', usd(a.cashUsd), delta(a.cashUsd, p.cashUsd), usd(p.cashUsd)],
    ['Agendas', num(a.agendados), delta(a.agendados, p.agendados), num(p.agendados)],
    ['No shows', num(a.noShows), delta(a.noShows, p.noShows), num(p.noShows), false],
    ['Show up rate', pct(a.showRate), delta(a.showRate, p.showRate), pct(p.showRate)],
    ['Close rate', pct(a.closeRate), delta(a.closeRate, p.closeRate), pct(p.closeRate)],
    ['T. agendamiento', pct(tAgend), delta(tAgend, tAgendPrevio), tAgendPrevio == null ? 'sin chats' : pct(tAgendPrevio)],
    ['AOV', usd(a.averageSaleUsd), delta(a.averageSaleUsd, p.averageSaleUsd), usd(p.averageSaleUsd)],
    ['Cash / agenda', usd(a.agendados ? a.cashUsd / a.agendados : 0),
      delta(a.agendados ? a.cashUsd / a.agendados : null, p.agendados ? p.cashUsd / p.agendados : null),
      usd(p.agendados ? p.cashUsd / p.agendados : 0)],
    ['Cash / show', usd(a.shows ? a.cashUsd / a.shows : 0),
      delta(a.shows ? a.cashUsd / a.shows : null, p.shows ? p.cashUsd / p.shows : null),
      usd(p.shows ? p.cashUsd / p.shows : 0)],
    ['Señas', num(a.senas), delta(a.senas, p.senas), num(p.senas)],
  ];

  const actual = pasos.find((x) => x.id === paso);
  const filasDe = {
    agendas: a.agendasDetalle ?? [],
    shows: a.showsDetalle ?? [],
    cierres: [...(a.cierresDetalle ?? []), ...(a.senasDetalle ?? [])],
  };
  const setters = (real.settersMes ?? []).filter((s) => s.conversaciones);

  return (
    <>
      <section className="card ev-plata">
        <div className="ev-plata-izq">
          <div>
            <span className="dim">Facturación</span>
            <b className="num">{usd(facturado)}</b>
          </div>
          <div>
            <span className="dim">Cash collected</span>
            <div className="ev-cash">
              <b className="num pl-cobrado">{usd(a.cashUsd)}</b>
              <div className="ev-cash-partes">
                <span><span className="dim">Por cobrar</span><b className="num pl-debe">{usd(a.deudaUsd)}</b></span>
                <span><span className="dim">Ventas</span><b className="num">{num(a.ventas)}</b></span>
              </div>
            </div>
          </div>
        </div>
        <div className="ev-plata-der">
          <b className={dCash == null ? 'dim' : dCash >= 0 ? 'ok' : 'alert'}>
            {dCash == null ? '—' : `${dCash >= 0 ? '▲' : '▼'} ${Math.abs(dCash).toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`}
          </b>
          <span className="dim">vs {mesPrevio} · {usd(p.cashUsd)} · facturado {usd(facturadoPrevio)}</span>
        </div>
      </section>

      <section className="card ev-embudo">
        <h3 className="ev-titulo">Embudo de ventas</h3>
        <div className="ev-cuerpo">
          <div className="ev-trapecios">
            {pasos.map((x, i) => {
              const w = ANCHOS[i];
              const recorte = i < pasos.length - 1 ? ((w - ANCHOS[i + 1]) / 2) * (100 / w) : 0;
              return (
                <button
                  key={x.id}
                  type="button"
                  className={`ev-paso${paso === x.id ? ' activo' : ''}`}
                  aria-pressed={paso === x.id}
                  style={{
                    width: `${w}%`,
                    '--tinta': `var(--ev-capa-${i})`,
                    clipPath: i < pasos.length - 1 ? `polygon(0 0, 100% 0, ${100 - recorte}% 100%, ${recorte}% 100%)` : undefined,
                  }}
                  onClick={() => setPaso(x.id)}
                >
                  <span className="ev-paso-label">{x.label}</span>
                  <span className="ev-paso-valor num">{x.valor}</span>
                  <span className="ev-paso-sub">{x.sub}</span>
                </button>
              );
            })}
          </div>
          <div className="ev-tasas">
            {tasas.map(([label, valor, base]) => (
              <div key={label}>
                <span className="dim">{label}</span>
                <b className="num">{valor}</b>
                <small className="dim">{base}</small>
              </div>
            ))}
          </div>
        </div>

      </section>

      {actual && (
        <div className="modal-backdrop" onClick={() => setPaso(null)} role="presentation">
          <div className="modal-card ev-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
            aria-label={`${actual.label} del mes`}>
          <header className="ev-modal-cab">
            <div>
              <h3>{actual.label} · {actual.valor}{paso === 'cierres' && a.senas ? ` + ${a.senas} ${a.senas === 1 ? 'seña' : 'señas'}` : ''}</h3>
              {actual.sub && paso !== 'cierres' && <span className="dim">{actual.sub}</span>}
            </div>
            <button type="button" className="btn ghost" onClick={() => setPaso(null)}>Cerrar</button>
          </header>
          {paso === 'chats' && (
            <div className="ev-partes">
              {partes.map((x) => (
                <div key={x.clave}>
                  <span>{x.fuente}</span>
                  <span className="dim">{x.detalle}</span>
                  <b className="num">{num(x.cuantos)}</b>
                </div>
              ))}
            </div>
          )}
          {paso === 'conversaciones' && (setters.length ? (
            <div className="ev-partes">
              {setters.map((s) => (
                <div key={s.nombre}>
                  <span>{s.nombre}</span>
                  <span className="dim">{s.reportes} {s.reportes === 1 ? 'reporte' : 'reportes'}</span>
                  <b className="num">{num(s.conversaciones)}</b>
                </div>
              ))}
            </div>
          ) : <div className="ev-vacio">Sin reportes del setter cargados en el mes</div>)}
          {filasDe[paso] && <ListaPaso filas={filasDe[paso]} />}
          </div>
        </div>
      )}

      <div className="ev-kpis-titulo">Métricas del mes</div>
      <div className="ev-kpis">
        {kpis.map(([label, valor, d, antes, subeEsBueno]) => (
          <Kpi key={label} label={label} valor={valor} d={d} antes={antes} subeEsBueno={subeEsBueno !== false} />
        ))}
      </div>
    </>
  );
}
