import { useEffect, useMemo, useState } from 'react';
import CerrarSena from './CerrarSena.jsx';
import { FormResultado } from './ListaLlamadas.jsx';
import NuevaReunion from './NuevaReunion.jsx';
import {
  CeldaCash, MoverLlamada, SelectCloser, SelectPrograma, SelectStatus, closerDe, enSena, statusDe, useLlamada,
} from './CeldasLlamada.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * Todas las llamadas del mes en una planilla, como la lista de leads de atv-mkt.
 *
 * Reemplazó al calendario de la Operativa: el director cambiaba el estado de una llamada
 * buscándola en la semana; acá están todas, una por fila, y el status se cambia en la
 * celda. Lo que no entra en una celda —la nota, corregir el nombre— está en la ficha,
 * que se abre tocando el nombre.
 */

const ORDEN = {
  call_desc: { label: 'Call, más nueva', fn: (a, b) => b.fechaAt.localeCompare(a.fechaAt) },
  call_asc: { label: 'Call, más vieja', fn: (a, b) => a.fechaAt.localeCompare(b.fechaAt) },
  agendo_desc: { label: 'Agendó, más nueva', fn: (a, b) => (b.agendoAt || '').localeCompare(a.agendoAt || '') },
  nombre: { label: 'Nombre', fn: (a, b) => a.prospecto.localeCompare(b.prospecto, 'es') },
  pago: { label: 'Pagó', fn: (a, b) => (b.cashUsd || 0) - (a.cashUsd || 0) },
};
const GRUPOS = { '': 'Sin agrupar', closer: 'Closer', status: 'Status', origen: 'Origen', dia: 'Día de la call' };
// Las columnas que se pueden esconder. Nombre, status y call quedan siempre.
const OPCIONALES = [
  ['ig', 'IG'], ['tel', 'Tel'], ['email', 'Email'], ['origen', 'Origen'], ['ads', 'Ads'],
  ['agendo', 'Agendó'], ['dias', 'Días p/ agendar'], ['setter', 'Setter'], ['closer', 'Closer'],
  ['link', 'Link'], ['programa', 'Programa'], ['pago', 'Pagó'], ['debe', 'Debe'],
];
const CLAVE_COLUMNAS = 'atv-ops:planilla-calls:columnas';

