/**
 * Metas mensuales Marketing ↔ Ventas: avance vs ritmo y diagnóstico de embudo.
 *
 * El ritmo usa meta × días_transcurridos / días_del_mes (no penaliza el total
 * del mes a mitad de camino). El diagnóstico compara tasas implícitas del
 * decreto vs tasas reales entre etapas consecutivas.
 */

/**
 * @typedef {object} DecretoMes
 * @property {string} mes
 * @property {number} chats
 * @property {number} conversaciones
 * @property {number} agendas
 * @property {number} agendasOrganicas
 * @property {number} agendasAds
 * @property {number} showUpRate
 * @property {number} closeRateBueno
 * @property {number} closeRateMuyBueno
 * @property {number} inversionAds
 * @property {number} cashMeta
 * @property {number} cashAds
 * @property {number} cashOrganico
 * @property {string} [creadoAt]
 * @property {string} [creadoPor]
 */

/**
 * @typedef {object} RealMes
 * @property {number} chats
 * @property {number} conversaciones
 * @property {number} agendas
 * @property {number} agendasOrganicas
 * @property {number} agendasAds
 * @property {number} shows
 * @property {number} cierres
 * @property {number} inversionAds
 * @property {number} cash
 * @property {number} cashAds
 * @property {number} cashOrganico
 * @property {string} [syncAt]
 * @property {string} [fuente]
 */

/**
 * @typedef {'ok' | 'warn' | 'alert'} ZonaRitmo
 * @typedef {'volumen' | 'tasa' | 'plata'} TipoMetrica
 *
 * @typedef {object} FilaAvance
 * @property {string} id
 * @property {string} label
 * @property {TipoMetrica} tipo
 * @property {string} format
 * @property {number} meta
 * @property {number} real
 * @property {number} esperado
 * @property {number} delta
 * @property {number} pctRitmo
 * @property {ZonaRitmo} zona
 * @property {string} [grupo]
 */

/**
 * @typedef {object} AlertaDiagnostico
 * @property {string} id
 * @property {'alert' | 'warn' | 'ok'} severidad
 * @property {string} titulo
 * @property {string} mensaje
 * @property {string} [etapa]
 */

/** Zona: verde ≥0, amarillo hasta −10%, rojo peor. */
export function zonaRitmo(pctRitmo) {
  if (pctRitmo >= 1) return 'ok';
  if (pctRitmo >= 0.9) return 'warn';
  return 'alert';
}

export function tasasImplicitas(decreto) {
  return {
    chatAConv: decreto.chats ? decreto.conversaciones / decreto.chats : 0,
    convAAgenda: decreto.conversaciones ? decreto.agendas / decreto.conversaciones : 0,
    agendaAShow: (decreto.showUpRate || 0) / 100,
    showACierre: (decreto.closeRateBueno || 0) / 100,
  };
}

export function tasasReales(real) {
  return {
    chatAConv: real.chats ? real.conversaciones / real.chats : 0,
    convAAgenda: real.conversaciones ? real.agendas / real.conversaciones : 0,
    agendaAShow: real.agendas ? real.shows / real.agendas : 0,
    showACierre: real.shows ? real.cierres / real.shows : 0,
  };
}

/**
 * @param {{ meta: number, real: number, diasMes: number, diaHoy: number, tipo: TipoMetrica }} p
 */
function filaBase({ id, label, meta, real, diasMes, diaHoy, tipo, format, grupo }) {
  const fraccion = diasMes > 0 ? Math.min(1, Math.max(0, diaHoy / diasMes)) : 0;
  // Tasas: el "esperado" es el target del decreto (no se pacea por día).
  const esperado = tipo === 'tasa' ? meta : meta * fraccion;
  const delta = real - esperado;
  const pctRitmo = esperado > 0 ? real / esperado : real > 0 ? 2 : 1;
  return {
    id,
    label,
    tipo,
    format,
    meta,
    real,
    esperado,
    delta,
    pctRitmo,
    zona: zonaRitmo(pctRitmo),
    grupo,
  };
}

/**
 * @param {DecretoMes} decreto
 * @param {RealMes} real
 * @param {{ diasMes: number, diaHoy: number }} ctx
 * @param {'full' | 'marketing'} [modo]
 * @returns {FilaAvance[]}
 */
