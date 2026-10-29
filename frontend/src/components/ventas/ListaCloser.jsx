import { useEffect, useMemo, useState } from 'react';
import { FormResultado } from './ListaLlamadas.jsx';
import { CeldaCash, SelectPrograma, SelectStatus, statusDe, useLlamada } from './CeldasLlamada.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * Las llamadas del closer, por día, con la ficha de la que está mirando al costado.
 *
 * Lo de todos los días se hace en la fila: el status, el programa y el cash de una venta.
 * Lo demás —quién es, de dónde vino, la nota, corregir el nombre— está en la ficha, sin
 * abrir otra pantalla.
 */

const hora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const dia = (iso) => new Date(iso).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' });
const usd = (n) => (n ? formatValue(n, 'usd') : '—');

function Fila({ l, datos, mes, activa, onAbrir, onActualizado }) {
  const f = useLlamada(l, { estados: datos.estados, mes, onGuardado: onActualizado });
  return (
    <div className={`lc-fila${activa ? ' activa' : ''}${l.estado === 'descartada' ? ' descartada' : ''}`}>
      <span className="num dim">{hora(l.fechaAt)}</span>
      <button type="button" className="lc-quien" onClick={onAbrir}>
        <b>{l.prospecto}{l.segunda && <span className="pl-segunda">2ª</span>}</b>
        <small>{[l.email, l.telefono].filter(Boolean).join(' · ') || 'sin datos de contacto'}</small>
      </button>
      <span>{l.estado === 'descartada' ? <span className="pl-pill st-descartada">Descartada</span>
        : <SelectStatus llamada={l} estados={datos.estados} f={f} />}</span>
      <span><SelectPrograma programas={datos.programas} f={f} /></span>
      <span className="dim lc-origen" title={l.origen}>{l.origen || '—'}</span>
      <span className="right"><CeldaCash llamada={l} f={f} /></span>
      {(f.error || f.faltaPrograma) && (
        <span className={`lc-aviso ${f.error ? 'ronda-evento error' : 'dim'}`}>
          {f.error || 'Elegí el programa para guardar la venta.'}
        </span>
      )}
    </div>
  );
}

function Ficha({ l, datos, mes, onActualizado }) {
  const f = useLlamada(l, { estados: datos.estados, mes, onGuardado: onActualizado });
  const dato = (label, valor) => (
    <><span className="dim">{label}</span><span>{valor || '—'}</span></>
  );
  return (
    <aside className="lc-ficha card">
      <header>
        <div>
          <h3>{l.prospecto}</h3>
          <span className="dim">{dia(l.fechaAt)} · {hora(l.fechaAt)}</span>
        </div>
        <span className={`pl-pill ${l.estado === 'descartada' ? 'st-descartada' : ''}`}>{statusDe(l, datos.estados).etiqueta}</span>
      </header>
      <div className="lc-bloque">
        <h4>Contacto</h4>
        <div className="lc-datos">
          {dato('Email', l.email)}
          {dato('Tel', l.telefono)}
          {dato('IG', l.instagram && `@${l.instagram}`)}
        </div>
      </div>
      <div className="lc-bloque">
        <h4>Cómo llegó</h4>
        <div className="lc-datos">
          {dato('Origen', l.origen)}
          {dato('Vino de ads', l.vinoDeAds ? 'Sí' : 'No')}
          {dato('Agendó', l.agendoAt && new Date(l.agendoAt).toLocaleDateString('es-AR'))}
          {dato('Días p/ agendar', l.diasParaAgendar != null && `${l.diasParaAgendar} ${l.diasParaAgendar === 1 ? 'día' : 'días'}`)}
          {dato('Setter', l.setter)}
          {dato('Factura hoy', l.facturaHoy)}
          {l.saldoUsd > 0 && dato('Debe', usd(l.saldoUsd))}
        </div>
      </div>
      {(l.fathomUrl || l.grabacion) && (
        <div className="lc-links">
          {l.fathomUrl && <a className="btn sm" href={l.fathomUrl} target="_blank" rel="noreferrer">Fathom ↗</a>}
          {l.grabacion && <a className="btn sm" href={l.grabacion} target="_blank" rel="noreferrer">Link de la call ↗</a>}
        </div>
      )}
      {l.estado !== 'descartada' && (
        <FormResultado
          key={l.id}
          llamada={l}
          programas={datos.programas}
          estados={datos.estados}
          equipo={datos.equipo}
          mes={mes}
          onGuardado={onActualizado}
          onCerrar={() => {}}
        />
      )}
      <button type="button" className="btn sm ghost" disabled={f.guardando}
        onClick={() => f.borrar(l.estado === 'descartada')}>
        {l.estado === 'descartada' ? 'Recuperar la llamada' : 'Borrar la llamada'}
      </button>
      {f.error && <span className="ronda-evento error">{f.error}</span>}
    </aside>
  );
}

