import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getFondos, pizarraGuardarSecuencia, pizarraSincronizarFondos } from '../../data/api.js';
import { Bloque, Figura, Fondo, LARGO, MARCA, normal, OBJETIVO, posicion, TINTA } from './Bocetos.jsx';

/**
 * Editor de una secuencia de historias, en el lugar del boceto: se escribe encima de cada
 * tarjeta, se marcan palabras (negrita, rojo, óvalo, subrayado, tachado), se raya a mano, se
 * ponen figuras y notas, se mueven, suman o sacan historias y se elige una foto de fondo.
 *
 * El texto se guarda con las mismas marcas que escribe la IA (**negrita**, [[óvalo]],
 * {{rojo}}, ~~tachado~~, __subrayado__): así la vista y lo que aprende la pizarra leen lo mismo.
 * Rayones y figuras van en un espacio de 0 a 1000 por tarjeta para que escalen con ella.
 * Arrastrar no toca el estado en cada movimiento: se mueve con transform y se guarda al soltar.
 */

const MARCAS = {
  b: { abre: '**', cierra: '**', tag: 'b', sel: 'b,strong' },
  r: { abre: '{{', cierra: '}}', tag: 'span', clase: 'bc-rojo', sel: '.bc-rojo' },
  o: { abre: '[[', cierra: ']]', tag: 'span', clase: 'bc-ovalo', sel: '.bc-ovalo' },
  u: { abre: '__', cierra: '__', tag: 'span', clase: 'bc-subrayado', sel: '.bc-subrayado,u' },
  s: { abre: '~~', cierra: '~~', tag: 's', clase: 'bc-tachado', sel: '.bc-tachado,s,strike' },
};
const FIGURAS = [
  ['rect', '□', 'Cuadrado: tocá una historia para ponerlo'], ['circ', '○', 'Círculo'], ['linea', '╱', 'Línea'],
  ['flecha', '➝', 'Flecha'], ['nota', '▤ Nota', 'Nota adhesiva para el equipo'],
];
// Tamaño con el que nace cada figura, en el espacio de 0 a 1000 de la tarjeta.
const TAMANO_FIGURA = { rect: [380, 150], circ: [380, 150], linea: [430, 70], flecha: [430, 70], nota: [480, 180] };
const MIN_PASO = 4;   // distancia mínima entre dos puntos de un rayón: menos es ruido y pesa
const MAX_CAMINO = 18000;   // el backend no acepta rayones más largos: ahí se deja de sumar puntos
const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------------------------------------ marcas ⇄ html */

function aHtml(texto) {
  return (texto || '').split('\n').map((linea) => linea.split(MARCA).map((p) => {
    const m = Object.values(MARCAS).find((x) => p.length > 4 && p.startsWith(x.abre) && p.endsWith(x.cierra));
    if (!m) return esc(p);
    const dentro = esc(p.slice(2, -2));
    return m.clase ? `<${m.tag} class="${m.clase}">${dentro}</${m.tag}>` : `<${m.tag}>${dentro}</${m.tag}>`;
  }).join('')).join('<br>');
}

function marcaDe(el) {
  return Object.keys(MARCAS).find((k) => el.matches?.(MARCAS[k].sel)) || null;
}

/** El texto editado de vuelta a las marcas. Si hay marcas una dentro de otra, gana la de
 * adentro: la sintaxis no las anida. Los saltos salen de <br> y de los <div> que mete el
 * navegador al apretar Enter. */
