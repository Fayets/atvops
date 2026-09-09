/**
 * Score de salud del cliente, calculado 100% con señales de los transcripts.
 *
 * Por qué existe: un tablero de fulfillment que depende de que alguien marque
 * un casillero deja de funcionar a las dos semanas. Este score se alimenta de
 * data que ya existe —los canales de Discord— así que se actualiza solo.
 *
 * @typedef {import('../data/types.js').Cliente} Cliente
 * @typedef {import('../data/types.js').Salud} Salud
 */

import { ahora, diasEntre } from './format.js';

/** Peso máximo de cada factor. Suman 100. Sin MRR: no hay factor de facturación. */
export const PESOS = {
  activacion: 35,
  ritmo: 35,
  mix: 15,
  momentum: 15,
};

/** Ventana de activación (primer win), en días. */
export const VENTANA_ACTIVACION = 30;

/** Días en fase onboarding desde la entrada al canal. Al día 31 salen. */
export const VENTANA_ONBOARDING = 31;

/** Cortes del semáforo. */
export const CORTES = { verde: 75, amarillo: 50 };

/**
 * @param {Cliente} cliente
 * @param {Date} [hoy]
 * @returns {Salud}
 */
export function calcularSalud(cliente, hoy = ahora()) {
  const { activacion, engagement } = cliente;
  const diasDesdeEntrada = diasEntre(cliente.entradaAt, hoy.toISOString());
  const factores = [];
  const alertas = [];

  /* 1 · Activación */
  let pActivacion;
  let detalleActivacion;
  if (activacion.activado) {
    const d = activacion.diasHastaResultado ?? 0;
    if (d <= VENTANA_ACTIVACION) {
      pActivacion = 35;
      detalleActivacion = `Primer resultado al día ${d}`;
    } else if (d <= 45) {
      pActivacion = 20;
      detalleActivacion = `Se activó al día ${d}, fuera de la ventana`;
    } else {
      pActivacion = 12;
      detalleActivacion = `Se activó muy tarde (día ${d})`;
    }
  } else if (diasDesdeEntrada <= VENTANA_ACTIVACION) {
    pActivacion = 18;
    detalleActivacion = `Día ${diasDesdeEntrada} de ${VENTANA_ACTIVACION}, ventana abierta`;
  } else {
    pActivacion = 0;
    detalleActivacion = `Sin resultado al día ${diasDesdeEntrada}`;
    alertas.push(`Sin activar después de ${diasDesdeEntrada} días`);
  }
  factores.push({
    nombre: 'Activación',
    puntos: pActivacion,
    max: PESOS.activacion,
    detalle: detalleActivacion,
  });

  /* 2 · Ritmo */
  const m = engagement.mensajesClienteSemana ?? 0;
  let pRitmo = m >= 4 ? 35 : m >= 2.5 ? 24 : m >= 1.5 ? 14 : 4;
  const notasRitmo = [`${m} mensajes por semana`];
  if (engagement.diasSinMensaje >= 3) {
    pRitmo -= 7;
    notasRitmo.push(`${engagement.diasSinMensaje} días sin escribir`);
  }
  pRitmo = Math.max(0, pRitmo);
  factores.push({
    nombre: 'Ritmo del cliente',
    puntos: pRitmo,
    max: PESOS.ritmo,
    detalle: notasRitmo.join(' · '),
  });

  /* 3 · Mix de conversación (heurística léxica del transcript). */
  const mix = engagement.mix ?? { implementacion: 0, soporte: 0, queja: 0, celebracion: 0 };
  const mixTotal = mix.implementacion + mix.soporte + mix.queja + mix.celebracion;
  let pMix;
  let detalleMix;
  if (!mixTotal || engagement.mixPendiente) {
    pMix = 7;
    detalleMix = 'Pocos mensajes etiquetables todavía';
  } else {
    const { implementacion, celebracion, queja } = mix;
    pMix = Math.max(0, Math.min(15, ((implementacion + celebracion) / 100) * 15 - queja * 0.25));
    if (queja >= 25) alertas.push(`${queja}% de la conversación son quejas`);
    detalleMix = `${implementacion}% implementación · ${queja}% queja`;
  }
  factores.push({
    nombre: 'Mix de conversación',
    puntos: Math.round(pMix * 10) / 10,
    max: PESOS.mix,
    detalle: detalleMix,
  });

  /* 4 · Momentum — tendencia de mensajes del cliente. */
  const tend = engagement.tendencia ?? 0;
  let pMom;
  let detalleMom;
  if (tend >= 20) {
    pMom = 15;
    detalleMom = `Tendencia +${tend}% vs semanas previas`;
  } else if (tend >= 0) {
    pMom = 10;
    detalleMom = `Tendencia estable (${tend}%)`;
  } else if (tend > -30) {
    pMom = 5;
    detalleMom = `Tendencia ${tend}%`;
  } else {
    pMom = 0;
    detalleMom = `Caída fuerte (${tend}%)`;
    alertas.push(`Actividad cayó ${Math.abs(tend)}%`);
  }
  factores.push({
    nombre: 'Momentum',
    puntos: pMom,
    max: PESOS.momentum,
    detalle: detalleMom,
  });

  const score = Math.round(factores.reduce((s, f) => s + f.puntos, 0));

  let semaforo = score >= CORTES.verde ? 'verde' : score >= CORTES.amarillo ? 'amarillo' : 'rojo';
  if (engagement.diasSinMensaje >= 7) {
    alertas.unshift(`Silencio de ${engagement.diasSinMensaje} días`);
    semaforo = 'rojo';
  }
  if (cliente.churnIntent?.detectado) {
    alertas.unshift('Intención de baja / reembolso en el canal');
    semaforo = 'rojo';
  }

  return { score, semaforo, factores, alertas };
}

/** Etiquetas y tonos del semáforo. */
export const SEMAFORO = {
  verde: { label: 'Sano', tone: 'ok', color: 'var(--ok)' },
  amarillo: { label: 'Atención', tone: 'warn', color: 'var(--warn)' },
  rojo: { label: 'En riesgo', tone: 'alert', color: 'var(--brand)' },
};

/** Blockers de activación derivados del canal. */
export const BLOCKERS = {
  cliente_ausente: {
    label: 'Cliente ausente',
    descripcion: 'Casi no escribe en el canal desde que entró.',
    accion: 'Ping personal + chequear accesos / expectativa.',
  },
  no_implementa: {
    label: 'No implementa',
    descripcion: 'Pasó la ventana de 30 días sin un win detectable en el transcript.',
    accion: 'Revisión 1:1: oferta, bloqueo y próximo hito concreto.',
  },
  bloqueo_tecnico: {
    label: 'Bloqueo técnico',
    descripcion: 'Algo concreto (herramienta, acceso, setup) lo frena.',
    accion: 'Destrabarlo con el equipo esta semana; es lo más barato de resolver.',
  },
  expectativa: {
    label: 'Expectativa desalineada',
    descripcion: 'Esperaba otra cosa del programa o del ritmo.',
    accion: 'Llamada de realineación: qué se prometió, qué se puede y cuándo.',
  },
  esperando_equipo: {
    label: 'Esperando al equipo',
    descripcion: 'El cliente avanzó y está esperando una devolución nuestra.',
    accion: 'Responder hoy. El bloqueo es nuestro, no de él.',
  },
};
