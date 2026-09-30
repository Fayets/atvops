import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import {
  anotarClienteReporte, buscarClientesReporte, getReporteProducto, guardarReporteProducto,
} from '../data/api.js';
import { useResource } from '../lib/hooks.js';
import { useMes } from '../lib/MesContext.jsx';

/**
 * El reporte mensual de upsell y recompras.
 *
 * Tres bloques fijos, siempre en el mismo orden. Los dos primeros los propone el
 * sistema desde las cuotas de ATV Clients y acá solo se confirma la oferta y los meses;
 * el tercero se carga a mano, cliente por cliente, porque ese estado no vive en ningún
 * lado. Lo que se escribe ahí va a la ficha del cliente en ATV Clients: si no volviera,
 * el reporte sería un documento muerto.
 *
 * El PDF sale por `window.print()` con las reglas de `@media print`, que es lo que
 * garantiza que el formato sea el mismo todos los meses sin mantener dos maquetas.
 */

const ESTADOS = [
  { id: 'recompro', label: 'Recompró', tono: 'ok' },
  { id: 'va_cerrar', label: 'Va a cerrar', tono: 'ok' },
  { id: 'definiendo', label: 'Definiendo', tono: 'warn' },
  { id: 'se_va', label: 'Se va', tono: 'alert' },
];

/** Los valores que ATV Clients guarda en `oportunidad`, escritos para leer. */
const OPORTUNIDAD = {
  recompra: 'Oportunidad de recompra',
  upsell_boost: 'Oportunidad de upsell a Boost',
  upsell_high: 'Oportunidad de upsell a High Level',
  consultar: 'Hay que consultarlo',
};

const usd = (n) => `US$ ${Math.round(n || 0).toLocaleString('es-AR')}`;
const corta = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '—');

const NOMBRE_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
function etiquetaMes(p) {
  const [y, m] = (p || '').split('-');
  return `${NOMBRE_MES[Number(m) - 1] ?? p} ${y}`;
}

/**
 * Buscar un cliente en ATV Clients y sumarlo al bloque.
 *
 * El sistema propone los que tienen cuota marcada, pero esa marca falta seguido: Kilian
 * recompró y nunca se le cargó la cuota. Sin esto el reporte solo podría decir lo que el
 * CRM ya sabe, y de lo que se trata es de cargar lo que falta.
 */
