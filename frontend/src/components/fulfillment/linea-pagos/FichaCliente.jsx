import { useEffect, useMemo, useRef, useState } from 'react';
import {
  D, ESTADO, FIN, FINN, GRUPO, PNAME, dt, fmtCorta, fmtD, iso, usd, visible,
} from '../../../lib/lineaPagos.js';

const TONO_GRUPO = { A: 'ok', B: 'warn', C: 'info', S: 'off', O: 'off' };
const nuevaId = () => Math.random().toString(36).slice(2, 9);
const cuando = (at) => new Date(at).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Buscador: los clientes visibles con el filtro, los más nuevos primero. */
function Buscador({ clientes, filtros, sel, conNotas, onElegir }) {
  const [q, setQ] = useState('');
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return clientes
      .filter((c) => visible(c, filtros) && c.n.toLowerCase().includes(t))
      .sort((a, b) => b.aD - a.aD)
      .slice(0, 80);
  }, [clientes, filtros, q]);
  return (
    <div className="lp-col">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" />
      <div className="lp-clientes">
        {lista.map((c) => (
          <button key={c.id} type="button" className={sel === c.id ? 'activo' : ''} onClick={() => onElegir(c.id)}>
            <span className="lp-clientes-nombre">
              <i className="lp-punto" style={{ '--c': `var(--lp-${c.p})` }} />
              <span>{c.n}</span>
              {conNotas.has(c.id) && <i className="lp-con-nota" title="Tiene notas" />}
            </span>
            <span className="dim num">{c.g} · {fmtCorta(c.aD)} {String(dt(c.aD).getUTCFullYear()).slice(2)}</span>
          </button>
        ))}
        {!lista.length && <p className="dim lp-vacio">Sin resultados</p>}
      </div>
    </div>
  );
}

/** Lo que dice la ficha: fechas, permanencia, pagos y avisos. */
function Datos({ c, a, linea }) {
  const { CUT, HOY } = linea;
  const dias = c.upD != null ? CUT - c.upD : null;
  const frenado = c.ad > 0 && dias != null && dias >= 30;
  const terminado = c.cat === 'completo' || c.cat === 'baja_anticipada_fecha';
  const avance = c.vD > c.aD ? Math.max(0, Math.min(1, (c.perm ?? 0) / (c.vD - c.aD))) : 0;
  const g = GRUPO[c.g];
  const ajustada = a.deuda != null && a.deuda !== '';
  return (
    <div className="lp-col">
      <div>
        <h3 className="lp-ficha-nombre">{c.n}</h3>
        <div className="lp-pills">
          <span className="pill plain"><i className="lp-punto" style={{ '--c': `var(--lp-${c.p})` }} />{PNAME[c.p]}</span>
          <span className="pill plain">{ESTADO[c.e] || c.e}</span>
          <span className={`pill ${TONO_GRUPO[c.g] || 'off'}`}>{g?.titulo || 'A revisar'}{c.ab ? ' + B' : ''}</span>
          {c.mE > 0 && <span className="pill alert">E{c.mE}</span>}
          {c.mD.length > 0 && <span className="pill alert">D</span>}
          {c.sn && <span className="pill off">Seña</span>}
          {c.adj && <span className="pill info">Ajustado</span>}
        </div>
      </div>

      <div className="lp-filas">
        <div className="lp-fila"><span>Ingreso</span><span className="num">{fmtD(c.aD)}</span></div>
        <div className="lp-fila"><span>{c.vD > HOY ? 'Vencimiento' : 'Vencimiento (cumplido)'}</span><span className="num">{fmtD(c.vD)}{a.v ? ' · ajustado' : ''}</span></div>
        <div className="lp-fila"><span>Inicio + {c.d} días</span><span className="num">{fmtD(c.vcD)}</span></div>
        {c.veD != null && <div className="lp-fila"><span>Según duración del programa</span><span className="num">{fmtD(c.veD)}</span></div>}
        {c.rcD != null && <div className="lp-fila"><span>Recompra</span><span className="num">{fmtD(c.rcD)}</span></div>}
        {c.bD != null && <div className="lp-fila"><span>Baja</span><span className="num">{fmtD(c.bD)}</span></div>}
        <div className="lp-fila">
          <span>Permanencia</span>
          <span className="num">{c.perm != null ? `${c.perm} d${terminado ? '' : ' hasta hoy'}` : 'sin fecha de baja'}</span>
        </div>
      </div>
      {c.perm != null && (
        <div className="lp-avance" title={`${Math.round(avance * 100)}% del programa recorrido`}>
          <div className="bar"><span style={{ width: `${Math.round(avance * 100)}%`, background: `var(--lp-${c.p})` }} /></div>
          <span className="dim num">{Math.round(avance * 100)}%</span>
        </div>
      )}

      <div>
        <span className="lab-k">Pagos</span>
        <div className="lp-filas">
          <div className="lp-fila"><span>Cobrado (con fecha)</span><span className="num">{usd(c.tp)}</span></div>
          <div className="lp-fila"><span>Deuda{ajustada ? ' (ajustada)' : ''}</span><span className="num">{usd(c.ad)}</span></div>
          <div className="lp-fila">
            <span>Pagos · primero · último</span>
            <span className="num">{c.pg.length}{c.fpD != null ? ` · ${fmtCorta(c.fpD)} · ${fmtCorta(c.upD)}` : ''}</span>
          </div>
          {dias != null && <div className="lp-fila"><span>Días desde el último pago</span><span className="num">{dias}</span></div>}
          {a.estado && <div className="lp-fila"><span>Estado financiero</span><span>{FINN[a.estado] || a.estado}</span></div>}
          {a.prox && <div className="lp-fila"><span>Próxima cuota</span><span className="num">{fmtD(D(a.prox))}{a.monto ? ` · ${usd(+a.monto)}` : ''}</span></div>}
        </div>
        {frenado && <p className="lp-warn">Deuda y {dias} días sin pagar</p>}
        {c.fpD == null && <p className="dim lp-vacio">Sin pagos registrados</p>}
      </div>

      {(c.flags.length > 0 || c.qm) && (
        <ul className="lp-avisos">
          {c.flags.map((f) => <li key={f} className="lp-warn">{f}</li>)}
          {c.qm && <li className="lp-warn">Vencimiento a confirmar (?)</li>}
        </ul>
      )}
    </div>
  );
}

