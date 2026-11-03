import { formatValue } from '../../lib/format.js';

const TONO = { calificado: 'ok', tibio: 'warn', no: 'off', sin_analizar: 'off' };
const TEXTO = { calificado: 'calificado', tibio: 'tibio', no: 'descartado', sin_analizar: 'sin analizar' };
// Las cuatro dimensiones del criterio de marketing, con su peso en el puntaje final.
// La intención no suma: todos comentan la palabra del CTA (decisión de Franco).
const DIMENSIONES = [
  ['negocio', 'Negocio', '45%'], ['financiero', 'Capacidad', '40%'], ['avatar', 'Avatar', '15%'],
];

const corta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '');

/**
 * Una persona de Audiencia: su perfil, el veredicto con el puntaje, por qué, y lo que comentó.
 * La usan Audiencia y el panel de cada creativo en Ads.
 */
export default function Lead({ l, onDescartar, onReanalizar, ocupado }) {
  const p = l.perfil || {};
  return (
    <article className={`aud-lead${l.estado === 'descartado' ? ' descartado' : ''}`}>
      <div className="aud-lead-cab">
        <a href={l.url} target="_blank" rel="noreferrer" className="aud-avatar" aria-label={`Perfil de @${l.usuario}`}>
          {p.foto ? <img src={p.foto} alt="" loading="lazy" /> : <span>{l.usuario.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase()}</span>}
        </a>
        <div className="aud-quien">
          <a href={l.url} target="_blank" rel="noreferrer" className="aud-usuario">
            @{l.usuario}{p.verificado && <span className="aud-verificado" title="Cuenta verificada" aria-label="verificada">✓</span>}
          </a>
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
        ) : l.perfilLeido && p.seguidores != null ? (
          <>
            <span><b className="num">{formatValue(p.seguidores ?? 0, 'count')}</b> seguidores</span>
            <span className="dim">Cuenta personal: Instagram no muestra su bio ni sus posts.</span>
          </>
        ) : l.perfilLeido ? (
          <span className="dim">Cuenta personal o privada: Instagram no muestra su perfil. Se juzgó por el comentario.</span>
        ) : (
          <span className="dim">Leyendo el perfil…</span>
        )}
      </div>

      {p.bio && <p className="aud-bio">{p.bio}</p>}

      {l.fuente === 'historia' ? (
        <p className="aud-comentario">
          <span className="dim">Respondió la historia por mensaje directo{l.comentadoAt ? ` el ${corta(l.comentadoAt)}` : ''}.</span>
        </p>
      ) : l.comentario && (
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
