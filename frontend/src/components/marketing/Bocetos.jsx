/**
 * Las secuencias de historias como los bocetos de marketing: una tarjeta 9:16 por historia,
 * con el texto tal cual va y el lugar de cada imagen marcado para que el equipo la busque.
 * No es diseño: es el boceto. Lo que Juan dibuja encima (flechas, la palabra encerrada,
 * etiquetas sobre una captura, diagramas, gráficos) va en rojo, como en sus historias.
 * Una secuencia editada en la pizarra trae además, por historia, los rayones a mano, las
 * figuras y la foto de fondo: se dibujan encima, en un espacio de 0 a 1000 por tarjeta.
 */

const LARGO = { corta: 'Corta', media: 'Media', larga: 'Larga' };
const OBJETIVO = {
  palabra: 'pedir la palabra', ensenar: 'enseñar y pedir la palabra',
  mostrar: 'mostrar proceso o resultados', objecion: 'romper una objeción',
};

/** Las marcas del texto: **negrita**, [[encerrada]], {{en rojo}}, ~~tachado~~ y __subrayado__. */
export const MARCA = /(\*\*[^*]+\*\*|\[\[[^\]]+\]\]|\{\{[^}]+\}\}|~~[^~]+~~|__[^_]+__)/g;

function Trozo({ p }) {
  if (p.startsWith('**') && p.endsWith('**')) return <b>{p.slice(2, -2)}</b>;
  if (p.startsWith('[[') && p.endsWith(']]')) return <span className="bc-ovalo">{p.slice(2, -2)}</span>;
  if (p.startsWith('{{') && p.endsWith('}}')) return <span className="bc-rojo">{p.slice(2, -2)}</span>;
  if (p.startsWith('~~') && p.endsWith('~~')) return <s className="bc-tachado">{p.slice(2, -2)}</s>;
  if (p.startsWith('__') && p.endsWith('__')) return <span className="bc-subrayado">{p.slice(2, -2)}</span>;
  return p;
}

function Texto({ texto }) {
  return texto.split('\n').map((linea, i) => (
    // eslint-disable-next-line react/no-array-index-key
    <span key={i} className="bc-linea">{linea.split(MARCA).map((p, j) => <Trozo key={j} p={p} />)}</span>
  ));
}

/** La flecha dibujada a mano, roja o blanca (en el papel del boceto, la blanca va en gris oscuro). */
function Flecha({ color, texto }) {
  return (
    <div className={`bc-trazo ${color === 'blanca' ? 'blanca' : 'roja'}`}>
      <svg viewBox="0 0 60 48" aria-hidden="true">
        <path d="M8 6 C 30 4, 46 14, 40 40" fill="none" strokeWidth="3" strokeLinecap="round" />
        <path d="M31 33 L 40 42 L 47 31" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {texto && <span>{texto}</span>}
    </div>
  );
}

function Diagrama({ texto, ciclo }) {
  const pasos = texto.split(/\s*→\s*/).filter(Boolean);
  return (
    <div className={`bc-diagrama${ciclo ? ' ciclo' : ''}`}>
      {pasos.map((p, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <span key={i} className="bc-nodo-wrap">
          {i > 0 && <span className="bc-mini-flecha" aria-hidden="true">↓</span>}
          <span className="bc-nodo">{p}</span>
        </span>
      ))}
      {ciclo && <span className="bc-vuelta" aria-label="vuelve al principio">↺</span>}
    </div>
  );
}

