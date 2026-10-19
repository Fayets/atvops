import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import Pill from '../components/ui/Pill.jsx';
import {
  agregarTareaDaily,
  borrarTareaDaily,
  getDailySemana,
  guardarDiaDaily,
} from '../data/api.js';
import {
  abierta, BANDA_TEXTO, banda, cumplimiento, DIAS, fechaCorta, nombreDe, sumarDias, vence,
} from '../lib/daily.js';
import { getStoredUser } from '../lib/auth.js';
import '../styles/daily.css';

/**
 * La daily de cada uno: cinco cajas, una por día. En cada día están las tareas del rol
 * (no se borran) y se suman las propias, de velocidad o de desplazamiento. Se marca cada
 * tarea con motivo si no se hizo.
 */
export default function Daily() {
  const [semana, setSemana] = useState(null); // lunes ISO; null = la que corresponde hoy
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dia, setDia] = useState(null);

  const cargar = useCallback(async (s) => {
    try {
      const r = await getDailySemana(s);
      setData(r);
      setError(null);
      return r;
    } catch (e) {
      setError(e);
      return null;
    }
  }, []);

  useEffect(() => {
    cargar(semana).then((r) => {
      if (!r) return;
      const hoyIdx = r.dias.findIndex((d) => d.es_hoy);
      // Se queda en el día que estabas mirando; si no, hoy; si la semana no empezó, el lunes.
      setDia((prev) => (prev != null && r.dias[prev] ? prev
        : hoyIdx >= 0 ? hoyIdx : Math.max(0, r.dias.filter((d) => !d.futuro).length - 1)));
    });
  }, [semana, cargar]);

  if (error && !data) return <div className="page"><ErrorState error={error} /></div>;
  if (!data) return <div className="page"><SkeletonBlock height={420} /></div>;

  const sinEmpezar = data.dias.every((d) => d.futuro);
  const nav = (
    <div className="dl-weeknav">
      <button type="button" className="btn ghost sm" onClick={() => setSemana(sumarDias(data.semana, -7))}>←</button>
      <b>Semana del {fechaCorta(data.semana)} al {fechaCorta(sumarDias(data.semana, 4))}</b>
      <button type="button" className="btn ghost sm" disabled={sinEmpezar}
        onClick={() => setSemana(sumarDias(data.semana, 7))}>→</button>
    </div>
  );

  return (
    <div className="page">
      <div className="dl-top"><span />{nav}</div>
      <DiaDaily data={data} dia={dia} setDia={setDia} onGuardado={setData} />
    </div>
  );
}

/* ------------------------------------------------------------------ daily */

const SEMANA = 5; // la sexta caja: la semana entera, como el documento del domingo
const primeroDesplazamiento = (a, b) => (a.tipo === 'desplazamiento' ? 0 : 1) - (b.tipo === 'desplazamiento' ? 0 : 1);

/** La semana como el documento: cada día con sus tareas y cómo quedó cada una. */
function SemanaCompleta({ data }) {
  const marca = (t, fecha) => {
    const m = t.marcas[fecha];
    if (!m) return null;
    return m.estado === 'hecha' ? <i className="ok">✓</i> : <i className="no" title={m.motivo || ''}>✕</i>;
  };
  const tarea = (t, fecha) => (
    <li key={t.id}>
      {fecha ? marca(t, fecha) ?? <i /> : <i>{Object.values(t.marcas).some((m) => m.estado === 'hecha') ? '✓' : ''}</i>}
      <span>
        {t.texto}
        {fecha && t.marcas[fecha]?.estado === 'no' && t.marcas[fecha].motivo && <small> — {t.marcas[fecha].motivo}</small>}
      </span>
      <em className={`dl-kind ${t.tipo}`}>{t.tipo === 'velocidad' ? 'Velocidad' : 'Desplazamiento'}</em>
    </li>
  );
  const abiertas = data.tareas.filter(abierta).sort(primeroDesplazamiento);
  return (
    <Card flush className="dl-doc">
      {data.dias.map((x, i) => {
        const ts = data.tareas.filter((t) => vence(t, i)).sort(primeroDesplazamiento);
        return (
          <section key={x.fecha}>
            <h3>{DIAS[i]} {fechaCorta(x.fecha)}{x.es_hoy && <span className="dim"> · hoy</span>}</h3>
            {ts.length ? <ul>{ts.map((t) => tarea(t, x.fecha))}</ul> : <p className="dl-vacio">Sin tareas.</p>}
          </section>
        );
      })}
      {abiertas.length > 0 && (
        <section>
          <h3>Abiertas en la semana</h3>
          <ul>{abiertas.map((t) => tarea(t, null))}</ul>
        </section>
      )}
    </Card>
  );
}

