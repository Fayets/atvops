/**
 * Mock: dashboard personal del Setter.
 * Ejemplo: Emiliano — aplicaciones, agendados y reporte diario.
 * Fuente futura: form apps + Calendly + checklist de reporte.
 */

export const SETTER_PERFIL = {
  id: 'emiliano',
  nombre: 'Emiliano',
  rol: 'setter',
};

export const SETTER_CONTEXTO = {
  mes: '2026-09',
  nombreMes: 'Septiembre 2026',
  diaHoy: 9,
  diasMes: 30,
  hoyIso: '2026-09-09',
  syncAt: '2026-09-09T18:00:00-03:00',
};

/** Metas diarias personales. */
export const SETTER_METAS_DIA = {
  aplicaciones: 8,
  agendadas: 3,
};

/** Actual del día. */
export const SETTER_ACTUAL_DIA = {
  aplicaciones: 5,
  agendadas: 2,
};

/** Metas mensuales personales. */
export const SETTER_METAS_MES = {
  aplicaciones: 120,
  agendadas: 40,
  /** Meta de tasa de agendado (%). */
  tasaAgendado: 33,
};

/** Actual del mes. */
export const SETTER_ACTUAL_MES = {
  aplicaciones: 42,
  agendadas: 8,
  /** Días con reporte completado en el mes. */
  diasReporte: 6,
};

/** Tendencia 4 semanas (personal). */
export const SETTER_SEMANAS = [
  { semana: 'S34', aplicaciones: 9, agendadas: 2, tasa: 22 },
  { semana: 'S35', aplicaciones: 11, agendadas: 2, tasa: 18 },
  { semana: 'S36', aplicaciones: 12, agendadas: 2, tasa: 17 },
  { semana: 'S37', aplicaciones: 10, agendadas: 2, tasa: 20 },
];

/** Meta agregada del equipo de setters (sin breakdown individual). */
export const SETTER_EQUIPO = {
  metaAplicaciones: 400,
  actualAplicaciones: 42,
};

/**
 * Reporte del día (mock mutable vía store en api).
 * @type {{ completado: boolean, actualizadoAt: string | null }}
 */
export const SETTER_REPORTE_DIA = {
  completado: false,
  actualizadoAt: null,
};

/**
 * Aplicaciones recientes del setter.
 * @type {Array<object>}
 */
export const SETTER_APLICACIONES = [
  {
    id: 'sa_01',
    prospecto: 'Martín Quirós',
    fechaAplicacionAt: '2026-09-09T09:12:00-03:00',
    origen: 'ads',
    estado: 'nueva',
    fechaLlamadaAt: null,
    closer: null,
  },
  {
    id: 'sa_02',
    prospecto: 'Valentina Ruiz',
    fechaAplicacionAt: '2026-09-09T10:40:00-03:00',
    origen: 'organico',
    estado: 'en_revision',
    fechaLlamadaAt: null,
    closer: null,
  },
  {
    id: 'sa_03',
    prospecto: 'Joaquín Méndez',
    fechaAplicacionAt: '2026-09-09T11:05:00-03:00',
    origen: 'ads',
    estado: 'agendada',
    fechaLlamadaAt: '2026-09-10T16:00:00-03:00',
    closer: 'Lucas',
  },
  {
    id: 'sa_04',
    prospecto: 'Sofía Cattáneo',
    fechaAplicacionAt: '2026-09-08T18:22:00-03:00',
    origen: 'referido',
    estado: 'agendada',
    fechaLlamadaAt: '2026-09-09T12:30:00-03:00',
    closer: 'Nick',
  },
  {
    id: 'sa_05',
    prospecto: 'Hernán Ponce',
    fechaAplicacionAt: '2026-09-08T15:10:00-03:00',
    origen: 'ads',
    estado: 'no_califica',
    fechaLlamadaAt: null,
    closer: null,
  },
  {
    id: 'sa_06',
    prospecto: 'Carla Domínguez',
    fechaAplicacionAt: '2026-09-08T12:00:00-03:00',
    origen: 'organico',
    estado: 'perdida',
    fechaLlamadaAt: null,
    closer: null,
  },
  {
    id: 'sa_07',
    prospecto: 'Federico Lamas',
    fechaAplicacionAt: '2026-09-07T20:45:00-03:00',
    origen: 'referido',
    estado: 'agendada',
    fechaLlamadaAt: '2026-09-11T11:00:00-03:00',
    closer: 'Lucas',
  },
  {
    id: 'sa_08',
    prospecto: 'Agustina Pérez',
    fechaAplicacionAt: '2026-09-07T14:30:00-03:00',
    origen: 'ads',
    estado: 'en_revision',
    fechaLlamadaAt: null,
    closer: null,
  },
  {
    id: 'sa_09',
    prospecto: 'Nicolás Varela',
    fechaAplicacionAt: '2026-09-06T16:15:00-03:00',
    origen: 'organico',
    estado: 'nueva',
    fechaLlamadaAt: null,
    closer: null,
  },
  {
    id: 'sa_10',
    prospecto: 'Lucía Fernández',
    fechaAplicacionAt: '2026-09-05T09:50:00-03:00',
    origen: 'ads',
    estado: 'agendada',
    fechaLlamadaAt: '2026-09-08T17:00:00-03:00',
    closer: 'Fede',
  },
];
