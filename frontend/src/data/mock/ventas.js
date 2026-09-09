/**
 * Mock: dashboard del Director de Ventas (Lucas).
 * Fuente real futura: Google Calendar + CRM + reportes diarios del equipo.
 *
 * Separado de componentes: getVentas() en api.js arma KPIs y lo entrega listo.
 */

/** Closers del equipo de ventas. */
export const CLOSERS = [
  { id: 'lucas', nombre: 'Lucas', rol: 'closer' },
  { id: 'juan_cruz', nombre: 'Juan Cruz', rol: 'closer' },
  { id: 'fede', nombre: 'Fede', rol: 'closer' },
];

/** Setters del equipo. */
export const SETTERS = [
  { id: 'sofia', nombre: 'Sofía', rol: 'setter' },
  { id: 'maxi', nombre: 'Maxi', rol: 'setter' },
  { id: 'vale', nombre: 'Vale', rol: 'setter' },
];

/**
 * Últimas 8 semanas cerradas.
 * @type {import('../types.js').SemanaVentas[]}
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
 * Llamadas (calendario + pipeline). Incluye próximas y recientes.
 * @type {Array<import('../types.js').Llamado & {
 *   email?: string, telefono?: string, notasSetter?: string, setter?: string
 * }>}
 */
export const LLAMADOS = [
  // Próximas (semana del 9–15 sep 2026)
  { id: 'lla_20', prospecto: 'Tomás Riganti', pais: 'AR', email: 'tomas.r@mail.com', telefono: '+54 11 5555-1201', fechaAt: '2026-09-09T10:00:00-03:00', origen: 'ads', estado: 'agendado', closer: 'Lucas', setter: 'Sofía', montoUsd: null, oferta: 'Growth 90d', notasSetter: 'Viene de ads · factura ~8k/mes · quiere sistema de ads propio.' },
  { id: 'lla_21', prospecto: 'Camila Ordóñez', pais: 'ES', email: 'camila.o@mail.com', telefono: '+34 600 111 222', fechaAt: '2026-09-09T12:30:00-03:00', origen: 'organico', estado: 'agendado', closer: 'Juan Cruz', setter: 'Maxi', montoUsd: null, oferta: 'Growth 90d', notasSetter: 'Orgánico IG · ya tuvo mentoría corta · lista para 90d.' },
  { id: 'lla_22', prospecto: 'Nicolás Paredes', pais: 'CL', email: 'nico.p@mail.com', telefono: '+56 9 8765 4321', fechaAt: '2026-09-09T16:00:00-03:00', origen: 'referido', estado: 'agendado', closer: 'Lucas', setter: 'Vale', montoUsd: null, oferta: 'Advantage', notasSetter: 'Referido de Bruno · ticket alto · decide con socio.' },
  { id: 'lla_23', prospecto: 'Martina Quispe', pais: 'AR', email: 'martina.q@mail.com', telefono: '+54 11 4444-9080', fechaAt: '2026-09-10T11:00:00-03:00', origen: 'ads', estado: 'agendado', closer: 'Fede', setter: 'Sofía', montoUsd: null, oferta: 'Growth 90d', notasSetter: 'Ads · sin equipo · quiere cerrar esta semana.' },
  { id: 'lla_24', prospecto: 'Javier Solís', pais: 'ES', email: 'javier.s@mail.com', telefono: '+34 611 222 333', fechaAt: '2026-09-10T15:00:00-03:00', origen: 'ads', estado: 'agendado', closer: 'Lucas', setter: 'Maxi', montoUsd: null, oferta: 'Growth 90d', notasSetter: 'Segundo intento · no show previo 3/sep.' },
  { id: 'lla_25', prospecto: 'Florencia Díaz', pais: 'AR', email: 'flor.d@mail.com', telefono: '+54 11 3333-2211', fechaAt: '2026-09-11T09:30:00-03:00', origen: 'organico', estado: 'agendado', closer: 'Juan Cruz', setter: 'Vale', montoUsd: null, oferta: 'Advantage', notasSetter: 'Contenido · audiencia 40k · objetivo escalar ads.' },
  { id: 'lla_26', prospecto: 'Andrés Molina', pais: 'CL', email: 'andres.m@mail.com', telefono: '+56 9 1234 5678', fechaAt: '2026-09-11T14:00:00-03:00', origen: 'referido', estado: 'agendado', closer: 'Fede', setter: 'Sofía', montoUsd: null, oferta: 'Growth 90d', notasSetter: 'Referido Lucas · ya conoce el método.' },
  { id: 'lla_27', prospecto: 'Pilar Escobar', pais: 'ES', email: 'pilar.e@mail.com', telefono: '+34 622 333 444', fechaAt: '2026-09-12T10:30:00-03:00', origen: 'ads', estado: 'agendado', closer: 'Lucas', setter: 'Maxi', montoUsd: null, oferta: 'Growth 90d', notasSetter: 'Hot · preguntó por financiación.' },
  { id: 'lla_28', prospecto: 'Sebastián Ruiz', pais: 'AR', email: 'seba.r@mail.com', telefono: '+54 11 2222-7788', fechaAt: '2026-09-12T17:00:00-03:00', origen: 'outbound', estado: 'agendado', closer: 'Juan Cruz', setter: 'Vale', montoUsd: null, oferta: 'Advantage', notasSetter: 'Outbound · agencia chica · 3 personas.' },
  { id: 'lla_29', prospecto: 'Laura Benítez', pais: 'AR', email: 'laura.b@mail.com', telefono: '+54 11 6666-1010', fechaAt: '2026-09-14T11:00:00-03:00', origen: 'ads', estado: 'agendado', closer: 'Lucas', setter: 'Sofía', montoUsd: null, oferta: 'Growth 90d', notasSetter: 'Lunes · reconfirmó por WhatsApp.' },
  { id: 'lla_30', prospecto: 'Hugo Cárdenas', pais: 'CL', email: 'hugo.c@mail.com', telefono: '+56 9 9988 7766', fechaAt: '2026-09-15T16:30:00-03:00', origen: 'organico', estado: 'agendado', closer: 'Fede', setter: 'Maxi', montoUsd: null, oferta: 'Growth 90d', notasSetter: 'Orgánico reel · presupuesto medio.' },

  // Recientes / cerradas
  { id: 'lla_01', prospecto: 'Ariel Vasconcelos', pais: 'AR', email: 'ariel.v@mail.com', telefono: '+54 11 5555-0101', fechaAt: '2026-09-08T15:00:00-03:00', origen: 'ads', estado: 'show', closer: 'Lucas', setter: 'Sofía', montoUsd: null, oferta: 'Growth 90d', notasSetter: 'Show OK · pide propuesta por mail.' },
  { id: 'lla_02', prospecto: 'Elena Quiroga', pais: 'ES', email: 'elena.q@mail.com', telefono: '+34 600 000 111', fechaAt: '2026-09-08T11:30:00-03:00', origen: 'organico', estado: 'agendado', closer: 'Lucas', setter: 'Maxi', montoUsd: null, oferta: 'Growth 90d', notasSetter: 'Reprogramada para hoy.' },
  { id: 'lla_03', prospecto: 'Bruno Etchart', pais: 'AR', email: 'bruno.e@mail.com', telefono: '+54 11 4444-0202', fechaAt: '2026-09-08T16:00:00-03:00', origen: 'referido', estado: 'cerrado', closer: 'Lucas', setter: 'Vale', montoUsd: 10500, oferta: 'Growth 90d', notasSetter: 'Cerró en call · pago hoy.' },
  { id: 'lla_04', prospecto: 'Diego Ampuero', pais: 'CL', email: 'diego.a@mail.com', telefono: '+56 9 1111 2222', fechaAt: '2026-09-08T10:00:00-03:00', origen: 'ads', estado: 'perdido', closer: 'Lucas', setter: 'Sofía', montoUsd: null, oferta: 'Growth 90d', notasSetter: 'Precio · vuelve en Q4.' },
  { id: 'lla_05', prospecto: 'Rocío Ferrán', pais: 'ES', email: 'rocio.f@mail.com', telefono: '+34 611 000 222', fechaAt: '2026-09-09T13:30:00-03:00', origen: 'ads', estado: 'no_show', closer: 'Juan Cruz', setter: 'Maxi', montoUsd: null, oferta: 'Growth 90d', notasSetter: 'No show · recontacto mañana.' },
  { id: 'lla_06', prospecto: 'Lucía Bardají', pais: 'ES', email: 'lucia.b@mail.com', telefono: '+34 622 000 333', fechaAt: '2026-09-08T09:00:00-03:00', origen: 'ads', estado: 'cerrado', closer: 'Lucas', setter: 'Sofía', montoUsd: 11500, oferta: 'Growth 90d', notasSetter: 'Cierre limpio · transferencia.' },
  { id: 'lla_07', prospecto: 'Matías Grinberg', pais: 'AR', email: 'matias.g@mail.com', telefono: '+54 11 3333-0303', fechaAt: '2026-09-08T17:00:00-03:00', origen: 'outbound', estado: 'show', closer: 'Fede', setter: 'Vale', montoUsd: null, oferta: 'Advantage', notasSetter: 'Show · follow-up jueves.' },
  { id: 'lla_08', prospecto: 'Paula Ceriani', pais: 'AR', email: 'paula.c@mail.com', telefono: '+54 11 2222-0404', fechaAt: '2026-09-07T14:00:00-03:00', origen: 'ads', estado: 'cerrado', closer: 'Lucas', setter: 'Maxi', montoUsd: 14000, oferta: 'Growth 90d', notasSetter: 'Upsell Advantage en mesa.' },
  { id: 'lla_09', prospecto: 'Iván Saldías', pais: 'CL', email: 'ivan.s@mail.com', telefono: '+56 9 3333 4444', fechaAt: '2026-09-07T11:00:00-03:00', origen: 'organico', estado: 'perdido', closer: 'Juan Cruz', setter: 'Sofía', montoUsd: null, oferta: 'Advantage', notasSetter: 'Eligió competencia.' },
  { id: 'lla_10', prospecto: 'Cristina Vilaplana', pais: 'ES', email: 'cris.v@mail.com', telefono: '+34 633 000 444', fechaAt: '2026-09-04T12:00:00-03:00', origen: 'ads', estado: 'cerrado', closer: 'Lucas', setter: 'Vale', montoUsd: 12900, oferta: 'Growth 90d', notasSetter: null },
  { id: 'lla_11', prospecto: 'Gonzalo Peñafiel', pais: 'CL', email: 'gonza.p@mail.com', telefono: '+56 9 5555 6666', fechaAt: '2026-09-03T16:30:00-03:00', origen: 'ads', estado: 'no_show', closer: 'Lucas', setter: 'Maxi', montoUsd: null, oferta: 'Growth 90d', notasSetter: null },
  { id: 'lla_12', prospecto: 'Ivo Marconi', pais: 'AR', email: 'ivo.m@mail.com', telefono: '+54 11 1111-0505', fechaAt: '2026-09-02T10:30:00-03:00', origen: 'referido', estado: 'perdido', closer: 'Fede', setter: 'Sofía', montoUsd: null, oferta: 'Advantage', notasSetter: null },
];

