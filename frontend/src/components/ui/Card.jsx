/**
 * Contenedor estándar. `flush` saca el padding del cuerpo (tablas, listas).
 * @param {{ title?: React.ReactNode, sub?: React.ReactNode, actions?: React.ReactNode,
 *           foot?: React.ReactNode, flush?: boolean, children: React.ReactNode,
 *           style?: object, className?: string }} props
 */
export default function Card({ title, sub, actions, foot, flush, children, style, className }) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`} style={style}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {actions && <div className="card-head-actions">{actions}</div>}
        </header>
      )}
      <div className={`card-body${flush ? ' flush' : ''}`}>{children}</div>
      {foot && <footer className="card-foot">{foot}</footer>}
    </section>
  );
}
