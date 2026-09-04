/**
 * Mock: home / north star.
 * Acá viven las dos cosas que no salen de ninguna herramienta externa:
 * las grietas (dashboard vs fuente real) y los pedidos de datos del equipo.
 *
 * @typedef {import('../types.js').Grieta} Grieta
 * @typedef {import('../types.js').PedidoDato} PedidoDato
 */

/**
 * Discrepancias abiertas entre el tablero y la fuente de verdad.
 * Cada una es deuda: o se arregla el dato, o se automatiza la fuente.
 * @type {Grieta[]}
 */
export const GRIETAS = [
  {
    id: 'gri_01',
    metrica: 'Clientes activos',
    valorDashboard: 12,
    valorFuente: 14,
    format: 'count',
    sourceId: 'discord_crm',
    severidad: 'alta',
    detectadaAt: '2026-09-14T09:12:00-03:00',
    causa: 'El export del CRM filtra por estado "activo" y deja afuera a los que siguen en onboarding: Lucía Bardají y Bruno Etchart ya pagaron.',
    seccion: 'fulfillment',
  },
  {
    id: 'gri_02',
    metrica: 'Cash collected · septiembre',
    valorDashboard: 178000,
    valorFuente: 191240,
    format: 'usd',
    sourceId: 'payments',
    severidad: 'alta',
    detectadaAt: '2026-09-14T09:12:00-03:00',
    causa: 'La suma se carga a mano los lunes. Faltan los cobros de la última semana y dos pagos en cuotas del plan ES.',
    seccion: 'ventas',
  },
  {
    id: 'gri_03',
    metrica: 'Gasto en ads · septiembre',
    valorDashboard: 31600,
    valorFuente: 33180,
    format: 'usd',
    sourceId: 'ads_manager',
    severidad: 'media',
    detectadaAt: '2026-09-14T07:20:00-03:00',
    causa: 'La sync corre cada 6 h y Meta reimputa gasto del día anterior. Diferencia esperable dentro de la ventana, no requiere acción salvo que supere el 8%.',
    seccion: 'marketing',
  },
  {
    id: 'gri_04',
    metrica: 'Llamados agendados · S35',
    valorDashboard: 22,
    valorFuente: 24,
    format: 'count',
    sourceId: 'calendly',
    severidad: 'baja',
    detectadaAt: '2026-09-13T18:00:00-03:00',
    causa: 'Los reagendados generan un segundo evento en Calendly y el tablero los deduplica por email. La fuente cuenta eventos, el tablero cuenta personas.',
    seccion: 'ventas',
  },
];

/**
 * Pedidos de datos del equipo — el KPI que mide si el tablero ya reemplazó
 * a Franco como fuente de verdad. Objetivo: cero.
 * @type {PedidoDato[]}
 */
export const PEDIDOS = [
  { id: 'ped_01', quien: 'Lucas', fechaAt: '2026-09-14T10:15:00-03:00', pregunta: '¿Cuánto cash collected llevamos en septiembre?', seccion: 'ventas', yaEstaEnTablero: true },
  { id: 'ped_02', quien: 'Juan Cruz', fechaAt: '2026-09-13T16:40:00-03:00', pregunta: '¿Qué campaña tiene la frecuencia más alta?', seccion: 'marketing', yaEstaEnTablero: true },
  { id: 'ped_03', quien: 'Lucas', fechaAt: '2026-09-12T11:05:00-03:00', pregunta: '¿Cuántos clientes de España tenemos activos?', seccion: 'fulfillment', yaEstaEnTablero: true },
  { id: 'ped_04', quien: 'Juan Cruz', fechaAt: '2026-09-11T09:30:00-03:00', pregunta: '¿Cuál fue el costo por llamada agendada del mes pasado?', seccion: 'marketing', yaEstaEnTablero: false },
  { id: 'ped_05', quien: 'Lucas', fechaAt: '2026-09-10T19:20:00-03:00', pregunta: '¿Bruno ya tiene acceso al Discord?', seccion: 'fulfillment', yaEstaEnTablero: true },
  { id: 'ped_06', quien: 'Juan Cruz', fechaAt: '2026-09-09T14:50:00-03:00', pregunta: '¿Cuánto facturó cada cliente desde que entró?', seccion: 'fulfillment', yaEstaEnTablero: false },
];

/** Pedidos por semana, para ver si la curva baja. */
export const PEDIDOS_SEMANA = [
  { semana: 'S32', pedidos: 14 },
  { semana: 'S33', pedidos: 12 },
  { semana: 'S34', pedidos: 13 },
  { semana: 'S35', pedidos: 9 },
  { semana: 'S36', pedidos: 8 },
  { semana: 'S37', pedidos: 6 },
];