/** Reportes diarios de closers (hoy = 2026-09-09). */
export const REPORTES_CLOSERS = [
  {
    id: 'rc_lucas',
    closerId: 'lucas',
    nombre: 'Lucas',
    estado: 'completado',
    actualizadoAt: '2026-09-09T18:42:00-03:00',
    metricas: { llamadas: 4, shows: 3, cierres: 2, cashUsd: 22000 },
  },
  {
    id: 'rc_jc',
    closerId: 'juan_cruz',
    nombre: 'Juan Cruz',
    estado: 'pendiente',
    actualizadoAt: '2026-09-08T19:10:00-03:00',
    metricas: { llamadas: 3, shows: 2, cierres: 0, cashUsd: 0 },
  },
  {
    id: 'rc_fede',
    closerId: 'fede',
    nombre: 'Fede',
    estado: 'vencido',
    actualizadoAt: '2026-09-07T20:05:00-03:00',
    metricas: { llamadas: 2, shows: 1, cierres: 0, cashUsd: 0 },
  },
];

/** Reportes diarios de setters. */
export const REPORTES_SETTERS = [
  {
    id: 'rs_sofia',
    setterId: 'sofia',
    nombre: 'Sofía',
    estado: 'completado',
    actualizadoAt: '2026-09-09T17:55:00-03:00',
    metricas: { conversaciones: 28, aplicaciones: 9, agendadas: 4 },
  },
  {
    id: 'rs_maxi',
    setterId: 'maxi',
    nombre: 'Maxi',
    estado: 'completado',
    actualizadoAt: '2026-09-09T18:20:00-03:00',
    metricas: { conversaciones: 22, aplicaciones: 7, agendadas: 3 },
  },
  {
    id: 'rs_vale',
    setterId: 'vale',
    nombre: 'Vale',
    estado: 'pendiente',
    actualizadoAt: '2026-09-08T18:40:00-03:00',
    metricas: { conversaciones: 18, aplicaciones: 5, agendadas: 2 },
  },
];

