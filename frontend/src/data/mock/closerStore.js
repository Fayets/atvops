/**
 * Store mock en memoria para agenda del closer.
 * Simula WebSocket/polling: suscriptores se enteran al guardar dispositions.
 * Cuando haya backend, getCloserDashboard / guardarDisposition pegarán a la API.
 */

import {
  CLOSER_DISPOSITIONS,
  CLOSER_HOY,
  CLOSER_SEMANA,
} from './closer.js';
import {
  aplicarDispositionALlamadas,
  filaDesdeDisposition,
} from '../../lib/dispositions.js';

/** @type {object[]} */
let agenda = structuredClone([...CLOSER_HOY, ...CLOSER_SEMANA]);

/** @type {object[]} */
let recientes = structuredClone(CLOSER_DISPOSITIONS);

/** @type {Set<() => void>} */
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeCloserAgenda(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCloserAgenda() {
  return agenda.map((l) => ({ ...l }));
}

export function getCloserDisposicionesRecientes() {
  return recientes.map((d) => ({ ...d }));
}

export function resetCloserAgenda() {
  agenda = structuredClone([...CLOSER_HOY, ...CLOSER_SEMANA]);
  recientes = structuredClone(CLOSER_DISPOSITIONS);
  notify();
}

/**
 * @param {object} payload — { llamadaId, disposition, ...campos }
 */
export function guardarDispositionEnStore(payload) {
  agenda = aplicarDispositionALlamadas(agenda, payload);
  const llamada = agenda.find((l) => l.id === payload.llamadaId);
  if (llamada) {
    recientes = [filaDesdeDisposition(llamada, payload), ...recientes].slice(0, 20);
  }
  notify();
  return { agenda: getCloserAgenda(), recientes: getCloserDisposicionesRecientes() };
}

/**
 * Demo: aplica una disposition de ejemplo a la primera llamada agendada
 * (Tomás Riganti por defecto).
 */
export function simularDispositionDemo() {
  const target =
    agenda.find((l) => l.id === 'ch_01' && l.estado === 'agendado') ||
    agenda.find((l) => l.estado === 'agendado');
  if (!target) return null;

  const payload = {
    llamadaId: target.id,
    disposition: 'show_calificado',
    cerró: false,
    objection: 'pensar',
    proximoPaso: 'follow_up',
    notas: 'Demo: entró, califica, pide 48h para decidir.',
    offerTier: target.offerTier || 'Boost',
  };
  return guardarDispositionEnStore(payload);
}
