import { useEffect, useMemo, useState } from 'react';
import Card from '../ui/Card.jsx';
import { SkeletonBlock } from '../ui/Loading.jsx';
import FilaPitch from './FilaPitch.jsx';
import NuevoPitch from './NuevoPitch.jsx';
import TasasEmbudo from './TasasEmbudo.jsx';
import { getMetricasSetting } from '../../data/api.js';
import {
  CANAL_LARGO, callsDe, diaMes, diaSemana, etiquetaPeriodo, iso, limites, lunesDe, porDia, sumarDias, trackeoDe,
} from '../../lib/setting.js';

const MODOS = [['hoy', 'Hoy'], ['mes', 'Este mes'], ['todo', 'Todo'], ['rango', 'Rango']];
const VISTAS_CALLS = [['hoy', 'Hoy'], ['semana', 'Semana'], ['proximas', 'Próximas'], ['todas', 'Todas']];

/**
 * La pestaña Sets: el período, las tasas, el calendario de calls y el trackeo diario.
 *
 * Es la pantalla donde el setter trabaja todos los días: mira qué calls tiene, carga lo
 * que pasó con las de ayer y agrega los pitches del día. Por eso todo se edita en la
 * misma fila, sin abrir formularios.
 */
export default function Sets({ pitches, hoy, cargando, tick, onCambiar, onCrear, onBorrar }) {
  const [modo, setModo] = useState('semana');
  const [ref, setRef] = useState(hoy);
  const [rango, setRango] = useState({ desde: '', hasta: '' });
  const [canal, setCanal] = useState('');
  const [vistaCalls, setVistaCalls] = useState('semana');
  const [nuevo, setNuevo] = useState(false);
  const [plegados, setPlegados] = useState({});
  const [m, setM] = useState(null);

  const lim = useMemo(() => limites(modo, ref, rango), [modo, ref, rango]);
  useEffect(() => {
    let vivo = true;
    setM(null);
    getMetricasSetting({ ...lim, canal }).then((d) => vivo && setM(d)).catch(() => vivo && setM(null));
    return () => { vivo = false; };
  }, [lim, canal, tick]);

  const filtrados = useMemo(() => (canal ? pitches.filter((p) => p.canal === canal) : pitches), [pitches, canal]);
  const lunes = lunesDe(modo === 'todo' || modo === 'rango' ? hoy : ref);
  const calls = useMemo(() => callsDe(filtrados, vistaCalls, hoy, lunes), [filtrados, vistaCalls, hoy, lunes]);
  const sinResolver = calls.filter((p) => p.sinResolver).length;
  const trackeo = useMemo(() => trackeoDe(filtrados, lunes, hoy), [filtrados, lunes, hoy]);
  // Las flechas son la semana: mover una semana vuelve a ese modo aunque estés en otro.
  const mover = (n) => {
    setModo('semana');
    setRef((r) => sumarDias(r, 7 * n));
  };

  return (
    <>
      <div className="sets-barra">
        <div className="sets-periodo">
          <button type="button" className="btn ghost icon" onClick={() => mover(-1)} aria-label="Semana anterior">◀</button>
          <span className="strong">{etiquetaPeriodo(modo === 'semana' ? 'semana' : modo, lim)}</span>
          <button type="button" className="btn ghost icon" onClick={() => mover(1)} aria-label="Semana siguiente">▶</button>
        </div>
        <div className="tabs sm">
          {MODOS.map(([v, l]) => (
            <button key={v} type="button" className={`tab${modo === v ? ' active' : ''}`}
              onClick={() => { setModo(v); if (v === 'hoy') setRef(hoy); }}>{l}</button>
          ))}
        </div>
        {modo === 'rango' && (
          <span className="sets-rango">
            <input type="date" value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} />
            <span className="dim">a</span>
            <input type="date" value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} />
          </span>
        )}
        <button type="button" className="btn primary sets-mas" onClick={() => setNuevo(true)}>+ Pitch</button>
      </div>

      <div className="diag-filtros sets-filtros">
        {[['', 'Todos'], ...Object.entries(CANAL_LARGO)].map(([v, l]) => (
          <button key={v} type="button" className={`chip${canal === v ? ' activo' : ''}`} onClick={() => setCanal(v)}>
            {l} <span className="num">{v ? pitches.filter((p) => p.canal === v).length : pitches.length}</span>
          </button>
        ))}
      </div>

      <Card>
        {!m ? <SkeletonBlock height={220} /> : <TasasEmbudo m={m} />}
      </Card>

      <Card
        title="Calendario de calls"
        actions={(
          <div className="tabs sm">
            {VISTAS_CALLS.map(([v, l]) => (
              <button key={v} type="button" className={`tab${vistaCalls === v ? ' active' : ''}`}
                onClick={() => setVistaCalls(v)}>{l}</button>
            ))}
          </div>
        )}
        flush
        foot={`${calls.length} ${calls.length === 1 ? 'call' : 'calls'} · ${sinResolver} sin resolver`}
      >
        {cargando && !pitches.length ? <SkeletonBlock height={160} /> : calls.length === 0 ? (
          <div className="empty">Sin calls en esta vista.</div>
        ) : (
          <div className="calls-dias">
            {porDia(calls).map(({ fecha, items }) => (
              <div key={fecha} className={`calls-dia${fecha === hoy ? ' hoy' : ''}`}>
                <div className="calls-fecha">
                  <span className="calls-semana">{diaSemana(fecha)}</span>
                  <span className="calls-num">{diaMes(fecha)}</span>
                </div>
                <div className="pitch-lista">
                  {items.map((p) => <FilaPitch key={p.id} p={p} modo="call" onCambiar={onCambiar} onBorrar={onBorrar} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Trackeo diario"
        sub={`Semana del ${diaMes(lunes)} · ${trackeo.reduce((a, d) => a + d.pitches.length, 0)} pitches · ${trackeo.reduce((a, d) => a + d.booked, 0)} booked`}
        flush
        foot="Cada pitch en el día que se mandó el link. Booked son los de ese día que terminaron agendando, aunque hayan agendado al otro día."
      >
        <div className="trackeo">
          {trackeo.map((d) => {
            const plegado = plegados[d.fecha] ?? d.pitches.length === 0;
            return (
              <div key={d.fecha} className={`trackeo-dia${d.esHoy ? ' hoy' : ''}`}>
                <button type="button" className="trackeo-cab"
                  onClick={() => setPlegados((v) => ({ ...v, [d.fecha]: !plegado }))}
                  aria-expanded={!plegado}>
                  <span className="trackeo-flecha">{plegado ? '▸' : '▾'}</span>
                  <span className="trackeo-nombre">{diaSemana(d.fecha)} {diaMes(d.fecha)}</span>
                  {d.esHoy && <span className="chip">hoy</span>}
                  <span className="trackeo-cuentas dim">
                    <span>pitches <b className="num">{d.pitches.length}</b></span>
                    <span>booked <b className="num">{d.booked}</b></span>
                  </span>
                </button>
                {!plegado && d.pitches.length > 0 && (
                  <div className="pitch-lista">
                    {d.pitches.map((p) => <FilaPitch key={p.id} p={p} modo="pitch" onCambiar={onCambiar} onBorrar={onBorrar} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {nuevo && <NuevoPitch hoy={hoy} onCrear={onCrear} onCerrar={() => setNuevo(false)} />}
    </>
  );
}
