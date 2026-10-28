import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import CargarDaily from '../components/daily/CargarDaily.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import Pill from '../components/ui/Pill.jsx';
import {
  agregarTareaDaily,
  borrarTareaDaily,
  editarTareaDaily,
  getDailySemana,
  guardarDiaDaily,
} from '../data/api.js';
import {
  abierta, BANDA_TEXTO, banda, cumplimiento, cumplimientoDia, DIAS, fechaCorta, nombreDe, sumarDias, vence,
} from '../lib/daily.js';
import '../styles/daily.css';

/**
 * La daily de cada uno: una caja por día, de lunes a domingo. En cada día están las tareas del rol
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
  const terminada = sumarDias(data.semana, 6) < data.hoy;
  const nav = (
    <div className="dl-weeknav">
      <button type="button" className="btn ghost sm" onClick={() => setSemana(sumarDias(data.semana, -7))}>←</button>
      <b>Semana del {fechaCorta(data.semana)} al {fechaCorta(sumarDias(data.semana, 6))}</b>
      <button type="button" className="btn ghost sm" disabled={sinEmpezar}
        onClick={() => setSemana(sumarDias(data.semana, 7))}>→</button>
    </div>
  );

  return (
    <div className="page">
      <div className="dl-top">
        {/* De quién es esta daily. En el celular el pie del sidebar —el único lugar donde
            figuraba el nombre— queda oculto, y como hay tareas de rol con el mismo texto en
            varias personas ("Pasada de Discord"), la daily propia se lee como la de otro.
            El nombre sale de lo que devuelve el servidor y no de la sesión guardada: es el
            dueño real de estas tareas, también cuando un admin entró como esa persona. */}
        <b className="dl-quien">{data.persona?.nombre ?? data.persona?.username}</b>
        {terminada ? <span /> : (
          <CargarDaily
            semana={data.semana}
            hoy={data.hoy}
            onCargado={(destino, nueva) => {
              // Si se cargaron en otra semana, la pantalla se va con ellas.
              if (destino !== data.semana) setSemana(destino); else setData(nueva);
              setError(null);
            }}
          />
        )}
        {nav}
      </div>
      <DiaDaily data={data} dia={dia} setDia={setDia} onGuardado={setData} />
    </div>
  );
}

const LAPIZ = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5z" />
  </svg>
);

const LOCK = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
);

/* ------------------------------------------------------------------ daily */

const SEMANA = 7; // la octava caja: la semana entera, como el documento del domingo
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

// Un sábado o un domingo sin tareas no es una daily que falta: es un día libre, y no se
// pinta de rojo. Apenas alguien se pone una tarea ahí, el día se comporta como cualquier otro.
function estadoDia(d, tareas) {
  if (d.futuro) return '';
  if (d.dia >= 5 && !d.guardado_at && !tareas) return 'libre';
  if (!d.guardado_at) return 'falta';
  return 'ok';
}

