/**
 * La línea de pagos de los clientes, la que armó Mauri: vigencia, pagos y grupos de cada
 * cliente en el tiempo. Corre tal cual la hizo, en su propia página (public/linea-pagos),
 * con datos en vivo de ATV Clients y las notas guardadas en la base de Ops.
 */
export default function LineaPagos() {
  return (
    <div className="linea-pagos">
      <iframe src="/linea-pagos/index.html" title="Línea de pagos" className="linea-pagos-marco" />
    </div>
  );
}