function aMarcas(raiz) {
  const trozos = [];
  const fin = () => trozos.at(-1)?.t.endsWith('\n') ?? true;
  const recorrer = (nodo, marca) => {
    nodo.childNodes.forEach((n) => {
      if (n.nodeType === 3) trozos.push({ t: n.nodeValue.replace(/ /g, ' '), m: marca });
      else if (n.nodeName === 'BR') trozos.push({ t: '\n', m: null });
      else if (n.nodeType === 1) {
        if ((n.nodeName === 'DIV' || n.nodeName === 'P') && !fin()) trozos.push({ t: '\n', m: null });
        recorrer(n, marcaDe(n) || marca);
      }
    });
  };
  recorrer(raiz, null);
  const lineas = [[]];
  trozos.forEach(({ t, m }) => t.split('\n').forEach((parte, i) => {
    if (i > 0) lineas.push([]);
    if (parte) lineas.at(-1).push({ t: parte, m });
  }));
  return lineas.map((linea) => {
    const juntos = [];
    linea.forEach((x) => (juntos.at(-1)?.m === x.m ? (juntos.at(-1).t += x.t) : juntos.push({ ...x })));
    return juntos.map(({ t, m }) => {
      const k = MARCAS[m];
      const dentro = t.trim();
      // Sin texto, o con el mismo signo de la marca adentro, la marca no se podría leer.
      if (!k || !dentro || dentro.includes(k.abre[0]) || dentro.includes(k.cierra[0])) return t;
      return `${t.slice(0, t.indexOf(dentro))}${k.abre}${dentro}${k.cierra}${t.slice(t.indexOf(dentro) + dentro.length)}`;
    }).join('');
  }).join('\n').replace(/\n+$/, '');
}

/** Texto que se edita en el lugar. No se controla desde React: si se pisara en cada tecla,
 * el cursor saltaría. Para volver atrás (deshacer) se vuelve a montar con otra `key`. */
function Editable({ html, className, onFoco, onCambio, activo, datos }) {
  const ref = useRef(null);
  useLayoutEffect(() => { ref.current.innerHTML = html; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className={className} contentEditable={activo} suppressContentEditableWarning spellCheck={false}
      onFocus={onFoco} onInput={() => onCambio(ref.current)} {...datos} />
  );
}

/* ------------------------------------------------------------ fondos */

function PanelFondos({ elegida, onElegir }) {
  const [q, setQ] = useState('');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => getFondos(q.trim()).then(setDatos).catch((e) => setError(e.message)), 250);
    return () => clearTimeout(t);
  }, [q]);
  const sincronizar = async () => {
    setLeyendo(true); setError('');
    try { await pizarraSincronizarFondos(); setDatos(await getFondos(q.trim())); } catch (e) { setError(e.message); } finally { setLeyendo(false); }
  };
  return (
    <div className="ed-fondos">
      <div className="ed-fondos-h">
        <span className="pz-k">Fondos · historia {elegida + 1}</span>
        <input type="search" className="pz-input ed-buscar" placeholder="Buscar: noche, oficina, Juan…" aria-label="Buscar fondo"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn sm ghost" disabled={leyendo} onClick={sincronizar}
          title={datos?.sinDescribir ? `${datos.sinDescribir} fotos sin describir todavía` : 'Traer las fotos nuevas del álbum'}>
          {leyendo ? 'Leyendo…' : 'Actualizar álbum'}
        </button>
      </div>
      {error && <p className="pz-error">{error}</p>}
      <div className="ed-grilla">
        <button type="button" className="ed-foto sin" onClick={() => onElegir(null)}><span>Sin fondo</span></button>
        {(datos?.fotos || []).map((f) => (
          <button key={f.id} type="button" className="ed-foto" title={f.descripcion || undefined} onClick={() => onElegir(f)}>
            <img src={f.thumb} alt={f.descripcion || ''} loading="lazy" referrerPolicy="no-referrer" />
          </button>
        ))}
      </div>
      {datos && !datos.fotos.length && <span className="pz-dim">{q ? 'Ninguna foto coincide.' : 'Sin fotos.'}</span>}
    </div>
  );
}

/* ------------------------------------------------------------ editor */

let _clave = 0;
const nuevaClave = () => { _clave += 1; return `h${_clave}`; };

function inicial(s) {
  return s.historias.map((x, i) => {
    const h = normal(x);
    return {
      k: nuevaClave(), origen: h.origen === undefined ? i : h.origen, bloques: h.bloques.map((b) => ({ ...b })),
      trazos: [...(h.trazos || [])], figuras: (h.figuras || []).map((f) => ({ ...f })), fondo: h.fondo ?? null, fondoSrc: h.fondoSrc ?? null,
    };
  });
}

