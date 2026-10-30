import { useCallback, useMemo, useRef, useState } from 'react';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import AjustesCargados from '../../components/fulfillment/linea-pagos/AjustesCargados.jsx';
import FichaCliente from '../../components/fulfillment/linea-pagos/FichaCliente.jsx';
import LineaTiempo from '../../components/fulfillment/linea-pagos/LineaTiempo.jsx';
import Resumen from '../../components/fulfillment/linea-pagos/Resumen.jsx';
import { useDocsLinea } from '../../components/fulfillment/linea-pagos/useDocsLinea.js';
import { getLineaPagos } from '../../data/api.js';
import {
  CARRILES, D, GRUPOS, MARCAS, PLANES, PNAME, aplicarAjustes, filasAjustes, fmtD, iso, marcaD, marcaE, prepararLinea,
} from '../../lib/lineaPagos.js';
import { useResource } from '../../lib/hooks.js';

/**
 * Línea de pagos: la vigencia y los pagos de cada cliente en el tiempo, agrupados como los
 * mira Mauri (A en Discord, B vencidos, C salieron, señas y sin grupo) con las marcas D y
 * E. Es su maqueta hecha pantalla de Ops: misma lógica (src/lib/lineaPagos.js), otra
 * ropa. Las notas y los ajustes son del equipo, no de un navegador.
 */

/** Una fila de chips que prenden y apagan valores de un Set. */
function Filtro({ titulo, items, activos, onCambiar }) {
  return (
    <div className="lp-filtro" role="group" aria-label={titulo}>
      <span className="lab-k">{titulo}</span>
      {items.map((x) => {
        const on = activos.has(x.k);
        return (
          <button key={x.k} type="button" className={`chip${on ? ' active' : ''}`} aria-pressed={on} title={x.desc}
            onClick={() => {
              const s = new Set(activos);
              if (on) s.delete(x.k); else s.add(x.k);
              onCambiar(s);
            }}>
            {x.color && <i className="lp-punto" style={{ '--c': x.color }} />}
            {x.marca && <i className={`lp-muestra-marca ${x.marca}`} />}
            {x.label}
            {x.n != null && <span className="num lp-cuenta">{x.n}</span>}
          </button>
        );
      })}
    </div>
  );
}

const FILTROS_INICIALES = () => ({
  planes: new Set(PLANES),
  grupos: new Set(GRUPOS.map((g) => g.k)),
  marcas: new Set(['D', 'E']),
  carriles: new Set(CARRILES.map((c) => c.k)),
  // Rangos de fecha de inicio y de vencimiento del programa, en días. Vacíos = todos.
  inicio: { desde: null, hasta: null },
  vence: { desde: null, hasta: null },
});

/** Un rango de fechas: desde y hasta, cada uno opcional. */
function FiltroFecha({ titulo, rango, onCambiar }) {
  const campo = (lado) => (
    <input type="date" className="lp-fecha" aria-label={`${titulo} ${lado}`}
      value={rango[lado] == null ? '' : iso(rango[lado])}
      onChange={(e) => onCambiar({ ...rango, [lado]: e.target.value ? D(e.target.value) : null })} />
  );
  return (
    <div className="lp-filtro">
      <span className="lab-k">{titulo}</span>
      {campo('desde')}<span className="dim">a</span>{campo('hasta')}
      {(rango.desde != null || rango.hasta != null) && (
        <button type="button" className="chip" onClick={() => onCambiar({ desde: null, hasta: null })}>Todas</button>
      )}
    </div>
  );
}

