/**
 * FRONTERA DE DATOS.
 *
 * Todo lo que el dashboard muestra entra por acá. Hoy las funciones leen los
 * mocks de `./mock/` y derivan las métricas; cuando una fuente se automatiza,
 * se reemplaza el cuerpo de UNA función por un `fetch` al backend y el resto
 * del código no se entera. Ese es el objetivo: migrar fuente por fuente.
 *
 *   getFulfillment() → GET /api/clientes (+ score/heurísticas en frontend)
 *   getClientes()    → GET /api/clientes (boost / advantage / avanzados / principiantes)
 *   getCobranza()    → GET /api/cobranza (ATV Clients cuotas)
 *   getMetasMes()    → mock decreto + avance + diagnóstico (Marketing/Ventas)
 *   getVentas()      → mock (Calendly + payments)
 *   getMarketing()   → mock (Ads Manager)
 *   getOnboarding()  → mock
 *   getSistemas()    → mock
 *   getHome()        → composición de las anteriores
 *
 * FULFILLMENT + acciones de la semana: Discord (+ cobranza si ATV Clients responde).
 * Marketing/Ventas del cuadro home pueden seguir en mock hasta conectar esas fuentes.
 *
 * @typedef {import('./types.js').Metric} Metric
 * @typedef {import('./types.js').ResumenArea} ResumenArea
 */

import { DECRETO_SEPTIEMBRE_2026, REAL_DIA_14, CONTEXTO_MOCK } from './mock/metasMes.js';
import {
  calcularAvance,
  calcularDiagnostico,
  decretoPlantilla,
  leerDecretoGuardado,
  tasasImplicitas,
} from '../lib/metasMes.js';
import { contextoDeMes } from '../lib/mes.js';
import { GRIETAS, PEDIDOS, PEDIDOS_SEMANA } from './mock/home.js';
import { CAMPANIAS, FRECUENCIA, GASTO_CANAL, GASTO_DIARIO } from './mock/marketing.js';
import { DURACION_HISTORICA, PROCESOS } from './mock/onboarding.js';
import { OPS_VENTAS_META } from './mock/ventasOps.js';
import {
  OPS_FF_CALIDAD,
  OPS_FF_CONTEXTO,
  OPS_FF_EXPANSION,
  OPS_FF_PROGRAMAS,
  OPS_FF_RESUMEN,
  OPS_FF_SALUD,
} from './mock/fulfillmentOps.js';
import {
  CLOSER_ACTUAL,
  CLOSER_CONTEXTO,
  CLOSER_EQUIPO,
  CLOSER_FOLLOW_UPS,
  CLOSER_PERFIL,
  CLOSER_SEMANAS,
} from './mock/closer.js';
import {
  getCloserAgenda,
  getCloserDisposicionesRecientes,
  guardarDispositionEnStore,
  simularDispositionDemo,
  subscribeCloserAgenda,
} from './mock/closerStore.js';
import {
  SETTER_ACTUAL_DIA,
  SETTER_ACTUAL_MES,
  SETTER_APLICACIONES,
  SETTER_CONTEXTO,
  SETTER_EQUIPO,
  SETTER_PERFIL,
  SETTER_SEMANAS,
} from './mock/setter.js';
import { completarSetterReporte, getSetterReporte } from './mock/setterStore.js';
import {
  calcularCloseRate,
  calcularShowRate,
  esShow,
  resumenCalendarioHoy,
} from '../lib/dispositions.js';
import {
  cuotasCloserDesdeProyeccion,
  cuotasSetterDesdeProyeccion,
  estadoVsRitmo,
} from '../lib/cuotasMes.js';
import { coberturaAutomatizacion, DATA_FIELDS, SOURCE_LIST, SOURCES } from './sources.js';
import { ahora, diasEntre, formatValue, hoyIso, mesId, nombreMesAnio, formatFecha } from '../lib/format.js';
import { EMBUDO_VENTAS, METAS } from './mock/metas.js';
import { diaDentroDelMes, diasDelMes, ritmo, semanaIso } from '../lib/pacing.js';
import {
  accionMarketing,
  accionVentas,
  accionesCobranza,
  accionesFulfillment,
  accionesOperativas,
  grietasOperativas,
  ordenarAcciones,
} from '../lib/acciones.js';
import { getToken } from '../lib/auth.js';
import { calcularSalud, BLOCKERS, SEMAFORO, VENTANA_ONBOARDING } from '../lib/scoring.js';

/** Latencia simulada: obliga a que los componentes manejen el estado de carga. */
const LATENCIA_MS = 180;

/** @template T @param {T} data @returns {Promise<T>} */
function responder(data) {
  return new Promise((resolve) => setTimeout(() => resolve(data), LATENCIA_MS));
}

/** El mock trae una serie hasta el día 14; el ritmo usa solo hasta el día de hoy. */
function recortarAcumulado(acumulado, diaHoy) {
  if (!acumulado?.length || diaHoy <= 0) return [];
  return acumulado.slice(0, Math.min(diaHoy, acumulado.length));
}

const SYNC = {
  tx: SOURCES.discord_transcripts.lastSyncAt ?? new Date().toISOString(),
  crm: SOURCES.discord_crm.lastSyncAt ?? '2026-08-29T18:40:00-03:00',
  ads: SOURCES.ads_manager.lastSyncAt ?? '2026-08-31T07:15:00-03:00',
  cal: SOURCES.calendly.lastSyncAt ?? '2026-08-31T08:02:00-03:00',
  man: '2026-08-31T09:30:00-03:00',
};

/* ---------------------------------------------------------------- clientes */

/** Cartera real: un canal de Discord (boost/advantage/avanzados/principiantes) = un cliente. */
async function cargarCarteraDiscord() {
  return pedir('/api/clientes');
}

function notaPorCategoria(por) {
  const p = por ?? {};
  const partes = [
    p.boost != null ? `${p.boost} Boost` : null,
    p.advantage != null ? `${p.advantage} Advantage` : null,
    p.avanzados != null ? `${p.avanzados} Avanzados` : null,
    p.principiantes != null ? `${p.principiantes} Principiantes` : null,
    p.mentoria != null ? `${p.mentoria} Mentoría (legacy)` : null,
  ].filter(Boolean);
  return partes.length ? `${partes.join(' · ')}. Salen de Discord.` : 'Canales de Discord.';
}

export async function getClientes() {
  const cartera = await cargarCarteraDiscord();
  const activos = cartera.clientes.filter((c) => c.estado === 'activo');
  const ahoraIso = ahora().toISOString();

  /** @type {Metric[]} */
  const kpis = [
    {
      id: 'clientes_activos',
      label: 'Clientes activos',
      value: activos.length,
      format: 'count',
      previous: null,
      sourceId: 'discord_transcripts',
      updatedAt: ahoraIso,
      nota: notaPorCategoria(cartera.resumen.por_categoria),
    },
    {
      id: 'pct_activados',
      detalle: detalleDe(activos.filter((c) => c.activacion?.activado), (c) => (c.activacion?.primerResultadoAt ? formatFecha(c.activacion.primerResultadoAt) : null), () => 'ok', 'Clientes con resultado detectado en el canal.'),
      label: 'Con win en el canal',
      value: activos.length
        ? (activos.filter((c) => c.activacion?.activado).length / activos.length) * 100
        : 0,
      format: 'pct',
      previous: null,
      sourceId: 'discord_transcripts',
      updatedAt: ahoraIso,
      nota: 'Heurística sobre el transcript (venta/cierre/cobro).',
    },
    {
      id: 'canales_con_mensajes',
      label: 'Mensajes en transcripts',
      value: cartera.resumen.mensajes,
      format: 'count',
      previous: null,
      sourceId: 'discord_transcripts',
      updatedAt: ahoraIso,
      nota: cartera.base_disponible
        ? 'Suma de los .txt que escribe el bot.'
        : 'No se encontró el directorio de transcripts.',
    },
    {
      id: 'silencio_7d',
      detalle: detalleDe(activos.filter((c) => c.engagement.diasSinMensaje >= 7).sort((a, b) => b.engagement.diasSinMensaje - a.engagement.diasSinMensaje), (c) => `${c.engagement.diasSinMensaje} d sin mensaje`, (c) => (c.engagement.diasSinMensaje >= 14 ? 'alert' : 'warn'), 'Canales sin mensaje del cliente hace 7 días o más.'),
      label: 'En silencio ≥ 7 días',
      value: activos.filter((c) => c.engagement.diasSinMensaje >= 7).length,
      format: 'count',
      previous: null,
      sourceId: 'discord_transcripts',
      updatedAt: ahoraIso,
      good: 'down',
    },
  ];

  return {
    clientes: cartera.clientes,
    coaches: cartera.coaches,
    actividad: cartera.actividad,
    semanas: cartera.semanas,
    resumen: cartera.resumen,
    kpis,
  };
}


/* ------------------------------------------------------------- fulfillment */

/** Mediana de una lista de números (ignora null/undefined). */
function mediana(xs) {
  const vals = xs.filter((x) => x != null && !Number.isNaN(x));
  if (!vals.length) return 0;
  const o = [...vals].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

function clientesConSalud(clientes) {
  return clientes.map((c) => ({ ...c, salud: calcularSalud(c) }));
}

/** Cohortes por mes de entrada: cuántos ya salieron de onboarding (≥31 d). */
function cohortesOnboarding(clientes, hoy) {
  /** @type {Record<string, { mes: string, entraron: number, salieron: number, dias: number[] }>} */
  const porMes = {};
  for (const c of clientes) {
    const mes = (c.entradaAt ?? '').slice(0, 7);
    if (!mes) continue;
    if (!porMes[mes]) porMes[mes] = { mes, entraron: 0, salieron: 0, dias: [] };
    porMes[mes].entraron += 1;
    const dias = c.onboarding?.dias ?? diasEntre(c.entradaAt, hoy);
    if (dias >= VENTANA_ONBOARDING) {
      porMes[mes].salieron += 1;
      porMes[mes].dias.push(VENTANA_ONBOARDING);
    } else {
      porMes[mes].dias.push(dias);
    }
  }
  return Object.values(porMes)
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((c) => ({
      mes: c.mes,
      entraron: c.entraron,
      salieron: c.salieron,
      activados30: c.salieron, // compat con pantallas viejas
      medianaDias: c.dias.length ? mediana(c.dias) : 0,
    }));
}

/**
 * Reloj de onboarding: arranca en la entrada al canal y dura 31 días.
 * @param {object} c
 * @param {string} hoy
 */
function conOnboarding(c, hoy) {
  const dias = c.entradaAt ? diasEntre(c.entradaAt, hoy) : 0;
  const enFase = dias < VENTANA_ONBOARDING;
  return {
    ...c,
    onboardingDias: enFase ? dias : VENTANA_ONBOARDING,
    onboarding: {
      inicioAt: c.entradaAt,
      dias,
      enFase,
      salio: !enFase,
      diasRestantes: Math.max(0, VENTANA_ONBOARDING - dias),
    },
  };
}

/** Señales derivadas del canal (sin clasificador NLP todavía). */
function senalesDesdeActivos(activos) {
  return activos
    .filter((c) => c.engagement.diasSinMensaje >= 7)
    .sort((a, b) => b.engagement.diasSinMensaje - a.engagement.diasSinMensaje)
    .map((c) => ({
      id: `silencio_${c.id}`,
      clienteId: c.id,
      tipo: 'silencio',
      peso: 'negativa',
      extracto: `${c.nombre} lleva ${c.engagement.diasSinMensaje} días sin escribir en #${c.canal ?? c.id}.`,
      fechaAt: c.ultimaActividadAt ?? ahora().toISOString(),
    }));
}

function metricasCoaches(clientes, coaches) {
  return coaches.map((coach) => {
    const suyos = clientes.filter((c) => c.coachId === coach.id && c.estado === 'activo');
    const activados = suyos.filter((c) => c.activacion.activado);
    const enVentana = activados.filter((c) => (c.activacion.diasHastaResultado ?? 99) <= 30);
    const elegibles = suyos.filter(
      (c) => c.activacion.activado || diasEntre(c.entradaAt, ahora().toISOString()) > 30,
    );

    return {
      ...coach,
      clientes: suyos.length,
      mrrGestionadoUsd: null,
      scorePromedio: suyos.length ? Math.round(suyos.reduce((s, c) => s + c.salud.score, 0) / suyos.length) : 0,
      respuestaHs: mediana(suyos.map((c) => c.engagement.respuestaCoachHs)),
      activacion30: elegibles.length ? (enVentana.length / elegibles.length) * 100 : 0,
      medianaActivacionDias: mediana(activados.map((c) => c.activacion.diasHastaResultado ?? 0)),
      semaforo: {
        verde: suyos.filter((c) => c.salud.semaforo === 'verde').length,
        amarillo: suyos.filter((c) => c.salud.semaforo === 'amarillo').length,
        rojo: suyos.filter((c) => c.salud.semaforo === 'rojo').length,
      },
      mensajesCoachSemana: suyos.reduce((s, c) => s + c.engagement.mensajesCoachSemana, 0),
    };
  });
}


/**
 * Lista de canales detrás de un número, para que cualquier KPI pueda mostrar
 * de dónde sale. @param {any[]} clientes @param {(c: any) => string | null} [valor] @param {(c: any) => string} [tono]
 */
function detalleDe(clientes, valor, tono, titulo) {
  return {
    titulo,
    items: clientes.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      canalId: c.canalId,
      categoria: c.categoria,
      valor: valor ? valor(c) : null,
      tono: tono ? tono(c) : 'plain',
    })),
  };
}

