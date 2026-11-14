import { useVersionNueva } from '../../lib/hooks.js';

/**
 * El cartelito de "hay una versión nueva".
 *
 * No recarga solo: alguien puede estar a mitad de una carga y perderla. Espera a que
 * toque, y entonces sí recarga de cero.
 */
export default function AvisoVersion() {
  const hayOtra = useVersionNueva();
  if (!hayOtra) return null;
  return (
    <button type="button" className="aviso-version" onClick={() => window.location.reload(true)}>
      <span className="recargar-icono">⟳</span> Versión nueva
    </button>
  );
}
