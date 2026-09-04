/**
 * Prescripciones semanales: convierte el estado de cada meta en una orden
 * concreta con el número adentro y la cuenta que la justifica.
 *
 * Regla: ninguna acción sin "porqué". Si el sistema no puede mostrar la
 * cuenta, no debe dar la orden.
 *
 * @typedef {import('../data/types.js').Accion} Accion
 */

import { formatValue } from './format.js';
import { planEmbudo, planPalancas } from './pacing.js';

const n = (v) => formatValue(Math.round(v), 'count');

/**
 * Marketing: qué palancas correr esta semana para la meta principal.
 * @returns {{ accion: Accion | null, plan: ReturnType<typeof planPalancas> | null }}
 */
export function accionMarketing(metaConRitmo) {
  const { meta, ritmo } = metaConRitmo;
  if (!meta.palancas?.length || ritmo.estado === 'cumplida') return { accion: null, plan: null };

  const plan = planPalancas(ritmo.necesarioSemana, meta.palancas);
  const nombres = plan.elegidas.map((p) => `${p.nombre.replace('Secuencia · ', '')} (${n(p.rendimiento)})`);
  const atras = ritmo.gap < 0;

  const titulo = plan.elegidas.length
    ? `Lanzar ${plan.elegidas.length === 1 ? 'una secuencia' : `${plan.elegidas.length} secuencias`} esta semana: ${nombres.join(' + ')}`
    : `Sostener el ritmo de ${meta.nombre.toLowerCase()}`;

  const porque =
    `Llevás ${n(meta.acumulado.at(-1))} de ${n(meta.meta)} a día ${ritmo.dia}; a este ritmo el mes cierra en ${n(ritmo.proyeccion)}. ` +
    `Faltan ${n(ritmo.restante)} en ${ritmo.diasRestantes} días: ${n(ritmo.necesarioSemana)} por semana. ` +
    (plan.elegidas.length > 1
      ? `Con una sola secuencia (${n(plan.elegidas[0].rendimiento)}) quedás ${n(ritmo.necesarioSemana - plan.elegidas[0].rendimiento)} abajo; las dos suman ${n(plan.cubre)} y recuperan el atraso.`
      : `${nombres[0] ?? 'La mejor secuencia'} sola cubre la semana.`);

  return {
    plan,
    accion: {
      id: 'acc_mkt_secuencias',
      area: 'marketing',
      titulo,
      porque,
      dueno: meta.dueno,
      prioridad: atras ? 'alta' : 'media',
      href: '/marketing',
    },
  };
}

/**
 * Ventas: cuántos llamados hay que agendar para que los cierres lleguen.
 */
export function accionVentas(metaCierres, embudo) {
  const { meta, ritmo } = metaCierres;
  if (ritmo.estado === 'cumplida') return { accion: null, plan: null };

  const plan = planEmbudo({
    cierres: ritmo.necesarioSemana,
    closeRate: embudo.closeRate,
    showRate: embudo.showRate,
    agendadosEnCalendario: embudo.agendadosEnCalendario,
  });

  const titulo = plan.faltanAgendar > 0
    ? `Agendar ${plan.faltanAgendar} llamados más esta semana (hay ${embudo.agendadosEnCalendario}, hacen falta ${plan.agendadosNecesarios})`
    : `Con los ${embudo.agendadosEnCalendario} llamados agendados alcanza: cuidar el show up`;

  const porque =
    `Van ${n(meta.acumulado.at(-1))} cierres de ${n(meta.meta)}; faltan ${n(ritmo.restante)} en ${ritmo.diasRestantes} días, ${ritmo.necesarioSemana.toFixed(1)} por semana. ` +
    `Con ${Math.round(embudo.closeRate * 100)}% de cierre hacen falta ${plan.showsNecesarios} shows, y con ${Math.round(embudo.showRate * 100)}% de show up, ${plan.agendadosNecesarios} agendados.`;

  return {
    plan,
    accion: {
      id: 'acc_ven_agendar',
      area: 'ventas',
      titulo,
      porque,
      dueno: meta.dueno,
      prioridad: plan.faltanAgendar > 0 ? 'alta' : 'media',
      href: '/ventas',
    },
  };
}

/**
 * Fulfillment: los clientes que hay que tocar esta semana.
 * @param {{ enRiesgo: any[], canalesEnSilencio: number | null, transcriptsParcial?: boolean }} p
 */
