/**
 * Aviso entre el gate de llamadas sin cargar y Mi día / calendario.
 * El gate vive fuera de la ruta: al guardar un resultado hay que refrescar
 * lo que ya se montó detrás (KPIs y pintura del calendario).
 */

const EVENTO = 'atv-ops:llamadas-actualizadas';

export function avisarLlamadasActualizadas() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENTO));
}

/** @param {() => void} handler @returns {() => void} */
export function alActualizarLlamadas(handler) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENTO, handler);
  return () => window.removeEventListener(EVENTO, handler);
}