function BuscarCliente({ yaEstan, onAgregar }) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const pedido = useRef(0);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) { setResultados([]); return undefined; }
    // Se espera a que deje de tipear: una consulta por tecla contra la cartera entera
    // es una consulta de más por cada letra.
    const t = setTimeout(async () => {
      const mio = ++pedido.current;
      setBuscando(true);
      try {
        const r = await buscarClientesReporte(texto);
        if (mio === pedido.current) setResultados(r?.clientes ?? []);
      } catch {
        if (mio === pedido.current) setResultados([]);
      } finally {
        if (mio === pedido.current) setBuscando(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  function agregar(c) {
    onAgregar(c);
    setQ(''); setResultados([]); setAbierto(false);
  }

  return (
    <div className="rp-buscar">
      <input
        value={q} onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 160)}
        placeholder="Buscar un cliente en ATV Clients y agregarlo…"
        aria-label="Buscar cliente" />
      {abierto && q.trim().length >= 2 ? (
        <div className="rp-buscar-caja">
          {buscando ? <div className="rp-buscar-vacio">Buscando…</div> : null}
          {!buscando && !resultados.length ? (
            <div className="rp-buscar-vacio">Ningún cliente con ese nombre.</div>
          ) : null}
          {resultados.map((c) => {
            const puesto = yaEstan.includes(c.clienteId);
            return (
              <button key={c.clienteId} type="button" className="rp-buscar-fila"
                disabled={puesto} onMouseDown={(e) => e.preventDefault()}
                onClick={() => !puesto && agregar(c)}>
                <span className="rp-buscar-nom">{c.nombre}</span>
                <span className="dim">
                  {c.oferta || 'sin plan'}{c.meses ? ` · ${c.meses} meses` : ''}
                  {c.estado ? ` · ${c.estado}` : ''}
                </span>
                {puesto ? <span className="rp-buscar-ya">ya está</span> : <span className="rp-buscar-mas">+</span>}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Una fila de upsell o recompra: se confirma, se elige oferta y meses. */
function FilaOperacion({ f, ofertas, onCambio }) {
  return (
    <tr className={f.elegido ? '' : 'rp-fuera'}>
      <td>
        <label className="rp-check">
          <input type="checkbox" checked={f.elegido}
            onChange={(e) => onCambio({ ...f, elegido: e.target.checked })} />
          <span>{f.nombre}</span>
          {f.aMano ? <em className="rp-amano" title="Agregado a mano: no tiene cuota cargada">a mano</em> : null}
        </label>
      </td>
      <td>
        <select value={f.oferta} onChange={(e) => onCambio({ ...f, oferta: e.target.value })}
          aria-label={`Oferta de ${f.nombre}`}>
          <option value="">— oferta —</option>
          {ofertas.map((o) => <option key={o.nombre} value={o.nombre}>{o.nombre}</option>)}
          {f.oferta && !ofertas.some((o) => o.nombre === f.oferta)
            ? <option value={f.oferta}>{f.oferta}</option> : null}
        </select>
      </td>
      <td>
        <input type="number" min="1" max="36" className="rp-meses" value={f.meses ?? ''}
          onChange={(e) => onCambio({ ...f, meses: e.target.value ? Number(e.target.value) : null })}
          aria-label={`Meses de ${f.nombre}`} />
      </td>
      <td>
        <input className="rp-resp" value={f.responsable ?? ''} placeholder="—"
          onChange={(e) => onCambio({ ...f, responsable: e.target.value })}
          aria-label={`Responsable de ${f.nombre}`} />
      </td>
      <td className="num">{f.aMano ? (
        <input type="number" min="0" step="500" className="rp-monto" value={f.totalUsd || ''}
          onChange={(e) => onCambio({ ...f, totalUsd: Number(e.target.value) || 0 })}
          aria-label={`Total de ${f.nombre}`} />
      ) : usd(f.totalUsd)}</td>
      <td className="num">{f.aMano ? (
        <input type="number" min="0" step="500" className="rp-monto" value={f.cobradoUsd || ''}
          onChange={(e) => onCambio({ ...f, cobradoUsd: Number(e.target.value) || 0 })}
          aria-label={`Cobrado de ${f.nombre}`} />
      ) : f.cobradoUsd ? usd(f.cobradoUsd) : <span className="dim">—</span>}</td>
      <td className="num">{f.pendienteUsd ? usd(f.pendienteUsd) : <span className="dim">—</span>}</td>
      <td className="num">{f.vencidoUsd
        ? <b style={{ color: 'var(--alert)' }}>{usd(f.vencidoUsd)}</b>
        : <span className="dim">—</span>}</td>
      <td className="num dim">{corta(f.ultimoPago)}</td>
    </tr>
  );
}

/** El paso 2: un vencido por vez. */
function Vencido({ v, total, indice, onCambio, onSiguiente, onAnterior, guardando, error }) {
  const [texto, setTexto] = useState(v.nota || '');
  useEffect(() => setTexto(v.nota || ''), [v.clienteId]);

  return (
    <div className="rp-uno">
      <div className="rp-uno-top">
        <div>
          <div className="eyebrow">Vencido {indice + 1} de {total}</div>
          <h3>{v.nombre}</h3>
          <p className="dim">
            {v.oferta || 'sin plan'}
            {v.dias > 0 ? ` · venció el ${corta(v.vence)}, hace ${v.dias} días` : ` · vence el ${corta(v.vence)}`}
            {v.debeUsd ? ` · debe ${usd(v.debeUsd)}` : ''}
            {v.enDiscord ? ' · sigue en Discord' : ''}
          </p>
          {v.oportunidad || v.posibilidadUsd ? (
            <p className="rp-chance">
              {v.oportunidad ? <b>{OPORTUNIDAD[v.oportunidad] ?? v.oportunidad}</b> : null}
              {v.posibilidadUsd ? (
                <>{v.oportunidad ? ' · ' : null}<b>Posibilidad de upsell por {usd(v.posibilidadUsd)}</b>
                  {v.posibilidadDesde ? `, abierta desde el ${corta(v.posibilidadDesde)}` : null}</>
              ) : null}
              <span> — cargada en ATV Clients</span>
            </p>
          ) : null}
        </div>
        <input className="rp-resp grande" value={v.responsable ?? ''} placeholder="Responsable"
          onChange={(e) => onCambio({ ...v, responsable: e.target.value })}
          aria-label="Responsable" />
      </div>

      <div className="rp-estados">
        {ESTADOS.map((e) => (
          <button key={e.id} type="button"
            className={`rp-estado ${e.tono}${v.estado === e.id ? ' elegido' : ''}`}
            onClick={() => onCambio({ ...v, estado: e.id })}>
            {e.label}
          </button>
        ))}
      </div>

      <textarea className="rp-nota" rows={3} value={texto}
        placeholder={`Qué pasó con ${v.nombre.split(' ')[0]}…`}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => texto !== (v.nota || '') && onCambio({ ...v, nota: texto })}
        aria-label="Nota" />

      {error ? <div className="ronda-evento error">{error}</div> : null}

      <div className="rp-uno-pie">
        <button type="button" className="btn sm ghost" onClick={onAnterior} disabled={indice === 0}>
          ← Anterior
        </button>
        <span className="dim">La nota queda en la ficha del cliente, en ATV Clients.</span>
        <button type="button" className="btn sm" onClick={() => onSiguiente(texto)} disabled={guardando}>
          {guardando ? 'Guardando…' : indice + 1 === total ? 'Guardar y terminar' : 'Guardar y seguir →'}
        </button>
      </div>
    </div>
  );
}

export default function ReporteProducto() {
  // El período lo manda el selector del topbar, que es el del sistema entero. Tener
  // otro acá dejaba dos meses distintos en la misma pantalla.
  const { mes: periodo } = useMes();
  const { data, error, loading, refetch } = useResource(
    () => getReporteProducto(periodo), [periodo]);

  const [upsells, setUpsells] = useState([]);
  const [recompras, setRecompras] = useState([]);
  const [vencidos, setVencidos] = useState([]);
  const [paso, setPaso] = useState(1);
  const [cursor, setCursor] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [errorPaso, setErrorPaso] = useState(null);
  const [aviso, setAviso] = useState(null);
  const cargado = useRef(null);

  // Lo guardado le gana a lo que propone el sistema: si alguien ya cargó el mes, volver
  // a entrar tiene que mostrar lo que cargó y no pisárselo con los valores por defecto.
  // Las tablas arrancan vacías. Lo que el sistema encuentra en ATV Clients queda
  // disponible detrás de un botón, no puesto: el reporte lo arma la persona, y una
  // lista que aparece sola se firma sin mirar.
  useEffect(() => {
    if (!data || cargado.current === periodo) return;
    const prev = data.guardado?.datos ?? {};
    setUpsells(prev.upsells ?? []);
    setRecompras(prev.recompras ?? []);
    setVencidos(prev.vencidos ?? []);
    setPaso(1); setCursor(0);
    cargado.current = periodo;
  }, [data, periodo]);

  /** Suma los que el sistema encontró, sin repetir los que ya están. */
  function traer(lista, setLista, candidatos) {
    const estan = new Set(lista.map((x) => x.clienteId));
    setLista([...lista, ...(candidatos ?? []).filter((c) => !estan.has(c.clienteId))]);
  }

  const elegidos = useMemo(() => ({
    upsells: upsells.filter((u) => u.elegido),
    recompras: recompras.filter((r) => r.elegido),
  }), [upsells, recompras]);

  const totales = useMemo(() => {
    const todo = [...elegidos.upsells, ...elegidos.recompras];
    const sumar = (k) => todo.reduce((a, x) => a + (x[k] || 0), 0);
    return {
      cobrado: sumar('cobradoUsd'), pendiente: sumar('pendienteUsd'),
      vencido: sumar('vencidoUsd'), total: sumar('totalUsd'),
    };
  }, [elegidos]);

  /** Suma un cliente buscado en ATV Clients al bloque, con los montos en cero. */
  function agregarA(lista, setLista) {
    return (c) => setLista([...lista, {
      ...c, totalUsd: 0, cobradoUsd: 0, pendienteUsd: 0, vencidoUsd: 0,
      cuotas: 0, ultimoPago: null, elegido: true, aMano: true,
    }]);
  }

  const datos = () => ({
    upsells: elegidos.upsells, recompras: elegidos.recompras,
    vencidos, totales, generadoAt: new Date().toISOString(),
  });

  async function guardar(cerrar = false) {
    setGuardando(true); setErrorPaso(null);
    try {
      await guardarReporteProducto(periodo, datos(), cerrar);
      setAviso(cerrar ? 'Reporte cerrado.' : 'Guardado.');
      setTimeout(() => setAviso(null), 2500);
    } catch (e) {
      setErrorPaso(e.message);
    } finally {
      setGuardando(false);
    }
  }

  /** Guarda la nota del vencido en ATV Clients y pasa al siguiente. */
  async function siguienteVencido(texto) {
    const v = vencidos[cursor];
    setGuardando(true); setErrorPaso(null);
    const nota = (texto || '').trim();
    const actualizado = { ...v, nota };
    const lista = vencidos.map((x, i) => (i === cursor ? actualizado : x));
    setVencidos(lista);
    try {
      if (nota) {
        const etiqueta = ESTADOS.find((e) => e.id === v.estado)?.label;
        await anotarClienteReporte(v.clienteId,
          `[Reporte ${etiquetaMes(periodo)}]${etiqueta ? ` ${etiqueta} —` : ''} ${nota}`);
      }
      await guardarReporteProducto(periodo, {
        upsells: elegidos.upsells, recompras: elegidos.recompras,
        vencidos: lista, totales, generadoAt: new Date().toISOString(),
      });
      if (cursor + 1 < vencidos.length) setCursor(cursor + 1);
      else setPaso(3);
    } catch (e) {
      setErrorPaso(e.message);
    } finally {
      setGuardando(false);
    }
  }

  if (loading && !data) return <div className="page"><SkeletonBlock /></div>;
  if (error && !data) return <div className="page"><ErrorState error={error} onRetry={refetch} /></div>;

  const ofertas = data?.ofertas ?? [];

  return (
    <div className="page rp-page">
      <PageHeader
        eyebrow="Dirección"
        title="Reporte de producto"
        desc="Upsell, recompras y el estado de los vencidos. Sale siempre con el mismo formato."
        actions={(
          paso === 3 ? (
            <button type="button" className="btn" onClick={() => window.print()}>Descargar PDF</button>
          ) : null
        )}
      />

      <div className="rp-pasos">
        {['Upsell y recompras', 'Los vencidos', 'El reporte'].map((t, i) => (
          <button key={t} type="button" className={`rp-paso${paso === i + 1 ? ' activo' : ''}`}
            onClick={() => setPaso(i + 1)}>
            <span className="rp-paso-n">{i + 1}</span>{t}
          </button>
        ))}
      </div>

      {aviso ? <div className="ronda-evento ok">{aviso}</div> : null}
      {errorPaso && paso !== 2 ? <div className="ronda-evento error">{errorPaso}</div> : null}

      {paso === 1 ? (
        <>
          <Card title="Hicieron upsell"
            sub="Buscá el cliente, o traé los que tienen una cuota de upsell cargada en ATV Clients."
            foot="La oferta y los meses salen del plan cargado en el CRM: confirmalos o corregilos."
            actions={(
              <button type="button" className="btn sm ghost"
                onClick={() => traer(upsells, setUpsells, data?.upsells)}
                disabled={!(data?.upsells ?? []).length}>
                Traer los {(data?.upsells ?? []).length} con cuota de upsell
              </button>
            )}>
            <div className="tabla-scroll">
              <table className="rp-tabla">
                <thead><tr>
                  <th>Cliente</th><th>Oferta</th><th>Meses</th><th>Resp.</th>
                  <th>Total</th><th>Cobrado</th><th>Por cobrar</th><th>Vencido</th><th>Últ. pago</th>
                </tr></thead>
                <tbody>
                  {upsells.length ? upsells.map((f) => (
                    <FilaOperacion key={f.clienteId} f={f} ofertas={ofertas}
                      onCambio={(n) => setUpsells(upsells.map((x) => (x.clienteId === n.clienteId ? n : x)))} />
                  )) : <tr><td colSpan={9} className="dim">
                    Todavía no hay ninguno. Traelos con el botón de arriba o buscalos acá abajo.
                  </td></tr>}
                </tbody>
              </table>
            </div>
            <BuscarCliente yaEstan={upsells.map((u) => u.clienteId)}
              onAgregar={agregarA(upsells, setUpsells)} />
          </Card>

          <Card title="Hicieron recompra"
            sub="Buscá el cliente, o traé los que tienen una cuota de recompra cargada."
            actions={(
              <button type="button" className="btn sm ghost"
                onClick={() => traer(recompras, setRecompras, data?.recompras)}
                disabled={!(data?.recompras ?? []).length}>
                Traer los {(data?.recompras ?? []).length} con cuota de recompra
              </button>
            )}>
            <div className="tabla-scroll">
              <table className="rp-tabla">
                <thead><tr>
                  <th>Cliente</th><th>Oferta</th><th>Meses</th><th>Resp.</th>
                  <th>Total</th><th>Cobrado</th><th>Por cobrar</th><th>Vencido</th><th>Últ. pago</th>
                </tr></thead>
                <tbody>
                  {recompras.length ? recompras.map((f) => (
                    <FilaOperacion key={f.clienteId} f={f} ofertas={ofertas}
                      onCambio={(n) => setRecompras(recompras.map((x) => (x.clienteId === n.clienteId ? n : x)))} />
                  )) : <tr><td colSpan={9} className="dim">
                    Todavía no hay ninguno. Traelos con el botón de arriba o buscalos acá abajo.
                  </td></tr>}
                </tbody>
              </table>
            </div>
            <BuscarCliente yaEstan={recompras.map((r) => r.clienteId)}
              onAgregar={agregarA(recompras, setRecompras)} />
          </Card>

          <div className="rp-pie">
            <span className="dim">
              {elegidos.upsells.length} upsells y {elegidos.recompras.length} recompras ·
              {' '}{usd(totales.cobrado)} cobrados
            </span>
            <button type="button" className="btn" onClick={() => { guardar(); setPaso(2); }}>
              Seguir con los vencidos →
            </button>
          </div>
        </>
      ) : null}

      {paso === 2 ? (
        <Card title="Los vencidos, uno por uno"
          sub={vencidos.length
            ? `${vencidos.filter((v) => v.estado).length} de ${vencidos.length} definidos`
            : 'Traelos de ATV Clients, o buscá uno en particular.'}
          actions={(
            <div className="rp-acciones">
              <button type="button" className="btn sm ghost"
                onClick={() => traer(vencidos, setVencidos, data?.vencidos)}
                disabled={!(data?.vencidos ?? []).length}>
                Traer los {(data?.vencidos ?? []).length} vencidos
              </button>
              <button type="button" className="btn sm ghost"
                onClick={() => traer(vencidos, setVencidos, data?.oportunidades)}
                disabled={!(data?.oportunidades ?? []).length}
                title="Clientes con una chance abierta en ATV Clients que todavía no vencieron">
                + {(data?.oportunidades ?? []).length} oportunidades
              </button>
            </div>
          )}>
          {vencidos.length ? (
            <Vencido
              v={vencidos[Math.min(cursor, vencidos.length - 1)]}
              total={vencidos.length} indice={Math.min(cursor, vencidos.length - 1)}
              guardando={guardando} error={errorPaso}
              onCambio={(n) => setVencidos(vencidos.map((x, i) => (i === cursor ? n : x)))}
              onAnterior={() => setCursor(Math.max(0, cursor - 1))}
              onSiguiente={siguienteVencido}
            />
          ) : (
            <p className="dim" style={{ margin: 0 }}>
              Todavía no trajiste ninguno. El botón de arriba trae los que ya vencieron según
              su fecha en el CRM; el buscador sirve para sumar uno que no esté en esa lista.
            </p>
          )}
          <BuscarCliente yaEstan={vencidos.map((v) => v.clienteId)}
            onAgregar={(c) => setVencidos([...vencidos, { ...c, estado: '', nota: '', dias: 0, enDiscord: false }])} />
        </Card>
      ) : null}

      {paso === 3 ? (
        <Documento periodo={periodo} upsells={elegidos.upsells} recompras={elegidos.recompras}
          vencidos={vencidos} totales={totales}
          onCerrar={() => guardar(true)} onGuardar={() => guardar()} guardando={guardando}
          onSacar={(id, de) => {
            if (de === 'vencidos') setVencidos(vencidos.filter((x) => x.clienteId !== id));
            else if (de === 'upsells') setUpsells(upsells.filter((x) => x.clienteId !== id));
            else setRecompras(recompras.filter((x) => x.clienteId !== id));
          }}
          onEstado={(id, estado) => setVencidos(vencidos.map((x) => (x.clienteId === id ? { ...x, estado } : x)))}
          onNota={(id, nota) => setVencidos(vencidos.map((x) => (x.clienteId === id ? { ...x, nota } : x)))}
        />
      ) : null}
    </div>
  );
}

/** El reporte tal como sale impreso. Es lo mismo en pantalla y en el PDF. */
function Documento({ periodo, upsells, recompras, vencidos, totales,
                    onCerrar, onGuardar, onSacar, onEstado, onNota, guardando }) {
  // El documento se corrige acá mismo: llegar al final, ver que sobra un cliente y tener
  // que volver dos pasos para sacarlo es la clase de fricción que hace que el reporte se
  // entregue con el error adentro.
  const [editando, setEditando] = useState(false);

  const bloque = (titulo, filas, de) => (
    <section className="doc-bloque">
      <h2>{titulo}<span>{filas.length} clientes · {usd(filas.reduce((a, f) => a + (f.totalUsd || 0), 0))}</span></h2>
      <table>
        <thead><tr>
          <th>Cliente</th><th>Oferta</th><th>Meses</th><th>Total</th>
          <th>Cobrado</th><th>Por cobrar</th><th>Vencido</th>
        </tr></thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clienteId}>
              <td>{editando ? (
                <button type="button" className="rp-sacar" title={`Sacar a ${f.nombre}`}
                  onClick={() => onSacar(f.clienteId, de)}>×</button>
              ) : null}{f.nombre}</td>
              <td>{f.oferta || '—'}</td><td>{f.meses ?? '—'}</td>
              <td>{usd(f.totalUsd)}</td>
              <td>{f.cobradoUsd ? usd(f.cobradoUsd) : <span className="c">—</span>}</td>
              <td>{f.pendienteUsd ? usd(f.pendienteUsd) : <span className="c">—</span>}</td>
              <td className={f.vencidoUsd ? 'mal' : 'c'}>{f.vencidoUsd ? usd(f.vencidoUsd) : '—'}</td>
            </tr>
          ))}
          {filas.length ? null : <tr><td colSpan={7} className="c">Ninguno este mes.</td></tr>}
        </tbody>
        {filas.length ? (
          <tfoot><tr>
            <td>Total</td><td /><td />
            <td>{usd(filas.reduce((a, f) => a + (f.totalUsd || 0), 0))}</td>
            <td>{usd(filas.reduce((a, f) => a + (f.cobradoUsd || 0), 0))}</td>
            <td>{usd(filas.reduce((a, f) => a + (f.pendienteUsd || 0), 0))}</td>
            <td className="mal">{usd(filas.reduce((a, f) => a + (f.vencidoUsd || 0), 0))}</td>
          </tr></tfoot>
        ) : null}
      </table>
    </section>
  );

  return (
    <>
      <div className="rp-doc">
        <header className="doc-head">
          <img src="/atv-logo.png" alt="ATV" width={38} height={38} />
          <div>
            <div className="eyebrow">ATV · Producto</div>
            <h1>Upsell y recompras</h1>
          </div>
          <div className="doc-per">{etiquetaMes(periodo)}<span>cerrado el {corta(new Date().toISOString().slice(0, 10))}</span></div>
        </header>

        <div className="doc-resumen">
          <div><div className="l">Cobrado</div><div className="v ok">{usd(totales.cobrado)}</div></div>
          <div><div className="l">Por cobrar</div><div className="v">{usd(totales.pendiente)}</div></div>
          <div><div className="l">Vencido</div><div className="v mal">{usd(totales.vencido)}</div></div>
          <div><div className="l">Upsells</div><div className="v">{upsells.length}</div></div>
          <div><div className="l">Recompras</div><div className="v">{recompras.length}</div></div>
        </div>

        {bloque('Hicieron upsell', upsells, 'upsells')}
        {bloque('Hicieron recompra', recompras, 'recompras')}

        <section className="doc-bloque">
          <h2>El resto de los vencidos<span>{vencidos.length} clientes</span></h2>
          <table>
            <thead><tr><th>Cliente</th><th>Resp.</th><th>Venció</th><th>Debe</th><th className="izq">En qué está</th></tr></thead>
            <tbody>
              {vencidos.map((v) => {
                const e = ESTADOS.find((x) => x.id === v.estado);
                return (
                  <tr key={v.clienteId}>
                    <td>{editando ? (
                      <button type="button" className="rp-sacar" title={`Sacar a ${v.nombre}`}
                        onClick={() => onSacar(v.clienteId, 'vencidos')}>×</button>
                    ) : null}{v.nombre}</td>
                    <td className="c">{v.responsable || '—'}</td>
                    <td className="c">{corta(v.vence)}</td>
                    <td>{v.debeUsd ? usd(v.debeUsd) : <span className="c">—</span>}</td>
                    <td className="izq t">
                      {editando ? (
                        <div className="rp-edit-fila">
                          <select value={v.estado} onChange={(ev) => onEstado(v.clienteId, ev.target.value)}
                            aria-label={`Estado de ${v.nombre}`}>
                            <option value="">sin definir</option>
                            {ESTADOS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                          </select>
                          <input defaultValue={v.nota || ''} placeholder="nota"
                            onBlur={(ev) => ev.target.value !== (v.nota || '') && onNota(v.clienteId, ev.target.value)}
                            aria-label={`Nota de ${v.nombre}`} />
                        </div>
                      ) : (
                        <>{e ? <b>{e.label}</b> : <span className="c">sin definir</span>}
                          {v.nota ? <> — {v.nota}</> : null}</>
                      )}
                    </td>
                  </tr>
                );
              })}
              {vencidos.length ? null : <tr><td colSpan={5} className="c">Ninguno.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>

      <div className="rp-pie no-print">
        <span className="dim">
          {editando
            ? 'Sacá clientes con la ×, y corregí el estado y la nota de cada vencido. Los cambios en la nota no vuelven a ATV Clients desde acá.'
            : 'Descargá el PDF con el botón de arriba. Cerrar el reporte lo marca como el que se entregó.'}
        </span>
        <div className="rp-acciones">
          <button type="button" className="btn sm ghost"
            onClick={() => { if (editando) onGuardar(); setEditando(!editando); }}>
            {editando ? 'Listo' : 'Editar el informe'}
          </button>
          <button type="button" className="btn" onClick={onCerrar} disabled={guardando || editando}>
            {guardando ? 'Guardando…' : 'Cerrar el reporte'}
          </button>
        </div>
      </div>
    </>
  );
}
