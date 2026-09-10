/**
 * FRONTERA DE DATOS.
 *
 * Todo lo que el dashboard muestra entra por acá, y todo sale de una fuente real.
 * Lo que todavía no tiene fuente conectada se muestra en cero: nunca datos inventados.
 *
 *   getFulfillment()  → GET /api/clientes (transcripts de Discord + score)
 *   getVentas()       → GET /api/ventas (base de ATV Ops: llamadas, cierres, cash)
 *   getMisLlamadas()  → GET /api/ventas/mis-llamadas (las llamadas del closer)
 *   getSetterDashboard() → GET /api/ventas/mi-setting (reportes diarios del setter)
 *   getMarketing()    → GET /api/ventas/marketing (Ads, reels, YouTube, historias, setting)
 *   getCobranza()     → GET /api/ventas/cobranza (cuotas del esquema clients)
 *   getFulfillmentOps() → GET /api/ventas/cartera-ops (altas, bajas, vencimientos)
 *   getMetasMes()     → decreto del equipo + avance real
 *   getHome()         → composición de las anteriores
 *
 * Sin fuente todavía: onboarding, grietas de datos, upsells y recompras, NPS y quejas.
 * Esas funciones devuelven cero o listas vacías a propósito.
 *
 * @typedef {import('./types.js').Metric} Metric
 * @typedef {import('./types.js').ResumenArea} ResumenArea
 */

import {
  calcularAvance,
  calcularDiagnostico,
  decretoPlantilla,
  leerDecretoGuardado,
  tasasImplicitas,
} from '../lib/metasMes.js';
import { contextoDeMes } from '../lib/mes.js';
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
/** @template T @param {T} data @returns {Promise<T>} */
function responder(data) {
  return Promise.resolve(data);
}

/** El acumulado puede venir hasta fin de mes; el ritmo usa solo hasta hoy. */
function recortarAcumulado(acumulado, diaHoy) {
  if (!acumulado?.length || diaHoy <= 0) return [];
  return acumulado.slice(0, Math.min(diaHoy, acumulado.length));
}


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

/** Las llamadas del closer logueado, con lo que ya reportó y lo que le falta. */
export async function getMisLlamadas(closer, mes) {
  // Sin mes trae la ventana alrededor de hoy, que es la que usa el bloqueo por llamadas sin cargar.
  const q = new URLSearchParams();
  if (closer) q.set('closer', closer);
  if (mes) q.set('mes', mes);
  const cola = q.toString();
  return pedir(`/api/ventas/mis-llamadas${cola ? `?${cola}` : ''}`);
}

/** El closer marca cómo salió la llamada, qué programa compró y cuánto cash dejó. */
export async function guardarResultadoLlamada(leadId, payload, mes, { lista = true } = {}) {
  // El id puede ser "cal:<evento>": una reunión del calendario que el backend crea en el CRM al guardar.
  // El mes viaja para que la lista que vuelve sea la del período que se está mirando.
  const q = new URLSearchParams();
  if (mes) q.set('mes', mes);
  if (!lista) q.set('lista', 'false');  // el calendario recarga solo: no hace falta rearmarla
  const cola = q.toString();
  return pedir(`/api/ventas/llamadas/${encodeURIComponent(leadId)}/resultado${cola ? `?${cola}` : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Saca del calendario una reunión que no es de venta (un 1a1, una weekly), o la devuelve.
 * No borra nada en Google: solo deja de mostrarse en ATV Ops.
 */
export async function ocultarReunion(eventoId, { titulo, fechaAt, mostrar = false } = {}) {
  return pedir(`/api/ventas/reuniones/${encodeURIComponent(eventoId)}/ocultar${mostrar ? '?mostrar=true' : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titulo, fechaAt }),
  });
}

/** Reels y secuencias de historias del mes, traídos de Instagram con el token propio. */
export async function getInstagramPropio(mes) {
  return pedir(`/api/ventas/instagram${mes ? `?mes=${mes}` : ''}`);
}

/** Trae ahora lo último de Instagram, sin esperar la pasada de cada tres horas. */
export async function sincronizarInstagram() {
  return pedir('/api/ventas/instagram/sincronizar', { method: 'POST' });
}

/** Los videos del canal, de la base de ATV Ops. */
export async function getYouTubePropio(mes) {
  return pedir(`/api/ventas/youtube${mes ? `?mes=${mes}` : ''}`);
}