const tonoSemaforo = (c) => (c.salud?.semaforo === 'verde' ? 'ok' : c.salud?.semaforo === 'amarillo' ? 'warn' : 'alert');

export async function getFulfillment() {
  const cartera = await cargarCarteraDiscord();
  const hoy = ahora().toISOString();
  const computedAt = hoy;
  const clientes = clientesConSalud(cartera.clientes).map((c) => conOnboarding(c, hoy));
  const activos = clientes.filter((c) => c.estado === 'activo');

  const enOnboarding = activos.filter((c) => c.onboarding.enFase);
  const salieronOnboarding = activos.filter((c) => c.onboarding.salio);
  const porCompletar = enOnboarding.filter((c) => c.onboarding.diasRestantes <= 7);
  const medianaDiaOnb = mediana(enOnboarding.map((c) => c.onboarding.dias));
  const pctEnOnboarding = activos.length ? (enOnboarding.length / activos.length) * 100 : 0;

  const elegibles = activos.filter(
    (c) => c.activacion.activado || diasEntre(c.entradaAt, hoy) > 30,
  );
  const activadosEnVentana = elegibles.filter(
    (c) => c.activacion.activado && (c.activacion.diasHastaResultado ?? 99) <= 30,
  );
  const sinActivar = activos.filter((c) => !c.activacion.activado);
  const medianaActivacion = mediana(
    activos.filter((c) => c.activacion.activado).map((c) => c.activacion.diasHastaResultado ?? 0),
  );

  const verdes = activos.filter((c) => c.salud.semaforo === 'verde');
  const rojos = activos.filter((c) => c.salud.semaforo === 'rojo');
  const amarillos = activos.filter((c) => c.salud.semaforo === 'amarillo');
  const mixGlobal = ['implementacion', 'soporte', 'queja', 'celebracion'].reduce((acc, k) => {
    acc[k] = 0;
    return acc;
  }, {});
  const mixDisponible = activos.some((c) => !c.engagement.mixPendiente && Object.values(c.engagement.mix ?? {}).some((v) => v > 0));
  if (mixDisponible) {
    for (const k of Object.keys(mixGlobal)) {
      mixGlobal[k] = Math.round(activos.reduce((s, c) => s + (c.engagement.mix?.[k] ?? 0), 0) / activos.length);
    }
  }

  const coaches = metricasCoaches(clientes, cartera.coaches);

  const silencio = activos.filter((c) => c.engagement.diasSinMensaje >= 7);
  const caidaFuerte = activos.filter((c) => (c.engagement.tendencia ?? 0) <= -30);
  const sinActivarFuera = activos.filter(
    (c) => !c.activacion.activado && diasEntre(c.entradaAt, hoy) > 30,
  );
  const churnIntent = activos.filter((c) => c.churnIntent?.detectado);
  const enRiesgo = activos.filter((c) => c.salud.semaforo !== 'verde');
  const activados = activos.filter((c) => c.activacion.activado);
  const winsRecientes = activados.filter((c) => {
    const at = c.activacion.primerResultadoAt;
    if (!at) return false;
    return diasEntre(at, hoy) <= 30;
  });
  const momentumPos = activos.filter((c) => (c.engagement.tendencia ?? 0) >= 20);
  const candidatos = activos.filter((c) => c.expansion?.candidatoUpsell);
  const pctQueja = mixDisponible ? (mixGlobal.queja ?? 0) : null;

  // Ficha viva de Claude (cerebro): fases, riesgo y wins con fecha.
  const conFicha = activos.filter((c) => c.ficha);
  const fases = (cartera.fases ?? []).map((f) => ({
    ...f,
    clientes: activos.filter((c) => c.fase?.id === f.id),
  }));
  const sinFase = activos.filter((c) => !c.fase);
  const riesgoAlto = conFicha.filter((c) => c.ficha.riesgo === 'alto').sort((a, b) => a.salud.score - b.salud.score);
  const riesgoMedio = conFicha.filter((c) => c.ficha.riesgo === 'medio');
  const winsIA = conFicha
    .flatMap((c) => (c.ficha.wins ?? []).map((w) => ({ ...w, clienteId: c.id, nombre: c.nombre, canal: c.canal, categoria: c.categoria })))
    .filter((w) => w.fecha && diasEntre(w.fecha, hoy) <= 30)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  /** @type {Record<string, import('./types.js').Metric[]>} */
  const kpis = {
    onboarding: [
      {
        id: 'en_onboarding',
        detalle: detalleDe(
          [...enOnboarding].sort((a, b) => b.onboarding.dias - a.onboarding.dias),
          (c) => `día ${c.onboarding.dias}/${VENTANA_ONBOARDING}`,
          (c) => (c.onboarding.diasRestantes <= 7 ? 'warn' : 'ok'),
          `Clientes en fase onboarding (día 0–${VENTANA_ONBOARDING - 1}).`,
        ),
        label: 'En onboarding',
        value: enOnboarding.length,
        format: 'count',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        objetivo: null,
        nota: `${enOnboarding.length} de ${activos.length} activos · ${formatValue(pctEnOnboarding, 'pct')} de la cartera`,
      },
      {
        id: 'dia_mediano_onboarding',
        detalle: detalleDe(
          [...enOnboarding].sort((a, b) => a.onboarding.dias - b.onboarding.dias),
          (c) => `día ${c.onboarding.dias}`,
          (c) => (c.onboarding.dias >= 21 ? 'warn' : 'ok'),
          'Día actual dentro de la ventana de 31 días.',
        ),
        label: 'Día mediano en la fase',
        value: medianaDiaOnb,
        format: 'days',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        good: 'down',
        objetivo: Math.floor(VENTANA_ONBOARDING / 2),
        nota: `Reloj desde la entrada al canal · salen al día ${VENTANA_ONBOARDING}.`,
      },
      {
        id: 'por_salir_onboarding',
        detalle: detalleDe(
          [...porCompletar].sort((a, b) => a.onboarding.diasRestantes - b.onboarding.diasRestantes),
          (c) => `${c.onboarding.diasRestantes} d restantes`,
          () => 'warn',
          `Quedan ≤7 días para salir de onboarding.`,
        ),
        label: 'Por salir (≤7 d)',
        value: porCompletar.length,
        format: 'count',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        good: 'down',
        objetivo: 0,
        nota: `Dentro de la última semana de la ventana de ${VENTANA_ONBOARDING} días.`,
      },
    ],
    activacion: [
      {
        id: 'activacion_30d',
        detalle: detalleDe(activadosEnVentana, (c) => `${c.activacion.diasHastaResultado ?? '?'} d`, () => 'ok', 'Clientes con win detectado dentro de los 30 días de entrada.'),
        label: 'Activados en 30 días',
        value: elegibles.length ? (activadosEnVentana.length / elegibles.length) * 100 : 0,
        format: 'pct',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        objetivo: 85,
        nota: `${activadosEnVentana.length} de ${elegibles.length || 0} elegibles · win en el transcript.`,
      },
      {
        id: 'tiempo_primer_resultado',
        detalle: detalleDe([...activados].sort((a, b) => (a.activacion.diasHastaResultado ?? 0) - (b.activacion.diasHastaResultado ?? 0)), (c) => `${c.activacion.diasHastaResultado ?? '?'} d`, (c) => ((c.activacion.diasHastaResultado ?? 99) <= 14 ? 'ok' : 'warn'), 'Días desde el primer mensaje del canal hasta el primer resultado.'),
        label: 'Mediana hasta primer resultado',
        value: medianaActivacion,
        format: 'days',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        good: 'down',
        objetivo: 14,
        nota: 'Días desde el primer mensaje del canal hasta el win detectado.',
      },
      {
        id: 'sin_activar',
        detalle: detalleDe([...sinActivar].sort((a, b) => diasEntre(a.entradaAt, hoy) - diasEntre(b.entradaAt, hoy)).reverse(), (c) => `${diasEntre(c.entradaAt, hoy)} d en el programa`, (c) => (diasEntre(c.entradaAt, hoy) > 30 ? 'alert' : 'warn'), 'Sin frase de resultado (venta / cierre / cobro) en el canal.'),
        label: 'Sin activar',
        value: sinActivar.length,
        format: 'count',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        good: 'down',
        objetivo: 0,
        nota: 'Sin frase de resultado (venta/cierre/cobro) en el canal todavía.',
      },
    ],
    engagement: [
      {
        id: 'score_verde',
        detalle: detalleDe([...verdes].sort((a, b) => b.salud.score - a.salud.score), (c) => `score ${c.salud.score}`, () => 'ok', 'Clientes con score de salud en verde.'),
        label: 'Clientes en verde',
        value: activos.length ? (verdes.length / activos.length) * 100 : 0,
        format: 'pct',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        objetivo: 80,
        nota: `${verdes.length} verdes · ${amarillos.length} en atención · ${rojos.length} en riesgo.`,
      },
      {
        id: 'mensajes_semana',
        detalle: detalleDe([...activos].sort((a, b) => b.engagement.mensajesClienteSemana - a.engagement.mensajesClienteSemana), (c) => `${formatValue(c.engagement.mensajesClienteSemana, 'ratio')}/sem`, (c) => (c.engagement.mensajesClienteSemana >= 2 ? 'ok' : c.engagement.mensajesClienteSemana > 0 ? 'warn' : 'alert'), 'Mensajes del cliente por semana, últimas 4 semanas.'),
        label: 'Mensajes del cliente / semana',
        value: activos.length
          ? activos.reduce((s, c) => s + c.engagement.mensajesClienteSemana, 0) / activos.length
          : 0,
        format: 'ratio',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        nota: 'Promedio de la cartera en las últimas 4 semanas del transcript.',
      },
      {
        id: 'silencio_7d',
        detalle: detalleDe([...silencio].sort((a, b) => b.engagement.diasSinMensaje - a.engagement.diasSinMensaje), (c) => `${c.engagement.diasSinMensaje} d sin mensaje`, (c) => (c.engagement.diasSinMensaje >= 14 ? 'alert' : 'warn'), 'Canales sin mensaje del cliente hace 7 días o más.'),
        label: 'Silencio ≥ 7 días',
        value: silencio.length,
        format: 'count',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        good: 'down',
        nota: silencio.slice(0, 4).map((c) => c.nombre).join(' · ') || 'Ninguno.',
      },
      {
        id: 'mix_queja',
        detalle: detalleDe([...activos].filter((c) => (c.engagement.mix?.queja ?? 0) > 0).sort((a, b) => (b.engagement.mix?.queja ?? 0) - (a.engagement.mix?.queja ?? 0)), (c) => `${c.engagement.mix?.queja ?? 0}% queja`, (c) => ((c.engagement.mix?.queja ?? 0) >= 30 ? 'alert' : 'warn'), 'Canales con mensajes de queja en el mix de conversación.'),
        label: 'Queja en el mix',
        value: pctQueja ?? 0,
        format: 'pct',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        good: 'down',
        nota: mixDisponible
          ? `Promedio cartera · implementación ${mixGlobal.implementacion}% · celebración ${mixGlobal.celebracion}%.`
          : 'Aún no hay mensajes etiquetables en mix.',
      },
    ],
    retencion: [
      {
        id: 'en_riesgo',
        detalle: detalleDe([...enRiesgo].sort((a, b) => a.salud.score - b.salud.score), (c) => `score ${c.salud.score}`, tonoSemaforo, 'Clientes fuera de verde, peor score primero.'),
        label: 'Fuera de verde',
        value: activos.length ? (enRiesgo.length / activos.length) * 100 : 0,
        format: 'pct',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        good: 'down',
        objetivo: 20,
        nota: `${enRiesgo.length} canales · ${rojos.length} rojos · ${amarillos.length} amarillos.`,
      },
      {
        id: 'silencio_retencion',
        detalle: detalleDe([...silencio].sort((a, b) => b.engagement.diasSinMensaje - a.engagement.diasSinMensaje), (c) => `${c.engagement.diasSinMensaje} d`, (c) => (c.engagement.diasSinMensaje >= 14 ? 'alert' : 'warn')),
        label: 'Silencio ≥ 7 días',
        value: silencio.length,
        format: 'count',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        good: 'down',
        nota: 'Señal dura de churn anunciado desde el canal.',
      },
      {
        id: 'sin_activar_fuera',
        detalle: detalleDe([...sinActivarFuera].sort((a, b) => diasEntre(b.entradaAt, hoy) - diasEntre(a.entradaAt, hoy)), (c) => `${diasEntre(c.entradaAt, hoy)} d sin win`, () => 'alert', 'Pasaron la ventana de 30 días sin resultado detectable.'),
        label: 'Sin activar (>30d)',
        value: sinActivarFuera.length,
        format: 'count',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        good: 'down',
        nota: 'Pasaron la ventana sin win detectable.',
      },
      {
        id: 'intencion_baja',
        detalle: detalleDe(churnIntent, (c) => (c.churnIntent?.extracto ? c.churnIntent.extracto.slice(0, 60) : 'intención de baja'), () => 'alert', 'Frases de reembolso / baja en mensajes recientes.'),
        label: 'Intención de baja',
        value: churnIntent.length,
        format: 'count',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        good: 'down',
        nota: churnIntent.length
          ? churnIntent.slice(0, 3).map((c) => c.nombre).join(' · ')
          : 'Sin frases de reembolso / baja en mensajes recientes.',
      },
    ],
    outcomes: [
      {
        id: 'pct_activados',
        detalle: detalleDe([...activados].sort((a, b) => (b.activacion.primerResultadoAt ?? '').localeCompare(a.activacion.primerResultadoAt ?? '')), (c) => (c.activacion.primerResultadoAt ? formatFecha(c.activacion.primerResultadoAt) : null), () => 'ok', 'Clientes con resultado detectado en el canal.'),
        label: 'Con win en el canal',
        value: activos.length ? (activados.length / activos.length) * 100 : 0,
        format: 'pct',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        objetivo: 70,
        nota: `${activados.length} de ${activos.length} con resultado detectado.`,
      },
      {
        id: 'wins_30d',
        detalle: detalleDe(winsRecientes, (c) => (c.activacion.primerResultadoAt ? formatFecha(c.activacion.primerResultadoAt) : null), () => 'ok', 'Primer resultado detectado en los últimos 30 días.'),
        label: 'Wins últimos 30 días',
        value: winsRecientes.length,
        format: 'count',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        nota: 'Primer resultado detectado en la ventana móvil de 30 días.',
      },
      {
        id: 'momentum_positivo',
        detalle: detalleDe([...momentumPos].sort((a, b) => (b.engagement.tendencia ?? 0) - (a.engagement.tendencia ?? 0)), (c) => `+${Math.round(c.engagement.tendencia ?? 0)}%`, () => 'ok', 'Tendencia de actividad ≥ +20% vs semanas previas.'),
        label: 'Momentum positivo',
        value: activos.length ? (momentumPos.length / activos.length) * 100 : 0,
        format: 'pct',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        nota: `${momentumPos.length} canales con tendencia ≥ +20%.`,
      },
    ],
    expansion: [
      {
        id: 'candidatos_upsell',
        detalle: detalleDe(candidatos, (c) => 'señal de techo', () => 'ok', 'Señal léxica de techo / siguiente nivel en el canal.'),
        label: 'Candidatos a upsell',
        value: candidatos.length,
        format: 'count',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        nota: 'Señal léxica de techo / siguiente nivel en el canal.',
      },
      {
        id: 'caida_actividad',
        detalle: detalleDe([...caidaFuerte].sort((a, b) => (a.engagement.tendencia ?? 0) - (b.engagement.tendencia ?? 0)), (c) => `${Math.round(c.engagement.tendencia ?? 0)}%`, () => 'alert', 'Tendencia ≤ −30% vs semanas previas.'),
        label: 'Caída fuerte de actividad',
        value: caidaFuerte.length,
        format: 'count',
        previous: null,
        sourceId: 'discord_transcripts',
        updatedAt: computedAt,
        good: 'down',
        nota: 'Tendencia ≤ −30% vs semanas previas.',
      },
    ],
  };

  const senales = senalesDesdeActivos(activos);
  for (const c of churnIntent) {
    senales.unshift({
      id: `churn_${c.id}`,
      clienteId: c.id,
      tipo: 'queja',
      peso: 'negativa',
      extracto: c.churnIntent.extracto || `${c.nombre}: intención de baja/reembolso.`,
      fechaAt: c.churnIntent.fechaAt ?? c.ultimaActividadAt ?? computedAt,
    });
  }
  for (const c of winsRecientes) {
    senales.push({
      id: `win_${c.id}`,
      clienteId: c.id,
      tipo: 'primer_resultado',
      peso: 'positiva',
      extracto: c.activacion?.descripcion || `${c.nombre}: primer resultado.`,
      fechaAt: c.activacion?.primerResultadoAt ?? c.ultimaActividadAt ?? computedAt,
    });
  }
  for (const c of candidatos.slice(0, 8)) {
    senales.push({
      id: `upsell_${c.id}`,
      clienteId: c.id,
      tipo: 'senal_upsell',
      peso: 'positiva',
      extracto: c.expansion?.motivo || `${c.nombre}: señal de upsell.`,
      fechaAt: c.ultimaActividadAt ?? computedAt,
    });
  }

  const ultimoMensajeAt =
    activos
      .map((c) => c.ultimaActividadAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? hoy;

  return {
    clientes,
    activos,
    coaches,
    actividad: cartera.actividad,
    semanas: cartera.semanas,
    senales,
    nrr: [],
    cohortes: cohortesOnboarding(clientes, hoy),
    blockers: {},
    candidatos,
    sinActivar,
    enOnboarding,
    salieronOnboarding,
    porCompletarOnboarding: porCompletar,
    silencio,
    caidaFuerte,
    sinActivarFuera,
    churnIntent,
    winsRecientes,
    momentumPos,
    fases,
    sinFase,
    conFicha,
    riesgoAlto,
    riesgoMedio,
    winsIA,
    kpis,
    mixGlobal,
    mixDisponible,
    syncAt: ultimoMensajeAt,
    resumen: cartera.resumen,
    semaforoTotales: {
      verde: verdes.length,
      amarillo: amarillos.length,
      rojo: rojos.length,
    },
    revision: [
      silencio.length
        ? `${silencio.length} canales con ≥7 días sin mensaje del cliente.`
        : 'Ningún cliente con silencio largo esta semana.',
      `${activos.length} canales de cliente leídos desde Discord (${cartera.resumen.mensajes} mensajes).`,
      churnIntent.length ? `${churnIntent.length} con intención de baja/reembolso en el texto.` : null,
    ].filter(Boolean),
  };
}

/**
 * Ficha completa de un cliente: su score con el desglose, su serie semanal y
 * las señales que salieron de su canal.
 * @param {string} clienteId
 */
export async function getFulfillmentCliente(clienteId) {
  const data = await pedir(`/api/clientes/${encodeURIComponent(clienteId)}`);
  const cliente = conOnboarding({ ...data.cliente, salud: calcularSalud(data.cliente) }, ahora().toISOString());
  const senales =
    data.senales?.length
      ? data.senales
      : senalesDesdeActivos([cliente]).filter((s) => s.clienteId === cliente.id);
  if (cliente.churnIntent?.detectado) {
    senales.unshift({
      id: `churn_${cliente.id}`,
      clienteId: cliente.id,
      tipo: 'queja',
      peso: 'negativa',
      extracto: cliente.churnIntent.extracto,
      fechaAt: cliente.churnIntent.fechaAt ?? cliente.ultimaActividadAt,
    });
  }
  const blockerId = cliente.activacion?.blocker;
  const blocker = blockerId && BLOCKERS[blockerId]
    ? { id: blockerId, ...BLOCKERS[blockerId] }
    : null;
  return {
    cliente,
    coach: data.coach,
    datos: data.datos ?? null,
    eventos: data.eventos ?? [],
    actividad: data.actividad,
    actividadDiaria: data.actividadDiaria ?? [],
    senales,
    blocker,
    semaforo: SEMAFORO[cliente.salud.semaforo],
  };
}

/* ------------------------------------------------------------------ ventas */

/** Métricas reales del CRM de Marketing (leads, llamadas, cierres, reportes diarios). */
export async function getVentasReal(mes, { refrescar = false } = {}) {
  const q = new URLSearchParams();
  if (mes) q.set('mes', mes);
  if (refrescar) q.set('refrescar', 'true');
  return pedir(`/api/ventas${q.toString() ? `?${q}` : ''}`);
}

/** Meta del mes: el decreto que carga el equipo; si no hay, los objetivos por defecto. */
function metaDelMes(mes) {
  const guardado = leerDecretoGuardado?.(mes) ?? null;
  if (!guardado) return { ...OPS_VENTAS_META, fuente: 'default' };
  return {
    conversaciones: guardado.conversaciones ?? OPS_VENTAS_META.conversaciones,
    aplicaciones: guardado.aplicaciones ?? OPS_VENTAS_META.aplicaciones,
    agendas: guardado.agendas ?? OPS_VENTAS_META.agendas,
    shows: guardado.shows ?? OPS_VENTAS_META.shows,
    cierres: guardado.cierres ?? OPS_VENTAS_META.cierres,
    cashUsd: guardado.cashMeta ?? OPS_VENTAS_META.cashUsd,
    showRate: guardado.showRate ?? OPS_VENTAS_META.showRate,
    closeRate: guardado.closeRate ?? OPS_VENTAS_META.closeRate,
    averageSaleUsd: guardado.averageSaleUsd ?? OPS_VENTAS_META.averageSaleUsd,
    fuente: 'decreto',
  };
}

/** Feed del día armado con lo que pasó de verdad en el CRM. */
function actividadDesdeCrm(real) {
  const eventos = [];
  for (const c of real.cierresRecientes ?? []) {
    eventos.push({
      id: `cierre_${c.id}`, tipo: 'cierre', at: c.fechaAt,
      texto: `${c.prospecto} cerró${c.montoUsd ? ` ${formatValue(c.montoUsd, 'usd')}` : ''} con ${c.closer}`,
    });
  }
  for (const l of real.sinReportar ?? []) {
    eventos.push({
      id: `pend_${l.id}`, tipo: 'sin_reporte', at: l.fechaAt,
      texto: `${l.prospecto} · llamada de ${l.closer} sin reporte hace ${l.diasDesde} d`,
    });
  }
  for (const l of real.seguimientos ?? []) {
    eventos.push({ id: `seg_${l.id}`, tipo: 'seguimiento', at: l.fechaAt, texto: `${l.prospecto} quedó en seguimiento con ${l.closer}` });
  }
  return eventos.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, 40);
}

