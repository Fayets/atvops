import { useEffect, useMemo, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { getBackbone } from '../data/api.js';
import { BANDA_TEXTO, banda, DIAS_CORTOS, fechaCorta, sumarDias } from '../lib/daily.js';
import '../styles/daily.css';

const HW = 92;
const HH = 34;
const SLOT = 212;
const AREAS = [['ventas', 'VENTAS'], ['marketing', 'MARKETING'], ['producto', 'PRODUCTO'], ['sistemas', 'SISTEMAS']];

/**
 * El organigrama con lo que cada uno marcó en su daily. El color es el cumplimiento de
 * la semana a hoy; los cuadraditos, si guardó la daily cada día; las flechas, las tareas
 * que tienen destinatario (si no se hicieron, la flecha sale roja).
 */
export default function Backbone() {
  const [semana, setSemana] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [modo, setModo] = useState('cortes');
  const [sel, setSel] = useState(null);
  const [selEdge, setSelEdge] = useState(null);

  useEffect(() => {
    let vivo = true;
    getBackbone(semana).then((r) => vivo && (setData(r), setError(null))).catch((e) => vivo && setError(e));
    return () => { vivo = false; };
  }, [semana]);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') { setSel(null); setSelEdge(null); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  const layout = useMemo(() => (data ? armarLayout(data.personas) : null), [data]);

  if (error && !data) return <div className="page"><ErrorState error={error} /></div>;
  if (!data) return <div className="page"><SkeletonBlock height={520} /></div>;

  const conDaily = data.personas.filter((p) => p.daily);
  const cuenta = (b) => conDaily.filter((p) => banda(p.pct) === b).length;
  const hoyIdx = data.corte;
  const guardaronHoy = data.semana <= data.hoy && sumarDias(data.semana, 4) >= data.hoy
    ? conDaily.filter((p) => p.dias?.[hoyIdx]?.estado === 'ok' || p.dias?.[hoyIdx]?.estado === 'tarde').length : null;
  const actual = data.semana <= data.hoy && sumarDias(data.semana, 4) >= data.hoy;

  return (
    <div className="page">
      <PageHeader
        eyebrow={`Dirección · Backbone · semana del ${fechaCorta(data.semana)} al ${fechaCorta(sumarDias(data.semana, 4))}${actual ? ', a hoy' : ''}`}
        title="Cómo viene el equipo"
        desc="El color sale de las tareas que cada uno marcó en su daily. Clic en una persona para ver qué le faltó y por qué."
        actions={(
          <div className="dl-weeknav">
            <button type="button" className="btn ghost sm" onClick={() => { setSel(null); setSelEdge(null); setSemana(sumarDias(data.semana, -7)); }}>←</button>
            <button type="button" className="btn ghost sm" disabled={actual}
              onClick={() => { setSel(null); setSelEdge(null); setSemana(sumarDias(data.semana, 7)); }}>→</button>
          </div>
        )}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <Pill tone="ok">{cuenta('ok')} en verde</Pill>
        <Pill tone="warn">{cuenta('warn')} en ámbar</Pill>
        <Pill tone="alert">{cuenta('alert')} en rojo</Pill>
        {guardaronHoy != null && <Pill tone="off">Daily de hoy: {guardaronHoy}/{conDaily.length}</Pill>}
      </div>

      <div className="bb-grid">
        <Card flush>
          <div className="bb-bar">
            <div className="bb-seg" role="group" aria-label="Entregas visibles">
              {[['cortes', 'Solo cortes'], ['todas', 'Todas las entregas'], ['ninguna', 'Ninguna']].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={modo === k}
                  onClick={() => { setModo(k); setSel(null); setSelEdge(null); }}>{l}</button>
              ))}
            </div>
            <div className="bb-legend">
              <span><svg width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" stroke="currentColor" strokeWidth="1.4" /></svg>Entrega</span>
              <span><svg width="10" height="10" aria-hidden="true"><rect x="1" y="1" width="8" height="8" rx="2" fill="var(--ok)" /></svg>Daily a tiempo</span>
              <span><svg width="10" height="10" aria-hidden="true"><rect x="1" y="1" width="8" height="8" rx="2" fill="var(--warn)" /></svg>Cargada tarde</span>
              <span><svg width="10" height="10" aria-hidden="true"><rect x="1" y="1" width="8" height="8" rx="2" fill="var(--surface)" stroke="var(--alert)" /></svg>Sin daily</span>
            </div>
          </div>
          <Organigrama data={data} layout={layout} modo={modo} sel={sel} selEdge={selEdge}
            onSel={(u) => { setSel((s) => (s === u ? null : u)); setSelEdge(null); }}
            onEdge={(id) => setSelEdge(id)}
            onFondo={() => { setSel(null); setSelEdge(null); }} />
          <div className="bb-hint">Debajo de cada nombre, los cinco días de la semana. Esc para volver al equipo.</div>
        </Card>
        <Card flush className="bb-panel">
          <Panel data={data} sel={sel} selEdge={selEdge}
            onSel={(u) => { setSel(u); setSelEdge(null); }} onEdge={setSelEdge} />
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ layout */

/**
 * Juan arriba; Sistemas a su lado (es staff, cruza todas las áreas); debajo, sus
 * reportes directos agrupados por área, y debajo de cada uno, su equipo.
 */
function armarLayout(personas) {
  const raiz = personas.find((p) => !p.jefe) ?? personas[0];
  const directos = personas.filter((p) => p.jefe === raiz.username);
  const staff = directos.filter((p) => p.area === 'sistemas');
  const pos = {};
  const columnas = [];
  let slot = 0;
  for (const [area, label] of AREAS) {
    const l1 = directos.filter((p) => p.area === area && !staff.includes(p));
    if (!l1.length) continue;
    const inicio = slot;
    for (const p of l1) {
      const hijos = personas.filter((h) => h.jefe === p.username);
      const ancho = Math.max(1, hijos.length);
      pos[p.username] = { x: 40 + (slot + ancho / 2) * SLOT, y: 260 };
      hijos.forEach((h, i) => { pos[h.username] = { x: 40 + (slot + i + 0.5) * SLOT, y: 450 }; });
      slot += ancho;
    }
    columnas.push({ label, desde: inicio, hasta: slot });
  }
  // Los que no entraron en ninguna área conocida van al final.
  for (const p of personas) {
    if (p === raiz || pos[p.username] || staff.includes(p)) continue;
    pos[p.username] = { x: 40 + (slot + 0.5) * SLOT, y: 260 };
    slot += 1;
  }
  const ancho = Math.max(900, 80 + slot * SLOT);
  pos[raiz.username] = { x: ancho / 2, y: 70 };
  staff.forEach((p, i) => { pos[p.username] = { x: ancho / 2 + 340 + i * SLOT, y: 70 }; });
  const alto = Object.values(pos).some((p) => p.y === 450) ? 520 : 340;
  return { pos, columnas, ancho, alto, raiz: raiz.username, staff: staff.map((p) => p.username) };
}

function geom(e, todas, pos) {
  const k = [e.de, e.a].sort();
  const grp = todas.filter((o) => [o.de, o.a].sort().join() === k.join());
  const idx = grp.indexOf(e);
  const off = (idx - (grp.length - 1) / 2) * 11;
  const C0 = pos[k[0]];
  const C1 = pos[k[1]];
  const L = Math.hypot(C1.x - C0.x, C1.y - C0.y) || 1;
  const px = -(C1.y - C0.y) / L;
  const py = (C1.x - C0.x) / L;
  const A = { x: pos[e.de].x + px * off, y: pos[e.de].y + py * off };
  const B = { x: pos[e.a].x + px * off, y: pos[e.a].y + py * off };
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const tt = (g) => Math.min((HW + g) / Math.abs(ux || 1e-9), (HH + g) / Math.abs(uy || 1e-9));
  const s = { x: A.x + ux * tt(4), y: A.y + uy * tt(4) };
  const t = { x: B.x - ux * tt(8), y: B.y - uy * tt(8) };
  const f = grp.length > 1 ? 0.35 + (0.3 * idx) / (grp.length - 1) : 0.5;
  return { d: `M${s.x},${s.y} L${t.x},${t.y}`, mid: { x: s.x + (t.x - s.x) * f, y: s.y + (t.y - s.y) * f } };
}

const corto = (texto) => texto.replace(/ antes de las \d+:\d+| \(.*\)/g, '');

function Organigrama({ data, layout, modo, sel, selEdge, onSel, onEdge, onFondo }) {
  const [hov, setHov] = useState(null);
  const { pos, columnas, ancho, alto, raiz, staff } = layout;
  const entregas = data.entregas.filter((e) => pos[e.de] && pos[e.a]);
  let vis = [];
  if (selEdge != null) vis = entregas.filter((e) => e.id === selEdge);
  else if (sel) vis = entregas.filter((e) => e.de === sel || e.a === sel);
  else if (modo === 'cortes') vis = entregas.filter((e) => e.estado === 'alert' || e.estado === 'warn');
  else if (modo === 'todas') vis = entregas;
  const unidas = new Set(vis.flatMap((e) => [e.de, e.a]));
  const foco = sel || selEdge != null;
  const nivel1 = data.personas.filter((p) => p.jefe === raiz && !staff.includes(p.username));

  return (
    <div className="bb-chart">
      <svg viewBox={`0 0 ${ancho} ${alto}`} style={{ minWidth: Math.round(ancho * 0.72) }} role="img" aria-label="Organigrama con el cumplimiento de cada integrante" onClick={onFondo}>
        <defs>
          {['ok', 'warn', 'alert', 'off'].map((s) => (
            <marker key={s} id={`bb-ah-${s}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0,1 L9,5 L0,9 z" className={`bb-ah ${s}`} />
            </marker>
          ))}
          {data.personas.map((p) => pos[p.username] && (
            <clipPath key={p.username} id={`bb-c-${p.username}`}>
              <circle cx={pos[p.username].x - HW + 27} cy={pos[p.username].y - 6} r="15" />
            </clipPath>
          ))}
        </defs>
        {columnas.slice(1).map((c) => (
          <line key={c.label} className="divider" x1={40 + c.desde * SLOT} y1="190" x2={40 + c.desde * SLOT} y2={alto} />
        ))}
        {columnas.map((c) => (
          <text key={c.label} className="bandlbl" x={52 + c.desde * SLOT} y="200">{c.label}</text>
        ))}
        <g>
          {nivel1.map((p) => (
            <path key={p.username} className="tree" d={`M${pos[raiz].x},${pos[raiz].y + HH} V165 H${pos[p.username].x} V${pos[p.username].y - HH}`} />
          ))}
          {data.personas.filter((p) => p.jefe && p.jefe !== raiz && pos[p.jefe] && pos[p.username]).map((p) => (
            <path key={p.username} className="tree" d={`M${pos[p.jefe].x},${pos[p.jefe].y + HH} V${(pos[p.jefe].y + pos[p.username].y) / 2} H${pos[p.username].x} V${pos[p.username].y - HH}`} />
          ))}
          {staff.map((u) => (
            <path key={u} className="tree" d={`M${pos[raiz].x + HW},${pos[raiz].y} H${pos[u].x - HW}`} />
          ))}
        </g>
        <g>
          {vis.map((e) => {
            const { d } = geom(e, entregas, pos);
            const act = (ev) => { ev.stopPropagation(); onEdge(e.id); };
            return (
              <g key={e.id} className={`bb-edgeg${hov === e.id ? ' hov' : ''}`}>
                <path d={d} className={`bb-edge ${e.estado}`} markerEnd={`url(#bb-ah-${e.estado})`} />
                <path d={d} className="bb-hit" tabIndex={0} role="button"
                  aria-label={`${nombre(data, e.de)} a ${nombre(data, e.a)}: ${e.texto}`}
                  onClick={act} onKeyDown={(ev) => ev.key === 'Enter' && act(ev)}
                  onMouseEnter={() => setHov(e.id)} onMouseLeave={() => setHov(null)} />
              </g>
            );
          })}
        </g>
        <g>
          {vis.map((e) => {
            const mostrar = selEdge != null || hov === e.id || (sel && e.estado !== 'ok');
            if (!mostrar) return null;
            const { mid } = geom(e, entregas, pos);
            return <Etiqueta key={e.id} x={mid.x} y={mid.y} texto={corto(e.texto)} estado={e.estado} />;
          })}
        </g>
        <g>
          {data.personas.map((p) => {
            const c = pos[p.username];
            if (!c) return null;
            const b = p.daily ? banda(p.pct) : 'off';
            const dim = foco && !unidas.has(p.username) && sel !== p.username;
            const x0 = c.x - HW;
            const act = (ev) => { ev.stopPropagation(); onSel(p.username); };
            return (
              <g key={p.username} className={`bb-node ${b}${sel === p.username ? ' sel' : ''}${dim ? ' dim' : ''}`}
                tabIndex={0} role="button" aria-label={`${p.nombre}, ${p.cargo ?? ''}${p.pct != null ? `, ${p.pct}%` : ''}`}
                onClick={act} onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), act(ev))}>
                <rect className="cardr" x={x0} y={c.y - HH} width={HW * 2} height={HH * 2} rx="6" />
                <circle className="avbg" cx={x0 + 27} cy={c.y - 6} r="15" />
                {p.foto_url
                  ? <image href={p.foto_url} x={x0 + 12} y={c.y - 21} width="30" height="30" clipPath={`url(#bb-c-${p.username})`} preserveAspectRatio="xMidYMid slice" />
                  : <text className="ini" x={x0 + 27} y={c.y - 2} textAnchor="middle">{iniciales(p.nombre)}</text>}
                <text className="nm" x={x0 + 52} y={c.y - 9}>{p.nombre}</text>
                <text className="rl" x={x0 + 52} y={c.y + 7}>{recortar(p.cargo ?? '', 19)}</text>
                {p.daily && <text className="pct" x={c.x + HW - 12} y={c.y - 9} textAnchor="end">{p.pct == null ? '—' : `${p.pct}%`}</text>}
                {p.daily
                  ? p.dias.map((d, i) => (
                    <rect key={d.fecha} className={`dd ${d.estado}`} x={x0 + 52 + i * 13} y={c.y + 17} width="9" height="9" rx="2" />
                  ))
                  : <text className="rl" x={x0 + 52} y={c.y + 25}>Recibe las entregas</text>}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function Etiqueta({ x, y, texto, estado }) {
  const ancho = texto.length * 5.6 + 10;
  return (
    <g className={`bb-lbl ${estado}`} pointerEvents="none">
      <rect x={x - ancho / 2} y={y - 9} width={ancho} height="17" rx="3" />
      <text x={x} y={y + 3.5} textAnchor="middle">{texto}</text>
    </g>
  );
}

const iniciales = (n) => (n || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
const recortar = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const nombre = (data, u) => data.personas.find((p) => p.username === u)?.nombre ?? u;

/* ------------------------------------------------------------------ panel */

function Avatar({ p }) {
  return p.foto_url
    ? <img className="bb-av" src={p.foto_url} alt="" referrerPolicy="no-referrer" />
    : <div className="bb-av">{iniciales(p.nombre)}</div>;
}

const TONO = { ok: 'var(--ok)', warn: 'var(--warn)', alert: 'var(--alert)', off: 'var(--text-3)' };
const ESTADO_ENTREGA = { ok: 'Cumplió', warn: 'A medias', alert: 'Cortada', off: 'Pendiente' };

function Conexion({ e, otro, onEdge }) {
  return (
    <button type="button" className="bb-conn" onClick={() => onEdge(e.id)}>
      <span className="dot" style={{ color: TONO[e.estado] }} />
      <b style={{ fontWeight: 500 }}>{otro} · {corto(e.texto)}</b>
      <i>{ESTADO_ENTREGA[e.estado]}</i>
      <span>{e.nota}</span>
    </button>
  );
}

function diaDe(f) {
  if (!f) return 'Sem';
  const i = new Date(`${f}T12:00:00`).getDay() - 1;
  return DIAS_CORTOS[i] ?? '';
}

function Panel({ data, sel, selEdge, onSel, onEdge }) {
  const conDaily = data.personas.filter((p) => p.daily);
  if (selEdge != null) {
    const e = data.entregas.find((x) => x.id === selEdge);
    if (!e) return null;
    return (
      <>
        <button type="button" className="bb-back" onClick={() => onSel(sel)}>← {sel ? `Volver a ${nombre(data, sel)}` : 'Volver al equipo'}</button>
        <div className="bb-sec">
          <Pill tone={e.estado === 'off' ? 'off' : e.estado}>{ESTADO_ENTREGA[e.estado]}</Pill>
          <h3 style={{ margin: '6px 0 0', fontSize: 16 }}>{nombre(data, e.de)} → {nombre(data, e.a)}</h3>
          <p className="dl-vacio">{e.texto}</p>
        </div>
        <div className="bb-sec"><div className="bb-sech"><h3>Qué pasó</h3></div><p className="dl-vacio">{e.nota}</p></div>
      </>
    );
  }
  if (!sel) {
    const cortes = data.entregas.filter((e) => e.estado === 'alert');
    const ranking = [...conDaily].sort((a, b) => (a.pct ?? -1) - (b.pct ?? -1));
    return (
      <>
        <div className="bb-sec">
          <div className="bb-sech"><h3>Entregas cortadas</h3><span>{cortes.length}</span></div>
          {cortes.length
            ? cortes.map((e) => <Conexion key={e.id} e={e} otro={`${nombre(data, e.de)} → ${nombre(data, e.a)}`} onEdge={onEdge} />)
            : <p className="dl-vacio">Ninguna entrega cortada a hoy.</p>}
        </div>
        <div className="bb-sec">
          <div className="bb-sech"><h3>Cumplimiento</h3><span>de menor a mayor</span></div>
          <div className="bb-rank">
            {ranking.map((p) => (
              <button key={p.username} type="button" onClick={() => onSel(p.username)}>
                <span className="dot" style={{ color: TONO[banda(p.pct)] }} />
                <span><b style={{ fontWeight: 600 }}>{p.nombre}</b> <small>{p.cargo}</small></span>
                <span className="bb-mini">{p.dias.map((d) => <i key={d.fecha} className={d.estado} />)}</span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{p.pct == null ? '—' : `${p.pct}%`}</b>
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }
  const p = data.personas.find((x) => x.username === sel);
  if (!p) return null;
  const mias = data.entregas.filter((e) => e.de === sel || e.a === sel);
  if (!p.daily) {
    return (
      <>
        <div className="bb-ph"><Avatar p={p} /><div><h2>{p.nombre}</h2><p>{p.cargo} · no carga daily</p></div></div>
        <div className="bb-sec">
          <div className="bb-sech"><h3>Lo que le tiene que llegar</h3></div>
          {mias.length ? mias.map((e) => <Conexion key={e.id} e={e} otro={nombre(data, e.de)} onEdge={onEdge} />) : <p className="dl-vacio">Nada esta semana.</p>}
        </div>
      </>
    );
  }
  const b = banda(p.pct);
  return (
    <>
      <div className="bb-ph">
        <Avatar p={p} />
        <div><h2>{p.nombre}</h2><p>{p.cargo}</p></div>
        <div className={`bb-score ${b}`}><b>{p.pct == null ? '—' : `${p.pct}%`}</b><span>{BANDA_TEXTO[b]}</span></div>
      </div>
      <div className="bb-sec" style={{ borderTop: 0, paddingTop: 0 }}>
        <div className="bb-strip">
          {p.dias.map((d, i) => (
            <div key={d.fecha} className={d.estado}>
              <b>{DIAS_CORTOS[i]} {fechaCorta(d.fecha)}</b>
              {d.estado === 'futuro' ? '—' : d.estado === 'falta' ? '✕' : d.estado === 'tarde' ? `tarde` : d.hora}
            </div>
          ))}
        </div>
      </div>
      <div className="bb-sec">
        <div className="bb-sech"><h3>Le faltó</h3><span>{p.faltas.length}</span></div>
        {p.faltas.length ? p.faltas.map((f, i) => (
          <div className="bb-miss" key={i}>
            <em>{diaDe(f.fecha)}</em>
            <div>
              <b>{f.texto}</b>
              {f.sin_daily ? <span className="sin">No entró a cargar la daily ese día</span> : <span>{f.motivo}</span>}
            </div>
          </div>
        )) : <p className="dl-vacio">Nada. Cumplió todo lo que vencía hasta hoy.</p>}
      </div>
      {p.no_aplica.length > 0 && (
        <div className="bb-sec">
          <div className="bb-sech"><h3>Marcó "no aplica"</h3><span>{p.no_aplica.length}</span></div>
          {p.no_aplica.map((f, i) => (
            <div className="bb-miss" key={i}><em>{diaDe(f.fecha)}</em><div><b>{f.texto}</b><span>{f.motivo}</span></div></div>
          ))}
        </div>
      )}
      <div className="bb-sec">
        <div className="bb-sech"><h3>Desplazamiento</h3><span>{p.desplazamiento.filter((t) => t.hecha).length} de {p.desplazamiento.length}</span></div>
        {p.desplazamiento.length ? p.desplazamiento.map((t, i) => (
          <div className="bb-miss" key={i}>
            <em style={{ color: t.hecha ? 'var(--ok)' : 'var(--text-3)' }}>{t.hecha ? '✓' : '—'}</em>
            <div><b>{t.texto}</b><span>{t.hecha ? `Hecha el ${fechaCorta(t.hecha)}` : 'Abierta'}</span></div>
          </div>
        )) : <p className="dl-vacio">No sumó tareas de desplazamiento esta semana.</p>}
      </div>
      {mias.length > 0 && (
        <div className="bb-sec">
          <div className="bb-sech"><h3>Entregas</h3></div>
          {mias.map((e) => <Conexion key={e.id} e={e} otro={nombre(data, e.de === sel ? e.a : e.de)} onEdge={onEdge} />)}
        </div>
      )}
    </>
  );
}
