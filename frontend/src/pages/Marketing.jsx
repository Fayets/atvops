import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ConversacionesPorContenido from '../components/marketing/ConversacionesPorContenido.jsx';
import AvanceVsMeta from '../components/metas/AvanceVsMeta.jsx';
import DiagnosticoMes from '../components/metas/DiagnosticoMes.jsx';
import Card from '../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import Pill from '../components/ui/Pill.jsx';
import SourceTag from '../components/ui/SourceTag.jsx';
import { getInstagram, getMarketing, getMetasMes } from '../data/api.js';
import { formatValue } from '../lib/format.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';

const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'reels', label: 'Reels' },
  { id: 'historias', label: 'Historias' },
];

function esReel(item) {
  const t = String(item.tipo || item.mediaType || '').toUpperCase();
  return t.includes('REEL') || (item.kind === 'pub' && t === 'VIDEO');
}

function esHistoria(item) {
  return item.kind === 'story' || String(item.tipo || '').toUpperCase() === 'STORY';
}

function etiqueta(item) {
  if (esReel(item)) return 'Reel';
  return item.tipo || item.mediaType || 'Post';
}

/** Secuencia horizontal de historias (orden cronológico). */
function CarruselHistorias({ items }) {
  const [selId, setSelId] = useState(null);
  if (!items.length) return null;

  const repliesTot = items.reduce((s, it) => s + (it.replies || 0), 0);
  const sel = items.find((it) => it.id === selId) || null;
  const selIdx = sel ? items.findIndex((it) => it.id === sel.id) + 1 : 0;

  return (
    <div className="ig-hist-block">
      <div className="ig-hist-head">
        <span className="ig-hist-titulo">Secuencia de historias</span>
        <span className="dim">
          {items.length} activas · {repliesTot} respuestas · click para detalle
        </span>
      </div>
      <ol className="ig-hist-track">
        {items.map((item, i) => {
          const hora = (item.timestamp || '').slice(11, 16);
          const fecha = (item.timestamp || '').slice(5, 10);
          const activo = item.id === selId;
          return (
            <li key={item.id} className={`ig-hist-card${activo ? ' activo' : ''}`}>
              <button
                type="button"
                className="ig-hist-hit"
                aria-pressed={activo}
                onClick={() => setSelId((cur) => (cur === item.id ? null : item.id))}
              >
                <span className="ig-hist-n num">{i + 1}</span>
                <span className="ig-hist-frame">
                  {item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt="" />
                  ) : (
                    <span className="ig-hist-empty">Sin preview</span>
                  )}
                </span>
                <span className="ig-hist-meta dim">
                  {fecha}
                  {hora ? ` · ${hora}` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {sel && (
        <div className="ig-hist-detalle">
          <div className="ig-hist-detalle-top">
            <strong>Historia {selIdx}</strong>
            <span className="dim">
              {(sel.timestamp || '').slice(0, 10)}
              {(sel.timestamp || '').slice(11, 16) ? ` · ${(sel.timestamp || '').slice(11, 16)}` : ''}
            </span>
            <button type="button" className="ig-hist-cerrar dim" onClick={() => setSelId(null)}>
              Cerrar
            </button>
          </div>
          <div className="ig-hist-detalle-grid">
            <div className="ig-hist-stat ig-hist-stat--reply">
              <span className="num">{sel.replies ?? 0}</span>
              <span className="dim">respuestas</span>
            </div>
            <div className="ig-hist-stat">
              <span className="num">{sel.reach ?? 0}</span>
              <span className="dim">alcance</span>
            </div>
            <div className="ig-hist-stat">
              <span className="num">{sel.shares ?? 0}</span>
              <span className="dim">shares</span>
            </div>
            <div className="ig-hist-stat">
              <span className="num">{sel.profileVisits ?? 0}</span>
              <span className="dim">perfil</span>
            </div>
            <div className="ig-hist-stat">
              <span className="num">{sel.follows ?? 0}</span>
              <span className="dim">follows</span>
            </div>
            <div className="ig-hist-stat">
              <span className="num">{sel.navigation ?? 0}</span>
              <span className="dim">nav</span>
            </div>
          </div>
          {sel.permalink && (
            <a href={sel.permalink} target="_blank" rel="noreferrer" className="dim" style={{ fontSize: 12 }}>
              Ver en Instagram →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** Lista vertical de reels / posts. */
function ListaReels({ items }) {
  if (!items.length) return null;
  return (
    <ol className="ig-secuencia">
      {items.map((item, i) => {
        const fecha = (item.timestamp || '').slice(0, 10);
        const hora = (item.timestamp || '').slice(11, 16);
        return (
          <li key={item.id} className="ig-pub">
            <span className="ig-seq-n num dim">{i + 1}</span>
            {item.thumbnailUrl ? (
              <a href={item.permalink || '#'} target="_blank" rel="noreferrer" className="ig-thumb">
                <img src={item.thumbnailUrl} alt="" />
              </a>
            ) : (
              <div className="ig-thumb ig-thumb--empty" />
            )}
            <div className="ig-pub-body">
              <div className="ig-pub-meta">
                <Pill tone="plain">{etiqueta(item)}</Pill>
                <span className="dim">
                  {fecha}
                  {hora ? ` · ${hora}` : ''}
                </span>
                <span className="dim">
                  {item.likes ?? 0} likes · {item.comments ?? 0} com.
                </span>
              </div>
              <p className="ig-caption">{item.caption || 'Sin caption'}</p>
              {item.permalink && (
                <a href={item.permalink} target="_blank" rel="noreferrer" className="dim" style={{ fontSize: 12 }}>
                  Ver en Instagram →
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function Marketing() {
  const { mes } = useMes();
  const [filtro, setFiltro] = useState('todos');
  const ig = useResource(() => getInstagram(mes), [mes]);
  const metas = useResource(() => getMetasMes(mes), [mes]);
  // Conversaciones abiertas y qué contenido las trajo: sale del CRM, no de reportes.
  const mkt = useResource(() => getMarketing(mes), [mes]);

  const data = ig.data;
  const metasData = metas.data;

  const { reels, historias } = useMemo(() => {
    if (!data) return { reels: [], historias: [] };
    const pubs = (data.publicaciones ?? []).map((p) => ({ ...p, kind: 'pub' }));
    const stories = (data.storiesActivas ?? []).map((s) => ({
      ...s,
      kind: 'story',
      tipo: 'STORY',
    }));
    const reelsOrd = pubs
      .filter(esReel)
      .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    // Secuencia de historias: de más vieja a más nueva (orden de publicación).
    const histOrd = stories.sort((a, b) =>
      String(a.timestamp || '').localeCompare(String(b.timestamp || '')),
    );
    return { reels: reelsOrd, historias: histOrd };
  }, [data]);

  const mostrarReels = filtro === 'todos' || filtro === 'reels';
  const mostrarHistorias = filtro === 'todos' || filtro === 'historias';
  const vacio =
    (mostrarReels ? reels.length === 0 : true) &&
    (mostrarHistorias ? historias.length === 0 : true);

  if (ig.error && metas.error) {
    return (
      <div className="page">
        <ErrorState error={ig.error || metas.error} />
      </div>
    );
  }

  return (
    <div className="page">
      {mkt.data && <ConversacionesPorContenido marketing={mkt.data} />}

      {metas.loading && !metasData ? (
        <SkeletonBlock height={200} />
      ) : metasData ? (
        <>
          <DiagnosticoMes
            alertas={metasData.diagnostico}
            sub={`${metasData.contexto.nombreMes} · día ${metasData.contexto.diaHoy} de ${metasData.contexto.diasMes}`}
          />
          <AvanceVsMeta
            filas={metasData.avanceMarketing}
            titulo="Avance vs meta · Marketing"
            sub="Chats, conversaciones y agendas · sin paid"
            syncAt={metasData.real.syncAt}
          />
        </>
      ) : null}

      {ig.loading && !data ? (
        <SkeletonBlock height={280} />
      ) : data ? (
        <Card
          title="Contenido del mes"
          sub={`${reels.length} reels · ${historias.length} historias · ${formatValue(data.totales?.storyReplies ?? 0, 'count')} resp. stories · ${formatValue(data.totales?.likes ?? 0, 'count')} likes`}
          actions={<SourceTag sourceId="ads_manager" updatedAt={data.syncAt} />}
        >
          <div className="ig-filtros" role="tablist" aria-label="Tipo de contenido">
            {FILTROS.map((f) => {
              const count =
                f.id === 'reels' ? reels.length : f.id === 'historias' ? historias.length : reels.length + historias.length;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filtro === f.id}
                  className={`ig-filtro${filtro === f.id ? ' activo' : ''}`}
                  onClick={() => setFiltro(f.id)}
                >
                  {f.label}
                  <span className="num">{count}</span>
                </button>
              );
            })}
          </div>

          {vacio ? (
            <p className="dim" style={{ margin: 0 }}>
              Nada en “{FILTROS.find((x) => x.id === filtro)?.label}” para {data.mes}.
            </p>
          ) : (
            <div className="ig-contenido-stack">
              {mostrarHistorias && <CarruselHistorias items={historias} />}
              {mostrarReels && <ListaReels items={reels} />}
            </div>
          )}

          <p className="dim" style={{ margin: '14px 0 0', fontSize: 12.5 }}>
            Gasto y campañas paid: <Link to="/ads">ir a Ads →</Link>
          </p>
        </Card>
      ) : ig.error ? (
        <ErrorState error={ig.error} />
      ) : null}
    </div>
  );
}
