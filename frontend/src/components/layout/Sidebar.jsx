import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { clearSession } from '../../lib/auth.js';
import { useRol } from '../../lib/RolContext.jsx';
import { filtrarNav, homeParaRol, ROL_LIST, ROLES } from '../../lib/roles.js';
import Icon from '../ui/Icon.jsx';

const NAV = [
  { to: '/', icon: 'home', label: 'Home', end: true },
  { to: '/calendario', icon: 'calendario', label: 'Calendario' },
  {
    to: '/fulfillment',
    icon: 'clientes',
    label: 'Fulfillment',
    sub: [
      { to: '/fulfillment', label: 'Resumen', end: true },
      { to: '/fulfillment/pendientes', label: 'Updates' },
      { to: '/fulfillment/clientes', label: 'Clientes' },
      { to: '/fulfillment/activacion', label: 'Activación' },
      { to: '/fulfillment/engagement', label: 'Engagement' },
      { to: '/fulfillment/retencion', label: 'Retención y riesgo' },
      { to: '/fulfillment/outcomes', label: 'Resultados' },
      { to: '/fulfillment/chats', label: 'Chats en vivo' },
    ],
  },
  { to: '/asistente', icon: 'ideas', label: 'ATV AI' },
  { to: '/marketing', icon: 'marketing', label: 'Marketing' },
  { to: '/ads', icon: 'ads', label: 'Ads' },
  {
    to: '/ventas',
    icon: 'ventas',
    label: 'Ventas',
    sub: [
      { to: '/ventas', label: 'Operativa', end: true, roles: ['ventas', 'closer', 'setter', 'admin', 'founder'] },
      { to: '/ventas/performance', label: 'Performance', roles: ['ventas', 'closer', 'setter', 'admin', 'founder'] },
      { to: '/ventas/ops', label: 'Salud vs meta', roles: ['admin', 'operaciones', 'founder'] },
    ],
  },
  { to: '/metas', icon: 'check', label: 'Metas' },
  { to: '/sistemas', icon: 'sistemas', label: 'Sistemas' },
  { to: '/cobranza', icon: 'cobranza', label: 'Cobranza' },
  { to: '/ideas', icon: 'ideas', label: 'Ideas' },
  { to: '/configuracion', icon: 'config', label: 'Configuración' },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, rol, rolReal, preview, puedePreview, setPreview } = useRol();
  const nav = filtrarNav(NAV, rol);

  function salir() {
    setPreview(null);
    clearSession();
    navigate('/login', { replace: true });
  }

  function onPreview(e) {
    const v = e.target.value;
    setPreview(v === rolReal ? null : v);
    navigate(homeParaRol(v), { replace: true });
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-logo" src="/atv-logo.png" alt="ATV" width={34} height={34} />
        <div>
          <div className="brand-name">ATV Ops</div>
          <div className="brand-sub">Operaciones</div>
        </div>
      </div>

      <nav className="nav">
        <div className="nav-group eyebrow">Tablero</div>
        {nav.map((item) => (
          <div key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <Icon name={item.icon} />
              {item.label}
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
        <div className="sidebar-account">
          <div className="sidebar-account-row">
            <span className="sidebar-account-name" title={user?.username}>
              {user?.username ?? '—'}
            </span>
            <span className={`sidebar-rol${preview ? ' preview' : ''}`}>
              {ROLES[rol]?.label ?? rol}
            </span>
          </div>
          {puedePreview && (
            <label className="sidebar-preview">
              Ver como
              <select value={rol} onChange={onPreview} aria-label="Ver como rol">
                {ROL_LIST.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="sidebar-salir" onClick={salir}>
            Salir
          </button>
        </div>
      </div>
    </aside>
  );
}
