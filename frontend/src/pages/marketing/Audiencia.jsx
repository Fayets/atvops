import { useMemo, useState } from 'react';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import {
  audienciaCargar, audienciaCorrer, audienciaMarcar, audienciaReanalizar,
  getAudiencia, guardarCriterioAudiencia,
} from '../../data/api.js';
import { formatValue } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';

/**
 * Audiencia: quién comenta los reels y si es un lead calificado.
 *
 * Cada persona que comenta se analiza sola: se lee su perfil público y la IA lo compara
 * con el criterio que escribe marketing. Arriba de todo, los calificados. El criterio es texto libre a
 * propósito: lo que define un buen lead cambia con la oferta, y tiene que poder cambiarlo
 * marketing sin pedirle nada a nadie.
 */

const FILTROS = [
  { clave: 'calificado', label: 'Calificados' },
  { clave: 'no', label: 'Descartados' },
  { clave: 'sin_analizar', label: 'Sin analizar' },
];
const TONO = { calificado: 'ok', tibio: 'warn', no: 'off', sin_analizar: 'off' };
const TEXTO = { calificado: 'calificado', tibio: 'tibio', no: 'descartado', sin_analizar: 'sin analizar' };
// Las cuatro dimensiones del criterio de marketing, con su peso en el puntaje final.
// La intención no suma: todos comentan la palabra del CTA (decisión de Franco).
const DIMENSIONES = [
  ['negocio', 'Negocio', '45%'], ['financiero', 'Capacidad', '40%'], ['avatar', 'Avatar', '15%'],
];

const corta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '');

function Lead({ l, onDescartar, onReanalizar, ocupado }) {
  const p = l.perfil || {};
  return (
    <article className={`aud-lead${l.estado === 'descartado' ? ' descartado' : ''}`}>
      <div className="aud-lead-cab">
        <a href={l.url} target="_blank" rel="noreferrer" className="aud-avatar" aria-label={`Perfil de @${l.usuario}`}>
          {p.foto ? <img src={p.foto} alt="" loading="lazy" /> : <span>{l.usuario.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase()}</span>}
        </a>
        <div className="aud-quien">
          <a href={l.url} target="_blank" rel="noreferrer" className="aud-usuario">@{l.usuario}</a>
          {p.nombre && <span className="dim">{p.nombre}</span>}
        </div>
        <div className="aud-veredicto">
          <span className={`aud-pill ${TONO[l.veredicto]}`}>{TEXTO[l.veredicto]}</span>
          {l.puntaje != null && <span className="aud-puntaje num">{Number(l.puntaje).toFixed(1).replace('.', ',')}<small>/10</small></span>}
        </div>
      </div>

      {l.motivo && <p className="aud-motivo">{l.motivo}</p>}

      {l.analisis?.dimensiones && (
        <div className="aud-dims">
          {DIMENSIONES.map(([k, label, peso]) => {
            const v = l.analisis.dimensiones[k];
            return (
              <div key={k} className="aud-dim" title={`${label} · pesa ${peso}`}>
                <span className="aud-dim-l">{label}</span>
                <span className="aud-dim-pista"><i style={{ width: `${(Number(v) || 0) * 10}%` }} /></span>
                <span className="aud-dim-v num">{v ?? '—'}</span>
              </div>
            );
          })}
        </div>
      )}
      {(l.analisis?.señales?.length > 0 || l.analisis?.redFlags?.length > 0 || l.analisis?.descarteAutomatico) && (
        <div className="aud-tags">
          {l.analisis.descarteAutomatico && <span className="aud-tag mal">descarte automático</span>}
          {(l.analisis.señales || []).map((t) => <span key={`s-${t}`} className="aud-tag">{t}</span>)}
          {(l.analisis.redFlags || []).map((t) => <span key={`r-${t}`} className="aud-tag mal">{t}</span>)}
        </div>
      )}

      <div className="aud-datos">
        {l.cuenta === 'empresa' ? (
          <>
            <span><b className="num">{formatValue(p.seguidores ?? 0, 'count')}</b> seguidores</span>
            <span><b className="num">{formatValue(p.publicaciones ?? 0, 'count')}</b> posts</span>
            {p.web && <a href={p.web} target="_blank" rel="noreferrer" className="dim">{p.web.replace(/^https?:\/\//, '').slice(0, 36)}</a>}
          </>
        ) : l.perfilLeido ? (
          <span className="dim">Cuenta personal o privada: Instagram no muestra su perfil. Se juzgó por el comentario.</span>
        ) : (
          <span className="dim">Leyendo el perfil…</span>
        )}
      </div>

      {p.bio && <p className="aud-bio">{p.bio}</p>}

      {l.comentario && (
        <p className="aud-comentario">
          <span className="dim">Comentó{l.comentadoAt ? ` el ${corta(l.comentadoAt)}` : ''}:</span> «{l.comentario}»
          {l.reelUrl && <> · <a href={l.reelUrl} target="_blank" rel="noreferrer" className="dim">ver reel</a></>}
        </p>
      )}

      <div className="aud-acciones">
        {l.estado === 'descartado' ? (
          <button type="button" className="btn ghost sm" onClick={() => onDescartar(l, 'nuevo')} disabled={ocupado}>Recuperar</button>
        ) : (
          <button type="button" className="btn ghost sm" onClick={() => onDescartar(l, 'descartado')} disabled={ocupado}>Descartar</button>
        )}
        {l.perfilLeido && (
          <button type="button" className="btn ghost sm" onClick={() => onReanalizar(l)} disabled={ocupado}>Volver a analizar</button>
        )}
      </div>
    </article>
  );
}

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }) : '');
const pct = (v) => (v == null ? '—' : `${String(v).replace('.', ',')}%`);

