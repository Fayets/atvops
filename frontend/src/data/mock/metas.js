/**
 * Mock: metas del mes y cobranza.
 *
 * Las metas son lo que cada área se comprometió a cumplir en el mes. El
 * `acumulado` es una serie diaria de ejemplo; el API la recorta al día de hoy
 * del calendario real.
 *
 * @typedef {import('../types.js').Meta} Meta
 * @typedef {import('../types.js').Cuota} Cuota
 */

export const MES_ACTUAL = '2026-09';

/** @type {Meta[]} */
export const METAS = [
  {
    id: 'mkt_chats',
    area: 'marketing',
    nombre: 'Chats abiertos',
    meta: 2000,
    format: 'count',
    mes: MES_ACTUAL,
    dueno: 'Juan Cruz',
    sourceId: 'manual',
    principal: true,
    acumulado: [0, 120, 300, 430, 500, 500, 500, 590, 700, 790, 840, 840, 840, 840],
    palancas: [
      {
        id: 'seq_nacho',
        nombre: 'Secuencia · Testimonio Nacho',
        tipo: 'secuencia',
        rendimiento: 500,
        duracionDias: 4,
        ultimaVezAt: '2026-09-05',
        estado: 'lista',
        nota: 'La que mejor rindió del año. Repetible cada 3 semanas sin quemar.',
      },
      {
        id: 'seq_es',
        nombre: 'Secuencia · Caso España',
        tipo: 'secuencia',
        rendimiento: 400,
        duracionDias: 4,
        ultimaVezAt: null,
        estado: 'nueva',
        nota: 'Guionada, sin correr. Rendimiento estimado por el caso Nacho.',
      },
      {
        id: 'seq_hook',
        nombre: 'Secuencia · Hook facturación',
        tipo: 'secuencia',
        rendimiento: 340,
        duracionDias: 4,
        ultimaVezAt: '2026-09-11',
        estado: 'lista',
      },
      {
        id: 'seq_agencia',
        nombre: 'Secuencia · Ángulo agencia',
        tipo: 'secuencia',
        rendimiento: 180,
        duracionDias: 3,
        ultimaVezAt: '2026-08-20',
        estado: 'floja',
        nota: 'Rindió la mitad que las otras. Reescribir antes de repetir.',
      },
    ],
  },
  {
    id: 'mkt_agendas',
    area: 'marketing',
    nombre: 'Llamadas agendadas desde ads',
    meta: 60,
    format: 'count',
    mes: MES_ACTUAL,
    dueno: 'Juan Cruz',
    sourceId: 'calendly',
    acumulado: [1, 3, 6, 9, 11, 12, 13, 15, 18, 21, 23, 24, 25, 25],
  },
  {
    id: 'ven_cierres',
    area: 'ventas',
    nombre: 'Cierres',
    meta: 24,
    format: 'count',
    mes: MES_ACTUAL,
    dueno: 'Lucas',
    sourceId: 'manual',
    principal: true,
    acumulado: [0, 1, 1, 2, 3, 3, 3, 4, 5, 6, 7, 8, 9, 9],
  },
  {
    id: 'ven_cash',
    area: 'ventas',
    nombre: 'Cash collected',
    meta: 180000,
    format: 'usd',
    mes: MES_ACTUAL,
    dueno: 'Lucas',
    sourceId: 'manual',
    acumulado: [0, 12000, 12000, 24500, 37000, 37000, 37000, 49000, 61500, 73500, 86000, 92000, 98500, 98500],
  },
];

export const EMBUDO_VENTAS = {
  closeRate: 0.31,
  showRate: 0.73,
  agendadosEnCalendario: 14,
  ticketPromedioUsd: 12300,
};

