import { toDate } from './format.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const corta = (d) => `${d.getDate()} ${MESES[d.getMonth()]}`;

/**
 * Semanas del backend: la clave es el lunes en ISO ('2026-09-07'). Acá se
 * decide cómo se muestran y qué ventana se ve según el mes elegido arriba.
 */

/** '2026-09-07' → '7 sep' */
export function etiquetaSemana(iso) {
  return corta(toDate(iso));
}

/** '2026-09-07' → '7–13 sep' (o '29 jun – 5 jul' si cruza de mes) */
export function rangoSemana(iso) {
  const lun = toDate(iso);
  const dom = new Date(lun.getTime() + 6 * 86400000);
  return lun.getMonth() === dom.getMonth()
    ? `${lun.getDate()}–${dom.getDate()} ${MESES[lun.getMonth()]}`
    : `${corta(lun)} – ${corta(dom)}`;
}

/**
 * Ventana para el mes elegido: las semanas cuyo lunes cae en ese mes, con hasta
 * `contexto` semanas anteriores atenuadas para no perder la historia. Si el
 * mes no tiene semanas en la lista (muy viejo o futuro), se muestran todas.
 * @param {string[]} semanas   Claves ISO ordenadas de más vieja a más nueva.
 * @param {string} mesId       'YYYY-MM'
 * @returns {{ columnas: string[], resaltadas: Set<string> }}
 */
export function ventanaMes(semanas, mesId, contexto = 4) {
  const enMes = semanas.filter((s) => s.startsWith(mesId));
  if (!enMes.length) return { columnas: semanas, resaltadas: new Set(semanas) };
  const primera = semanas.indexOf(enMes[0]);
  const desde = Math.max(0, primera - contexto);
  const ultima = semanas.indexOf(enMes[enMes.length - 1]);
  return { columnas: semanas.slice(desde, ultima + 1), resaltadas: new Set(enMes) };
}
