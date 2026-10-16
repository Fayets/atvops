import { useMemo, useState } from 'react';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import {
  audienciaASetting, audienciaCargar, audienciaCorrer, audienciaMarcar, audienciaReanalizar,
  getAudiencia, guardarCriterioAudiencia,
} from '../../data/api.js';
import { formatValue } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';

/**
 * Audiencia: quién comenta los reels y si es un lead calificado.
 *
 * Cada persona que comenta se analiza sola: se lee su perfil público y la IA lo compara
 * con el criterio que escribe marketing. Arriba de todo, los calificados; con un click
 * pasan a la bandeja del setter como pitch pendiente. El criterio es texto libre a
 * propósito: lo que define un buen lead cambia con la oferta, y tiene que poder cambiarlo
 * marketing sin pedirle nada a nadie.
 */

const FILTROS = [
  { clave: 'calificado', label: 'Calificados' },
  { clave: 'tibio', label: 'Tibios' },
  { clave: 'no', label: 'Descartados' },
  { clave: 'sin_analizar', label: 'Sin analizar' },
];
const TONO = { calificado: 'ok', tibio: 'warn', no: 'off', sin_analizar: 'off' };
const TEXTO = { calificado: 'calificado', tibio: 'tibio', no: 'descartado', sin_analizar: 'sin analizar' };
// Las cuatro dimensiones del criterio de marketing, con su peso en el puntaje final.
const DIMENSIONES = [
  ['negocio', 'Negocio', '35%'], ['financiero', 'Capacidad', '30%'],
  ['intencion', 'Intención', '25%'], ['avatar', 'Avatar', '10%'],
];

const corta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '');

function Lead({ l, onSetting, onDescartar, onReanalizar, ocupado }) {
  const p = l.perfil || {};
  return (
    <article className={`aud-lead${l.estado === 'descartado' ? ' descartado' : ''}`}>
      <div className="aud-lead-cab">
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
        {l.estado === 'a_setting' ? (
          <span className="aud-hecho">✓ En la bandeja del setter</span>
        ) : l.estado === 'descartado' ? (
          <button type="button" className="btn ghost sm" onClick={() => onDescartar(l, 'nuevo')} disabled={ocupado}>Recuperar</button>
        ) : (
          <>
            <button type="button" className="btn primary sm" onClick={() => onSetting(l)} disabled={ocupado}>Pasar a setting</button>
            <button type="button" className="btn ghost sm" onClick={() => onDescartar(l, 'descartado')} disabled={ocupado}>Descartar</button>
          </>
        )}
        {l.perfilLeido && (
          <button type="button" className="btn ghost sm" onClick={() => onReanalizar(l)} disabled={ocupado}>Volver a analizar</button>
        )}
      </div>
    </article>
  );
}

export default function Audiencia() {
  const [tick, setTick] = useState(0);
  const { data, error, loading } = useResource(() => getAudiencia(), [tick]);
  const [filtro, setFiltro] = useState('calificado');
  const [reel, setReel] = useState('');
  const [verDescartados, setVerDescartados] = useState(false);
  const [criterioAbierto, setCriterioAbierto] = useState(false);
  const [borrador, setBorrador] = useState(null);
  const [pegado, setPegado] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');

  const leads = useMemo(() => (data?.leads ?? []).filter((l) => (
    l.veredicto === filtro
    && (!reel || l.reelId === reel)
    && (verDescartados || l.estado !== 'descartado')
  )), [data, filtro, reel, verDescartados]);

  if (loading && !data) return <div className="page"><SkeletonBlock height={420} /></div>;
  if (error && !data) return <div className="page"><ErrorState error={error} /></div>;

  const conteo = data?.conteo ?? {};
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
      {!permisos.comentarios && (
        <div className="aud-alerta">
          <b>Falta un permiso de Instagram para leer quién comenta.</b> Hoy los comentarios llegan sin el usuario,
          así que no hay a quién analizar. Hay que volver a conectar Instagram con el permiso
          <code>instagram_manage_comments</code>. Mientras tanto, pegá abajo los usuarios a analizar.
        </div>
      )}

      <div className="aud-barra">
        <div className="aud-filtros">
          {FILTROS.map((f) => (
            <button key={f.clave} type="button" className={`chip${filtro === f.clave ? ' active' : ''}`} onClick={() => setFiltro(f.clave)}>
              {f.label} · {conteo[f.clave] ?? 0}
            </button>
          ))}
          {data?.reels?.length > 0 && (
            <select className="lab-select" value={reel} onChange={(e) => setReel(e.target.value)} aria-label="Reel">
              <option value="">Todos los reels</option>
              {data.reels.map((r) => (
                <option key={r.id} value={r.id}>{(r.caption || 'Reel').slice(0, 48)} · {r.calificados}/{r.leads}</option>
              ))}
            </select>
          )}
        </div>
        <div className="aud-botones">
          <button type="button" className="btn" onClick={() => { setBorrador(criterio.texto ?? ''); setCriterioAbierto((v) => !v); }}>
            {criterioAbierto ? 'Cerrar criterio' : 'Criterio de lead'}
          </button>
          <button type="button" className="btn primary" disabled={ocupado}
            onClick={() => hacer(audienciaCorrer, 'Analizando comentarios nuevos. Recargá en un par de minutos.')}>
            Analizar ahora
          </button>
        </div>
      </div>

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

      {leads.length === 0 ? (
        <div className="card lab-vacio">
          <h3>No hay leads {filtro === 'calificado' ? 'calificados' : `en "${FILTROS.find((f) => f.clave === filtro)?.label}"`} todavía</h3>
          <p className="dim">Los comentarios de los reels se analizan solos cada dos horas, o con "Analizar ahora".</p>
        </div>
      ) : (
        <div className="aud-grilla">
          {leads.map((l) => (
            <Lead key={l.id} l={l} ocupado={ocupado}
              onSetting={(x) => hacer(() => audienciaASetting(x.id), `@${x.usuario} quedó en la bandeja del setter.`)}
              onDescartar={(x, estado) => hacer(() => audienciaMarcar(x.id, estado))}
              onReanalizar={(x) => hacer(() => audienciaReanalizar(x.id), `@${x.usuario} analizado de nuevo.`)} />
          ))}
        </div>
      )}

      <label className="aud-check dim">
        <input type="checkbox" checked={verDescartados} onChange={(e) => setVerDescartados(e.target.checked)} /> Mostrar descartados
      </label>
    </div>
  );
}