export async function getVentas(mes) {
  const real = await getVentasReal(mes);
  const { actual, previo, semanas, contexto } = real;
  const meta = metaDelMes(real.mes);

  const serie = (campo) => semanas.map((s) => s[campo] ?? 0);
  const kpi = (id, label, value, previous, format, objetivo, campoSerie, nota, sourceId = 'manual') => ({
    id, label, value: value ?? 0, format, previous: previous ?? null, objetivo,
    serie: serie(campoSerie), sourceId, updatedAt: real.generadoAt, nota,
  });

  const kpis = [
    kpi('show_rate', 'Show rate', actual.showRate, previo.showRate, 'pct', meta.showRate, 'showRate',
      'Llamadas con resultado cargado sobre las que ya pasaron.', 'calendly'),
    kpi('close_rate', 'Close rate', actual.closeRate, previo.closeRate, 'pct', meta.closeRate, 'closeRate',
      'Cierres sobre llamadas con show.'),
    kpi('cash_collected', 'Cash collected', actual.cashUsd, previo.cashUsd, 'usd', meta.cashUsd, 'cashUsd',
      `Cobrado en el mes. Pendiente de cobro: ${formatValue(actual.deudaUsd, 'usd')}.`),
    kpi('average_sale', 'Average sale', actual.averageSaleUsd, previo.averageSaleUsd, 'usd', meta.averageSaleUsd, 'averageSaleUsd',
      'Ticket promedio de los cierres del mes.'),
  ];

  const perfClosers = (real.porCloser ?? []).map((c) => ({
    id: c.nombre, nombre: c.nombre, llamadas: c.agendados, shows: c.shows, cierres: c.cierres,
    cashUsd: c.cashUsd, noShows: c.noShows, sinReportar: c.sinReportar,
    closeRate: c.closeRate ?? 0, showRate: c.showRate ?? 0,
    averageSaleUsd: c.averageSaleUsd, promedioVentaUsd: c.averageSaleUsd,
  }));
  const perfSetters = (real.settersMes ?? []).map((s) => ({
    id: s.nombre, nombre: s.nombre, conversaciones: s.conversaciones, aplicaciones: s.links_enviados,
    agendadas: s.agendas, seguimientos: s.seguimientos, reportes: s.reportes,
    tasaApp: s.conversaciones ? (s.links_enviados / s.conversaciones) * 100 : 0,
    tasaAgendado: s.links_enviados ? (s.agendas / s.links_enviados) * 100 : 0,
  }));

  const fraccion = contexto.diaHoy / contexto.diasMes;
  const proyectado = fraccion > 0 ? actual.cashUsd / fraccion : actual.cashUsd;
  const gap = meta.cashUsd - actual.cashUsd;
  const pctMeta = meta.cashUsd ? (actual.cashUsd / meta.cashUsd) * 100 : 0;
  const pctRitmoEsperado = fraccion * 100;
  let proyeccionEstado = 'en_camino';
  if (pctMeta < pctRitmoEsperado - 15) proyeccionEstado = 'critico';
  else if (pctMeta < pctRitmoEsperado - 5) proyeccionEstado = 'atencion';

  return {
    real,
    semanas: semanas.map((s) => ({ ...s, semana: s.label, desdeAt: `${s.semana}T00:00:00-03:00` })),
    llamados: real.proximas ?? [],
    closers: (real.equipo ?? []).filter((m) => m.rol === 'closer'),
    setters: (real.equipo ?? []).filter((m) => m.rol === 'setter'),
    reportesClosers: (real.reportesClosers ?? []).map((r) => ({
      ...r,
      metricas: {
        llamadas: r.metricas?.llamadas_agendadas ?? 0,
        shows: r.metricas?.shows ?? 0,
        cierres: r.metricas?.cierres ?? 0,
        cashUsd: r.metricas?.ingreso ?? 0,
      },
    })),
    reportesSetters: (real.reportesSetters ?? []).map((r) => ({
      ...r,
      metricas: {
        conversaciones: r.metricas?.conversaciones ?? 0,
        aplicaciones: r.metricas?.links_enviados ?? 0,
        agendadas: r.metricas?.agendas ?? 0,
      },
    })),
    actividad: actividadDesdeCrm(real),
    followUps: (real.seguimientos ?? []).map((l) => ({
      id: l.id, prospecto: l.prospecto, closer: l.closer,
      diasSinContacto: l.diasDesde ?? 0, ultimoContactoAt: l.fechaAt,
      proximoPaso: l.notas ? l.notas.slice(0, 90) : 'Seguimiento sin nota cargada',
    })),
    sinReportar: real.sinReportar ?? [],
    perfClosers,
    perfSetters,
    metaMes: {
      mes: real.mes, diaHoy: contexto.diaHoy, diasMes: contexto.diasMes,
      revenueMetaUsd: meta.cashUsd, revenueActualUsd: actual.cashUsd,
      cierresMeta: meta.cierres, cierresActual: actual.cierres,
      gap, proyectado, pctMeta, pctRitmoEsperado, estado: proyeccionEstado, fuenteMeta: meta.fuente,
    },
    kpis,
    syncAt: real.generadoAt,
  };
}