export function accionesFulfillment({ enRiesgo, canalesEnSilencio, transcriptsParcial = false }) {
  /** @type {Accion[]} */
  const acciones = [];
  const rojos = enRiesgo.filter((c) => c.salud.semaforo === 'rojo');
  if (rojos.length) {
    acciones.push({
      id: 'acc_ful_rojos',
      area: 'fulfillment',
      titulo: `Hablar esta semana con ${rojos.length === 1 ? 'el cliente' : `los ${rojos.length} clientes`} en rojo: ${rojos.slice(0, 3).map((c) => c.nombre.split(' ')[0]).join(', ')}${rojos.length > 3 ? '…' : ''}`,
      porque: `Score de salud por debajo de 50. ${rojos.map((c) => `${c.nombre.split(' ')[0]} ${c.salud.score}`).join(' · ')}. Un cliente en rojo que no se toca en la semana es el churn del mes que viene.`,
      dueno: 'Franco',
      prioridad: 'alta',
      href: '/fulfillment/clientes',
    });
  }
  if (canalesEnSilencio) {
    acciones.push({
      id: 'acc_ful_silencio',
      area: 'fulfillment',
      titulo: transcriptsParcial
        ? `Traer los transcripts del server: la copia local muestra ${canalesEnSilencio} canales en silencio, pero está vieja`
        : `Romper el silencio en ${canalesEnSilencio} canales sin mensajes hace 7 días o más`,
      porque: transcriptsParcial
        ? 'Dato real de Discord, pero de una copia parcial que no se actualiza desde hace días. Hasta apuntar a /opt/atv-clients/transcripts, el silencio puede ser del archivo, no del cliente.'
        : 'Dato real de los transcripts de Discord. Un canal callado no es un cliente contento: es un cliente del que no sabemos nada.',
      dueno: transcriptsParcial ? 'Franco' : 'Equipo',
      prioridad: 'media',
      href: '/fulfillment/clientes',
    });
  }
  return acciones;
}

/**
 * Cobranza: vencidas primero, por vencer después.
 */
export function accionesCobranza({ vencidas, porVencerSemana }) {
  /** @type {Accion[]} */
  const acciones = [];
  if (vencidas.n > 0) {
    acciones.push({
      id: 'acc_cob_vencidas',
      area: 'cobranza',
      titulo: `Cobrar ${vencidas.n === 1 ? 'la cuota vencida' : `las ${vencidas.n} cuotas vencidas`}: ${formatValue(vencidas.usd, 'usd')}`,
      porque: `${vencidas.detalle}. Cada día de atraso baja la probabilidad de cobro; a los 30 días es un churn con otro nombre.`,
      dueno: 'Franco',
      prioridad: 'alta',
      href: '/cobranza',
    });
  }
  if (porVencerSemana.n > 0) {
    acciones.push({
      id: 'acc_cob_avisar',
      area: 'cobranza',
      titulo: `Avisar antes del vencimiento a ${porVencerSemana.n} clientes: ${formatValue(porVencerSemana.usd, 'usd')} vencen esta semana`,
      porque: 'Un recordatorio dos días antes evita la mitad de las cuotas vencidas. Hoy ese aviso lo escribe una persona; está en Ideas para automatizarlo.',
      dueno: 'Franco',
      prioridad: 'media',
      href: '/cobranza',
    });
  }
  return acciones;
}

/** Sistemas: grietas de severidad alta abiertas. */
export function accionSistemas(grietas) {
  const altas = grietas.filter((g) => g.severidad === 'alta');
  if (!altas.length) return null;
  return {
    id: 'acc_sis_grietas',
    area: 'sistemas',
    titulo: `Cerrar ${altas.length === 1 ? 'la grieta' : `las ${altas.length} grietas`} de severidad alta: ${altas.map((g) => g.metrica.split(' · ')[0]).join(', ')}`,
    porque: 'Mientras estén abiertas, los números de esas áreas no son confiables y cualquier decisión encima de ellos es a ciegas.',
    dueno: 'Franco',
    prioridad: 'alta',
    href: '/sistemas',
  };
}

const ORDEN_PRIORIDAD = { alta: 0, media: 1 };

/** Ordena: prioridad alta primero, y dentro de cada prioridad por área en el orden del cuadro. */
export function ordenarAcciones(acciones) {
  const orden = ['cobranza', 'ventas', 'marketing', 'fulfillment', 'sistemas'];
  return [...acciones].sort(
    (a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] || orden.indexOf(a.area) - orden.indexOf(b.area),
  );
}