/**
 * @param {{ datos: { llamadas: object[], programas: object[], estados: string[], equipo: string[] },
 *           mes: string, onActualizado: (nuevo?: object) => void }} props
 */
export default function ListaCloser({ datos, mes, onActualizado }) {
  const [tab, setTab] = useState('Todas');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);

  const conStatus = useMemo(
    () => datos.llamadas.map((l) => ({ l, etiqueta: statusDe(l, datos.estados).etiqueta })),
    [datos.llamadas, datos.estados],
  );
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

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return conStatus
      .filter((x) => (tab === 'Todas' ? x.etiqueta !== 'Descartada' : x.etiqueta === tab))
      .filter((x) => !t || [x.l.prospecto, x.l.email, x.l.instagram].some((c) => (c || '').toLowerCase().includes(t)))
      .map((x) => x.l);
  }, [conStatus, tab, q]);

  // La ficha arranca en la primera que falta cargar: es lo primero que el closer tiene que hacer.
  useEffect(() => {
    if (sel && datos.llamadas.some((l) => l.id === sel)) return;
    const primera = datos.llamadas.find((l) => l.estado === 'sin_reportar') ?? datos.llamadas[0];
    setSel(primera?.id ?? null);
  }, [datos.llamadas, sel]);

  const dias = useMemo(() => {
    const m = new Map();
    for (const l of visibles) {
      const k = dia(l.fechaAt);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(l);
    }
    return [...m.entries()];
  }, [visibles]);

  // En el celular la ficha cae debajo de toda la lista: al tocar una call se baja hasta ella.
  const abrir = (id) => {
    setSel(id);
    if (window.matchMedia('(max-width: 760px)').matches) {
      requestAnimationFrame(() => document.querySelector('.lc-ficha')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };
  const elegida = datos.llamadas.find((l) => l.id === sel);
  const cobrado = visibles.reduce((a, l) => a + (l.cashUsd || 0), 0);
  const debe = visibles.reduce((a, l) => a + (l.saldoUsd || 0), 0);

  return (
    <>
      <div className="pl-barra lc-barra">
        <div className="pl-tabs" role="group" aria-label="Status">
          {tabs.map(([t, n]) => (
            <button key={t} type="button" className={`pl-tab${tab === t ? ' activo' : ''}`} onClick={() => setTab(t)}>
              {t} <span className="num">{n}</span>
            </button>
          ))}
        </div>
        <input type="search" className="pl-buscar" placeholder="Buscar" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Buscar prospecto" />
      </div>

      <div className="lc-cuerpo">
        <section className="lc-lista card">
          <div className="lc-cab">
            <span>Hora</span><span>Prospecto</span><span>Status</span><span>Programa</span><span>Origen</span><span className="right">Pagó</span>
          </div>
          <div className="lc-scroll">
            {dias.map(([nombre, filas]) => (
              <div key={nombre}>
                <div className="lc-dia"><b>{nombre}</b><span className="dim">{filas.length} {filas.length === 1 ? 'call' : 'calls'}</span></div>
                {filas.map((l) => (
                  <Fila key={l.id} l={l} datos={datos} mes={mes} activa={l.id === sel}
                    onAbrir={() => abrir(l.id)} onActualizado={onActualizado} />
                ))}
              </div>
            ))}
            {!visibles.length && <div className="empty">No hay llamadas con estos filtros.</div>}
          </div>
          <div className="pl-pie">
            <span className="dim">{visibles.length} de {conStatus.length} calls</span>
            <span className="dim">Cobrado <b className="num pl-cobrado">{usd(cobrado)}</b> · Debe <b className="num pl-debe">{usd(debe)}</b></span>
          </div>
        </section>
        {elegida && <Ficha l={elegida} datos={datos} mes={mes} onActualizado={onActualizado} />}
      </div>
    </>
  );
}