/**
 * Vista OPS de Ventas: proyección vs meta, funnel math y salud de rates.
 * Para admin / operaciones / founder — no es el día a día del Director.
 * Todo sale del CRM real; la meta, del decreto del mes.
 */
export async function getVentasOps(mes) {
  const real = await getVentasReal(mes);
  const meta = metaDelMes(real.mes);
  const ctxMes = contextoDeMes(real.mes);
  const ctx = {
    mes: real.mes,
    nombreMes: ctxMes?.nombreMes ?? real.mes,
    diaHoy: real.contexto.diaHoy,
    diasMes: real.contexto.diasMes,
    syncAt: real.generadoAt,
  };
  const top = real.topFunnel ?? {};
  const actual = {
    chats: top.conversaciones ?? 0,
    conversaciones: top.conversaciones ?? 0,
    aplicaciones: top.links_enviados ?? 0,
    agendas: real.actual.agendados,
    shows: real.actual.shows,
    cierres: real.actual.cierres,
    cashUsd: real.actual.cashUsd,
  };
  const semanas = (real.semanas ?? []).map((s) => ({
    semana: s.label,
    showRate: s.showRate ?? 0,
    closeRate: s.closeRate ?? 0,
    averageSaleUsd: s.averageSaleUsd ?? 0,
  }));

  const fraccion = ctx.diaHoy / ctx.diasMes;
  const proyectado = fraccion > 0 ? (actual.cashUsd / ctx.diaHoy) * ctx.diasMes : actual.cashUsd;
  const gap = meta.cashUsd - actual.cashUsd;
  const pctMeta = meta.cashUsd ? (actual.cashUsd / meta.cashUsd) * 100 : 0;
  const pctRitmo = fraccion * 100;
  const ritmoActualSemana = ctx.diaHoy > 0 ? (actual.cashUsd / ctx.diaHoy) * 7 : 0;
  const ritmoNecesarioSemana = ((meta.cashUsd - actual.cashUsd) / Math.max(1, ctx.diasMes - ctx.diaHoy)) * 7;
  const probabilidad = Math.max(0, Math.min(100, meta.cashUsd ? (proyectado / meta.cashUsd) * 100 : 0));

  let estado = 'en_camino';
  if (pctMeta < pctRitmo - 15) estado = 'critico';
  else if (pctMeta < pctRitmo - 5) estado = 'atencion';

  const adelantoPct = pctMeta - pctRitmo;
  let insight = '';
  if (estado === 'en_camino' && adelantoPct >= 0) {
    insight = `Vamos ${Math.round(adelantoPct)}% adelantados al ritmo del mes; el ritmo actual nos lleva a ${formatValue(proyectado, 'usd')}.`;
  } else if (actual.conversaciones === 0) {
    insight = `Nadie cargó reportes de setting este mes, así que el techo del funnel no se puede medir. Con ${actual.agendas} llamadas agendadas y ${formatValue(actual.cashUsd, 'usd')} cobrados, el ritmo proyecta ${formatValue(proyectado, 'usd')}.`;
  } else {
    const convFaltan = Math.max(0, meta.conversaciones - actual.conversaciones);
    const semanasRest = Math.max(1, (ctx.diasMes - ctx.diaHoy) / 7);
    insight = `Necesitamos ${Math.ceil(convFaltan / semanasRest)} conversaciones más por semana para sostener el funnel hacia la meta de ${formatValue(meta.cashUsd, 'usd')}.`;
  }

  const etapa = (id, label, metaV, actualV, format = 'count') => {
    const gapE = metaV - actualV;
    const pct = metaV ? (actualV / metaV) * 100 : 0;
    const diasRest = Math.max(1, ctx.diasMes - ctx.diaHoy);
    let est = 'ok';
    if (pct < pctRitmo - 15) est = 'alert';
    else if (pct < pctRitmo - 5) est = 'warn';
    return { id, label, meta: metaV, actual: actualV, gap: gapE, pctCompletado: pct, ritmoSemana: Math.round(Math.max(0, (gapE / diasRest) * 7)), estado: est, format };
  };

  const funnel = [
    etapa('conversaciones', 'Conversaciones', meta.conversaciones, actual.conversaciones),
    etapa('aplicaciones', 'Links enviados', meta.aplicaciones, actual.aplicaciones),
    etapa('agendas', 'Llamadas agendadas', meta.agendas, actual.agendas),
    etapa('shows', 'Llamadas mostradas', meta.shows, actual.shows),
    etapa('cierres', 'Ventas cerradas', meta.cierres, actual.cierres),
    etapa('cash', 'Cash collected', meta.cashUsd, actual.cashUsd, 'usd'),
  ];

  const peor = [...funnel].sort((a, b) => a.pctCompletado - b.pctCompletado)[0];
  let diagnostico = '';
  if (real.actual.sinReportar > 0) {
    diagnostico = `Hay ${real.actual.sinReportar} llamadas del mes sin resultado cargado: hasta que se reporten, el show rate y el close rate quedan cortos. `;
  }
  if (peor?.id === 'conversaciones' && actual.conversaciones === 0) {
    diagnostico += 'No hay reportes de setting cargados este mes, así que el techo del funnel está a ciegas.';
  } else if (peor) {
    diagnostico += `El cuello de botella está en ${peor.label.toLowerCase()}: ${formatValue(peor.actual, peor.format)} de ${formatValue(peor.meta, peor.format)} (${formatValue(peor.pctCompletado, 'pct')} del mes).`;
  }

  const ult = semanas[semanas.length - 1] ?? { showRate: 0, closeRate: 0, averageSaleUsd: 0 };
  const prev = semanas[semanas.length - 2] ?? ult;
  const kpiEstado = (valor, objetivo, good = 'up') => {
    const ok = good === 'down' ? valor <= objetivo : valor >= objetivo;
    const cerca = good === 'down' ? valor <= objetivo * 1.1 : valor >= objetivo * 0.9;
    if (ok) return 'ok';
    if (cerca) return 'warn';
    return 'alert';
  };

  const kpis = [
    { id: 'show_rate', label: 'Show rate', value: ult.showRate, format: 'pct', previous: prev.showRate, objetivo: meta.showRate, serie: semanas.map((s) => s.showRate), estado: kpiEstado(ult.showRate, meta.showRate), sourceId: 'calendly', updatedAt: ctx.syncAt },
    { id: 'close_rate', label: 'Close rate', value: ult.closeRate, format: 'pct', previous: prev.closeRate, objetivo: meta.closeRate, serie: semanas.map((s) => s.closeRate), estado: kpiEstado(ult.closeRate, meta.closeRate), sourceId: 'manual', updatedAt: ctx.syncAt },
    { id: 'average_sale', label: 'Average sale', value: ult.averageSaleUsd, format: 'usd', previous: prev.averageSaleUsd, objetivo: meta.averageSaleUsd, serie: semanas.map((s) => s.averageSaleUsd), estado: kpiEstado(ult.averageSaleUsd, meta.averageSaleUsd), sourceId: 'manual', updatedAt: ctx.syncAt },
  ];

  const closeCaida = prev.closeRate - ult.closeRate;
  let alertaKpis = null;
  if (closeCaida >= 10) {
    const showsRestantes = Math.max(0, meta.shows - actual.shows);
    const impacto = showsRestantes * (closeCaida / 100) * (ult.averageSaleUsd || meta.averageSaleUsd);
    alertaKpis = `Close rate bajó de ${formatValue(prev.closeRate, 'pct')} a ${formatValue(ult.closeRate, 'pct')}, impacto estimado en meta: -${formatValue(impacto, 'usd')}.`;
  } else if (ult.showRate < meta.showRate - 10) {
    alertaKpis = `Show rate en ${formatValue(ult.showRate, 'pct')} vs meta ${formatValue(meta.showRate, 'pct')}. Revisar confirmación de agendas.`;
  }

  return {
    contexto: ctx,
    proyeccion: { metaUsd: meta.cashUsd, actualUsd: actual.cashUsd, gapUsd: gap, proyectadoUsd: proyectado, probabilidad, pctMeta, pctRitmo, ritmoActualSemana, ritmoNecesarioSemana, estado, insight },
    funnel,
    diagnostico,
    kpis,
    alertaKpis,
    chats: actual.chats,
    fuenteMeta: meta.fuente,
    real,
    syncAt: ctx.syncAt,
  };
}

