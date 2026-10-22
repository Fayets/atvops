import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * La idea general abierta como hoja de Google Docs, igual que los cuadros de contexto: el
 * título y el desarrollo se escriben sobre la hoja y se guardan solos. La frase de la llamada
 * queda citada en la hoja y no se toca: es lo que prueba que la idea salió de Juan.
 */

const ESPERA_MS = 1200;

const leer = (el) => (el?.innerText || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');

export default function DocumentoIdea({ g, llamada, onGuardar, onAprobar, onDescartar, onCerrar }) {
  const tituloRef = useRef(null);
  const detalleRef = useRef(null);
  const guardadoRef = useRef({ titulo: g.titulo || '', detalle: g.detalle || '' });
  const timerRef = useRef(null);
  const [estado, setEstado] = useState('guardado'); // guardado | cambios | guardando | error
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const aprobada = g.estado === 'aprobada';

  useLayoutEffect(() => {
    if (tituloRef.current) tituloRef.current.textContent = g.titulo || '';
    if (detalleRef.current) detalleRef.current.textContent = g.detalle || '';
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (aprobada) return true;
    const cambios = { titulo: leer(tituloRef.current), detalle: leer(detalleRef.current) };
    const antes = guardadoRef.current;
    if (cambios.titulo === antes.titulo && cambios.detalle === antes.detalle) { setEstado('guardado'); return true; }
    if (!cambios.titulo) { setEstado('error'); setError('la idea no puede quedar sin título'); return false; }
    setEstado('guardando'); setError('');
    try {
      await onGuardar(cambios);
      guardadoRef.current = cambios;
      setEstado('guardado');
      return true;
    } catch (e) { setEstado('error'); setError(e.message); return false; }
  }, [aprobada, onGuardar]);

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
  const alPegar = (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  };
  // En el título, Enter no abre renglón: pasa al desarrollo.
  const enTitulo = (e) => { if (e.key === 'Enter') { e.preventDefault(); detalleRef.current?.focus(); } };

  const hacer = async (fn) => {
    setOcupado(true);
    try { if (await guardar()) await fn(); } finally { setOcupado(false); }
  };

  const aviso = aprobada
    ? `Aprobada${g.aprobadaPor ? ` por ${g.aprobadaPor}` : ''}`
    : { guardado: g.editada ? 'Guardado · editada' : 'Guardado', cambios: 'Cambios sin guardar', guardando: 'Guardando…', error: `No se pudo guardar: ${error}` }[estado];
  const editable = !aprobada;

  return createPortal(
    <div className="dc" role="dialog" aria-modal="true" aria-label="Idea general">
      <header className="dc-barra">
        <div className="dc-nombre">
          <span className="dc-icono" aria-hidden="true" />
          <div>
            <b>Idea general</b>
            <span className={`dc-aviso ${aprobada ? '' : estado}`}>{aviso}</span>
          </div>
        </div>
        <div className="dc-acciones">
          {!aprobada && (
            <>
              <button type="button" className="btn ghost" disabled={ocupado} onClick={() => hacer(onDescartar)}>Descartar</button>
              <button type="button" className="btn primary" disabled={ocupado} onClick={() => hacer(onAprobar)}>Aprobar</button>
            </>
          )}
          <button type="button" className="btn" onClick={cerrar}>Cerrar</button>
        </div>
      </header>
      <div className="dc-mesa" onMouseDown={(e) => { if (e.target === e.currentTarget && editable) detalleRef.current?.focus(); }}>
        <article className="dc-hoja">
          <h1
            ref={tituloRef}
            className="dc-titulo di-titulo"
            contentEditable={editable}
            suppressContentEditableWarning
            spellCheck
            aria-label="Título de la idea"
            onInput={alEscribir}
            onBlur={guardar}
            onPaste={alPegar}
            onKeyDown={enTitulo}
          />
          <p className="dc-sub">
            {[llamada?.tipo === 'clase' ? 'Clase grupal' : '1 a 1', llamada?.titulo, llamada?.fecha].filter(Boolean).join(' · ')}
          </p>
          {g.dolor && <p className="di-dolor"><span>Dolor</span>{g.dolor}</p>}
          <div
            ref={detalleRef}
            className="dc-texto di-detalle"
            contentEditable={editable}
            suppressContentEditableWarning
            spellCheck
            role="textbox"
            aria-multiline="true"
            aria-label="Desarrollo de la idea"
            onInput={alEscribir}
            onBlur={guardar}
            onPaste={alPegar}
          />
          <h2 className="di-h2">De la llamada</h2>
          <blockquote className="di-cita">
            {g.minuto && <span className="di-min">{g.minuto}</span>}
            “{g.cita}”
          </blockquote>
          {llamada?.url && <a href={llamada.url} target="_blank" rel="noreferrer" className="di-link">Ver grabación</a>}
        </article>
      </div>
    </div>,
    document.body,
  );
}
