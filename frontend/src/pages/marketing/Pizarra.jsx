import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Bocetos, { OBJETIVO } from '../../components/marketing/Bocetos.jsx';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import {
  getPizarra, getPizarraLlamada, pizarraActualizarVariante, pizarraAprobarGeneral, pizarraBorrarLlamada,
  pizarraCrearLlamada, pizarraEditarGeneral, pizarraGenerarGeneral, pizarraGenerarSecuencias,
  pizarraGuardarContexto, pizarraRegenerarVariantes, pizarraSubirArchivos,
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
        {[['fathom', 'Link de Fathom'], ['pegar', 'Pegar'], ['archivos', 'Subir .txt']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={modo === k} onClick={() => setModo(k)}>{l}</button>
        ))}
      </div>
      {modo === 'fathom' && <input id="pz-link" className="pz-input" type="url" placeholder="https://fathom.video/share/…" value={link} onChange={(e) => setLink(e.target.value)} />}
      {modo === 'pegar' && (
        <>
          <input id="pz-titulo" className="pz-input" type="text" placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          <textarea id="pz-texto" rows={10} placeholder="Pegá la transcripción" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </>
      )}
      {modo === 'archivos' && (
        <label className="pz-drop">
          <input id="pz-archivos" type="file" accept=".txt,text/plain" multiple onChange={(e) => setArchivos([...e.target.files])} />
          <span>{archivos.length ? `${archivos.length} archivo${archivos.length > 1 ? 's' : ''}` : 'Transcripciones exportadas de Fathom'}</span>
        </label>
      )}
      {error && <p className="pz-error">{error}</p>}
      <div className="pz-botones"><button type="submit" className="btn primary" disabled={!listo || ocupado}>{ocupado ? 'Cargando…' : 'Cargar'}</button></div>
    </form>
  );
}

function PanelContexto({ clave, valor, onGuardar }) {
  const [texto, setTexto] = useState(valor?.texto || '');
  const [estado, setEstado] = useState('');
  useEffect(() => { setTexto(valor?.texto || ''); setEstado(''); }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  const guardar = async () => {
    setEstado('guardando');
    try { await onGuardar(clave, texto); setEstado('ok'); } catch (e) { setEstado(e.message); }
  };
  return (
    <div className="pz-sec">
      <span className="pz-k">{NODOS[clave].label}</span>
      <textarea id={`pz-ctx-${clave}`} className="pz-ctx-texto" rows={16} value={texto} onChange={(e) => { setTexto(e.target.value); setEstado(''); }} />
      <div className="pz-botones">
        <button type="button" className="btn primary" disabled={estado === 'guardando' || texto === (valor?.texto || '')} onClick={guardar}>Guardar</button>
        {estado === 'ok' && <span className="pz-ok">Guardado</span>}
        {estado && !['ok', 'guardando'].includes(estado) && <span className="pz-error">{estado}</span>}
      </div>
    </div>
  );
}

function PanelGeneral({ g, llamada, onGenerar, onCambio }) {
  const [titulo, setTitulo] = useState(g?.titulo || '');
  const [detalle, setDetalle] = useState(g?.detalle || '');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setTitulo(g?.titulo || ''); setDetalle(g?.detalle || ''); }, [g?.id, g?.titulo, g?.detalle]);
  if (!g) {
    return (
      <div className="pz-sec">
        <span className="pz-k">Idea general</span>
        {llamada?.estado === 'armando' ? <p className="pz-dim">Claude está leyendo la llamada…</p> : (
          <>
            {llamada?.error && <p className="pz-error">{llamada.error}</p>}
            <div className="pz-botones"><button type="button" className="btn primary" onClick={onGenerar}>Sacar idea general</button></div>
          </>
        )}
      </div>
    );
  }
  const cambio = titulo !== g.titulo || detalle !== (g.detalle || '');
  const hacer = async (fn) => { setOcupado(true); try { await fn(); } finally { setOcupado(false); } };
  return (
    <>
      <div className="pz-sec">
        <span className="pz-k">Idea general{g.editada ? ' · editada' : ''}</span>
        <textarea id="pz-gen-titulo" className="pz-gen-titulo" rows={2} value={titulo} disabled={g.estado === 'aprobada'} onChange={(e) => setTitulo(e.target.value)} />
        <textarea id="pz-gen-detalle" rows={5} value={detalle} disabled={g.estado === 'aprobada'} onChange={(e) => setDetalle(e.target.value)} />
        {g.dolor && <span className="pz-tag">{g.dolor}</span>}
      </div>
      <div className="pz-sec">
        <span className="pz-k">De la llamada</span>
        <blockquote className="pz-cita">{g.minuto && <span className="pz-min">{g.minuto}</span>}{g.cita}</blockquote>
      </div>
      <div className="pz-sec pz-botones">
        {g.estado === 'aprobada' ? <span className="pz-ok">Aprobada{g.aprobadaPor ? ` por ${g.aprobadaPor}` : ''}</span> : (
          <>
            {cambio && <button type="button" className="btn" disabled={ocupado} onClick={() => hacer(() => onCambio('editar', { titulo, detalle }))}>Guardar cambios</button>}
            <button type="button" className="btn primary" disabled={ocupado || cambio} onClick={() => hacer(() => onCambio('aprobar'))}>Aprobar</button>
            <button type="button" className="btn ghost" disabled={ocupado || llamada?.estado === 'armando'} onClick={onGenerar}>Otra idea</button>
          </>
        )}
      </div>
    </>
  );
}

