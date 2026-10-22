/**
 * Las secuencias de historias como los bocetos de marketing: una tarjeta 9:16 por historia,
 * con el texto tal cual va y el lugar de cada imagen marcado para que el equipo la busque.
 * No es diseño: es el boceto. Lo que Juan dibuja encima (flechas, la palabra encerrada,
 * etiquetas sobre una captura, diagramas, gráficos) va en rojo, como en sus historias.
 */

const LARGO = { corta: 'Corta', media: 'Media', larga: 'Larga' };
const OBJETIVO = {
  palabra: 'pedir la palabra', ensenar: 'enseñar y pedir la palabra',
  mostrar: 'mostrar proceso o resultados', objecion: 'romper una objeción',
};

/** Las marcas del texto: **negrita**, [[encerrada]], {{en rojo}}, ~~tachado~~ y __subrayado__. */
const MARCA = /(\*\*[^*]+\*\*|\[\[[^\]]+\]\]|\{\{[^}]+\}\}|~~[^~]+~~|__[^_]+__)/g;

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

function Hueco({ texto, marcas, src }) {
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

function Historia({ bloques, n }) {
  return (
    <div className="bc-hist">
      <span className="bc-num">{n}</span>
      <div className="bc-card">
        {bloques.map((b, i) => {
          /* eslint-disable react/no-array-index-key */
          if (b.tipo === 'imagen') return <Hueco key={i} texto={b.texto} marcas={b.marcas} src={b.src} />;
          if (b.tipo === 'flecha') return <Flecha key={i} color={b.color} texto={b.texto} />;
          if (b.tipo === 'diagrama') return <Diagrama key={i} texto={b.texto} ciclo={b.ciclo} />;
          if (b.tipo === 'grafico') return <Grafico key={i} forma={b.forma} datos={b.datos} texto={b.texto} />;
          return <p key={i} className={`bc-t ${b.tamano}`}><Texto texto={b.texto} /></p>;
          /* eslint-enable react/no-array-index-key */
        })}
      </div>
    </div>
  );
}

export default function Bocetos({ secuencias }) {
  return (
    <div className="bc">
      {secuencias.map((s) => (
        <section key={s.id} className="bc-franja">
          <div className="bc-franja-h">
            <h3>{LARGO[s.largo] ?? s.largo}</h3>
            <span className="bc-chip">{s.historias.length} historias</span>
            {s.objetivo && <span className="bc-chip">{OBJETIVO[s.objetivo] ?? s.objetivo}</span>}
          </div>
          <div className="bc-fila">
            {s.historias.map((h, i) => (
              <div key={i} className="bc-paso">
                {i > 0 && <span className="bc-flecha" aria-hidden="true" />}
                <Historia bloques={h} n={i + 1} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export { OBJETIVO };
