/**
 * De dónde sale cada número del webinar.
 *
 * Un número que no se puede abrir obliga a creerle a quien lo cargó, y acá casi todos se
 * cargan a mano. Por eso el desglose dice tres cosas distintas:
 *
 * - **Cómo se calcula**: la fórmula con los valores de verdad puestos, no la fórmula en
 *   abstracto. «1 de 4 que vinieron» se discute; «cierres ÷ shows» no.
 * - **De dónde sale el dato**: Meta, Zoom, la landing, el CRM o la mano de alguien. Es la
 *   diferencia entre un número que se puede auditar y uno que hay que creer.
 * - **Quiénes son**, cuando hay filas detrás. Solo la fase 3 las tiene: son las llamadas
 *   del calendario del closer.
 */

/** Qué sistema produce cada número, en una línea. */
export const FUENTE = {
  impresiones: 'Meta Ads, por la API',
  alcance: 'Meta Ads, por la API',
  clicks: 'Meta Ads, por la API',
  gastoAdsUsd: 'Meta Ads, por la API',
  frecuencia: 'Meta Ads, por la API',
  visitasLanding: 'el tracking de la landing',
  optins: 'el formulario de la landing',
  thankYou: 'la página de gracias',
  registros: 'cargado a mano en Configurar',
  entradasWhatsapp: 'cargado a mano en Configurar',
  miembrosGrupo: 'cargado a mano en Configurar',
  agendasWebinar: 'cargado a mano en Configurar',
  chatsOrganicos: 'cargado a mano en Configurar',
  vivos: 'Zoom, por los webhooks del vivo',
  picoConcurrentes: 'Zoom, por los webhooks del vivo',
  retenidosPitch: 'Zoom, por los webhooks del vivo',
  minutoPitch: 'cargado a mano en Configurar',
  ctaCompletado: 'el formulario del CTA',
  booked: 'el Calendly del webinar',
  llamadasAgendadas: 'el calendario del closer',
  showsLlamadas: 'el resultado que carga el closer',
  cierres: 'el resultado que carga el closer',
  cashUsd: 'el cash que carga el closer en cada llamada',
  pif: 'cargado a mano en Configurar',
};

/** Las métricas de la fase 3, que son las únicas con llamadas detrás. */
export const CON_LLAMADAS = new Set([
  'llamadasAgendadas', 'showRateCalls', 'showsLlamadas', 'closeRate', 'cierres',
  'aov', 'pifRate', 'pif', 'cashUsd',
]);

const n = (v) => Number(v ?? 0);

/**
 * Los operandos de cada número, con sus valores de verdad.
 * @returns {{ texto: string, partes: Array<{ label: string, valor: number|string }> } | null}
 */