/** Lo que no se hizo pide motivo. Pasarla a mañana no: el motivo es ese. */
const sinMotivo = (estado) => estado === 'hecha' || estado === 'pasada';

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
  const [draft, setDraft] = useState(inicial);
  const [draftFecha, setDraftFecha] = useState(fecha); // de qué día es lo marcado en pantalla
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const fechaDraft = useRef(fecha);
  useEffect(() => {
    // Mismo día: se conserva lo marcado sin guardar (agregar o borrar una tarea no lo pisa).
    const mismoDia = fechaDraft.current === fecha;
    fechaDraft.current = fecha;
    setDraft((prev) => (mismoDia ? Object.fromEntries(Object.keys(inicial).map((id) => [id, prev[id] ?? inicial[id]]))
      : inicial));
    setDraftFecha(fecha);
    if (!mismoDia) setError('');
  }, [inicial, fecha]);
  // Guardado parcial: lo que se marca va a la base al toque (un refresco no lo pierde),
  // sin cerrar el día. La daily cuenta como guardada recién con "Guardar daily".
  const [parcialError, setParcialError] = useState('');
  const enBase = useRef(inicial); // lo que la base ya tiene de este día
  useEffect(() => { enBase.current = inicial; }, [inicial]);
  useEffect(() => {
    if (draftFecha !== fecha) return undefined;
    const cambiadas = Object.entries(draft).filter(([id, v]) => {
      const i = enBase.current[id];
      return i && (v.estado !== i.estado || (v.motivo || '') !== (i.motivo || ''));
    });
    if (!cambiadas.length) return undefined;
    // Pasar (o despasar) crea o saca la tarea del día siguiente: esa vuelta sí trae la semana.
    const tocaManana = cambiadas.some(([id, v]) => v.estado === 'pasada' || enBase.current[id]?.estado === 'pasada');
    const t = setTimeout(() => {
      guardarDiaDaily(fecha, cambiadas.map(([id, v]) => ({ tarea_id: Number(id), estado: v.estado, motivo: v.motivo || null })), true)
        .then((semana) => {
          enBase.current = { ...enBase.current, ...Object.fromEntries(cambiadas) };
          setParcialError('');
          if (tocaManana) onGuardado(semana);
        })
        .catch((e) => setParcialError(e.message));
    }, 600);
    return () => clearTimeout(t);
  }, [draft, draftFecha, fecha, onGuardado]);

  const terminada = sumarDias(data.semana, 6) < data.hoy;
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

  const [editando, setEditando] = useState(null); // { id, texto }

  async function guardarEdicion() {
    const { id, texto } = editando;
    const orig = data.tareas.find((x) => x.id === id);
    setEditando(null);
    if (!texto.trim() || texto.trim() === orig?.texto) return;
    setError('');
    try {
      const nueva = await editarTareaDaily(id, { texto: texto.trim() });
      onGuardado({ ...data, tareas: data.tareas.map((x) => (x.id === id ? { ...x, ...nueva } : x)) });
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
    ? [...deHoy, ...abiertas].filter((t) => { const v = draft[t.id]; return v?.estado && !sinMotivo(v.estado) && !v.motivo.trim(); }).length
    : deHoy.filter((t) => {
      const v = draft[t.id];
      return !v?.estado || (!sinMotivo(v.estado) && !v.motivo.trim());
    }).length;
  // El porcentaje se mueve a medida que marcás, antes de guardar: lo marcado pisa lo guardado de ese día.
  const conLoMarcado = {
    ...data,
    tareas: data.tareas.map((t) => {
      const v = draft[t.id];
      return v?.estado ? { ...t, marcas: { ...t.marcas, [fecha]: { ...(t.marcas[fecha] ?? {}), estado: v.estado } } } : t;
    }),
  };
  const pctSemana = cumplimiento(conLoMarcado);
  const pctDia = cumplimientoDia(conLoMarcado, dia);
  const bSemana = banda(pctSemana);
  const bDia = banda(pctDia);

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
        {t.origen === 'rol' && <span className="dl-lock">{LOCK}Rol</span>}
        <span className={`dl-kind ${t.tipo}`}>{t.tipo === 'velocidad' ? 'Velocidad' : 'Desplazamiento'}</span>
        {t.frecuencia === 'mensual' && <span>Del mes</span>}
        {t.destinatario && <span>Entrega a {nombreDe(t.destinatario)}</span>}
        {otro && <span>· hecha el {otro}</span>}
        {t.viene_de && <span>Pasada del {DIAS[(new Date(`${t.viene_de}T12:00:00`).getDay() + 6) % 7]}</span>}
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
        <div className="t">
          {editando?.id === t.id ? (
            <input
              className="dl-editar"
              value={editando.texto}
              autoFocus
              onChange={(e) => setEditando({ id: t.id, texto: e.target.value })}
              onBlur={guardarEdicion}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setEditando(null);
              }}
              aria-label="Texto de la tarea"
            />
          ) : <b>{t.texto}</b>}
          {etiquetas}
        </div>
        <div className="dl-acc">
        {/* Las del rol son fijas: no se borran, se marcan (con motivo si no se hicieron). */}
        {!terminada && t.origen !== 'rol' && (
          <button type="button" className="dl-x editar" onClick={() => setEditando({ id: t.id, texto: t.texto })}
            aria-label={`Editar ${t.texto}`} title="Editar tarea">{LAPIZ}</button>
        )}
        {!terminada && t.origen !== 'rol' && (
          <button type="button" className="dl-x" onClick={() => quitar(t)} aria-label={`Quitar ${t.texto}`} title="Quitar tarea">✕</button>
        )}
        {!terminada && t.origen === 'rol' && <span className="dl-x dl-x-lock" title="Tarea fija del rol">{LOCK}</span>}
        <div className="dl-seg" role="group" aria-label={`Estado de ${t.texto}`}>
          {/* Un día que no llegó se adelanta: lo hiciste antes o no va a aplicar. */}
          {/* Pasar a mañana: solo las que son de un día (una diaria mañana ya está). */}
          {(d.futuro ? [['hecha', 'Hecha']]
            : [['hecha', 'Hecha'], ['no', 'No la hice'], ...(t.se_puede_pasar ? [['pasada', 'A mañana']] : [])]).map(([k, l]) => (
            <button key={k} type="button" className={k} aria-pressed={v.estado === k} onClick={() => poner(t.id, k)}>{l}</button>
          ))}
        </div>
        </div>
        {v.estado && !sinMotivo(v.estado) && (
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
          const n = data.tareas.filter((t) => vence(t, i)).length;
          const e = estadoDia(x, n);
          return (
            <button key={x.fecha} type="button" className={`dl-day ${e}`} aria-pressed={i === dia} onClick={() => setDia(i)}>
              <b>{DIAS[i]}</b>
              <span>{fechaCorta(x.fecha)} · {n} {n === 1 ? 'tarea' : 'tareas'}</span>
              <i>{x.futuro ? (() => {
                const adelantadas = data.tareas.filter((t) => t.marcas[x.fecha]).length;
                return adelantadas ? `${adelantadas} adelantada${adelantadas > 1 ? 's' : ''}` : 'Todavía no llegó';
              })() : e === 'ok' ? `✓ Guardada ${x.guardado_at}` : e === 'libre' ? 'Libre' : '✕ Sin guardar'}</i>
              {x.es_hoy && <em>Hoy</em>}
            </button>
          );
        })}
        <button type="button" className="dl-day dl-day-semana" aria-pressed={dia === SEMANA} onClick={() => setDia(SEMANA)}>
          <b>Semana completa</b>
          <span>{fechaCorta(data.semana)} al {fechaCorta(sumarDias(data.semana, 6))} · {data.tareas.length} tareas</span>
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
          <Card title="Cumplimiento">
            <div className="dl-pcts">
              {[[d.es_hoy ? 'Hoy' : `El ${DIAS[dia]}`, pctDia, bDia], ['La semana', pctSemana, bSemana]].map(([label, valor, tono]) => (
                <div key={label}>
                  <span>{label}</span>
                  <div className="dl-pct">
                    <b style={{ color: `var(--${tono === 'off' ? 'text-3' : tono})` }}>{valor == null ? '—' : `${valor}%`}</b>
                    <Pill tone={tono}>{BANDA_TEXTO[tono]}</Pill>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <button type="button" className="btn primary dl-guardar" disabled={guardando || falta > 0} onClick={guardar}>
            {guardando ? 'Guardando…' : d.futuro ? 'Guardar' : 'Guardar daily'}
          </button>
          {error || parcialError ? <span className="dl-error">{error || parcialError}</span>
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
