/**
 * Cuotas personales de Closer / Setter derivadas de la proyección del mes (decreto).
 * Misma fuente que Metas / Ventas OPS — evita metas hardcodeadas desconectadas.
 */

import { decretoPlantilla, leerDecretoGuardado } from './metasMes.js';

/**
 * La meta del decreto no se reparte: cada uno carga la del equipo entera.
 * Repartirla hacía que con dos setters cargados a nadie le apareciera el número real,
 * y que el número cambiara solo por dar de alta a alguien.
 */

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
  // Todo sale del decreto. Lo que el decreto no fija queda en cero: antes esto apuntaba
  // a una constante de las metas de ejemplo que ya no existe y rompía la vista del setter.
  const conversaciones = d.conversaciones ?? 0;
  const calendlys = d.aplicaciones ?? d.linksEnviados ?? 0;
  const ticket = cierres > 0 ? cashUsd / cierres : 0;

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
 */
export function cuotasCloserDesdeProyeccion(mes) {
  const m = metaProyeccionMes(mes);
  const personal = {
    llamadas: m.agendas,
    shows: m.shows,
    cierres: m.cierres,
    cashUsd: m.cashUsd,
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
  };
}

/**
 * Cuota personal del setter (día + mes) alineada a la proyección.
 * @param {string} mes
 * @param {{ diasMes?: number, diasLaborales?: number }} [opts]
 */
export function cuotasSetterDesdeProyeccion(mes, opts = {}) {
  const diasMes = opts.diasMes ?? 30;
  const diasLab = opts.diasLaborales ?? Math.max(1, Math.round(diasMes * (22 / 30)));
  const m = metaProyeccionMes(mes);

  const mesPersonal = {
    conversaciones: m.conversaciones,
    calendlys: m.calendlys,
    agendadas: m.agendas,
    // Cuántas de las conversaciones tienen que terminar en agenda.
    tasaAgendado: m.conversaciones ? (m.agendas / m.conversaciones) * 100 : 0,
  };
  const diaPersonal = {
    conversaciones: Math.max(1, ceilDiv(mesPersonal.conversaciones, diasLab)),
    calendlys: ceilDiv(mesPersonal.calendlys, diasLab),
    agendadas: Math.max(1, ceilDiv(mesPersonal.agendadas, diasLab)),
  };

  return {
    proyeccion: m,
    personalMes: mesPersonal,
    personalDia: diaPersonal,
    equipo: {
      metaConversaciones: m.conversaciones,
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