/** El reel elegido: la miniatura y lo que dice, con flechas para pasar al anterior. */
function Reel({ r, i, total, onMover }) {
  return (
    <section className="card aud-reel">
      <div className="aud-reel-foto">
        {r.thumbnail ? <img src={r.thumbnail} alt="" /> : <div className="aud-reel-sin">Reel</div>}
      </div>
      <div className="aud-reel-texto">
        <span className="lab-k">Reel{r.fecha ? ` · ${fecha(r.fecha)}` : ''}</span>
        <p className="aud-reel-caption">{r.caption || 'Sin texto'}</p>
        <div className="aud-reel-pie">
          {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="dim">Ver en Instagram →</a> : <span />}
          <span className="aud-reel-nav">
            <button type="button" className="btn ghost sm" onClick={() => onMover(1)} disabled={i >= total - 1} aria-label="Reel anterior">←</button>
            <span className="dim num">{i + 1} / {total}</span>
            <button type="button" className="btn ghost sm" onClick={() => onMover(-1)} disabled={i <= 0} aria-label="Reel siguiente">→</button>
          </span>
        </div>
      </div>
    </section>
  );
}

/** Lo que dejó el reel: comentarios, calificados, descalificados y el porcentaje. */
function Numeros({ r }) {
  return (
    <section className="aud-numeros">
      <div className="card aud-num"><span className="lab-k">Comentarios</span><b className="num">{formatValue(r.comentarios ?? 0, 'count')}</b>
        <span className="dim">{r.personas} personas distintas</span></div>
      <div className="card aud-num ok"><span className="lab-k">Calificados</span><b className="num">{r.calificado ?? 0}</b>
        <span className="dim">puntaje 5 o más, según el criterio</span></div>
      <div className="card aud-num"><span className="lab-k">Descalificados</span><b className="num">{r.no ?? 0}</b>
        <span className="dim">{r.sin_analizar ? `${r.sin_analizar} sin analizar todavía` : 'todos analizados'}</span></div>
      <div className="card aud-num destacado"><span className="lab-k">% calificados</span><b className="num">{pct(r.pctCalificados)}</b>
        <span className="dim">sobre {r.analizados} analizados</span></div>
    </section>
  );
}

