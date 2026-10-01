import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import DetalleMetrica from '../components/ventas/DetalleMetrica.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import {
  analizarLlamada, getReporteClosing, guardarReporteClosing,
} from '../data/api.js';
import { useResource } from '../lib/hooks.js';
import { useMes } from '../lib/MesContext.jsx';

/**
 * El reporte mensual de closing.
 *
 * Tres bloques fijos: las métricas del mes, el laboratorio —avatares y objeciones que la
 * IA saca de las transcripciones de Fathom— y las conclusiones, que escribe una persona.
 *
 * Las métricas no se recalculan acá: son las mismas que muestra la pantalla del closer,
 * para que el reporte y el sistema no puedan decir números distintos del mismo mes. Las
 * llamadas descartadas no entran en ningún número.
 */

const usd = (n) => `US$ ${Math.round(n || 0).toLocaleString('es-AR')}`;
const pct = (n) => (n == null ? '—' : `${n}%`);
const corta = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—');

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const etiquetaMes = (p) => {
  const [y, m] = (p || '').split('-');
  return MESES[Number(m) - 1] ? `${MESES[Number(m) - 1]} ${y}` : p;
};

/** Un color por estado, estable entre meses para que la barra se lea igual siempre. */
const COLOR = {
  Cerrado: '#15803d', Seña: '#4ade80', Seguimiento: '#78716c',
  'No show': '#b91c1c', Cancelada: '#dc8a86', 'No contesta': '#a8a29e',
  Descalificado: '#b45309', 'No tiene la plata': '#d97706', 'Lo voy a pensar': '#1d4ed8',
  'Re-agenda': '#60a5fa', Agendado: '#e9e4db', 'Sin cargar': '#d8cfc1',
};
const color = (e) => COLOR[e] ?? '#a8a29e';

