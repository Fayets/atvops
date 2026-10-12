/**
 * Los dos laboratorios, todavía vacíos. Sin encabezado propio: la barra de arriba ya
 * dice "Ventas · Laboratorio …" y repetirlo abajo era el mismo título dos veces.
 *
 * Existen a propósito antes de tener contenido: la estructura del menú se decidió ahora
 * y las pantallas se van a llenar después. Una entrada que lleva a una pantalla honesta
 * y vacía es mejor que una que no existe, porque deja ver a dónde va la cosa.
 */

const LABS = {
  setting: {
    texto:
      'Acá va a entrar todo lo que hoy está desparramado: el embudo por canal y por origen, ' +
      'qué pitch funciona, y de qué contenido vienen los chats que sí se convierten.',
  },
  closing: {
    texto:
      'Acá va a entrar el detalle por closer, las objeciones que se repiten, y qué separa ' +
      'una llamada que cierra de una que queda en seguimiento.',
  },
};

/**
 * @param {{ cual: 'setting' | 'closing' }} props
 */
export default function Laboratorio({ cual }) {
  const lab = LABS[cual] ?? LABS.setting;
  return (
    <div className="page">
      <div className="card lab-vacio">
        <h3>Todavía no tiene nada adentro</h3>
        <p>{lab.texto}</p>
        <p className="dim">
          Los números del mes están en <a href="/ventas">Ventas</a>.
        </p>
      </div>
    </div>
  );
}