function estadoDia(d) {
  if (d.futuro) return '';
  if (!d.guardado_at) return 'falta';
  return d.a_tiempo ? 'ok' : 'tarde';
}

// Lo marcado y no guardado sobrevive a un refresco: queda en este navegador hasta que se
// toca "Guardar daily" (ahí lo guardado pasa a ser lo de la base y el borrador se borra).
const claveBorrador = (fecha) => `atv-daily-borrador:${getStoredUser()?.username ?? ''}:${fecha}`;

function leerBorrador(fecha) {
  try {
    return JSON.parse(localStorage.getItem(claveBorrador(fecha)) ?? 'null') ?? {};
  } catch {
    return {};
  }
}

function conBorrador(inicial, fecha) {
  const b = leerBorrador(fecha);
  return Object.fromEntries(Object.entries(inicial).map(([id, v]) => [id, b[id] ?? v]));
}

function DiaDaily({ data, dia, setDia, onGuardado }) {
  const d = data.dias[dia] ?? data.dias[0];
  const fecha = d.fecha;
  // Las de desplazamiento siempre arriba: son las que mueven la semana.
  const deHoy = data.tareas.filter((t) => vence(t, dia)).sort(primeroDesplazamiento);
  const abiertas = data.tareas.filter(abierta).sort(primeroDesplazamiento);

  const inicial = useMemo(() => {
    const st = {};
    for (const t of data.tareas) {
      const m = t.marcas[fecha];
      st[t.id] = { estado: m?.estado ?? null, motivo: m?.motivo ?? '' };
    }
    return st;
  }, [data, fecha]);
  const [draft, setDraft] = useState(() => conBorrador(inicial, fecha));
  const [draftFecha, setDraftFecha] = useState(fecha); // de qué día es el borrador en pantalla
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const fechaDraft = useRef(fecha);
  useEffect(() => {
    // Mismo día: se conserva lo marcado sin guardar (agregar o borrar una tarea no lo pisa).
    const mismoDia = fechaDraft.current === fecha;
    fechaDraft.current = fecha;
    setDraft((prev) => (mismoDia ? Object.fromEntries(Object.keys(inicial).map((id) => [id, prev[id] ?? inicial[id]]))
      : conBorrador(inicial, fecha)));
    setDraftFecha(fecha);
    if (!mismoDia) setError('');
  }, [inicial, fecha]);
  useEffect(() => {
    if (draftFecha !== fecha) return;
    const distinto = Object.fromEntries(Object.entries(draft).filter(([id, v]) => {
      const i = inicial[id];
      return i && (v.estado !== i.estado || (v.motivo || '') !== (i.motivo || ''));
    }));
    try {
      if (Object.keys(distinto).length) localStorage.setItem(claveBorrador(fecha), JSON.stringify(distinto));
      else localStorage.removeItem(claveBorrador(fecha));
    } catch { /* sin almacenamiento: sigue andando, solo no sobrevive al refresco */ }
  }, [draft, draftFecha, inicial, fecha]);

  const terminada = sumarDias(data.semana, 4) < data.hoy;
  const [nueva, setNueva] = useState('');
  const [tipoNueva, setTipoNueva] = useState('velocidad');

  async function agregar(e) {
    e.preventDefault();
    if (!nueva.trim()) return;
    setError('');
    try {
      const t = await agregarTareaDaily(data.semana, nueva.trim(), tipoNueva, dia);
      setNueva('');
      onGuardado({ ...data, tareas: [...data.tareas, t] });
    } catch (err) {
      setError(err.message);
    }
  }

  async function quitar(t) {
    setError('');
    try {
      await borrarTareaDaily(t.id);
      onGuardado({ ...data, tareas: data.tareas.filter((x) => x.id !== t.id) });
    } catch (err) {
      setError(err.message);
    }
  }

  // Hoy y los días pasados se guardan completos; uno que no llegó solo pide motivo en lo marcado.
  const falta = d.futuro
    ? [...deHoy, ...abiertas].filter((t) => { const v = draft[t.id]; return v?.estado && v.estado !== 'hecha' && !v.motivo.trim(); }).length
    : deHoy.filter((t) => {
      const v = draft[t.id];
      return !v?.estado || (v.estado !== 'hecha' && !v.motivo.trim());
    }).length;
  // El porcentaje se mueve a medida que marcás, antes de guardar: lo marcado pisa lo guardado de ese día.
  const pct = cumplimiento({
    ...data,
    tareas: data.tareas.map((t) => {
      const v = draft[t.id];
      return v?.estado ? { ...t, marcas: { ...t.marcas, [fecha]: { ...(t.marcas[fecha] ?? {}), estado: v.estado } } } : t;
    }),
  });
  const b = banda(pct);

  function poner(id, estado) {
    setDraft((s) => ({ ...s, [id]: { ...s[id], estado: s[id]?.estado === estado ? null : estado } }));
  }

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      const marcas = [...deHoy, ...abiertas]
        .filter((t) => !hechaOtroDia(t, fecha))
        .map((t) => ({ tarea_id: t.id, estado: draft[t.id]?.estado ?? null, motivo: draft[t.id]?.motivo || null }));
      onGuardado(await guardarDiaDaily(fecha, marcas));
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  const fila = (t) => {
    const otro = hechaOtroDia(t, fecha);
    const v = draft[t.id] ?? { estado: null, motivo: '' };
    const etiquetas = (
      <small>
        <span className={`dl-kind ${t.tipo}`}>{t.tipo === 'velocidad' ? 'Velocidad' : 'Desplazamiento'}</span>
        {t.frecuencia === 'mensual' && <span>Del mes</span>}
        {t.destinatario && <span>Entrega a {nombreDe(t.destinatario)}</span>}
        {otro && <span>· hecha el {otro}</span>}
      </small>
    );
    if (otro) {
      return (
        <div className="dl-task" key={t.id}>
          <div className="t"><b>{t.texto}</b>{etiquetas}</div>
          <Pill tone="ok">Hecha</Pill>
        </div>
      );
    }
    return (
      <div className="dl-task" key={t.id}>
        <div className="t"><b>{t.texto}</b>{etiquetas}</div>
        <div className="dl-acc">
        {!terminada && (
          <button type="button" className="dl-x" onClick={() => quitar(t)} aria-label={`Quitar ${t.texto}`} title="Quitar tarea">✕</button>
        )}
        <div className="dl-seg" role="group" aria-label={`Estado de ${t.texto}`}>
          {/* Un día que no llegó se adelanta: lo hiciste antes o no va a aplicar. */}
          {(d.futuro ? [['hecha', 'Hecha']] : [['hecha', 'Hecha'], ['no', 'No la hice']]).map(([k, l]) => (
            <button key={k} type="button" className={k} aria-pressed={v.estado === k} onClick={() => poner(t.id, k)}>{l}</button>
          ))}
        </div>
        </div>
        {v.estado && v.estado !== 'hecha' && (
          <div className="dl-motivo">
            <input
              className={v.motivo.trim() ? '' : 'falta'}
              placeholder="Escribí el motivo"
              value={v.motivo}
              onChange={(e) => setDraft((s) => ({ ...s, [t.id]: { ...s[t.id], motivo: e.target.value } }))}
              aria-label={`Motivo de ${t.texto}`}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="dl-days" role="group" aria-label="Día de la semana">
        {data.dias.map((x, i) => {
          const e = estadoDia(x);
          const n = data.tareas.filter((t) => vence(t, i)).length;
          return (
            <button key={x.fecha} type="button" className={`dl-day ${e}`} aria-pressed={i === dia} onClick={() => setDia(i)}>
              <b>{DIAS[i]}</b>
              <span>{fechaCorta(x.fecha)} · {n} {n === 1 ? 'tarea' : 'tareas'}</span>
              <i>{x.futuro ? (() => {
                const adelantadas = data.tareas.filter((t) => t.marcas[x.fecha]).length;
                return adelantadas ? `${adelantadas} adelantada${adelantadas > 1 ? 's' : ''}` : 'Todavía no llegó';
              })() : e === 'ok' ? `✓ Guardada ${x.guardado_at}` : e === 'tarde' ? 'Cargada tarde' : '✕ Sin guardar'}</i>
              {x.es_hoy && <em>Hoy</em>}
            </button>
          );
        })}
        <button type="button" className="dl-day dl-day-semana" aria-pressed={dia === SEMANA} onClick={() => setDia(SEMANA)}>
          <b>Semana completa</b>
          <span>{fechaCorta(data.semana)} al {fechaCorta(sumarDias(data.semana, 4))} · {data.tareas.length} tareas</span>
          <i>Todo el documento</i>
        </button>
      </div>
      {dia === SEMANA ? <SemanaCompleta data={data} /> : (
      <div className="dl-grid">
        <Card flush>
          <div className="dl-sec">
            <div className="dl-sech"><h3>{d.es_hoy ? 'Hoy' : `El ${DIAS[dia]}`}{d.futuro ? <span className="dim" style={{ fontWeight: 400 }}> · todavía no llegó: podés adelantar lo que ya hiciste</span> : null}</h3><span>{deHoy.length} tareas</span></div>
            {deHoy.length ? deHoy.map(fila) : <p className="dl-vacio">No hay tareas este día.</p>}
            {!terminada && (
              <form className="dl-add" onSubmit={agregar}>
                <input id="dl-nueva" value={nueva} onChange={(e) => setNueva(e.target.value)}
                  placeholder={`Agregar una tarea al ${DIAS[dia]}`} aria-label={`Nueva tarea para el ${DIAS[dia]}`} />
                <select id="dl-tipo" value={tipoNueva} onChange={(e) => setTipoNueva(e.target.value)} aria-label="Tipo de tarea">
                  <option value="velocidad">Velocidad</option>
                  <option value="desplazamiento">Desplazamiento</option>
                </select>
                <button type="submit" className="btn primary" disabled={!nueva.trim()}>Agregar</button>
              </form>
            )}
          </div>
          {abiertas.length > 0 && (
          <div className="dl-sec">
            <div className="dl-sech"><h3>Abiertas en la semana</h3><span>se cierran cualquier día</span></div>
            {abiertas.map(fila)}
          </div>
          )}
        </Card>
        <div className="dl-side">
          <Card title="Cumplimiento a hoy">
            <div className="dl-pct">
              <b style={{ color: `var(--${b === 'off' ? 'text-3' : b})` }}>{pct == null ? '—' : `${pct}%`}</b>
              <Pill tone={b}>{BANDA_TEXTO[b]}</Pill>
            </div>
            <p>Cuenta lo que vencía hasta hoy.</p>
          </Card>
          <button type="button" className="btn primary dl-guardar" disabled={guardando || falta > 0} onClick={guardar}>
            {guardando ? 'Guardando…' : d.futuro ? 'Guardar' : 'Guardar daily'}
          </button>
          {error ? <span className="dl-error">{error}</span>
            : d.futuro ? <span className="dim">{`Guardá lo que ya hiciste. La daily del ${DIAS[dia]} se completa cuando llegue.`}</span>
            : !falta && d.guardado_at ? <span className="dim">Ya está guardada. Si cambiaste algo, guardá de nuevo.</span> : null}
        </div>
      </div>
      )}
    </>
  );
}

/** Una abierta marcada hecha otro día de la semana ya no se vuelve a marcar. */
function hechaOtroDia(t, fecha) {
  if (!abierta(t)) return null;
  if (t.hecha_mes && t.hecha_mes !== fecha) return fechaCorta(t.hecha_mes);
  const otra = Object.entries(t.marcas).find(([f, m]) => f !== fecha && m.estado === 'hecha');
  return otra ? fechaCorta(otra[0]) : null;
}
