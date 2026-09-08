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
import { LLAMADOS, SEMANAS } from './mock/ventas.js';
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
import { calcularSalud, BLOCKERS } from '../lib/scoring.js';

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
      detalle: detalleDe([...activados].sort((a, b) => (b.activacion.primerResultadoAt ?? '').localeCompare(a.activacion.primerResultadoAt ?? '')), (c) => (c.activacion.primerResultadoAt ? formatFecha(c.activacion.primerResultadoAt) : null), () => 'ok', 'Clientes con resultado detectado en el canal.'),
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
      detalle: detalleDe([...silencio].sort((a, b) => b.engagement.diasSinMensaje - a.engagement.diasSinMensaje), (c) => `${c.engagement.diasSinMensaje} d sin mensaje`, (c) => (c.engagement.diasSinMensaje >= 14 ? 'alert' : 'warn'), 'Canales sin mensaje del cliente hace 7 días o más.'),
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

/** Cohortes por mes de entrada, solo con lo que ya sabemos del canal. */
function cohortesDesdeClientes(clientes) {
  /** @type {Record<string, { mes: string, entraron: number, activados30: number, dias: number[] }>} */
  const porMes = {};
  for (const c of clientes) {
    const mes = (c.entradaAt ?? '').slice(0, 7);
    if (!mes) continue;
    if (!porMes[mes]) porMes[mes] = { mes, entraron: 0, activados30: 0, dias: [] };
    porMes[mes].entraron += 1;
    if (c.activacion.activado && (c.activacion.diasHastaResultado ?? 99) <= 30) {
      porMes[mes].activados30 += 1;
    }
    if (c.activacion.activado && c.activacion.diasHastaResultado != null) {
      porMes[mes].dias.push(c.activacion.diasHastaResultado);
    }
  }
  return Object.values(porMes)
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((c) => ({
      mes: c.mes,
      entraron: c.entraron,
      activados30: c.activados30,
      medianaDias: c.dias.length ? mediana(c.dias) : 0,
    }));
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
  const clientes = clientesConSalud(cartera.clientes);
  const activos = clientes.filter((c) => c.estado === 'activo');
  const hoy = ahora().toISOString();
  const computedAt = hoy;

  const elegibles = activos.filter(
    (c) => c.activacion.activado || diasEntre(c.entradaAt, hoy) > 30,
  );
  const activadosEnVentana = elegibles.filter(
    (c) => c.activacion.activado && (c.activacion.diasHastaResultado ?? 99) <= 30,
  );
  const sinActivar = activos.filter((c) => !c.activacion.activado);
  const pctActivacion = elegibles.length ? (activadosEnVentana.length / elegibles.length) * 100 : 0;
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

  /** @type {Record<string, import('./types.js').Metric[]>} */
  const kpis = {
    activacion: [
      {
        id: 'activacion_30d',
        detalle: detalleDe(activadosEnVentana, (c) => `${c.activacion.diasHastaResultado ?? '?'} d`, () => 'ok', 'Clientes con win detectado dentro de los 30 días de entrada.'),
        label: 'Activados en 30 días',
        value: pctActivacion,
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
    cohortes: cohortesDesdeClientes(clientes),
    blockers: {},
    candidatos,
    sinActivar,
    silencio,
    caidaFuerte,
    sinActivarFuera,
    churnIntent,
    winsRecientes,
    momentumPos,
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
  const cliente = { ...data.cliente, salud: calcularSalud(data.cliente) };
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
    actividad: data.actividad,
    senales,
    blocker,
    semaforo: SEMAFORO[cliente.salud.semaforo],
  };
}

/* ------------------------------------------------------------------ ventas */

export async function getVentas() {
  const actual = SEMANAS[SEMANAS.length - 1];
  const previa = SEMANAS[SEMANAS.length - 2];

  const closeRate = (actual.cierres / (actual.shows || 1)) * 100;
  const closeRatePrevio = (previa.cierres / (previa.shows || 1)) * 100;
  const showRate = (actual.shows / (actual.agendados || 1)) * 100;
  const showRatePrevio = (previa.shows / (previa.agendados || 1)) * 100;

  /** @type {Metric[]} */
  const kpis = [
    {
      id: 'llamados_agendados',
      label: 'Llamados agendados',
      value: actual.agendados,
      format: 'count',
      previous: previa.agendados,
      sourceId: 'calendly',
      updatedAt: SYNC.cal,
      serie: SEMANAS.map((s) => s.agendados),
      nota: 'Semana S37 (7–13 sep), la última cerrada.',
    },
    {
      id: 'close_rate',
      label: 'Close rate',
      value: closeRate,
      format: 'pct',
      previous: closeRatePrevio,
      sourceId: 'manual',
      updatedAt: SYNC.man,
      objetivo: 25,
      serie: SEMANAS.map((s) => (s.cierres / (s.shows || 1)) * 100),
      nota: 'Cierres sobre llamados con show.',
    },
    {
      id: 'cash_collected',
      label: 'Cash collected',
      value: actual.cashUsd,
      format: 'usd',
      previous: previa.cashUsd,
      sourceId: 'manual',
      updatedAt: SYNC.man,
      serie: SEMANAS.map((s) => s.cashUsd),
      nota: 'Cargado a mano los lunes. Es la grieta más cara del tablero.',
    },
    {
      id: 'show_rate',
      label: 'Show up',
      value: showRate,
      format: 'pct',
      previous: showRatePrevio,
      sourceId: 'calendly',
      updatedAt: SYNC.cal,
      objetivo: 65,
      serie: SEMANAS.map((s) => (s.shows / (s.agendados || 1)) * 100),
    },
  ];

  return responder({ semanas: SEMANAS, llamados: LLAMADOS, kpis });
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