/** Trae ahora lo último del canal, sin esperar la pasada de cada tres horas. */
export async function sincronizarYouTube() {
  return pedir('/api/ventas/youtube/sincronizar', { method: 'POST' });
}

/** Cargar a mano una reunión que nunca pasó por el calendario (un referido, un chat). */
export async function crearLlamada(payload) {
  return pedir('/api/ventas/llamadas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Para cada reunión del calendario, si ya tiene el resultado cargado y con qué id.
 * El calendario del equipo lo usa para pintar lo cargado y para editarlo ahí mismo.
 */
export async function getEstadoReuniones({ desde, hasta } = {}) {
  const q = new URLSearchParams();
  if (desde) q.set('desde', desde);
  if (hasta) q.set('hasta', hasta);
  const cola = q.toString();
  return pedir(`/api/ventas/reuniones${cola ? `?${cola}` : ''}`);
}

/**
 * Saca una llamada de la lista y de las métricas, o la devuelve con recuperar=true.
 * No borra la fila del CRM: la llamada queda en el filtro "Descartadas" con todo lo que tenía.
 */
export async function descartarLlamada(leadId, { recuperar = false, mes, lista = true } = {}) {
  const q = new URLSearchParams();
  if (recuperar) q.set('recuperar', 'true');
  if (mes) q.set('mes', mes);
  if (!lista) q.set('lista', 'false');
  const cola = q.toString();
  return pedir(`/api/ventas/llamadas/${encodeURIComponent(leadId)}/descartar${cola ? `?${cola}` : ''}`, {
    method: 'POST',
  });
}

/** El reporte de una semana: marketing, ventas, cartera y ads en un solo lugar. */
export async function getReporteSemanal(semana, { refrescar = false } = {}) {
  const q = new URLSearchParams();
  if (semana) q.set('semana', semana);
  if (refrescar) q.set('refrescar', 'true');
  return pedir(`/api/ventas/reporte-semanal${q.toString() ? `?${q}` : ''}`);
}

/** Los días del mes con y sin reporte cargado (rojo / verde en el calendario). */
export async function getMisReportes({ mes, rol = 'setter' } = {}) {
  const q = new URLSearchParams({ rol });
  if (mes) q.set('mes', mes);
  return pedir(`/api/ventas/mis-reportes?${q}`);
}

/** Carga o corrige el reporte de un día. */
export async function guardarReporteDia(fecha, payload, rol = 'setter') {
  return pedir(`/api/ventas/mis-reportes/${fecha}?rol=${rol}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Catálogo de programas con su precio (la facturación de cada venta). */
export async function getProgramas() {
  return pedir('/api/ventas/programas');
}

export async function guardarPrograma(programa) {
  return pedir('/api/ventas/programas', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(programa),
  });
}

export async function borrarPrograma(id) {
  return pedir(`/api/ventas/programas/${id}`, { method: 'DELETE' });
}

/** Meta del mes: el decreto que carga el equipo; si no hay, los objetivos por defecto. */
const META_VACIA = {
  conversaciones: 0, aplicaciones: 0, agendas: 0, shows: 0, cierres: 0,
  cashUsd: 0, showRate: 0, closeRate: 0, averageSaleUsd: 0,
};

function metaDelMes(mes) {
  const guardado = leerDecretoGuardado?.(mes) ?? null;
  // Sin decreto cargado no hay meta: se muestra en cero, no un número inventado.
  if (!guardado) return { ...META_VACIA, fuente: 'sin_decreto' };
  return {
    conversaciones: guardado.conversaciones ?? 0,
    aplicaciones: guardado.aplicaciones ?? 0,
    agendas: guardado.agendas ?? 0,
    shows: guardado.shows ?? 0,
    cierres: guardado.cierres ?? 0,
    cashUsd: guardado.cashMeta ?? 0,
    showRate: guardado.showRate ?? 0,
    closeRate: guardado.closeRate ?? 0,
    averageSaleUsd: guardado.averageSaleUsd ?? 0,
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
  if (real.actual.sinCrm > 0) {
    // El CRM guarda una sola fecha por lead, así que las segundas reuniones se leen del calendario.
    diagnostico += `${real.actual.sinCrm} de las reuniones del mes están en el calendario y no en el CRM: cuentan como agendadas, pero sin resultado no entran al show rate. `;
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

export async function getFulfillmentOps(mes) {
  const q = new URLSearchParams();
  if (mes) q.set('mes', mes);
  const [ops, fulfillment] = await Promise.all([
    pedir(`/api/ventas/cartera-ops${q.toString() ? `?${q}` : ''}`),
    getFulfillment().catch(() => null),
  ]);
  const ctx = contextoDeMes(mes || ops.mes || mesId());
  const r = ops.resumen;
  const salud = ops.salud;
  const totalEstado = salud.vigentes + salud.proximosAVencer + salud.vencidos;

  const programas = (ops.programas ?? []).map((x) => ({
    id: x.nombre,
    label: x.nombre.charAt(0).toUpperCase() + x.nombre.slice(1),
    clientes: x.clientes,
    activos: x.activos,
    revenueUsd: x.cobradoUsd,
    deudaUsd: x.deudaUsd,
    ticketUsd: x.clientes ? Math.round(x.cobradoUsd / x.clientes) : 0,
  }));

  const distribucion = [
    { id: 'vigentes', label: 'Vigentes', valor: salud.vigentes, pct: totalEstado ? (salud.vigentes / totalEstado) * 100 : 0, color: 'var(--ok)' },
    { id: 'proximos', label: 'Próximos a vencer', valor: salud.proximosAVencer, pct: totalEstado ? (salud.proximosAVencer / totalEstado) * 100 : 0, color: 'var(--warn)' },
    { id: 'vencidos', label: 'Vencidos', valor: salud.vencidos, pct: totalEstado ? (salud.vencidos / totalEstado) * 100 : 0, color: 'var(--brand-hi)' },
  ];

  const alertaSalud = salud.vencenProximos7d
    ? `${salud.vencenProximos7d} clientes vencen en los próximos 7 días · revenue en riesgo: ${formatValue(salud.revenueRiesgo7dUsd, 'usd')}.`
    : null;

  const verdes = fulfillment?.semaforoTotales?.verde ?? 0;
  const totalSemaforo = fulfillment ? (fulfillment.activos?.length ?? 0) : 0;

  return {
    contexto: { ...ctx, mes: ops.mes, syncAt: ops.generadoAt },
    conectado: ops.conectado,
    resumen: {
      ...r,
      onboardingsMes: r.altasMes,
      onboardingsMesAnterior: r.altasMesAnterior,
      metaOnboarding: 0,
      churnMes: r.bajasMes,
      caja2MesUsd: r.cuotasMesUsd,
      deltaOnboarding: r.altasMes - r.altasMesAnterior,
      programas,
    },
    // Upsells, recompras y downsells no tienen fuente todavía: van en cero.
    expansion: {
      upsells: { cantidad: 0, revenueUsd: 0 },
      recompras: { cantidad: 0, revenueUsd: 0 },
      downsells: { cantidad: 0, revenueUsd: 0 },
      caja2Usd: r.cuotasMesUsd,
      metaCaja2Usd: 0,
      gapCaja2: 0,
      pctCaja2: 0,
      estadoCaja2: 'sin_meta',
      porSemana: [],
      candidatos: fulfillment?.candidatos?.length ?? 0,
    },
    salud: {
      ...salud,
      programas,
      porEstado: distribucion,
      distribucion,
      enPausa: 0,
      noRenuevan: salud.vencidos,
      enLlamadaRecompra: 0,
      alerta: alertaSalud,
    },
    calidad: {
      enVerde: verdes,
      totalCartera: totalSemaforo,
      pctVerde: totalSemaforo ? (verdes / totalSemaforo) * 100 : 0,
      silencio7d: fulfillment?.silencio?.length ?? 0,
      sinActivar: fulfillment?.sinActivar?.length ?? 0,
      // Wins reales del fulfillment; quejas y NPS no tienen fuente todavía.
      wins: (fulfillment?.winsRecientes ?? []).map((c) => ({
        id: c.id, cliente: c.nombre, texto: c.activacion?.descripcion ?? '', fechaAt: c.activacion?.primerResultadoAt,
      })),
      winsMes: fulfillment?.winsRecientes?.length ?? 0,
      deltaWins: 0,
      quejas: [],
      quejasMes: 0,
      deltaQuejas: 0,
      ratioWinsQuejas: 0,
      nps: 0,
      diasOnboardingPromedio: 0,
      tasaActivacion7d: 0,
    },
    programas: ops.programas,
    syncAt: ops.generadoAt,
    mes: ops.mes,
  };
}

/**
 * Dashboard personal del Closer: su día, sus números, follow-ups y dispositions.
 * Metas personales y de equipo salen de la proyección/decreto del mes.
 */
export async function getCloserDashboard(mes) {
  const real = await pedir('/api/ventas/mis-llamadas');
  const ctx = contextoDeMes(mes || mesId());
  const cuotas = cuotasCloserDesdeProyeccion(ctx.mes);
  const m = real.mes ?? {};
  const meta = cuotas.personalMes ?? {};
  const pctDe = (v, x) => (x ? (v / x) * 100 : 0);
  const ritmoEsperado = (ctx.diaHoy / ctx.diasMes) * 100;
  const estado = (pct) => (pct >= ritmoEsperado - 2 ? 'ok' : pct >= ritmoEsperado - 15 ? 'warn' : 'alert');
  const kpi = (id, label, value, objetivo, format = 'count') => ({
    id, label, value, meta: objetivo, format, pct: pctDe(value, objetivo), estado: estado(pctDe(value, objetivo)),
  });

  return {
    perfil: { id: 'closer', nombre: real.closer ?? 'Closer' },
    contexto: { ...ctx, ritmoEsperado, syncAt: real.generadoAt },
    conectado: Boolean(real.closer),
    kpisMes: [
      kpi('cash_mes', 'Cash del mes', m.cashUsd ?? 0, meta.cashUsd ?? 0, 'usd'),
      kpi('cierres_mes', 'Ventas', m.cierres ?? 0, meta.cierres ?? 0),
      kpi('shows_mes', 'Shows', m.shows ?? 0, meta.shows ?? 0),
      kpi('agendadas_mes', 'Agendas', m.agendadas ?? 0, meta.agendadas ?? 0),
    ],
    metaMes: { ...meta, actualCash: m.cashUsd ?? 0, actualCierres: m.cierres ?? 0 },
    llamadas: real.llamadas ?? [],
    mesReal: m,
    syncAt: real.generadoAt,
    mes: ctx.mes,
  };
}

/**
 * Dashboard personal del Setter: día, mes, equipo y Calendlys enviados.
 * Metas diarias/mensuales y de equipo salen de la proyección/decreto del mes.
 */
export async function getSetterDashboard(mes) {
  const q = new URLSearchParams();
  if (mes) q.set('mes', mes);
  const real = await pedir(`/api/ventas/mi-setting${q.toString() ? `?${q}` : ''}`);
  const ctx = contextoDeMes(real.mes);
  const cuotas = cuotasSetterDesdeProyeccion(real.mes, { diasMes: ctx.diasMes });
  const metaDia = cuotas.personalDia;
  const metaMes = cuotas.personalMes;

  const pctDe = (v, m) => (m ? (v / m) * 100 : 0);
  const estadoDia = (pct) => (pct >= 100 ? 'ok' : pct >= 60 ? 'warn' : 'alert');
  const ritmoEsperado = (ctx.diaHoy / ctx.diasMes) * 100;
  const estadoMes = (pct) => (pct >= ritmoEsperado - 2 ? 'ok' : pct >= ritmoEsperado - 15 ? 'warn' : 'alert');

  const kpi = (id, label, value, meta, format = 'count', mensual = false) => ({
    id, label, value, meta, format,
    // Cuánto le falta o le sobra contra la meta: sin esto la vista mostraba "Varianza NaN".
    varianza: (Number(value) || 0) - (Number(meta) || 0),
    pct: pctDe(value, meta),
    estado: mensual ? estadoMes(pctDe(value, meta)) : estadoDia(pctDe(value, meta)),
  });

  const dia = real.dia;
  const mesT = real.mesTotales;

  return {
    perfil: { id: 'setter', nombre: real.miembro?.nombre ?? 'Setter' },
    contexto: { ...ctx, mes: real.mes, ritmoEsperado, syncAt: real.generadoAt },
    conectado: Boolean(real.miembro),
    detalle: real.detalle,
    dia: {
      cargado: dia.cargado,
      kpis: [
        kpi('conversaciones_hoy', 'Conversaciones hoy', dia.conversaciones, metaDia.conversaciones ?? 0),
        kpi('agendadas_hoy', 'Llamadas agendadas hoy', dia.agendas, metaDia.agendadas),
        kpi('apps_hoy', 'Calendlys enviados hoy', dia.linksEnviados, metaDia.calendlys),
      ],
    },
    kpisMes: [
      kpi('conversaciones_mes', 'Conversaciones del mes', mesT.conversaciones, metaMes.conversaciones ?? 0, 'count', true),
      kpi('agendadas_mes', 'Agendas del mes', mesT.agendas, metaMes.agendadas, 'count', true),
      kpi('apps_mes', 'Calendlys del mes', mesT.linksEnviados, metaMes.calendlys, 'count', true),
      kpi('dias_cargados', 'Días reportados', mesT.diasCargados, mesT.diasCargados + mesT.diasSinCargar, 'count', true),
    ],
    metaMes: {
      ...metaMes,
      // La vista lee la cuota por mes y por día con estos nombres.
      cuotaMes: {
        aplicaciones: metaMes.calendlys ?? 0,
        agendadas: metaMes.agendadas ?? 0,
        conversaciones: metaMes.conversaciones ?? 0,
        tasaAgendado: metaMes.tasaAgendado ?? 0,
      },
      cuotaDia: {
        aplicaciones: metaDia.calendlys ?? 0,
        agendadas: metaDia.agendadas ?? 0,
        conversaciones: metaDia.conversaciones ?? 0,
      },
      proyeccion: cuotas.proyeccion,
      ritmoEsperado,
      actualCalendlys: mesT.linksEnviados,
      actualAgendadas: mesT.agendas,
      tasaAgendado: mesT.linksEnviados ? (mesT.agendas / mesT.linksEnviados) * 100 : 0,
    },
    equipo: {
      metaConversaciones: cuotas.equipo?.metaConversaciones ?? 0,
      actualConversaciones: real.equipo.conversaciones,
      metaAplicaciones: cuotas.equipo?.metaAgendas ?? 0,
      actualAplicaciones: real.equipo.agendas,
      gap: Math.max(0, (cuotas.equipo?.metaAgendas ?? 0) - real.equipo.agendas),
      estado: estadoMes(pctDe(real.equipo.agendas, cuotas.equipo?.metaAgendas ?? 0)),
      insight: `El equipo lleva ${real.equipo.conversaciones} conversaciones y ${real.equipo.agendas} agendas este mes.`,
    },
    aplicaciones: (real.agendadas ?? []).map((a) => ({
      id: a.id,
      prospecto: a.prospecto,
      fechaAt: a.fechaAt,
      closer: a.closer,
      origen: a.origen,
      facturaHoy: a.facturaHoy,
      estado: a.estado === 'cierre' ? 'cerrado' : a.estado === 'no_show' ? 'no_show' : a.estado === 'sin_reportar' ? 'pendiente' : 'agendado',
    })),
    reporte: { cargado: dia.cargado, payload: null },
    syncAt: real.generadoAt,
    mes: real.mes,
  };
}

/** El reporte del día del setter: se guarda en el CRM, igual que desde el calendario. */
export async function completarReporteSetter(payload = {}) {
  const hoy = new Date().toISOString().slice(0, 10);
  await guardarReporteDia(hoy, {
    conversaciones: payload.conversaciones ?? 0,
    links_enviados: payload.calendlysEnviados ?? payload.links_enviados ?? 0,
    agendas: payload.agendas ?? 0,
    seguimientos: payload.seguimientos ?? 0,
    outbounds: payload.outbounds ?? 0,
    leads_nuevos: payload.leadsNuevos ?? 0,
    nota: payload.nota ?? '',
  });
  return getSetterDashboard();
}

/* --------------------------------------------------------------- marketing */

/** Solo Ads Manager (sin Instagram) — liviano para metas / gasto. */
/** Ads, contenido, historias y setting del mes: todo del CRM de Marketing. */
export async function getMarketingReal(mes, { refrescar = false } = {}) {
  const q = new URLSearchParams();
  if (mes) q.set('mes', mes);
  if (refrescar) q.set('refrescar', 'true');
  return pedir(`/api/ventas/marketing${q.toString() ? `?${q}` : ''}`);
}

function campaniasDeAds(raw) {
  return (raw.ads.campanias ?? []).map((c) => ({
    id: c.nombre,
    nombre: c.nombre,
    canal: 'Meta',
    objetivo: (c.objetivo ?? '').replace('OUTCOME_', '').toLowerCase(),
    estado: (c.estado ?? '').toLowerCase() === 'active' ? 'activa' : 'pausada',
    gastoUsd: c.gastoUsd,
    leads: c.conversiones,
    cplUsd: c.costoPorConversionUsd,
    ctr: c.ctr,
    alcance: c.alcance,
    impresiones: c.impresiones,
    clicks: c.clicks,
    frecuencia: c.alcance ? Number((c.impresiones / c.alcance).toFixed(2)) : 0,
    roas: 0,
    ultimaSyncAt: raw.generadoAt,
  }));
}

export async function getMetaAds(mes) {
  const raw = await getMarketingReal(mes);
  const a = raw.ads;
  const kpi = (id, label, value, format, nota, objetivo) => ({
    id, label, value, format, previous: null, objetivo,
    sourceId: 'ads_manager', updatedAt: raw.generadoAt, nota,
  });
  return {
    campanias: campaniasDeAds(raw),
    totales: {
      gastoUsd: a.gastoUsd, leads: a.conversiones, cplUsd: a.costoPorConversionUsd,
      impresiones: a.impresiones, clicks: a.clicks, alcance: a.alcance, ctr: a.ctr,
    },
    gastoCanal: a.gastoUsd ? [{ canal: 'Meta', gastoUsd: a.gastoUsd }] : [],
    gastoDiario: [],
    // El módulo 07_ads manda: la frecuencia gobierna la salud del creativo.
    umbrales: { objetivo: 1.4, quemado: 1.6 },
    kpis: [
      kpi('gasto_ads', 'Inversión', a.gastoUsd, 'usd', `${a.campanias.length} campañas en el mes`),
      kpi('leads_ads', 'Conversiones', a.conversiones, 'count', 'Reportadas por Meta'),
      kpi('cpl', 'Costo por conversión', a.costoPorConversionUsd, 'usd', 'Inversión sobre conversiones'),
      kpi('ctr', 'CTR', a.ctr, 'pct', `${formatValue(a.clicks, 'count')} clicks sobre ${formatValue(a.impresiones, 'count')} impresiones`),
    ],
    inversionAds: a.gastoUsd,
    conectado: raw.conectado,
    detalle: raw.detalle,
    syncAt: raw.generadoAt,
    fuente: 'meta_ads',
    mes: raw.mes,
  };
}

export async function getInstagram(mes) {
  const raw = await getMarketingReal(mes);
  return {
    publicaciones: raw.contenido.publicaciones,
    totales: {
      reels: raw.contenido.reels,
      reproducciones: raw.contenido.reproducciones,
      alcance: raw.contenido.alcance,
      interacciones: raw.contenido.interacciones,
    },
    syncAt: raw.generadoAt,
    mes: raw.mes,
  };
}

export async function getMarketing(mes) {
  const raw = await getMarketingReal(mes);
  const ads = await getMetaAds(mes);
  const c = raw.contenido;
  const kpi = (id, label, value, format, nota, sourceId = 'mkt_crm') => ({
    id, label, value, format, previous: null, sourceId, updatedAt: raw.generadoAt, nota,
  });

  return {
    campanias: ads.campanias,
    gastoCanal: ads.gastoCanal,
    gastoDiario: [],
    umbrales: ads.umbrales,
    inversionAds: raw.ads.gastoUsd,
    instagram: {
      publicaciones: c.publicaciones,
      totales: { reels: c.reels, reproducciones: c.reproducciones, alcance: c.alcance, interacciones: c.interacciones },
    },
    contenido: c,
    // Las conversaciones que Instagram abrió solo, con el contenido que las trajo.
    conversaciones: raw.conversaciones ?? { total: 0, porPalabra: {}, sinPalabra: 0 },
    historias: raw.historias,
    setting: raw.setting,
    storiesActivas: raw.historias.secuencias,
    publicaciones: c.publicaciones,
    kpis: [
      kpi('reproducciones', 'Reproducciones', c.reproducciones, 'count', `${c.reels} reels publicados este mes`, 'mkt_crm'),
      kpi('alcance_ig', 'Alcance', c.alcance, 'count', `${formatValue(c.interacciones, 'count')} interacciones`, 'mkt_crm'),
      kpi('chats_historias', 'Chats de historias', raw.historias.chats, 'count', `${raw.historias.secuencias} secuencias cargadas`),
      kpi(
        'conversaciones_ig', 'Conversaciones abiertas',
        raw.conversaciones?.total ?? 0, 'count',
        'Instagram · el bot las abrió solo, sin reportarlas a mano',
      ),
      kpi('conversaciones_setting', 'Reportadas por setting', raw.setting.conversaciones, 'count', `${raw.setting.agendas} agendas`),
      kpi('inversion_ads', 'Inversión en Ads', raw.ads.gastoUsd, 'usd', `${raw.ads.conversiones} conversiones`, 'ads_manager'),
    ],
    conectado: raw.conectado,
    detalle: raw.detalle,
    syncAt: raw.generadoAt,
    fuente: 'mkt_crm',
    mes: raw.mes,
  };
}

/** Los onboardings reales de ATV Onboarding: quién entró y en qué etapa está. */
export async function getOnboarding(mes) {
  const q = new URLSearchParams();
  if (mes) q.set('mes', mes);
  const raw = await pedir(`/api/ventas/onboarding${q.toString() ? `?${q}` : ''}`);
  const m = raw.delMes;
  const h = raw.historico;

  const procesos = (m.sesiones ?? []).map((s) => ({
    id: s.id,
    tipo: 'cliente',
    nombre: s.cliente,
    plan: s.plan,
    etapa: s.etapa,
    iniciadoAt: s.creadoAt,
    cerradoAt: s.llamadaHechaAt,
    diasTranscurridos: s.diasHastaLlamada ?? s.diasHastaFormulario ?? 0,
    formulario: s.formulario,
    discord: s.discord,
    skool: s.skool,
  }));

  const kpi = (id, label, value, objetivo, nota) => ({
    id, label, value: value ?? 0, format: 'days', previous: null, objetivo,
    sourceId: 'atv_clients', updatedAt: raw.generadoAt, good: 'down', serie: [], nota,
  });

  return {
    procesos,
    duracion: [],
    delMes: m,
    historico: h,
    conectado: raw.conectado,
    detalle: raw.detalle,
    kpis: [
      kpi('onboarding_cliente', 'Acceso → formulario', h.medianaFormularioDias, 1,
        `Mediana histórica sobre ${h.conFormulario} onboardings.`),
      kpi('onboarding_llamada', 'Acceso → llamada hecha', h.medianaLlamadaDias, 7,
        `${h.conLlamadaHecha} de ${h.total} llegaron a la llamada.`),
      // El onboarding de staff no tiene fuente todavía.
      kpi('onboarding_staff', 'Contrato → primer día productivo', 0, 10, 'Sin fuente conectada.'),
    ],
    syncAt: raw.generadoAt,
    mes: raw.mes,
  };
}

export async function getSistemas() {
  const cobertura = coberturaAutomatizacion();
  return responder({
    fuentes: SOURCE_LIST,
    campos: DATA_FIELDS,
    cobertura,
  });
}

export async function getMetas() {
  const hoy = ahora();
  const mes = mesId(hoy);
  const diasMes = diasDelMes(mes);
  const diaHoy = diaDentroDelMes(hoy, mes);
  const mkt = await getMktResumen(mes).catch(() => null);

  // El embudo sale del CRM; las metas por área viven en el decreto (vista Metas).
  const embudo = [
    { id: 'conversaciones', label: 'Conversaciones', valor: mkt?.conversaciones ?? 0 },
    { id: 'aplicaciones', label: 'Links enviados', valor: mkt?.aplicaciones ?? 0 },
    { id: 'agendas', label: 'Agendas', valor: mkt?.agendas ?? 0 },
    { id: 'shows', label: 'Shows', valor: mkt?.shows ?? 0 },
    { id: 'cierres', label: 'Cierres', valor: mkt?.cierres ?? 0 },
  ];

  return {
    mes: { id: mes, nombre: nombreMesAnio(hoy), dia: diaHoy, dias: diasMes, fraccion: diaHoy / diasMes },
    semana: `S${semanaIso(hoy)}`,
    metas: [],
    embudo,
    syncAt: mkt?.syncAt ?? null,
  };
}

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

/**
 * Resumen comercial del mes con datos reales: el setting sale de los reportes diarios,
 * y las agendas, cierres y cash del CRM. Lo que no tenga fuente queda en cero.
 */
export async function getMktResumen(mes) {
  const [ventas, marketing] = await Promise.all([
    getVentasReal(mes).catch(() => null),
    getMarketingReal(mes).catch(() => null),
  ]);
  const v = ventas?.actual ?? {};
  return {
    mes: ventas?.mes ?? marketing?.mes ?? mes,
    chats: marketing?.setting?.conversaciones ?? 0,
    conversaciones: marketing?.setting?.conversaciones ?? 0,
    aplicaciones: marketing?.setting?.linksEnviados ?? 0,
    agendas: v.agendados ?? 0,
    shows: v.shows ?? 0,
    cierres: v.cierres ?? 0,
    cash: v.cashUsd ?? 0,
    inversionAds: marketing?.ads?.gastoUsd ?? 0,
    syncAt: ventas?.generadoAt ?? marketing?.generadoAt ?? null,
    fuente: 'Base de ATV Ops',
  };
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
  const q = new URLSearchParams();
  if (mes) q.set('mes', mes);
  const raw = await pedir(`/api/ventas/cobranza${q.toString() ? `?${q}` : ''}`);
  const ctx = contextoDeMes(mes || raw.mes || mesId());
  const m = raw.delMes;

  const cuotas = (raw.cuotas ?? []).map((c) => ({
    id: c.id,
    cliente: c.cliente,
    plan: c.plan,
    montoUsd: c.montoUsd,
    venceAt: c.venceAt,
    estado: c.estado === 'pagada' ? 'pagada' : c.estado,
    pagadaAt: c.pagoAt,
    diasAtraso: c.diasVencida ?? 0,
    responsable: c.responsable,
  }));

  const kpi = (id, label, value, format, nota, objetivo) => ({
    id, label, value, format, previous: null, objetivo,
    sourceId: 'atv_clients', updatedAt: raw.generadoAt, nota,
  });

  return {
    cuotas,
    vencidas: { n: raw.vencidas.length, usd: m.vencidoUsd, detalle: `${raw.vencidas.length} cuotas vencidas sin pagar` },
    porVencerSemana: {
      n: (raw.proximas ?? []).filter((c) => diasEntre(new Date().toISOString(), c.venceAt) <= 7).length,
      usd: (raw.proximas ?? [])
        .filter((c) => diasEntre(new Date().toISOString(), c.venceAt) <= 7)
        .reduce((s, c) => s + c.montoUsd, 0),
    },
    cobrado: m.cobradoUsd,
    esperadoHoy: Math.round((m.totalUsd * ctx.diaHoy) / ctx.diasMes),
    totalMes: m.totalUsd,
    ritmoCobro: ritmo({ meta: m.totalUsd, actual: m.cobradoUsd, diasMes: ctx.diasMes, diaHoy: ctx.diaHoy }),
    pctSobreVencido: m.pctCobrado,
    kpis: [
      kpi('cobrado_mes', 'Cobrado del mes', m.cobradoUsd, 'usd', `${m.pctCobrado}% de ${formatValue(m.totalUsd, 'usd')} a cobrar`, m.totalUsd),
      kpi('pendiente_mes', 'Pendiente del mes', m.pendienteUsd, 'usd', `${m.cuotas} cuotas con vencimiento este mes`),
      kpi('vencido', 'Vencido sin cobrar', m.vencidoUsd, 'usd', `${raw.vencidas.length} cuotas pasadas de fecha`),
      kpi('deuda_cartera', 'Deuda de la cartera', raw.cartera.deudaUsd, 'usd', `${raw.cartera.vigentes} clientes vigentes de ${raw.cartera.clientes}`),
    ],
    cartera: raw.cartera,
    proximas: raw.proximas ?? [],
    listaVencidas: raw.vencidas ?? [],
    conectado: raw.conectado,
    detalle: raw.detalle,
    syncAt: raw.generadoAt,
    mes: raw.mes,
    fuente: 'ATV Clients',
  };
}

export async function getGrietas() {
  // Sin fuente conectada: se muestran en cero en vez de datos inventados.
  return { grietas: [], pedidos: [], pedidosSemana: [] };
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
      sourceId: 'mkt_crm',
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
      sourceId: 'mkt_crm',
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
      sourceId: 'mkt_crm',
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
      sourceId: 'mkt_crm',
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
        sourceId: 'manual',
        updatedAt: new Date().toISOString(),
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
export async function getAgendaVentas({ dias = 14, diasAtras = 1, refrescar = false, desde, hasta } = {}) {
  // Con desde/hasta se pide el rango que la vista está mostrando; si no, una ventana alrededor de hoy.
  const rango = desde && hasta ? `&desde=${desde}&hasta=${hasta}` : '';
  return pedir(`/api/calendario-ventas?dias=${dias}&diasAtras=${diasAtras}${rango}${refrescar ? '&refrescar=true' : ''}`);
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
export async function getLlamadosAgenda({ dias = 21, diasAtras = 7, refrescar = false, desde, hasta } = {}) {
  const agenda = await getAgendaVentas({ dias, diasAtras, refrescar, desde, hasta });
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