/** Ajustes a mano: el dato real cambia grupos, barras, tasas y proyección. */
function Ajustes({ c, a, error, onGuardar }) {
  const inicial = () => ({
    v: a.v || iso(c.vD), estado: a.estado || '', deuda: a.deuda != null && a.deuda !== '' ? String(a.deuda) : '',
    prox: a.prox || '', monto: a.monto != null && a.monto !== '' ? String(a.monto) : '',
  });
  const [f, setF] = useState(inicial);
  const [aviso, setAviso] = useState('');
  // Si llega un ajuste guardado (el propio o el de otra persona), el formulario lo muestra.
  const [visto, setVisto] = useState(a.at);
  if (visto !== a.at) { setVisto(a.at); setF(inicial()); }
  const campo = (k) => ({ value: f[k], onChange: (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setAviso(''); } });

  const guardar = () => {
    const o = {};
    if (f.v && f.v !== iso(c.o.vD)) o.v = f.v;
    if (f.estado) o.estado = f.estado;
    if (f.deuda !== '') o.deuda = +f.deuda;
    if (f.prox) o.prox = f.prox;
    if (f.monto !== '') o.monto = +f.monto;
    if (Object.keys(o).length) o.at = new Date().toISOString();
    onGuardar(Object.keys(o).length ? o : null);
    setAviso('Guardado');
  };

  return (
    <div>
      <span className="lab-k">Ajustes</span>
      <p className="dim lp-ficha-orig num">Ficha: vence {fmtD(c.o.vD)} · deuda {usd(c.o.ad)}</p>
      <div className="lp-form">
        <label className="campo"><span>Vencimiento</span><input type="date" {...campo('v')} /></label>
        <label className="campo">
          <span>Estado financiero</span>
          <select {...campo('estado')}>{FIN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="campo"><span>Deuda (US$)</span><input type="number" min="0" step="50" placeholder={String(Math.round(c.o.ad))} {...campo('deuda')} /></label>
        <label className="campo"><span>Próxima cuota</span><input type="date" {...campo('prox')} /></label>
        <label className="campo"><span>Monto de la cuota (US$)</span><input type="number" min="0" step="50" {...campo('monto')} /></label>
      </div>
      <div className="lp-acciones">
        <button type="button" className="btn primary sm" onClick={guardar}>Guardar ajustes</button>
        <button type="button" className="btn sm" onClick={() => { onGuardar(null); setAviso('Restablecido'); }} disabled={!c.adj}>Restablecer a la ficha</button>
        {(error || aviso) && <span className={`lp-aviso${error ? ' mal' : ''}`}>{error || aviso}</span>}
      </div>
    </div>
  );
}

/** Una nota: se edita en el lugar; borrar pide confirmar con un segundo clic. */
function Nota({ n, onEditar, onBorrar }) {
  const [editando, setEditando] = useState(null);
  const [armada, setArmada] = useState(false);
  const reloj = useRef(0);
  useEffect(() => () => clearTimeout(reloj.current), []);
  const borrar = () => {
    if (armada) { onBorrar(n.id); return; }
    setArmada(true);
    clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setArmada(false), 3000);
  };
  return (
    <div className="lp-nota">
      <span className="dim num">{cuando(n.at)}{n.ed ? ' · editada' : ''}</span>
      {editando != null ? (
        <>
          <textarea value={editando} onChange={(e) => setEditando(e.target.value)} rows={3} autoFocus />
          <div className="lp-acciones">
            <button type="button" className="btn primary sm" onClick={() => { const t = editando.trim(); setEditando(null); if (t) onEditar(n.id, t); }}>Guardar</button>
            <button type="button" className="btn ghost sm" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </>
      ) : (
        <>
          <p>{n.t}</p>
          <div className="lp-acciones">
            <button type="button" className="btn ghost sm" onClick={() => setEditando(n.t)}>Editar</button>
            <button type="button" className={`btn sm${armada ? ' alerta' : ' ghost'}`} onClick={borrar}>{armada ? 'Confirmar' : 'Eliminar'}</button>
          </div>
        </>
      )}
    </div>
  );
}