/** El gráfico con sus datos, dibujado a mano en rojo: barras, línea o curva. */
function Grafico({ forma, datos, texto }) {
  if (!forma || !datos?.length) {
    // Las secuencias viejas traían el gráfico solo descripto.
    return <div className="bc-grafico"><span>{texto}</span></div>;
  }
  const W = 140; const H = 84; const x0 = 10; const y0 = 66; const alto = 50; const ancho = W - x0 - 8;
  const max = Math.max(...datos.map((d) => d.valor), 1);
  const y = (v) => y0 - (Math.max(v, 0) / max) * alto;
  const paso = ancho / datos.length;
  const xs = datos.map((_, i) => x0 + paso * i + paso / 2);
  let trazo = null;
  if (forma === 'barras') {
    const b = Math.min(26, paso * 0.62);
    trazo = datos.map((d, i) => (
      // eslint-disable-next-line react/no-array-index-key
      <g key={i}>
        <path d={`M${xs[i] - b / 2} ${y0} L${xs[i] - b / 2 + 0.8} ${y(d.valor)} L${xs[i] + b / 2 - 0.6} ${y(d.valor) + 0.6} L${xs[i] + b / 2} ${y0}`} className="bc-g-barra" />
        <text x={xs[i]} y={y(d.valor) - 3} className="bc-g-valor">{d.etiqueta}</text>
      </g>
    ));
  } else {
    const pts = datos.map((d, i) => [xs[i], y(d.valor)]);
    const d = forma === 'curva'
      ? pts.reduce((acc, [px, py], i) => {
        if (i === 0) return `M${px} ${py}`;
        const [qx, qy] = pts[i - 1]; const m = (qx + px) / 2;
        return `${acc} C${m} ${qy}, ${m} ${py}, ${px} ${py}`;
      }, '')
      : `M${pts.map(([px, py]) => `${px} ${py}`).join(' L')}`;
    trazo = (
      <>
        <path d={d} className="bc-g-linea" />
        {pts.map(([px, py], i) => (
          // eslint-disable-next-line react/no-array-index-key
          <g key={i}>
            {forma === 'linea' && <circle cx={px} cy={py} r="1.8" className="bc-g-punto" />}
            <text x={px} y={py - 4} className="bc-g-valor">{datos[i].etiqueta}</text>
          </g>
        ))}
      </>
    );
  }
  return (
    <div className="bc-grafico">
      <svg viewBox={`0 0 ${W} ${H}`} aria-label={texto || 'gráfico'}>
        <path d={`M${x0} 8 L${x0 - 0.5} ${y0} L${W - 4} ${y0 + 0.6}`} className="bc-g-eje" />
        {trazo}
      </svg>
      {texto && <span>{texto}</span>}
    </div>
  );
}

export function Hueco({ texto, marcas, src }) {
  if (src) {
    // La captura real de un dibujo de Juan en la llamada.
    return (
      <div className="bc-real">
        <img src={src} alt={texto || ''} loading="lazy" />
        {marcas?.length > 0 && <span className="bc-marcas">{marcas.map((m) => <span key={m} className="bc-etiqueta">{m}</span>)}</span>}
      </div>
    );
  }
  return (
    <div className="bc-hueco">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 17l-5-5-9 8" />
      </svg>
      <span>{texto}</span>
      {marcas?.length > 0 && (
        <span className="bc-marcas">{marcas.map((m) => <span key={m} className="bc-etiqueta">{m}</span>)}</span>
      )}
    </div>
  );
}

/** Un bloque de la historia tal cual se ve, sin editar. */
export function Bloque({ b }) {
  if (b.tipo === 'imagen') return <Hueco texto={b.texto} marcas={b.marcas} src={b.src} />;
  if (b.tipo === 'flecha') return <Flecha color={b.color} texto={b.texto} />;
  if (b.tipo === 'diagrama') return <Diagrama texto={b.texto} ciclo={b.ciclo} />;
  if (b.tipo === 'grafico') return <Grafico forma={b.forma} datos={b.datos} texto={b.texto} />;
  return <p className={`bc-t ${b.tamano}`}><Texto texto={b.texto} /></p>;
}

/** Los colores del lápiz y de las figuras. El rojo es el de la tinta de Juan en los bocetos. */
export const TINTA = { rojo: '#d62d20', negro: '#1c1917', blanco: '#ffffff' };

/** Dónde va una figura dentro de la tarjeta: sus coordenadas van de 0 a 1000. */
export const posicion = (f) => ({ left: `${f.x / 10}%`, top: `${f.y / 10}%`, width: `${f.w / 10}%`, height: `${f.h / 10}%` });

