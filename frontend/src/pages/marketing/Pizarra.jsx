import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Bocetos, { OBJETIVO } from '../../components/marketing/Bocetos.jsx';
import DocumentoContexto from '../../components/marketing/DocumentoContexto.jsx';
import DocumentoEstructuras from '../../components/marketing/DocumentoEstructuras.jsx';
import DocumentoIdea from '../../components/marketing/DocumentoIdea.jsx';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import {
  getPizarra, getPizarraLlamada, pizarraActualizarVariante, pizarraAprobarGeneral, pizarraBorrarLlamada,
  pizarraCrearLlamada, pizarraEditarGeneral, pizarraGenerarGeneral, pizarraGenerarSecuencias,
  pizarraGuardarContexto, pizarraRegenerarVariantes, pizarraSubirArchivos,
  getEstructurasHistorias, getNarrativaPropuestas, narrativaDecidir, narrativaRevisar, pizarraBuscarDibujos, pizarraEstadoDibujo, pizarraMoverDibujo,
} from '../../data/api.js';
import { useLocalState } from '../../lib/hooks.js';
import '../../styles/pizarra.css';

/**
 * Pizarra de contenido: el Miro de Juan, tal cual lo dibujó.
 *
 * Todo arranca apagado y se va prendiendo a medida que se avanza: negro es lo que se puede
 * tocar ahora, verde lo que ya está hecho. La llamada (1 a 1 o clase grupal) y lo fijo de la
 * marca entran a Claude, que propone la idea general; aprobada, salen las ideas por canal; las
 * aprobadas van al vault, y de una idea de historias aprobada salen las tres secuencias.
 * Lo que todavía no está construido (entregables, guion) se ve en el mapa pero apagado.
 */

const ANCHO = 2030;
const ALTO = 700;

// Las cajas en el mismo lugar que en el Miro de Juan.
const NODOS = {
  uno: { x: 28, y: 440, w: 66, h: 76, label: '1 a 1' },
  clase: { x: 135, y: 440, w: 66, h: 76, label: 'Clase grupal' },
  fathom: { x: 28, y: 292, w: 170, h: 76, label: 'Fathom' },
  dolores: { x: 188, y: 52, w: 112, h: 76, label: 'Dolores de la audiencia' },
  diferenciales: { x: 327, y: 52, w: 112, h: 76, label: 'Diferenciales de la marca' },
  objeciones: { x: 466, y: 52, w: 112, h: 76, label: 'Objeciones' },
  narrativa: { x: 605, y: 52, w: 112, h: 76, label: 'Narrativa' },
  claude: { x: 343, y: 292, w: 170, h: 76, label: 'Claude' },
  general: { x: 737, y: 292, w: 170, h: 76, label: 'Idea general' },
  yt: { x: 1050, y: 47, w: 168, h: 76, label: 'Ideas de YouTube' },
  ytAprob: { x: 1293, y: 47, w: 168, h: 76, label: 'Idea aprobada' },
  ytEnt: { x: 1535, y: 47, w: 168, h: 76, label: 'Entregables' },
  ytDocs: { x: 1788, y: 17, w: 168, h: 40, label: 'Docs' },
  ytCanva: { x: 1788, y: 65, w: 168, h: 40, label: 'Canva' },
  ytPlay: { x: 1788, y: 113, w: 168, h: 40, label: 'Playbooks' },
  reel: { x: 1046, y: 292, w: 168, h: 76, label: 'Ideas de Reels' },
  reelAprob: { x: 1289, y: 292, w: 168, h: 76, label: 'Idea aprobada' },
  reelEnt: { x: 1531, y: 236, w: 168, h: 76, label: 'Entregables' },
  reelGuion: { x: 1531, y: 369, w: 168, h: 92, label: 'Guion', sub: 'la idea del guion, una base' },
  reelDocs: { x: 1784, y: 231, w: 168, h: 40, label: 'Docs' },
  reelPlay: { x: 1784, y: 281, w: 168, h: 40, label: 'Playbooks' },
  story: { x: 1046, y: 568, w: 168, h: 76, label: 'Ideas de secuencia de historias' },
  storySec: { x: 1289, y: 568, w: 168, h: 76, label: '3 tipos de secuencias', sub: 'corta, media y larga' },
  storyEnt: { x: 1577, y: 566, w: 168, h: 76, label: 'Entregables' },
  storyDocs: { x: 1830, y: 561, w: 168, h: 40, label: 'Docs' },
  storyPlay: { x: 1830, y: 611, w: 168, h: 40, label: 'Playbooks' },
};

