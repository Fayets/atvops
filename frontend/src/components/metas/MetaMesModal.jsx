import { useEffect } from 'react';
import MetaMesForm from './MetaMesForm.jsx';

/**
 * Modal liviano para definir la meta desde Marketing / Ventas.
 * @param {{
 *   abierto: boolean,
 *   onCerrar: () => void,
 *   decreto: import('../../lib/metasMes.js').DecretoMes,
 *   mes: string,
 *   nombreMes: string,
 *   onGuardado: (d: import('../../lib/metasMes.js').DecretoMes) => void,
 * }} props
 */
export default function MetaMesModal({ abierto, onCerrar, decreto, mes, nombreMes, onGuardado }) {
  useEffect(() => {
    if (!abierto) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div className="meta-modal-backdrop" role="presentation" onClick={onCerrar}>
      <div
        className="meta-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Definir meta del mes"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="meta-modal-head">
          <h2>Definir meta del mes</h2>
          <button type="button" className="btn ghost" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
        <MetaMesForm
          decretoInicial={decreto}
          mes={mes}
          nombreMes={nombreMes}
          embutido
          editable
          onGuardado={(d) => {
            onGuardado(d);
            onCerrar();
          }}
        />
      </div>
    </div>
  );
}