/** Feed de actividad del día. */
export const ACTIVIDAD = [
  { id: 'ev_01', tipo: 'cierre', at: '2026-09-09T18:15:00-03:00', texto: 'Lucas cerró llamada con Bruno Etchart — US$10.500', actor: 'Lucas' },
  { id: 'ev_02', tipo: 'reporte', at: '2026-09-09T18:42:00-03:00', texto: 'Lucas envió el reporte diario de closer', actor: 'Lucas' },
  { id: 'ev_03', tipo: 'no_show', at: '2026-09-09T13:45:00-03:00', texto: 'Juan Cruz marcó no show — Rocío Ferrán', actor: 'Juan Cruz' },
  { id: 'ev_04', tipo: 'agendado', at: '2026-09-09T12:10:00-03:00', texto: 'Sofía agendó llamada con Tomás Riganti para 10:00', actor: 'Sofía' },
  { id: 'ev_05', tipo: 'show', at: '2026-09-09T11:05:00-03:00', texto: 'Fede marcó show — Matías Grinberg', actor: 'Fede' },
  { id: 'ev_06', tipo: 'agendado', at: '2026-09-09T10:22:00-03:00', texto: 'Maxi agendó llamada con Camila Ordóñez para 12:30', actor: 'Maxi' },
  { id: 'ev_07', tipo: 'perdido', at: '2026-09-09T10:40:00-03:00', texto: 'Lucas marcó perdido — Diego Ampuero', actor: 'Lucas' },
  { id: 'ev_08', tipo: 'cierre', at: '2026-09-09T09:50:00-03:00', texto: 'Lucas cerró llamada con Lucía Bardají — US$11.500', actor: 'Lucas' },
  { id: 'ev_09', tipo: 'agendado', at: '2026-09-09T09:15:00-03:00', texto: 'Vale agendó llamada con Nicolás Paredes para 16:00', actor: 'Vale' },
  { id: 'ev_10', tipo: 'reporte', at: '2026-09-09T08:55:00-03:00', texto: 'Maxi envió el reporte diario de setter', actor: 'Maxi' },
];