// [desde, hasta, forma]: h = de costado a costado; arriba = del techo de "desde" al piso de "hasta";
// abajo = del piso de "desde" al techo de "hasta".
const CABLES = [
  ['uno', 'fathom', 'arriba'], ['clase', 'fathom', 'arriba'], ['fathom', 'claude', 'h'],
  ['dolores', 'claude', 'abajo'], ['diferenciales', 'claude', 'abajo'], ['objeciones', 'claude', 'abajo'], ['narrativa', 'claude', 'abajo'],
  ['claude', 'general', 'h'], ['general', 'yt', 'h'], ['general', 'reel', 'h'], ['general', 'story', 'h'],
  ['yt', 'ytAprob', 'h'], ['ytAprob', 'ytEnt', 'h'], ['ytEnt', 'ytDocs', 'h'], ['ytEnt', 'ytCanva', 'h'], ['ytEnt', 'ytPlay', 'h'],
  ['reel', 'reelAprob', 'h'], ['reelAprob', 'reelEnt', 'h'], ['reelAprob', 'reelGuion', 'h'], ['reelEnt', 'reelDocs', 'h'], ['reelEnt', 'reelPlay', 'h'],
  ['story', 'storySec', 'h'], ['storySec', 'storyEnt', 'h'], ['storyEnt', 'storyDocs', 'h'], ['storyEnt', 'storyPlay', 'h'],
];

const PROXIMAMENTE = new Set(['ytEnt', 'ytDocs', 'ytCanva', 'ytPlay', 'reelEnt', 'reelGuion', 'reelDocs', 'reelPlay', 'storyEnt', 'storyDocs', 'storyPlay']);
const CONTEXTO = ['dolores', 'diferenciales', 'objeciones', 'narrativa'];
const CANAL_DE = { yt: 'yt', reel: 'reel', story: 'story' };
const NOMBRE_CANAL = { yt: 'YouTube', reel: 'Reels', story: 'Historias' };
const ESTADO = { propuesta: 'Propuesta', aprobada: 'Aprobada', descartada: 'Descartada' };
const LARGOS = ['corta', 'media', 'larga'];
const OBJ_DEFECTO = { corta: 'palabra', media: 'ensenar', larga: 'mostrar' };

function camino(a, b, forma) {
  if (forma === 'arriba') {
    const x1 = a.x + a.w / 2, y1 = a.y, x2 = b.x + b.w / 2, y2 = b.y + b.h;
    return `M${x1},${y1} C${x1},${y1 - 40} ${x2},${y2 + 30} ${x2},${y2}`;
  }
  if (forma === 'abajo') {
    const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y;
    return `M${x1},${y1} L${x2},${y2}`;
  }
  const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
  const m = (x2 - x1) * 0.5;
  return `M${x1},${y1} C${x1 + m},${y1} ${x2 - m},${y2} ${x2},${y2}`;
}

/* ------------------------------------------------------------ paneles */

function PanelCargar({ tipo, onCargada }) {
  const [modo, setModo] = useState('fathom');
  const [link, setLink] = useState('');
  const [texto, setTexto] = useState('');
  const [titulo, setTitulo] = useState('');
  const [archivos, setArchivos] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const listo = modo === 'fathom' ? link.trim() : modo === 'pegar' ? texto.trim().length > 200 : archivos.length > 0;
  const enviar = async (e) => {
    e.preventDefault();
    setOcupado(true); setError('');
    try {
      if (modo === 'archivos') {
        const r = await pizarraSubirArchivos(archivos, tipo);
        if (!r.cargadas.length) throw new Error(r.errores[0]?.detalle || 'No se cargó ningún archivo.');
        onCargada(r.cargadas[0]);
      } else {
        onCargada(await pizarraCrearLlamada(modo === 'fathom' ? { link, tipo } : { texto, titulo, tipo }));
      }
    } catch (err) { setError(err.message); } finally { setOcupado(false); }
  };
  return (
    <form className="pz-sec" onSubmit={enviar}>
      <span className="pz-k">Cargar {tipo === 'clase' ? 'clase grupal' : '1 a 1'}</span>
      <div className="pz-segmento" role="tablist">
        {[['fathom', 'Link de Fathom o Zoom'], ['pegar', 'Pegar'], ['archivos', 'Subir archivo']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={modo === k} onClick={() => setModo(k)}>{l}</button>
        ))}
      </div>
      {modo === 'fathom' && <input id="pz-link" className="pz-input" type="url" placeholder="fathom.video/share/… o zoom.us/rec/…" value={link} onChange={(e) => setLink(e.target.value)} />}
      {modo === 'pegar' && (
        <>
          <input id="pz-titulo" className="pz-input" type="text" placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          <textarea id="pz-texto" rows={10} placeholder="Pegá la transcripción" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </>
      )}
      {modo === 'archivos' && (
        <label className="pz-drop">
          <input id="pz-archivos" type="file" accept=".txt,.vtt,text/plain,text/vtt" multiple onChange={(e) => setArchivos([...e.target.files])} />
          <span>{archivos.length ? `${archivos.length} archivo${archivos.length > 1 ? 's' : ''}` : 'Transcripción de Fathom (.txt) o de Zoom (.vtt)'}</span>
        </label>
      )}
      {error && <p className="pz-error">{error}</p>}
      <div className="pz-botones"><button type="submit" className="btn primary" disabled={!listo || ocupado}>{ocupado ? 'Cargando…' : 'Cargar'}</button></div>
    </form>
  );
}

