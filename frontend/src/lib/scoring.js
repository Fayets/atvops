/**
 * Score de salud del cliente, calculado 100% con señales de los transcripts.
 *
 * Por qué existe: un tablero de fulfillment que depende de que alguien marque
 * un casillero deja de funcionar a las dos semanas. Este score se alimenta de
 * data que ya existe —los canales de Discord— así que se actualiza solo.
 *
 * El cálculo es transparente a propósito: la pantalla muestra los factores uno
 * por uno. Si un cliente está en rojo, se tiene que poder ver por qué y
 * discutirlo, no aceptarlo como veredicto de una caja negra.
 *
 * @typedef {import('../data/types.js').Cliente} Cliente
 * @typedef {import('../data/types.js').Salud} Salud
 */

import { ahora, diasEntre } from './format.js';

/** Peso máximo de cada factor. Suman 100. */
export const PESOS = {
  activacion: 35,
  ritmo: 35,
  mix: 20,
  outcome: 10,
};

/** Ventana de activación, en días. Es la promesa: un win tangible antes del día 30. */
export const VENTANA_ACTIVACION = 30;

/** Cortes del semáforo. */
export const CORTES = { verde: 75, amarillo: 50 };

/**
 * @param {Cliente} cliente
 * @param {Date} [hoy]
 * @returns {Salud}
 */
export function calcularSalud(cliente, hoy = ahora()) {
  const { activacion, engagement, outcome } = cliente;
  const diasDesdeEntrada = diasEntre(cliente.entradaAt, hoy.toISOString());
  const factores = [];
  const alertas = [];

  /* 1 · Activación — la promesa central: primer resultado antes del día 30. */
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
  factores.push({ nombre: 'Activación', puntos: pActivacion, max: PESOS.activacion, detalle: detalleActivacion });

  /* 2 · Ritmo — cuántos mensajes manda el cliente y hacia dónde va la curva. */
  const m = engagement.mensajesClienteSemana;
  let pRitmo = m >= 4 ? 35 : m >= 2.5 ? 24 : m >= 1.5 ? 14 : 4;
  const notasRitmo = [`${m} mensajes por semana`];
  if (engagement.tendencia <= -30) {
    pRitmo -= 10;
    notasRitmo.push(`cayó ${Math.abs(engagement.tendencia)}%`);
  }
  if (engagement.diasSinMensaje >= 3) {
    pRitmo -= 7;
    notasRitmo.push(`${engagement.diasSinMensaje} días sin escribir`);
  }
  pRitmo = Math.max(0, pRitmo);
  factores.push({ nombre: 'Ritmo del cliente', puntos: pRitmo, max: PESOS.ritmo, detalle: notasRitmo.join(' · ') });

  /* 3 · Mix de conversación — de qué habla el cliente. */
  const mix = engagement.mix ?? { implementacion: 0, soporte: 0, queja: 0, celebracion: 0 };
  const mixTotal = mix.implementacion + mix.soporte + mix.queja + mix.celebracion;
  let pMix;
  let detalleMix;
  if (!mixTotal || engagement.mixPendiente) {
    pMix = 10;
    detalleMix = 'Mix pendiente del clasificador';
  } else {
    const { implementacion, celebracion, queja } = mix;
    pMix = Math.max(0, Math.min(20, ((implementacion + celebracion) / 100) * 20 - queja * 0.35));
    if (queja >= 25) alertas.push(`${queja}% de la conversación son quejas`);
    detalleMix = `${implementacion}% implementación · ${queja}% queja`;
  }
  factores.push({
    nombre: 'Mix de conversación',
    puntos: Math.round(pMix * 10) / 10,
    max: PESOS.mix,
    detalle: detalleMix,
  });

  /* 4 · Outcome — ¿el cliente está creciendo? Si no crece, se va igual. */
  let pOutcome;
  let detalleOutcome;
  if (!outcome.revenueInicialUsd) {
    pOutcome = 5;
    detalleOutcome = 'Facturación pendiente de payments / CRM';
  } else {
    const crecimiento = outcome.revenueActualUsd / outcome.revenueInicialUsd;
    pOutcome = crecimiento >= 1.5 ? 10 : crecimiento >= 1.2 ? 7 : crecimiento >= 1.05 ? 4 : 0;
    detalleOutcome = `Factura ${crecimiento.toFixed(2)}× de lo que facturaba al entrar`;
  }
  factores.push({
    nombre: 'Outcome',
    puntos: pOutcome,
    max: PESOS.outcome,
    detalle: detalleOutcome,
  });

  const score = Math.round(factores.reduce((s, f) => s + f.puntos, 0));

  /* Reglas duras: no importa el puntaje, estas condiciones pintan rojo. */
  let semaforo = score >= CORTES.verde ? 'verde' : score >= CORTES.amarillo ? 'amarillo' : 'rojo';
  if (engagement.diasSinMensaje >= 7) {
    alertas.unshift(`Silencio de ${engagement.diasSinMensaje} días`);
    semaforo = 'rojo';
  }

  return { score, semaforo, factores, alertas };
}

/** Etiquetas y tonos del semáforo, para no repetirlos en cada pantalla. */
export const SEMAFORO = {
  verde: { label: 'Sano', tone: 'ok', color: 'var(--ok)' },
  amarillo: { label: 'Atención', tone: 'warn', color: 'var(--warn)' },
  rojo: { label: 'En riesgo', tone: 'alert', color: 'var(--brand)' },
};
