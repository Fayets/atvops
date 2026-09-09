/**
 * Mock: dashboard personal del Closer.
 * Ejemplo: Lucas — solo su agenda, sus números y follow-ups.
 * Fuente futura: Google Calendar + CRM dispositions + metas personales.
 *
 * Estados de llamada: agendado | show_calificado | show_descalificado |
 * no_show | reagendado | cancelado | cerrado
 */

export const CLOSER_PERFIL = {
  id: 'lucas',
  nombre: 'Lucas',
  rol: 'closer',
};

export const CLOSER_CONTEXTO = {
  mes: '2026-09',
  nombreMes: 'Septiembre 2026',
  diaHoy: 9,
  diasMes: 30,
  hoyIso: '2026-09-09',
  syncAt: '2026-09-09T18:00:00-03:00',
};

/** Metas personales del mes. */
export const CLOSER_METAS = {
  llamadas: 160,
  shows: 128,
  cierres: 45,
  cashUsd: 45000,
};

/** Actual del mes (mock). */
export const CLOSER_ACTUAL = {
  llamadas: 19,
  shows: 14,
  cierres: 12,
  cashUsd: 131400,
};

/** Tendencia 4 semanas (personal). */
export const CLOSER_SEMANAS = [
  { semana: 'S34', llamadas: 4, shows: 3, cierres: 2, cashUsd: 22000 },
  { semana: 'S35', llamadas: 5, shows: 4, cierres: 3, cashUsd: 34500 },
  { semana: 'S36', llamadas: 5, shows: 3, cierres: 3, cashUsd: 32900 },
  { semana: 'S37', llamadas: 5, shows: 4, cierres: 4, cashUsd: 42000 },
];

/** Meta agregada del equipo (sin breakdown por closer). */
export const CLOSER_EQUIPO = {
  metaUsd: 180000,
  actualUsd: 131400,
  porSemana: [
    { label: 'S34', usd: 31500 },
    { label: 'S35', usd: 58000 },
    { label: 'S36', usd: 37000 },
    { label: 'S37', usd: 61500 },
  ],
};

/**
 * Llamadas de hoy del closer.
 * @type {Array<object>}
 */
export const CLOSER_HOY = [
  {
    id: 'ch_01',
    prospecto: 'Tomás Riganti',
    pais: 'AR',
    email: 'tomas.r@mail.com',
    telefono: '+54 11 5555-1201',
    fechaAt: '2026-09-09T10:00:00-03:00',
    origen: 'ads',
    estado: 'agendado',
    oferta: 'Growth 90d',
    offerTier: 'Boost',
    setter: 'Sofía',
    notasSetter: 'Viene de ads · factura ~8k/mes · quiere sistema de ads propio.',
    ultimaInteraccion: 'Confirmó por WhatsApp ayer 21:40',
    confirmado: false,
  },
  {
    id: 'ch_02',
    prospecto: 'Camila Ordóñez',
    pais: 'ES',
    email: 'camila.o@mail.com',
    telefono: '+34 600 111 222',
    fechaAt: '2026-09-09T12:30:00-03:00',
    origen: 'organico',
    estado: 'show_calificado',
    oferta: 'Growth 90d',
    offerTier: 'Boost',
    setter: 'Maxi',
    notasSetter: 'Orgánico IG · ya tuvo mentoría corta · lista para 90d.',
    ultimaInteraccion: 'Entró a la sala Zoom',
    confirmado: true,
  },
  {
    id: 'ch_03',
    prospecto: 'Nicolás Paredes',
    pais: 'CL',
    email: 'nico.p@mail.com',
    telefono: '+56 9 8765 4321',
    fechaAt: '2026-09-09T16:00:00-03:00',
    origen: 'referido',
    estado: 'agendado',
    oferta: 'Advantage',
    offerTier: 'Advantage',
    setter: 'Vale',
    notasSetter: 'Referido de Bruno · ticket alto · decide con socio.',
    ultimaInteraccion: 'Sin confirmar hoy',
    confirmado: false,
  },
  {
    id: 'ch_04',
    prospecto: 'Rocío Ferrán',
    pais: 'ES',
    email: 'rocio.f@mail.com',
    telefono: '+34 611 000 222',
    fechaAt: '2026-09-09T13:30:00-03:00',
    origen: 'ads',
    estado: 'no_show',
    oferta: 'Growth 90d',
    offerTier: 'Boost',
    setter: 'Maxi',
    notasSetter: 'No show · recontacto mañana.',
    ultimaInteraccion: 'No entró a la call',
    confirmado: true,
  },
  {
    id: 'ch_05',
    prospecto: 'Bruno Etchart',
    pais: 'AR',
    email: 'bruno.e@mail.com',
    telefono: '+54 11 4444-9000',
    fechaAt: '2026-09-09T09:00:00-03:00',
    origen: 'referido',
    estado: 'cerrado',
    oferta: 'Growth 90d',
    offerTier: 'Boost',
    montoUsd: 10500,
    setter: 'Sofía',
    notasSetter: 'Referido caliente · pago transferencia.',
    ultimaInteraccion: 'Cerró en call',
    confirmado: true,
  },
];

/**
 * Otras llamadas de la semana (vista semanal).
 * @type {Array<object>}
 */
