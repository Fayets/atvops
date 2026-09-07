/**
 * Prescripciones semanales desde datos reales.
 * Regla: ninguna acción sin "porqué" auditable. Si la fuente es mock, no entra.
 *
 * @typedef {import('../data/types.js').Accion} Accion
 */

import { formatValue } from './format.js';
import { planEmbudo, planPalancas } from './pacing.js';

const n = (v) => formatValue(Math.round(v), 'count');

/**
 * Fulfillment: clientes a tocar esta semana (score, silencio, activación, churn).
 * @param {{
 *   enRiesgo: any[],
 *   silencio?: any[],
 *   churnIntent?: any[],
 *   sinActivarFuera?: any[],
 *   candidatos?: any[],
 * }} p
 */
export function accionesFulfillment({
  enRiesgo = [],
  silencio = [],
  churnIntent = [],
  sinActivarFuera = [],
  candidatos = [],
}) {
  /** @type {Accion[]} */
  const acciones = [];
  const rojos = enRiesgo.filter((c) => c.salud?.semaforo === 'rojo');

  if (churnIntent.length) {
    const nombres = churnIntent.slice(0, 3).map((c) => c.nombre.split(' ')[0]).join(', ');
    acciones.push({
      id: 'acc_ful_churn',
      area: 'fulfillment',
      titulo: `Atender ${churnIntent.length === 1 ? 'intención de baja' : `${churnIntent.length} intenciones de baja`}: ${nombres}${churnIntent.length > 3 ? '…' : ''}`,
      porque: churnIntent
        .slice(0, 3)
        .map((c) => `${c.nombre}: «${(c.churnIntent?.extracto || '').slice(0, 120)}»`)
        .join(' · '),
      dueno: 'Franco',
      prioridad: 'alta',
      href: '/fulfillment/retencion',
    });
  }

  if (rojos.length) {
    acciones.push({
      id: 'acc_ful_rojos',
      area: 'fulfillment',
      titulo: `Hablar esta semana con ${rojos.length === 1 ? 'el cliente' : `los ${rojos.length} clientes`} en rojo: ${rojos.slice(0, 3).map((c) => c.nombre.split(' ')[0]).join(', ')}${rojos.length > 3 ? '…' : ''}`,
      porque: `Score < 50 o regla dura (silencio / baja). ${rojos.slice(0, 8).map((c) => `${c.nombre.split(' ')[0]} ${c.salud.score}`).join(' · ')}.`,
      dueno: 'Franco',
      prioridad: 'alta',
      href: '/fulfillment/clientes',
    });
  }

  if (silencio.length) {
    acciones.push({
      id: 'acc_ful_silencio',
      area: 'fulfillment',
      titulo: `Romper el silencio en ${silencio.length} canales (≥7 días sin mensaje del cliente)`,
      porque: `Dato real de los transcripts. ${silencio.slice(0, 6).map((c) => `${c.nombre.split(' ')[0]} ${c.engagement.diasSinMensaje}d`).join(' · ')}${silencio.length > 6 ? '…' : ''}.`,
      dueno: 'Equipo',
      prioridad: silencio.length >= 10 ? 'alta' : 'media',
      href: '/fulfillment/engagement',
    });
  }

  if (sinActivarFuera.length) {
    acciones.push({
      id: 'acc_ful_sin_activar',
      area: 'fulfillment',
      titulo: `Destrabar ${sinActivarFuera.length} sin win después del día 30`,
      porque: `Sin resultado detectable en el transcript. ${sinActivarFuera.slice(0, 5).map((c) => c.nombre.split(' ')[0]).join(', ')}${sinActivarFuera.length > 5 ? '…' : ''}.`,
      dueno: 'Franco',
      prioridad: 'media',
      href: '/fulfillment/activacion',
    });
  }

  if (candidatos.length) {
    acciones.push({
      id: 'acc_ful_upsell',
      area: 'fulfillment',
      titulo: `Conversar upsell con ${candidatos.length} candidato${candidatos.length === 1 ? '' : 's'} detectado${candidatos.length === 1 ? '' : 's'} en el canal`,
      porque: `Señal léxica de techo / siguiente nivel. ${candidatos.slice(0, 5).map((c) => c.nombre.split(' ')[0]).join(', ')}${candidatos.length > 5 ? '…' : ''}.`,
      dueno: 'Franco',
      prioridad: 'media',
      href: '/fulfillment/outcomes',
    });
  }

  return acciones;
}

/**
 * Cobranza real (ATV Clients).
 */