/** Follow-ups pendientes. */
export const FOLLOW_UPS = [
  { id: 'fu_01', prospecto: 'Matías Grinberg', closer: 'Fede', ultimoContactoAt: '2026-09-08', proximoPaso: 'Enviar propuesta Advantage', diasSinContacto: 1 },
  { id: 'fu_02', prospecto: 'Ariel Vasconcelos', closer: 'Lucas', ultimoContactoAt: '2026-09-08', proximoPaso: 'Confirmar pago / link', diasSinContacto: 1 },
  { id: 'fu_03', prospecto: 'Rocío Ferrán', closer: 'Juan Cruz', ultimoContactoAt: '2026-09-05', proximoPaso: 'Reagendar no show', diasSinContacto: 4 },
  { id: 'fu_04', prospecto: 'Gonzalo Peñafiel', closer: 'Lucas', ultimoContactoAt: '2026-09-03', proximoPaso: 'Segundo intento de show', diasSinContacto: 6 },
  { id: 'fu_05', prospecto: 'Ivo Marconi', closer: 'Fede', ultimoContactoAt: '2026-08-28', proximoPaso: 'Cerrar ciclo / nurture', diasSinContacto: 12 },
  { id: 'fu_06', prospecto: 'Iván Saldías', closer: 'Juan Cruz', ultimoContactoAt: '2026-08-30', proximoPaso: 'Check-in post-objeción precio', diasSinContacto: 10 },
  { id: 'fu_07', prospecto: 'Diego Ampuero', closer: 'Lucas', ultimoContactoAt: '2026-09-08', proximoPaso: 'Nurture Q4', diasSinContacto: 1 },
];

/** Performance acumulada del mes por closer. */
export const PERF_CLOSERS = [
  { id: 'lucas', nombre: 'Lucas', llamadas: 28, shows: 19, cierres: 8, cashUsd: 84900, promedioVentaUsd: 10612 },
  { id: 'juan_cruz', nombre: 'Juan Cruz', llamadas: 18, shows: 11, cierres: 3, cashUsd: 28500, promedioVentaUsd: 9500 },
  { id: 'fede', nombre: 'Fede', llamadas: 14, shows: 9, cierres: 2, cashUsd: 18000, promedioVentaUsd: 9000 },
];

/** Performance acumulada del mes por setter. */
export const PERF_SETTERS = [
  { id: 'sofia', nombre: 'Sofía', conversaciones: 186, aplicaciones: 52, agendadas: 24 },
  { id: 'maxi', nombre: 'Maxi', conversaciones: 154, aplicaciones: 41, agendadas: 18 },
  { id: 'vale', nombre: 'Vale', conversaciones: 132, aplicaciones: 35, agendadas: 14 },
];

/** Meta de cash del mes (USD). */
export const META_MES = {
  mes: '2026-09',
  revenueMetaUsd: 180000,
  revenueActualUsd: 131400,
  diasMes: 30,
  diaHoy: 9,
};
