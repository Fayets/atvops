/**
 * Registro de fuentes de datos y de campos.
 *
 * El KPI "% de datos automatizados" NO se escribe a mano: se deriva de
 * `DATA_FIELDS`. Cada campo que el dashboard muestra declara su fuente, y la
 * fuente declara su estado. Conectar una fuente sube el KPI solo.
 *
 * @typedef {import('./types.js').DataSource} DataSource
 * @typedef {import('./types.js').DataField} DataField
 * @typedef {import('./types.js').SourceId} SourceId
 */

/** @type {Record<SourceId, DataSource>} */
export const SOURCES = {
  discord_transcripts: {
    id: 'discord_transcripts',
    nombre: 'Discord · transcripts',
    descripcion:
      'El bot trae el transcript de cada canal de cliente. Es el registro automático de toda la relación: quién escribió, cuándo, cuánto tardó el coach y de qué se habló.',
    status: 'conectada',
    lastSyncAt: '2026-09-14T11:10:00-03:00',
    responsable: 'Franco',
    metodo: 'Bot de Discord, ingesta continua por canal',
    proximoPaso:
      'La cartera (un canal = un cliente) ya sale de los transcripts. Falta el clasificador de activación/mix y payments para MRR/NRR.',
  },
  ventas_ops: {
    id: 'ventas_ops',
    nombre: 'Base de ATV Ops',
    descripcion:
      'Las llamadas de ventas viven acá: el resultado, el programa, el cash y las reuniones cargadas a mano. '
      + 'El calendario de ATV aporta qué reuniones hubo, y el CRM viejo solo completa el histórico anterior a la mudanza.',
    status: 'conectada',
    lastSyncAt: null,
    responsable: 'Franco',
    metodo: 'Base propia (esquema ops) + Google Calendar; el CRM de atv-mkt se espeja mientras dure la mudanza',
    proximoPaso:
      'Apagar el sync de Google Calendar en atv-mkt: mientras corra sigue creando leads duplicados en esa base.',
  },
  instagram_ops: {
    id: 'instagram_ops',
    nombre: 'Instagram de ATV',
    descripcion:
      'Reels e historias traídos con el token de la cuenta, con lo que mide Instagram: alcance, vistas, respuestas, compartidos y visitas al perfil. Las historias se guardan acá porque Instagram las borra a las 24 horas.',
    status: 'conectada',
    lastSyncAt: null,
    responsable: 'Emi',
    metodo: 'Graph API v21 desde ATV Ops, cada tres horas; las miniaturas se descargan porque el enlace de Instagram vence',
    proximoPaso:
      'El token de la cuenta vence el 02-11-2026: hay que renovarlo antes o las historias dejan de guardarse.',
  },
  youtube_ops: {
    id: 'youtube_ops',
    nombre: 'YouTube de ATV',
    descripcion:
      'Los videos del canal traídos con la clave propia: fecha, duración, vistas, likes y comentarios. El CTR, las impresiones y la retención no están acá: la API pública no los da, solo YouTube Studio.',
    status: 'conectada',
    lastSyncAt: null,
    responsable: 'Emi',
    metodo: 'YouTube Data API v3 desde ATV Ops, cada tres horas; las miniaturas se guardan en disco',
    proximoPaso:
      'Si hacen falta CTR y retención, hay que conectar la API de Analytics con la cuenta del canal (OAuth, no alcanza la clave).',
  },
  mkt_crm: {
    id: 'mkt_crm',
    nombre: 'CRM de ATV Marketing',
    descripcion:
      'La base de leads de ATV Marketing: quién agendó, con qué closer, qué resultado tuvo la llamada, cuánto pagó y cuánto debe. Incluye los reportes diarios de closers y setters.',
    status: 'conectada',
    lastSyncAt: null,
    responsable: 'Franco',
    metodo: 'Lectura directa de la base de atv-mkt (solo lectura)',
    proximoPaso:
      'Las llamadas sin resultado cargado rompen show rate y close rate: el pendiente es que los closers reporten el mismo día.',
  },
  discord_crm: {
    id: 'discord_crm',
    nombre: 'Discord / CRM',
    descripcion: 'Estado de cuenta, churn y datos comerciales que el canal no tiene.',
    status: 'manual',
    lastSyncAt: '2026-09-12T18:40:00-03:00',
    responsable: 'Franco',
    metodo: 'Export manual del CRM + planilla de cartera',
    proximoPaso: 'API del CRM para churn, país y MRR. Engagement ya no depende de esto.',
  },
  ads_manager: {
    id: 'ads_manager',
    nombre: 'Ads Manager (Meta)',
    descripcion: 'Gasto, alcance, frecuencia y leads por campaña.',
    status: 'conectada',
    lastSyncAt: '2026-09-14T07:15:00-03:00',
    responsable: 'Juan Cruz',
    metodo: 'Marketing API, sync cada 6 h',
    proximoPaso: 'Bajar a nivel anuncio (level=ad) para comparar piezas.',
  },
  calendly: {
    id: 'calendly',
    nombre: 'Calendly',
    descripcion: 'Llamados agendados, shows y no-shows.',
    status: 'conectada',
    lastSyncAt: '2026-09-14T08:02:00-03:00',
    responsable: 'Lucas',
    metodo: 'Webhook de invitee.created / invitee.canceled',
    proximoPaso: 'Cruzar el email del invitee con el lead de ads para atribuir origen.',
  },
  payments: {
    id: 'payments',
    nombre: 'Payment processor',
    descripcion: 'Cash collected, cobros recurrentes, fecha de pago.',
    status: 'sin_conectar',
    lastSyncAt: null,
    responsable: 'Lucas',
    metodo: null,
    proximoPaso: 'Webhooks de charge.succeeded. Sin esto, el MRR es una estimación.',
  },
  atv_clients: {
    id: 'atv_clients',
    nombre: 'ATV Clients',
    descripcion: 'Cuotas, vencimientos, pagos y estado de cada cliente en el CRM.',
    status: 'conectada',
    lastSyncAt: new Date().toISOString(),
    responsable: 'Franco',
    metodo: 'API agente /api/agent/cobranza-mes',
    proximoPaso: 'Cobranza ya lee cuotas reales. Falta payments gateway para cash automático.',
  },
  manual: {
    id: 'manual',
    nombre: 'Carga manual',
    descripcion: 'Datos que hoy solo existen porque alguien los escribe.',
    status: 'manual',
    lastSyncAt: '2026-09-14T09:30:00-03:00',
    responsable: 'Franco',
    metodo: 'Formulario interno del dashboard',
    proximoPaso: 'Cada campo acá es deuda. El objetivo es que esta lista quede vacía.',
  },
};

