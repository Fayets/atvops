import { formatValue } from './format.js';

/**
 * Los chats del mes, tal como los compone el backend.
 *
 * Un chat es una conversación que arrancó porque el contenido la pidió, y entra por tres
 * puertas: respuestas a historias marcadas con CTA, los reels y videos de YouTube
 * marcados a mano en Marketing (o el bot/CRM si nadie marcó reels), y lo que venga por
 * otro canal. La suma y el reparto los decide `conversaciones_services.chats()`; acá solo
 * se leen, para que Marketing y el embudo de Ventas no puedan mostrar números distintos
 * de lo mismo.
 *
 * Antes cada vista elegía su fuente por su cuenta y el mismo número salía 106 arriba y 0
 * abajo en la misma pantalla.
 */

/**
 * @param {object | null} resumen Lo que devuelve GET /api/ventas/conversaciones del mes.
 * @returns {{ total: number, partes: Array<object>, fuente: string }}
 */
export function chatsDelMes(resumen) {
  const partes = resumen?.chatsPartes ?? [];
  const total = Number(resumen?.chats ?? 0);
  const conAlgo = partes.filter((p) => Number(p.cuantos) > 0);

  return {
    total,
    partes,
    // El pie dice de dónde salió. Con una sola puerta abierta se nombra; con varias, el
    // reparto, que es lo que hay que mirar para decidir dónde empujar.
    fuente: conAlgo.length === 0
      ? 'ninguna puerta trajo chats este mes'
      : conAlgo.map((p) => `${p.fuente.toLowerCase()} ${formatValue(p.cuantos, 'count')}`).join(' · '),
  };
}
