import { useEffect, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { editarPersonaDaily, getEquipoDaily, getTareasRol, guardarTareasRol } from '../data/api.js';
import { DIAS } from '../lib/daily.js';
import '../styles/daily.css';

const AREAS = [
  ['ventas', 'Ventas'], ['marketing', 'Marketing'], ['producto', 'Producto'],
  ['sistemas', 'Sistemas'], ['direccion', 'Dirección'],
];

/**
 * El equipo de Backbone: con qué mails entra cada uno, su cargo, a quién reporta y las
 * tareas fijas de su rol, que aparecen solas en su semana y no se pueden borrar.
 */
export default function BackboneEquipo() {
  const [equipo, setEquipo] = useState(null);
  const [error, setError] = useState(null);
  const [sel, setSel] = useState(null);

  function cargar() {
    return getEquipoDaily().then((r) => { setEquipo(r); setError(null); return r; }).catch(setError);
  }
  useEffect(() => { cargar().then((r) => r?.length && setSel((s) => s ?? r[0].username)); }, []);

  if (error && !equipo) return <div className="page"><ErrorState error={error} /></div>;
  if (!equipo) return <div className="page"><SkeletonBlock height={420} /></div>;
  const persona = equipo.find((p) => p.username === sel);
  const sinMail = equipo.filter((p) => !p.emails.length);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Dirección · Backbone"
        title="Equipo y roles"
        desc="Con qué cuenta de Google entra cada uno, a quién reporta y las tareas fijas de su rol."
      />
      <div className="dl-grid" style={{ gridTemplateColumns: 'minmax(0, 300px) minmax(0, 1fr)' }}>
        <Card title="Equipo" sub={sinMail.length ? `${sinMail.length} sin mail: no pueden entrar` : 'Todos pueden entrar'}>
          <div className="eq-list">
            {equipo.map((p) => (
              <button key={p.username} type="button" className="eq-item" aria-pressed={p.username === sel} onClick={() => setSel(p.username)}>
                {p.foto_url ? <img className="bb-av" src={p.foto_url} alt="" referrerPolicy="no-referrer" /> : <span className="bb-av">{p.nombre.slice(0, 2).toUpperCase()}</span>}
                <span><b style={{ fontWeight: 600 }}>{p.nombre}</b><small>{p.cargo ?? '—'}</small></span>
                {!p.emails.length ? <Pill tone="alert">sin mail</Pill> : !p.daily ? <Pill tone="off">sin daily</Pill> : <span />}
              </button>
            ))}
          </div>
        </Card>
        {persona && (
          <div className="dl-side" style={{ gap: 'var(--space-4)' }}>
            <FichaPersona key={persona.username} persona={persona} equipo={equipo} onGuardado={cargar} />
            <TareasDelRol key={`r-${persona.username}`} persona={persona} equipo={equipo} />
          </div>
        )}
      </div>
    </div>
  );
}

function FichaPersona({ persona, equipo, onGuardado }) {
  const [f, setF] = useState({
    nombre: persona.nombre, cargo: persona.cargo ?? '', area: persona.area ?? 'ventas',
    jefe: (persona.jefe ?? '').split(',')[0] ?? '', jefe2: (persona.jefe ?? '').split(',')[1] ?? '', daily: persona.daily, emails: persona.emails.join('\n'),
    whatsapp: persona.whatsapp ?? '',
  });
  const [estado, setEstado] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    setEstado('Guardando…');
    try {
      await editarPersonaDaily(persona.username, {
        ...f, jefe: [f.jefe, f.jefe2].filter(Boolean), jefe2: undefined,
        emails: f.emails.split(/[\n,]/).map((m) => m.trim()).filter(Boolean),
      });
      setEstado('Guardado');
      onGuardado();
    } catch (err) {
      setEstado(err.message);
    }
  }

  return (
    <Card title={persona.nombre} sub={`Usuario ${persona.username} · rol en Ops: ${persona.rol}`}>
      <form className="eq-form" onSubmit={guardar}>
        <label>Nombre<input id="eq-nombre" value={f.nombre} onChange={set('nombre')} /></label>
        <label>Cargo<input id="eq-cargo" value={f.cargo} onChange={set('cargo')} /></label>
        <label>Área (weekly del lunes)
          <select id="eq-area" value={f.area} onChange={set('area')}>
            {AREAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label>Reporta a
          <select id="eq-jefe" value={f.jefe} onChange={set('jefe')}>
            <option value="">Nadie (arriba de todo)</option>
            {equipo.filter((p) => p.username !== persona.username).map((p) => <option key={p.username} value={p.username}>{p.nombre}</option>)}
          </select>
        </label>
        {f.jefe && (
          <label>Y también a (si son dos cabezas)
            <select id="eq-jefe2" value={f.jefe2} onChange={set('jefe2')}>
              <option value="">Nadie más</option>
              {equipo.filter((p) => ![persona.username, f.jefe].includes(p.username)).map((p) => <option key={p.username} value={p.username}>{p.nombre}</option>)}
            </select>
          </label>
        )}
        <label className="full">Mails de Google con los que entra (uno por línea)
          <textarea id="eq-emails" rows={2} value={f.emails} onChange={set('emails')} placeholder="nombre@gmail.com" />
        </label>
        <label className="full">WhatsApp, con código de país (Theo lo etiqueta en los grupos)
          <input id="eq-whatsapp" inputMode="tel" value={f.whatsapp} onChange={set('whatsapp')} placeholder="5493511234567" />
        </label>
        <label className="full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input id="eq-daily" type="checkbox" checked={f.daily} onChange={set('daily')} />
          Carga daily (aparece en Theo y en Backbone)
        </label>
        <div className="full" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit" className="btn primary">Guardar</button>
          <span className="dim">{estado}</span>
        </div>
      </form>
    </Card>
  );
}

