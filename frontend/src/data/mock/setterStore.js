/**
 * Store mock del reporte diario del setter.
 * Futuro: POST /api/ventas/setter/reporte.
 */

import { SETTER_REPORTE_DIA } from './setter.js';

/** @type {{ completado: boolean, actualizadoAt: string | null, payload?: object | null }} */
let reporte = { ...SETTER_REPORTE_DIA, payload: null };

export function getSetterReporte() {
  return { ...reporte, payload: reporte.payload ? { ...reporte.payload } : null };
}

/**
 * @param {object} payload — form completo del reporte diario
 */
export function completarSetterReporte(payload = {}) {
  reporte = {
    completado: true,
    actualizadoAt: new Date().toISOString(),
    payload: { ...payload },
  };
  return getSetterReporte();
}

export function resetSetterReporte() {
  reporte = { ...SETTER_REPORTE_DIA, payload: null };
  return getSetterReporte();
}