function Notas({ items, error, onGuardar }) {
  const [texto, setTexto] = useState('');
  const agregar = () => {
    const t = texto.trim();
    if (!t) return;
    onGuardar([...items, { id: nuevaId(), t, at: new Date().toISOString() }]);
    setTexto('');
  };
  return (
    <div>
      <span className="lab-k">Notas</span>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Nueva nota" aria-label="Nueva nota" className="lp-nueva-nota" />
      <div className="lp-acciones">
        <button type="button" className="btn primary sm" onClick={agregar} disabled={!texto.trim()}>Agregar nota</button>
        {error && <span className="lp-aviso mal">{error}</span>}
      </div>
      <div className="lp-notas">
        {[...items].reverse().map((n) => (
          <Nota key={n.id} n={n}
            onEditar={(id, t) => onGuardar(items.map((x) => (x.id === id ? { ...x, t, ed: true } : x)))}
            onBorrar={(id) => onGuardar(items.filter((x) => x.id !== id))} />
        ))}
        {!items.length && <p className="dim lp-vacio">Sin notas</p>}
      </div>
    </div>
  );
}

/** Pestaña Cliente: buscador, ficha, ajustes y notas compartidas. */
export default function FichaCliente({ linea, clientes, filtros, sel, notas, ajustes, error, conNotas, onElegir, guardarNotas, guardarAjuste }) {
  const c = sel != null ? clientes.find((x) => x.id === sel) : null;
  const a = (c && ajustes[c.id]) || {};
  return (
    <div className="lp-ficha">
      <Buscador clientes={clientes} filtros={filtros} sel={sel} conNotas={conNotas} onElegir={onElegir} />
      {c ? (
        <>
          <Datos c={c} a={a} linea={linea} />
          <div className="lp-col">
            <Ajustes key={c.id} c={c} a={a} error={error.ajustes} onGuardar={(x) => guardarAjuste(c.id, x)} />
            <Notas items={notas[c.id] || []} error={error.notes} onGuardar={(items) => guardarNotas(c.id, items)} />
          </div>
        </>
      ) : (
        <p className="dim lp-vacio">Elegí un cliente</p>
      )}
    </div>
  );
}
