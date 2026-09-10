/**
 * Cuotas personales de Closer / Setter derivadas de la proyección del mes (decreto).
 * Misma fuente que Metas / Ventas OPS — evita metas hardcodeadas desconectadas.
 */

import { decretoPlantilla, leerDecretoGuardado } from './metasMes.js';

/** Headcount default hasta que haya roster real. */
export const EQUIPO_VENTAS_SIZE = {
  closers: 4,
  setters: 3,
};

function ceilDiv(n, d) {
  return d > 0 ? Math.ceil(n / d) : 0;
}

function round(n) {
  return Math.round(Number(n) || 0);
}

/**
 * Meta de proyección del mes (decreto o fallback OPS).
 * @param {string} mes
 */
export function metaProyeccionMes(mes) {
  const guardado = leerDecretoGuardado(mes);
  const plantilla = decretoPlantilla(mes);
  const d = guardado || plantilla;
  const showRate = d.showUpRate ?? d.showRate ?? 0;
  const closeRate = d.closeRateBueno ?? d.closeRate ?? 0;
  const agendas = d.agendas ?? 0;
  const shows = d.shows ?? round(agendas * (showRate / 100));
  const cierres = d.cierres ?? round(shows * (closeRate / 100));
  const cashUsd = d.cashMeta ?? 0;
  const conversaciones = d.conversaciones ?? OPS_VENTAS_META.conversaciones;
  const calendlys = d.aplicaciones ?? OPS_VENTAS_META.aplicaciones;
  const ticket = cierres > 0 ? cashUsd / cierres : OPS_VENTAS_META.averageSaleUsd;

  return {
    mes,
    fuente: guardado ? 'decreto' : 'default',
    conversaciones,
    calendlys,
    agendas,
    shows,
    cierres,
    cashUsd,
    showRate,
    closeRate,
    ticketUsd: ticket,
    creadoPor: d.creadoPor ?? null,
  };
}

/**
 * Cuota personal del closer + meta de equipo, alineada a la proyección.
 * @param {string} mes
 * @param {{ closers?: number }} [opts]
 */
export function cuotasCloserDesdeProyeccion(mes, opts = {}) {
  const n = opts.closers ?? EQUIPO_VENTAS_SIZE.closers;
  const m = metaProyeccionMes(mes);
  const personal = {
    llamadas: ceilDiv(m.agendas, n),
    shows: ceilDiv(m.shows, n),
    cierres: ceilDiv(m.cierres, n),
    cashUsd: ceilDiv(m.cashUsd, n),
  };
  return {
    proyeccion: m,
    personal,
    equipo: {
      metaUsd: m.cashUsd,
      agendas: m.agendas,
      shows: m.shows,
      cierres: m.cierres,
    },
    ratesMeta: {
      showRate: m.showRate,
      closeRate: m.closeRate,
    },
    headcount: n,
  };
}

/**
 * Cuota personal del setter (día + mes) alineada a la proyección.
 * @param {string} mes
 * @param {{ setters?: number, diasMes?: number, diasLaborales?: number }} [opts]
 */
export function cuotasSetterDesdeProyeccion(mes, opts = {}) {
  const n = opts.setters ?? EQUIPO_VENTAS_SIZE.setters;
  const diasMes = opts.diasMes ?? 30;
  const diasLab = opts.diasLaborales ?? Math.max(1, Math.round(diasMes * (22 / 30)));
  const m = metaProyeccionMes(mes);

  const mesPersonal = {
    calendlys: ceilDiv(m.calendlys, n),
    agendadas: ceilDiv(m.agendas, n),
    tasaAgendado: m.calendlys ? (m.agendas / m.calendlys) * 100 : 33,
  };
  const diaPersonal = {
    calendlys: Math.max(1, ceilDiv(mesPersonal.calendlys, diasLab)),
    agendadas: Math.max(1, ceilDiv(mesPersonal.agendadas, diasLab)),
  };

  return {
    proyeccion: m,
    personalMes: mesPersonal,
    personalDia: diaPersonal,
    equipo: {
      metaCalendlys: m.calendlys,
      metaAgendas: m.agendas,
    },
    headcount: n,
    diasLaborales: diasLab,
  };
}

/**
 * Estado de pacing vs ritmo esperado del mes.
 * @param {number} pctCompletado 0–100+
 * @param {number} ritmoEsperado 0–100
 */
export function estadoVsRitmo(pctCompletado, ritmoEsperado) {
  if (pctCompletado >= ritmoEsperado - 2) return 'en_camino';
  if (pctCompletado >= ritmoEsperado - 15) return 'atencion';
  return 'critico';
}
