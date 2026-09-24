/**
 * Las tres fases de un webinar: Registro → Día → Post.
 *
 * Cada fase tiene métricas, un número de portada y un semáforo contra benchmarks
 * de cold traffic. El funnel math conecta una fase con la siguiente.
 */

/** @typedef {'ok' | 'warn' | 'alert' | 'off'} Semaforo */

/**
 * Qué significa cada benchmark, para poder editarlos sin adivinar.
 *
 * `sentido` es lo único que no se ve en el número: en el costo por registrante menos es
 * mejor, en todos los demás más es mejor. Sin eso, un formulario de umbrales invita a
 * cargarlos al revés.
 *
 * Los valores de `BENCHMARKS_COLD` son de tráfico frío y sirven como punto de partida:
 * cada webinar puede pisar los que quiera y dejar el resto en el estándar. Un webinar a
 * lista caliente o de otro rubro tiene otros números, y esto es lo que deja cambiarlos
 * sin tocar código.
 */
export const BENCHMARKS_META = [
  { key: 'costoPorRegistrante', label: 'Costo por registrante', unidad: 'usd', sentido: 'menos' },
  { key: 'showRate', label: 'Show rate', unidad: 'pct', sentido: 'mas' },
  { key: 'retencionPitch', label: 'Retención al pitch', unidad: 'pct', sentido: 'mas' },
  { key: 'bookingRate', label: 'Booking rate', unidad: 'pct', sentido: 'mas' },
  { key: 'closeRateCalls', label: 'Close rate de llamadas', unidad: 'pct', sentido: 'mas' },
  { key: 'pifRate', label: 'PIF rate', unidad: 'pct', sentido: 'mas' },
];

/** Los dos umbrales de un benchmark, con el nombre que le toca según su sentido. */
export function umbralesDe(meta) {
  return meta.sentido === 'menos'
    ? { verde: 'verdeMax', amarillo: 'amarilloMax', ayudaVerde: 'verde por debajo de', ayudaAmarillo: 'amarillo hasta' }
    : { verde: 'verdeMin', amarillo: 'amarilloMin', ayudaVerde: 'verde desde', ayudaAmarillo: 'amarillo desde' };
}

export const BENCHMARKS_COLD = {
  // Fase 1 — portada: costo por registrante (USD). Verde < $10, amarillo $10–15, rojo > $15
  costoPorRegistrante: { verdeMax: 10, amarilloMax: 15 },
  // Fase 2 — show rate. Verde > 40%, amarillo 25–40%, rojo < 25%
  showRate: { verdeMin: 40, amarilloMin: 25 },
  // Retención al pitch (% del pico). Verde > 30%, amarillo 20–30%, rojo < 20%
  retencionPitch: { verdeMin: 30, amarilloMin: 20 },
  // Booking de los que llegaron al pitch. Verde > 25%, amarillo 15–25%, rojo < 15%
  bookingRate: { verdeMin: 25, amarilloMin: 15 },
  // Fase 3 — close rate. Verde > 30%, amarillo 20–30%, rojo < 20%
  closeRateCalls: { verdeMin: 30, amarilloMin: 20 },
  // PIF rate. Verde > 60%, amarillo 30–60%, rojo < 30%
  pifRate: { verdeMin: 60, amarilloMin: 30 },
};

const FASES_META = [
  {
    id: 'registro',
    n: 1,
    titulo: 'Registro',
    desde: 'Cuando el ad se sirve',
    hasta: 'Cuando agenda el webinar',
    portada: 'costoPorRegistrante',
    portadaLabel: 'Costo / registrante',
    cuello: 'El cuello más común es optin → registros. Si hay muchos optins y pocos registros, el problema está en la thank you page, no en el ad.',
  },
  {
    id: 'dia',
    n: 2,
    titulo: 'Día del webinar',
    desde: 'Cuando arranca el en vivo',
    hasta: 'Cuando cerrás el pitch',
    portada: 'showRate',
    portadaLabel: 'Show rate',
    cuello: 'Por debajo de 20% el problema es follow-up pre-webinar o calidad de registro. La retención al pitch tiene que superar el 20% del pico.',
  },
  {
    id: 'post',
    n: 3,
    titulo: 'Post-webinar',
    desde: 'Cuando termina el webinar',
    hasta: 'Closing de las llamadas agendadas',
    portada: 'cashUsd',
    portadaLabel: 'Cash collected',
    cuello: 'El cash collected es lo que el webinar realmente generó. Un close rate alto con poco cash no salva el evento.',
  },
];

