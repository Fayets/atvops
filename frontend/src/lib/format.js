/**
 * Formateo de valores. Todo el dashboard pasa por acá para que un mismo tipo
 * de dato se lea igual en las seis secciones.
 *
 * Fechas y horas: siempre zona America/Argentina/Buenos_Aires.
 * Fecha corta: dd/mm/aaaa.
 * @typedef {import('../data/types.js').MetricFormat} MetricFormat
 */

const TZ_AR = 'America/Argentina/Buenos_Aires';

const usd0 = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const usd2 = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
const num = new Intl.NumberFormat('es-AR');

/**
 * @param {number} value
 * @param {MetricFormat} format
 */
export function formatValue(value, format) {
  switch (format) {
    case 'usd':
      return Math.abs(value) < 100 && !Number.isInteger(value) ? usd2.format(value) : usd0.format(value);
    case 'pct':
      return `${num.format(Math.round(value * 10) / 10)}%`;
    case 'days':
      return `${num.format(Math.round(value * 10) / 10)} d`;
    case 'hs':
      return `${num.format(Math.round(value * 10) / 10)} h`;
    case 'x':
      return `${(Math.round(value * 100) / 100).toFixed(2)}×`;
    case 'ratio':
      return (Math.round(value * 100) / 100).toFixed(2);
    case 'count':
    default:
      return num.format(value);
  }
}

/** Versión compacta para ejes de gráficos: 27.6k */
export function formatCompact(value, format) {
  if (format === 'usd' && Math.abs(value) >= 1000) {
    return `$${Math.round(value / 1000)}k`;
  }
  if (format === 'pct') return `${Math.round(value)}%`;
  if (format === 'hs') return `${Math.round(value * 10) / 10} h`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return num.format(Math.round(value * 10) / 10);
}

/**
 * Variación porcentual contra el período anterior.
 * @param {number} value
 * @param {number | null | undefined} previous
 * @returns {number | null}
 */
export function delta(value, previous) {
  if (previous === null || previous === undefined || previous === 0) return null;
  return ((value - previous) / Math.abs(previous)) * 100;
}

/**
 * Instantánea a Date. Fechas solo-día (`YYYY-MM-DD`) = mediodía AR para no
 * correr el día por el offset.
 * @param {string} iso
 */
export function toDate(iso) {
  if (!iso) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return new Date(`${iso}T12:00:00-03:00`);
  }
  return new Date(iso);
}

/** Partes calendario/hora en Argentina. */
function partesAR(fecha) {
  const d = fecha instanceof Date ? fecha : toDate(fecha);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ_AR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    day: get('day'),
    month: get('month'),
    year: get('year'),
    hour: get('hour') === '24' ? '00' : get('hour'),
    minute: get('minute'),
  };
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** Ahora (instantánea real; al formatear usamos TZ AR). */
export function ahora() {
  return new Date();
}

/** 'YYYY-MM-DD' en Argentina. */
export function hoyIso(fecha = ahora()) {
  const p = partesAR(fecha);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 'YYYY-MM' del mes calendario AR de `fecha`. */
export function mesId(fecha = ahora()) {
  const p = partesAR(fecha);
  return `${p.year}-${p.month}`;
}

/** 'Septiembre 2026' (mes AR). */
export function nombreMesAnio(fecha = ahora()) {
  const p = partesAR(fecha);
  return `${MESES_LARGOS[Number(p.month) - 1]} ${p.year}`;
}

/** Lunes de la semana ISO en calendario AR. */
export function inicioSemanaIso(fecha = ahora()) {
  const p = partesAR(fecha);
  const local = new Date(Number(p.year), Number(p.month) - 1, Number(p.day));
  const dow = local.getDay() || 7;
  local.setDate(local.getDate() - dow + 1);
  return local;
}

/** 'Semana del 1 al 7 de septiembre' */
export function formatRangoSemana(fecha = ahora()) {
  const inicio = inicioSemanaIso(fecha);
  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 6);
  if (inicio.getMonth() === fin.getMonth()) {
    return `Semana del ${inicio.getDate()} al ${fin.getDate()} de ${MESES[fin.getMonth()]}`;
  }
  return `Semana del ${inicio.getDate()} ${MESES[inicio.getMonth()]} al ${fin.getDate()} ${MESES[fin.getMonth()]}`;
}

/** '2026-08' → 'ago 26' */
export function formatMes(ym) {
  const [y, m] = ym.split('-');
  return `${MESES[Number(m) - 1]} ${y.slice(2)}`;
}

/** ISO → 'dd/mm/aaaa' en Argentina. */
export function formatFecha(iso) {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const p = partesAR(iso);
  if (!p.day) return '—';
  return `${p.day}/${p.month}/${p.year}`;
}

/** ISO → 'dd/mm/aaaa, HH:MM' (AR). */
export function formatFechaHora(iso) {
  if (!iso) return '—';
  const p = partesAR(iso);
  if (!p.day) return '—';
  return `${p.day}/${p.month}/${p.year}, ${p.hour}:${p.minute}`;
}

/**
 * Distancia en lenguaje natural: 'hace 2 h', 'hace 3 d' (reloj AR).
 * @param {string | null} iso
 * @param {Date} [ref]
 */
export function hace(iso, ref = ahora()) {
  if (!iso) return 'nunca';
  const ms = ref.getTime() - toDate(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  if (ms < 0) return formatFecha(iso);
  const min = Math.round(ms / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `hace ${d} d`;
  return `hace ${Math.round(d / 30)} mes${Math.round(d / 30) > 1 ? 'es' : ''}`;
}

/** Días entre dos fechas (calendario). */
export function diasEntre(desdeIso, hastaIso) {
  const ms = toDate(hastaIso).getTime() - toDate(desdeIso).getTime();
  return Math.round(ms / 86400000);
}

/**
 * Escala de ejes "redonda".
 * @param {number} min
 * @param {number} max
 * @param {number} [count]
 * @param {boolean} [entero]
 * @returns {number[]}
 */
export function niceTicks(min, max, count = 4, entero = false) {
  const span = max - min || Math.abs(max) || 1;
  const crudo = span / count;
  const mag = 10 ** Math.floor(Math.log10(crudo));
  const norm = crudo / mag;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  let step = mult * mag;
  if (entero) step = Math.max(1, Math.round(step));

  const desde = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = desde; v <= max + step * 0.001; v += step) ticks.push(Number(v.toFixed(6)));
  if (ticks[ticks.length - 1] < max) ticks.push(Number((ticks[ticks.length - 1] + step).toFixed(6)));
  return ticks;
}
