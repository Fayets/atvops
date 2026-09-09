/**
 * Mock: vista OPS de Fulfillment (salud de cartera agregada).
 * Para OPS Manager / Founder — no el día a día de Mauri (CSM).
 */

export const OPS_FF_CONTEXTO = {
  mes: '2026-09',
  nombreMes: 'Septiembre 2026',
  diaHoy: 9,
  diasMes: 30,
  syncAt: '2026-09-09T18:30:00-03:00',
};

/** Cartera activa por programa. */
export const OPS_FF_PROGRAMAS = [
  { id: 'boost', label: 'Boost', clientes: 30, ticketUsd: 20000, revenueUsd: 600000 },
  { id: 'mentoria', label: 'Mentoría', clientes: 36, ticketUsd: 5000, revenueUsd: 180000 },
  { id: 'advantage', label: 'Advantage', clientes: 7, ticketUsd: 12000, revenueUsd: 84000 },
];

export const OPS_FF_RESUMEN = {
  activos: 73,
  onboardingsMes: 8,
  onboardingsMesAnterior: 5,
  metaOnboarding: 10,
  churnMes: 2,
  churnRate: 2.7,
  netGrowth: 6,
  caja2MesUsd: 87500,
};

export const OPS_FF_EXPANSION = {
  upsells: { cantidad: 5, revenueUsd: 55000 },
  recompras: { cantidad: 3, revenueUsd: 32500 },
  downsells: { cantidad: 2 },
  caja2Usd: 87500,
  metaCaja2Usd: 100000,
  porSemana: [
    { semana: 'S1', label: '1–7 sep', usd: 18000 },
    { semana: 'S2', label: '8–14 sep', usd: 24500 },
    { semana: 'S3', label: '15–21 sep', usd: 22000 },
    { semana: 'S4', label: '22–30 sep', usd: 23000 },
  ],
};

export const OPS_FF_SALUD = {
  vigentes: 52,
  proximosAVencer: 15,
  vencidos: 6,
  enPausa: 3,
  noRenuevan: 4,
  enLlamadaRecompra: 5,
  revenueRiesgo7dUsd: 95000,
  vencenProximos7d: 15,
};

export const OPS_FF_CALIDAD = {
  quejasMes: 4,
  quejasMesAnterior: 6,
  winsMes: 12,
  winsMesAnterior: 9,
  nps: 62,
  diasOnboardingPromedio: 11,
  tasaActivacion7d: 68,
  quejas: [
    { id: 'q1', cliente: 'Diego Ampuero', fechaAt: '2026-09-08', motivo: 'Expectativa vs entregable', responsable: 'Mauri', estado: 'abierta' },
    { id: 'q2', cliente: 'Iván Saldías', fechaAt: '2026-09-07', motivo: 'Demora en feedback', responsable: 'Juan Cruz', estado: 'en_curso' },
    { id: 'q3', cliente: 'Rocío Ferrán', fechaAt: '2026-09-05', motivo: 'Accesos incompletos', responsable: 'Franco', estado: 'resuelta' },
    { id: 'q4', cliente: 'Gonzalo Peñafiel', fechaAt: '2026-09-03', motivo: 'Sin avances percibidos', responsable: 'Mauri', estado: 'abierta' },
  ],
  wins: [
    { id: 'w1', cliente: 'Bruno Etchart', fechaAt: '2026-09-08', resultado: 'Primera venta con el embudo nuevo', responsable: 'Mauri' },
    { id: 'w2', cliente: 'Lucía Bardají', fechaAt: '2026-09-08', resultado: 'Cerró 3 llamadas en la semana', responsable: 'Juan Cruz' },
    { id: 'w3', cliente: 'Paula Ceriani', fechaAt: '2026-09-07', resultado: 'Upsell a Advantage', responsable: 'Mauri' },
    { id: 'w4', cliente: 'Cristina Vilaplana', fechaAt: '2026-09-04', resultado: 'ROAS > 3 en ads', responsable: 'Nahuel' },
    { id: 'w5', cliente: 'Matías Grinberg', fechaAt: '2026-09-02', resultado: 'Publicó primer VSL', responsable: 'Franco' },
  ],
};
