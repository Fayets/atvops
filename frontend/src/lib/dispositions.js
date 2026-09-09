/**
 * Dispositions de llamadas (Closer).
 * Fuente futura: CRM / Calendar API. Hoy: contrato único para UI + mocks + rates.
 */

export const OFFER_TIERS = ['Boost', 'Mentoría', 'Advantage'];

export const ORIGEN_LABEL = {
  ads: 'Ads',
  organico: 'Orgánico',
  referido: 'Referido',
  outbound: 'Outbound',
};

/** 6 dispositions principales del formulario. */
export const DISPOSITIONS = [
  {
    id: 'show_calificado',
    label: 'Show calificado',
    desc: 'Entró, tiene plata, negocio y encaja con el avatar',
    tone: 'ok',
    color: 'ok',
  },
  {
    id: 'show_descalificado',
    label: 'Show descalificado',
    desc: 'Entró pero no califica',
    tone: 'warn',
    color: 'warn',
  },
  {
    id: 'no_show',
    label: 'No show',
    desc: 'No entró a la llamada',
    tone: 'alert',
    color: 'alert',
  },
  {
    id: 'reagendado',
    label: 'Reagendado',
    desc: 'Pidió mover la llamada a otra fecha',
    tone: 'info',
    color: 'info',
  },
  {
    id: 'cancelado',
    label: 'Cancelado',
    desc: 'Canceló sin reagendar',
    tone: 'off',
    color: 'off',
  },
  {
    id: 'cerrado',
    label: 'Cerrado',
    desc: 'Compró en la llamada',
    tone: 'ok',
    color: 'cerrado',
    destacado: true,
  },
];

export const ESTADO_LLAMADA = {
  agendado: { tone: 'warn', label: 'agendado' },
  show_calificado: { tone: 'ok', label: 'show calificado' },
  show_descalificado: { tone: 'warn', label: 'show descalificado' },
  no_show: { tone: 'alert', label: 'no show' },
  reagendado: { tone: 'info', label: 'reagendado' },
  cancelado: { tone: 'off', label: 'cancelado' },
  cerrado: { tone: 'ok', label: 'cerrado', check: true },
  // legado mock / tablas
  show: { tone: 'ok', label: 'show' },
  perdido: { tone: 'off', label: 'perdido' },
  pendiente: { tone: 'plain', label: 'pendiente' },
};

export const OBJECTIONS = [
  { value: 'precio', label: 'Precio' },
  { value: 'timing', label: 'Timing' },
  { value: 'pensar', label: 'Pensar' },
  { value: 'hablar_con_pareja', label: 'Hablar con pareja' },
  { value: 'competencia', label: 'Competencia' },
  { value: 'no_le_veo_valor', label: 'No le veo valor' },
  { value: 'otro', label: 'Otro' },
];

export const MOTIVOS_DESCALIFICACION = [
  { value: 'no_tiene_plata', label: 'No tiene plata' },
  { value: 'no_tiene_negocio', label: 'No tiene negocio' },
  { value: 'no_es_el_avatar', label: 'No es el avatar' },
  { value: 'otro', label: 'Otro' },
];

export const MOTIVOS_REAGENDADO = [
  { value: 'conflicto_agenda', label: 'Conflicto de agenda' },
  { value: 'emergencia', label: 'Emergencia' },
  { value: 'pide_mas_info', label: 'Pide más info' },
  { value: 'otro', label: 'Otro' },
];

export const MOTIVOS_CANCELADO = [
  { value: 'ya_no_le_interesa', label: 'Ya no le interesa' },
  { value: 'compro_competencia', label: 'Compró competencia' },
  { value: 'no_tiene_plata', label: 'No tiene plata' },
  { value: 'otro', label: 'Otro' },
];

export const METODOS_PAGO = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'cripto', label: 'Cripto' },
  { value: 'otro', label: 'Otro' },
];

export const PROXIMOS_PASOS = [
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'nurture', label: 'Nurture' },
  { value: 'perdido', label: 'Perdido' },
];

/** ¿Cuenta como show para show rate? (cerrado implica show). */
export function esShow(estado) {
  return (
    estado === 'show_calificado' ||
    estado === 'show_descalificado' ||
    estado === 'cerrado' ||
    estado === 'show'
  );
}

/**
 * Denominador show rate: todas las agendadas (incluye canceladas).
 * Reagendada NO entra (métrica aparte) — evita inflar/deflactar el rate.
 */
export function cuentaEnDenominadorShowRate(estado) {
  return estado !== 'reagendado';
}

/**
 * Show rate = (shows calificados + shows descalificados [+ cerrados]) ÷ total agendadas.
 * Cancelada cuenta en el denominador. Reagendada no.
 * @param {Array<{ estado: string }>} llamadas
 */
