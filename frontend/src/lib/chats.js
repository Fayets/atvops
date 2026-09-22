/**
 * De dónde sale el número de chats del mes.
 *
 * Hay dos fuentes para el mismo hecho —una conversación que el bot abrió cuando alguien
 * mandó la palabra de un reel o de la bio—: el `lead` del CRM de atv-mkt, que los viene
 * contando desde siempre, y la tabla propia de ATV Ops, que se llena sola cuando el flujo
 * de ManyChat avisa a este webhook.
 *
 * La regla era "si ATV Ops tiene alguna, mandan las propias", mirando el total histórico.
 * Con eso, una sola fila de una prueba hacía que todo el tablero cambiara de fuente y
 * mostrara 0 contra una meta de 1.200, mientras el KPI de arriba —que siempre leyó el
 * CRM— decía 106. La misma métrica, dos números, en la misma pantalla.
 *
 * Ahora la pregunta es por el mes que se está mirando: las propias mandan cuando tienen
 * algo de ESE mes. Si no, el CRM. Y siempre se dice cuál se usó: un número sin fuente
 * invita a discutirlo en vez de usarlo.
 */

/**
 * @param {object | null} propias Lo que devuelve GET /api/ventas/conversaciones del mes.
 * @param {number} crm El total del mes según el CRM de atv-mkt.
 * @returns {{ total: number, propia: boolean, fuente: string }}
 */
export function chatsDelMes(propias, crm = 0) {
  const delMes = Number(propias?.conversaciones ?? 0);
  if (delMes > 0) {
    return { total: delMes, propia: true, fuente: 'las cuenta ATV Ops' };
  }
  return {
    total: Number(crm) || 0,
    propia: false,
    // Si ATV Ops ya recibió avisos alguna vez pero ninguno este mes, no es lo mismo que
    // no haber recibido nunca: en un caso falta conectar el flujo, en el otro es un mes
    // sin chats propios y el CRM está tapando el cero.
    fuente: propias?.conectado
      ? 'este mes no llegó ninguna a ATV Ops · las cuenta el CRM de atv-mkt'
      : 'todavía las cuenta el CRM de atv-mkt',
  };
}