/** @type {DataSource[]} */
export const SOURCE_LIST = Object.values(SOURCES);

/**
 * Inventario de campos del dashboard. Uno por cada número que se muestra.
 *
 * `sourceId` es de dónde sale el dato HOY. `objetivo` es de dónde debería salir
 * cuando esté automatizado (`null` = se automatiza dentro del propio ATV Ops).
 * La diferencia entre ambos es, literalmente, la lista de trabajo pendiente.
 *
 * @type {DataField[]}
 */
export const DATA_FIELDS = [
  // Fulfillment · cartera (Discord)
  { id: 'clientes_activos', nombre: 'Clientes activos', seccion: 'fulfillment', sourceId: 'discord_transcripts', objetivo: 'discord_transcripts' },
  { id: 'cartera_historica', nombre: 'Evolución de cartera', seccion: 'fulfillment', sourceId: 'discord_transcripts', objetivo: 'discord_transcripts' },
  { id: 'en_riesgo', nombre: 'Fuera de verde', seccion: 'fulfillment', sourceId: 'discord_transcripts', objetivo: 'discord_transcripts' },
  { id: 'intencion_baja', nombre: 'Intención de baja', seccion: 'fulfillment', sourceId: 'discord_transcripts', objetivo: 'discord_transcripts' },

  // Fulfillment · conteo de transcripts
  { id: 'ultima_actividad', nombre: 'Última actividad del cliente', seccion: 'fulfillment', sourceId: 'discord_transcripts', objetivo: 'discord_transcripts' },
  { id: 'mensajes_semana', nombre: 'Mensajes por semana', seccion: 'fulfillment', sourceId: 'discord_transcripts', objetivo: 'discord_transcripts' },
  { id: 'interacciones', nombre: 'Interacciones por semana', seccion: 'fulfillment', sourceId: 'discord_transcripts', objetivo: 'discord_transcripts' },
  { id: 'dias_sin_mensaje', nombre: 'Días de silencio', seccion: 'fulfillment', sourceId: 'discord_transcripts', objetivo: 'discord_transcripts' },

  // Fulfillment · heurísticas sobre transcripts
  { id: 'en_onboarding', nombre: 'En onboarding (31 d)', seccion: 'fulfillment', sourceId: 'discord_transcripts', objetivo: 'discord_transcripts' },
  { id: 'activacion_30d', nombre: 'Activación a 30 días', seccion: 'fulfillment', sourceId: 'discord_transcripts', objetivo: 'discord_transcripts' },
  { id: 'tiempo_primer_resultado', nombre: 'Tiempo hasta primer resultado', seccion: 'fulfillment', sourceId: 'discord_transcripts', objetivo: 'discord_transcripts' },
  { id: 'blockers_activacion', nombre: 'Blockers de activación', seccion: 'fulfillment', sourceId: 'discord_transcripts', objetivo: 'discord_transcripts' },
  { id: 'mix_conversacion', nombre: 'Mix de conversación', seccion: 'fulfillment', sourceId: 'discord_transcripts', objetivo: 'discord_transcripts' },
  { id: 'outcomes_cliente', nombre: 'Wins / resultados en canal', seccion: 'fulfillment', sourceId: 'discord_transcripts', objetivo: 'discord_transcripts' },
  { id: 'candidatos_upsell', nombre: 'Candidatos a upsell', seccion: 'fulfillment', sourceId: 'discord_transcripts', objetivo: 'discord_transcripts' },
  { id: 'onboarding_cliente', nombre: 'Onboarding de cliente', seccion: 'fulfillment', sourceId: 'discord_transcripts', objetivo: 'discord_transcripts' },

  // Revenue (fuera de fulfillment hasta conectar payments)
  { id: 'mrr', nombre: 'MRR / run-rate', seccion: 'home', sourceId: 'manual', objetivo: 'payments' },
  { id: 'nrr', nombre: 'Net revenue retention', seccion: 'cobranza', sourceId: 'manual', objetivo: 'payments' },
  { id: 'caja_cliente', nombre: 'Caja 1 / Caja 2', seccion: 'cobranza', sourceId: 'manual', objetivo: 'payments' },
  { id: 'expansion_upsell', nombre: 'Revenue de expansión', seccion: 'cobranza', sourceId: 'manual', objetivo: 'payments' },
  { id: 'churn_mes', nombre: 'Churn del mes (CRM)', seccion: 'cobranza', sourceId: 'manual', objetivo: 'payments' },

  // Ventas
  { id: 'cash_collected', nombre: 'Cash collected semanal', seccion: 'ventas', sourceId: 'manual', objetivo: 'payments' },
  { id: 'cuotas_vencidas', nombre: 'Cuotas vencidas', seccion: 'cobranza', sourceId: 'atv_clients', objetivo: 'atv_clients' },
  { id: 'cuotas_por_vencer', nombre: 'Cuotas por vencer', seccion: 'cobranza', sourceId: 'atv_clients', objetivo: 'atv_clients' },
  { id: 'cobrado_mes', nombre: 'Cobrado del mes', seccion: 'cobranza', sourceId: 'atv_clients', objetivo: 'atv_clients' },
  { id: 'metas_mes', nombre: 'Metas del mes por área', seccion: 'home', sourceId: 'manual', objetivo: null },
  { id: 'chats_abiertos', nombre: 'Chats abiertos por secuencia', seccion: 'marketing', sourceId: 'manual', objetivo: 'discord_crm' },
  { id: 'llamados_agendados', nombre: 'Llamados agendados', seccion: 'ventas', sourceId: 'calendly', objetivo: 'calendly' },
  { id: 'shows', nombre: 'Shows y no-shows', seccion: 'ventas', sourceId: 'calendly', objetivo: 'calendly' },
  { id: 'close_rate', nombre: 'Close rate', seccion: 'ventas', sourceId: 'manual', objetivo: 'payments' },
  { id: 'origen_lead', nombre: 'Origen del lead', seccion: 'ventas', sourceId: 'manual', objetivo: 'discord_crm' },

  // Marketing
  { id: 'gasto_ads', nombre: 'Gasto por canal', seccion: 'marketing', sourceId: 'ads_manager', objetivo: 'ads_manager' },
  { id: 'cpl', nombre: 'Cost per lead', seccion: 'marketing', sourceId: 'ads_manager', objetivo: 'ads_manager' },
  { id: 'frecuencia', nombre: 'Frecuencia por campaña', seccion: 'marketing', sourceId: 'ads_manager', objetivo: 'ads_manager' },
  { id: 'campanias_activas', nombre: 'Campañas activas', seccion: 'marketing', sourceId: 'ads_manager', objetivo: 'ads_manager' },
  { id: 'roas', nombre: 'ROAS', seccion: 'marketing', sourceId: 'manual', objetivo: 'payments' },

  // Sistemas
  { id: 'onboarding_staff', nombre: 'Onboarding de staff', seccion: 'sistemas', sourceId: 'manual', objetivo: null },
  { id: 'pedidos_datos', nombre: 'Pedidos de datos por semana', seccion: 'home', sourceId: 'manual', objetivo: null },
  { id: 'grietas', nombre: 'Grietas detectadas', seccion: 'home', sourceId: 'manual', objetivo: null },
];