/** Una figura (cuadrado, círculo, línea, flecha) o la nota adhesiva para el equipo. */
export function Figura({ f }) {
  const c = TINTA[f.color] ?? TINTA.rojo;
  if (f.tipo === 'nota') return <span className="bc-nota-t">{f.texto}</span>;
  const relleno = f.relleno ? c : 'none';
  const trazo = { stroke: c, strokeWidth: 3, vectorEffect: 'non-scaling-stroke', strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {f.tipo === 'rect' && <rect x="2" y="2" width="96" height="96" rx="4" fill={relleno} {...trazo} />}
      {f.tipo === 'circ' && <ellipse cx="50" cy="50" rx="48" ry="48" fill={relleno} {...trazo} />}
      {f.tipo === 'linea' && <line x1="2" y1="50" x2="98" y2="50" {...trazo} />}
      {f.tipo === 'flecha' && (
        <>
          <line x1="2" y1="50" x2="92" y2="50" {...trazo} />
          <path d="M78 25 L96 50 L78 75" fill="none" {...trazo} />
        </>
      )}
    </svg>
  );
}

/** Los rayones a mano y las figuras encima de la tarjeta. */
function Capa({ trazos = [], figuras = [] }) {
  if (!trazos.length && !figuras.length) return null;
  return (
    <div className="bc-capa" aria-hidden="true">
      {trazos.length > 0 && (
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
          {/* eslint-disable-next-line react/no-array-index-key */}
          {trazos.map((t, i) => <path key={i} d={t.d} className="bc-rayon" stroke={TINTA[t.color] ?? TINTA.rojo} />)}
        </svg>
      )}
      {figuras.map((f, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className={`bc-fig${f.tipo === 'nota' ? ' nota' : ''}`} style={posicion(f)}><Figura f={f} /></div>
      ))}
    </div>
  );
}

/** Las secuencias viejas traen cada historia como una lista de bloques. */
export const normal = (h) => (Array.isArray(h) ? { bloques: h, trazos: [], figuras: [], fondo: null, fondoSrc: null } : h);

/** El fondo de la tarjeta: la foto del álbum, oscurecida para que el texto blanco se lea.
 * Va sin Referer: Google Photos no sirve sus fotos a otra página que las pida con uno. */
export function Fondo({ src }) {
  return src ? <img className="bc-fondo" src={src} alt="" referrerPolicy="no-referrer" loading="lazy" /> : null;
}

function Historia({ h, n }) {
  const { bloques, trazos, figuras, fondoSrc } = normal(h);
  return (
    <div className="bc-hist">
      <span className="bc-num">{n}</span>
      <div className={`bc-card${fondoSrc ? ' con-fondo' : ''}`}>
        <Fondo src={fondoSrc} />
        {/* eslint-disable-next-line react/no-array-index-key */}
        {bloques.map((b, i) => <Bloque key={i} b={b} />)}
        <Capa trazos={trazos} figuras={figuras} />
      </div>
    </div>
  );
}

/**
 * `onEditar` suma el botón Editar a cada secuencia; la que tiene el id `editando` se
 * reemplaza por lo que devuelve `editor(s)`. `pie(s)` va debajo de cada secuencia.
 */
export default function Bocetos({ secuencias, onEditar, editando, editor, pie }) {
  return (
    <div className="bc">
      {secuencias.map((s) => (editando === s.id && editor ? <section key={s.id} className="bc-franja">{editor(s)}</section> : (
        <section key={s.id} className="bc-franja">
          <div className="bc-franja-h">
            <h3>{LARGO[s.largo] ?? s.largo}</h3>
            <span className="bc-chip">{s.historias.length} historias</span>
            {s.objetivo && <span className="bc-chip">{OBJETIVO[s.objetivo] ?? s.objetivo}</span>}
            {s.editada && <span className="bc-chip" title={s.editadaPor ? `Editada por ${s.editadaPor}` : undefined}>editada</span>}
            {onEditar && <button type="button" className="btn sm ghost bc-editar" onClick={() => onEditar(s.id)}>Editar</button>}
          </div>
          <div className="bc-fila">
            {s.historias.map((h, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="bc-paso">
                {i > 0 && <span className="bc-flecha" aria-hidden="true" />}
                <Historia h={h} n={i + 1} />
              </div>
            ))}
          </div>
          {pie?.(s)}
        </section>
      )))}
    </div>
  );
}

export { LARGO, OBJETIVO };