export const CAMPOS_RAW = [
  // Fase 1
  { key: 'impresiones', label: 'Impresiones', fase: 'registro', tipo: 'count' },
  { key: 'clicks', label: 'Clicks', fase: 'registro', tipo: 'count' },
  { key: 'gastoAdsUsd', label: 'Gasto ads (USD)', fase: 'registro', tipo: 'usd' },
  { key: 'visitasLanding', label: 'Visitas landing', fase: 'registro', tipo: 'count' },
  { key: 'optins', label: 'Opt-ins', fase: 'registro', tipo: 'count' },
  { key: 'thankYou', label: 'Thank you page', fase: 'registro', tipo: 'count' },
  { key: 'registros', label: 'Registros webinar', fase: 'registro', tipo: 'count' },
  { key: 'entradasWhatsapp', label: 'Entradas WhatsApp', fase: 'registro', tipo: 'count' },
  { key: 'agendasWebinar', label: 'Agendó el webinar', fase: 'registro', tipo: 'count' },
  // Fase 2
  { key: 'vivos', label: 'Vivos (show)', fase: 'dia', tipo: 'count' },
  { key: 'picoConcurrentes', label: 'Pico concurrentes', fase: 'dia', tipo: 'count' },
  { key: 'retenidosPitch', label: 'Retenidos al pitch', fase: 'dia', tipo: 'count' },
  { key: 'booked', label: 'Booked / compraron', fase: 'dia', tipo: 'count' },
  // Fase 3
  { key: 'llamadasAgendadas', label: 'Llamadas agendadas', fase: 'post', tipo: 'count' },
  { key: 'showsLlamadas', label: 'Shows de llamadas', fase: 'post', tipo: 'count' },
  { key: 'cierres', label: 'Cierres', fase: 'post', tipo: 'count' },
  { key: 'cashUsd', label: 'Cash collected (USD)', fase: 'post', tipo: 'usd' },
  { key: 'pif', label: 'PIF (pagos completos)', fase: 'post', tipo: 'count' },
];

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function tasa(a, b) {
  return b > 0 ? Math.round((a / b) * 1000) / 10 : null;
}

function money(a, b) {
  return b > 0 ? Math.round((a / b) * 100) / 100 : null;
}

function peorSemaforo(...vals) {
  const orden = { alert: 0, warn: 1, ok: 2, off: 3 };
  return vals.sort((a, b) => orden[a] - orden[b])[0];
}

/** Semáforo para métricas “más bajo = mejor” (costo). */
function semaforoBajo(valor, { verdeMax, amarilloMax }) {
  if (valor == null) return 'off';
  if (valor < verdeMax) return 'ok';
  if (valor <= amarilloMax) return 'warn';
  return 'alert';
}

/** Semáforo para métricas “más alto = mejor” (tasas). Umbrales estrictos: verde > verdeMin. */
function semaforoAlto(valor, { verdeMin, amarilloMin }) {
  if (valor == null) return 'off';
  if (valor > verdeMin) return 'ok';
  if (valor >= amarilloMin) return 'warn';
  return 'alert';
}

/** Cash vs meta: verde ≥ meta, amarillo 50–100%, rojo < 50%. */
function semaforoCash(cash, meta) {
  if (meta == null || meta <= 0) return cash > 0 ? 'ok' : 'off';
  if (cash == null) return 'off';
  if (cash >= meta) return 'ok';
  if (cash >= meta * 0.5) return 'warn';
  return 'alert';
}

/**
 * Normaliza métricas crudas + derivadas del funnel.
 * @param {Record<string, number>} raw
 * @param {number} [gastoAdsOverride] gasto de Meta si ya se sumó afuera
 */
