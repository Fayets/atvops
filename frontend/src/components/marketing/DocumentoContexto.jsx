import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Un cuadro de contexto de la pizarra (dolores, diferenciales, objeciones, narrativa) abierto
 * como una hoja de Google Docs: se lee como documento y se escribe directo sobre la hoja.
 *
 * El texto se guarda igual que siempre, una idea por renglón, porque así lo lee Claude. La hoja
 * no es controlada por React mientras se escribe (se lee del DOM al guardar): si se
 * re-renderizara en cada tecla, el cursor saltaría. Guarda sola a los 1,2 s de dejar de escribir.
 */

const ESPERA_MS = 1200;

/** Con `flecha`, "A → B" se muestra con la objeción en negrita; el texto guardado no cambia. */
function pintar(hoja, texto, flecha) {
  hoja.replaceChildren();
  const lineas = (texto || '').split('\n').map((l) => l.trim()).filter(Boolean);
  (lineas.length ? lineas : ['']).forEach((l) => {
    const div = document.createElement('div');
    div.className = 'dc-linea';
    const i = flecha ? l.indexOf('→') : -1;
    if (i > 0) {
      const b = document.createElement('b');
      b.textContent = l.slice(0, i).trimEnd();
      div.append(b, ` → ${l.slice(i + 1).trimStart()}`);
    } else {
      div.textContent = l;
    }
    hoja.append(div);
  });
}

const leer = (hoja) => hoja.innerText.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');

export default function DocumentoContexto({ titulo, sub, valor, onGuardar, onCerrar, margen, flecha = false }) {
  const hojaRef = useRef(null);
  const guardadoRef = useRef(valor?.texto || '');
  const timerRef = useRef(null);
  const [estado, setEstado] = useState('guardado'); // guardado | cambios | guardando | error
  const [error, setError] = useState('');

  useLayoutEffect(() => { if (hojaRef.current) pintar(hojaRef.current, valor?.texto || '', flecha); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = useCallback(async () => {
    clearTimeout(timerRef.current);
    const hoja = hojaRef.current;
    if (!hoja) return;
    const texto = leer(hoja);
    if (texto === guardadoRef.current) { setEstado('guardado'); return; }
    setEstado('guardando'); setError('');
    try {
      await onGuardar(texto);
      guardadoRef.current = texto;
      setEstado('guardado');
    } catch (e) { setEstado('error'); setError(e.message); }
  }, [onGuardar]);

  // Al cerrar, lo que quedaba sin guardar se guarda igual.
  const cerrar = useCallback(async () => { await guardar(); onCerrar(); }, [guardar, onCerrar]);

  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', tecla);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = previo; clearTimeout(timerRef.current); };
  }, [cerrar]);

  const alEscribir = () => {
    setEstado('cambios');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(guardar, ESPERA_MS);
  };

  // Lo pegado entra como texto plano: sin estilos de otra página.
  const alPegar = (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  };

  const aviso = { guardado: 'Guardado', cambios: 'Cambios sin guardar', guardando: 'Guardando…', error: `No se pudo guardar: ${error}` }[estado];
  const editado = valor?.editadoAt ? new Date(valor.editadoAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : null;

  return createPortal(
    <div className="dc" role="dialog" aria-modal="true" aria-label={titulo}>
      <header className="dc-barra">
        <div className="dc-nombre">
          <span className="dc-icono" aria-hidden="true" />
          <div>
            <b>{titulo}</b>
            <span className={`dc-aviso ${estado}`}>{aviso}{editado && estado === 'guardado' ? ` · última edición ${editado}${valor?.editadoPor ? ` por ${valor.editadoPor}` : ''}` : ''}</span>
          </div>
        </div>
        <button type="button" className="btn" onClick={cerrar}>Cerrar</button>
      </header>
      <div className="dc-mesa" onMouseDown={(e) => { if (e.target === e.currentTarget) hojaRef.current?.focus(); }}>
        <article className="dc-hoja">
          <h1 className="dc-titulo">{titulo}</h1>
          {sub && <p className="dc-sub">{sub}</p>}
          <div
            ref={hojaRef}
            className="dc-texto"
            contentEditable
            suppressContentEditableWarning
            spellCheck
            role="textbox"
            aria-multiline="true"
            aria-label={`Texto de ${titulo}`}
            onInput={alEscribir}
            onBlur={guardar}
            onPaste={alPegar}
          />
        </article>
        {margen && <aside className="dc-margen">{margen}</aside>}
      </div>
    </div>,
    document.body,
  );
}