const fechaCall = (iso) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} `
    + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
};
const fechaCorta = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const usd = (n) => (n ? formatValue(n, 'usd') : '—');
// Muchas fichas guardan el perfil entero ("https://www.instagram.com/usuario/"): se
// muestra el usuario, que es lo que se lee y lo que entra en la columna.
const usuarioIg = (ig) => {
  const limpio = (ig || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@/, '');
  return limpio ? `@${limpio}` : '';
};

function leerColumnas() {
  try {
    const guardadas = JSON.parse(localStorage.getItem(CLAVE_COLUMNAS) ?? 'null');
    if (Array.isArray(guardadas)) return new Set(guardadas);
  } catch {
    /* sin localStorage van todas */
  }
  return new Set(OPCIONALES.map(([k]) => k));
}

function Fila({ l, datos, ver, mes, onRecargar, onAbrir }) {
  const f = useLlamada(l, { estados: datos.estados, mes, lista: false, onGuardado: onRecargar });
  const descartada = l.estado === 'descartada';
  return (
    <>
      <tr className={descartada ? 'descartada' : ''}>
        <th scope="row" className="pl-nombre">
          <button type="button" className="pl-abrir" onClick={onAbrir} title="Abrir la ficha">
            {l.prospecto}
          </button>
          {l.segunda && <span className="pl-segunda" title="Segunda reunión con el mismo prospecto">2ª</span>}
        </th>
        {ver.has('ig') && <td className="dim pl-corta pl-c-ig" title={l.instagram || undefined}>{usuarioIg(l.instagram) || '—'}</td>}
        {ver.has('tel') && <td className="dim num pl-corta pl-c-tel" title={l.telefono || undefined}>{l.telefono || '—'}</td>}
        {ver.has('email') && <td className="dim pl-corta pl-c-email" title={l.email || undefined}>{l.email || '—'}</td>}
        <td>{descartada ? <span className="pl-pill st-descartada">Descartada</span>
          : <SelectStatus llamada={l} estados={datos.estados} f={f} />}</td>
        {ver.has('origen') && <td className="dim pl-corta pl-c-origen" title={l.origen || undefined}>{l.origen || '—'}</td>}
        {ver.has('ads') && <td>{l.vinoDeAds ? 'Sí' : <span className="dim">—</span>}</td>}
        {ver.has('agendo') && <td className="dim num">{fechaCorta(l.agendoAt)}</td>}
        <td className="num">{fechaCall(l.fechaAt)}</td>
        {ver.has('dias') && <td className="dim num">{l.diasParaAgendar ?? '—'}</td>}
        {ver.has('setter') && <td className="dim">{l.setter || '—'}</td>}
        {ver.has('closer') && <td><SelectCloser llamada={l} equipo={datos.equipo} f={f} /></td>}
        {ver.has('link') && (
          <td>
            {l.fathomUrl ? <a href={l.fathomUrl} target="_blank" rel="noreferrer">Fathom ↗</a>
              : l.grabacion ? <a href={l.grabacion} target="_blank" rel="noreferrer">Call ↗</a>
                : <span className="dim">—</span>}
          </td>
        )}
        {ver.has('programa') && <td><SelectPrograma llamada={l} programas={datos.programas} f={f} /></td>}
        {ver.has('pago') && <td className="right"><CeldaCash llamada={l} f={f} /></td>}
        {ver.has('debe') && <td className={`right num${l.saldoUsd > 0 ? ' pl-debe' : ' dim'}`}>{usd(l.saldoUsd)}</td>}
      </tr>
      {(f.error || f.faltaPrograma || f.guardando) && (
        <tr className="pl-aviso">
          <td colSpan={99}>
            <span className={f.error ? 'ronda-evento error' : 'dim'}>
              {f.error || (f.guardando ? 'Guardando…' : 'Elegí el programa para guardar la venta.')}
            </span>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * @param {{ datos: { llamadas: object[], programas: object[], estados: string[], equipo: string[] },
 *           mes: string, onRecargar: () => void }} props
 */
export default function PlanillaCalls({ datos, mes, onRecargar }) {
  const [tab, setTab] = useState('Todas');
  const [closer, setCloser] = useState('');
  const [q, setQ] = useState('');
  const [orden, setOrden] = useState('call_desc');
  const [grupo, setGrupo] = useState('');
  const [origen, setOrigen] = useState('');
  const [soloAds, setSoloAds] = useState(false);
  const [panel, setPanel] = useState(null); // 'filtrar' | 'columnas'
  const [ver, setVer] = useState(leerColumnas);
  const [ficha, setFicha] = useState(null);
  const [agregando, setAgregando] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(CLAVE_COLUMNAS, JSON.stringify([...ver])); } catch { /* no pasa nada */ }
  }, [ver]);

  const llamadas = datos.llamadas;
  const conStatus = useMemo(
    () => llamadas.map((l) => ({ l, etiqueta: statusDe(l, datos.estados).etiqueta, closer: closerDe(l.closer, datos.equipo) })),
    [llamadas, datos.estados, datos.equipo],
  );

  // Las pestañas salen de lo que hay: un status sin llamadas no ocupa lugar.
  const tabs = useMemo(() => {
    const cuenta = {};
    for (const x of conStatus) cuenta[x.etiqueta] = (cuenta[x.etiqueta] ?? 0) + 1;
    const orden = ['Falta cargar', 'Por venir', ...datos.estados.filter((e) => e !== 'Descartada')];
    const resto = Object.keys(cuenta).filter((e) => !orden.includes(e) && e !== 'Descartada');
    return [
      ['Todas', conStatus.filter((x) => x.etiqueta !== 'Descartada').length],
      ...[...orden, ...resto].filter((e) => cuenta[e]).map((e) => [e, cuenta[e]]),
      ...(cuenta.Descartada ? [['Descartada', cuenta.Descartada]] : []),
    ];
  }, [conStatus, datos.estados]);

  const origenes = useMemo(() => [...new Set(llamadas.map((l) => l.origen).filter(Boolean))].sort(), [llamadas]);
  const sinDueno = conStatus.some((x) => !x.closer);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return conStatus
      .filter((x) => (tab === 'Todas' ? x.etiqueta !== 'Descartada' : x.etiqueta === tab))
      .filter((x) => (closer === '' ? true : closer === '—' ? !x.closer : x.closer === closer))
      .filter((x) => (origen ? x.l.origen === origen : true))
      .filter((x) => (soloAds ? x.l.vinoDeAds : true))
      .filter((x) => !t || [x.l.prospecto, x.l.email, x.l.instagram, x.l.closer, x.l.setter]
        .some((c) => (c || '').toLowerCase().includes(t)))
      .sort((a, b) => ORDEN[orden].fn(a.l, b.l));
  }, [conStatus, tab, closer, origen, soloAds, q, orden]);

  const grupos = useMemo(() => {
    if (!grupo) return [['', visibles]];
    const clave = (x) => (grupo === 'closer' ? x.closer || 'Sin dueño'
      : grupo === 'status' ? x.etiqueta
        : grupo === 'origen' ? x.l.origen || 'Sin origen'
          : new Date(x.l.fechaAt).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' }));
    const m = new Map();
    for (const x of visibles) {
      const k = clave(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return [...m.entries()];
  }, [visibles, grupo]);

  const cobrado = visibles.reduce((a, x) => a + (x.l.cashUsd || 0), 0);
  const debe = visibles.reduce((a, x) => a + (x.l.saldoUsd || 0), 0);
  const filtros = (origen ? 1 : 0) + (soloAds ? 1 : 0);
  const fichaAbierta = ficha && llamadas.find((l) => l.id === ficha);

  const cabecera = (
    <tr>
      <th scope="col" className="pl-nombre">Nombre</th>
      {ver.has('ig') && <th scope="col">IG</th>}
      {ver.has('tel') && <th scope="col">Tel</th>}
      {ver.has('email') && <th scope="col">Email</th>}
      <th scope="col">Status</th>
      {ver.has('origen') && <th scope="col">Origen</th>}
      {ver.has('ads') && <th scope="col">Ads</th>}
      {ver.has('agendo') && <th scope="col">Agendó</th>}
      <th scope="col">Call</th>
      {ver.has('dias') && <th scope="col">Días</th>}
      {ver.has('setter') && <th scope="col">Setter</th>}
      {ver.has('closer') && <th scope="col">Closer</th>}
      {ver.has('link') && <th scope="col">Link</th>}
      {ver.has('programa') && <th scope="col">Programa</th>}
      {ver.has('pago') && <th scope="col" className="right">Pagó</th>}
      {ver.has('debe') && <th scope="col" className="right">Debe</th>}
    </tr>
  );

  return (
    <section className="planilla card">
      {/* Tres franjas a lo ancho: el status, los totales con el buscador, y las
          herramientas con el closer. Todo en dos renglones quedaba apretado. */}
      <div className="pl-tabs" role="group" aria-label="Status">
        {tabs.map(([t, n]) => (
          <button key={t} type="button" className={`pl-tab${tab === t ? ' activo' : ''}`} onClick={() => setTab(t)}>
            <span>{t}</span><b className="num">{n}</b>
          </button>
        ))}
      </div>

      <div className="pl-barra pl-resumen">
        <div className="pl-totales">
          <span><small>Calls</small><b className="num">{visibles.length}</b></span>
          <span><small>Cobrado</small><b className="num pl-cobrado">{usd(cobrado)}</b></span>
          <span><small>Debe</small><b className="num pl-debe">{usd(debe)}</b></span>
        </div>
        <input
          type="search"
          className="pl-buscar"
          placeholder="Buscar nombre, mail, closer…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar en las llamadas"
        />
      </div>

      <div className="pl-barra pl-herramientas">
        <div className="pl-izq">
          <div className="pl-pop">
            <button type="button" className={`btn sm${filtros ? ' activo' : ''}`} aria-expanded={panel === 'filtrar'}
              onClick={() => setPanel(panel === 'filtrar' ? null : 'filtrar')}>
              Filtrar{filtros ? ` · ${filtros}` : ''}
            </button>
            {panel === 'filtrar' && (
              <div className="pl-menu">
                <label>Origen
                  <select value={origen} onChange={(e) => setOrigen(e.target.value)}>
                    <option value="">Todos</option>
                    {origenes.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
                <label className="pl-check">
                  <input type="checkbox" checked={soloAds} onChange={(e) => setSoloAds(e.target.checked)} /> Solo las que vinieron de ads
                </label>
              </div>
            )}
          </div>
          <label className="pl-select">Ordenar
            <select value={orden} onChange={(e) => setOrden(e.target.value)}>
              {Object.entries(ORDEN).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
            </select>
          </label>
          <div className="pl-pop">
            <button type="button" className="btn sm" aria-expanded={panel === 'columnas'}
              onClick={() => setPanel(panel === 'columnas' ? null : 'columnas')}>
              Columnas · {ver.size + 3}
            </button>
            {panel === 'columnas' && (
              <div className="pl-menu">
                {OPCIONALES.map(([k, label]) => (
                  <label key={k} className="pl-check">
                    <input type="checkbox" checked={ver.has(k)} onChange={(e) => setVer((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(k); else n.delete(k);
                      return n;
                    })} /> {label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <label className="pl-select">Agrupar
            <select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
              {Object.entries(GRUPOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </div>
        <div className="pl-seg" role="group" aria-label="Closer">
          {[['', 'Todos los closers'], ...datos.equipo.map((n) => [n, n]), ...(sinDueno ? [['—', 'Sin dueño']] : [])]
            .map(([k, l]) => (
              <button key={k || 'todos'} type="button" className={closer === k ? 'activo' : ''} onClick={() => setCloser(k)}>{l}</button>
            ))}
        </div>
      </div>

      <div className="pl-scroll">
        <table className="pl-tabla">
          <thead>{cabecera}</thead>
          {grupos.map(([nombre, filas]) => (
            <tbody key={nombre || 'todas'}>
              {nombre && (
                <tr className="pl-grupo"><th colSpan={99} scope="rowgroup">{nombre} <span className="dim num">{filas.length}</span></th></tr>
              )}
              {filas.map((x) => (
                <Fila key={x.l.id} l={x.l} datos={datos} ver={ver} mes={mes}
                  onRecargar={onRecargar} onAbrir={() => setFicha(x.l.id)} />
              ))}
            </tbody>
          ))}
        </table>
        {!visibles.length && <div className="empty">No hay llamadas con estos filtros.</div>}
      </div>

      <div className="pl-pie">
        <span className="dim">{visibles.length} de {conStatus.length} calls</span>
        <button type="button" className="btn sm" onClick={() => setAgregando(true)}>+ Agregar call</button>
      </div>

      {fichaAbierta && (
        <div className="modal-backdrop" onClick={() => setFicha(null)} role="presentation">
          <div className="modal-card pl-ficha" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Ficha de ${fichaAbierta.prospecto}`}>
            <header>
              <div>
                <h3>{fichaAbierta.prospecto}</h3>
                <p className="dim">
                  {[fechaCall(fichaAbierta.fechaAt), fichaAbierta.email, fichaAbierta.telefono,
                    fichaAbierta.instagram && `@${fichaAbierta.instagram}`, fichaAbierta.facturaHoy && `factura ${fichaAbierta.facturaHoy}`,
                    fichaAbierta.setter && `set por ${fichaAbierta.setter}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button type="button" className="btn ghost" onClick={() => setFicha(null)}>Cerrar</button>
            </header>
            {/* Una seña de un mes pasado que terminó de cerrar: el cash va al mes en que entró. */}
            {enSena(fichaAbierta) && (
              <CerrarSena llamada={fichaAbierta} mes={mes} onGuardado={() => { setFicha(null); onRecargar(); }} />
            )}
            <MoverLlamada llamada={fichaAbierta} onGuardado={() => { setFicha(null); onRecargar(); }} />
            <FormResultado
              llamada={fichaAbierta}
              programas={datos.programas}
              estados={datos.estados}
              equipo={datos.equipo}
              mes={mes}
              sinLista
              onGuardado={() => { setFicha(null); onRecargar(); }}
              onCerrar={() => setFicha(null)}
            />
          </div>
        </div>
      )}

      {agregando && (
        <NuevaReunion
          programas={datos.programas}
          estados={datos.estados}
          onCreada={onRecargar}
          onCerrar={() => setAgregando(false)}
        />
      )}
    </section>
  );
}
