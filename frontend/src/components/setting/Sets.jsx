import { useEffect, useMemo, useState } from 'react';
import Card from '../ui/Card.jsx';
import { SkeletonBlock } from '../ui/Loading.jsx';
import FilaPitch from './FilaPitch.jsx';
import TasasEmbudo from './TasasEmbudo.jsx';
import { getMetricasSetting } from '../../data/api.js';
import {
  CANAL_LARGO, DIAS, callsDe, etiquetaPeriodo, fechaCorta, iso, limites, lunesDe, sumarDias, trackeoDe,
} from '../../lib/setting.js';

const MODOS = [['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Este mes'], ['todo', 'Todo'], ['rango', 'Rango']];
const VISTAS_CALLS = [['hoy', 'Hoy'], ['semana', 'Semana'], ['proximas', 'Próximas'], ['todas', 'Todas']];

/** El formulario de un pitch nuevo. */
function NuevoPitch({ hoy, onCrear, onCerrar }) {
  const [f, setF] = useState({ prospecto: '', pitchAt: hoy, canal: 'dm', origen: 'organico', pitchEstado: 'pendiente',
    llamadaAt: '', usuarioIg: '', email: '', telefono: '' });
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));
  const enviar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await onCrear({ ...f, llamadaAt: f.llamadaAt || null });
      onCerrar();
    } finally {
      setGuardando(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <form className="modal-card nuevo-pitch" onClick={(e) => e.stopPropagation()} onSubmit={enviar} role="dialog" aria-label="Nuevo pitch">
        <header><h3>Nuevo pitch</h3><button type="button" className="btn ghost" onClick={onCerrar}>Cerrar</button></header>
        <label>Prospecto<input value={f.prospecto} onChange={set('prospecto')} placeholder="Nombre, mail o usuario" autoFocus required /></label>
        <div className="dos">
          <label>Fecha del pitch<input type="date" value={f.pitchAt} onChange={set('pitchAt')} required /></label>
          <label>Estado<select value={f.pitchEstado} onChange={set('pitchEstado')}>
            <option value="pendiente">Sin respuesta</option><option value="booked">Booked</option>
            <option value="ghosted">Ghosted</option><option value="denied">Denied</option>
          </select></label>
        </div>
        <div className="dos">
          <label>Canal<select value={f.canal} onChange={set('canal')}>
            <option value="dm">100% por DM</option><option value="phone">100% por llamada</option><option value="hibrido">Híbrido</option>
          </select></label>
          <label>Origen<select value={f.origen} onChange={set('origen')}>
            <option value="organico">Orgánico</option><option value="ads">Ads</option>
          </select></label>
        </div>
        {f.pitchEstado === 'booked' && (
          <label>Llamada agendada para<input type="date" value={f.llamadaAt} onChange={set('llamadaAt')} /></label>
        )}
        <div className="tres">
          <label>Instagram<input value={f.usuarioIg} onChange={set('usuarioIg')} placeholder="usuario" /></label>
          <label>Email<input value={f.email} onChange={set('email')} /></label>
          <label>Teléfono<input value={f.telefono} onChange={set('telefono')} /></label>
        </div>
        <footer><button type="submit" className="btn primary" disabled={guardando || !f.prospecto.trim()}>{guardando ? 'Guardando…' : 'Agregar'}</button></footer>
      </form>
    </div>
  );
}

/**
 * La pestaña Sets: el período, las tasas, el calendario de calls y el trackeo diario.
 *
 * @param {{ pitches: object[], hoy: string, cargando: boolean, tick: number,
 *           onCambiar: (id, patch) => void, onCrear: (datos) => Promise<void>, onBorrar: (id) => void }} props
 */
