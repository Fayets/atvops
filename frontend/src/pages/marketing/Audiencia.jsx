import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import {
  audienciaAnalizarReel, audienciaCargar, audienciaCorrer, audienciaMarcar, audienciaReanalizar,
  getAudiencia, guardarCriterioAudiencia,
} from '../../data/api.js';
import { formatValue } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';
import { useMes } from '../../lib/MesContext.jsx';
import Lead from '../../components/audiencia/LeadAudiencia.jsx';
import { iniciarTarea } from '../../lib/tareas.js';

/**
 * Audiencia: quién comenta los reels o responde las historias, y si es un lead calificado.
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
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }) : '');
const pct = (v) => (v == null ? '—' : `${String(v).replace('.', ',')}%`);

/** El reel elegido: la miniatura y lo que dice, con flechas para pasar al anterior. */
function Reel({ r, onVolver, onAnalizar, onPegar, ocupado, abierto, enCurso }) {
  const leidos = Math.max(r.perfilesLeidos ?? 0, r.analizados ?? 0);
  return (
    <section className="card aud-reel">
      <div className="aud-reel-foto">
        {r.thumbnail ? <img src={r.thumbnail} alt="" /> : <div className="aud-reel-sin">Reel</div>}
      </div>
      <div className="aud-reel-texto">
        <span className="lab-k">Reel{r.fecha ? ` · ${fecha(r.fecha)}` : ''}{r.chats ? ` · ${r.chats} chats con «${r.palabra}»` : ''}</span>
        <p className="aud-reel-caption">{r.caption || 'Sin texto'}</p>
        {r.seguido && (
          <div className={`aud-progreso${enCurso ? ' en-curso' : ''}`}
            title="Cada persona nueva que comente este reel se analiza sola, aunque sea meses después">
            <span className="aud-siguiendo">
              <i aria-hidden="true" />
              {!enCurso
                ? <span className="num">{r.analizados} {r.analizados === 1 ? 'perfil analizado' : 'perfiles analizados'} · sigue cada comentario nuevo</span>
                : !r.personas ? 'Leyendo comentarios…'
                  : leidos < r.personas ? <span className="num">Leyendo perfiles · {leidos} de {r.personas}</span>
                    : <span className="num">Analizando con IA · {r.analizados} de {r.personas}</span>}
            </span>
            <span className="aud-progreso-barra" aria-hidden="true">
              {/* Dos etapas en una barra: leer el perfil es la primera mitad, el análisis la segunda. */}
              <i style={{ transform: `scaleX(${r.personas ? (leidos + r.analizados) / (2 * r.personas) : 0})` }} />
            </span>
          </div>
        )}
        <div className="aud-reel-pie">
          {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="dim">Ver en Instagram →</a> : <span />}
          <span className="aud-reel-nav">
            {/* Siempre se puede volver a leer: si faltó alguien, trae lo que haya. */}
            {!enCurso && (
              <button type="button" className={`btn ${r.seguido && r.personas ? 'ghost' : 'primary'} sm`} onClick={onAnalizar} disabled={ocupado}
                title="Trae a todos los que comentaron (API, avisos de Meta y respaldo), lee sus perfiles y los analiza. Desde ahí, cada comentario nuevo entra solo.">
                {r.seguido ? 'Volver a leer' : 'Analizar audiencia'}
              </button>
            )}
            <button type="button" className="btn ghost sm" onClick={onPegar} disabled={ocupado}
              title="Si falta alguien, pegá los usuarios y se analizan en el momento">
              {abierto ? 'Cerrar' : 'Agregar usuarios'}
            </button>
            <button type="button" className="btn ghost sm" onClick={onVolver}>← Todos los reels</button>
          </span>
        </div>
      </div>
    </section>
  );
}

/** La secuencia elegida (un día de historias): sus piezas en fila y si tenía CTA. */
function Secuencia({ s, onVolver }) {
  return (
    <section className="card aud-secuencia">
      <div className="aud-reel-cab">
        <span className="lab-k">Historias · {fecha(`${s.fecha}T12:00:00`)}{s.cta ? ' · con CTA' : ''}</span>
        <button type="button" className="btn ghost sm" onClick={onVolver}>← Todas las secuencias</button>
      </div>
      <div className="aud-piezas">
        {s.piezas.map((pz) => (
          <a key={pz.id} href={pz.url || undefined} target="_blank" rel="noreferrer" className="aud-pieza" title={`${pz.respuestas} respuestas`}>
            {pz.thumbnail ? <img src={pz.thumbnail} alt="" loading="lazy" /> : <span className="aud-reel-sin">Historia</span>}
            {pz.respuestas > 0 && <span className="aud-pieza-n num">{pz.respuestas}</span>}
          </a>
        ))}
      </div>
      <p className="dim aud-secuencia-pie">{s.piezas.length} {s.piezas.length === 1 ? 'pieza' : 'piezas'}. El número de cada una es cuántas respuestas tuvo.</p>
    </section>
  );
}

