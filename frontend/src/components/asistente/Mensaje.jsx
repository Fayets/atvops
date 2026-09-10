import { useState } from 'react';
import Markdown from '../../lib/markdown.jsx';

/**
 * Un turno del chat, con lo que hace falta para trabajarlo.
 *
 * Copiar existe porque la respuesta termina en un mensaje a un cliente o en un doc, y
 * seleccionar a mano un texto largo dentro de un scroll es un trabajo. Reintentar, porque
 * la primera respuesta a veces sale corta y volver a escribir la pregunta es peor.
 *
 * El colapso es solo visual: el texto completo queda en el DOM, así que buscar con
 * ctrl+F lo encuentra igual.
 */

const LIMITE_LINEAS = 12;
const LINEAS_VISIBLES = 8;

function Copiar({ texto, etiqueta = 'Copiar' }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Sin permiso de portapapeles: se selecciona en un textarea y se copia igual.
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* nada más que hacer */ }
      ta.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  };
  return (
    <button type="button" className={`btn-mini${copiado ? ' hecho' : ''}`} onClick={copiar}>
      {copiado ? 'Copiado' : etiqueta}
    </button>
  );
}

/**
 * @param {{ turno: object, onReintentar?: (texto: string) => void, children?: React.ReactNode }} props
 */
export default function Mensaje({ turno, onReintentar, children }) {
  const [abierto, setAbierto] = useState(false);
  const texto = String(turno.texto ?? '');
  const lineas = texto.split('\n');
  const largo = lineas.length > LIMITE_LINEAS;
  const visible = largo && !abierto ? lineas.slice(0, LINEAS_VISIBLES).join('\n') : texto;
  const esUsuario = turno.rol === 'usuario';

  return (
    <div className={`burbuja ${turno.rol}`}>
      <div className={`burbuja-texto${largo && !abierto ? ' recortada' : ''}`}>
        {esUsuario ? visible : <Markdown texto={visible} />}
      </div>

      {largo && (
        <button type="button" className="burbuja-abrir" onClick={() => setAbierto((v) => !v)}>
          {abierto ? 'Cerrar' : `Abrir (${lineas.length - LINEAS_VISIBLES} líneas más)`}
        </button>
      )}

      {children}

      <div className="burbuja-acciones">
        <Copiar texto={texto} />
        {esUsuario && onReintentar && (
          <button type="button" className="btn-mini" onClick={() => onReintentar(texto)} title="Volver a preguntar">
            ↻ Reintentar
          </button>
        )}
      </div>
    </div>
  );
}
