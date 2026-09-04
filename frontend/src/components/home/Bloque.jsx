import { Link } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';

/**
 * Un bloque del cuadro de mando: un área, su dueño, su contenido y el link a
 * la sección completa.
 * @param {{ titulo: string, dueno?: string, href: string, lema?: string,
 *           children: React.ReactNode, foot?: React.ReactNode, extra?: React.ReactNode }} props
 */
export default function Bloque({ titulo, dueno, href, lema, children, foot, extra }) {
  return (
    <section className="bloque">
      <header className="bloque-head">
        <div>
          <h2>
            <Link to={href}>{titulo}</Link>
            {dueno && <span className="bloque-dueno">· {dueno}</span>}
          </h2>
          {lema && <div className="bloque-lema">{lema}</div>}
        </div>
        <div className="bloque-head-right">
          {extra}
          <Link to={href} className="bloque-link" aria-label={`Abrir ${titulo}`}>
            <Icon name="arrow" size={15} />
          </Link>
        </div>
      </header>
      <div className="bloque-body">{children}</div>
      {foot && <footer className="bloque-foot">{foot}</footer>}
    </section>
  );
}
