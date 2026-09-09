/**
 * Campos del reporte diario del Setter (mismo contrato que el form operativo actual).
 */

export const SETTER_AVATARES = [
  { id: 'experto_info', label: 'Experto en info' },
  { id: 'dueno_agencia', label: 'Dueño de agencia' },
  { id: 'dueno_negocio', label: 'Dueño de negocio' },
  { id: 'habilidades_alto_valor', label: 'Habilidades de alto valor' },
  { id: 'creador_contenido', label: 'Creador de contenido' },
  { id: 'creador_infoproducto', label: 'Creador con infoproducto' },
  { id: 'otro', label: 'Otro' },
];

export const SETTER_OPTIONS = [
  { value: 'emiliano', label: 'Emiliano' },
  { value: 'cris', label: 'Cris' },
  { value: 'sofia', label: 'Sofía' },
  { value: 'maxi', label: 'Maxi' },
  { value: 'vale', label: 'Vale' },
];

export function reporteSetterVacio({ fecha = '', setterId = '' } = {}) {
  return {
    fecha,
    setterId,
    conversaciones: 0,
    agendas: 0,
    calendlysEnviados: 0,
    seguimientos: 0,
    outbounds: 0,
    avatares: Object.fromEntries(SETTER_AVATARES.map((a) => [a.id, 0])),
    tipoTrafico: '',
    diaBuenoMalo: '',
    feedbackMkt: '',
  };
}

/** Suma de agendas por avatar (control interno). */
export function totalAvatares(avatares = {}) {
  return Object.values(avatares).reduce((s, n) => s + (Number(n) || 0), 0);
}