export function calcularShowRate(llamadas) {
  const pool = (llamadas ?? []).filter((l) => cuentaEnDenominadorShowRate(l.estado));
  if (!pool.length) return 0;
  const shows = pool.filter((l) => {
    if (l.estado === 'show_calificado' || l.estado === 'show_descalificado') return true;
    if (l.estado === 'cerrado') return true;
    if (l.estado === 'show') return true;
    return false;
  }).length;
  return (shows / pool.length) * 100;
}

/** Close rate sobre shows (calificados + descalificados + cerrados como show). */
export function calcularCloseRate(llamadas) {
  const shows = (llamadas ?? []).filter(esShow);
  if (!shows.length) return 0;
  const cierres = shows.filter((l) => l.estado === 'cerrado').length;
  return (cierres / shows.length) * 100;
}

export function resumenCalendarioHoy(llamadas) {
  const list = llamadas ?? [];
  const shows = list.filter(esShow).length;
  const pendientes = list.filter((l) => l.estado === 'agendado').length;
  return {
    total: list.length,
    showsConfirmados: shows,
    pendientes,
  };
}

/**
 * Aplica una disposition al array de llamadas.
 * Si reagenda: atenúa la original y crea una nueva en la fecha.
 * @param {object[]} llamadas
 * @param {object} payload
 */
export function aplicarDispositionALlamadas(llamadas, payload) {
  const {
    llamadaId,
    disposition,
    montoUsd = null,
    offerTier = null,
    metodoPago = null,
    fechaPagoEstimada = null,
    cerró = null,
    objection = null,
    motivo = null,
    notas = null,
    proximoPaso = null,
    nurture = null,
    avisoNoShow = null,
    reagendarNoShow = null,
    nuevaFechaAt = null,
  } = payload;

  const now = new Date().toISOString();
  let nueva = null;

  const next = (llamadas ?? []).map((l) => {
    if (l.id !== llamadaId) return l;

    const base = {
      ...l,
      estado: disposition,
      dispositionAt: now,
      notasCloser: notas ?? l.notasCloser,
      offerTier: offerTier ?? l.offerTier,
      dispositionPayload: payload,
    };

    if (disposition === 'cerrado' || (disposition === 'show_calificado' && cerró === true)) {
      base.estado = 'cerrado';
      base.montoUsd = Number(montoUsd) || 0;
      base.metodoPago = metodoPago;
      base.fechaPagoEstimada = fechaPagoEstimada;
    }

    if (disposition === 'show_calificado' && cerró === false) {
      base.objection = objection;
      base.proximoPaso = proximoPaso;
    }

    if (disposition === 'show_descalificado') {
      base.motivo = motivo;
      base.nurture = nurture;
    }

    if (disposition === 'no_show') {
      base.avisoNoShow = avisoNoShow;
      base.reagendarNoShow = reagendarNoShow;
      if (reagendarNoShow === false) base.proximoPaso = 'perdido';
    }

    if (disposition === 'reagendado') {
      base.motivo = motivo;
      base.nuevaFechaAt = nuevaFechaAt;
      base.atenua = true;
      if (nuevaFechaAt) {
        nueva = {
          ...l,
          id: `${l.id}_r${Date.now()}`,
          estado: 'agendado',
          fechaAt: nuevaFechaAt,
          reagendadoDe: l.id,
          confirmado: false,
          atenua: false,
          montoUsd: null,
          dispositionAt: null,
          dispositionPayload: null,
          notasCloser: null,
          ultimaInteraccion: `Reagendada desde ${l.fechaAt}`,
        };
      }
    }

    if (disposition === 'cancelado') {
      base.motivo = motivo;
      base.nurture = nurture;
    }

    return base;
  });

  if (nueva) next.push(nueva);
  return next.sort((a, b) => a.fechaAt.localeCompare(b.fechaAt));
}

/** Fila para la tabla de dispositions recientes. */
export function filaDesdeDisposition(llamada, payload) {
  const estado = llamada.estado;
  return {
    id: `cd_${llamada.id}_${Date.now()}`,
    prospecto: llamada.prospecto,
    fechaAt: llamada.fechaAt,
    disposition: estado,
    offerTier: payload.offerTier || llamada.offerTier,
    cashUsd: llamada.montoUsd ?? payload.montoUsd ?? null,
    notas: payload.notas || '',
    objection: payload.objection || payload.motivo || null,
  };
}

export function llamadaPasada(llamada, ahora = new Date()) {
  if (!llamada?.fechaAt || llamada.estado !== 'agendado') return false;
  return new Date(llamada.fechaAt).getTime() <= ahora.getTime();
}