export default function Audiencia() {
  const [tick, setTick] = useState(0);
  const { data, error, loading } = useResource(() => getAudiencia(), [tick]);
  const [filtro, setFiltro] = useState('calificado');
  const [indice, setIndice] = useState(0);
  const [verDescartados, setVerDescartados] = useState(false);
  const [criterioAbierto, setCriterioAbierto] = useState(false);
  const [borrador, setBorrador] = useState(null);
  const [pegado, setPegado] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');

  const reels = data?.reels ?? [];
  const reelActual = reels[Math.min(indice, Math.max(reels.length - 1, 0))] ?? null;
  const leads = useMemo(() => (data?.leads ?? []).filter((l) => (
    l.veredicto === filtro
    && (reelActual ? l.reelId === reelActual.id : !l.reelId)
    && (verDescartados || l.estado !== 'descartado')
  )), [data, filtro, reelActual, verDescartados]);
  const manuales = (data?.leads ?? []).filter((l) => !l.reelId && l.veredicto === filtro);

  if (loading && !data) return <div className="page"><SkeletonBlock height={420} /></div>;
  if (error && !data) return <div className="page"><ErrorState error={error} /></div>;

  const permisos = data?.permisos ?? {};
  const criterio = data?.criterio ?? {};

  const hacer = async (fn, ok) => {
    setOcupado(true); setAviso('');
    try {
      const r = await fn();
      if (ok) setAviso(typeof ok === 'function' ? ok(r) : ok);
      setTick((n) => n + 1);
    } catch (e) {
      setAviso(e?.message || 'No se pudo.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="page">
      {permisos.aviso && <p className="aud-aviso">{permisos.aviso} Los datos ya guardados se ven igual.</p>}
      {permisos.comentarios === false && (
        <div className="aud-alerta">
          <b>Falta un permiso de Instagram para leer quién comenta.</b> Hoy los comentarios llegan sin el usuario,
          así que no hay a quién analizar. Hay que volver a conectar Instagram con el permiso
          <code>instagram_manage_comments</code>. Mientras tanto, pegá abajo los usuarios a analizar.
        </div>
      )}

      <div className="aud-herramientas">
        <button type="button" className="btn" onClick={() => { setBorrador(criterio.texto ?? ''); setCriterioAbierto((v) => !v); }}>
          {criterioAbierto ? 'Cerrar criterio' : 'Criterio de lead'}
        </button>
        <button type="button" className="btn primary" disabled={ocupado}
          onClick={() => hacer(audienciaCorrer, 'Analizando comentarios nuevos. Recargá en un par de minutos.')}>
          Analizar ahora
        </button>
      </div>

      {reelActual ? (
        <div className="aud-hero">
          <Reel r={reelActual} i={Math.min(indice, reels.length - 1)} total={reels.length}
            onMover={(d) => setIndice((n) => Math.max(0, Math.min(reels.length - 1, n + d)))} />
          <Numeros r={reelActual} />
        </div>
      ) : (
        <div className="card lab-vacio"><h3>Todavía no hay reels analizados</h3>
          <p className="dim">Con "Analizar ahora" se traen los comentarios de los reels de las últimas tres semanas.</p></div>
      )}

      {aviso && <p className="aud-aviso">{aviso}</p>}

      {criterioAbierto && (
        <section className="card aud-criterio">
          <label htmlFor="aud-criterio" className="lab-k">Qué es un lead calificado</label>
          <p className="dim">La IA decide con esto y nada más. Escribilo como se lo explicarías a un setter nuevo.</p>
          <textarea id="aud-criterio" rows={12} value={borrador ?? ''} onChange={(e) => setBorrador(e.target.value)} />
          <div className="aud-criterio-pie">
            <span className="dim">{criterio.esDefault ? 'Criterio de ejemplo: cambialo por el de ATV.' : `Editado por ${criterio.actualizadoPor ?? '—'}`}</span>
            <button type="button" className="btn primary sm" disabled={ocupado}
              onClick={() => hacer(() => guardarCriterioAudiencia(borrador), 'Criterio guardado. Los próximos análisis lo usan.')}>
              Guardar criterio
            </button>
          </div>
        </section>
      )}


      <div className="aud-lista-cab">
        <h2>{filtro === 'calificado' ? 'Leads calificados' : FILTROS.find((f) => f.clave === filtro)?.label}
          <span className="dim"> · {leads.length}</span></h2>
        <div className="aud-filtros">
          {FILTROS.map((f) => (
            <button key={f.clave} type="button" className={`chip${filtro === f.clave ? ' active' : ''}`} onClick={() => setFiltro(f.clave)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="card lab-vacio">
          <h3>No hay leads {filtro === 'calificado' ? 'calificados' : `en "${FILTROS.find((f) => f.clave === filtro)?.label}"`} todavía</h3>
          <p className="dim">{reelActual?.sin_analizar ? `Hay ${reelActual.sin_analizar} personas de este reel esperando análisis.` : 'Los comentarios se analizan solos cada dos horas, o con "Analizar ahora".'}</p>
        </div>
      ) : (
        <div className="aud-grilla">
          {leads.map((l) => (
            <Lead key={l.id} l={l} ocupado={ocupado}
              onDescartar={(x, estado) => hacer(() => audienciaMarcar(x.id, estado))}
              onReanalizar={(x) => hacer(() => audienciaReanalizar(x.id), `@${x.usuario} analizado de nuevo.`)} />
          ))}
        </div>
      )}

      <details className="aud-mano">
        <summary>Analizar usuarios a mano{manuales.length ? ` · ${manuales.length} en "${FILTROS.find((f) => f.clave === filtro)?.label}"` : ''}</summary>
      <section className="card aud-pegar">
        <label htmlFor="aud-pegar" className="lab-k">Analizar usuarios a mano</label>
        <div className="aud-pegar-fila">
          <textarea id="aud-pegar" rows={2} value={pegado} onChange={(e) => setPegado(e.target.value)}
            placeholder="@usuario, links de perfil o una lista, uno por línea" />
          <button type="button" className="btn" disabled={ocupado || !pegado.trim()}
            onClick={() => hacer(() => audienciaCargar(pegado), (r) => { setPegado(''); return `${r.nuevos} nuevos de ${r.recibidos}. Se analizan en un par de minutos.`; })}>
            Analizar
          </button>
        </div>
      </section>
        {manuales.length > 0 && (
          <div className="aud-grilla">
            {manuales.map((l) => (
              <Lead key={l.id} l={l} ocupado={ocupado}
                  onDescartar={(x, estado) => hacer(() => audienciaMarcar(x.id, estado))}
                onReanalizar={(x) => hacer(() => audienciaReanalizar(x.id), `@${x.usuario} analizado de nuevo.`)} />
            ))}
          </div>
        )}
      </details>

      <label className="aud-check dim">
        <input type="checkbox" checked={verDescartados} onChange={(e) => setVerDescartados(e.target.checked)} /> Mostrar descartados
      </label>
    </div>
  );
}
