/**
 * Mes operativo del tablero (YYYY-MM).
 * Lo elige el usuario en el topbar; todas las vistas leen de acá.
 */

import { ahora, mesId, nombreMesAnio } from './format.js';
import { diaDentroDelMes, diasDelMes } from './pacing.js';

const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** @param {string} ym YYYY-MM */
export function parseMesId(ym) {
  const [y, m] = String(ym || '').split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

/** @param {string} ym */
export function nombreMesDesdeId(ym) {
  const p = parseMesId(ym);
  if (!p) return ym || '';
  return `${MESES_LARGOS[p.month - 1]} ${p.year}`;
}

/** Fecha ancla del mes (día 1 local). */
export function fechaDeMesId(ym) {
  const p = parseMesId(ym);
  if (!p) return ahora();
  return new Date(p.year, p.month - 1, 1);
}

/**
 * Contexto de calendario para un mes seleccionado.
 * - Mes pasado → día = último del mes (cerrado).
 * - Mes actual → día de hoy.
 * - Mes futuro → día 1.
 * @param {string} ym
 * @param {Date} [hoy]
 */
export function contextoDeMes(ym, hoy = ahora()) {
  const actual = mesId(hoy);
  const diasMes = diasDelMes(ym);
  let diaHoy;
  if (ym < actual) diaHoy = diasMes;
  else if (ym > actual) diaHoy = 1;
  else diaHoy = diaDentroDelMes(hoy, ym);
  return {
    mes: ym,
    diaHoy,
    diasMes,
    nombreMes: nombreMesDesdeId(ym),
    esActual: ym === actual,
    esPasado: ym < actual,
    esFuturo: ym > actual,
  };
}

/**
 * Lista de meses para el selector (hacia atrás / adelante).
 * @param {string} [centro]
 * @param {number} [atras]
 * @param {number} [adelante]
 */
export function listaMeses(centro = mesId(), atras = 11, adelante = 2) {
  const p = parseMesId(centro) || parseMesId(mesId());
  const out = [];
  for (let i = -atras; i <= adelante; i++) {
    const d = new Date(p.year, p.month - 1 + i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ id: ym, label: nombreMesDesdeId(ym) });
  }
  return out;
}

export function mesActualId() {
  return mesId(ahora());
}

/** Compat: nombreMesAnio con Date o con YYYY-MM. */
export function etiquetaMes(valor) {
  if (typeof valor === 'string' && /^\d{4}-\d{2}$/.test(valor)) {
    return nombreMesDesdeId(valor);
  }
  return nombreMesAnio(valor instanceof Date ? valor : ahora());
}