export function accionesCobranza({ vencidas, porVencerSemana, unavailable, error } = {}) {
  /** @type {Accion[]} */
  const acciones = [];
  if (unavailable) {
    acciones.push({
      id: 'acc_cob_offline',
      area: 'cobranza',
      titulo: 'Levantar ATV Clients para ver cuotas',
      porque: error || 'La home no puede prescribir cobros sin la API de clientes.',
      dueno: 'Franco',
      prioridad: 'alta',
      href: '/cobranza',
    });
    return acciones;
  }
  if (!vencidas || !porVencerSemana) return acciones;
  if (vencidas.n > 0) {
    acciones.push({
      id: 'acc_cob_vencidas',
      area: 'cobranza',
      titulo: `Cobrar ${vencidas.n === 1 ? 'la cuota vencida' : `las ${vencidas.n} cuotas vencidas`}: ${formatValue(vencidas.usd, 'usd')}`,
      porque: `${vencidas.detalle}. Cada día de atraso baja la probabilidad de cobro.`,
      dueno: 'Franco',
      prioridad: 'alta',
      href: '/cobranza',
    });
  }
  if (porVencerSemana.n > 0) {
    acciones.push({
      id: 'acc_cob_avisar',
      area: 'cobranza',
      titulo: `Avisar a ${porVencerSemana.n} con vencimiento en 7 días: ${formatValue(porVencerSemana.usd, 'usd')}`,
      porque: 'Cuotas pendientes reales de ATV Clients que vencen esta semana.',
      dueno: 'Franco',
      prioridad: 'media',
      href: '/cobranza',
    });
  }
  return acciones;
}

/**
 * Operación del tablero (fuentes caídas / parciales), no grietas mock.
 * @param {{ transcripts: any, backendOk: boolean }} p
 */
export function accionesOperativas({ transcripts, backendOk }) {
  /** @type {Accion[]} */
  const acciones = [];
  if (!backendOk) {
    acciones.push({
      id: 'acc_ops_backend',
      area: 'sistemas',
      titulo: 'Backend / transcripts sin respuesta',
      porque: 'No se pudo leer /api/transcripts. El score de fulfillment puede estar desactualizado.',
      dueno: 'Franco',
      prioridad: 'alta',
      href: '/sistemas',
    });
    return acciones;
  }
  if (transcripts?.resumen?.parcial) {
    const n = transcripts.resumen.canales ?? 0;
    const ok = transcripts.resumen.canales_completos ?? 0;
    acciones.push({
      id: 'acc_ops_parcial',
      area: 'sistemas',
      titulo: `Completar sync de transcripts (${ok}/${n} completos)`,
      porque: 'La copia local no tiene el histórico completo. Corré el bot en atv-clients o sincronizá el path de transcripts.',
      dueno: 'Franco',
      prioridad: 'media',
      href: '/sistemas',
    });
  }
  return acciones;
}

/**
 * Grietas operativas reales (para el bloque Sistemas de la home).
 */
export function grietasOperativas({ cobranza, transcripts, backendOk }) {
  const ahora = new Date().toISOString();
  /** @type {import('../data/types.js').Grieta[]} */
  const grietas = [];
  if (cobranza?.unavailable) {
    grietas.push({
      id: 'gri_cobranza',
      metrica: 'Cobranza · ATV Clients',
      valorDashboard: null,
      valorFuente: null,
      format: 'count',
      sourceId: 'atv_clients',
      severidad: 'alta',
      detectadaAt: ahora,
      causa: cobranza.error || 'La API de cobranza no responde.',
      seccion: 'cobranza',
    });
  }
  if (!backendOk) {
    grietas.push({
      id: 'gri_transcripts',
      metrica: 'Transcripts Discord',
      valorDashboard: null,
      valorFuente: null,
      format: 'count',
      sourceId: 'discord_transcripts',
      severidad: 'alta',
      detectadaAt: ahora,
      causa: 'Sin respuesta del backend de transcripts.',
      seccion: 'sistemas',
    });
  } else if (transcripts?.resumen?.parcial) {
    grietas.push({
      id: 'gri_parcial',
      metrica: 'Transcripts parciales',
      valorDashboard: transcripts.resumen.canales_completos ?? 0,
      valorFuente: transcripts.resumen.canales ?? 0,
      format: 'count',
      sourceId: 'discord_transcripts',
      severidad: 'media',
      detectadaAt: ahora,
      causa: 'La copia local no tiene el histórico completo del server.',
      seccion: 'fulfillment',
    });
  }
  return grietas;
}

const ORDEN_PRIORIDAD = { alta: 0, media: 1 };

/** Ordena: prioridad alta primero, y dentro de cada prioridad por área. */
export function ordenarAcciones(acciones) {
  const orden = ['cobranza', 'fulfillment', 'sistemas', 'ventas', 'marketing'];
  return [...acciones].sort(
    (a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] || orden.indexOf(a.area) - orden.indexOf(b.area),
  );
}

/* ---- Legacy (páginas Marketing/Ventas todavía mock): no se usan en Home. ---- */

/** @deprecated Solo para bloques mock de Marketing. */
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

/** @deprecated Solo para bloques mock de Ventas. */
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

/** @deprecated */
export function accionSistemas(grietas) {
  const altas = (grietas || []).filter((g) => g.severidad === 'alta');
  if (!altas.length) return null;
  return {
    id: 'acc_sis_grietas',
    area: 'sistemas',
    titulo: `Cerrar ${altas.length === 1 ? 'la grieta' : `las ${altas.length} grietas`} de severidad alta: ${altas.map((g) => g.metrica.split(' · ')[0]).join(', ')}`,
    porque: 'Mientras estén abiertas, los números de esas áreas no son confiables.',
    dueno: 'Franco',
    prioridad: 'alta',
    href: '/sistemas',
  };
}