/**
 * Cobertura de automatización, derivada del inventario de campos.
 * @returns {{ total: number, automatizados: number, manuales: number, pct: number, deuda: { sourceId: SourceId, campos: DataField[] }[] }}
 */
export function coberturaAutomatizacion() {
  const total = DATA_FIELDS.length;
  const automatizados = DATA_FIELDS.filter((f) => SOURCES[f.sourceId].status === 'conectada').length;
  const manualesList = DATA_FIELDS.filter((f) => SOURCES[f.sourceId].status !== 'conectada');

  /** @type {Map<SourceId, DataField[]>} */
  const porObjetivo = new Map();
  for (const f of manualesList) {
    if (!f.objetivo) continue;
    const arr = porObjetivo.get(f.objetivo) ?? [];
    arr.push(f);
    porObjetivo.set(f.objetivo, arr);
  }

  return {
    total,
    automatizados,
    manuales: manualesList.length,
    pct: Math.round((automatizados / total) * 100),
    deuda: [...porObjetivo.entries()]
      .map(([sourceId, campos]) => ({ sourceId, campos }))
      .sort((a, b) => b.campos.length - a.campos.length),
  };
}

/** Campos que dependen de una fuente dada. @param {SourceId} sourceId */
export function camposDeFuente(sourceId) {
  return DATA_FIELDS.filter((f) => f.sourceId === sourceId);
}