export default function LineaPagos() {
  const { data, error, loading } = useResource(() => getLineaPagos(), []);
  const linea = useMemo(() => (data ? prepararLinea(data) : null), [data]);
  const { notas, ajustes, error: errorDocs, guardarNotas, guardarAjuste } = useDocsLinea();
  // Los ajustes se aplican sobre la ficha original y recalculan grupos y marcas.
  const clientes = useMemo(() => (linea ? aplicarAjustes(linea.clientes, ajustes, linea) : []), [linea, ajustes]);
  const conNotas = useMemo(() => new Set(Object.keys(notas).map(Number)), [notas]);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState('res');
  const [foco, setFoco] = useState(null);
  const panel = useRef(null);

  // Clic en la línea: abre la ficha sin mover la vista. Desde una lista: además lleva la
  // línea hasta el cliente.
  const elegirEnLinea = useCallback((id) => { setSel(id); setTab('cli'); }, []);
  const elegirDeLista = useCallback((id) => { setSel(id); setTab('cli'); setFoco({ id, t: Date.now() }); }, []);
  const cambiar = (k) => (s) => setFiltros((f) => ({ ...f, [k]: s }));

  const cuenta = (fn) => clientes.filter(fn).length;
  const filas = useMemo(() => filasAjustes(clientes, ajustes), [clientes, ajustes]);

  if (loading && !data) return <div className="page"><SkeletonBlock height={520} /></div>;
  if (error && !data) return <div className="page"><ErrorState error={error} /></div>;

  return (
    <div className="page lp">
      <div className="lp-barra">
        <Filtro titulo="Programa" activos={filtros.planes} onCambiar={cambiar('planes')}
          items={PLANES.map((p) => ({ k: p, label: PNAME[p], color: `var(--lp-${p})`, n: cuenta((c) => c.p === p) }))} />
        <Filtro titulo="Grupo" activos={filtros.grupos} onCambiar={cambiar('grupos')}
          items={GRUPOS.map((g) => ({ k: g.k, label: g.corto, desc: g.desc, color: g.color, n: cuenta((c) => c.g === g.k) }))} />
        <Filtro titulo="Marcas" activos={filtros.marcas} onCambiar={cambiar('marcas')}
          items={MARCAS.map((m) => ({ k: m.k, label: m.corto, desc: m.desc, marca: m.k, n: cuenta(m.k === 'D' ? marcaD : marcaE) }))} />
        <Filtro titulo="Carriles" activos={filtros.carriles} onCambiar={cambiar('carriles')}
          items={CARRILES.map((x) => ({ k: x.k, label: x.corto, desc: x.desc }))} />
        <div className="lp-fechas">
          <FiltroFecha titulo="Inicio" rango={filtros.inicio} onCambiar={cambiar('inicio')} />
          <FiltroFecha titulo="Vencimiento" rango={filtros.vence} onCambiar={cambiar('vence')} />
        </div>
        <span className="lp-meta num" title={`Ventana ${fmtD(linea.WIN0)} a ${fmtD(linea.HOY)}`}>
          Corte {fmtD(linea.CUT)} · {clientes.length} clientes · {linea.pagos} pagos
        </span>
      </div>

      <LineaTiempo linea={linea} clientes={clientes} filtros={filtros} sel={sel} conNotas={conNotas} notas={notas}
        foco={foco} onElegir={elegirEnLinea}
        irAFicha={() => { setTab('cli'); panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />

      <section className="lp-panel" ref={panel}>
        <Tabs value={tab} onChange={setTab} options={[
          { value: 'res', label: 'Resumen' },
          { value: 'cli', label: 'Cliente' },
          { value: 'aj', label: filas.length ? `Ajustes (${filas.length})` : 'Ajustes' },
        ]} />
        {tab === 'res' && <Resumen linea={linea} clientes={clientes} planes={filtros.planes} onElegir={elegirDeLista} />}
        {tab === 'cli' && (
          <FichaCliente linea={linea} clientes={clientes} filtros={filtros} sel={sel} notas={notas} ajustes={ajustes}
            error={errorDocs} conNotas={conNotas} onElegir={elegirDeLista} guardarNotas={guardarNotas} guardarAjuste={guardarAjuste} />
        )}
        {tab === 'aj' && <AjustesCargados filas={filas} onElegir={elegirDeLista} onQuitar={(id) => guardarAjuste(id, null)} />}
      </section>
    </div>
  );
}