export function derivarMetricas(raw = {}, gastoAdsOverride) {
  const m = { ...raw };
  const gasto = gastoAdsOverride != null ? n(gastoAdsOverride) : n(m.gastoAdsUsd);
  const impresiones = n(m.impresiones);
  const clicks = n(m.clicks);
  const visitas = n(m.visitasLanding);
  const optins = n(m.optins);
  const thankYou = n(m.thankYou);
  const registros = n(m.registros);
  const whatsapp = n(m.entradasWhatsapp);
  const agendas = n(m.agendasWebinar);
  const vivos = n(m.vivos || m.shows);
  const pico = n(m.picoConcurrentes);
  const retenidos = n(m.retenidosPitch);
  const booked = n(m.booked);
  const llamadas = n(m.llamadasAgendadas) || booked;
  const showsCall = n(m.showsLlamadas);
  const cierres = n(m.cierres);
  const cash = n(m.cashUsd);
  const pif = n(m.pif);

  return {
    ...m,
    gastoAdsUsd: gasto,
    impresiones,
    clicks,
    visitasLanding: visitas,
    optins,
    thankYou,
    registros,
    entradasWhatsapp: whatsapp,
    agendasWebinar: agendas,
    vivos,
    picoConcurrentes: pico,
    retenidosPitch: retenidos,
    booked,
    llamadasAgendadas: llamadas,
    showsLlamadas: showsCall,
    cierres,
    cashUsd: cash,
    pif,
    ctr: tasa(clicks, impresiones),
    cpc: money(gasto, clicks),
    conversionLanding: tasa(optins || registros, visitas),
    dropoffOptinTy: tasa(Math.max(optins - thankYou, 0), optins),
    tasaRegistro: tasa(registros, optins),
    tasaWhatsapp: tasa(whatsapp, registros),
    tasaAgendaWebinar: tasa(agendas, registros),
    costoPorRegistrante: money(gasto, registros),
    showRate: tasa(vivos, registros),
    retencionPitch: tasa(retenidos, pico || vivos),
    bookingRate: tasa(booked, retenidos || vivos),
    showRateCalls: tasa(showsCall, llamadas),
    closeRate: tasa(cierres, showsCall || llamadas),
    aov: money(cash, cierres),
    pifRate: tasa(pif, cierres),
  };
}

/**
 * Arma las tres fases con métricas, portada y semáforo.
 * @param {Record<string, number>} raw
 * @param {{ gastoAdsUsd?: number, benchmarks?: object, metaCash?: number }} [opts]
 */
/**
 * El estándar, con lo que este webinar haya pisado encima — umbral por umbral.
 *
 * La mezcla tiene que ser profunda. Con un spread plano, un webinar que solo define el
 * verde del show rate perdía el amarillo del estándar y ese umbral quedaba en
 * `undefined`: el semáforo dejaba de pintar amarillo nunca, en silencio. Se puede tocar
 * un solo umbral y que el otro siga siendo el de siempre.
 */
export function mezclarBenchmarks(propios) {
  const salida = {};
  for (const clave of Object.keys(BENCHMARKS_COLD)) {
    salida[clave] = { ...BENCHMARKS_COLD[clave], ...((propios || {})[clave] || {}) };
  }
  return salida;
}


