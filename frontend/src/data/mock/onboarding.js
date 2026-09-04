/**
 * Mock: onboarding de cliente y de staff.
 * Hoy es 100% manual — es el proceso que el propio ATV Ops tiene que absorber.
 * Los dos KPIs que salen de acá: días de pago → primer entregable (cliente) y
 * días de contrato → primer día productivo (staff).
 *
 * @typedef {import('../types.js').ProcesoOnboarding} ProcesoOnboarding
 * @typedef {import('../types.js').PasoOnboarding} PasoOnboarding
 */

/** Plantilla del proceso de cliente. SLA 7 días. */
export const PLANTILLA_CLIENTE = [
  { id: 'c1', nombre: 'Pago confirmado', diaObjetivo: 0 },
  { id: 'c2', nombre: 'Acceso a Discord y canal privado', diaObjetivo: 0 },
  { id: 'c3', nombre: 'Formulario de arranque completado', diaObjetivo: 1 },
  { id: 'c4', nombre: 'Kickoff agendado', diaObjetivo: 2 },
  { id: 'c5', nombre: 'Auditoría de cuentas y contenido', diaObjetivo: 3 },
  { id: 'c6', nombre: 'Plan de 30 días entregado', diaObjetivo: 5 },
  { id: 'c7', nombre: 'Primer entregable publicado', diaObjetivo: 7 },
];

/** Plantilla del proceso de staff. SLA 10 días. */
export const PLANTILLA_STAFF = [
  { id: 's1', nombre: 'Contrato firmado', diaObjetivo: 0 },
  { id: 's2', nombre: 'Accesos y herramientas', diaObjetivo: 1 },
  { id: 's3', nombre: 'Manual de rol + Looms de proceso', diaObjetivo: 2 },
  { id: 's4', nombre: 'Shadowing con el responsable', diaObjetivo: 4 },
  { id: 's5', nombre: 'Primera tarea supervisada', diaObjetivo: 6 },
  { id: 's6', nombre: 'Checkpoint de criterios', diaObjetivo: 8 },
  { id: 's7', nombre: 'Primer día productivo sin supervisión', diaObjetivo: 10 },
];

