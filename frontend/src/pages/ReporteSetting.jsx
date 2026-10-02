import { useEffect, useRef, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import DetalleMetrica from '../components/ventas/DetalleMetrica.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { getReporteSetting, guardarReporteSetting } from '../data/api.js';
import { useResource } from '../lib/hooks.js';
import { useMes } from '../lib/MesContext.jsx';

/**
 * El reporte mensual de setting.
 *
 * Tres bloques fijos, mismo molde que el de closing: las métricas del mes, el
 * laboratorio —de dónde salieron los pitches y cuáles convirtieron— y las conclusiones,
 * que escribe una persona.
 *
 * Dos pasos y no tres: el laboratorio sale de lo que el setter ya carga en cada pitch,
 * así que no hay nada que pegar a mano antes de armarlo.
 */

const pct = (n) => (n == null ? '—' : `${n}%`);
const corta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const dias = (n) => (n == null ? '—' : `${n} ${n === 1 ? 'día' : 'días'}`);

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const etiquetaMes = (p) => {
  const [y, m] = (p || '').split('-');
  return MESES[Number(m) - 1] ? `${MESES[Number(m) - 1]} ${y}` : p;
};

/** Un color por desenlace, estable entre meses para que la barra se lea igual siempre. */
const COLOR = {
  booked: '#15803d', pendiente: '#d8cfc1', denied: '#b45309', ghosted: '#b91c1c',
  closed: '#15803d', deposit: '#4ade80', showed: '#78716c', scheduled: '#d8cfc1',
  no_show: '#b91c1c', cancelled: '#dc8a86',
};
const color = (e) => COLOR[e] ?? '#a8a29e';

export default function ReporteSetting() {
  const { mes: periodo } = useMes();
  const [recarga, setRecarga] = useState(0);
  const { data, error, loading } = useResource(
    () => getReporteSetting(`${periodo}${recarga ? '?refrescar=true' : ''}`), [periodo, recarga]);

  const [paso, setPaso] = useState(1);
  const [detalle, setDetalle] = useState(null);
  const [conclusiones, setConclusiones] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const cargado = useRef(null);

  useEffect(() => {
    if (!data || data.periodo !== periodo || cargado.current === data.periodo) return;
    setConclusiones(data.guardado?.datos?.conclusiones ?? []);
    setPaso(data.guardado ? 2 : 1);
    cargado.current = data.periodo;
  }, [data, periodo]);

  const m = data?.metricas ?? {};
  const lab = data?.laboratorio ?? {};
  const pitches = data?.pitches ?? [];

  // Cada número se puede abrir y ver de qué pitches sale. Los conjuntos son los mismos
  // que usa el cálculo: si un pitch no está acá, tampoco contó.
  const agendados = pitches.filter((p) => p.pitchEstado === 'booked');
  const cierres = pitches.filter((p) => p.llamadaEstado === 'closed');

  /** DetalleMetrica habla de llamadas: un pitch se le presenta con esa forma. */
  const comoLlamada = (p) => ({
    id: p.id, eventoId: `pitch-${p.id}`, prospecto: p.prospecto,
    fechaAt: p.pitchAt, estado: p.pitchEstado, resultado: p.llamadaEstado || '',
  });
  const ver = (titulo, explicacion, lista, columna, encabezado) => () =>
    setDetalle({ titulo, explicacion, llamadas: lista.map(comoLlamada), columna, encabezado });

  const conPitch = (f) => (l) => {
    const p = pitches.find((x) => `pitch-${x.id}` === l.eventoId);
    return p ? f(p) : '—';
  };
  const elCanal = conPitch((p) => `${p.canal || '—'} · ${p.origen || '—'}`);

  const verPitch = (e) => ver(
    e.estado,
    `Los pitches del mes que terminaron en «${e.estado.toLowerCase()}».`,
    pitches.filter((p) => (p.pitchEstado || 'pendiente') === e.clave), elCanal, 'Canal · origen');
  const verLlamada = (e) => ver(
    e.estado,
    `Las llamadas que salieron de un pitch del mes y terminaron en «${e.estado.toLowerCase()}».`,
    pitches.filter((p) => p.llamadaEstado === e.clave), elCanal, 'Canal · origen');

  async function guardar(cerrar = false) {
    setGuardando(true);
    try {
      await guardarReporteSetting(periodo, {
        metricas: m, laboratorio: lab, conclusiones, generadoAt: new Date().toISOString(),
      }, { setter: data?.setter, cerrar });
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
  if (error && !data) {
    return <div className="page"><ErrorState error={error} onRetry={() => setRecarga((n) => n + 1)} /></div>;
  }

  return (
    <div className="page rp-page">
      <PageHeader
        eyebrow="Dirección"
        title="Reporte de setting"
        actions={paso === 2
          ? <button type="button" className="btn" onClick={() => window.print()}>Descargar PDF</button>
          : null}
      />

      <div className="rp-pasos">
        {['Las métricas', 'El reporte'].map((t, i) => (
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
            foot="Son los mismos pitches que carga el setter en Mi setting: el reporte no los recalcula.">
            <div className="rc-kpis">
              <Kpi l="Pitches del mes" v={m.pitchesDelMes ?? 0} n="links de agenda mandados"
                onVer={ver('Pitches del mes', 'Todos los links de agenda que se mandaron en el mes. El corte es el día que se mandó el link, no el día de la llamada.', pitches, elCanal, 'Canal · origen')} />
              <Kpi l="Pitch → agenda" v={pct(m.pitchAAgenda)} tono="ok"
                n={`${m.agendasDelMes ?? 0} agendaron`}
                onVer={ver('Pitch → agenda', 'De los links mandados, cuántos terminaron con una llamada agendada.', agendados, elCanal, 'Canal · origen')} />
              <Kpi l="Agenda → cierre" v={pct(m.agendaACierre)}
                n={`${m.cerraronDelMes ?? 0} cerraron · ${m.senasDelMes ?? 0} con seña`}
                onVer={ver('Agenda → cierre', 'De las agendas que trajo el setting, cuántas terminaron en venta cerrada.', cierres, elCanal, 'Canal · origen')} />
              {/* La plata no sale acá: el mismo cierre lo anota Nick en su llamada y los
                  dos números no coinciden. Lo que el setting sí responde es cuántos de
                  los links mandados terminaron en venta. */}
              <Kpi l="Terminaron en venta" v={pct(m.pitchACierre)} tono="ok"
                n={`${m.cerraronDelMes ?? 0} de ${m.pitchesDelMes ?? 0} pitches`}
                onVer={ver('Terminaron en venta', 'De todos los links de agenda mandados en el mes, cuántos terminaron en una venta cerrada.', cierres, elCanal, 'Canal · origen')} />
            </div>
          </Card>

          <Card title="Cómo salió el pitch">
            <Barra filas={m.porPitch} onVer={verPitch} />
          </Card>

          <Card title="Qué pasó con la llamada"
            foot="Sobre las agendas que trajo el setting, no sobre todas las llamadas del mes.">
            <Barra filas={m.porLlamada} onVer={verLlamada} />
          </Card>

          <div className="rp-pie">
            <span className="dim">{m.pitchesDelMes ?? 0} pitches · {data?.setter || 'todo el equipo'}</span>
            <button type="button" className="btn" onClick={() => { guardar(); setPaso(2); }}>
              Armar el reporte →
            </button>
          </div>
        </>
      ) : null}

      {detalle ? <DetalleMetrica {...detalle} onCerrar={() => setDetalle(null)} /> : null}

      {paso === 2 ? (
        <Documento periodo={periodo} setter={data?.setter} m={m} lab={lab}
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
      {onVer ? <div className="rc-ver">ver pitches</div> : null}
    </div>
  );
}

/** La barra apilada con su leyenda. El orden lo fija el backend y no se reordena acá. */
function Barra({ filas = [], onVer }) {
  if (!filas.length) return <p className="dim" style={{ margin: 0 }}>Sin datos en este mes.</p>;
  return (
    <>
      <div className="rc-barra">
        {filas.map((e) => (
          <button key={e.clave} type="button" style={{ width: `${e.pct}%`, background: color(e.clave) }}
            title={`${e.estado}: ${e.n} · tocá para ver cuáles`}
            aria-label={`${e.estado}: ${e.n}`} onClick={onVer(e)} />
        ))}
      </div>
      <div className="rc-leyenda">
        {filas.map((e) => (
          <button key={e.clave} type="button" onClick={onVer(e)}>
            <i style={{ background: color(e.clave) }} />{e.estado}
            <b>{e.n}</b><span className="dim">{e.pct}%</span>
          </button>
        ))}
      </div>
    </>
  );
}

/** El reporte tal como sale impreso. Lo mismo en pantalla y en el PDF. */
function Documento({ periodo, setter, m, lab, conclusiones, setConclusiones,
                     onGuardar, onCerrar, guardando }) {
  const [editando, setEditando] = useState(false);
  const cambiar = (i, campo, valor) =>
    setConclusiones(conclusiones.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)));
  const v = lab.velocidad ?? {};

  return (
    <>
      <div className="rp-doc rc-doc">
        <header className="doc-head">
          <img src="/atv-logo.png" alt="ATV" width={38} height={38} />
          <div>
            <div className="eyebrow">ATV · Setting</div>
            <h1>{setter || 'Setting'}</h1>
          </div>
          <div className="doc-per">{etiquetaMes(periodo)}<span>{m.pitchesDelMes ?? 0} pitches</span></div>
        </header>

        <section className="doc-bloque">
          <h2>El mes en números<span>sobre los links de agenda mandados</span></h2>
          <div className="doc-resumen">
            <div><div className="l">Pitches</div><div className="v">{m.pitchesDelMes ?? 0}</div></div>
            <div><div className="l">Pitch → agenda</div><div className="v ok">{pct(m.pitchAAgenda)}</div></div>
            <div><div className="l">Agenda → cierre</div><div className="v">{pct(m.agendaACierre)}</div></div>
            <div><div className="l">Pitch → cierre</div><div className="v ok">{pct(m.pitchACierre)}</div></div>
          </div>

          <h3>Cómo salió el pitch</h3>
          <table>
            <thead><tr><th>Desenlace</th><th>Pitches</th><th>% del mes</th></tr></thead>
            <tbody>
              {(m.porPitch ?? []).map((e) => (
                <tr key={e.clave}><td>{e.estado}</td><td>{e.n}</td><td>{e.pct}%</td></tr>
              ))}
            </tbody>
          </table>

          <h3>Qué pasó con la llamada</h3>
          <table>
            <thead><tr><th>Desenlace</th><th>Llamadas</th><th>% de las agendas</th></tr></thead>
            <tbody>
              {(m.porLlamada ?? []).map((e) => (
                <tr key={e.clave}><td>{e.estado}</td><td>{e.n}</td><td>{e.pct}%</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="doc-bloque">
          <h2>Laboratorio de setting<span>de dónde salieron y cuáles convirtieron</span></h2>

          <h3>Por canal</h3>
          <table>
            <thead><tr><th>Canal</th><th>Pitches</th><th>Agendó</th><th>Cerró</th></tr></thead>
            <tbody>
              {(lab.porCanal ?? []).map((g) => (
                <tr key={g.clave}>
                  <td>{g.valor}</td><td>{g.n}</td>
                  <td className={g.tasaAgenda >= 70 ? 'ok' : 'mal'}>{pct(g.tasaAgenda)}</td>
                  <td>{pct(g.tasaCierre)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Por origen</h3>
          <table>
            <thead><tr><th>Origen</th><th>Pitches</th><th>Agendó</th><th>Cerró</th></tr></thead>
            <tbody>
              {(lab.porOrigen ?? []).map((g) => (
                <tr key={g.clave}>
                  <td>{g.valor}</td><td>{g.n}</td>
                  <td className={g.tasaAgenda >= 70 ? 'ok' : 'mal'}>{pct(g.tasaAgenda)}</td>
                  <td>{pct(g.tasaCierre)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Qué tan rápido va</h3>
          <div className="doc-resumen">
            <div><div className="l">Del pitch a la agenda</div><div className="v">{dias(v.pitchAAgenda)}</div></div>
            <div><div className="l">De la agenda a la llamada</div><div className="v">{dias(v.agendaALlamada)}</div></div>
            <div><div className="l">Agendó el mismo día</div><div className="v">{pct(v.mismoDia)}</div></div>
            <div><div className="l">Reprogramaciones</div><div className="v">{v.reprogramaciones ?? 0}</div></div>
          </div>

          {/* Lo que el reporte todavía no puede responder, dicho en el reporte: callarlo
              hace que el que lo lee crea que esos números no existen porque son cero. */}
          {(lab.faltan ?? []).length ? (
            <p className="rc-aviso">
              Fuera de este bloque por ahora: {lab.faltan.join(' ')}
            </p>
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
        <div className="rp-pie-botones">
          <button type="button" className="btn ghost" onClick={() => setEditando((e) => !e)}>
            {editando ? 'Listo' : 'Editar'}
          </button>
          <button type="button" className="btn ghost" onClick={onGuardar} disabled={guardando}>
            Guardar borrador
          </button>
          <button type="button" className="btn" onClick={onCerrar} disabled={guardando || editando}>
            Cerrar el reporte
          </button>
        </div>
      </div>
    </>
  );
}
