/**
 * El markdown que devuelve Claude, pintado como elementos de React.
 *
 * No se arma HTML a mano ni se usa `dangerouslySetInnerHTML`: cada pieza sale como
 * elemento, así que el texto de una respuesta no puede inyectar nada aunque venga con
 * etiquetas adentro. Es la razón de no traer una librería para esto.
 *
 * Soporta lo que Claude usa de verdad al contestar sobre la cartera: títulos, listas,
 * tablas, bloques de código, citas, negrita, itálica, código en línea y enlaces.
 */

/** Trozos de una línea: `código`, **negrita**, *itálica*, [texto](url). */
const TROZOS = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\([^)\s]+\))/g;

function enLinea(texto, claveBase) {
  return String(texto).split(TROZOS).filter(Boolean).map((t, i) => {
    const k = `${claveBase}-${i}`;
    if (t.startsWith('`') && t.endsWith('`')) return <code key={k}>{t.slice(1, -1)}</code>;
    if (t.startsWith('**') && t.endsWith('**')) return <strong key={k}>{t.slice(2, -2)}</strong>;
    if ((t.startsWith('*') && t.endsWith('*')) || (t.startsWith('_') && t.endsWith('_'))) {
      return <em key={k}>{t.slice(1, -1)}</em>;
    }
    const enlace = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t);
    if (enlace) {
      // Solo http(s): un `javascript:` en un enlace es la vía clásica de inyección.
      const url = /^https?:\/\//i.test(enlace[2]) ? enlace[2] : null;
      return url
        ? <a key={k} href={url} target="_blank" rel="noreferrer noopener">{enlace[1]}</a>
        : <span key={k}>{enlace[1]}</span>;
    }
    return <span key={k}>{t}</span>;
  });
}

const esSeparadorDeTabla = (l) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes('-');
const celdas = (l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

/**
 * @param {{ texto: string }} props
 */
export default function Markdown({ texto }) {
  const lineas = String(texto ?? '').split('\n');
  const salida = [];
  let lista = null;
  let orden = false;

  const cerrarLista = () => {
    if (!lista) return;
    const Etiqueta = orden ? 'ol' : 'ul';
    salida.push(<Etiqueta key={`l${salida.length}`} className="md-lista">{lista}</Etiqueta>);
    lista = null;
  };

  for (let i = 0; i < lineas.length; i += 1) {
    const linea = lineas[i];

    // Bloque de código: se copia tal cual hasta el cierre.
    if (linea.trimStart().startsWith('```')) {
      cerrarLista();
      const lenguaje = linea.trim().slice(3).trim();
      const cuerpo = [];
      i += 1;
      while (i < lineas.length && !lineas[i].trimStart().startsWith('```')) {
        cuerpo.push(lineas[i]);
        i += 1;
      }
      salida.push(
        <pre key={`p${salida.length}`} className="md-codigo">
          {lenguaje && <span className="md-codigo-lang">{lenguaje}</span>}
          <code>{cuerpo.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // Tabla: una fila con pipes seguida del separador.
    if (linea.includes('|') && esSeparadorDeTabla(lineas[i + 1] ?? '')) {
      cerrarLista();
      const cabecera = celdas(linea);
      const filas = [];
      i += 2;
      while (i < lineas.length && lineas[i].includes('|') && lineas[i].trim()) {
        filas.push(celdas(lineas[i]));
        i += 1;
      }
      i -= 1;
      salida.push(
        <div key={`t${salida.length}`} className="md-tabla-scroll">
          <table className="md-tabla">
            <thead>
              <tr>{cabecera.map((c, j) => <th key={j}>{enLinea(c, `th${j}`)}</th>)}</tr>
            </thead>
            <tbody>
              {filas.map((f, j) => (
                <tr key={j}>{f.map((c, k) => <td key={k}>{enLinea(c, `td${j}${k}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const cita = /^>\s?(.*)$/.exec(linea);
    if (cita) {
      cerrarLista();
      salida.push(<blockquote key={`b${salida.length}`} className="md-cita">{enLinea(cita[1], `b${i}`)}</blockquote>);
      continue;
    }

    const titulo = /^(#{1,4})\s+(.*)$/.exec(linea);
    if (titulo) {
      cerrarLista();
      const H = `h${Math.min(titulo[1].length + 2, 6)}`;
      salida.push(<H key={`h${salida.length}`} className="md-titulo">{enLinea(titulo[2], `h${i}`)}</H>);
      continue;
    }

    const punto = /^\s*[-*•]\s+(.*)$/.exec(linea);
    const numerado = /^\s*(\d+)[.)]\s+(.*)$/.exec(linea);
    if (punto || numerado) {
      const contenido = punto ? punto[1] : numerado[2];
      if (!lista) {
        lista = [];
        orden = Boolean(numerado);
      }
      lista.push(<li key={`i${i}`}>{enLinea(contenido, `i${i}`)}</li>);
      continue;
    }

    cerrarLista();
    if (!linea.trim()) continue;
    salida.push(<p key={`x${salida.length}`} className="md-parrafo">{enLinea(linea, `x${i}`)}</p>);
  }
  cerrarLista();

  return <div className="md">{salida}</div>;
}