/** @type {ProcesoOnboarding[]} */
export const PROCESOS = [
  {
    id: 'onb_01',
    tipo: 'cliente',
    sujeto: 'Lucía Bardají',
    rol: 'Growth 90d · ES',
    inicioAt: '2026-09-08',
    slaDias: 7,
    diasTranscurridos: 6,
    cerradoAt: null,
    pasos: [
      { id: 'c1', nombre: 'Pago confirmado', estado: 'completado', responsable: 'Lucas', diaObjetivo: 0, completadoAt: '2026-09-08' },
      { id: 'c2', nombre: 'Acceso a Discord y canal privado', estado: 'completado', responsable: 'Franco', diaObjetivo: 0, completadoAt: '2026-09-08' },
      { id: 'c3', nombre: 'Formulario de arranque completado', estado: 'completado', responsable: 'Lucía', diaObjetivo: 1, completadoAt: '2026-09-09' },
      { id: 'c4', nombre: 'Kickoff agendado', estado: 'completado', responsable: 'Franco', diaObjetivo: 2, completadoAt: '2026-09-10' },
      { id: 'c5', nombre: 'Auditoría de cuentas y contenido', estado: 'completado', responsable: 'Juan Cruz', diaObjetivo: 3, completadoAt: '2026-09-12' },
      { id: 'c6', nombre: 'Plan de 30 días entregado', estado: 'en_curso', responsable: 'Juan Cruz', diaObjetivo: 5, completadoAt: null, detalle: 'Un día tarde: esperando el acceso al Ads Manager del cliente.' },
      { id: 'c7', nombre: 'Primer entregable publicado', estado: 'pendiente', responsable: 'Nahuel', diaObjetivo: 7, completadoAt: null },
    ],
  },
  {
    id: 'onb_02',
    tipo: 'cliente',
    sujeto: 'Bruno Etchart',
    rol: 'Growth 90d · AR',
    inicioAt: '2026-09-10',
    slaDias: 7,
    diasTranscurridos: 4,
    cerradoAt: null,
    pasos: [
      { id: 'c1', nombre: 'Pago confirmado', estado: 'completado', responsable: 'Lucas', diaObjetivo: 0, completadoAt: '2026-09-10' },
      { id: 'c2', nombre: 'Acceso a Discord y canal privado', estado: 'completado', responsable: 'Franco', diaObjetivo: 0, completadoAt: '2026-09-10' },
      { id: 'c3', nombre: 'Formulario de arranque completado', estado: 'completado', responsable: 'Bruno', diaObjetivo: 1, completadoAt: '2026-09-11' },
      { id: 'c4', nombre: 'Kickoff agendado', estado: 'completado', responsable: 'Franco', diaObjetivo: 2, completadoAt: '2026-09-11' },
      { id: 'c5', nombre: 'Auditoría de cuentas y contenido', estado: 'en_curso', responsable: 'Juan Cruz', diaObjetivo: 3, completadoAt: null },
      { id: 'c6', nombre: 'Plan de 30 días entregado', estado: 'pendiente', responsable: 'Juan Cruz', diaObjetivo: 5, completadoAt: null },
      { id: 'c7', nombre: 'Primer entregable publicado', estado: 'pendiente', responsable: 'Nahuel', diaObjetivo: 7, completadoAt: null },
    ],
  },
  {
    id: 'onb_03',
    tipo: 'cliente',
    sujeto: 'Iker Zubiaga',
    rol: 'Growth 90d · ES',
    inicioAt: '2026-08-26',
    slaDias: 7,
    diasTranscurridos: 5,
    cerradoAt: '2026-08-31',
    pasos: PLANTILLA_CLIENTE.map((p, i) => ({
      ...p,
      estado: /** @type {const} */ ('completado'),
      responsable: ['Lucas', 'Franco', 'Iker', 'Franco', 'Juan Cruz', 'Juan Cruz', 'Nahuel'][i],
      completadoAt: '2026-08-31',
    })),
  },
  {
    id: 'onb_04',
    tipo: 'staff',
    sujeto: 'Agustina Roldán',
    rol: 'Setter · AR',
    inicioAt: '2026-09-07',
    slaDias: 10,
    diasTranscurridos: 7,
    cerradoAt: null,
    pasos: [
      { id: 's1', nombre: 'Contrato firmado', estado: 'completado', responsable: 'Franco', diaObjetivo: 0, completadoAt: '2026-09-07' },
      { id: 's2', nombre: 'Accesos y herramientas', estado: 'completado', responsable: 'Franco', diaObjetivo: 1, completadoAt: '2026-09-09', detalle: 'Un día tarde: la licencia de Calendly se pidió después del contrato.' },
      { id: 's3', nombre: 'Manual de rol + Looms de proceso', estado: 'completado', responsable: 'Lucas', diaObjetivo: 2, completadoAt: '2026-09-10' },
      { id: 's4', nombre: 'Shadowing con el responsable', estado: 'completado', responsable: 'Lucas', diaObjetivo: 4, completadoAt: '2026-09-12' },
      { id: 's5', nombre: 'Primera tarea supervisada', estado: 'en_curso', responsable: 'Lucas', diaObjetivo: 6, completadoAt: null },
      { id: 's6', nombre: 'Checkpoint de criterios', estado: 'pendiente', responsable: 'Franco', diaObjetivo: 8, completadoAt: null },
      { id: 's7', nombre: 'Primer día productivo sin supervisión', estado: 'pendiente', responsable: 'Lucas', diaObjetivo: 10, completadoAt: null },
    ],
  },
  {
    id: 'onb_05',
    tipo: 'staff',
    sujeto: 'Nahuel Sosa',
    rol: 'Editor / delivery · AR',
    inicioAt: '2026-06-16',
    slaDias: 10,
    diasTranscurridos: 13,
    cerradoAt: '2026-06-29',
    pasos: PLANTILLA_STAFF.map((p, i) => ({
      ...p,
      estado: /** @type {const} */ ('completado'),
      responsable: ['Franco', 'Franco', 'Franco', 'Juan Cruz', 'Juan Cruz', 'Franco', 'Franco'][i],
      completadoAt: '2026-06-29',
    })),
  },
];

/**
 * Histórico de duración de onboardings cerrados, para ver la tendencia.
 * @type {{ mes: string, cliente: number | null, staff: number | null }[]}
 */
export const DURACION_HISTORICA = [
  { mes: '2026-01', cliente: 14, staff: 19 },
  { mes: '2026-02', cliente: 13, staff: null },
  { mes: '2026-03', cliente: 12, staff: null },
  { mes: '2026-04', cliente: 11, staff: 16 },
  { mes: '2026-05', cliente: 9, staff: null },
  { mes: '2026-06', cliente: 8, staff: 13 },
  { mes: '2026-07', cliente: 7, staff: null },
  { mes: '2026-08', cliente: 5, staff: null },
];
