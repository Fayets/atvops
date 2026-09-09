/**
 * Mock: vista OPS de Ventas (salud vs meta mensual).
 * Para el OPS Manager / Founder — agregado, no día a día.
 * Fuente futura: decreto + ATV MKT + payments.
 */

/** Decreto / real alineados al reporte OPS (sep 2026, día 9). */
export const OPS_VENTAS_CONTEXTO = {
  mes: '2026-09',
  nombreMes: 'Septiembre 2026',
  diaHoy: 9,
  diasMes: 30,
  syncAt: '2026-09-09T18:00:00-03:00',
};

export const OPS_VENTAS_META = {
  conversaciones: 1200,
  aplicaciones: 400,
  agendas: 160,
  shows: 128, // ~80% show-up sobre 160
  cierres: 45, // ~35% close sobre shows
  cashUsd: 180000,
  showRate: 80,
  closeRate: 35,
  averageSaleUsd: 11000,
};

export const OPS_VENTAS_ACTUAL = {
  chats: 748,
  conversaciones: 0,
  aplicaciones: 42,
  agendas: 19,
  shows: 14,
  cierres: 12,
  cashUsd: 131400,
};

/** Tendencia 8 semanas para sparklines de salud. */
export const OPS_VENTAS_SEMANAS = [
  { semana: 'S30', showRate: 78, closeRate: 34, averageSaleUsd: 10800 },
  { semana: 'S31', showRate: 81, closeRate: 36, averageSaleUsd: 11200 },
  { semana: 'S32', showRate: 76, closeRate: 32, averageSaleUsd: 10500 },
  { semana: 'S33', showRate: 79, closeRate: 35, averageSaleUsd: 11400 },
  { semana: 'S34', showRate: 74, closeRate: 31, averageSaleUsd: 9800 },
  { semana: 'S35', showRate: 82, closeRate: 38, averageSaleUsd: 12000 },
  { semana: 'S36', showRate: 77, closeRate: 33, averageSaleUsd: 10900 },
  { semana: 'S37', showRate: 73, closeRate: 5.3, averageSaleUsd: 10950 },
];