export function calcularAvance(decreto, real, ctx, modo = 'full') {
  const { diasMes, diaHoy } = ctx;
  const showUpReal = real.agendas ? (real.shows / real.agendas) * 100 : 0;
  const closeReal = real.shows ? (real.cierres / real.shows) * 100 : 0;

  /** @type {FilaAvance[]} */
  const filas = [
    filaBase({
      id: 'chats',
      label: 'Chats',
      meta: decreto.chats,
      real: real.chats,
      diasMes,
      diaHoy,
      tipo: 'volumen',
      format: 'count',
      grupo: 'embudo',
    }),
    filaBase({
      id: 'conversaciones',
      label: 'Conversaciones',
      meta: decreto.conversaciones,
      real: real.conversaciones,
      diasMes,
      diaHoy,
      tipo: 'volumen',
      format: 'count',
      grupo: 'embudo',
    }),
    filaBase({
      id: 'agendas',
      label: 'Agendas',
      meta: decreto.agendas,
      real: real.agendas,
      diasMes,
      diaHoy,
      tipo: 'volumen',
      format: 'count',
      grupo: 'embudo',
    }),
    filaBase({
      id: 'agendas_ads',
      label: 'Agendas ads',
      meta: decreto.agendasAds,
      real: real.agendasAds,
      diasMes,
      diaHoy,
      tipo: 'volumen',
      format: 'count',
      grupo: 'split',
    }),
    filaBase({
      id: 'agendas_organicas',
      label: 'Agendas orgánicas',
      meta: decreto.agendasOrganicas,
      real: real.agendasOrganicas,
      diasMes,
      diaHoy,
      tipo: 'volumen',
      format: 'count',
      grupo: 'split',
    }),
    filaBase({
      id: 'show_up',
      label: 'Show-up',
      meta: decreto.showUpRate,
      real: Math.round(showUpReal * 10) / 10,
      diasMes,
      diaHoy,
      tipo: 'tasa',
      format: 'pct',
      grupo: 'tasas',
    }),
    filaBase({
      id: 'close_bueno',
      label: 'Close rate',
      meta: decreto.closeRateBueno,
      real: Math.round(closeReal * 10) / 10,
      diasMes,
      diaHoy,
      tipo: 'tasa',
      format: 'pct',
      grupo: 'tasas',
    }),
    filaBase({
      id: 'inversion',
      label: 'Inversión ads',
      meta: decreto.inversionAds,
      real: real.inversionAds,
      diasMes,
      diaHoy,
      tipo: 'plata',
      format: 'usd',
      grupo: 'plata',
    }),
    filaBase({
      id: 'cash',
      label: 'Cash',
      meta: decreto.cashMeta,
      real: real.cash,
      diasMes,
      diaHoy,
      tipo: 'plata',
      format: 'usd',
      grupo: 'plata',
    }),
    filaBase({
      id: 'cash_ads',
      label: 'Cash ads',
      meta: decreto.cashAds,
      real: real.cashAds,
      diasMes,
      diaHoy,
      tipo: 'plata',
      format: 'usd',
      grupo: 'split',
    }),
    filaBase({
      id: 'cash_organico',
      label: 'Cash orgánico',
      meta: decreto.cashOrganico,
      real: real.cashOrganico,
      diasMes,
      diaHoy,
      tipo: 'plata',
      format: 'usd',
      grupo: 'split',
    }),
  ];

  if (modo === 'marketing') {
    // Sin ads: top of funnel + orgánico.
    return filas.filter((f) =>
      ['chats', 'conversaciones', 'agendas', 'agendas_organicas'].includes(f.id),
    );
  }
  if (modo === 'ads') {
    return filas.filter((f) =>
      ['agendas_ads', 'inversion', 'cash_ads'].includes(f.id),
    );
  }
  return filas;
}

/**
 * Diagnóstico: dónde está el cuello (tasas), no solo el gap de volumen.
 * @param {DecretoMes} decreto
 * @param {RealMes} real
 * @param {{ diasMes: number, diaHoy: number }} ctx
 * @returns {AlertaDiagnostico[]}
 */
