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

function Grafico({ texto }) {
  return (
    <div className="bc-grafico">
      <svg viewBox="0 0 80 44" aria-hidden="true">
        <path d="M6 4 L 6 38 L 76 38" fill="none" strokeWidth="2" strokeLinecap="round" />
        <path d="M9 10 C 20 12, 24 26, 36 28 S 60 30, 72 33" fill="none" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span>{texto}</span>
    </div>
  );
}

function Hueco({ texto, marcas }) {
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
          if (b.tipo === 'imagen') return <Hueco key={i} texto={b.texto} marcas={b.marcas} />;
          if (b.tipo === 'flecha') return <Flecha key={i} color={b.color} texto={b.texto} />;
          if (b.tipo === 'diagrama') return <Diagrama key={i} texto={b.texto} ciclo={b.ciclo} />;
          if (b.tipo === 'grafico') return <Grafico key={i} texto={b.texto} />;
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