function TareasDelRol({ persona, equipo }) {
  const [tareas, setTareas] = useState(null);
  const [estado, setEstado] = useState('');
  useEffect(() => { getTareasRol(persona.username).then(setTareas).catch((e) => setEstado(e.message)); }, [persona.username]);

  const set = (i, k, v) => setTareas((ts) => ts.map((t, j) => (j === i ? { ...t, [k]: v, ...(k === 'frecuencia' && v !== 'semanal' ? { dia: null } : {}) } : t)));

  async function guardar() {
    setEstado('Guardando…');
    try {
      setTareas(await guardarTareasRol(persona.username, tareas));
      setEstado('Guardado. Aparece en su semana actual y en las que vienen.');
    } catch (err) {
      setEstado(err.message);
    }
  }

  return (
    <Card
      title="Tareas fijas del rol"
      sub="Velocidad: aparecen siempre en su semana y no las puede borrar."
      actions={<button type="button" className="btn primary" onClick={guardar}
        disabled={!tareas || tareas.some((t) => !t.texto.trim())}
        title={tareas?.some((t) => !t.texto.trim()) ? 'Hay una tarea sin texto' : undefined}>Guardar tareas</button>}
    >
      {!tareas ? <SkeletonBlock height={120} /> : (
        <>
          {tareas.length === 0 && <p className="dl-vacio">Todavía no tiene tareas de rol.</p>}
          {tareas.map((t, i) => (
            <div className="eq-tarea" key={t.id ?? `n${i}`}>
              <input value={t.texto} onChange={(e) => set(i, 'texto', e.target.value)} aria-label="Tarea" placeholder="Qué hace" />
              <select value={t.frecuencia} onChange={(e) => set(i, 'frecuencia', e.target.value)} aria-label="Frecuencia">
                <option value="diaria">Diaria</option>
                <option value="semanal">Semanal</option>
                <option value="mensual">Mensual</option>
              </select>
              <select value={t.dia ?? ''} disabled={t.frecuencia !== 'semanal'} aria-label="Día"
                onChange={(e) => set(i, 'dia', e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">{t.frecuencia === 'semanal' ? 'En la semana' : '—'}</option>
                {DIAS.map((d, j) => <option key={d} value={j}>{d}</option>)}
              </select>
              <select value={t.destinatario ?? ''} onChange={(e) => set(i, 'destinatario', e.target.value || null)} aria-label="Le entrega a">
                <option value="">Sin entrega</option>
                {equipo.filter((p) => p.username !== persona.username).map((p) => <option key={p.username} value={p.username}>→ {p.nombre}</option>)}
              </select>
              <button type="button" className="dl-x" aria-label="Quitar tarea" onClick={() => setTareas((ts) => ts.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
            <button type="button" className="btn" onClick={() => setTareas((ts) => [...ts, { texto: '', frecuencia: 'diaria', dia: null, destinatario: null }])}>+ Agregar tarea</button>
            <span className="dim">{estado}</span>
          </div>
        </>
      )}
    </Card>
  );
}
