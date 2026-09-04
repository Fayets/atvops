/**
 * Mock: tablero de Lucas (ventas).
 * Fuente real futura: Calendly (agendados/shows) + payment processor (cash).
 * @typedef {import('../types.js').Llamado} Llamado
 * @typedef {import('../types.js').SemanaVentas} SemanaVentas
 */

/**
 * Últimas 8 semanas cerradas.
 * @type {SemanaVentas[]}
 */
export const SEMANAS = [
  { semana: 'S30', desdeAt: '2026-07-20', agendados: 14, shows: 9, cierres: 3, cashUsd: 34500 },
  { semana: 'S31', desdeAt: '2026-07-27', agendados: 17, shows: 12, cierres: 4, cashUsd: 41000 },
  { semana: 'S32', desdeAt: '2026-08-03', agendados: 15, shows: 10, cierres: 2, cashUsd: 26000 },
  { semana: 'S33', desdeAt: '2026-08-10', agendados: 19, shows: 13, cierres: 4, cashUsd: 48000 },
  { semana: 'S34', desdeAt: '2026-08-17', agendados: 16, shows: 11, cierres: 3, cashUsd: 31500 },
  { semana: 'S35', desdeAt: '2026-08-24', agendados: 21, shows: 15, cierres: 5, cashUsd: 58000 },
  { semana: 'S36', desdeAt: '2026-08-31', agendados: 18, shows: 12, cierres: 3, cashUsd: 37000 },
  { semana: 'S37', desdeAt: '2026-09-07', agendados: 22, shows: 16, cierres: 5, cashUsd: 61500 },
];

/**
 * Llamados de las últimas dos semanas, del más reciente al más viejo.
 * @type {Llamado[]}
 */
export const LLAMADOS = [
  { id: 'lla_01', prospecto: 'Ariel Vasconcelos', pais: 'AR', fechaAt: '2026-09-14T15:00:00-03:00', origen: 'ads', estado: 'agendado', closer: 'Lucas', montoUsd: null, oferta: 'Growth 90d' },
  { id: 'lla_02', prospecto: 'Elena Quiroga', pais: 'ES', fechaAt: '2026-09-14T11:30:00-03:00', origen: 'organico', estado: 'agendado', closer: 'Lucas', montoUsd: null, oferta: 'Growth 90d' },
  { id: 'lla_03', prospecto: 'Bruno Etchart', pais: 'AR', fechaAt: '2026-09-10T16:00:00-03:00', origen: 'referido', estado: 'cerrado', closer: 'Lucas', montoUsd: 10500, oferta: 'Growth 90d' },
  { id: 'lla_04', prospecto: 'Diego Ampuero', pais: 'CL', fechaAt: '2026-09-10T10:00:00-03:00', origen: 'ads', estado: 'perdido', closer: 'Lucas', montoUsd: null, oferta: 'Growth 90d' },
  { id: 'lla_05', prospecto: 'Rocío Ferrán', pais: 'ES', fechaAt: '2026-09-09T13:30:00-03:00', origen: 'ads', estado: 'no_show', closer: 'Juan Cruz', montoUsd: null, oferta: 'Growth 90d' },
  { id: 'lla_06', prospecto: 'Lucía Bardají', pais: 'ES', fechaAt: '2026-09-08T09:00:00-03:00', origen: 'ads', estado: 'cerrado', closer: 'Lucas', montoUsd: 11500, oferta: 'Growth 90d' },
  { id: 'lla_07', prospecto: 'Matías Grinberg', pais: 'AR', fechaAt: '2026-09-08T17:00:00-03:00', origen: 'outbound', estado: 'show', closer: 'Lucas', montoUsd: null, oferta: 'Advantage' },
  { id: 'lla_08', prospecto: 'Paula Ceriani', pais: 'AR', fechaAt: '2026-09-07T14:00:00-03:00', origen: 'ads', estado: 'cerrado', closer: 'Lucas', montoUsd: 14000, oferta: 'Growth 90d' },
  { id: 'lla_09', prospecto: 'Iván Saldías', pais: 'CL', fechaAt: '2026-09-07T11:00:00-03:00', origen: 'organico', estado: 'perdido', closer: 'Juan Cruz', montoUsd: null, oferta: 'Advantage' },
  { id: 'lla_10', prospecto: 'Cristina Vilaplana', pais: 'ES', fechaAt: '2026-09-04T12:00:00-03:00', origen: 'ads', estado: 'cerrado', closer: 'Lucas', montoUsd: 12900, oferta: 'Growth 90d' },
  { id: 'lla_11', prospecto: 'Gonzalo Peñafiel', pais: 'CL', fechaAt: '2026-09-03T16:30:00-03:00', origen: 'ads', estado: 'no_show', closer: 'Lucas', montoUsd: null, oferta: 'Growth 90d' },
  { id: 'lla_12', prospecto: 'Ivo Marconi', pais: 'AR', fechaAt: '2026-09-02T10:30:00-03:00', origen: 'referido', estado: 'perdido', closer: 'Lucas', montoUsd: null, oferta: 'Advantage' },
];