function PanelVariantes({ canal, g, soloAprobadas, onVariante, onRegenerar }) {
  const lista = (g?.variantes?.[canal] || []).filter((v) => (soloAprobadas ? v.estado === 'aprobada' : true));
  return (
    <div className="pz-sec">
      <span className="pz-k">{soloAprobadas ? `${NOMBRE_CANAL[canal]} · aprobadas` : `Ideas de ${NOMBRE_CANAL[canal]}`}</span>
      {g?.variantesEstado === 'armando' && <p className="pz-dim">Claude está armando las variantes…</p>}
      {g?.variantesEstado === 'error' && <p className="pz-error">{g.error}</p>}
      <div className="pz-variantes">
        {lista.map((v) => (
          <div key={v.id} className={`pz-var ${v.estado}`}>
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
        : g?.variantesEstado !== 'armando' && <div className="pz-botones"><button type="button" className="btn ghost" onClick={onRegenerar}>Otras variantes</button></div>}
    </div>
  );
}

function PanelSecuencias({ g, elegida, onElegir, onArmar }) {
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
  useEffect(() => {
    if (base && llamadaId && !base.llamadas.some((l) => l.id === llamadaId)) setLlamadaId(base.llamadas[0]?.id ?? null);
  }, [base, llamadaId, setLlamadaId]);

  const traerLlamada = useCallback(async (id) => {
    if (!id) { setLlamada(null); return; }
    try { setLlamada(await getPizarraLlamada(id, true)); } catch (e) { setError(e); }
  }, []);
  useEffect(() => { traerLlamada(llamadaId); }, [llamadaId, traerLlamada]);

  const g = llamada?.generales?.at(-1) || null;
  const variantes = g ? Object.values(g.variantes).flat() : [];
  const armando = llamada?.estado === 'armando' || g?.variantesEstado === 'armando' || variantes.some((v) => v.secuenciasEstado === 'armando');

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
    claude: !llamada ? 'off' : llamada.estado === 'armando' ? 'armando' : g ? 'hecho' : 'listo',
    general: !g ? 'off' : g.estado === 'aprobada' ? 'hecho' : 'listo',
    yt: canalEstado('yt'), reel: canalEstado('reel'), story: canalEstado('story'),
    ytAprob: aprobadas('yt').length ? 'hecho' : 'off',
    reelAprob: aprobadas('reel').length ? 'hecho' : 'off',
    storySec: !storyConSec ? 'off' : storyConSec.secuenciasEstado === 'armando' ? 'armando' : storyConSec.secuencias.length ? 'hecho' : 'listo',
  };
  CONTEXTO.forEach((c) => { estado[c] = (base.contexto[c]?.texto || '').trim() ? 'hecho' : 'listo'; });
  Object.keys(NODOS).forEach((k) => { if (PROXIMAMENTE.has(k)) estado[k] = 'prox'; });

  const resumen = {
    uno: null, clase: null,
    fathom: llamada ? llamada.titulo : null,
    claude: estado.claude === 'armando' ? 'leyendo…' : null,
    general: g ? g.titulo : null,
    yt: g?.variantes?.yt?.length ? `${g.variantes.yt.length} ideas` : null,
    reel: g?.variantes?.reel?.length ? `${g.variantes.reel.length} ideas` : null,
    story: g?.variantes?.story?.length ? `${g.variantes.story.length} ideas` : null,
    ytAprob: aprobadas('yt').length ? `${aprobadas('yt').length} en el vault` : null,
    reelAprob: aprobadas('reel').length ? `${aprobadas('reel').length} en el vault` : null,
    storySec: storyConSec?.secuencias.length ? `${storyConSec.secuencias.length} secuencias` : null,
  };

  const tocar = (k) => {
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
  const cambioGeneral = (tipo, cambios) => accion(() => (tipo === 'aprobar' ? pizarraAprobarGeneral(g.id) : pizarraEditarGeneral(g.id, cambios)));
  const cambioVariante = (id, cambios) => accion(() => pizarraActualizarVariante(id, cambios));
  const armar = (id, obj) => { setStoryElegida(id); accion(() => pizarraGenerarSecuencias(id, obj)); };
  const panelClave = typeof panel === 'string' ? panel : null;

  return (
    <div className="page page-ancha pz">
      <div className="pz-barra">
        <select id="pz-llamada" className="pz-select" aria-label="Llamada" value={llamadaId ?? ''} onChange={(e) => { setLlamadaId(Number(e.target.value) || null); setPanel(null); }}>
          <option value="">{base.llamadas.length ? 'Elegí una llamada' : 'Sin llamadas cargadas'}</option>
          {base.llamadas.map((l) => <option key={l.id} value={l.id}>{l.tipo === 'clase' ? 'Clase · ' : '1 a 1 · '}{l.titulo}</option>)}
        </select>
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
                {!llamada.generales?.some((x) => x.estado === 'aprobada') && (
                  <div className="pz-botones"><button type="button" className="btn ghost" onClick={async () => { await accion(() => pizarraBorrarLlamada(llamada.id)); setLlamadaId(null); setPanel(null); traerBase(true); }}>Borrar llamada</button></div>
                )}
              </div>
            )}
            {CONTEXTO.includes(panelClave) && <PanelContexto clave={panelClave} valor={base.contexto[panelClave]} onGuardar={guardarContexto} />}
            {(panelClave === 'claude' || panelClave === 'general') && <PanelGeneral g={g} llamada={llamada} onGenerar={generarGeneral} onCambio={cambioGeneral} />}
            {CANAL_DE[panelClave] && <PanelVariantes canal={panelClave} g={g} onVariante={cambioVariante} onRegenerar={() => accion(() => pizarraRegenerarVariantes(g.id))} />}
            {(panelClave === 'ytAprob' || panelClave === 'reelAprob') && <PanelVariantes canal={panelClave === 'ytAprob' ? 'yt' : 'reel'} g={g} soloAprobadas onVariante={cambioVariante} />}
            {panelClave === 'storySec' && <PanelSecuencias g={g} elegida={storyConSec?.id} onElegir={setStoryElegida} onArmar={armar} />}
          </aside>
        )}
      </div>

      {storyConSec?.secuencias.length > 0 && (
        <section className="pz-bocetos">
          <div className="pz-bocetos-h"><span className="pz-k">Secuencias</span><b>{storyConSec.titulo}</b></div>
          <Bocetos secuencias={storyConSec.secuencias} />
        </section>
      )}
    </div>
  );
}
