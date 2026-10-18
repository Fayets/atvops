import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import Pill from '../components/ui/Pill.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import {
  agregarTareaDaily,
  borrarTareaDaily,
  getDailySemana,
  guardarDiaDaily,
} from '../data/api.js';
import {
  abierta, BANDA_TEXTO, banda, cumplimiento, DIAS, fechaCorta, nombreDe, sumarDias, vence,
} from '../lib/daily.js';
import '../styles/daily.css';

const LOCK = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
);

/**
 * La daily de cada uno. El domingo se arma la semana (las tareas del rol ya vienen
 * puestas y no se borran); de lunes a viernes se marca cada tarea del día, con motivo si
 * no se hizo. Theo a las 23:00 solo mira si se guardó.
 */
export default function Daily() {
  const [semana, setSemana] = useState(null); // lunes ISO; null = la que corresponde hoy
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(null);
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
      // Fin de semana (o semana que no empezó): se arma. Durante la semana: la daily.
      setTab((prev) => prev ?? (r.dias.every((d) => d.futuro) ? 'semana' : 'hoy'));
    });
  }, [semana, cargar]);

  if (error && !data) return <div className="page"><ErrorState error={error} /></div>;
  if (!data) return <div className="page"><SkeletonBlock height={420} /></div>;

  const sinEmpezar = data.dias.every((d) => d.futuro);
  const esActual = data.dias.some((d) => d.es_hoy) || (sinEmpezar && sumarDias(data.hoy, 7) > data.semana);
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
      <div className="dl-top">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'hoy', label: 'Daily' },
            { value: 'semana', label: 'Armar la semana' },
          ]}
        />
        {nav}
      </div>
      {tab === 'semana'
        ? <ArmarSemana data={data} onCambio={() => cargar(data.semana)} esActual={esActual} />
        : <DiaDaily data={data} dia={dia} setDia={setDia} onGuardado={setData} />}
    </div>
  );
}

/* ------------------------------------------------------------------ daily */

function estadoDia(d) {
  if (d.futuro) return '';
  if (!d.guardado_at) return 'falta';
  return d.a_tiempo ? 'ok' : 'tarde';
}

