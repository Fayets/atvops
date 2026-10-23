import { useEffect, useMemo, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
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
  const [modo, setModo] = useState('ninguna');
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

  const actual = data.semana <= data.hoy && sumarDias(data.semana, 4) >= data.hoy;
  const futura = data.semana > data.hoy;
  const cerrar = () => { setSel(null); setSelEdge(null); };

  return (
    <div className="page">
      <Card flush>
        <div className="bb-bar">
          <div className="dl-weeknav">
            <button type="button" className="btn ghost sm" disabled={data.semana <= data.inicio} aria-label="Semana anterior"
              onClick={() => { cerrar(); setSemana(sumarDias(data.semana, -7)); }}>←</button>
            <b>Semana del {fechaCorta(data.semana)} al {fechaCorta(sumarDias(data.semana, 4))}</b>
            <button type="button" className="btn ghost sm" disabled={actual || futura} aria-label="Semana siguiente"
              onClick={() => { cerrar(); setSemana(sumarDias(data.semana, 7)); }}>→</button>
          </div>
          <div className="bb-seg" role="group" aria-label="Flechas de entregas">
            {[['ninguna', 'Sin flechas'], ['todas', 'Ver entregas']].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={modo === k}
                onClick={() => { setModo(k); cerrar(); }}>{l}</button>
            ))}
          </div>
          <div className="bb-legend">
            <span><svg width="10" height="10" aria-hidden="true"><rect x="1" y="1" width="8" height="8" rx="2" fill="var(--ok)" /></svg>Daily guardada</span>
            <span><svg width="10" height="10" aria-hidden="true"><rect x="1" y="1" width="8" height="8" rx="2" fill="var(--surface)" stroke="var(--alert)" /></svg>Sin daily</span>
          </div>
        </div>
        <Organigrama data={data} layout={layout} modo={modo} sel={sel} selEdge={selEdge}
          onSel={(u) => { setSel(u); setSelEdge(null); }}
          onEdge={(id) => setSelEdge(id)}
          onFondo={cerrar} />
        <div className="bb-hint">Debajo de cada nombre, los cinco días de la semana. Clic en una persona para ver su detalle.</div>
      </Card>

      {(sel || selEdge != null) && (
        <div className="bb-velo" onClick={cerrar} role="presentation">
          <aside className="bb-drawer" role="dialog" aria-label="Detalle" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="bb-cerrar" onClick={cerrar} aria-label="Cerrar detalle">✕</button>
            <Panel data={data} sel={sel} selEdge={selEdge}
              onSel={(u) => { setSel(u); setSelEdge(null); }} onEdge={setSelEdge} />
          </aside>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ layout */

/**
 * Juan arriba; Sistemas a su lado (es staff, cruza todas las áreas); debajo, sus
 * reportes directos agrupados por área, y debajo de cada uno, su equipo.
 */
/** Una persona puede responder a dos (Janner a Maite y a Ignacio): `jefe` viene "a,b". */
const jefesDe = (p) => (p.jefe ?? '').split(',').filter(Boolean);
const reportaA = (p, u) => jefesDe(p).includes(u);

function armarLayout(personas) {
  const raiz = personas.find((p) => !p.jefe) ?? personas[0];
  const directos = personas.filter((p) => reportaA(p, raiz.username));
  const staff = directos.filter((p) => p.area === 'sistemas');
  const pos = {};
  const columnas = [];
  let slot = 0;
  for (const [area, label] of AREAS) {
    const l1 = directos.filter((p) => p.area === area && !staff.includes(p));
    if (!l1.length) continue;
    const inicio = slot;
    const compartidos = [];
    for (const p of l1) {
      const todos = personas.filter((h) => reportaA(h, p.username));
      const hijos = todos.filter((h) => jefesDe(h).length === 1);
      todos.filter((h) => jefesDe(h).length > 1 && !compartidos.includes(h)).forEach((h) => compartidos.push(h));
      const ancho = Math.max(1, hijos.length);
      pos[p.username] = { x: 40 + (slot + ancho / 2) * SLOT, y: 260 };
      hijos.forEach((h, i) => { pos[h.username] = { x: 40 + (slot + i + 0.5) * SLOT, y: 450 }; });
      slot += ancho;
    }
    // Quien responde a dos va centrado debajo de ambos.
    compartidos.forEach((h, i) => {
      const xs = jefesDe(h).map((j) => pos[j]?.x).filter((x) => x != null);
      if (xs.length) pos[h.username] = { x: xs.reduce((a, b) => a + b, 0) / xs.length + i * SLOT, y: 450 };
    });
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
  const nivel1 = data.personas.filter((p) => reportaA(p, raiz) && !staff.includes(p.username));

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
          {data.personas.flatMap((p) => jefesDe(p).filter((j) => j !== raiz && pos[j] && pos[p.username]).map((j) => (
            <path key={`${j}-${p.username}`} className="tree" d={`M${pos[j].x},${pos[j].y + HH} V${(pos[j].y + pos[p.username].y) / 2} H${pos[p.username].x} V${pos[p.username].y - HH}`} />
          )))}
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
  if (!sel) return null;
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
              {d.estado === 'futuro' ? '—' : d.estado === 'falta' ? '✕' : d.hora}
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
      <SemanaCompleta p={p} motivos={data.motivos} />
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

const CELDA = { hecha: ['✓', 'ok'], no: ['✕', 'alert'], no_aplica: ['–', 'off'] };

/** La semana entera de una persona: cada tarea, día por día, con el motivo al pasar el mouse. */
function SemanaCompleta({ p, motivos }) {
  if (!p.tareas?.length) return null;
  const fechas = p.dias.map((d) => d.fecha);
  const fila = (t, i) => {
    const abierta = t.frecuencia === 'mensual' || (t.frecuencia === 'semanal' && t.dia == null);
    return (
      <tr key={i}>
        <th scope="row">
          <span>{t.texto}</span>
          <small>{t.tipo === 'desplazamiento' ? 'Desplazamiento' : t.origen === 'rol' ? 'Rol' : 'Velocidad'}{abierta ? ' · en la semana' : ''}</small>
        </th>
        {fechas.map((f, d) => {
          const m = t.marcas[f];
          const vence = t.frecuencia === 'diaria' || (t.frecuencia === 'semanal' && t.dia === d);
          const futuro = p.dias[d].estado === 'futuro';
          if (m) {
            const [txt, tono] = CELDA[m.estado];
            return <td key={f} className={tono} title={m.motivo ?? undefined}>{txt}</td>;
          }
          if (!vence || futuro) return <td key={f} className="vacio" />;
          return <td key={f} className="falta" title="Sin marcar">·</td>;
        })}
      </tr>
    );
  };
  return (
    <div className="bb-sec">
      <div className="bb-sech"><h3>Semana completa</h3>{motivos && <span>pasá el mouse para ver el motivo</span>}</div>
      <div className="bb-tabla">
        <table>
          <thead>
            <tr><th scope="col">Tarea</th>{p.dias.map((d, i) => <th key={d.fecha} scope="col">{DIAS_CORTOS[i]}</th>)}</tr>
          </thead>
          <tbody>{p.tareas.map(fila)}</tbody>
        </table>
      </div>
    </div>
  );
}