export const CLOSER_SEMANA = [
  {
    id: 'ch_w_01',
    prospecto: 'Paula Ceriani',
    pais: 'AR',
    email: 'paula.c@mail.com',
    telefono: '+54 11 2222-1111',
    fechaAt: '2026-09-08T11:00:00-03:00',
    origen: 'ads',
    estado: 'cerrado',
    oferta: 'Advantage',
    offerTier: 'Advantage',
    montoUsd: 14000,
    setter: 'Maxi',
    notasSetter: 'Upsell',
    confirmado: true,
  },
  {
    id: 'ch_w_02',
    prospecto: 'Iván Saldías',
    pais: 'CL',
    email: 'ivan.s@mail.com',
    telefono: '+56 9 1111 2222',
    fechaAt: '2026-09-10T15:00:00-03:00',
    origen: 'organico',
    estado: 'agendado',
    oferta: 'Growth 90d',
    offerTier: 'Boost',
    setter: 'Vale',
    notasSetter: 'Pedirá Advantage',
    confirmado: true,
  },
  {
    id: 'ch_w_03',
    prospecto: 'Laura Benítez',
    pais: 'ES',
    email: 'laura.b@mail.com',
    telefono: '+34 600 333 444',
    fechaAt: '2026-09-11T10:30:00-03:00',
    origen: 'referido',
    estado: 'agendado',
    oferta: 'Mentoría',
    offerTier: 'Mentoría',
    setter: 'Sofía',
    notasSetter: 'Follow de no show previo',
    confirmado: false,
  },
  {
    id: 'ch_w_04',
    prospecto: 'Diego Ampuero',
    pais: 'PE',
    email: 'diego.a@mail.com',
    telefono: '+51 999 888 777',
    fechaAt: '2026-09-12T17:00:00-03:00',
    origen: 'ads',
    estado: 'agendado',
    oferta: 'Growth 90d',
    offerTier: 'Boost',
    setter: 'Maxi',
    notasSetter: 'Volvió de nurture',
    confirmado: false,
  },
];

/** Follow-ups personales. */
export const CLOSER_FOLLOW_UPS = [
  { id: 'cfu_01', prospecto: 'Matías Grinberg', ultimoContactoAt: '2026-09-08', disposition: 'pensando', proximoPaso: 'Enviar propuesta Advantage', diasSinContacto: 1 },
  { id: 'cfu_02', prospecto: 'Ariel Vasconcelos', ultimoContactoAt: '2026-09-08', disposition: 'quiere hablar con pareja', proximoPaso: 'Call corta de 15 min', diasSinContacto: 1 },
  { id: 'cfu_03', prospecto: 'Javier Solís', ultimoContactoAt: '2026-09-05', disposition: 'no contestó', proximoPaso: 'WhatsApp + reagendar', diasSinContacto: 4 },
  { id: 'cfu_04', prospecto: 'Gonzalo Peñafiel', ultimoContactoAt: '2026-09-03', disposition: 'timing', proximoPaso: 'Check-in fin de mes', diasSinContacto: 6 },
  { id: 'cfu_05', prospecto: 'Ivo Marconi', ultimoContactoAt: '2026-08-28', disposition: 'precio', proximoPaso: 'Oferta Mentoría / nurture', diasSinContacto: 12 },
  { id: 'cfu_06', prospecto: 'Diego Ampuero', ultimoContactoAt: '2026-09-01', disposition: 'pensando', proximoPaso: 'Case study Boost', diasSinContacto: 8 },
  { id: 'cfu_07', prospecto: 'Laura Benítez', ultimoContactoAt: '2026-09-07', disposition: 'no contestó', proximoPaso: 'Segundo intento call', diasSinContacto: 2 },
];

/** Dispositions recientes. */
export const CLOSER_DISPOSITIONS = [
  { id: 'cd_01', prospecto: 'Bruno Etchart', fechaAt: '2026-09-08', disposition: 'cerrado', offerTier: 'Boost', cashUsd: 10500, notas: 'Cerró en call · pago hoy', objection: null },
  { id: 'cd_02', prospecto: 'Lucía Bardají', fechaAt: '2026-09-08', disposition: 'cerrado', offerTier: 'Boost', cashUsd: 11500, notas: 'Transferencia confirmada', objection: null },
  { id: 'cd_03', prospecto: 'Diego Ampuero', fechaAt: '2026-09-08', disposition: 'cancelado', offerTier: 'Boost', cashUsd: null, notas: 'Vuelve en Q4', objection: 'precio' },
  { id: 'cd_04', prospecto: 'Camila Ordóñez', fechaAt: '2026-09-09', disposition: 'show_calificado', offerTier: 'Boost', cashUsd: null, notas: 'Show · pide propuesta', objection: null },
  { id: 'cd_05', prospecto: 'Rocío Ferrán', fechaAt: '2026-09-09', disposition: 'no_show', offerTier: 'Boost', cashUsd: null, notas: 'Reagendar', objection: null },
  { id: 'cd_06', prospecto: 'Paula Ceriani', fechaAt: '2026-09-07', disposition: 'cerrado', offerTier: 'Advantage', cashUsd: 14000, notas: 'Upsell en mesa', objection: null },
  { id: 'cd_07', prospecto: 'Iván Saldías', fechaAt: '2026-09-07', disposition: 'show_descalificado', offerTier: 'Advantage', cashUsd: null, notas: 'No es el avatar', objection: 'no_es_el_avatar' },
  { id: 'cd_08', prospecto: 'Cristina Vilaplana', fechaAt: '2026-09-04', disposition: 'cerrado', offerTier: 'Boost', cashUsd: 12900, notas: 'Cierre limpio', objection: null },
  { id: 'cd_09', prospecto: 'Ariel Vasconcelos', fechaAt: '2026-09-08', disposition: 'show_calificado', offerTier: 'Boost', cashUsd: null, notas: 'Habla con pareja', objection: 'hablar_con_pareja' },
  { id: 'cd_10', prospecto: 'Matías Grinberg', fechaAt: '2026-09-08', disposition: 'reagendado', offerTier: 'Mentoría', cashUsd: null, notas: 'Follow-up jueves', objection: null },
];