const ACCION = { agregar: 'Agregar', cambiar: 'Cambiar', quitar: 'Sacar' };
const fechaCorta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

/**
 * La revisión semanal de la narrativa: cada lunes Claude lee lo que Juan publicó la semana
 * anterior y propone cambios. Nada se aplica solo: cada cambio se acepta o se descarta.
 */
function RevisionNarrativa({ onAplicado }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const traer = useCallback(() => getNarrativaPropuestas(true).then(setDatos).catch((e) => setError(e.message)), []);
  useEffect(() => { traer(); }, [traer]);
  const armando = datos?.armando || datos?.propuestas?.[0]?.estado === 'armando';
  useEffect(() => {
    if (!armando) return undefined;
    const t = setInterval(traer, 5000);
    return () => clearInterval(t);
  }, [armando, traer]);
  const revisar = async () => { setError(''); try { setDatos(await narrativaRevisar()); } catch (e) { setError(e.message); } };
  const decidir = async (p, c, estado) => {
    setError('');
    try {
      const r = await narrativaDecidir(p.id, c.id, estado);
      setDatos((d) => ({ ...d, propuestas: r.propuestas }));
      onAplicado(r.contexto);
    } catch (e) { setError(e.message); }
  };
  const ultima = datos?.propuestas?.[0];
  return (
    <div className="pz-sec">
      <div className="pz-botones" style={{ justifyContent: 'space-between', paddingRight: 32 }}>
        <span className="pz-k">Revisión semanal</span>
        <button type="button" className="btn sm ghost" disabled={armando} onClick={revisar}>{armando ? 'Revisando…' : 'Revisar ahora'}</button>
      </div>
      {error && <p className="pz-error">{error}</p>}
      {!ultima && datos && <p className="pz-dim">Todavía no hubo revisión. Corre sola los lunes.</p>}
      {ultima && ultima.estado !== 'armando' && (
        <span className="pz-dim">Semana del {fechaCorta(ultima.desde)} al {fechaCorta(ultima.hasta)} · {ultima.fuentes.reels ?? 0} reels, {ultima.fuentes.youtube ?? 0} videos, {ultima.fuentes.historias ?? 0} historias</span>
      )}
      {ultima?.estado === 'error' && <p className="pz-error">{ultima.error}</p>}
      {ultima?.estado === 'sin_cambios' && <p className="pz-dim">Esa semana no trajo nada que cambie la narrativa.</p>}
      <div className="pz-variantes">
        {(ultima?.cambios || []).map((c) => (
          <div key={c.id} className={`pz-var ${c.estado === 'aceptado' ? 'aprobada' : c.estado === 'descartado' ? 'descartada' : ''}`}>
            <span className="pz-k">{ACCION[c.accion]}</span>
            {c.linea_actual && <span className={c.accion === 'agregar' ? '' : 'pz-tachado'}>{c.linea_actual}</span>}
            {c.linea_nueva && <b>{c.linea_nueva}</b>}
            {c.motivo && <span className="pz-dim">{c.motivo}</span>}
            {c.evidencias.map((e) => (
              <blockquote key={e.ref + e.cita} className="pz-cita">
                <span className="pz-min">{e.ref.split(':')[0]} · {fechaCorta(e.fecha)}</span>{e.cita}{!e.verificada && <span className="pz-dim"> (de una historia, sin verificar)</span>}
              </blockquote>
            ))}
            {c.estado === 'pendiente' ? (
              <div className="pz-botones">
                <button type="button" className="btn sm primary" onClick={() => decidir(ultima, c, 'aceptado')}>Aceptar</button>
                <button type="button" className="btn sm" onClick={() => decidir(ultima, c, 'descartado')}>Descartar</button>
              </div>
            ) : <span className={`pz-st ${c.estado === 'aceptado' ? 'aprobada' : 'descartada'}`}>{c.estado === 'aceptado' ? 'Aplicado' : 'Descartado'}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelDibujos({ llamada, onBuscar, onEstado, onMover }) {
  const [fotoId, setFotoId] = useState(null);
  const [moviendo, setMoviendo] = useState(false);
  const lista = llamada.dibujos || [];
  const foto = lista.find((d) => d.id === fotoId) || null;
  const mover = async (e, seg) => {
    e.stopPropagation();
    setMoviendo(true);
    try { await onMover(foto.id, seg); } finally { setMoviendo(false); }
  };
  const est = llamada.dibujosEstado;
  if (llamada.fuente !== 'fathom') return null;
  return (
    <div className="pz-sec">
      <span className="pz-k">Dibujos de la llamada{lista.length ? ` · ${lista.filter((d) => d.estado === 'visible').length}` : ''}</span>
      {est === 'buscando' && <p className="pz-dim">Buscando en el video…</p>}
      {est === 'error' && <p className="pz-error">{llamada.dibujosError}</p>}
      {est === 'listos' && !lista.length && <p className="pz-dim">No dibujó en esta llamada.</p>}
      {lista.length > 0 && (
        <div className="pz-dibujos">
          {lista.map((d) => (
            <figure key={d.id} className={d.estado === 'descartado' ? 'descartado' : ''}>
              <button type="button" className="pz-dibujo" onClick={() => setFotoId(d.id)} aria-label={`Dibujo del minuto ${d.minuto}`}>
                <img src={d.src} alt="" loading="lazy" />
              </button>
              <figcaption>
                <span>{d.minuto}</span>
                <button type="button" className="btn sm ghost" onClick={() => onEstado(d.id, d.estado === 'descartado' ? 'visible' : 'descartado')}>
                  {d.estado === 'descartado' ? 'Recuperar' : 'Descartar'}
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {est !== 'buscando' && (
        <div className="pz-botones"><button type="button" className="btn ghost" onClick={onBuscar}>{est ? 'Volver a buscar' : 'Buscar dibujos'}</button></div>
      )}
      {foto && createPortal(
        <div className="es-visor" role="presentation" onClick={() => setFotoId(null)}>
          <img src={foto.src} alt="" className={moviendo ? 'pz-visor-cargando' : ''} />
          <div className="pz-visor-mover">
            <button type="button" className="btn sm" disabled={moviendo} onClick={(e) => mover(e, -6)}>◀ antes</button>
            <span>{foto.minuto}</span>
            <button type="button" className="btn sm" disabled={moviendo} onClick={(e) => mover(e, 6)}>después ▶</button>
          </div>
          {foto.dicho && <p className="pz-visor-dicho">{foto.minuto} · {foto.dicho}</p>}
        </div>,
        document.body,
      )}
    </div>
  );
}

function PanelGeneral({ generales, elegida, llamada, onGenerar, onAbrir }) {
  const armando = llamada?.estado === 'armando';
  return (
    <div className="pz-sec">
      <span className="pz-k">Ideas generales{generales.length ? ` · ${generales.length}` : ''}</span>
      {armando && <p className="pz-dim">{llamada?.dibujosEstado === 'buscando' ? 'Esperando los dibujos del video…' : 'Claude está leyendo la llamada…'}</p>}
      {!armando && llamada?.error && <p className="pz-error">{llamada.error}</p>}
      <div className="pz-variantes">
        {generales.map((x) => (
          <button key={x.id} type="button" className={`pz-docprev${x.id === elegida ? ' sel' : ''}`} onClick={() => onAbrir(x.id)}>
            <span className="dc-icono" aria-hidden="true" />
            <span>
              <b>{x.titulo}</b>
              {x.detalle && <span className="pz-dim pz-dos-lineas">{x.detalle}</span>}
              {x.conDibujo && <span className="pz-tag">con dibujo</span>}
              {x.estado === 'aprobada' && <span className="pz-st aprobada">Aprobada</span>}
            </span>
          </button>
        ))}
      </div>
      {!armando && (
        <div className="pz-botones">
          <button type="button" className={`btn${generales.length ? ' ghost' : ' primary'}`} onClick={onGenerar}>
            {generales.length ? 'Otras ideas' : 'Sacar ideas'}
          </button>
        </div>
      )}
    </div>
  );
}

function PanelVariantes({ canal, g, soloAprobadas, onVariante, onRegenerar, estructuras = {}, onEstructuras }) {
  const lista = (g?.variantes?.[canal] || []).filter((v) => (soloAprobadas ? v.estado === 'aprobada' : true));
  return (
    <div className="pz-sec">
      <span className="pz-k">{soloAprobadas ? `${NOMBRE_CANAL[canal]} · aprobadas` : `Ideas de ${NOMBRE_CANAL[canal]}`}</span>
      {g?.variantesEstado === 'armando' && <p className="pz-dim">Claude está armando las variantes…</p>}
      {g?.variantesEstado === 'error' && <p className="pz-error">{g.error}</p>}
      <div className="pz-variantes">
        {lista.map((v) => (
          <div key={v.id} className={`pz-var ${v.estado}`}>
            {v.estructura && <span className="pz-tag">{estructuras[v.estructura] || v.estructura}</span>}
            <b>{v.titulo}</b>
            {v.detalle && <span className="pz-dim">{v.detalle}</span>}
            <div className="pz-botones">
              <span className={`pz-st ${v.estado}`}>{ESTADO[v.estado]}</span>
              {v.estado === 'propuesta' && (
                <>
                  <button type="button" className="btn sm primary" onClick={() => onVariante(v.id, { estado: 'aprobada' })}>Aprobar</button>
                  <button type="button" className="btn sm" onClick={() => onVariante(v.id, { estado: 'descartada' })}>Descartar</button>
                </>
              )}
              {v.estado !== 'propuesta' && <button type="button" className="btn sm ghost" onClick={() => onVariante(v.id, { estado: 'propuesta' })}>{v.estado === 'aprobada' ? 'Sacar del vault' : 'Recuperar'}</button>}
            </div>
          </div>
        ))}
      </div>
      {soloAprobadas ? <Link to="/marketing/vault" className="pz-link">Ver el vault de ideas</Link>
        : g?.variantesEstado !== 'armando' && (
          <div className="pz-botones">
            <button type="button" className="btn ghost" onClick={onRegenerar}>Otras variantes</button>
            {canal === 'story' && onEstructuras && <button type="button" className="btn ghost" onClick={onEstructuras}>Estructuras</button>}
          </div>
        )}
    </div>
  );
}

function PanelSecuencias({ g, elegida, onElegir, onArmar, estructuras = {} }) {
  const aprobadas = (g?.variantes?.story || []).filter((v) => v.estado === 'aprobada');
  const [obj, setObj] = useState(OBJ_DEFECTO);
  const v = aprobadas.find((x) => x.id === elegida) || aprobadas[0];
  return (
    <div className="pz-sec">
      <span className="pz-k">3 tipos de secuencias</span>
      <div className="pz-variantes">
        {aprobadas.map((x) => (
          <label key={x.id} className={`pz-var elegible${v?.id === x.id ? ' sel' : ''}`}>
            <input type="radio" name="pz-story" checked={v?.id === x.id} onChange={() => onElegir(x.id)} />
            <b>{x.titulo}</b>
            {x.estructura && <span className="pz-tag">{estructuras[x.estructura] || x.estructura}</span>}
            {x.secuencias.length > 0 && <span className="pz-st aprobada">con secuencias</span>}
          </label>
        ))}
      </div>
      {v && (
        <>
          <div className="pz-objetivos">
            {LARGOS.map((l) => (
              <label key={l}>
                <span>{l}</span>
                <select id={`pz-obj-${l}`} value={obj[l]} onChange={(e) => setObj({ ...obj, [l]: e.target.value })}>
                  {Object.entries(OBJETIVO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="pz-botones">
            <button type="button" className="btn primary" disabled={v.secuenciasEstado === 'armando'} onClick={() => onArmar(v.id, obj)}>
              {v.secuenciasEstado === 'armando' ? 'Claude está armando…' : v.secuencias.length ? 'Volver a armar' : 'Armar secuencias'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ pizarra */

export default function Pizarra() {
  const [base, setBase] = useState(null);
  const [error, setError] = useState('');
  const [llamadaId, setLlamadaId] = useLocalState('pz-llamada', null);
  const [llamada, setLlamada] = useState(null);
  const [panel, setPanel] = useState(null); // clave de nodo, o {cargar: tipo}
  const [storyElegida, setStoryElegida] = useState(null);
  const [ctxVersion, setCtxVersion] = useState(0); // sube cuando la revisión semanal cambia la narrativa
  const [doc, setDoc] = useState(null); // el cuadro de contexto abierto como documento
  const [ideaAbierta, setIdeaAbierta] = useState(null); // id de la idea general abierta como documento
  const [generalId, setGeneralId] = useState(null); // la idea aprobada que sigue por el mapa
  const [estructuras, setEstructuras] = useState({}); // clave → nombre de las estructuras de historias
  const [verEstructuras, setVerEstructuras] = useState(false);
  const [aviso, setAviso] = useState('');
  const [escala, setEscala] = useState(1);
  const marcoRef = useRef(null);

  useLayoutEffect(() => {
    const el = marcoRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setEscala(Math.min(1, e.contentRect.width / ANCHO)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [base]);

  const traerBase = useCallback(async (refrescar = false) => {
    try { const b = await getPizarra(refrescar); setBase(b); return b; } catch (e) { setError(e); return null; }
  }, []);
  useEffect(() => { traerBase(); }, [traerBase]);
  const traerEstructuras = useCallback(() => getEstructurasHistorias()
    .then((d) => setEstructuras(Object.fromEntries(d.estructuras.map((e) => [e.clave, e.nombre]))))
    .catch(() => {}), []);
  useEffect(() => { traerEstructuras(); }, [traerEstructuras]);
  useEffect(() => {
    if (base && llamadaId && !base.llamadas.some((l) => l.id === llamadaId)) setLlamadaId(base.llamadas[0]?.id ?? null);
  }, [base, llamadaId, setLlamadaId]);

  const traerLlamada = useCallback(async (id) => {
    if (!id) { setLlamada(null); return; }
    try { setLlamada(await getPizarraLlamada(id, true)); } catch (e) { setError(e); }
  }, []);
  useEffect(() => { traerLlamada(llamadaId); }, [llamadaId, traerLlamada]);

  const generales = llamada?.generales || [];
  const aprobadasGen = generales.filter((x) => x.estado === 'aprobada');
  // Lo que sigue en el mapa (variantes, vault, secuencias) es de la idea aprobada elegida.
  const g = aprobadasGen.find((x) => x.id === generalId) || aprobadasGen.at(-1) || null;
  const variantes = g ? Object.values(g.variantes).flat() : [];
  const armando = llamada?.estado === 'armando' || llamada?.dibujosEstado === 'buscando' || g?.variantesEstado === 'armando' || variantes.some((v) => v.secuenciasEstado === 'armando');

  // Mientras Claude trabaja, se repregunta cada 4 s.
  useEffect(() => {
    if (!armando || !llamada) return undefined;
    const t = setInterval(() => traerLlamada(llamada.id), 4000);
    return () => clearInterval(t);
  }, [armando, llamada?.id, traerLlamada]); // eslint-disable-line react-hooks/exhaustive-deps

  const accion = async (fn) => {
    setAviso('');
    try { const r = await fn(); if (r?.id && r.generales) setLlamada(r); } catch (e) { setAviso(e.message); }
  };

  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (!base) return <div className="page"><SkeletonBlock height={520} /></div>;

  // ---- el estado de cada caja: off (apagada), listo (se puede tocar), hecho (verde), armando
  const aprobadas = (c) => (g?.variantes?.[c] || []).filter((v) => v.estado === 'aprobada');
  const storyConSec = aprobadas('story').find((v) => v.id === storyElegida) || aprobadas('story').find((v) => v.secuencias.length) || aprobadas('story')[0];
  const canalEstado = (c) => {
    if (g?.estado !== 'aprobada') return 'off';
    if (g.variantesEstado === 'armando') return 'armando';
    return aprobadas(c).length ? 'hecho' : 'listo';
  };
  const estado = {
    uno: llamada?.tipo === '1a1' ? 'hecho' : 'listo',
    clase: llamada?.tipo === 'clase' ? 'hecho' : 'listo',
    fathom: llamada ? 'hecho' : 'off',
    claude: !llamada ? 'off' : llamada.estado === 'armando' ? 'armando' : generales.length ? 'hecho' : 'listo',
    general: g ? 'hecho' : generales.length ? 'listo' : 'off',
    yt: canalEstado('yt'), reel: canalEstado('reel'), story: canalEstado('story'),
    ytAprob: aprobadas('yt').length ? 'hecho' : 'off',
    reelAprob: aprobadas('reel').length ? 'hecho' : 'off',
    storySec: !storyConSec ? 'off' : storyConSec.secuenciasEstado === 'armando' ? 'armando' : storyConSec.secuencias.length ? 'hecho' : 'listo',
  };
  CONTEXTO.forEach((c) => { estado[c] = (base.contexto[c]?.texto || '').trim() ? 'hecho' : 'listo'; });
  Object.keys(NODOS).forEach((k) => { if (PROXIMAMENTE.has(k)) estado[k] = 'prox'; });

  const resumen = {
    uno: null, clase: null,
    fathom: !llamada ? null : llamada.dibujosEstado === 'buscando' ? 'buscando dibujos…'
      : (llamada.dibujos || []).some((x) => x.estado === 'visible')
        ? `${llamada.dibujos.filter((x) => x.estado === 'visible').length} dibujos · ${llamada.titulo}` : llamada.titulo,
    claude: estado.claude === 'armando' ? 'leyendo…' : null,
    narrativa: base.narrativaPendientes ? `${base.narrativaPendientes} cambio${base.narrativaPendientes > 1 ? 's' : ''} propuesto${base.narrativaPendientes > 1 ? 's' : ''}` : null,
    general: g ? g.titulo : generales.length ? `${generales.length} idea${generales.length > 1 ? 's' : ''}` : null,
    yt: g?.variantes?.yt?.length ? `${g.variantes.yt.length} ideas` : null,
    reel: g?.variantes?.reel?.length ? `${g.variantes.reel.length} ideas` : null,
    story: g?.variantes?.story?.length ? `${g.variantes.story.length} ideas` : null,
    ytAprob: aprobadas('yt').length ? `${aprobadas('yt').length} en el vault` : null,
    reelAprob: aprobadas('reel').length ? `${aprobadas('reel').length} en el vault` : null,
    storySec: storyConSec?.secuencias.length ? `${storyConSec.secuencias.length} secuencias` : null,
  };

  const tocar = (k) => {
    if (CONTEXTO.includes(k)) { setPanel(null); setDoc(k); return; }
    if (estado[k] === 'off' || estado[k] === 'prox') return;
    if (k === 'uno' || k === 'clase') { setPanel({ cargar: k === 'uno' ? '1a1' : 'clase' }); return; }
    setPanel(k);
  };
  const cable = (desde, hasta) => {
    const a = estado[desde], b = estado[hasta];
    if (a === 'hecho' && b === 'hecho') return 'hecho';
    if (a === 'hecho' && (b === 'listo' || b === 'armando')) return 'listo';
    return 'off';
  };

  const cargada = async (l) => { await traerBase(true); setLlamadaId(l.id); setPanel('claude'); };
  const guardarContexto = async (clave, texto) => { const ctx = await pizarraGuardarContexto(clave, texto); setBase((b) => ({ ...b, contexto: ctx })); };
  const generarGeneral = () => accion(() => pizarraGenerarGeneral(llamada.id));
  const abierta = generales.find((x) => x.id === ideaAbierta) || null;
  const guardarGeneral = async (cambios) => { setLlamada(await pizarraEditarGeneral(abierta.id, cambios)); };
  const aprobarGeneral = async () => { const id = abierta.id; await accion(() => pizarraAprobarGeneral(id)); setGeneralId(id); setIdeaAbierta(null); };
  const descartarGeneral = async () => { const id = abierta.id; setIdeaAbierta(null); await accion(() => pizarraEditarGeneral(id, { estado: 'descartada' })); };
  const abrirGeneral = (id) => { if (generales.find((x) => x.id === id)?.estado === 'aprobada') setGeneralId(id); setIdeaAbierta(id); };
  const cambioVariante = (id, cambios) => accion(() => pizarraActualizarVariante(id, cambios));
  const armar = (id, obj) => { setStoryElegida(id); accion(() => pizarraGenerarSecuencias(id, obj)); };
  const panelClave = typeof panel === 'string' ? panel : null;
  const borrarLlamada = async () => {
    const enVault = (llamada.generales || []).flatMap((x) => Object.values(x.variantes || {}).flat()).filter((v) => v.estado === 'aprobada').length;
    const aprobada = llamada.generales?.some((x) => x.estado === 'aprobada');
    const extra = enVault ? (enVault > 1 ? `\n\nSe borran también las ${enVault} ideas del vault que salieron de esta llamada.` : '\n\nSe borra también la idea del vault que salió de esta llamada.') : aprobada ? '\n\nSe borra también su idea general aprobada.' : '';
    if (!window.confirm(`¿Borrar la llamada "${llamada.titulo}"?${extra}`)) return;
    setAviso('');
    try {
      await pizarraBorrarLlamada(llamada.id, aprobada);
      setLlamadaId(null); setLlamada(null); setPanel(null); setIdeaAbierta(null);
      traerBase(true);
    } catch (e) { setAviso(e.message); }
  };

  return (
    <div className="page page-ancha pz">
      <div className="pz-barra">
        <select id="pz-llamada" className="pz-select" aria-label="Llamada" value={llamadaId ?? ''} onChange={(e) => { setLlamadaId(Number(e.target.value) || null); setPanel(null); setGeneralId(null); }}>
          <option value="">{base.llamadas.length ? 'Elegí una llamada' : 'Sin llamadas cargadas'}</option>
          {base.llamadas.map((l) => <option key={l.id} value={l.id}>{l.tipo === 'clase' ? 'Clase · ' : '1 a 1 · '}{l.titulo}</option>)}
        </select>
        {llamada && <button type="button" className="btn ghost" onClick={borrarLlamada}>Borrar</button>}
        <span className="pz-sep" />
        {aviso && <span className="pz-error">{aviso}</span>}
        <Link to="/marketing/vault" className="btn">Vault de ideas</Link>
      </div>

      <div className="pz-marco" ref={marcoRef} style={{ height: ALTO * escala }}>
        <div className="pz-mapa" style={{ width: ANCHO, height: ALTO, transform: `scale(${escala})` }}>
          <svg className="pz-cables" width={ANCHO} height={ALTO} aria-hidden="true">
            <defs>
              {['off', 'listo', 'hecho'].map((t) => (
                <marker key={t} id={`pz-punta-${t}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" className={`pz-punta ${t}`} />
                </marker>
              ))}
            </defs>
            {CABLES.map(([a, b, f]) => {
              const t = cable(a, b);
              return <path key={`${a}-${b}`} d={camino(NODOS[a], NODOS[b], f)} className={`pz-cable ${t}`} markerEnd={`url(#pz-punta-${t})`} />;
            })}
          </svg>
          {Object.entries(NODOS).map(([k, n]) => {
            const e = estado[k];
            const activo = panelClave === k || (panel?.cargar && ((k === 'uno' && panel.cargar === '1a1') || (k === 'clase' && panel.cargar === 'clase')));
            return (
              <button key={k} type="button" className={`pz-nodo ${e}${activo ? ' sel' : ''}`}
                style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
                disabled={e === 'off' || e === 'prox'} title={e === 'prox' ? 'Próximamente' : undefined} onClick={() => tocar(k)}>
                <span className="pz-nodo-l">{n.label}</span>
                {resumen[k] ? <span className="pz-nodo-r">{resumen[k]}</span> : n.sub && <span className="pz-nodo-r">{n.sub}</span>}
              </button>
            );
          })}
        </div>

        {panel && (
          <aside className="pz-panel" aria-live="polite">
            <button type="button" className="btn icon pz-cerrar" onClick={() => setPanel(null)} aria-label="Cerrar">✕</button>
            {panel.cargar && <PanelCargar tipo={panel.cargar} onCargada={cargada} />}
            {panelClave === 'fathom' && llamada && (
              <div className="pz-sec">
                <span className="pz-k">{llamada.tipo === 'clase' ? 'Clase grupal' : '1 a 1'} · {llamada.fuente}</span>
                <b>{llamada.titulo}</b>
                <span className="pz-dim">{[llamada.fecha, llamada.minutos ? `${llamada.minutos} min` : null].filter(Boolean).join(' · ')}</span>
                {llamada.url && <a href={llamada.url} target="_blank" rel="noreferrer" className="pz-link">Ver grabación</a>}
                <div className="pz-botones"><button type="button" className="btn ghost" onClick={borrarLlamada}>Borrar llamada</button></div>
              </div>
            )}
            {panelClave === 'fathom' && llamada && (
              <PanelDibujos llamada={llamada} onBuscar={() => accion(() => pizarraBuscarDibujos(llamada.id))}
                onEstado={(id, estado) => accion(() => pizarraEstadoDibujo(id, estado))}
                onMover={(id, seg) => accion(() => pizarraMoverDibujo(id, seg))} />
            )}
            {(panelClave === 'claude' || panelClave === 'general') && <PanelGeneral generales={generales} elegida={g?.id} llamada={llamada} onGenerar={generarGeneral} onAbrir={abrirGeneral} />}
            {CANAL_DE[panelClave] && <PanelVariantes canal={panelClave} g={g} estructuras={estructuras} onEstructuras={() => setVerEstructuras(true)} onVariante={cambioVariante} onRegenerar={() => accion(() => pizarraRegenerarVariantes(g.id))} />}
            {(panelClave === 'ytAprob' || panelClave === 'reelAprob') && <PanelVariantes canal={panelClave === 'ytAprob' ? 'yt' : 'reel'} g={g} soloAprobadas onVariante={cambioVariante} />}
            {panelClave === 'storySec' && <PanelSecuencias g={g} estructuras={estructuras} elegida={storyConSec?.id} onElegir={setStoryElegida} onArmar={armar} />}
          </aside>
        )}
      </div>

      {storyConSec?.secuencias.length > 0 && (
        <section className="pz-bocetos">
          <div className="pz-bocetos-h"><span className="pz-k">Secuencias</span><b>{storyConSec.titulo}</b></div>
          <Bocetos secuencias={storyConSec.secuencias} />
        </section>
      )}

      {verEstructuras && <DocumentoEstructuras onCerrar={() => setVerEstructuras(false)} onCambio={traerEstructuras} />}

      {abierta && (
        <DocumentoIdea
          key={abierta.id}
          g={abierta}
          llamada={llamada}
          onGuardar={guardarGeneral}
          onAprobar={aprobarGeneral}
          onDescartar={descartarGeneral}
          onCerrar={() => setIdeaAbierta(null)}
        />
      )}

      {doc && (
        <DocumentoContexto
          key={`${doc}-${ctxVersion}`}
          titulo={NODOS[doc].label}
          valor={base.contexto[doc]}
          onGuardar={(texto) => guardarContexto(doc, texto)}
          onCerrar={() => setDoc(null)}
          flecha={doc === 'objeciones'}
          margen={doc === 'narrativa' ? <RevisionNarrativa onAplicado={(ctx) => { setBase((b) => ({ ...b, contexto: ctx })); setCtxVersion((v) => v + 1); traerBase(true); }} /> : null}
        />
      )}
    </div>
  );
}