export function calcularDiagnostico(decreto, real, ctx) {
  const avance = calcularAvance(decreto, real, ctx, 'full');
  const porId = Object.fromEntries(avance.map((f) => [f.id, f]));
  const metaT = tasasImplicitas(decreto);
  const realT = tasasReales(real);
  /** @type {AlertaDiagnostico[]} */
  const alertas = [];

  const caida = (realRate, metaRate) => metaRate - realRate;
  const pctPts = (x) => Math.round(x * 1000) / 10; // 0.80 → 80.0

  // 1) Chats OK / adelante, pero conversión a conversación cayó
  if (porId.chats.zona !== 'alert' && caida(realT.chatAConv, metaT.chatAConv) >= 0.05) {
    alertas.push({
      id: 'diag_chat_conv',
      severidad: caida(realT.chatAConv, metaT.chatAConv) >= 0.1 ? 'alert' : 'warn',
      etapa: 'chats → conversaciones',
      titulo: 'Volumen de chats OK; se pierde en la respuesta',
      mensaje: `El volumen de chats va ${porId.chats.zona === 'ok' ? 'en ritmo o arriba' : 'cerca'}, pero la conversión a conversación bajó de ${pctPts(metaT.chatAConv)}% a ${pctPts(realT.chatAConv)}%. El problema no es generar más chats, es responder mejor los que ya entran.`,
    });
  }

  // 2) Conversaciones OK, agendas no (tasa o volumen)
  if (
    porId.conversaciones.zona !== 'alert'
    && (porId.agendas.zona === 'alert' || caida(realT.convAAgenda, metaT.convAAgenda) >= 0.02)
  ) {
    alertas.push({
      id: 'diag_conv_agenda',
      severidad: porId.agendas.zona === 'alert' ? 'alert' : 'warn',
      etapa: 'conversaciones → agendas',
      titulo: 'Se pierden agendas en conversaciones ya calificadas',
      mensaje: `Conversaciones van razonables, pero agendas no acompañan (meta implícita ${pctPts(metaT.convAAgenda)}% · real ${pctPts(realT.convAAgenda)}%). Revisar seguimiento post-conversación, no top of funnel.`,
    });
  }

  // 3) Agendas OK, show-up cae
  if (porId.agendas.zona !== 'alert' && caida(realT.agendaAShow, metaT.agendaAShow) >= 0.03) {
    alertas.push({
      id: 'diag_show',
      severidad: caida(realT.agendaAShow, metaT.agendaAShow) >= 0.08 ? 'alert' : 'warn',
      etapa: 'agendas → shows',
      titulo: 'El problema es asistencia, no generación de agenda',
      mensaje: `Show-up bajó de ${pctPts(metaT.agendaAShow)}% a ${pctPts(realT.agendaAShow)}% con agendas en ritmo. Reforzar recordatorios y confirmación previa a la call.`,
    });
  }

  // 4) Shows OK (volumen derivado), close rate cae bajo "bueno"
  const showsEsperado = decreto.agendas * (decreto.showUpRate / 100) * (ctx.diaHoy / ctx.diasMes);
  const showsEnRitmo = showsEsperado <= 0 || real.shows / showsEsperado >= 0.9;
  if (showsEnRitmo && realT.showACierre < metaT.showACierre - 0.03) {
    alertas.push({
      id: 'diag_close',
      severidad: realT.showACierre < metaT.showACierre - 0.08 ? 'alert' : 'warn',
      etapa: 'shows → cierres',
      titulo: 'El problema es cierre, no oportunidades',
      mensaje: `Close rate en ${pctPts(realT.showACierre)}% vs meta buena ${pctPts(metaT.showACierre)}% (muy bueno ${decreto.closeRateMuyBueno}%). Auditar el pitch o hacer role-play con el equipo.`,
    });
  }

  // 5) Si no hubo cuello de tasa pero hay volumen crítico en cash
  if (!alertas.length && porId.cash.zona === 'alert') {
    alertas.push({
      id: 'diag_cash',
      severidad: 'alert',
      etapa: 'cash',
      titulo: 'Cash abajo del ritmo del mes',
      mensaje: `Llevás ${Math.round(porId.cash.pctRitmo * 100)}% del ritmo esperado a día ${ctx.diaHoy}. Revisar embudo completo: hoy no hay un cuello de tasa dominante — falta volumen o ticket.`,
    });
  }

  // 6) Todo OK
  if (!alertas.length) {
    const peores = [...avance].filter((f) => f.grupo === 'embudo' || f.id === 'cash').sort((a, b) => a.pctRitmo - b.pctRitmo);
    const peor = peores[0];
    alertas.push({
      id: 'diag_ok',
      severidad: 'ok',
      titulo: 'Sin cuello de botella claro',
      mensaje: peor
        ? `Las tasas del embudo están cerca de la meta. El punto más flojo vs ritmo es ${peor.label.toLowerCase()} (${Math.round(peor.pctRitmo * 100)}% del esperado a hoy).`
        : 'El mes viene alineado al decreto.',
    });
  }

  const peso = { alert: 0, warn: 1, ok: 2 };
  return alertas.sort((a, b) => peso[a.severidad] - peso[b.severidad]).slice(0, 4);
}

