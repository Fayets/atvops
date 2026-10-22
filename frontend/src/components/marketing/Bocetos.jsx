/**
 * Las secuencias de historias como los bocetos de marketing: una tarjeta 9:16 por historia,
 * con el texto tal cual va (en negrita lo marcado con **) y el lugar de cada imagen marcado
 * para que el equipo la busque. No es diseño: es el boceto.
 */

const LARGO = { corta: 'Corta', media: 'Media', larga: 'Larga' };
const OBJETIVO = {
  palabra: 'pedir la palabra', ensenar: 'enseñar y pedir la palabra',
  mostrar: 'mostrar proceso o resultados', objecion: 'romper una objeción',
};

/** "**negrita**" → <b>, y los saltos de línea se respetan. */
function Texto({ texto }) {
  return texto.split('\n').map((linea, i) => (
    <span key={i} className="bc-linea">
      {linea.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (p.startsWith('**') && p.endsWith('**') ? <b key={j}>{p.slice(2, -2)}</b> : p))}
    </span>
  ));
}

function Historia({ bloques, n }) {
  return (
    <div className="bc-hist">
      <span className="bc-num">{n}</span>
      <div className="bc-card">
        {bloques.map((b, i) => (b.tipo === 'imagen' ? (
          <div key={i} className="bc-hueco">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 17l-5-5-9 8" />
            </svg>
            <span>{b.texto}</span>
          </div>
        ) : (
          <p key={i} className={`bc-t ${b.tamano}`}><Texto texto={b.texto} /></p>
        )))}
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