/** El punto del puntero en el espacio de 0 a 1000 de la tarjeta (si se sale, queda en el borde). */
function punto(e, caja) {
  const c = (v) => Math.min(1000, Math.max(0, Math.round(v * 1000)));
  return [c((e.clientX - caja.left) / caja.width), c((e.clientY - caja.top) / caja.height)];
}

export default function EditorSecuencia({ s, onCancelar, onGuardado }) {
  const [hist, setHist] = useState(() => inicial(s));
  const [modo, setModo] = useState('editar'); // editar | lapiz | goma
  const [color, setColor] = useState('rojo');
  const [relleno, setRelleno] = useState(false);
  const [figTipo, setFigTipo] = useState(null);
  const [figSel, setFigSel] = useState(null); // {k, i}
  const [elegida, setElegida] = useState(hist[0]?.k);
  const [verFondos, setVerFondos] = useState(false);
  const [rev, setRev] = useState(0); // sube al deshacer: los textos se vuelven a montar
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const histRef = useRef(hist);   // lo último, para los manejadores (deshacer, arrastrar)
  useLayoutEffect(() => { histRef.current = hist; }, [hist]);
  const pila = useRef([]);

  const paso = useCallback(() => {
    pila.current.push(structuredClone(histRef.current));
    if (pila.current.length > 80) pila.current.shift();
  }, []);
  const deshacer = useCallback(() => {
    const previo = pila.current.pop();
    if (!previo) return;
    setHist(previo); setFigSel(null); setRev((r) => r + 1);
  }, []);
  const cambiar = (k, fn) => setHist((hs) => hs.map((h) => (h.k === k ? fn(h) : h)));

  // ---- teclado: deshacer, borrar la figura elegida, salir de poner figuras
  useEffect(() => {
    const tecla = (e) => {
      const escribiendo = document.activeElement?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (e.key === 'Escape') { setFigTipo(null); setFigSel(null); return; }
      if (escribiendo) return;   // ahí el navegador deshace y borra lo escrito
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); deshacer(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && figSel) {
        e.preventDefault(); paso();
        setHist((hs) => hs.map((h) => (h.k === figSel.k ? { ...h, figuras: h.figuras.filter((_, j) => j !== figSel.i) } : h)));
        setFigSel(null); setRev((r) => r + 1);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'v') setModo('editar');
      if (e.key === 'p') setModo('lapiz');
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [figSel, deshacer, paso]);

  // ---- texto
  const textoDe = (el) => {
    const { k, j } = el.dataset;
    const texto = aMarcas(el);
    cambiar(k, (h) => ({ ...h, bloques: h.bloques.map((b, n) => (n === Number(j) ? { ...b, texto } : b)) }));
  };
  const formatear = (tipo) => {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const r = sel.getRangeAt(0);
    const base = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
    const ed = base?.closest('.ed-texto');
    if (!ed) return;
    paso();
    const m = MARCAS[tipo];
    const ya = base.closest(m.sel);
    if (ya && ed.contains(ya) && ya !== ed) {
      ya.replaceWith(...ya.childNodes);   // ya estaba marcado: se desmarca
    } else {
      const el = document.createElement(m.tag);
      if (m.clase) el.className = m.clase;
      el.appendChild(r.extractContents());
      r.insertNode(el);
      sel.removeAllRanges();
    }
    textoDe(ed);
  };

  // ---- historias
  const agregarHistoria = () => {
    paso();
    const k = nuevaClave();
    setHist((hs) => [...hs, { k, origen: null, bloques: [{ tipo: 'texto', tamano: 'n', texto: 'escribí acá' }], trazos: [], figuras: [], fondo: null, fondoSrc: null }]);
    setElegida(k);
  };
  const sacarHistoria = (k) => { paso(); setHist((hs) => hs.filter((h) => h.k !== k)); };
  const mover = (de, a) => {
    if (de === a) return;
    paso();
    setHist((hs) => { const c = [...hs]; const [x] = c.splice(de, 1); c.splice(a, 0, x); return c; });
  };
  const agregarImagen = () => {
    const k = elegida ?? hist.at(-1)?.k;
    if (!k) return;
    paso();
    cambiar(k, (h) => {
      const img = { tipo: 'imagen', texto: 'imagen a elegir' };
      return { ...h, bloques: h.bloques.some((b) => b.tipo === 'imagen') ? [...h.bloques, img] : [img, ...h.bloques] };
    });
    setRev((r) => r + 1);
  };
  const sacarBloque = (k, j) => { paso(); cambiar(k, (h) => ({ ...h, bloques: h.bloques.filter((_, n) => n !== j) })); setRev((r) => r + 1); };
  const fondo = (f) => {
    const k = elegida ?? hist[0]?.k;
    if (!k) return;
    paso();
    cambiar(k, (h) => ({ ...h, fondo: f?.id ?? null, fondoSrc: f?.url ?? null }));
  };

  // ---- lápiz: el rayón se dibuja directo en el SVG y entra al estado al soltar
  const trazo = useRef(null);
  const lapizAbajo = (e, k) => {
    if (modo !== 'lapiz') return;
    e.preventDefault();
    const svg = e.currentTarget;
    svg.setPointerCapture(e.pointerId);
    const caja = svg.getBoundingClientRect();
    const [x, y] = punto(e, caja);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'bc-rayon');
    path.setAttribute('stroke', TINTA[color]);
    svg.appendChild(path);
    trazo.current = { k, path, caja, d: `M${x} ${y} L${x} ${y}`, ultimo: [x, y] };
    path.setAttribute('d', trazo.current.d);
  };
  const lapizMueve = (e) => {
    const t = trazo.current;
    if (!t) return;
    const [x, y] = punto(e, t.caja);
    if (Math.hypot(x - t.ultimo[0], y - t.ultimo[1]) < MIN_PASO || t.d.length > MAX_CAMINO) return;
    t.d += ` L${x} ${y}`; t.ultimo = [x, y];
    t.path.setAttribute('d', t.d);
  };
  const lapizArriba = () => {
    const t = trazo.current;
    if (!t) return;
    trazo.current = null;
    t.path.remove();
    paso();
    cambiar(t.k, (h) => ({ ...h, trazos: [...h.trazos, { d: t.d, color }] }));
  };
  const borrarTrazo = (k, i) => { paso(); cambiar(k, (h) => ({ ...h, trazos: h.trazos.filter((_, n) => n !== i) })); };

  // ---- figuras
  const ponerFigura = (e, k) => {
    if (!figTipo || modo !== 'editar') return;
    const caja = e.currentTarget.getBoundingClientRect();
    const [x, y] = punto(e, caja);
    const [w, h] = TAMANO_FIGURA[figTipo];
    const f = { tipo: figTipo, x: Math.max(0, Math.min(1000 - w, x - w / 2)), y: Math.max(0, Math.min(1000 - h, y - h / 2)), w, h, color, relleno };
    if (figTipo === 'nota') f.texto = 'nota para el equipo';
    paso();
    const i = histRef.current.find((hh) => hh.k === k).figuras.length;
    cambiar(k, (hh) => ({ ...hh, figuras: [...hh.figuras, f] }));
    setFigTipo(null);
    setFigSel({ k, i });
  };
  const arrastrar = (e, k, i, tipo) => {
    if (modo === 'goma') {
      e.stopPropagation(); paso();
      cambiar(k, (h) => ({ ...h, figuras: h.figuras.filter((_, n) => n !== i) }));
      setFigSel(null); setRev((r) => r + 1);   // las notas que quedan se vuelven a montar con su texto
      return;
    }
    if (modo !== 'editar') return;
    e.stopPropagation(); e.preventDefault();
    setFigSel({ k, i });
    const el = e.currentTarget.closest('.ed-fig');
    const caja = el.closest('.bc-card').getBoundingClientRect();
    const f = histRef.current.find((h) => h.k === k).figuras[i];
    const x0 = e.clientX; const y0 = e.clientY;
    const anchoPx = (f.w / 1000) * caja.width; const altoPx = (f.h / 1000) * caja.height;
    const mueve = (ev) => {
      const dx = ev.clientX - x0; const dy = ev.clientY - y0;
      el.style.transform = tipo === 'mover' ? `translate(${dx}px, ${dy}px)`
        : `scale(${Math.max(0.1, (anchoPx + dx) / anchoPx)}, ${Math.max(0.1, (altoPx + dy) / altoPx)})`;
    };
    const suelta = (ev) => {
      window.removeEventListener('pointermove', mueve);
      window.removeEventListener('pointerup', suelta);
      el.style.transform = '';
      const dx = ((ev.clientX - x0) / caja.width) * 1000; const dy = ((ev.clientY - y0) / caja.height) * 1000;
      if (Math.abs(dx) + Math.abs(dy) < 2) return;   // fue un toque: solo la eligió
      paso();
      const nuevo = tipo === 'mover'
        ? { x: Math.max(0, Math.min(1000 - f.w, f.x + dx)), y: Math.max(0, Math.min(1000 - f.h, f.y + dy)) }
        : { w: Math.max(20, Math.min(1000 - f.x, f.w + dx)), h: Math.max(20, Math.min(1000 - f.y, f.h + dy)) };
      cambiar(k, (h) => ({ ...h, figuras: h.figuras.map((x, n) => (n === i ? { ...x, ...nuevo } : x)) }));
    };
    window.addEventListener('pointermove', mueve);
    window.addEventListener('pointerup', suelta);
  };
  const colorear = (c) => {
    setColor(c);
    if (modo === 'goma') setModo('lapiz');
    if (figSel) { paso(); cambiar(figSel.k, (h) => ({ ...h, figuras: h.figuras.map((x, n) => (n === figSel.i ? { ...x, color: c } : x)) })); }
  };

  // ---- reordenar arrastrando el ⠿ (arrastre nativo: el resaltado va por clase, sin estado)
  const soltarSobre = (e, a) => {
    e.preventDefault();
    e.currentTarget.classList.remove('ed-sobre');
    const de = Number(e.dataTransfer.getData('text/plain'));
    if (!Number.isNaN(de)) mover(de, a);
  };

  const guardar = async () => {
    setGuardando(true); setError('');
    try {
      const historias = hist.map(({ origen, bloques, trazos, figuras, fondo: f }) => ({ origen, bloques, trazos, figuras, fondo: f }));
      onGuardado(await pizarraGuardarSecuencia(s.id, historias));
    } catch (e) { setError(e.message); setGuardando(false); }
  };

  const boton = (activo) => ({ type: 'button', 'aria-pressed': activo });
  const noRobaFoco = (e) => e.preventDefault();   // el formato se aplica sobre lo marcado
  const iElegida = Math.max(0, hist.findIndex((h) => h.k === elegida));

  return (
    <div className={`ed ed-modo-${modo}${figTipo ? ' ed-poner' : ''}`}>
      <div className="bc-franja-h ed-cab">
        <h3>{LARGO[s.largo] ?? s.largo}</h3>
        <span className="bc-chip">{hist.length} {hist.length === 1 ? 'historia' : 'historias'}</span>
        {s.objetivo && <span className="bc-chip">{OBJETIVO[s.objetivo] ?? s.objetivo}</span>}
      </div>
      <div className="ed-barra" role="toolbar" aria-label="Herramientas">
        <button {...boton(modo === 'editar')} onClick={() => setModo('editar')} title="Seleccionar y escribir (V)">↖ Editar</button>
        <button {...boton(modo === 'lapiz')} onClick={() => { setModo('lapiz'); setFigTipo(null); }} title="Rayar a mano (P)">✎ Lápiz</button>
        <button {...boton(color === 'rojo')} onClick={() => colorear('rojo')} title="Rojo"><span className="ed-sw" style={{ background: TINTA.rojo }} /></button>
        <button {...boton(color === 'negro')} onClick={() => colorear('negro')} title="Negro"><span className="ed-sw" style={{ background: TINTA.negro }} /></button>
        <button {...boton(modo === 'goma')} onClick={() => { setModo('goma'); setFigTipo(null); }} title="Borrar un rayado o una figura">⌫ Goma</button>
        <span className="ed-sep" />
        <button type="button" onMouseDown={noRobaFoco} onClick={() => formatear('b')} title="Negrita"><b>N</b></button>
        <button type="button" onMouseDown={noRobaFoco} onClick={() => formatear('r')} title="En rojo"><span className="bc-rojo">R</span></button>
        <button type="button" onMouseDown={noRobaFoco} onClick={() => formatear('o')} title="Encerrar en óvalo">◯</button>
        <button type="button" onMouseDown={noRobaFoco} onClick={() => formatear('u')} title="Subrayar en rojo"><span className="bc-subrayado">S</span></button>
        <button type="button" onMouseDown={noRobaFoco} onClick={() => formatear('s')} title="Tachar en rojo"><s className="bc-tachado">T</s></button>
        <button type="button" onClick={agregarImagen} title="Lugar de imagen en la historia elegida">▣ Imagen</button>
        <span className="ed-sep" />
        {FIGURAS.map(([t, l, titulo]) => (
          <button key={t} {...boton(figTipo === t)} title={titulo}
            onClick={() => { setFigTipo(figTipo === t ? null : t); setModo('editar'); }}>{l}</button>
        ))}
        <button {...boton(relleno)} onClick={() => setRelleno(!relleno)} title="Figura con relleno">◼ Relleno</button>
        <button {...boton(color === 'blanco')} onClick={() => colorear('blanco')} title="Blanco"><span className="ed-sw blanco" style={{ background: TINTA.blanco }} /></button>
        <span className="ed-sep" />
        <button {...boton(verFondos)} onClick={() => setVerFondos(!verFondos)} title="Fotos del álbum para usar de fondo">Fondos</button>
        <span className="ed-sep" />
        <button type="button" onClick={deshacer} title="Deshacer (⌘Z)">↶</button>
        <button type="button" className="btn sm ghost" onClick={onCancelar} disabled={guardando}>Cancelar</button>
        <button type="button" className="btn sm primary" onClick={guardar} disabled={guardando || !hist.length}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
      {error && <p className="pz-error">{error}</p>}

      <div className="ed-scroll">
        <div className="bc-fila">
          {hist.map((h, n) => (
            <div key={h.k} className="bc-paso">
              {n > 0 && <span className="bc-flecha" aria-hidden="true" />}
              <div className="bc-hist">
                <div className="ed-num">
                  <span className="ed-mover" draggable title="Arrastrá para mover" aria-label={`Mover historia ${n + 1}`}
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(n)); e.dataTransfer.effectAllowed = 'move'; }}>⠿</span>
                  {n + 1}
                  <button type="button" className="ed-x" title="Sacar historia" aria-label={`Sacar historia ${n + 1}`} onClick={() => sacarHistoria(h.k)}>✕</button>
                </div>
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                <div className={`bc-card ed-card${h.fondoSrc ? ' con-fondo' : ''}${elegida === h.k ? ' ed-elegida' : ''}`}
                  onPointerDownCapture={() => elegida !== h.k && setElegida(h.k)} onClick={(e) => ponerFigura(e, h.k)}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ed-sobre'); }}
                  onDragLeave={(e) => e.currentTarget.classList.remove('ed-sobre')} onDrop={(e) => soltarSobre(e, n)}>
                  <Fondo src={h.fondoSrc} />
                  {h.bloques.map((b, j) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={`${rev}-${j}`} className="ed-bloque">
                      {b.tipo === 'texto' && (
                        <Editable html={aHtml(b.texto)} className={`bc-t ${b.tamano} ed-texto`} activo={modo === 'editar'}
                          datos={{ 'data-k': h.k, 'data-j': j }} onFoco={paso} onCambio={textoDe} />
                      )}
                      {b.tipo === 'imagen' && !b.src && (
                        <div className="bc-hueco">
                          <Editable html={esc(b.texto || '')} className="ed-hueco-t" activo={modo === 'editar'} onFoco={paso}
                            onCambio={(el) => cambiar(h.k, (hh) => ({ ...hh, bloques: hh.bloques.map((x, m) => (m === j ? { ...x, texto: el.textContent } : x)) }))} />
                        </div>
                      )}
                      {b.tipo !== 'texto' && (b.tipo !== 'imagen' || b.src) && <Bloque b={b} />}
                      {b.tipo !== 'texto' && (
                        <button type="button" className="ed-quitar" title={b.tipo === 'imagen' ? 'Sacar la imagen' : 'Sacar'} onClick={() => sacarBloque(h.k, j)}>✕</button>
                      )}
                    </div>
                  ))}
                  <svg className="bc-capa ed-capa" viewBox="0 0 1000 1000" preserveAspectRatio="none"
                    onPointerDown={(e) => lapizAbajo(e, h.k)} onPointerMove={lapizMueve} onPointerUp={lapizArriba} onPointerCancel={lapizArriba}>
                    {h.trazos.map((t, i) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <g key={i}>
                        <path d={t.d} className="bc-rayon" stroke={TINTA[t.color] ?? TINTA.rojo} />
                        {modo === 'goma' && <path d={t.d} className="ed-toque" onPointerDown={(e) => { e.stopPropagation(); borrarTrazo(h.k, i); }} />}
                      </g>
                    ))}
                  </svg>
                  <div className="bc-capa ed-figuras">
                    {h.figuras.map((f, i) => {
                      const sel = figSel?.k === h.k && figSel.i === i;
                      return (
                        // eslint-disable-next-line react/no-array-index-key, jsx-a11y/no-static-element-interactions
                        <div key={`${rev}-${i}`} className={`bc-fig ed-fig${f.tipo === 'nota' ? ' nota' : ''}${sel ? ' sel' : ''}`} style={posicion(f)}
                          onPointerDown={(e) => arrastrar(e, h.k, i, 'mover')} onClick={(e) => e.stopPropagation()}>
                          {f.tipo === 'nota' ? (
                            <Editable html={esc(f.texto || '')} className="bc-nota-t ed-nota-t" activo={modo === 'editar'}
                              onFoco={paso} datos={{ onPointerDown: (e) => e.stopPropagation() }}
                              onCambio={(el) => cambiar(h.k, (hh) => ({ ...hh, figuras: hh.figuras.map((x, m) => (m === i ? { ...x, texto: el.textContent } : x)) }))} />
                          ) : <Figura f={f} />}
                          <span className="ed-asa" onPointerDown={(e) => arrastrar(e, h.k, i, 'tamano')} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <button type="button" className="ed-mas" title="Agregar historia" aria-label="Agregar historia" onClick={agregarHistoria}>+</button>
        </div>
      </div>

      {verFondos && <PanelFondos elegida={iElegida} onElegir={fondo} />}
    </div>
  );
}

/** Lo que se guardó y lo que la pizarra va a usar desde la próxima secuencia. */
export function Aprendio({ cambios, usa, onCerrar }) {
  return (
    <div className="ed-aprendio" aria-live="polite">
      <div className="ed-aprendio-h">
        <b>Guardado</b><span className="ed-ok">la pizarra aprendió</span>
        <button type="button" className="btn icon ed-cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
      </div>
      <span className="pz-k">Lo que cambiaste</span>
      <ul className="ed-cambios">{cambios.map((c) => <li key={c}>{c}</li>)}</ul>
      <span className="pz-k">Lo que va a usar desde la próxima secuencia</span>
      <div className="ed-reglas">{usa.map((u) => <div key={u} className="ed-regla">{u}</div>)}</div>
    </div>
  );
}