/** Los reels que se subieron en el mes, para elegir uno. */
function ReelsDelMes({ reels, mesLabel, onElegir }) {
  if (!reels.length) {
    return (
      <div className="card lab-vacio"><h3>No hay reels en {mesLabel}</h3>
        <p className="dim">Cambiá el mes arriba a la derecha.</p></div>
    );
  }
  return (
    <section className="aud-secs">
      <h2 className="aud-secs-tit">Reels de {mesLabel} <span className="dim num">· {reels.length}</span></h2>
      <div className="aud-secs-grilla">
        {reels.map((r) => (
          <button key={r.id} type="button" className="card aud-sec" onClick={() => onElegir(r.id)}>
            <span className="aud-sec-foto">
              {r.thumbnail ? <img src={r.thumbnail} alt="" loading="lazy" /> : <span className="aud-reel-sin">Reel</span>}
              <span className="aud-sec-n num">{formatValue(r.comentarios ?? 0, 'count')} comentarios</span>
            </span>
            <span className="aud-sec-txt">
              <b>{r.fecha ? fecha(r.fecha) : 'Sin fecha'}</b>
              <span className="dim aud-sec-cap">{(r.caption || 'Sin texto').split('\n')[0]}</span>
              {r.chats > 0
                ? <span className="aud-sec-chats num"><b>{formatValue(r.chats, 'count')}</b> chats · comentaron «{r.palabra}»</span>
                : <span className="aud-sec-chats dim">Sin CTA{r.cta?.origen === 'manual' ? ' (marcado)' : ''}</span>}
              {r.personas ? (
                <>
                  <span className="dim num">{r.personas} personas · {r.calificado ?? 0} calificados</span>
                  <span className="num aud-sec-pct">{r.analizados ? pct(r.pctCalificados) : '—'} <span className="dim">calificados</span></span>
                </>
              ) : (
                <span className="aud-sec-pend">{r.seguido ? 'Analizando…' : 'Sin analizar'}</span>
              )}
              {r.seguido && r.personas ? <span className="aud-siguiendo chico"><i aria-hidden="true" /> Analizando</span> : null}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Todas las secuencias de historias del mes, para elegir una. */
function SecuenciasDelMes({ secuencias, mesLabel, onElegir }) {
  if (!secuencias.length) {
    return (
      <div className="card lab-vacio"><h3>No hay secuencias con CTA en {mesLabel}</h3>
        <p className="dim">Cambiá el mes arriba a la derecha, o usá "Analizar ahora" para traer las respuestas nuevas.</p></div>
    );
  }
  return (
    <section className="aud-secs">
      <h2 className="aud-secs-tit">Secuencias con CTA de {mesLabel} <span className="dim num">· {secuencias.length}</span></h2>
      <div className="aud-secs-grilla">
        {secuencias.map((s) => {
          const tapa = s.piezas.find((p) => p.thumbnail)?.thumbnail;
          return (
            <button key={s.id} type="button" className="card aud-sec" onClick={() => onElegir(s.id)}>
              <span className="aud-sec-foto">
                {tapa ? <img src={tapa} alt="" loading="lazy" /> : <span className="aud-reel-sin">Historias</span>}
                <span className="aud-sec-n num">{s.piezas.length} {s.piezas.length === 1 ? 'pieza' : 'piezas'}</span>
              </span>
              <span className="aud-sec-txt">
                <b>{fecha(`${s.fecha}T12:00:00`)}</b>
                                <span className="dim num">{s.respuestas ?? 0} respuestas · {s.calificado ?? 0} calificados</span>
                <span className="num aud-sec-pct">{s.analizados ? pct(s.pctCalificados) : '—'} <span className="dim">calificados</span></span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Lo que dejó el reel o la secuencia: comentarios o respuestas, calificados, descalificados y el porcentaje. */
function Numeros({ r, etiqueta = 'Comentarios', total }) {
  return (
    <section className="aud-numeros">
      <div className="card aud-num"><span className="lab-k">{etiqueta}</span><b className="num">{formatValue(total ?? r.comentarios ?? 0, 'count')}</b>
        <span className="dim">{r.personas} personas distintas</span></div>
      <div className="card aud-num ok"><span className="lab-k">Calificados</span><b className="num">{r.calificado ?? 0}</b>
        <span className="dim">puntaje 7 o más, según el criterio</span></div>
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
  // ?reel=ID abre ese reel: es a donde lleva el "Ver" del banner de arriba.
  const [params] = useSearchParams();
  const ubicacion = useLocation();
  const [reelId, setReelId] = useState(params.get('reel'));
  const [fuente, setFuente] = useState('reel');   // reel | historia
  // Cada click en "Ver" abre el reel, aunque ya se esté en Audiencia mirando otra cosa.
  const pedido = params.get('reel');
  useEffect(() => {
    if (pedido) { setReelId(pedido); setFuente('reel'); }
  }, [pedido, ubicacion.key]);
  // Historias: primero todas las secuencias del mes; recién al elegir una se ven sus leads.
  const [secId, setSecId] = useState(null);
  const { mes, opciones } = useMes();
  const [verDescartados, setVerDescartados] = useState(false);
  const [criterioAbierto, setCriterioAbierto] = useState(false);
  const [borrador, setBorrador] = useState(null);
  const [pegado, setPegado] = useState('');
  const [cuadroReel, setCuadroReel] = useState(null);   // id del reel con el cuadro de pegar abierto
  const [aMano, setAMano] = useState(null);   // el resultado del último análisis a mano
  const [analizandoAMano, setAnalizandoAMano] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');
  const [activado, setActivado] = useState(null);   // { id, at } del reel recién mandado a analizar

  const reels = data?.reels ?? [];
  const secuencias = data?.historias ?? [];
  // Solo las secuencias con CTA: las demás no buscan respuestas y no dicen nada de leads.
  const secuenciasMes = secuencias.filter((s) => s.cta && (s.fecha || '').startsWith(mes));
  const secActual = secuencias.find((s) => s.id === secId) ?? null;
  // Reels: igual que las historias, primero los del mes y después el análisis de uno.
  const reelsMes = reels.filter((r) => (r.fecha || '').startsWith(mes));
  const reelActual = reels.find((r) => r.id === reelId) ?? null;
  const mesLabel = (opciones ?? []).find((o) => o.id === mes)?.label?.toLowerCase() ?? 'este mes';
  const actual = fuente === 'historia' ? secActual : reelActual;
  const leads = useMemo(() => (data?.leads ?? []).filter((l) => (
    l.veredicto === filtro
    && (fuente === 'historia'
      ? l.fuente === 'historia' && secActual && l.secuencia === secActual.id
      // Un lead está en todos los reels que comentó, no solo en el primero por el que entró.
      : l.fuente !== 'historia' && (reelActual ? (l.reels?.length ? l.reels : [l.reelId]).includes(reelActual.id) : !l.reelId))
    && (verDescartados || l.estado !== 'descartado')
  )), [data, filtro, fuente, reelActual, secActual, verDescartados]);

  // Mientras un reel seguido tiene perfiles en análisis, la pantalla se refresca sola para
  // mostrar el avance; corta cuando no queda nadie pendiente y el análisis terminó. El minuto
  // después de apretar cubre el arranque: el análisis corre de fondo y tarda en tomar el turno.
  const recien = activado && activado.id === reelActual?.id && Date.now() - activado.at < 60000;
  const enCurso = Boolean(reelActual?.seguido && (data?.corriendo || reelActual.sin_analizar > 0 || recien));
  useEffect(() => {
    if (!enCurso) return undefined;
    const t = setTimeout(() => setTick((n) => n + 1), 3000);
    return () => clearTimeout(t);
  }, [enCurso, data]);

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
        <div className="aud-fuente" role="group" aria-label="Qué mirar">
          <button type="button" className={`chip${fuente === 'reel' ? ' active' : ''}`} aria-pressed={fuente === 'reel'} onClick={() => setFuente('reel')}>
            Reels <span className="dim num">{reelsMes.length}</span>
          </button>
          <button type="button" className={`chip${fuente === 'historia' ? ' active' : ''}`} aria-pressed={fuente === 'historia'} onClick={() => setFuente('historia')}>
            Historias <span className="dim num">{secuenciasMes.length}</span>
          </button>
        </div>
        <button type="button" className="btn" onClick={() => { setBorrador(criterio.texto ?? ''); setCriterioAbierto((v) => !v); }}>
          {criterioAbierto ? 'Cerrar criterio' : 'Criterio de lead'}
        </button>
        <button type="button" className="btn primary" disabled={ocupado}
          onClick={() => {
            // La corrida relee los reels seguidos: con uno abierto, el banner de arriba lo sigue.
            if (reelActual) {
              setActivado({ id: reelActual.id, at: Date.now() });
              iniciarTarea({ tipo: 'reel', mediaId: reelActual.id, titulo: reelActual.caption });
            }
            hacer(audienciaCorrer, reelActual ? '' : 'Analizando comentarios y respuestas nuevas. Recargá en un par de minutos.');
          }}>
          Analizar ahora
        </button>
      </div>

      {fuente === 'historia' ? (
        secActual ? (
          <div className="aud-hero">
            <Secuencia s={secActual} onVolver={() => setSecId(null)} />
            <Numeros r={secActual} etiqueta="Respuestas" total={secActual.respuestas} />
          </div>
        ) : (
          <SecuenciasDelMes secuencias={secuenciasMes} mesLabel={mesLabel} onElegir={setSecId} />
        )
      ) : reelActual ? (<>
        <div className="aud-hero">
          <Reel r={reelActual} onVolver={() => setReelId(null)} ocupado={ocupado} abierto={cuadroReel === reelActual.id}
            enCurso={enCurso}
            onAnalizar={() => { setActivado({ id: reelActual.id, at: Date.now() });
              iniciarTarea({ tipo: 'reel', mediaId: reelActual.id, titulo: reelActual.caption });
              hacer(() => audienciaAnalizarReel(reelActual.id),
              'Analizando a todos los que comentaron. Desde ahora cada comentario nuevo de este reel entra solo.'); }}
            onPegar={() => { setAMano(null); setCuadroReel((c) => (c === reelActual.id ? null : reelActual.id)); }} />
          <Numeros r={reelActual} />
        </div>
      {cuadroReel === reelActual.id && (
        <section className="card aud-pegar">
          <label htmlFor="aud-pegar" className="lab-k">Quiénes comentaron este reel</label>
          <div className="aud-pegar-fila">
            <textarea id="aud-pegar" rows={3} value={pegado} onChange={(e) => setPegado(e.target.value)}
              placeholder="@usuario, links de perfil o una lista, uno por línea" />
            <button type="button" className="btn primary" disabled={analizandoAMano || !pegado.trim()}
              onClick={async () => {
                setAnalizandoAMano(true); setAviso(''); setAMano(null);
                try {
                  const r = await audienciaCargar(pegado, reelActual.id);
                  setAMano(r); setPegado(''); setTick((n) => n + 1);
                } catch (e) {
                  setAviso(e?.message || 'No se pudo analizar.');
                } finally {
                  setAnalizandoAMano(false);
                }
              }}>
              {analizandoAMano ? 'Analizando…' : 'Analizar'}
            </button>
          </div>
          {analizandoAMano && <p className="dim aud-aviso">Leyendo los perfiles y analizándolos con la IA. Tarda entre 20 segundos y un minuto.</p>}
          {aMano && (
            <p className="aud-aviso">
              {aMano.leads?.length ? `Listo: ${aMano.leads.length} ${aMano.leads.length === 1 ? 'perfil analizado' : 'perfiles analizados'}.` : 'No se pudo analizar ninguno.'}
              {aMano.pendientes ? ` Los otros ${aMano.pendientes} se analizan en la próxima corrida.` : ''}
              {aMano.aviso ? ` ${aMano.aviso}` : ''}
            </p>
          )}
        </section>
      )}
      </>) : (
        <ReelsDelMes reels={reelsMes} mesLabel={mesLabel} onElegir={setReelId} />
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


      {(fuente === 'historia' ? secActual : reelActual) && (<>
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
          <p className="dim">{fuente === 'reel' && actual && !actual.personas && actual.comentarios
            ? (actual.seguido ? 'No entró nadie de este reel todavía. Tocá "Volver a leer" arriba.' : 'Este reel todavía no se analiza. Tocá "Analizar audiencia" arriba.')
            : actual?.sin_analizar ? `Hay ${actual.sin_analizar} personas ${fuente === 'historia' ? 'de esta secuencia' : 'de este reel'} esperando análisis.` : 'Se analizan solos cada dos horas, o con "Analizar ahora".'}</p>
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
      </>)}

      <label className="aud-check dim">
        <input type="checkbox" checked={verDescartados} onChange={(e) => setVerDescartados(e.target.checked)} /> Mostrar descartados
      </label>
    </div>
  );
}