/** @type {Cuota[]} */
export const CUOTAS = [
  { id: 'cuo_01', cliente: 'Vicente Larraín', plan: 'Boost', montoUsd: 6500, venceAt: '2026-09-02', estado: 'pagada', pagadaAt: '2026-09-02' },
  { id: 'cuo_02', cliente: 'Nacho Berdún', plan: 'Boost', montoUsd: 6000, venceAt: '2026-09-03', estado: 'pagada', pagadaAt: '2026-09-04' },
  { id: 'cuo_03', cliente: 'Cata Ossandón', plan: 'Boost', montoUsd: 5000, venceAt: '2026-09-05', estado: 'pagada', pagadaAt: '2026-09-05' },
  { id: 'cuo_04', cliente: 'Sofi Marchetti', plan: 'Mentoría', montoUsd: 3200, venceAt: '2026-09-05', estado: 'vencida', pagadaAt: null },
  { id: 'cuo_05', cliente: 'Marta Sagredo', plan: 'Boost', montoUsd: 4800, venceAt: '2026-09-07', estado: 'pagada', pagadaAt: '2026-09-07' },
  { id: 'cuo_06', cliente: 'Javi Contreras', plan: 'Mentoría', montoUsd: 3700, venceAt: '2026-09-08', estado: 'vencida', pagadaAt: null },
  { id: 'cuo_07', cliente: 'Mica Robledo', plan: 'Boost', montoUsd: 5300, venceAt: '2026-09-09', estado: 'pagada', pagadaAt: '2026-09-09' },
  { id: 'cuo_08', cliente: 'Tomás Iriarte', plan: 'Mentoría', montoUsd: 4000, venceAt: '2026-09-10', estado: 'pagada', pagadaAt: '2026-09-12' },
  { id: 'cuo_09', cliente: 'Fede Larralde', plan: 'Boost', montoUsd: 4700, venceAt: '2026-09-10', estado: 'vencida', pagadaAt: null },
  { id: 'cuo_10', cliente: 'Álvaro Peñalver', plan: 'Boost', montoUsd: 4300, venceAt: '2026-09-12', estado: 'pagada', pagadaAt: '2026-09-12' },
  { id: 'cuo_11', cliente: 'Nuria Bassols', plan: 'Mentoría', montoUsd: 4200, venceAt: '2026-09-13', estado: 'vencida', pagadaAt: null },
  { id: 'cuo_12', cliente: 'Iker Zubiaga', plan: 'Mentoría', montoUsd: 4300, venceAt: '2026-09-15', estado: 'pendiente', pagadaAt: null },
  { id: 'cuo_13', cliente: 'Lucía Bardají', plan: 'Mentoría', montoUsd: 3800, venceAt: '2026-09-16', estado: 'pendiente', pagadaAt: null },
  { id: 'cuo_14', cliente: 'Bruno Etchart', plan: 'Mentoría', montoUsd: 3500, venceAt: '2026-09-17', estado: 'pendiente', pagadaAt: null },
  { id: 'cuo_15', cliente: 'Paula Ceriani', plan: 'Boost', montoUsd: 7000, venceAt: '2026-09-18', estado: 'pendiente', pagadaAt: null },
  { id: 'cuo_16', cliente: 'Cristina Vilaplana', plan: 'Boost', montoUsd: 6450, venceAt: '2026-09-19', estado: 'pendiente', pagadaAt: null },
  { id: 'cuo_17', cliente: 'Nacho Berdún', plan: 'Boost', montoUsd: 6000, venceAt: '2026-09-24', estado: 'pendiente', pagadaAt: null },
  { id: 'cuo_18', cliente: 'Vicente Larraín', plan: 'Boost', montoUsd: 6500, venceAt: '2026-09-26', estado: 'pendiente', pagadaAt: null },
  { id: 'cuo_19', cliente: 'Cata Ossandón', plan: 'Boost', montoUsd: 5000, venceAt: '2026-09-28', estado: 'pendiente', pagadaAt: null },
  { id: 'cuo_20', cliente: 'Mica Robledo', plan: 'Boost', montoUsd: 5300, venceAt: '2026-09-30', estado: 'pendiente', pagadaAt: null },
];