function DiaDaily({ data, dia, setDia, onGuardado }) {
  const d = data.dias[dia] ?? data.dias[0];
  const fecha = d.fecha;
  const deHoy = data.tareas.filter((t) => vence(t, dia));
  const abiertas = data.tareas.filter(abierta);

  const inicial = useMemo(() => {
    const st = {};
    for (const t of data.tareas) {
      const m = t.marcas[fecha];
      st[t.id] = { estado: m?.estado ?? null, motivo: m?.motivo ?? '' };
    }
    return st;
  }, [data, fecha]);
  const [draft, setDraft] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setDraft(inicial); setError(''); }, [inicial]);

  // Hoy y los días pasados se guardan completos; uno que no llegó solo pide motivo en lo marcado.
  const falta = d.futuro
    ? [...deHoy, ...abiertas].filter((t) => { const v = draft[t.id]; return v?.estado && v.estado !== 'hecha' && !v.motivo.trim(); }).length
    : deHoy.filter((t) => {
      const v = draft[t.id];
      return !v?.estado || (v.estado !== 'hecha' && !v.motivo.trim());
    }).length;
  const pct = cumplimiento(data);
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
        {t.origen === 'rol' && <span className="dl-lock">{LOCK}Rol</span>}
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
        <div className="dl-seg" role="group" aria-label={`Estado de ${t.texto}`}>
          {/* Un día que no llegó se adelanta: lo hiciste antes o no va a aplicar. */}
          {(d.futuro ? [['hecha', 'Hecha'], ['no_aplica', 'No aplica']]
            : [['hecha', 'Hecha'], ['no', 'No la hice'], ['no_aplica', 'No aplica']]).map(([k, l]) => (
            <button key={k} type="button" className={k} aria-pressed={v.estado === k} onClick={() => poner(t.id, k)}>{l}</button>
          ))}
        </div>
        {v.estado && v.estado !== 'hecha' && (
          <div className="dl-motivo">
            <input
              className={v.motivo.trim() ? '' : 'falta'}
              placeholder="Motivo (lo ve Juan en Backbone)"
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
      </div>
      <div className="dl-grid">
        <Card flush>
          <div className="dl-sec">
            <div className="dl-sech"><h3>{d.es_hoy ? 'Hoy' : `El ${DIAS[dia]}`}{d.futuro ? <span className="dim" style={{ fontWeight: 400 }}> · todavía no llegó: podés adelantar lo que ya hiciste</span> : null}</h3><span>{deHoy.length} tareas</span></div>
            {deHoy.length ? deHoy.map(fila) : <p className="dl-vacio">No hay tareas fijas este día.</p>}
          </div>
          <div className="dl-sec">
            <div className="dl-sech"><h3>Abiertas en la semana</h3><span>se cierran cualquier día</span></div>
            {abiertas.length ? abiertas.map(fila) : <p className="dl-vacio">Nada abierto. Sumá tareas en "Armar la semana".</p>}
          </div>
          {<div className="dl-save">
            <span>
              {error ? <span className="dl-error">{error}</span>
                : d.futuro ? (falta ? 'Falta el motivo en lo que marcaste como "no aplica".'
                  : `Guardá lo que ya hiciste. La daily del ${DIAS[dia]} se completa cuando llegue.`)
                : falta ? `Faltan ${falta} tareas del día por marcar o con motivo.`
                  : d.guardado_at ? 'Ya está guardada. Si cambiaste algo, guardá de nuevo.'
                    : 'Todo marcado. Guardá para que cuente.'}
            </span>
            <button type="button" className="btn primary" disabled={guardando || falta > 0} onClick={guardar}>
              {guardando ? 'Guardando…' : d.futuro ? 'Guardar' : 'Guardar daily'}
            </button>
          </div>}
        </Card>
        <div className="dl-side">
          <Card title="Cumplimiento a hoy">
            <div className="dl-pct">
              <b style={{ color: `var(--${b === 'off' ? 'text-3' : b})` }}>{pct == null ? '—' : `${pct}%`}</b>
              <Pill tone={b}>{BANDA_TEXTO[b]}</Pill>
            </div>
            <p>Cuenta lo que vencía hasta hoy. "No aplica" con motivo no te baja.</p>
          </Card>
          <Card title="Theo a las 23:00">
            <p>Revisa si guardaste tu daily del día. Un día cargado después queda como "cargado tarde".</p>
          </Card>
        </div>
      </div>
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

/* ------------------------------------------------------------------ armar la semana */

function ArmarSemana({ data, onCambio, esActual }) {
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState('desplazamiento');
  const [error, setError] = useState('');
  const terminada = sumarDias(data.semana, 4) < data.hoy;

  const rol = data.tareas.filter((t) => t.origen === 'rol');
  const propias = data.tareas.filter((t) => t.origen !== 'rol');
  const vel = propias.filter((t) => t.tipo === 'velocidad');
  const des = propias.filter((t) => t.tipo === 'desplazamiento');
  const grupos = [
    ['Todos los días', (t) => t.frecuencia === 'diaria'],
    ...DIAS.map((n, i) => [n, (t) => t.frecuencia === 'semanal' && t.dia === i]),
    ['En la semana', (t) => t.frecuencia === 'semanal' && t.dia == null],
    ['Este mes', (t) => t.frecuencia === 'mensual'],
  ];

  async function agregar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    setError('');
    try {
      await agregarTareaDaily(data.semana, texto.trim(), tipo);
      setTexto('');
      onCambio();
    } catch (err) {
      setError(err.message);
    }
  }

  async function borrar(id) {
    try {
      await borrarTareaDaily(id);
      onCambio();
    } catch (err) {
      setError(err.message);
    }
  }

  const filaPropia = (t) => (
    <div className="dl-row" key={t.id}>
      <span />
      <div className="t"><b>{t.texto}</b><small>En la semana</small></div>
      {!terminada && <button type="button" className="dl-x" onClick={() => borrar(t.id)} aria-label={`Quitar ${t.texto}`}>✕</button>}
    </div>
  );

  return (
    <div className="dl-grid">
      <Card flush>
        <div className="dl-sec">
          <div className="dl-sech">
            <h3><span className="dl-kind velocidad">Velocidad</span> Tareas de tu rol</h3>
            <span>{rol.length} fijas · no se borran</span>
          </div>
          {rol.length === 0 && <p className="dl-vacio">Tu rol todavía no tiene tareas cargadas. Las carga Franco en Backbone → Equipo y roles.</p>}
          {grupos.map(([nombre, f]) => {
            const g = rol.filter(f);
            if (!g.length) return null;
            return (
              <div key={nombre}>
                <div className="dl-sub">{nombre}</div>
                {g.map((t) => (
                  <div className="dl-row" key={t.id}>
                    <span className="icono" title="Viene de tu rol. Si no aplica, lo marcás en la daily con el motivo.">{LOCK}</span>
                    <div className="t"><b>{t.texto}</b>{t.destinatario && <small>Entrega a {nombreDe(t.destinatario)}</small>}</div>
                    <span />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <div className="dl-sec">
          <div className="dl-sech"><h3><span className="dl-kind velocidad">Velocidad</span> Agregadas esta semana</h3><span>{vel.length}</span></div>
          {vel.length ? vel.map(filaPropia) : <p className="dl-vacio">Ninguna. Si esta semana hay algo rutinario extra, sumalo abajo.</p>}
        </div>
        <div className="dl-sec">
          <div className="dl-sech"><h3><span className="dl-kind desplazamiento">Desplazamiento</span> Para avanzar</h3><span>{des.length}</span></div>
          {des.length ? des.map(filaPropia) : <p className="dl-vacio">Sin tareas de desplazamiento todavía.</p>}
          {!terminada && (
            <form className="dl-add" onSubmit={agregar}>
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nueva tarea" aria-label="Nueva tarea" />
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de tarea">
                <option value="desplazamiento">Desplazamiento</option>
                <option value="velocidad">Velocidad</option>
              </select>
              <button type="submit" className="btn primary" disabled={!texto.trim()}>Agregar</button>
            </form>
          )}
          {error && <p className="dl-error">{error}</p>}
        </div>
      </Card>
      <div className="dl-side">
        <Card title="Tu semana">
          <div className="dl-count">
            <div><b>{rol.length + vel.length}</b><span>velocidad</span></div>
            <div><b>{des.length}</b><span>desplazamiento</span></div>
          </div>
        </Card>
        <Card title="Cómo sigue">
          <p>
            {esActual ? 'El lunes la presentás en la weekly de tu área. ' : ''}
            De lunes a viernes la vas marcando en la pestaña Daily. Lo que agregás acá queda abierto en la semana y se cierra cualquier día.
          </p>
        </Card>
      </div>
    </div>
  );
}
