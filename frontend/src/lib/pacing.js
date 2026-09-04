/**
 * Motor de ritmo ("pacing") para metas mensuales.
 *
 * La pregunta que responde no es "¿cuánto llevamos?" sino "¿a este ritmo
 * llegamos, y si no, cuánto hay que hacer esta semana?". Todo lo que el
 * cuadro de mando prescribe sale de acá; es matemática pura, sin datos.
 */

/** Días que tiene un mes 'YYYY-MM'. */
export function diasDelMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Día del mes de `fecha` si cae dentro de `mes`; si es posterior, el último día; si es anterior, 0. */
export function diaDentroDelMes(fecha, mes) {
  const [y, m] = mes.split('-').map(Number);
  const inicio = new Date(y, m - 1, 1);
  const fin = new Date(y, m, 0);
  if (fecha < inicio) return 0;
  if (fecha > fin) return fin.getDate();
  return fecha.getDate();
}

/** Umbrales de estado sobre actual ÷ esperado-a-hoy. */
export const CORTES_RITMO = { adelantado: 1.05, en_ritmo: 0.95, atrasado: 0.75 };

export const ESTADO_RITMO = {
  adelantado: { label: 'adelantado', tone: 'ok' },
  en_ritmo: { label: 'en ritmo', tone: 'ok' },
  atrasado: { label: 'atrasado', tone: 'warn' },
  critico: { label: 'crítico', tone: 'alert' },
  cumplida: { label: 'cumplida', tone: 'ok' },
};

/**
 * @param {{ meta: number, actual: number, diasMes: number, diaHoy: number }} p
 */
export function ritmo({ meta, actual, diasMes, diaHoy }) {
  const dia = Math.max(0, Math.min(diasMes, diaHoy));
  const fraccion = dia / diasMes;
  const esperado = meta * fraccion;
  const restante = Math.max(0, meta - actual);
  const diasRestantes = diasMes - dia;
  const actualPorDia = dia > 0 ? actual / dia : 0;
  const necesarioPorDia = diasRestantes > 0 ? restante / diasRestantes : restante;
  const proyeccion = actual + actualPorDia * diasRestantes;
  const pctMeta = meta > 0 ? actual / meta : 0;
  const pctRitmo = esperado > 0 ? actual / esperado : actual > 0 ? 2 : 1;

  let estado;
  if (actual >= meta) estado = 'cumplida';
  else if (pctRitmo >= CORTES_RITMO.adelantado) estado = 'adelantado';
  else if (pctRitmo >= CORTES_RITMO.en_ritmo) estado = 'en_ritmo';
  else if (pctRitmo >= CORTES_RITMO.atrasado) estado = 'atrasado';
  else estado = 'critico';

  return {
    dia,
    diasMes,
    diasRestantes,
    fraccion,
    esperado,
    gap: actual - esperado,
    restante,
    actualPorDia,
    necesarioPorDia,
    necesarioSemana: necesarioPorDia * Math.min(7, Math.max(diasRestantes, 1)),
    proyeccion,
    pctMeta,
    pctRitmo,
    estado,
    llega: proyeccion >= meta,
  };
}

/**
 * Qué palancas correr esta semana para cubrir lo que falta.
 * Greedy por rendimiento: primero la que más rinde, hasta cubrir. Excluye las
 * quemadas. Devuelve también cuánto sobra o falta, para decirlo sin adornos.
 *
 * @param {number} necesario
 * @param {{ id: string, nombre: string, rendimiento: number, estado: string }[]} palancas
 */
export function planPalancas(necesario, palancas) {
  const usables = palancas
    .filter((p) => p.estado !== 'quemada')
    .sort((a, b) => b.rendimiento - a.rendimiento);

  const elegidas = [];
  let cubre = 0;
  for (const p of usables) {
    if (cubre >= necesario) break;
    elegidas.push(p);
    cubre += p.rendimiento;
  }

  return { elegidas, cubre, faltante: Math.max(0, necesario - cubre), sobra: Math.max(0, cubre - necesario) };
}

/**
 * Cuántos llamados hay que agendar para llegar a N cierres, dado el embudo.
 * @param {{ cierres: number, closeRate: number, showRate: number, agendadosEnCalendario: number }} p
 */
export function planEmbudo({ cierres, closeRate, showRate, agendadosEnCalendario }) {
  const shows = closeRate > 0 ? cierres / closeRate : Infinity;
  const agendados = showRate > 0 ? shows / showRate : Infinity;
  return {
    showsNecesarios: Math.ceil(shows),
    agendadosNecesarios: Math.ceil(agendados),
    faltanAgendar: Math.max(0, Math.ceil(agendados) - agendadosEnCalendario),
  };
}

/** Número de semana ISO 8601 de una fecha. */
export function semanaIso(fecha) {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - inicio) / 86400000 + 1) / 7);
}