export async function getFulfillmentOps() {
  const ctx = OPS_FF_CONTEXTO;
  const r = OPS_FF_RESUMEN;
  const exp = OPS_FF_EXPANSION;
  const salud = OPS_FF_SALUD;
  const cal = OPS_FF_CALIDAD;
  const programas = OPS_FF_PROGRAMAS;

  const gapCaja2 = exp.metaCaja2Usd - exp.caja2Usd;
  const pctCaja2 = exp.metaCaja2Usd ? (exp.caja2Usd / exp.metaCaja2Usd) * 100 : 0;
  let estadoCaja2 = 'ok';
  const ritmoEsperado = (ctx.diaHoy / ctx.diasMes) * 100;
  if (pctCaja2 < ritmoEsperado - 15) estadoCaja2 = 'alert';
  else if (pctCaja2 < ritmoEsperado - 5) estadoCaja2 = 'warn';

  const totalEstado = salud.vigentes + salud.proximosAVencer + salud.vencidos;
  const porEstado = [
    { id: 'vigentes', label: 'Vigentes', valor: salud.vigentes, pct: totalEstado ? (salud.vigentes / totalEstado) * 100 : 0, color: 'var(--ok)' },
    { id: 'proximos', label: 'Próximos a vencer', valor: salud.proximosAVencer, pct: totalEstado ? (salud.proximosAVencer / totalEstado) * 100 : 0, color: 'var(--warn)' },
    { id: 'vencidos', label: 'Vencidos', valor: salud.vencidos, pct: totalEstado ? (salud.vencidos / totalEstado) * 100 : 0, color: 'var(--brand-hi)' },
  ];

  const ratioWinsQuejas = cal.quejasMes ? cal.winsMes / cal.quejasMes : cal.winsMes;
  let alertaSalud = null;
  if (salud.vencenProximos7d >= 10) {
    alertaSalud = `${salud.vencenProximos7d} clientes vencen en los próximos 7 días · revenue en riesgo: ${formatValue(salud.revenueRiesgo7dUsd, 'usd')}.`;
  }

  return responder({
    contexto: ctx,
    resumen: {
      ...r,
      programas,
      deltaOnboarding: r.onboardingsMes - r.onboardingsMesAnterior,
      pctOnboarding: r.metaOnboarding ? (r.onboardingsMes / r.metaOnboarding) * 100 : 0,
    },
    expansion: {
      ...exp,
      gapCaja2,
      pctCaja2,
      estadoCaja2,
    },
    salud: {
      ...salud,
      porEstado,
      programas,
      alerta: alertaSalud,
    },
    calidad: {
      ...cal,
      ratioWinsQuejas,
      deltaQuejas: cal.quejasMes - cal.quejasMesAnterior,
      deltaWins: cal.winsMes - cal.winsMesAnterior,
    },
    syncAt: ctx.syncAt,
  });
}

/**
 * Dashboard personal del Closer: su día, sus números, follow-ups y dispositions.
 * Metas personales y de equipo salen de la proyección/decreto del mes.
 * Agenda vive en closerStore (mock en vivo) para dispositions + polling.
 */
export async function getCloserDashboard() {
  const ctx = CLOSER_CONTEXTO;
  const actual = CLOSER_ACTUAL;
  const semanas = CLOSER_SEMANAS;
  const cuotas = cuotasCloserDesdeProyeccion(ctx.mes);
  const meta = cuotas.personal;
  const agenda = getCloserAgenda();
  const hoyLlamadas = agenda
    .filter((l) => l.fechaAt.startsWith(ctx.hoyIso))
    .sort((a, b) => a.fechaAt.localeCompare(b.fechaAt));
  const resumenHoy = resumenCalendarioHoy(hoyLlamadas);

  const pctDe = (v, m) => (m ? (v / m) * 100 : 0);
  const estadoDe = (pct, ritmoEsperado) => {
    if (pct >= ritmoEsperado - 2) return 'ok';
    if (pct >= ritmoEsperado - 15) return 'warn';
    return 'alert';
  };
  const ritmoEsperado = (ctx.diaHoy / ctx.diasMes) * 100;

  // Show rate ATV: (calificados + descalificados + cerrados) / agendadas (incl. canceladas; excl. reagendadas)
  const showRate = calcularShowRate(agenda);
  const closeRate = calcularCloseRate(agenda);
  const showsMes = agenda.filter(esShow).length || actual.shows;
  const cierresMes = agenda.filter((l) => l.estado === 'cerrado').length || actual.cierres;
  const cashMes =
    agenda.reduce((s, l) => s + (l.estado === 'cerrado' && l.montoUsd ? Number(l.montoUsd) : 0), 0) ||
    actual.cashUsd;

  const valShows = Math.max(actual.shows, showsMes);
  const valCierres = Math.max(actual.cierres, cierresMes);
  const valCash = Math.max(actual.cashUsd, cashMes);

  const kpis = [
    {
      id: 'llamadas',
      label: 'Llamadas hechas',
      value: actual.llamadas,
      meta: meta.llamadas,
      varianza: actual.llamadas - meta.llamadas,
      format: 'count',
      pct: pctDe(actual.llamadas, meta.llamadas),
      estado: estadoDe(pctDe(actual.llamadas, meta.llamadas), ritmoEsperado),
      serie: semanas.map((s) => s.llamadas),
      previous: semanas[semanas.length - 2]?.llamadas ?? null,
    },
    {
      id: 'shows',
      label: 'Shows',
      value: valShows,
      meta: meta.shows,
      varianza: valShows - meta.shows,
      format: 'count',
      pct: pctDe(valShows, meta.shows),
      estado: estadoDe(pctDe(valShows, meta.shows), ritmoEsperado),
      serie: semanas.map((s) => s.shows),
      previous: semanas[semanas.length - 2]?.shows ?? null,
      extra: `Show rate ${formatValue(showRate, 'pct')} · meta ${formatValue(cuotas.ratesMeta.showRate, 'pct')}`,
    },
    {
      id: 'cierres',
      label: 'Cierres',
      value: valCierres,
      meta: meta.cierres,
      varianza: valCierres - meta.cierres,
      format: 'count',
      pct: pctDe(valCierres, meta.cierres),
      estado: estadoDe(pctDe(valCierres, meta.cierres), ritmoEsperado),
      serie: semanas.map((s) => s.cierres),
      previous: semanas[semanas.length - 2]?.cierres ?? null,
      extra: `Close rate ${formatValue(closeRate, 'pct')} · meta ${formatValue(cuotas.ratesMeta.closeRate, 'pct')}`,
    },
    {
      id: 'cash',
      label: 'Cash generado',
      value: valCash,
      meta: meta.cashUsd,
      varianza: valCash - meta.cashUsd,
      format: 'usd',
      pct: pctDe(valCash, meta.cashUsd),
      estado: estadoDe(pctDe(valCash, meta.cashUsd), ritmoEsperado),
      serie: semanas.map((s) => s.cashUsd),
      previous: semanas[semanas.length - 2]?.cashUsd ?? null,
    },
  ];

  const metaEquipoUsd = cuotas.equipo.metaUsd;
  const actualEquipoUsd = CLOSER_EQUIPO.actualUsd;
  const gapEquipo = metaEquipoUsd - actualEquipoUsd;
  const pctEquipo = pctDe(actualEquipoUsd, metaEquipoUsd);
  const estadoEquipo = estadoVsRitmo(pctEquipo, ritmoEsperado);

  const ticketProm = valCierres ? valCash / valCierres : cuotas.proyeccion.ticketUsd;
  const ventasFaltan = Math.max(0, Math.ceil(gapEquipo / (ticketProm || 11000)));
  const adelanto = pctEquipo - ritmoEsperado;
  const insightEquipo =
    adelanto >= 0
      ? `El equipo va ${Math.round(adelanto)}% adelantado; faltan ~${ventasFaltan} ventas para llegar a meta.`
      : `El equipo va ${Math.round(Math.abs(adelanto))}% atrasado; faltan ~${ventasFaltan} ventas para llegar a meta.`;

  return responder({
    perfil: CLOSER_PERFIL,
    contexto: ctx,
    agenda,
    hoy: {
      iso: ctx.hoyIso,
      llamadas: hoyLlamadas,
      total: resumenHoy.total,
      showsConfirmados: resumenHoy.showsConfirmados,
      pendientesConfirmar: resumenHoy.pendientes,
      pendientes: resumenHoy.pendientes,
    },
    kpis,
    metaMes: {
      proyeccion: cuotas.proyeccion,
      cuota: meta,
      headcount: cuotas.headcount,
      ritmoEsperado,
      ratesMeta: cuotas.ratesMeta,
    },
    equipo: {
      metaUsd: metaEquipoUsd,
      actualUsd: actualEquipoUsd,
      porSemana: CLOSER_EQUIPO.porSemana,
      gapUsd: gapEquipo,
      pctMeta: pctEquipo,
      estado: estadoEquipo,
      insight: insightEquipo,
    },
    followUps: [...CLOSER_FOLLOW_UPS].sort((a, b) => b.diasSinContacto - a.diasSinContacto),
    dispositions: getCloserDisposicionesRecientes(),
    syncAt: new Date().toISOString(),
  });
}

