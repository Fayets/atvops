import { NavLink, useLocation } from 'react-router-dom';
import { GRIETAS } from '../../data/mock/home.js';
import { coberturaAutomatizacion } from '../../data/sources.js';
import Icon from '../ui/Icon.jsx';

/** Las cuatro áreas del sistema, más la home. */
const NAV = [
  { to: '/', icon: 'home', label: 'Home', end: true },
  { to: '/calendario', icon: 'calendario', label: 'Calendario' },
  {
    to: '/fulfillment',
    icon: 'clientes',
    label: 'Fulfillment',
    sub: [
      { to: '/fulfillment', label: 'Resumen', end: true },
      { to: '/fulfillment/clientes', label: 'Clientes' },
      { to: '/fulfillment/activacion', label: 'Activación' },
      { to: '/fulfillment/engagement', label: 'Engagement' },
      { to: '/fulfillment/retencion', label: 'Retención y NRR' },
      { to: '/fulfillment/outcomes', label: 'Outcomes y expansión' },
    ],
  },
  { to: '/marketing', icon: 'marketing', label: 'Marketing' },
  { to: '/ventas', icon: 'ventas', label: 'Ventas' },
  { to: '/sistemas', icon: 'sistemas', label: 'Sistemas' },
  { to: '/cobranza', icon: 'cobranza', label: 'Cobranza' },
  { to: '/ideas', icon: 'ideas', label: 'Ideas' },
  { to: '/configuracion', icon: 'config', label: 'Configuración' },
];

export default function Sidebar() {
  const cobertura = coberturaAutomatizacion();
  const grietasAltas = GRIETAS.filter((g) => g.severidad === 'alta').length;
  const { pathname } = useLocation();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">ATV</div>
        <div>
          <div className="brand-name">ATV Ops</div>
          <div className="brand-sub">Operaciones y sistemas</div>
        </div>
      </div>

      <nav className="nav">
        <div className="nav-group eyebrow">Tablero</div>
        {NAV.map((item) => (
          <div key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <Icon name={item.icon} />
              {item.label}
              {item.to === '/' && grietasAltas > 0 && <span className="nav-badge">{grietasAltas}</span>}
            </NavLink>

            {item.sub && pathname.startsWith(item.to) && (
              <div className="subnav">
                {item.sub.map((s) => (
                  <NavLink
                    key={s.to}
                    to={s.to}
                    end={s.end}
                    className={({ isActive }) => `subnav-item${isActive ? ' active' : ''}`}
                  >
                    {s.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Datos automatizados</span>
          <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>
            {cobertura.pct}%
          </span>
        </div>
        <div className="bar">
          <span style={{ width: `${cobertura.pct}%` }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.45 }}>
          {cobertura.manuales} de {cobertura.total} campos todavía dependen de que alguien los cargue.
        </div>
      </div>
    </aside>
  );
}
