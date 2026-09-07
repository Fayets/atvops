/**
 * Mock: decreto de metas del mes + real acumulado a mitad de mes.
 * Septiembre 2026, día 14 de 30 — cuello claro en chats → conversaciones.
 */

/** @typedef {import('../../lib/metasMes.js').DecretoMes} DecretoMes */
/** @typedef {import('../../lib/metasMes.js').RealMes} RealMes */

/** Meta del ejemplo real del usuario. */
export const DECRETO_SEPTIEMBRE_2026 = /** @type {DecretoMes} */ ({
  mes: '2026-09',
  chats: 1500,
  conversaciones: 1200,
  agendas: 160,
  agendasOrganicas: 100,
  agendasAds: 60,
  showUpRate: 80,
  closeRateBueno: 35,
  closeRateMuyBueno: 40,
  inversionAds: 3000,
  cashMeta: 100000,
  cashAds: 30000,
  cashOrganico: 70000,
  creadoAt: '2026-09-01T10:00:00-03:00',
  creadoPor: 'Lucas',
});

/**
 * Real a día 14:
 * - Chats un toque arriba del ritmo.
 * - Conversaciones claramente abajo → tasa chats→conv 68% vs meta 80%.
 * - Agendas casi en ritmo de conversión desde conv (el volumen bajo arrastra).
 * - Show-up un poco flojo (76% vs 80%).
 * - Close rate bien (38.5%, entre bueno y muy bueno).
 */
export const REAL_DIA_14 = /** @type {RealMes} */ ({
  chats: 720,
  conversaciones: 490,
  agendas: 68,
  agendasOrganicas: 43,
  agendasAds: 25,
  shows: 52,
  cierres: 20,
  inversionAds: 1480,
  cash: 41800,
  cashAds: 12200,
  cashOrganico: 29600,
  syncAt: '2026-09-14T18:30:00-03:00',
  fuente: 'ATV MKT · mock',
});

/** Contexto de calendario del mock (mitad de mes). */
export const CONTEXTO_MOCK = {
  mes: '2026-09',
  diaHoy: 14,
  diasMes: 30,
  nombreMes: 'Septiembre 2026',
};