/** Guarda disposition (mock store). Futuro: POST /api/ventas/dispositions. */
export async function guardarDispositionCloser(payload) {
  guardarDispositionEnStore(payload);
  return getCloserDashboard();
}

/** Demo: aplica disposition a Tomás Riganti (o primera agendada). */
export async function simularDispositionCloser() {
  const ok = simularDispositionDemo();
  if (!ok) return null;
  return getCloserDashboard();
}

/** Suscripción a cambios de agenda (mock WebSocket). */
export function onCloserAgendaChange(fn) {
  return subscribeCloserAgenda(fn);
}

/**
 * Dashboard personal del Setter: día, mes, equipo y Calendlys enviados.
 * Metas diarias/mensuales y de equipo salen de la proyección/decreto del mes.
 */
export async function getSetterDashboard() {
  const ctx = SETTER_CONTEXTO;
  const actualMes = SETTER_ACTUAL_MES;
  const semanas = SETTER_SEMANAS;
  const reporte = getSetterReporte();
  const cuotas = cuotasSetterDesdeProyeccion(ctx.mes, { diasMes: ctx.diasMes });
  const metaDia = {
    aplicaciones: cuotas.personalDia.calendlys,
    agendadas: cuotas.personalDia.agendadas,
  };
  const metaMes = {
    aplicaciones: cuotas.personalMes.calendlys,
    agendadas: cuotas.personalMes.agendadas,
    tasaAgendado: cuotas.personalMes.tasaAgendado,
  };

  // Si ya hay reporte del día, los KPIs del día reflejan lo cargado.
  const actualDia = {
    aplicaciones: reporte.payload?.calendlysEnviados ?? SETTER_ACTUAL_DIA.aplicaciones,
    agendadas: reporte.payload?.agendas ?? SETTER_ACTUAL_DIA.agendadas,
  };

  const pctDe = (v, m) => (m ? (v / m) * 100 : 0);
  const estadoDe = (pct, ritmoEsperado) => {
    if (pct >= ritmoEsperado - 2) return 'ok';
    if (pct >= ritmoEsperado - 15) return 'warn';
    return 'alert';
  };
  const ritmoEsperado = (ctx.diaHoy / ctx.diasMes) * 100;
  /** Para metas diarias: 100% = cumplió el día. */
  const estadoDia = (pct) => {
    if (pct >= 100) return 'ok';
    if (pct >= 60) return 'warn';
    return 'alert';
  };

  const tasaAgendado = actualMes.aplicaciones
    ? (actualMes.agendadas / actualMes.aplicaciones) * 100
    : 0;

  /** Mock: diasReporte = días previos; si completó hoy, +1. */
  const diasReporte = actualMes.diasReporte + (reporte.completado ? 1 : 0);

  const diaKpis = [
    {
      id: 'apps_hoy',
      label: 'Calendlys enviados hoy',
      value: actualDia.aplicaciones,
      meta: metaDia.aplicaciones,
      format: 'count',
      pct: pctDe(actualDia.aplicaciones, metaDia.aplicaciones),
      estado: estadoDia(pctDe(actualDia.aplicaciones, metaDia.aplicaciones)),
    },
    {
      id: 'agendadas_hoy',
      label: 'Llamadas agendadas hoy',
      value: actualDia.agendadas,
      meta: metaDia.agendadas,
      format: 'count',
      pct: pctDe(actualDia.agendadas, metaDia.agendadas),
      estado: estadoDia(pctDe(actualDia.agendadas, metaDia.agendadas)),
    },
  ];

  const kpisMes = [
    {
      id: 'apps_mes',
      label: 'Calendlys enviados del mes',
      value: actualMes.aplicaciones,
      meta: metaMes.aplicaciones,
      varianza: actualMes.aplicaciones - metaMes.aplicaciones,
      format: 'count',
      pct: pctDe(actualMes.aplicaciones, metaMes.aplicaciones),
      estado: estadoDe(pctDe(actualMes.aplicaciones, metaMes.aplicaciones), ritmoEsperado),
      serie: semanas.map((s) => s.aplicaciones),
    },
    {
      id: 'agendadas_mes',
      label: 'Llamadas agendadas del mes',
      value: actualMes.agendadas,
      meta: metaMes.agendadas,
      varianza: actualMes.agendadas - metaMes.agendadas,
      format: 'count',
      pct: pctDe(actualMes.agendadas, metaMes.agendadas),
      estado: estadoDe(pctDe(actualMes.agendadas, metaMes.agendadas), ritmoEsperado),
      serie: semanas.map((s) => s.agendadas),
    },
    {
      id: 'tasa',
      label: 'Tasa de agendado',
      value: tasaAgendado,
      meta: metaMes.tasaAgendado,
      varianza: tasaAgendado - metaMes.tasaAgendado,
      format: 'pct',
      pct: pctDe(tasaAgendado, metaMes.tasaAgendado),
      estado: estadoDe(pctDe(tasaAgendado, metaMes.tasaAgendado), 100),
      serie: semanas.map((s) => s.tasa),
      extra: `${actualMes.agendadas} de ${actualMes.aplicaciones} Calendlys`,
    },
    {
      id: 'reportes',
      label: 'Días con reporte completado',
      value: diasReporte,
      meta: ctx.diaHoy,
      varianza: diasReporte - ctx.diaHoy,
      format: 'count',
      pct: pctDe(diasReporte, ctx.diaHoy),
      estado: estadoDia(pctDe(diasReporte, ctx.diaHoy)),
      serie: [4, 5, 5, diasReporte],
      extra: `${diasReporte} de ${ctx.diaHoy} días`,
    },
  ];

  const metaEquipoCal = cuotas.equipo.metaCalendlys;
  const actualEquipoCal = SETTER_EQUIPO.actualAplicaciones;
  const gapEquipo = metaEquipoCal - actualEquipoCal;
  const pctEquipo = pctDe(actualEquipoCal, metaEquipoCal);
  const estadoEquipo = estadoVsRitmo(pctEquipo, ritmoEsperado);

  const adelanto = pctEquipo - ritmoEsperado;
  const faltan = Math.max(0, gapEquipo);
  const insightEquipo =
    adelanto >= 0
      ? `El equipo va ${Math.round(adelanto)}% adelantado; faltan ${faltan} Calendlys enviados para llegar a meta.`
      : `El equipo va ${Math.round(Math.abs(adelanto))}% atrasado; faltan ${faltan} Calendlys enviados para llegar a meta.`;

  return responder({
    perfil: SETTER_PERFIL,
    contexto: ctx,
    dia: { kpis: diaKpis },
    reporte,
    kpisMes,
    metaMes: {
      proyeccion: cuotas.proyeccion,
      cuotaDia: metaDia,
      cuotaMes: metaMes,
      headcount: cuotas.headcount,
      ritmoEsperado,
    },
    equipo: {
      metaAplicaciones: metaEquipoCal,
      actualAplicaciones: actualEquipoCal,
      gap: gapEquipo,
      pctMeta: pctEquipo,
      estado: estadoEquipo,
      insight: insightEquipo,
    },
    aplicaciones: [...SETTER_APLICACIONES].sort((a, b) =>
      b.fechaAplicacionAt.localeCompare(a.fechaAplicacionAt),
    ),
    syncAt: ctx.syncAt,
  });
}

/** Marca el reporte del día como completado. Futuro: POST. */
export async function completarReporteSetter(payload = {}) {
  completarSetterReporte(payload);
  return getSetterDashboard();
}

/* --------------------------------------------------------------- marketing */

/** Solo Ads Manager (sin Instagram) — liviano para metas / gasto. */
export async function getMetaAds(mes) {
  const q = mes ? `?month=${encodeURIComponent(mes)}` : '';
  return pedir(`/api/meta/ads${q}`);
}

/** Contenido Instagram del mes (reels/posts + stories). */
export async function getInstagram(mes) {
  const q = mes ? `?month=${encodeURIComponent(mes)}` : '';
  return pedir(`/api/meta/instagram${q}`);
}

/** Ads + Instagram en paralelo (fallback mock si Ads falla). */
export async function getMarketing(mes) {
  const q = mes ? `?month=${encodeURIComponent(mes)}` : '';
  try {
    const [raw, ig] = await Promise.all([
      pedir(`/api/meta/ads${q}`),
      pedir(`/api/meta/instagram${q}`).catch(() => null),
    ]);
    return {
      campanias: raw.campanias ?? [],
      gastoCanal: raw.gastoCanal ?? [],
      gastoDiario: raw.gastoDiario ?? [],
      umbrales: raw.umbrales ?? FRECUENCIA,
      kpis: raw.kpis ?? [],
      instagram: ig,
      inversionAds: raw.inversionAds ?? 0,
      syncAt: raw.syncAt ?? null,
      fuente: raw.fuente ?? 'meta_ads',
      mes: raw.mes,
    };
  } catch {
    return getMarketingMock();
  }
}

function getMarketingMock() {
  const gasto = CAMPANIAS.reduce((s, c) => s + c.gastoUsd, 0);
  const leads = CAMPANIAS.reduce((s, c) => s + c.leads, 0);
  const revenueAtribuido = GASTO_CANAL.reduce((s, c) => s + c.gastoUsd * c.roas, 0);
  const roas = revenueAtribuido / (gasto || 1);
  const activas = CAMPANIAS.filter((c) => c.estado === 'activa');
  const quemadas = CAMPANIAS.filter((c) => c.frecuencia >= FRECUENCIA.quemado);

  /** @type {Metric[]} */
  const kpis = [
    {
      id: 'roas',
      label: 'ROAS',
      value: roas,
      format: 'x',
      previous: 3.9,
      sourceId: 'manual',
      updatedAt: SYNC.man,
      nota: 'El revenue atribuido se cruza a mano: no hay pixel en las campañas de tráfico a DM.',
    },
    {
      id: 'cpl',
      label: 'Cost per lead',
      value: gasto / (leads || 1),
      format: 'usd',
      previous: 46.2,
      sourceId: 'ads_manager',
      updatedAt: SYNC.ads,
      good: 'down',
    },
    {
      id: 'gasto_ads',
      label: 'Gasto del mes',
      value: gasto,
      format: 'usd',
      previous: 28900,
      sourceId: 'ads_manager',
      updatedAt: SYNC.ads,
      good: 'neutral',
      serie: GASTO_DIARIO.map((d) => d.gastoUsd),
    },
    {
      id: 'campanias_activas',
      label: 'Campañas activas',
      value: activas.length,
      format: 'count',
      previous: 6,
      sourceId: 'ads_manager',
      updatedAt: SYNC.ads,
      good: 'neutral',
      nota: quemadas.length
        ? `${quemadas.length} con la frecuencia pasada de ${FRECUENCIA.quemado}.`
        : 'Ninguna con la frecuencia quemada.',
    },
  ];

  return {
    campanias: CAMPANIAS,
    gastoCanal: GASTO_CANAL,
    gastoDiario: GASTO_DIARIO,
    umbrales: FRECUENCIA,
    kpis,
    instagram: null,
    fuente: 'mock',
  };
}

/* -------------------------------------------------------------- onboarding */