/** Una llamada del paso 2: se le pega la transcripción y la IA saca avatar y objeción. */
function Analizar({ llamada, onListo }) {
  const [texto, setTexto] = useState('');
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState(null);
  const a = llamada.analisis;

  async function mandar() {
    setYendo(true); setError(null);
    try {
      const r = await analizarLlamada({
        eventoId: llamada.eventoId,
        prospecto: llamada.prospecto,
        transcripcion: texto,
        contexto: `Prospecto: ${llamada.prospecto}\nFecha: ${llamada.fechaAt?.slice(0, 10)}\n`
          + `Resultado cargado: ${llamada.resultado || 'sin cargar'}`,
      });
      onListo(r);
      setTexto('');
    } catch (e) {
      setError(e.message);
    } finally {
      setYendo(false);
    }
  }

  return (
    <div className={`rc-llamada${a ? ' listo' : ''}`}>
      <div className="rc-llamada-top">
        <b>{llamada.prospecto}</b>
        <span className="dim">{corta(llamada.fechaAt)}</span>
        <span className="dim">{llamada.resultado || 'sin resultado'}</span>
        {a ? <span className="rc-ok">analizada</span> : null}
      </div>

      {a ? (
        <div className="rc-analisis">
          {a.avatar ? <p><span className="rc-et">Avatar</span> <b>{a.avatar}</b>
            {a.avatarMotivo ? <span className="dim"> — {a.avatarMotivo}</span> : null}</p> : null}
          {a.objecion ? <p><span className="rc-et">Objeción</span> <b>{a.objecion}</b>
            {a.momento ? <span className="dim"> · en el {a.momento}</span> : null}
            {a.objecionCita ? <span className="dim"> — «{a.objecionCita}»</span> : null}</p> : null}
          {a.seEnfrio ? <p><span className="rc-et">Se enfrió</span> <span className="dim">{a.seEnfrio}</span></p> : null}
          {a.fraseDelCloser ? <p><span className="rc-et">Nick dijo</span> <span className="dim">«{a.fraseDelCloser}»</span></p> : null}
          {!a.avatar && !a.objecion ? <p className="dim">La IA no encontró avatar ni objeción en esta llamada.</p> : null}
        </div>
      ) : (
        <>
          <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder={`Pegá acá la transcripción de Fathom de la llamada con ${llamada.prospecto.split(' ')[0]}…`}
            aria-label="Transcripción" />
          {error ? <div className="ronda-evento error">{error}</div> : null}
          <div className="rc-llamada-pie">
            {llamada.grabacion
              ? <a href={llamada.grabacion} target="_blank" rel="noreferrer" className="dim">abrir en Fathom →</a>
              : <span className="dim">esta llamada no tiene grabación cargada</span>}
            <button type="button" className="btn sm" onClick={mandar}
              disabled={yendo || texto.trim().length < 200}>
              {yendo ? 'Analizando…' : 'Analizar con IA'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ReporteClosing() {
  const { mes: periodo } = useMes();
  const [recarga, setRecarga] = useState(0);
  const { data, error, loading } = useResource(
    () => getReporteClosing(`${periodo}${recarga ? '?refrescar=true' : ''}`), [periodo, recarga]);

  const [paso, setPaso] = useState(1);
  const [detalle, setDetalle] = useState(null);
  const [conclusiones, setConclusiones] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const cargado = useRef(null);

  useEffect(() => {
    if (!data || data.periodo !== periodo || cargado.current === data.periodo) return;
    const prev = data.guardado?.datos ?? {};
    setConclusiones(prev.conclusiones ?? []);
    setPaso(data.guardado ? 3 : 1);
    cargado.current = data.periodo;
  }, [data, periodo]);

  const m = data?.metricas ?? {};
  const lab = data?.laboratorio ?? {};
  const llamadas = data?.llamadas ?? [];
  const sinAnalizar = useMemo(
    () => llamadas.filter((l) => !l.analisis && l.eventoId), [llamadas]);

  // Cada número se puede abrir y ver de qué llamadas sale. Los conjuntos son los mismos
  // que usa el cálculo: si una llamada no está acá, tampoco contó.
  // El resultado se compara normalizado: en la base conviven 'Cerrado' y 'cerrado',
  // y comparar la forma exacta dejaba los cuatro números de plata en cero.
  const res = (l) => (l.resultado || '').trim().toLowerCase();
  const esCierre = (l) => res(l) === 'cerrado';
  const esSena = (l) => ['seña', 'sena'].includes(res(l));
  const esVenta = (l) => esCierre(l) || esSena(l);
  const shows = llamadas.filter((l) => l.estado === 'show' || l.estado === 'cierre');
  const caidas = llamadas.filter((l) => l.estado === 'no_show');
  const ventas = llamadas.filter(esVenta);
  const cierres = llamadas.filter(esCierre);
  const dinero = (l) => usd(l.cashUsd);
  const ver = (titulo, explicacion, lista, columna, encabezado) => () =>
    setDetalle({ titulo, explicacion, llamadas: lista, columna, encabezado });

  /** Las llamadas que cayeron en un estado. Mismo criterio que el conteo de la barra. */
  const deEstado = (estado) => llamadas.filter((l) => {
    const r = (l.resultado || '').trim();
    return estado === 'Sin cargar' ? !r : r.toLowerCase() === estado.toLowerCase();
  });
  const verEstado = (estado) => ver(
    estado,
    `Las llamadas del mes que terminaron en ${estado.toLowerCase()}.`,
    deEstado(estado),
    (l) => (esVenta(l) ? dinero(l) : (l.setter ? `setteó ${l.setter}` : (l.origen || '—'))),
    'Detalle');

  async function guardar(cerrar = false) {
    setGuardando(true);
    try {
      await guardarReporteClosing(periodo, {
        metricas: m, laboratorio: lab, conclusiones, generadoAt: new Date().toISOString(),
      }, { closer: data?.closer, cerrar });
      setRecarga((n) => n + 1);
      setAviso(cerrar ? 'Reporte cerrado.' : 'Guardado.');
      setTimeout(() => setAviso(null), 2500);
    } catch (e) {
      setAviso(e.message);
    } finally {
      setGuardando(false);
    }
  }

  if (loading && !data) return <div className="page"><SkeletonBlock /></div>;
  if (error && !data) return <div className="page"><ErrorState error={error} onRetry={() => setRecarga((n) => n + 1)} /></div>;

  return (
    <div className="page rp-page">
      <PageHeader
        eyebrow="Dirección"
        title="Reporte de closing"
        desc={`Cómo le fue a ${data?.closer || 'el closer'} en el mes. Sale siempre con el mismo formato.`}
        actions={paso === 3
          ? <button type="button" className="btn" onClick={() => window.print()}>Descargar PDF</button>
          : null}
      />

      <div className="rp-pasos">
        {['Las métricas', 'Las transcripciones', 'El reporte'].map((t, i) => (
          <button key={t} type="button" className={`rp-paso${paso === i + 1 ? ' activo' : ''}`}
            onClick={() => setPaso(i + 1)}>
            <span className="rp-paso-n">{i + 1}</span>{t}
          </button>
        ))}
      </div>

      {data?.guardado ? (
        <div className="rp-estado-doc">
          {data.guardado.estado === 'cerrado' ? 'Reporte cerrado' : 'Borrador guardado'}
          {data.guardado.creadoPor ? ` · lo armó ${data.guardado.creadoPor}` : ''}
          <span> — se puede seguir editando.</span>
        </div>
      ) : null}
      {aviso ? <div className="ronda-evento ok">{aviso}</div> : null}

      {paso === 1 ? (
        <>
          <Card title="El mes en números"
            sub={`${m.llamadas ?? 0} llamadas · las descartadas no entran en ningún número`}
            foot="Son los mismos números que muestra la pantalla del closer: el reporte no los recalcula.">
            <div className="rc-kpis">
              <Kpi l="Llamadas" v={m.llamadas} n={`${m.sinReportar ?? 0} sin resultado cargado`}
                onVer={ver('Llamadas del mes', 'Todas las del mes menos las descartadas, que no entran en ningún número.', llamadas, (l) => l.resultado || 'sin cargar', 'Resultado')} />
              <Kpi l="Show rate" v={pct(m.showRate)} n={`${m.shows ?? 0} shows`} tono="ok"
                onVer={ver('Show rate', 'Las que se presentaron. El denominador son estas más las que no vinieron.', shows, (l) => l.resultado || '', 'Resultado')} />
              <Kpi l="No show" v={pct(m.noShowRate)} n={`${m.noShows ?? 0} caídas`} tono="mal"
                onVer={ver('No show', 'Las que no se presentaron, no contestaron o se cancelaron.', caidas, (l) => l.resultado || '', 'Resultado')} />
              <Kpi l="Close rate" v={pct(m.closeRate)} n={`${m.cierres ?? 0} sobre ${m.shows ?? 0} shows`}
                onVer={ver('Close rate', 'Los cierres sobre las que se presentaron. Las señas no cuentan acá: la venta todavía no está hecha.', shows, (l) => (esCierre(l) ? dinero(l) : '—'), 'Cash')} />
              <Kpi l="Con las señas" v={pct(m.closeRateConSenas)} n={`si entran las ${m.senas ?? 0} señas`}
                onVer={ver('Close rate con las señas', 'A cuánto llegaría el close rate si las señas pendientes terminan de cerrar.', ventas, (l) => (esSena(l) ? `seña · ${dinero(l)}` : `cerrado · ${dinero(l)}`), 'Estado')} />
              <Kpi l="Cash collected" v={usd(m.cashUsd)} n={`${usd(m.senasCashUsd)} son de señas`} tono="ok"
                onVer={ver('Cash collected', 'Lo que efectivamente pagó cada uno, cierres y señas.', ventas, dinero, 'Cash')} />
              <Kpi l="AOV" v={usd(m.aovUsd)} n={`${usd(m.facturacionUsd)} facturados`}
                onVer={ver('AOV', 'La facturación dividida por los cierres. Las señas suman al cash pero no son un cierre, así que no entran al divisor.', cierres, (l) => `${l.programa || 'sin programa'} · ${usd(l.facturacionUsd)}`, 'Programa')} />
              <Kpi l="PIF" v={`${m.pif ?? 0} de ${m.cierres ?? 0}`} n={`${pct(m.pifRate)} de los cierres sin saldo`}
                onVer={ver('PIF', 'Los cierres que quedaron sin saldo. Las señas no entran: por definición deben plata.', cierres, (l) => (Number(l.saldoUsd) ? `debe ${usd(l.saldoUsd)}` : 'pagado'), 'Saldo')} />
            </div>
          </Card>

          <Card title="Cómo salieron" sub="Los estados que carga el equipo. Descartada y Agendado no cuentan.">
            <div className="rc-barra">
              {(m.porEstado ?? []).filter((e) => e.estado !== 'Agendado').map((e) => (
                <button key={e.estado} type="button" style={{ width: `${e.pct}%`, background: color(e.estado) }}
                  title={`${e.estado}: ${e.n} · tocá para ver cuáles`}
                  aria-label={`${e.estado}: ${e.n}`} onClick={verEstado(e.estado)} />
              ))}
            </div>
            <div className="rc-leyenda">
              {(m.porEstado ?? []).filter((e) => e.estado !== 'Agendado').map((e) => (
                <button key={e.estado} type="button" onClick={verEstado(e.estado)}>
                  <i style={{ background: color(e.estado) }} />{e.estado}
                  <b>{e.n}</b><span className="dim">{e.pct}%</span>
                </button>
              ))}
            </div>
          </Card>

          <div className="rp-pie">
            <span className="dim">
              {lab.analizadas ?? 0} de {lab.total ?? 0} llamadas tienen transcripción analizada
            </span>
            <button type="button" className="btn" onClick={() => { guardar(); setPaso(2); }}>
              Seguir con las transcripciones →
            </button>
          </div>
        </>
      ) : null}

      {paso === 2 ? (
        <Card title="Las transcripciones"
          sub={`${lab.analizadas ?? 0} de ${lab.total ?? 0} analizadas · ${lab.cobertura ?? 0}% del mes`}
          foot="De cada transcripción la IA saca el avatar, la objeción y en qué momento apareció. Lo que saca queda guardado en la llamada.">
          {sinAnalizar.length === 0 && (lab.analizadas ?? 0) === 0 ? (
            <p className="dim" style={{ margin: 0 }}>No hay llamadas en este mes.</p>
          ) : null}
          <div className="rc-lista">
            {llamadas.filter((l) => l.eventoId).map((l) => (
              <Analizar key={l.eventoId} llamada={l} onListo={() => setRecarga((n) => n + 1)} />
            ))}
          </div>
        </Card>
      ) : null}

      {detalle ? <DetalleMetrica {...detalle} onCerrar={() => setDetalle(null)} /> : null}

      {paso === 3 ? (
        <Documento periodo={periodo} closer={data?.closer} m={m} lab={lab}
          conclusiones={conclusiones} setConclusiones={setConclusiones}
          onGuardar={() => guardar()} onCerrar={() => guardar(true)} guardando={guardando} />
      ) : null}
    </div>
  );
}

function Kpi({ l, v, n, tono, onVer }) {
  return (
    <div className={`rc-kpi${onVer ? ' clickable' : ''}`} onClick={onVer}
      role={onVer ? 'button' : undefined} tabIndex={onVer ? 0 : undefined}
      onKeyDown={onVer ? (e) => (e.key === 'Enter' || e.key === ' ') && onVer() : undefined}>
      <div className="l">{l}</div>
      <div className={`v${tono ? ` ${tono}` : ''}`}>{v ?? '—'}</div>
      <div className="n">{n}</div>
      {onVer ? <div className="rc-ver">ver llamadas</div> : null}
    </div>
  );
}

/** El reporte tal como sale impreso. Lo mismo en pantalla y en el PDF. */
function Documento({ periodo, closer, m, lab, conclusiones, setConclusiones,
                     onGuardar, onCerrar, guardando }) {
  const [editando, setEditando] = useState(false);

  const cambiar = (i, campo, valor) =>
    setConclusiones(conclusiones.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)));

  return (
    <>
      <div className="rp-doc rc-doc">
        <header className="doc-head">
          <img src="/atv-logo.png" alt="ATV" width={38} height={38} />
          <div>
            <div className="eyebrow">ATV · Closing</div>
            <h1>{closer || 'Closer'}</h1>
          </div>
          <div className="doc-per">{etiquetaMes(periodo)}<span>{m.llamadas ?? 0} llamadas</span></div>
        </header>

        <section className="doc-bloque">
          <h2>El mes en números<span>{m.llamadas ?? 0} llamadas · sin las descartadas</span></h2>
          <div className="doc-resumen">
            <div><div className="l">Show rate</div><div className="v ok">{pct(m.showRate)}</div></div>
            <div><div className="l">Close rate</div><div className="v">{pct(m.closeRate)}</div></div>
            <div><div className="l">Cash</div><div className="v ok">{usd(m.cashUsd)}</div></div>
            <div><div className="l">AOV</div><div className="v">{usd(m.aovUsd)}</div></div>
            <div><div className="l">PIF</div><div className="v">{m.pif ?? 0}/{m.cierres ?? 0}</div></div>
          </div>
          <div className="rc-barra">
            {(m.porEstado ?? []).filter((e) => e.estado !== 'Agendado').map((e) => (
              <span key={e.estado} style={{ width: `${e.pct}%`, background: color(e.estado) }} />
            ))}
          </div>
          <div className="rc-leyenda">
            {(m.porEstado ?? []).filter((e) => e.estado !== 'Agendado').map((e) => (
              <div key={e.estado}>
                <i style={{ background: color(e.estado) }} />{e.estado}
                <b>{e.n}</b><span className="dim">{e.pct}%</span>
              </div>
            ))}
          </div>
        </section>

        <section className="doc-bloque">
          <h2>Laboratorio de closing
            <span>{lab.analizadas ?? 0} de {lab.total ?? 0} llamadas · {lab.cobertura ?? 0}%</span></h2>

          {(lab.cobertura ?? 0) < 60 ? (
            <p className="rc-aviso">
              Con {lab.analizadas ?? 0} llamadas analizadas de {lab.total ?? 0}, lo que sigue describe
              esa muestra y no el mes entero.
            </p>
          ) : null}

          <h3>Objeciones</h3>
          <table>
            <thead><tr><th>Objeción</th><th>Veces</th><th>Cerró</th><th>No cerró</th><th className="izq">Dónde apareció</th></tr></thead>
            <tbody>
              {(lab.objeciones ?? []).map((o) => (
                <tr key={o.valor}>
                  <td>{o.valor}</td><td>{o.n}</td>
                  <td className={o.cerraron ? 'ok' : 'c'}>{o.cerraron}</td>
                  <td className={o.noCerraron ? 'mal' : 'c'}>{o.noCerraron}</td>
                  <td className="izq c">{Object.entries(o.momentos ?? {})
                    .map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</td>
                </tr>
              ))}
              {(lab.objeciones ?? []).length ? null
                : <tr><td colSpan={5} className="c">Ninguna transcripción analizada todavía.</td></tr>}
            </tbody>
          </table>

          <h3>Avatares</h3>
          <table>
            <thead><tr><th>Avatar</th><th>Llamadas</th><th>Cerró</th><th>Close rate</th><th className="izq">Ejemplo</th></tr></thead>
            <tbody>
              {(lab.avatares ?? []).map((a) => (
                <tr key={a.valor}>
                  <td>{a.valor}</td><td>{a.n}</td>
                  <td className={a.cerraron ? 'ok' : 'c'}>{a.cerraron}</td>
                  <td className={a.closeRate ? '' : 'mal'}>{a.closeRate}%</td>
                  <td className="izq c">{a.citas?.[0]?.cita ?? '—'}</td>
                </tr>
              ))}
              {(lab.avatares ?? []).length ? null
                : <tr><td colSpan={5} className="c">Ninguna transcripción analizada todavía.</td></tr>}
            </tbody>
          </table>

          {(lab.enfriadas ?? []).length ? (
            <>
              <h3>Dónde se enfrían</h3>
              <ul className="rc-citas">
                {lab.enfriadas.map((e, i) => (
                  <li key={i}><b>{e.prospecto}</b> <span className={e.cerro ? 'rc-si' : 'rc-no'}>
                    {e.cerro ? 'cerró' : 'no cerró'}</span> — {e.cuando}</li>
                ))}
              </ul>
            </>
          ) : null}

          {(lab.frases ?? []).length ? (
            <>
              <h3>Lo que dijo el closer</h3>
              <ul className="rc-citas">
                {lab.frases.map((f, i) => (
                  <li key={i}><b>{f.prospecto}</b> <span className={f.cerro ? 'rc-si' : 'rc-no'}>
                    {f.cerro ? 'cerró' : 'no cerró'}</span> — «{f.frase}»</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        <section className="doc-bloque">
          <h2>Conclusiones<span>para ejecutar el mes que viene</span></h2>
          {conclusiones.map((c, i) => (
            <div key={i} className="rc-concl">
              {editando ? (
                <>
                  <input value={c.titulo ?? ''} placeholder="Qué encontré"
                    onChange={(e) => cambiar(i, 'titulo', e.target.value)} />
                  <textarea rows={2} value={c.detalle ?? ''} placeholder="Qué significa"
                    onChange={(e) => cambiar(i, 'detalle', e.target.value)} />
                  <input value={c.fix ?? ''} placeholder="Qué hacer"
                    onChange={(e) => cambiar(i, 'fix', e.target.value)} />
                  <button type="button" className="rp-sacar"
                    onClick={() => setConclusiones(conclusiones.filter((_, j) => j !== i))}>×</button>
                </>
              ) : (
                <>
                  <h4>{c.titulo}</h4>
                  {c.detalle ? <p>{c.detalle}</p> : null}
                  {c.fix ? <p className="fix"><b>Fix:</b> {c.fix}</p> : null}
                </>
              )}
            </div>
          ))}
          {editando ? (
            <button type="button" className="btn sm ghost"
              onClick={() => setConclusiones([...conclusiones, { titulo: '', detalle: '', fix: '' }])}>
              + Agregar conclusión
            </button>
          ) : null}
          {!conclusiones.length && !editando
            ? <p className="dim" style={{ margin: 0 }}>Todavía no hay conclusiones. Tocá «Editar» para escribirlas.</p>
            : null}
        </section>
      </div>

      <div className="rp-pie no-print">
        <span className="dim">Dos o tres conclusiones alcanzan. Cerrar el reporte lo marca como el que se entregó.</span>
        <div className="rp-acciones">
          <button type="button" className="btn sm ghost"
            onClick={() => { if (editando) onGuardar(); setEditando(!editando); }}>
            {editando ? 'Listo' : 'Editar las conclusiones'}
          </button>
          <button type="button" className="btn" onClick={onCerrar} disabled={guardando || editando}>
            {guardando ? 'Guardando…' : 'Cerrar el reporte'}
          </button>
        </div>
      </div>
    </>
  );
}
