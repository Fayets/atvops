/** Un cliente en una lista: el punto es el color de su programa; clic lleva a su ficha. */
export default function BotonCliente({ c, extra, onElegir }) {
  return (
    <button type="button" className="lp-nombre" onClick={() => onElegir(c.id)}>
      <i className="lp-punto" style={{ '--c': `var(--lp-${c.p})` }} />
      {c.n}
      {extra && <span className="dim num">{extra}</span>}
    </button>
  );
}

/** Varios clientes en fila. */
export function Nombres({ lista, extra, onElegir }) {
  if (!lista.length) return <p className="dim lp-vacio">Sin clientes con este filtro</p>;
  return (
    <div className="lp-nombres">
      {lista.map((c) => <BotonCliente key={c.id} c={c} extra={extra?.(c)} onElegir={onElegir} />)}
    </div>
  );
}
