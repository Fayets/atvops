/**
 * Store mock del reporte diario del setter.
 * Futuro: POST /api/ventas/setter/reporte.
 */

import { SETTER_REPORTE_DIA } from './setter.js';

/** @type {{ completado: boolean, actualizadoAt: string | null }} */
let reporte = { ...SETTER_REPORTE_DIA };

export function getSetterReporte() {
  return { ...reporte };
}

export function completarSetterReporte({ notas } = {}) {
  reporte = {
    completado: true,
    actualizadoAt: new Date().toISOString(),
    notas: notas || null,
  };
  return getSetterReporte();
}

export function resetSetterReporte() {
  reporte = { ...SETTER_REPORTE_DIA };
  return getSetterReporte();
}