export function fasesDeWebinar(raw = {}, opts = {}) {
  const bm = mezclarBenchmarks(opts.benchmarks);
  const m = derivarMetricas(raw, opts.gastoAdsUsd);
  const metaCash = opts.metaCash != null ? n(opts.metaCash) : 0;

  const items = {
    registro: [
      { key: 'impresiones', label: 'Impresiones', valor: m.impresiones, formato: 'count' },
      { key: 'ctr', label: 'CTR', valor: m.ctr, formato: 'pct' },
      { key: 'cpc', label: 'CPC', valor: m.cpc, formato: 'usd' },
      { key: 'visitasLanding', label: 'Tráfico landing', valor: m.visitasLanding, formato: 'count' },
      { key: 'conversionLanding', label: 'Conv. landing', valor: m.conversionLanding, formato: 'pct', ayuda: 'optins (registros) / visitas' },
      { key: 'dropoffOptinTy', label: 'Drop-off optin → TY', valor: m.dropoffOptinTy, formato: 'pct' },
      { key: 'tasaRegistro', label: 'Registro / optin', valor: m.tasaRegistro, formato: 'pct' },
      { key: 'tasaWhatsapp', label: 'Entrada WhatsApp', valor: m.tasaWhatsapp, formato: 'pct' },
      { key: 'tasaAgendaWebinar', label: 'Agendó el webinar', valor: m.tasaAgendaWebinar, formato: 'pct', ayuda: 'clicks en agendar / registros' },
      { key: 'costoPorRegistrante', label: 'Costo / registrante', valor: m.costoPorRegistrante, formato: 'usd', portada: true },
    ],
    dia: [
      { key: 'registros', label: 'Registrados', valor: m.registros, formato: 'count' },
      { key: 'vivos', label: 'Vivos', valor: m.vivos, formato: 'count' },
      { key: 'picoConcurrentes', label: 'Pico concurrentes', valor: m.picoConcurrentes, formato: 'count' },
      { key: 'retencionPitch', label: 'Retención al pitch', valor: m.retencionPitch, formato: 'pct', ayuda: '% del pico' },
      { key: 'bookingRate', label: 'Booking rate', valor: m.bookingRate, formato: 'pct', ayuda: 'de los que llegaron al pitch' },
      { key: 'booked', label: 'Booked', valor: m.booked, formato: 'count' },
      { key: 'showRate', label: 'Show rate', valor: m.showRate, formato: 'pct', portada: true, ayuda: 'vivos / registrados' },
    ],
    post: [
      { key: 'llamadasAgendadas', label: 'Llamadas agendadas', valor: m.llamadasAgendadas, formato: 'count' },
      { key: 'showRateCalls', label: 'Show rate calls', valor: m.showRateCalls, formato: 'pct' },
      { key: 'closeRate', label: 'Close rate', valor: m.closeRate, formato: 'pct' },
      { key: 'aov', label: 'AOV', valor: m.aov, formato: 'usd' },
      { key: 'pifRate', label: 'PIF rate', valor: m.pifRate, formato: 'pct' },
      { key: 'cashUsd', label: 'Cash collected', valor: m.cashUsd, formato: 'usd', portada: true },
    ],
  };

  const tieneDiaExtra = m.retenidosPitch > 0 || m.picoConcurrentes > 0 || m.booked > 0;
  const semaforos = {
    registro: semaforoBajo(m.costoPorRegistrante, bm.costoPorRegistrante),
    dia: tieneDiaExtra
      ? peorSemaforo(
        semaforoAlto(m.showRate, bm.showRate),
        semaforoAlto(m.retencionPitch, bm.retencionPitch),
        semaforoAlto(m.bookingRate, bm.bookingRate),
      )
      : semaforoAlto(m.showRate, bm.showRate),
    post: peorSemaforo(
      semaforoCash(m.cashUsd, metaCash || null),
      (m.llamadasAgendadas || m.cierres || m.cashUsd)
        ? semaforoAlto(m.closeRate, bm.closeRateCalls)
        : 'off',
      m.cierres > 0 ? semaforoAlto(m.pifRate, bm.pifRate) : 'off',
    ),
  };

  return FASES_META.map((meta) => {
    const metricas = items[meta.id];
    const portada = metricas.find((x) => x.portada) || metricas[0];
    const secundarias = metricas.filter((x) => !x.portada);
    return {
      ...meta,
      semaforo: semaforos[meta.id],
      portada,
      metricas: secundarias,
      todas: metricas,
      valores: m,
    };
  });
}

/**
 * Funnel math al revés: desde meta de cash, qué necesita cada fase.
 * @param {{ metaCash: number, precio?: number, closeRate?: number, bookingRate?: number, showRate?: number, costoPorRegistrante?: number }} p
 */
export function proyeccionDesdeMeta(p) {
  const metaCash = n(p.metaCash);
  if (!metaCash) return null;
  const precio = n(p.precio) || 2000;
  const close = (n(p.closeRate) || 25) / 100;
  const booking = (n(p.bookingRate) || 20) / 100;
  const show = (n(p.showRate) || 30) / 100;
  const cpr = n(p.costoPorRegistrante) || 10;

  const cierresNecesarios = Math.ceil(metaCash / precio);
  const showsCall = close > 0 ? Math.ceil(cierresNecesarios / close) : null;
  const booked = showsCall;
  const retenidos = booking > 0 && booked != null ? Math.ceil(booked / booking) : null;
  const registrados = show > 0 && retenidos != null ? Math.ceil(retenidos / show) : null;
  const gastoAds = registrados != null ? Math.round(registrados * cpr) : null;

  return {
    metaCash,
    cierresNecesarios,
    showsCall,
    booked,
    retenidosPitch: retenidos,
    registros: registrados,
    gastoAdsUsd: gastoAds,
  };
}

export { FASES_META, semaforoBajo, semaforoAlto, semaforoCash };
