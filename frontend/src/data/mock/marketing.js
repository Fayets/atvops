/**
 * Mock: tablero de Juan Cruz (marketing).
 * Fuente real futura: Ads Manager (Meta Marketing API) para gasto/leads/frecuencia.
 * El ROAS necesita además el revenue atribuido, que hoy no está conectado.
 *
 * Nota de modelo ATV: las campañas de tráfico a DM no tienen pixel ni evento de
 * conversión, así que la métrica que gobierna es la FRECUENCIA (máx 1.4; en 1.6
 * el creativo está quemado). Las campañas con objetivo "ventas" se miran aparte
 * porque distorsionan el costo por lead del resto.
 *
 * @typedef {import('../types.js').Campania} Campania
 * @typedef {import('../types.js').GastoCanal} GastoCanal
 */

/** Umbrales de frecuencia del módulo de ads. */
export const FRECUENCIA = { objetivo: 1.4, quemado: 1.6 };

/** @type {Campania[]} */
export const CAMPANIAS = [
  { id: 'cmp_01', nombre: 'FMA · Testimonio Nacho', canal: 'meta', objetivo: 'trafico', estado: 'activa', gastoUsd: 6400, leads: 214, cplUsd: 29.9, roas: 5.4, frecuencia: 1.28, ultimaSyncAt: '2026-09-14T07:15:00-03:00' },
  { id: 'cmp_02', nombre: 'FMA · Hook facturación', canal: 'meta', objetivo: 'trafico', estado: 'activa', gastoUsd: 5900, leads: 168, cplUsd: 35.1, roas: 4.1, frecuencia: 1.62, ultimaSyncAt: '2026-09-14T07:15:00-03:00' },
  { id: 'cmp_03', nombre: 'FMA · Caso España', canal: 'meta', objetivo: 'trafico', estado: 'activa', gastoUsd: 4200, leads: 131, cplUsd: 32.1, roas: 4.8, frecuencia: 1.41, ultimaSyncAt: '2026-09-14T07:15:00-03:00' },
  { id: 'cmp_04', nombre: 'VSL · Retargeting 14d', canal: 'meta', objetivo: 'ventas', estado: 'activa', gastoUsd: 8800, leads: 96, cplUsd: 91.7, roas: 3.2, frecuencia: 1.19, ultimaSyncAt: '2026-09-14T07:15:00-03:00' },
  { id: 'cmp_05', nombre: 'YT · Entrevista Vicente', canal: 'youtube', objetivo: 'trafico', estado: 'activa', gastoUsd: 3100, leads: 74, cplUsd: 41.9, roas: 3.9, frecuencia: 1.12, ultimaSyncAt: '2026-09-13T22:00:00-03:00' },
  { id: 'cmp_06', nombre: 'FMA · Ángulo agencia', canal: 'meta', objetivo: 'trafico', estado: 'pausada', gastoUsd: 2300, leads: 51, cplUsd: 45.1, roas: 2.4, frecuencia: 1.74, ultimaSyncAt: '2026-09-12T07:15:00-03:00' },
  { id: 'cmp_07', nombre: 'TikTok · Test creativo', canal: 'tiktok', objetivo: 'trafico', estado: 'pausada', gastoUsd: 900, leads: 22, cplUsd: 40.9, roas: 1.8, frecuencia: 1.05, ultimaSyncAt: '2026-09-11T07:15:00-03:00' },
];

/**
 * Gasto del mes por canal.
 * @type {GastoCanal[]}
 */
export const GASTO_CANAL = [
  { canal: 'Meta', gastoUsd: 27600, leads: 660, roas: 4.5 },
  { canal: 'YouTube', gastoUsd: 3100, leads: 74, roas: 3.9 },
  { canal: 'TikTok', gastoUsd: 900, leads: 22, roas: 1.8 },
];

/** Serie diaria de gasto y leads del mes en curso (para el gráfico). */
export const GASTO_DIARIO = [
  { dia: '01', gastoUsd: 980, leads: 24 },
  { dia: '04', gastoUsd: 1020, leads: 27 },
  { dia: '07', gastoUsd: 1140, leads: 22 },
  { dia: '10', gastoUsd: 1080, leads: 29 },
  { dia: '13', gastoUsd: 1210, leads: 31 },
  { dia: '16', gastoUsd: 1160, leads: 25 },
  { dia: '19', gastoUsd: 1290, leads: 33 },
  { dia: '22', gastoUsd: 1240, leads: 28 },
  { dia: '25', gastoUsd: 1350, leads: 36 },
  { dia: '28', gastoUsd: 1420, leads: 34 },
  { dia: '31', gastoUsd: 1310, leads: 30 },
];
