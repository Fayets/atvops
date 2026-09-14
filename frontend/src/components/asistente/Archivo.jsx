/**
 * Una respuesta larga mostrada como archivo, no como pared de texto.
 *
 * Cuando ATV AI devuelve un documento —una especificación, un reporte, una tanda de
 * mensajes para mandar— leerlo dentro de la burbuja no sirve: se busca en el scroll, se
 * pierde el hilo de la conversación y de todas formas termina pegado en otro lado. Se
 * muestra qué es y cuánto pesa, y se baja.
 */

const TAMANO = (bytes) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 102.4) / 10} KB`);

/** El título del documento si lo trae; si no, algo que se entienda en la carpeta. */
export function nombreDeArchivo(texto) {
  const titulo = /^#{1,3}\s+(.+)$/m.exec(String(texto ?? ''));
  const base = (titulo?.[1] ?? 'respuesta de ATV AI')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${base || 'respuesta'}.md`;
}

/**
 * @param {{ texto: string, nombre?: string, tipo?: string, nota?: string }} props
 */
export default function Archivo({ texto, nombre, tipo = 'text/markdown', nota }) {
  const contenido = String(texto ?? '');
  const archivo = nombre ?? nombreDeArchivo(contenido);
  const bytes = new Blob([contenido]).size;
  const lineas = contenido.split('\n').length;

  const bajar = () => {
    const url = URL.createObjectURL(new Blob([contenido], { type: `${tipo};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url;
    a.download = archivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // El objeto queda en memoria hasta que se suelta; sin esto se acumulan por sesión.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="archivo">
      <span className="archivo-icono" aria-hidden="true">
        <svg width="18" height="22" viewBox="0 0 18 22" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M11 1H3.5A1.5 1.5 0 0 0 2 2.5v17A1.5 1.5 0 0 0 3.5 21h11a1.5 1.5 0 0 0 1.5-1.5V6l-5-5Z" />
          <path d="M11 1v4a1 1 0 0 0 1 1h4" />
        </svg>
      </span>
      <span className="archivo-datos">
        <span className="archivo-nombre">{archivo}</span>
        <span className="archivo-meta dim">
          {nota ?? `${lineas} líneas · ${TAMANO(bytes)}`}
        </span>
      </span>
      <button type="button" className="btn-mini" onClick={bajar}>Descargar</button>
    </div>
  );
}
