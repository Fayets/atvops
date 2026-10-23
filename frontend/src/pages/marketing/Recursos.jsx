import { useMemo, useState } from 'react';
import Card from '../../components/ui/Card.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Pill from '../../components/ui/Pill.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import EditorLanding from '../../components/marketing/EditorLanding.jsx';
import {
  crearRecurso, editarRecurso, getRecursos, guardarAjustesRecursos,
} from '../../data/api.js';
import { useResource } from '../../lib/hooks.js';
import '../../styles/recursos.css';

/**
 * Recursos de Juan: lo que regala en los reels ("comentá ONBOARDING").
 *
 * Uno está en la landing pública (recursos.atvos.io) y marketing elige si se descarga
 * directo o se pide por WhatsApp; el resto vive en la biblioteca y se pide siempre por WhatsApp.
 * El recorrido de cada uno junta los chats del reel (Instagram) con lo que mide la landing.
 */

const VISTAS = [{ value: 'landing', label: 'Landing' }, { value: 'metricas', label: 'Métricas' }, { value: 'biblioteca', label: 'Biblioteca' }];
const PERIODOS = [{ value: '7', label: '7 días' }, { value: '30', label: '30 días' }, { value: '90', label: '90 días' }];
const n = (v) => (v == null ? '—' : Number(v).toLocaleString('es-AR'));
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const corta = (iso) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}` : '');
const entregados = (m) => m.descargas + m.whatsapp;

function Spark({ serie }) {
  const w = 72, h = 22;
  const mx = Math.max(...serie, 1);
  const pts = serie.map((v, i) => [(i / Math.max(serie.length - 1, 1)) * w, h - 1.5 - (v / mx) * (h - 4)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1] || [0, h];
  return (
    <svg className="rec-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`${d} L${w} ${h} L0 ${h}Z`} fill="var(--s1)" fillOpacity="0.07" />
      <path d={d} fill="none" stroke="var(--s1)" strokeWidth="1.3" />
      <circle cx={lx} cy={ly} r="2" fill="var(--s1)" />
    </svg>
  );
}

/** Chats (barras) y visitas (línea) por día, a la misma escala. */
function Diario({ chats, visitas, desde, hasta }) {
  const W = 340, H = 120, pl = 24, pb = 18, pt = 8;
  const mx = Math.max(...chats, ...visitas, 1);
  const top = Math.max(5, Math.ceil(mx / 5) * 5);
  const y = (v) => pt + (H - pt - pb) * (1 - v / top);
  const bw = (W - pl) / chats.length;
  const linea = visitas.map((v, i) => `${i ? 'L' : 'M'}${(pl + i * bw + bw / 2).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Chats y visitas por día">
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line x1={pl} x2={W} y1={y(v)} y2={y(v)} stroke="var(--border-soft)" />
            <text x={pl - 5} y={y(v) + 3.5} textAnchor="end" fontSize="9" fill="var(--text-3)">{v}</text>
          </g>
        ))}
        {chats.map((v, i) => (v ? (
          <rect key={i} x={pl + i * bw + 1} y={y(v)} width={Math.max(bw - 2, 1)} height={H - pb - y(v)} rx="1.5" fill="var(--s3)" />
        ) : null))}
        <path d={linea} fill="none" stroke="var(--s2)" strokeWidth="1.6" />
        <text x={pl} y={H - 4} fontSize="9" fill="var(--text-3)">{corta(desde)}</text>
        <text x={W} y={H - 4} textAnchor="end" fontSize="9" fill="var(--text-3)">{corta(hasta)}</text>
      </svg>
      <div className="rec-leyenda"><span><i style={{ background: 'var(--s3)' }} />Chats</span><span><i style={{ background: 'var(--s2)' }} />Visitas</span></div>
    </div>
  );
}