export function formulaDe(key, m = {}) {
  const f = (texto, partes) => ({ texto, partes });
  switch (key) {
    case 'ctr':
      return f('clicks ÷ impresiones',
        [{ label: 'Clicks', valor: n(m.clicks) }, { label: 'Impresiones', valor: n(m.impresiones) }]);
    case 'cpc':
      return f('gasto ÷ clicks',
        [{ label: 'Gasto en ads', valor: n(m.gastoAdsUsd), usd: true }, { label: 'Clicks', valor: n(m.clicks) }]);
    case 'conversionLanding':
      return f('optins ÷ visitas a la landing',
        [{ label: 'Optins', valor: n(m.optins) }, { label: 'Visitas', valor: n(m.visitasLanding) }]);
    case 'costoPorRegistrante':
      return f('gasto ÷ registros',
        [{ label: 'Gasto en ads', valor: n(m.gastoAdsUsd), usd: true }, { label: 'Registros', valor: n(m.registros) }]);
    case 'tasaWhatsapp':
      return f('entraron al grupo ÷ registros',
        [{ label: 'Entraron al grupo', valor: n(m.entradasWhatsapp) }, { label: 'Registros', valor: n(m.registros) }]);
    case 'tasaAgendaTy':
      return f('agendaron en la página de gracias ÷ registros',
        [{ label: 'Agendaron ahí', valor: n(m.agendasWebinar) }, { label: 'Registros', valor: n(m.registros) }]);
    case 'showRate':
      return f('estuvieron en vivo ÷ miembros del grupo de WhatsApp',
        [{ label: 'En vivo', valor: n(m.vivos) },
          { label: 'Miembros del grupo', valor: n(m.miembrosGrupo || m.registros) }]);
    case 'retencionPitch':
      return f('seguían en el pitch ÷ pico de concurrentes',
        [{ label: 'Seguían en el pitch', valor: n(m.retenidosPitch) },
          { label: 'Pico de concurrentes', valor: n(m.picoConcurrentes) }]);
    case 'tasaCta':
      return f('completaron el CTA ÷ seguían en el pitch',
        [{ label: 'Completaron el CTA', valor: n(m.ctaCompletado) },
          { label: 'Seguían en el pitch', valor: n(m.retenidosPitch) }]);
    case 'bookingRate':
      return f('agendaron ÷ completaron el CTA',
        [{ label: 'Agendaron', valor: n(m.booked) }, { label: 'Completaron el CTA', valor: n(m.ctaCompletado) }]);
    case 'showRateCalls':
      return f('se presentaron a la llamada ÷ llamadas agendadas',
        [{ label: 'Se presentaron', valor: n(m.showsLlamadas) },
          { label: 'Llamadas agendadas', valor: n(m.llamadasAgendadas) }]);
    case 'closeRate':
      return f('cierres ÷ llamadas a las que vinieron',
        [{ label: 'Cierres', valor: n(m.cierres) },
          { label: 'Vinieron', valor: n(m.showsLlamadas || m.llamadasAgendadas) }]);
    case 'aov':
      return f('cash ÷ cierres',
        [{ label: 'Cash collected', valor: n(m.cashUsd), usd: true }, { label: 'Cierres', valor: n(m.cierres) }]);
    case 'pifRate':
      return f('pagos completos ÷ cierres',
        [{ label: 'Pagaron todo', valor: n(m.pif) }, { label: 'Cierres', valor: n(m.cierres) }]);
    default:
      return null;
  }
}

/** Para los que no son una división: qué significan, en una línea. */
export const QUE_ES = {
  impresiones: 'Cuántas veces se mostró el anuncio. La misma persona cuenta varias veces.',
  alcance: 'Cuántas personas distintas lo vieron, sin importar cuántas veces.',
  clicks: 'Cuántos tocaron el anuncio.',
  gastoAdsUsd: 'Lo que se gastó en pauta para traer gente a esta landing.',
  frecuencia: 'Cuántas veces vio el anuncio la misma persona, en promedio. Arriba de 3 empieza a quemar.',
  visitasLanding: 'Cuánta gente abrió la landing.',
  optins: 'Cuántos dejaron sus datos en el formulario.',
  thankYou: 'Cuántos llegaron a la página de gracias después de anotarse.',
  registros: 'Los confirmados al webinar. Es el número contra el que se mide el costo.',
  entradasWhatsapp: 'Cuántos de los registrados entraron al grupo de WhatsApp.',
  miembrosGrupo: 'Cuántos había en el grupo al momento del vivo. Es la base del show rate.',
  agendasWebinar: 'Los que agendaron directo desde la página de gracias, sin esperar al vivo.',
  chatsOrganicos: 'Las conversaciones que trajo el contenido, aparte de la pauta.',
  vivos: 'Cuántos estuvieron en el webinar.',
  picoConcurrentes: 'El máximo de gente conectada al mismo tiempo.',
  retenidosPitch: 'Cuántos seguían cuando arrancó el pitch. Es lo que mide si el contenido aguantó.',
  minutoPitch: 'En qué minuto del webinar arrancó el pitch.',
  ctaCompletado: 'Cuántos completaron el formulario del CTA.',
  booked: 'Cuántos agendaron una llamada.',
  llamadasAgendadas: 'Las llamadas que quedaron en el calendario del closer después del webinar.',
  showsLlamadas: 'A cuántas de esas llamadas vino el prospecto.',
  cierres: 'Cuántas terminaron en venta cerrada. Las señas no cuentan: la venta no está hecha.',
  cashUsd: 'La plata que entró de esos cierres.',
  pif: 'Cuántos pagaron el programa completo de una.',
};
