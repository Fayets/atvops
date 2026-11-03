const EXPLICACION = 'Meta sub-reporta los resultados de las campañas de seguidores. Sirve para comparar '
  + 'creativos entre sí, no para decidir si escalar: para eso está el neto de seguidores y lo que '
  + 'convierten las cohortes.';

/** Marca un número de Meta que orienta pero no decide. La explicación va en el tooltip. */
export default function Direccional() {
  return (
    <span className="direccional" title={EXPLICACION} aria-label={`Direccional. ${EXPLICACION}`} tabIndex={0}>
      direccional
    </span>
  );
}