function Recorrido({ r }) {
  const m = r.metricas;
  const pasos = [
    ['Chats', m.chats], ['Visitas', m.visitas], ['Play', m.play], ['Vieron +50%', m.p50],
    [r.destacado && r.entrega === 'regalo' ? 'Descargas' : 'Entregados', entregados(m)],
  ];
  const mx = Math.max(...pasos.map((p) => p[1]), 1);
  return (
    <div className="rec-funnel">
      {pasos.map(([label, v], i) => (
        <div className="rec-fr" key={label}>
          <span className="dim">{label}</span>
          <span className="rec-track"><i style={{ width: `${Math.max(2, (v / mx) * 100)}%`, opacity: 1 - i * 0.13 }} /></span>
          <span className="num strong">{n(v)}</span>
        </div>
      ))}
    </div>
  );
}

const VACIO = { palabra: '', titulo: '', titular: '', tema: '', gancho: '', videoUrl: '', duracion: '', link: '', reelId: '', activo: true };

function Editor({ recurso, reels, onClose, onGuardado }) {
  const nuevo = !recurso?.id;
  const [f, setF] = useState(() => ({ ...VACIO, ...Object.fromEntries(Object.entries(recurso || {}).map(([k, v]) => [k, v ?? ''])) }));
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    setOcupado(true); setError('');
    const datos = Object.fromEntries(Object.keys(VACIO).map((k) => [k, f[k]]));
    try {
      if (nuevo) await crearRecurso(datos); else await editarRecurso(recurso.id, datos);
      onGuardado(); onClose();
    } catch (err) {
      setError(err.message); setOcupado(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={nuevo ? 'Nuevo recurso' : recurso.palabra}>
      <form className="rec-form rec-editor" onSubmit={guardar}>
        <div className="rec-dos izq">
          <label className="campo"><span>Palabra</span><input value={f.palabra} onChange={set('palabra')} required /></label>
          <label className="campo"><span>Título</span><input value={f.titulo} onChange={set('titulo')} required /></label>
        </div>
        <label className="campo"><span>Titular de la landing · lo que va entre *asteriscos* sale en rojo</span>
          <input value={f.titular} onChange={set('titular')} placeholder="Cómo hago *$2M al año* trabajando solo 4h/día" />
        </label>
        <div className="rec-dos">
          <label className="campo"><span>Texto sobre la miniatura</span><input value={f.gancho} onChange={set('gancho')} placeholder="2 llamadas = $200k" /></label>
          <label className="campo"><span>Tema</span><input value={f.tema} onChange={set('tema')} placeholder="Ventas" /></label>
        </div>
        <div className="rec-dos der">
          <label className="campo"><span>Video</span><input value={f.videoUrl} onChange={set('videoUrl')} /></label>
          <label className="campo"><span>Duración</span><input value={f.duracion} onChange={set('duracion')} /></label>
        </div>
        <label className="campo"><span>Link del recurso</span><input value={f.link} onChange={set('link')} /></label>
        <label className="campo"><span>Reel</span>
          <select value={f.reelId} onChange={(e) => {
            const r = reels.find((x) => x.id === e.target.value);
            setF((x) => ({ ...x, reelId: e.target.value, palabra: x.palabra || (r?.palabra || '').toUpperCase() }));
          }}>
            <option value="">Sin reel</option>
            {recurso?.reel && <option value={recurso.reel.id}>{corta(recurso.reel.fecha)} · {recurso.palabra}</option>}
            {reels.map((r) => <option key={r.id} value={r.id}>{corta(r.fecha)} · {r.palabra.toUpperCase()} · {(r.caption || '').slice(0, 60)}</option>)}
          </select>
        </label>
        <label className="rec-check"><input type="checkbox" checked={!!f.activo} onChange={set('activo')} /> Se ve en la biblioteca</label>
        {error && <p className="rec-msg alert">{error}</p>}
        <div className="rec-acciones">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}

function Ajustes({ ajustes, onClose, onGuardado }) {
  const [f, setF] = useState(ajustes);
  const [error, setError] = useState('');
  async function guardar(e) {
    e.preventDefault();
    try { await guardarAjustesRecursos(f); onGuardado(); onClose(); } catch (err) { setError(err.message); }
  }
  return (
    <Modal open onClose={onClose} title="WhatsApp de los pedidos">
      <form className="rec-form rec-editor" onSubmit={guardar}>
        <label className="campo"><span>Número</span><input value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></label>
        <label className="campo"><span>Mensaje</span><input value={f.mensaje} onChange={(e) => setF({ ...f, mensaje: e.target.value })} /></label>
        {error && <p className="rec-msg alert">{error}</p>}
        <div className="rec-acciones">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Recursos() {
  const [vista, setVista] = useState('landing');
  const [dias, setDias] = useState('30');
  const [version, setVersion] = useState(0);
  const { data, loading, error } = useResource(() => getRecursos(dias), [dias, version]);
  const [sel, setSel] = useState(null);
  const [editando, setEditando] = useState(null);
  const [ajustes, setAjustes] = useState(false);
  const recargar = () => setVersion((v) => v + 1);

  const recursos = useMemo(() => data?.recursos || [], [data]);
  const elegido = recursos.find((r) => r.id === sel) || recursos[0];

  const tot = useMemo(() => recursos.reduce((a, r) => {
    const m = r.metricas;
    a.chats += m.chats; a.visitas += m.visitas; a.play += m.play; a.p50 += m.p50;
    a.descargas += m.descargas; a.whatsapp += m.whatsapp;
    if (!r.destacado) a.chatsViejos += m.chats;
    return a;
  }, { chats: 0, visitas: 0, play: 0, p50: 0, descargas: 0, whatsapp: 0, chatsViejos: 0 }), [recursos]);

  if (loading && !data) return <div className="page"><SkeletonBlock height={420} /></div>;
  if (error && !data) return <div className="page"><ErrorState error={error} /></div>;

  return (
    <div className="page rec">
      <header className="page-head">
        <Tabs value={vista} onChange={setVista} options={VISTAS} />
        <div className="page-head-actions">
          {vista === 'metricas' && <Tabs value={dias} onChange={setDias} options={PERIODOS} />}
          <button type="button" className="btn" onClick={() => setAjustes(true)}>WhatsApp</button>
          <button type="button" className="btn primary" onClick={() => setEditando({})}>Nuevo recurso</button>
        </div>
      </header>

      {vista === 'landing' && <EditorLanding recursos={recursos.filter((r) => r.activo || r.destacado)} onPublicado={recargar} />}

      {vista === 'biblioteca' && (
        <Card title="Biblioteca" flush>
          <div className="rec-tabla">
            <table className="data">
              <thead><tr><th>Recurso</th><th>Tema</th><th>Reel</th><th>Entrega</th><th>Dónde</th><th /></tr></thead>
              <tbody>
                {recursos.map((r) => (
                  <tr key={r.id} className={r.activo ? '' : 'rec-off'}>
                    <td><div className="rec-nombre"><b>{r.palabra}</b><span className="dim">{r.titulo}</span></div></td>
                    <td className="dim">{r.tema || '—'}</td>
                    <td className="dim num">{r.reel ? corta(r.reel.fecha) : '—'}</td>
                    <td className="dim">{r.destacado ? (r.entrega === 'regalo' ? 'Se descarga' : 'WhatsApp') : 'WhatsApp'}</td>
                    <td>{r.destacado ? <Pill tone="info" dot>Landing</Pill> : r.activo ? <Pill tone="plain">Biblioteca</Pill> : <Pill tone="off">Oculto</Pill>}</td>
                    <td className="right">
                      {!r.destacado && (
                        <button type="button" className="btn ghost" onClick={() => editarRecurso(r.id, { activo: !r.activo }).then(recargar)}>
                          {r.activo ? 'Ocultar' : 'Mostrar'}
                        </button>
                      )}
                      <button type="button" className="btn ghost" onClick={() => setEditando(r)}>Editar</button>
                    </td>
                  </tr>
                ))}
                {!recursos.length && <tr><td colSpan={6} className="dim rec-vacio">Todavía no hay reels con palabra. Cuando alguien comente la de un reel, el recurso aparece acá solo.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {vista === 'metricas' && (<>
      <section className="rec-kpis card">
        <div><span className="kpi-label">Chats por palabra</span><span className="rec-v num">{n(tot.chats)}</span><span className="dim">{n(tot.chatsViejos)} de recursos de la biblioteca</span></div>
        <div><span className="kpi-label">Visitas</span><span className="rec-v num">{n(tot.visitas)}</span><span className="dim">{pct(tot.visitas, tot.chats)} de los chats</span></div>
        <div><span className="kpi-label">Vieron más de la mitad</span><span className="rec-v num">{n(tot.p50)}</span><span className="dim">{pct(tot.p50, tot.play)} de los que dieron play</span></div>
        <div><span className="kpi-label">Entregados</span><span className="rec-v num">{n(tot.descargas + tot.whatsapp)}</span><span className="dim">{n(tot.descargas)} descargas · {n(tot.whatsapp)} por WhatsApp</span></div>
      </section>

      <div className="rec-grid">
        <Card title="Por recurso" flush>
          <div className="rec-tabla">
            <table className="data">
              <thead>
                <tr>
                  <th>Recurso</th><th className="right">Chats</th><th>Por día</th><th className="right">Visitas</th>
                  <th className="right">Play</th><th className="right">+50%</th><th className="right">Descargas</th>
                  <th className="right">WhatsApp</th><th>Dónde</th>
                </tr>
              </thead>
              <tbody>
                {recursos.map((r) => {
                  const m = r.metricas;
                  return (
                    <tr key={r.id} className={`clickable${elegido?.id === r.id ? ' rec-sel' : ''}${r.activo ? '' : ' rec-off'}`} onClick={() => setSel(r.id)}>
                      <td><div className="rec-nombre"><b>{r.palabra}</b><span className="dim">{r.titulo}</span></div></td>
                      <td className="right num">{n(m.chats)}</td>
                      <td><Spark serie={r.serieChats} /></td>
                      <td className="right num">{n(m.visitas)}</td>
                      <td className="right num">{n(m.play)}</td>
                      <td className="right num">{pct(m.p50, m.play)}</td>
                      <td className="right num">{m.descargas ? n(m.descargas) : '—'}</td>
                      <td className="right num">{m.whatsapp ? n(m.whatsapp) : '—'}</td>
                      <td>{r.destacado ? <Pill tone="info" dot>Landing</Pill> : r.activo ? <Pill tone="plain">Biblioteca</Pill> : <Pill tone="off">Oculto</Pill>}</td>
                    </tr>
                  );
                })}
                {!recursos.length && (
                  <tr><td colSpan={9} className="dim rec-vacio">Todavía no hay reels con palabra. Cuando alguien comente la de un reel, el recurso aparece acá solo.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="rec-lado">
          {elegido && (
            <Card
              title={elegido.titulo}
              actions={<button type="button" className="btn ghost" onClick={() => setEditando(elegido)}>Editar</button>}
            >
              <div className="rec-detalle">
                <Recorrido r={elegido} />
                <Diario chats={elegido.serieChats} visitas={elegido.serieVisitas} desde={data.desde} hasta={data.hasta} />
                <div className="rec-meta dim">
                  {elegido.reel ? (
                    <>
                      Reel del {corta(elegido.reel.fecha)} · {n(elegido.reel.vistas)} vistas · {n(elegido.reel.comentarios)} comentarios
                      {elegido.reel.permalink && <> · <a href={elegido.reel.permalink} target="_blank" rel="noreferrer">Ver reel</a></>}
                    </>
                  ) : 'Sin reel asociado'}
                  <br />
                  {n(elegido.metricas.chatsTotal)} chats desde que salió · visitas {n(elegido.metricas.visitasLanding)} landing / {n(elegido.metricas.visitasBiblioteca)} biblioteca
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
      </>)}

      {editando && <Editor recurso={editando} reels={data.reelsSinRecurso || []} onClose={() => setEditando(null)} onGuardado={recargar} />}
      {ajustes && <Ajustes ajustes={data.ajustes} onClose={() => setAjustes(false)} onGuardado={recargar} />}
    </div>
  );
}
