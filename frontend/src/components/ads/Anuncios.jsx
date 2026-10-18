import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAnuncioMeta, getAnunciosMeta } from '../../data/api.js';
import { formatValue } from '../../lib/format.js';
import { ErrorState, SkeletonBlock } from '../ui/Loading.jsx';
import Pill from '../ui/Pill.jsx';

const TONO = { corriendo: 'ok', 'con problemas': 'warn', 'en revisión': 'warn', pausado: 'off', rechazado: 'alert' };
const VISIBLES = 12; // el resto con "Ver los N": que la lista no tape el resto de Ads
const usd = (n) => formatValue(n ?? 0, 'usd');
const num = (n) => formatValue(n ?? 0, 'count');

/**
 * Los anuncios de Meta, uno por uno. Primero se ve qué está corriendo; al tocar uno se abren
 * sus números del mes, día por día, y los de toda su vida.
 */
export default function Anuncios({ mes, mesLabel }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState(null);
  const [sel, setSel] = useState(null);
  const [todos, setTodos] = useState(false);
  const cerrar = useCallback(() => setSel(null), []);

  useEffect(() => {
    let vivo = true;
    setData(null);
    getAnunciosMeta(mes).then((r) => vivo && (setData(r), setError(null))).catch((e) => vivo && setError(e));
    return () => { vivo = false; };
  }, [mes]);

  const grupos = useMemo(() => {
    const a = data?.anuncios ?? [];
    return [
      ['corriendo', 'Corriendo', a.filter((x) => x.estado === 'corriendo')],
      ['gasto', `Con gasto en ${mesLabel}`, a.filter((x) => x.gastoUsd > 0)],
      ['problemas', 'Con problemas o en revisión', a.filter((x) => x.estado === 'con problemas' || x.estado === 'en revisión')],
      ['pausado', 'Pausados', a.filter((x) => x.estado === 'pausado')],
      ['rechazado', 'Rechazados', a.filter((x) => x.estado === 'rechazado')],
      ['todos', 'Todos', a],
    ].filter(([k, , l]) => l.length || k === 'corriendo');
  }, [data, mesLabel]);

  if (error && !data) return <ErrorState error={error} />;
  if (!data) return <SkeletonBlock height={260} />;

  // Abre en lo que corre; si no corre nada, en todos.
  const activo = filtro ?? (grupos.find(([k]) => k === 'corriendo')[2].length ? 'corriendo' : 'todos');
  const lista = grupos.find(([k]) => k === activo)?.[2] ?? [];

  return (
    <section className="ads-anuncios">
      <div className="ads-anuncios-cab">
        <h2>Anuncios</h2>
        <div className="ads-chips" role="group" aria-label="Qué anuncios ver">
          {grupos.map(([k, label, l]) => (
            <button key={k} type="button" className={`chip${activo === k ? ' active' : ''}`} aria-pressed={activo === k} onClick={() => { setFiltro(k); setTodos(false); }}>
              {label} <span className="dim num">{l.length}</span>
            </button>
          ))}
        </div>
      </div>
      {lista.length === 0 ? (
        <div className="card lab-vacio">
          <h3>No hay anuncios corriendo ahora</h3>
          <p className="dim">Todos los anuncios de la cuenta están pausados o rechazados. Mirá "Todos" para ver cómo les fue.</p>
        </div>
      ) : (
        <div className="ads-grilla">
          {(todos ? lista : lista.slice(0, VISIBLES)).map((a) => (
            <button key={a.id} type="button" className="card ads-card" onClick={() => setSel(a.id)}>
              <span className="ads-foto">{a.imagen ? <img src={a.imagen} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="aud-reel-sin">Anuncio</span>}</span>
              <span className="ads-txt">
                <span className="ads-fila"><b>{a.nombre}</b><Pill tone={TONO[a.estado] ?? 'off'} dot>{a.estado}</Pill></span>
                <span className="dim ads-camp">{a.campania}</span>
                <span className="ads-nums num">
                  <span><b>{usd(a.gastoUsd)}</b> gasto</span>
                  <span><b>{a.leads}</b> leads</span>
                  <span><b>{a.leads ? usd(a.cplUsd) : '—'}</b> CPL</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {lista.length > VISIBLES && (
        <button type="button" className="btn ghost ads-mas" onClick={() => setTodos((v) => !v)}>
          {todos ? 'Ver menos' : `Ver los ${lista.length}`}
        </button>
      )}
      {sel && <Detalle id={sel} mes={mes} mesLabel={mesLabel} onCerrar={cerrar} />}
    </section>
  );
}

function Numeros({ n }) {
  const filas = [
    ['Gasto', usd(n.gastoUsd)], ['Leads', num(n.leads)], ['CPL', n.leads ? usd(n.cplUsd) : '—'],
    ['Impresiones', num(n.impresiones)], ['Alcance', num(n.alcance)], ['Frecuencia', Number(n.frecuencia || 0).toFixed(2)],
    ['Clicks', num(n.clicks)], ['CTR', `${Number(n.ctr || 0).toFixed(2)}%`], ['CPC', n.clicks ? usd(n.cpcUsd) : '—'],
  ];
  return (
    <div className="ads-kpis">
      {filas.map(([k, v]) => <div key={k}><span className="dim">{k}</span><b className="num">{v}</b></div>)}
    </div>
  );
}

function Detalle({ id, mes, mesLabel, onCerrar }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let vivo = true;
    getAnuncioMeta(id, mes).then((r) => vivo && setD(r)).catch((e) => vivo && setError(e));
    const esc = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', esc);
    return () => { vivo = false; window.removeEventListener('keydown', esc); };
  }, [id, mes, onCerrar]);

  const max = Math.max(1, ...(d?.dias ?? []).map((x) => x.gastoUsd));
  return (
    <div className="ads-velo" onClick={onCerrar} role="presentation">
      <aside className="ads-drawer" role="dialog" aria-label="Detalle del anuncio" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ads-cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        {error ? <div style={{ padding: 18 }}><ErrorState error={error} /></div> : !d ? <div style={{ padding: 18 }}><SkeletonBlock height={320} /></div> : (
          <>
            <div className="ads-det-cab">
              {d.imagen && <img src={d.imagen} alt="" referrerPolicy="no-referrer" />}
              <div>
                <Pill tone={TONO[d.estado] ?? 'off'} dot>{d.estado}</Pill>
                <h2>{d.nombre}</h2>
                <p className="dim">{d.campania}{d.conjunto ? ` · ${d.conjunto}` : ''}</p>
                <a href={d.link} target="_blank" rel="noreferrer" className="dim">Abrir en Ads Manager →</a>
              </div>
            </div>
            <div className="ads-sec">
              <h3>En {mesLabel}</h3>
              <Numeros n={d.mes} />
              {d.dias.length > 0 ? (
                <div className="ads-dias" aria-label="Gasto por día">
                  {d.dias.map((x) => (
                    <span key={x.fecha} title={`${x.fecha}: ${usd(x.gastoUsd)} · ${x.leads} leads`}>
                      <i style={{ height: `${Math.max(2, (x.gastoUsd / max) * 100)}%` }} />
                    </span>
                  ))}
                </div>
              ) : <p className="dim">No gastó en {mesLabel}.</p>}
            </div>
            <div className="ads-sec">
              <h3>Toda su vida</h3>
              <Numeros n={d.vida} />
            </div>
            {(d.titulo || d.texto) && (
              <div className="ads-sec">
                <h3>El anuncio</h3>
                {d.titulo && <b>{d.titulo}</b>}
                {d.texto && <p className="ads-copy">{d.texto}</p>}
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