/* ----------------------------- persistencia local ----------------------------- */

const STORAGE_KEY = 'atv-ops:decretos-por-mes';
const LEGACY_KEY = 'atv-ops:decreto-metas';

/** @returns {Record<string, DecretoMes>} */
export function leerDecretos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !parsed.mes) return parsed;
      if (parsed?.mes) return { [parsed.mes]: parsed };
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const d = JSON.parse(legacy);
      if (d?.mes) {
        const map = { [d.mes]: d };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
        return map;
      }
    }
  } catch {
    /* ignore */
  }
  return {};
}

/** @param {string} [mes] */
export function leerDecretoGuardado(mes) {
  const map = leerDecretos();
  if (mes) return map[mes] ?? null;
  const keys = Object.keys(map).sort();
  return keys.length ? map[keys[keys.length - 1]] : null;
}

/**
 * @param {DecretoMes} decreto
 * @param {{ forzar?: boolean }} [opts]
 */
export function guardarDecreto(decreto, opts = {}) {
  if (!decreto?.mes) throw new Error('Falta el mes del decreto.');
  if (mesEsInmutable(decreto.mes) && !opts.forzar) {
    const err = new Error(`El decreto de ${decreto.mes} ya es histórico e inmutable.`);
    err.code = 'INMUTABLE';
    throw err;
  }
  const map = leerDecretos();
  const prev = map[decreto.mes];
  const payload = {
    ...decreto,
    creadoAt: new Date().toISOString(),
    creadoPor: decreto.creadoPor || prev?.creadoPor || 'Equipo',
  };
  map[decreto.mes] = payload;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  return payload;
}

export function mesEsInmutable(mesIdStr, hoy = new Date()) {
  const actual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  return mesIdStr < actual;
}

/** Plantilla para un mes sin decreto guardado. */
export function decretoPlantilla(mes, base = null) {
  const src = base || {
    chats: 1500,
    conversaciones: 1200,
    agendas: 160,
    agendasOrganicas: 100,
    agendasAds: 60,
    showUpRate: 80,
    closeRateBueno: 35,
    closeRateMuyBueno: 40,
    inversionAds: 3000,
    cashMeta: 100000,
    cashAds: 30000,
    cashOrganico: 70000,
  };
  return {
    ...src,
    mes,
    creadoAt: undefined,
    creadoPor: undefined,
  };
}

/** Validación liviana del formulario. */
export function validarDecreto(d) {
  const errores = [];
  if (!d.chats || d.chats < 1) errores.push('Chats');
  if (!d.conversaciones || d.conversaciones < 1) errores.push('Conversaciones');
  if (!d.agendas || d.agendas < 1) errores.push('Agendas');
  if ((d.agendasOrganicas || 0) + (d.agendasAds || 0) !== Number(d.agendas)) {
    errores.push('Split de agendas debe sumar el total');
  }
  if ((d.cashAds || 0) + (d.cashOrganico || 0) !== Number(d.cashMeta)) {
    errores.push('Split de cash debe sumar el total');
  }
  if (d.showUpRate < 1 || d.showUpRate > 100) errores.push('Show-up');
  if (d.closeRateBueno < 1 || d.closeRateBueno > 100) errores.push('Close bueno');
  if (d.closeRateMuyBueno < d.closeRateBueno) errores.push('Close muy bueno ≥ bueno');
  return errores;
}