export default function Sets({ pitches, hoy, cargando, tick, onCambiar, onCrear, onBorrar }) {
  const [modo, setModo] = useState('semana');
  const [ref, setRef] = useState(hoy);
  const [rango, setRango] = useState({ desde: '', hasta: '' });
  const [canal, setCanal] = useState('');
  const [vistaCalls, setVistaCalls] = useState('semana');
  const [nuevo, setNuevo] = useState(false);
  const [m, setM] = useState(null);

  const lim = useMemo(() => limites(modo, ref, rango), [modo, ref, rango]);
  useEffect(() => {
    let vivo = true;
    getMetricasSetting({ ...lim, canal }).then((d) => vivo && setM(d)).catch(() => vivo && setM(null));
    return () => { vivo = false; };
  }, [lim, canal, tick]);

  const filtrados = useMemo(() => (canal ? pitches.filter((p) => p.canal === canal) : pitches), [pitches, canal]);
  const calls = useMemo(() => callsDe(filtrados, vistaCalls, hoy), [filtrados, vistaCalls, hoy]);
  const sinResolver = calls.filter((p) => p.sinResolver).length;
  const lunes = lunesDe(modo === 'hoy' || modo === 'semana' ? ref : hoy);
  const trackeo = useMemo(() => trackeoDe(filtrados, lunes), [filtrados, lunes]);
  const moverSemana = (n) => { setRef((r) => sumarDias(r, 7 * n)); if (modo !== 'semana' && modo !== 'hoy') setModo('semana'); };

  return (
    <>
      <div className="sets-barra">
        <div className="sets-periodo">
          <button type="button" className="btn ghost icon" onClick={() => moverSemana(-1)} aria-label="Semana anterior">‹</button>
          <span className="strong">{etiquetaPeriodo(modo, lim)}</span>
          <button type="button" className="btn ghost icon" onClick={() => moverSemana(1)} aria-label="Semana siguiente">›</button>
          {ref !== hoy && <button type="button" className="btn ghost sm" onClick={() => setRef(hoy)}>volver a hoy</button>}
        </div>
        <div className="tabs sm">
          {MODOS.map(([v, l]) => (
            <button key={v} type="button" className={`tab${modo === v ? ' active' : ''}`} onClick={() => setModo(v)}>{l}</button>
          ))}
        </div>
        {modo === 'rango' && (
          <span className="sets-rango">
            <input type="date" value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} />
            <span className="dim">a</span>
            <input type="date" value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} />
          </span>
        )}
        <button type="button" className="btn primary sets-mas" onClick={() => setNuevo(true)} title="Nuevo pitch">+ Pitch</button>
      </div>
      <div className="diag-filtros sets-filtros">
        {[['', 'Todos'], ...Object.entries(CANAL_LARGO)].map(([v, l]) => (
          <button key={v} type="button" className={`chip${canal === v ? ' activo' : ''}`} onClick={() => setCanal(v)}>
            {l} <span className="num">{v ? pitches.filter((p) => p.canal === v).length : pitches.length}</span>
          </button>
        ))}
      </div>

      <Card title="Tasas y embudo" sub={`Sobre los pitches de ${etiquetaPeriodo(modo, lim).toLowerCase()}`}>
        {!m ? <SkeletonBlock height={180} /> : <TasasEmbudo m={m} />}
      </Card>

      <Card
        title="Calendario de calls"
        sub={`${calls.length} ${calls.length === 1 ? 'call' : 'calls'} · ${sinResolver} sin resolver`}
        actions={(
          <div className="tabs sm">
            {VISTAS_CALLS.map(([v, l]) => (
              <button key={v} type="button" className={`tab${vistaCalls === v ? ' active' : ''}`} onClick={() => setVistaCalls(v)}>{l}</button>
            ))}
          </div>
        )}
        flush
        foot="Sin resolver: la fecha pasó y no se cargó qué fue. Ponele showed, no show o cancelada para que el show rate sea real."
      >
        {cargando && !pitches.length ? <SkeletonBlock height={160} /> : calls.length === 0 ? (
          <div className="empty">Sin calls en esta vista.</div>
        ) : (
          <div className="pitch-lista">
            {calls.map((p) => <FilaPitch key={p.id} p={p} modo="call" onCambiar={onCambiar} onBorrar={onBorrar} />)}
          </div>
        )}
      </Card>

      <Card
        title="Trackeo diario"
        sub={`Semana del ${fechaCorta(lunes)} · ${trackeo.reduce((a, d) => a + d.pitches.length, 0)} pitches · ${trackeo.reduce((a, d) => a + d.booked, 0)} booked`}
        flush
        foot="Cada pitch en el día que se mandó el link. Booked cuenta los que agendaron ese día, aunque el pitch sea anterior."
      >
        <div className="trackeo">
          {trackeo.map((d, i) => (
            <div key={d.fecha} className={`trackeo-dia${d.fecha === hoy ? ' hoy' : ''}`}>
              <div className="trackeo-cab">
                <span className="strong">{DIAS[i]} <span className="dim num">{fechaCorta(d.fecha)}</span></span>
                <span className="dim num">{d.pitches.length} pitches · {d.booked} booked</span>
              </div>
              {d.pitches.length === 0 ? <div className="dim trackeo-vacio">—</div> : (
                <div className="pitch-lista">
                  {d.pitches.map((p) => <FilaPitch key={p.id} p={p} modo="pitch" onCambiar={onCambiar} onBorrar={onBorrar} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {nuevo && <NuevoPitch hoy={hoy} onCrear={onCrear} onCerrar={() => setNuevo(false)} />}
    </>
  );
}