export async function getOnboarding() {
  const clienteCerrados = PROCESOS.filter((p) => p.tipo === 'cliente' && p.cerradoAt);
  const staffCerrados = PROCESOS.filter((p) => p.tipo === 'staff' && p.cerradoAt);

  const promCliente = clienteCerrados.reduce((s, p) => s + p.diasTranscurridos, 0) / (clienteCerrados.length || 1);
  const promStaff = staffCerrados.reduce((s, p) => s + p.diasTranscurridos, 0) / (staffCerrados.length || 1);

  /** @type {Metric[]} */
  const kpis = [
    {
      id: 'onboarding_cliente',
      label: 'Pago → primer entregable',
      value: promCliente,
      format: 'days',
      previous: 7,
      sourceId: 'manual',
      updatedAt: SYNC.man,
      good: 'down',
      objetivo: 7,
      serie: DURACION_HISTORICA.map((d) => d.cliente).filter((v) => v !== null),
    },
    {
      id: 'onboarding_staff',
      label: 'Contrato → primer día productivo',
      value: promStaff,
      format: 'days',
      previous: 16,
      sourceId: 'manual',
      updatedAt: SYNC.man,
      good: 'down',
      objetivo: 10,
      serie: DURACION_HISTORICA.map((d) => d.staff).filter((v) => v !== null),
    },
  ];

  return responder({ procesos: PROCESOS, duracion: DURACION_HISTORICA, kpis });
}

/* ---------------------------------------------------------------- sistemas */

export async function getSistemas() {
  const cobertura = coberturaAutomatizacion();
  return responder({
    fuentes: SOURCE_LIST,
    campos: DATA_FIELDS,
    cobertura,
  });
}

/* -------------------------------------------------------------------- home */

export async function getMetas() {
  const hoy = ahora();
  const mes = mesId(hoy);
  const diasMes = diasDelMes(mes);
  const diaHoy = diaDentroDelMes(hoy, mes);
  const metas = METAS.map((meta) => {
    const acumulado = recortarAcumulado(meta.acumulado, diaHoy);
    return {
      meta: { ...meta, mes, acumulado },
      ritmo: ritmo({ meta: meta.meta, actual: acumulado.at(-1) ?? 0, diasMes, diaHoy }),
    };
  });
  return responder({
    mes: { id: mes, nombre: nombreMesAnio(hoy), dia: diaHoy, dias: diasMes, fraccion: diaHoy / diasMes },
    semana: `S${semanaIso(hoy)}`,
    metas,
    embudo: EMBUDO_VENTAS,
  });
}

/**
 * Decreto mensual Marketing↔Ventas + avance + diagnóstico.
 * @param {string} [mesSel]
 * @param {{ incluirAds?: boolean }} [opts] — Ads (inversión) solo cuando hace falta (vista Ads).
 */
export async function getMetasMes(mesSel, opts = {}) {
  const ctx = contextoDeMes(mesSel || mesId());
  const guardado = leerDecretoGuardado(ctx.mes);
  const decreto = guardado
    ? { ...guardado, mes: ctx.mes }
    : decretoPlantilla(ctx.mes);

  let real = {
    chats: 0,
    conversaciones: 0,
    agendas: 0,
    agendasOrganicas: 0,
    agendasAds: 0,
    shows: 0,
    cierres: 0,
    inversionAds: 0,
    cash: 0,
    cashAds: 0,
    cashOrganico: 0,
    syncAt: null,
    fuente: null,
  };

  try {
    const mkt = await getMktResumen(ctx.mes);
    real = {
      ...real,
      chats: mkt.chats ?? 0,
      conversaciones: mkt.conversaciones ?? 0,
      agendas: mkt.agendas ?? 0,
      shows: mkt.shows ?? 0,
      cierres: mkt.cierres ?? 0,
      cash: mkt.cash ?? 0,
      syncAt: mkt.syncAt ?? null,
      fuente: mkt.fuente ?? 'atv_mkt',
    };
  } catch {
    /* sin MKT: real en cero */
  }

  if (opts.incluirAds) {
    try {
      const ads = await getMetaAds(ctx.mes);
      real = {
        ...real,
        inversionAds: ads.inversionAds ?? 0,
        syncAt: ads.syncAt || real.syncAt,
      };
    } catch {
      /* sin Meta Ads */
    }
  }

  const avance = calcularAvance(decreto, real, ctx, 'full');
  const avanceMarketing = calcularAvance(decreto, real, ctx, 'marketing');
  const avanceAds = calcularAvance(decreto, real, ctx, 'ads');
  const diagnostico = calcularDiagnostico(decreto, real, ctx);

  return responder({
    contexto: ctx,
    decreto,
    real,
    tasasMeta: tasasImplicitas(decreto),
    avance,
    avanceMarketing,
    avanceAds,
    diagnostico,
  });
}

/** Resumen comercial real desde ATV MKT (vía backend). */
export async function getMktResumen(mes) {
  const q = mes ? `?month=${encodeURIComponent(mes)}` : '';
  return pedir(`/api/mkt/resumen${q}`);
}

/**
 * Serie diaria simple hasta el valor actual (para burn-up en Home).
 * @param {number} actual
 * @param {number} diaHoy
 */
function serieHasta(actual, diaHoy) {
  const n = Math.max(1, diaHoy);
  return Array.from({ length: n }, (_, i) => Math.round(actual * ((i + 1) / n)));
}

/**
 * @param {{
 *   id: string,
 *   area: string,
 *   nombre: string,
 *   meta: number,
 *   format: string,
 *   actual: number,
 *   diaHoy: number,
 *   diasMes: number,
 *   mes: string,
 *   dueno: string,
 *   sourceId: string,
 *   principal?: boolean,
 * }} p
 */
function bloqueMeta(p) {
  const acumulado = serieHasta(p.actual, p.diaHoy);
  return {
    meta: {
      id: p.id,
      area: p.area,
      nombre: p.nombre,
      meta: p.meta,
      format: p.format,
      mes: p.mes,
      dueno: p.dueno,
      sourceId: p.sourceId,
      principal: Boolean(p.principal),
      acumulado,
    },
    ritmo: ritmo({
      meta: p.meta,
      actual: p.actual,
      diasMes: p.diasMes,
      diaHoy: p.diaHoy,
    }),
  };
}

/* ---------------------------------------------------------------- cobranza */

/** Payload vacío cuando ATV Clients no responde — la home no puede caerse por esto. */
export function cobranzaVacia(motivo = 'Cobranza no disponible') {
  const ahoraFecha = ahora();
  const diasMes = diasDelMes(mesId(ahoraFecha));
  const diaHoy = diaDentroDelMes(ahoraFecha, mesId(ahoraFecha));
  return {
    cuotas: [],
    cobrado: 0,
    esperadoHoy: 0,
    totalMes: 0,
    vencidas: { n: 0, usd: 0, detalle: motivo },
    porVencerSemana: { n: 0, usd: 0 },
    ritmoCobro: ritmo({ meta: 0, actual: 0, diasMes, diaHoy }),
    pctSobreVencido: 100,
    kpis: [],
    syncAt: null,
    mes: null,
    fuente: null,
    unavailable: true,
    error: motivo,
  };
}

export async function getCobranza(mes) {
  const q = mes ? `?month=${encodeURIComponent(mes)}` : '';
  const raw = await pedir(`/api/cobranza${q}`);
  const ctx = contextoDeMes(mes || raw.mes || mesId());
  const diasMes = ctx.diasMes;
  const diaHoy = ctx.diaHoy;

  const cuotas = (raw.cuotas ?? []).map((c) => ({
    id: c.id,
    cliente: c.cliente,
    plan: c.plan,
    montoUsd: c.montoUsd,
    venceAt: c.venceAt,
    estado: c.estado,
    pagadaAt: c.pagadaAt,
    diasAtraso: c.diasAtraso ?? 0,
    tipo: c.tipo,
  }));

  const totalMes = raw.totalMes ?? 0;
  const cobrado = raw.cobrado ?? 0;

  return {
    cuotas,
    cobrado,
    esperadoHoy: raw.esperadoHoy ?? 0,
    totalMes,
    vencidas: raw.vencidas ?? { n: 0, usd: 0, detalle: 'Sin cuotas vencidas' },
    porVencerSemana: raw.porVencerSemana ?? { n: 0, usd: 0 },
    ritmoCobro: ritmo({ meta: totalMes, actual: cobrado, diasMes, diaHoy }),
    pctSobreVencido: raw.pctSobreVencido ?? 100,
    kpis: raw.kpis ?? [],
    syncAt: raw.syncAt ?? null,
    mes: raw.mes,
    fuente: raw.fuente,
    unavailable: false,
    error: null,
  };
}

/* ------------------------------------------------------------ grietas */

export async function getGrietas() {
  return responder({ grietas: GRIETAS, pedidos: PEDIDOS, pedidosSemana: PEDIDOS_SEMANA });
}

/* ----------------------------------------------------------- home */

/**
 * El cuadro de mando: metas con ritmo, acciones prescriptas para la semana y
 * un bloque por área. Marketing/Ventas/Cobranza salen de ATV MKT + ATV Clients.
 */
export async function getHome(mesSel) {
  const [fulfillment, clientes, sistemas, decretoData, cobranzaSettled, mktSettled] =
    await Promise.all([
      getFulfillment(),
      getClientes(),
      getSistemas(),
      getMetasMes(mesSel),
      getCobranza(mesSel).catch((err) => cobranzaVacia(err?.message || 'ATV Clients no responde')),
      getMktResumen(mesSel).catch(() => null),
    ]);
  const cobranza = cobranzaSettled;
  const mkt = mktSettled;

  let transcripts = null;
  try {
    transcripts = await getTranscripts();
  } catch {
    transcripts = null;
  }

  const hoy = ahora();
  const ctx = contextoDeMes(mesSel || decretoData.contexto?.mes || mesId(), hoy);
  const mes = ctx.mes;
  const diasMes = ctx.diasMes;
  const diaHoy = ctx.diaHoy;
  const decreto = decretoData.decreto;

  const chatsActual = mkt?.chats ?? 0;
  const agendasActual = mkt?.agendas ?? 0;
  const cierresActual = mkt?.cierres ?? 0;
  const cashActual = mkt?.cash ?? 0;
  const showsEsperados = Math.round(decreto.agendas * (decreto.showUpRate / 100));
  const cierresMeta = Math.round(showsEsperados * (decreto.closeRateBueno / 100));

  const marketingMetas = [
    bloqueMeta({
      id: 'mkt_chats',
      area: 'marketing',
      nombre: 'Chats abiertos',
      meta: decreto.chats,
      format: 'count',
      actual: chatsActual,
      diaHoy,
      diasMes,
      mes,
      dueno: 'Juan Cruz',
      sourceId: 'atv_mkt',
      principal: true,
    }),
    bloqueMeta({
      id: 'mkt_agendas',
      area: 'marketing',
      nombre: 'Llamadas agendadas',
      meta: decreto.agendas,
      format: 'count',
      actual: agendasActual,
      diaHoy,
      diasMes,
      mes,
      dueno: 'Juan Cruz',
      sourceId: 'atv_mkt',
    }),
  ];

  const ventasMetas = [
    bloqueMeta({
      id: 'ven_cierres',
      area: 'ventas',
      nombre: 'Cierres',
      meta: cierresMeta,
      format: 'count',
      actual: cierresActual,
      diaHoy,
      diasMes,
      mes,
      dueno: 'Lucas',
      sourceId: 'atv_mkt',
      principal: true,
    }),
    bloqueMeta({
      id: 'ven_cash',
      area: 'ventas',
      nombre: 'Cash collected',
      meta: decreto.cashMeta,
      format: 'usd',
      actual: cashActual,
      diaHoy,
      diasMes,
      mes,
      dueno: 'Lucas',
      sourceId: 'atv_mkt',
    }),
  ];

  const mktPrincipal = marketingMetas[0];
  const venPrincipal = ventasMetas[0];
  const embudo = {
    chats: chatsActual,
    conversaciones: mkt?.conversaciones ?? 0,
    agendas: agendasActual,
    shows: mkt?.shows ?? 0,
    cierres: cierresActual,
    cash: cashActual,
  };

  const { plan: planMkt } = accionMarketing(mktPrincipal);
  const { plan: planVen } = accionVentas(venPrincipal, embudo);

  const enRiesgo = fulfillment.activos
    .filter((c) => c.salud.semaforo !== 'verde')
    .sort((a, b) => a.salud.score - b.salud.score);

  const backendOk = transcripts !== null;
  const grietas = grietasOperativas({ cobranza, transcripts, backendOk });

  const acciones = ordenarAcciones(
    [
      ...accionesFulfillment({
        enRiesgo,
        silencio: fulfillment.silencio ?? [],
        churnIntent: fulfillment.churnIntent ?? [],
        sinActivarFuera: fulfillment.sinActivarFuera ?? [],
        candidatos: fulfillment.candidatos ?? [],
      }),
      ...accionesCobranza(cobranza),
      ...accionesOperativas({ transcripts, backendOk }),
    ].filter(Boolean),
  );

  const k = (grupo, id) => fulfillment.kpis[grupo]?.find((x) => x.id === id);
  const silencio = k('engagement', 'silencio_7d');
  const scoreVerde = k('engagement', 'score_verde');
  const revision = [
    ...(fulfillment.revision ?? []),
    silencio && `${formatValue(silencio.value, silencio.format)} canales con ≥7 días sin mensaje del cliente.`,
    scoreVerde && `${formatValue(scoreVerde.value, scoreVerde.format)} de la cartera en verde según el score del canal.`,
  ].filter(Boolean);

  const kpiClientes = clientes.kpis.find((x) => x.id === 'clientes_activos');
  const kpiEnRiesgo = k('retencion', 'en_riesgo');
  const kpiActivados = k('outcomes', 'pct_activados');

  return responder({
    mes: {
      id: mes,
      nombre: ctx.nombreMes,
      dia: diaHoy,
      dias: diasMes,
      fraccion: diaHoy / diasMes,
    },
    semana: `S${semanaIso(hoy)}`,
    northStar: [
      kpiClientes,
      kpiActivados,
      kpiEnRiesgo,
      {
        id: 'pct_automatizado',
        label: 'Automatizado',
        value: sistemas.cobertura.pct,
        format: 'pct',
        previous: 30,
        sourceId: 'manual',
        updatedAt: SYNC.man,
        objetivo: 80,
      },
    ].filter(Boolean),
    acciones,
    marketing: {
      metas: marketingMetas,
      principal: mktPrincipal,
      plan: planMkt,
      dueno: 'Juan Cruz',
      fuente: mkt?.fuente ?? null,
      unavailable: !mkt,
    },
    ventas: {
      metas: ventasMetas,
      principal: venPrincipal,
      plan: planVen,
      embudo,
      dueno: 'Lucas',
      fuente: mkt?.fuente ?? null,
      unavailable: !mkt,
    },
    fulfillment: {
      semaforoTotales: fulfillment.semaforoTotales,
      enRiesgo: enRiesgo.slice(0, 5),
      revision,
      activos: fulfillment.activos.length,
    },
    sistemas: {
      fuentes: SOURCE_LIST,
      cobertura: sistemas.cobertura,
      grietas,
      pedidosSemana: 0,
      backendOk,
      botUltimaEscritura: transcripts?.resumen.ultimo_mensaje_at ?? null,
      transcriptsCanales: transcripts?.resumen.canales ?? null,
      transcriptsParcial: transcripts?.resumen.parcial ?? null,
    },
    cobranza,
  });
}


/* --------------------------------------------------------------- reales */

/** Base del backend de ATV Ops. Configurable con VITE_API_URL. */
export const API_BASE = import.meta.env?.VITE_API_URL ?? 'http://localhost:8010';

/**
 * @param {string} path
 * @returns {Promise<any>}
 */
async function pedir(path, options = {}) {
  const token = getToken();
  let respuesta;
  try {
    respuesta = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new Error(
      `No se pudo hablar con el backend (${API_BASE}). ¿Está levantado en ese puerto?`,
    );
  }
  if (!respuesta.ok) {
    const detalle = await respuesta.json().catch(() => null);
    throw new Error(detalle?.detail ?? `El backend respondió ${respuesta.status}`);
  }
  return respuesta.json();
}

export async function login(username, password) {
  return pedir('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

export async function getMe() {
  return pedir('/api/auth/me');
}

/**
 * Todos los transcripts de Discord con su actividad agregada.
 * Fuente: los .txt del bot de ATV Clients. Solo lectura, sin conexión propia
 * a Discord.
 * @returns {Promise<{ resumen: object, canales: object[] }>}
 */
export async function getTranscripts() {
  return pedir('/api/transcripts');
}

/**
 * Un canal con todos sus mensajes. Se relee cada 15 s desde el visor en vivo;
 * el backend cachea por mtime, así que solo cuesta cuando el bot escribió.
 * @param {string} categoria
 * @param {string} canal
 */
export async function getTranscriptCanal(categoria, canal) {
  return pedir(`/api/transcripts/${encodeURIComponent(categoria)}/${encodeURIComponent(canal)}`);
}

export function mediaUrl(path) {
  if (!path) return null;
  return path.startsWith('http') ? path : `${API_BASE}${path}`;
}

export async function getIntegrantes() {
  return pedir('/api/integrantes');
}

export async function crearIntegrante(nombre) {
  return pedir('/api/integrantes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre }),
  });
}

export async function subirFotoIntegrante(id, file) {
  const body = new FormData();
  body.append('archivo', file);
  return pedir(`/api/integrantes/${id}/foto`, { method: 'POST', body });
}

export async function borrarIntegrante(id) {
  return pedir(`/api/integrantes/${id}`, { method: 'DELETE' });
}

export async function getReunionesMes(anio, mes) {
  return pedir(`/api/reuniones?anio=${anio}&mes=${mes}`);
}

export async function crearReunion(payload) {
  return pedir('/api/reuniones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function borrarReunion(id) {
  return pedir(`/api/reuniones/${id}`, { method: 'DELETE' });
}

/* ------------------------------------------------------------------- ideas */

export async function getIdeas() {
  return pedir('/api/ideas');
}

export async function crearIdea(texto, quien) {
  return pedir('/api/ideas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto, quien }),
  });
}

/** @param {number} id @param {{ asignada?: string | null, estado?: string }} patch */
export async function actualizarIdea(id, patch) {
  return pedir(`/api/ideas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function borrarIdea(id) {
  return pedir(`/api/ideas/${id}`, { method: 'DELETE' });
}

/** Estado del análisis de activación con Claude Code (corridas, costo del mes). */
export async function getActivacionIa() {
  return pedir('/api/activacion-ia/estado');
}

/** Dispara una corrida ahora (admin / founder). */
export async function ejecutarActivacionIa() {
  return pedir('/api/activacion-ia/ejecutar', { method: 'POST' });
}

/** Asistente del equipo: pregunta libre sobre cartera, transcripts y vistas. */
export async function preguntarAsistente(pregunta, historial = []) {
  return pedir('/api/asistente/preguntar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pregunta, historial }),
  });
}

/** Pendientes de respuesta por coach, en vivo desde los transcripts. */
export async function getPendientes() {
  return pedir('/api/pendientes');
}

export async function ejecutarRondaPendientes() {
  return pedir('/api/pendientes/ronda', { method: 'POST' });
}

/** Guarda el update tal como lo dejó el CSM. */
export async function confirmarUpdate(texto) {
  return pedir('/api/pendientes/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }) });
}

/** Datos del cliente que carga el CSM (objetivo, ICP, contacto, su equipo). */
export async function guardarDatosCliente(clienteId, payload) {
  return pedir(`/api/clientes/${encodeURIComponent(clienteId)}/datos`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Agenda real del Google Calendar de ATV (vista de Ventas). */
export async function getAgendaVentas({ dias = 14, diasAtras = 1, refrescar = false } = {}) {
  return pedir(`/api/calendario-ventas?dias=${dias}&diasAtras=${diasAtras}${refrescar ? '&refrescar=true' : ''}`);
}

/** Del título de Calendly ("2da reu DANILO and Aumenta Tu Valor") sale el nombre del prospecto. */
function prospectoDesde(titulo, invitados) {
  const limpio = (titulo ?? '').replace(/\s+/g, ' ').trim();
  const m = limpio.match(/^(.*?)\s*(?:and|y|&|con)\s+aumenta tu valor\b/i)
    ?? limpio.match(/^aumenta tu valor\s*(?:and|y|&|con)\s*(.*)$/i);
  if (m) {
    const nombre = m[1]
      .replace(/^(?:\d+\s*(?:ra|da|er|ta|va|°|º)?\s*)?(?:reuni[oó]n|reu|llamada|call|meet|sesi[oó]n)\s+/i, '')
      .trim();
    if (nombre) return nombre;
  }
  // Sin el patrón de Calendly, el título dice más que el usuario del mail del invitado.
  if (limpio) return limpio;
  const externo = (invitados ?? []).find((i) => !i.equipo);
  return externo?.nombre || 'Sin título';
}

const ESTADO_POR_RESPUESTA = { accepted: 'confirmado', declined: 'rechazado', tentative: 'tentativo' };

/**
 * Llamadas reales del Google Calendar de ATV, con la forma que espera el calendario
 * del equipo. Los datos del formulario de Calendly (teléfono, Instagram, facturación)
 * vienen ya parseados del backend.
 */
export async function getLlamadosAgenda({ dias = 21, diasAtras = 7, refrescar = false } = {}) {
  const agenda = await getAgendaVentas({ dias, diasAtras, refrescar });
  const llamados = (agenda.eventos ?? []).map((e) => {
    const externos = (e.invitados ?? []).filter((i) => !i.equipo);
    const principal = externos[0] ?? null;
    const estado = externos.length === 0
      ? 'interno'
      : (ESTADO_POR_RESPUESTA[principal?.estado] ?? 'pendiente');
    return {
      id: e.id,
      prospecto: prospectoDesde(e.titulo, e.invitados),
      titulo: e.titulo,
      email: principal?.email ?? '',
      telefono: e.telefono ?? '',
      instagram: e.instagram ?? '',
      facturacion: e.facturacion ?? '',
      respuestas: e.respuestas ?? [],
      fechaAt: e.inicioAt,
      duracionMin: e.duracionMin,
      todoElDia: e.todoElDia,
      estado,
      oferta: e.tipo ?? (externos.length ? 'Llamada' : 'Interno'),
      closer: (e.invitados ?? []).filter((i) => i.equipo).map((i) => i.nombre).join(', ') || 'Equipo ATV',
      invitados: e.invitados ?? [],
      zoomUrl: e.zoomUrl ?? null,
      meetUrl: e.meetUrl ?? null,
      url: e.url ?? null,
      notasSetter: e.notas ?? '',
      montoUsd: null,
      origen: 'calendly',
    };
  });
  return { ...agenda, llamados };
}

/** Log de eventos: por cliente, tipo, tag, estado, responsable o antigüedad. */
export async function getEventos(filtros = {}) {
  const q = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  return pedir(`/api/eventos${q.toString() ? `?${q}` : ''}`);
}

export async function getResumenEventos() {
  return pedir('/api/eventos/resumen');
}

/** Tira el borrador de la última ronda sin aplicarlo. */
export async function descartarBorrador() {
  return pedir('/api/pendientes/borrador', { method: 'DELETE' });
}

/** Progreso de la ronda en curso (o de la última). */
export async function getProgresoRonda() {
  return pedir('/api/pendientes/progreso');
}

/** Texto del update en el formato de #updates (texto plano). */
export async function getUpdateTexto() {
  const token = getToken();
  const r = await fetch(`${API_BASE}/api/pendientes/update-texto`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new Error(`El backend respondió ${r.status}`);
  return r.text();
}
