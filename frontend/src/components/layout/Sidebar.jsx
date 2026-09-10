import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { clearSession } from '../../lib/auth.js';
import { useRol } from '../../lib/RolContext.jsx';
import { filtrarNav, homeParaRol, ROL_LIST, ROLES } from '../../lib/roles.js';
import Icon from '../ui/Icon.jsx';

const ORDEN_GRUPOS = ['Tablero', 'Áreas', 'Dirección', 'Sistema'];

const NAV = [
  { to: '/', icon: 'home', label: 'Home', end: true, grupo: 'Tablero' },
  { to: '/calendario', icon: 'calendario', label: 'Calendario', grupo: 'Tablero' },
  {
    to: '/fulfillment',
    icon: 'clientes',
    label: 'Fulfillment',
    grupo: 'Áreas',
    // El día a día de fulfillment es de Mauri. Ops y dirección solo necesitan la lectura
    // para decidir: expansión, riesgo, vencimientos y calidad.
    sub: [
      { to: '/fulfillment/ops', label: 'Salud de cartera', roles: ['admin', 'operaciones', 'founder'] },
      { to: '/fulfillment', label: 'Resumen', end: true, roles: ['csm'] },
      { to: '/fulfillment/pendientes', label: 'Updates', roles: ['csm'] },
      { to: '/fulfillment/clientes', label: 'Clientes', roles: ['csm', 'operaciones', 'admin', 'founder'] },
      { to: '/fulfillment/activacion', label: 'Activación', roles: ['csm'] },
      { to: '/fulfillment/engagement', label: 'Engagement', roles: ['csm'] },
      { to: '/fulfillment/retencion', label: 'Retención y riesgo', roles: ['csm'] },
      { to: '/fulfillment/outcomes', label: 'Resultados', roles: ['csm'] },
      { to: '/fulfillment/chats', label: 'Chats en vivo', roles: ['csm'] },
    ],
  },
  {
    to: '/marketing',
    icon: 'marketing',
    label: 'Marketing',
    grupo: 'Áreas',
    sub: [
      { to: '/marketing', label: 'Resumen', end: true },
      { to: '/marketing/reels', label: 'Reels' },
      { to: '/marketing/historias', label: 'Historias' },
      { to: '/marketing/youtube', label: 'YouTube' },
    ],
  },
  { to: '/ads', icon: 'ads', label: 'Ads', grupo: 'Áreas' },
  {
    to: '/ventas',
    icon: 'ventas',
    label: 'Ventas',
    grupo: 'Áreas',
    sub: [
      { to: '/ventas/mi-dia', label: 'Mi día', roles: ['closer', 'admin', 'founder'] },
      { to: '/ventas/llamadas', label: 'Llamadas', roles: ['closer', 'admin', 'founder'] },
      { to: '/ventas/mi-progreso', label: 'Mi progreso', roles: ['setter', 'admin', 'founder'] },
      { to: '/ventas', label: 'Operativa', end: true, roles: ['ventas', 'admin', 'founder'] },
      { to: '/ventas/performance', label: 'Performance', roles: ['ventas', 'admin', 'founder'] },
      { to: '/ventas/ops', label: 'Salud vs meta', roles: ['admin', 'operaciones', 'founder'] },
    ],
  },
  { to: '/reporte', icon: 'check', label: 'Reporte semanal', grupo: 'Dirección' },
  { to: '/metas', icon: 'check', label: 'Metas', grupo: 'Dirección' },
  { to: '/sistemas', icon: 'sistemas', label: 'Sistemas', grupo: 'Sistema' },
  { to: '/cobranza', icon: 'cobranza', label: 'Cobranza', grupo: 'Áreas' },
  { to: '/ideas', icon: 'ideas', label: 'Ideas', grupo: 'Sistema' },
  { to: '/configuracion', icon: 'config', label: 'Configuración', grupo: 'Sistema' },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, rol, rolReal, preview, puedePreview, setPreview } = useRol();
  const nav = filtrarNav(NAV, rol);
  // Agrupado para que la barra se lea de un vistazo: dónde estoy, las áreas del negocio,
  // lo que sirve para decidir y lo del sistema.
  const grupos = ORDEN_GRUPOS
    .map((nombre) => ({ nombre, items: nav.filter((i) => (i.grupo ?? 'Tablero') === nombre) }))
    .filter((g) => g.items.length);

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
        {grupos.map((g) => (
          <div key={g.nombre} className="nav-seccion">
            <div className="nav-group eyebrow">{g.nombre}</div>
            {g.items.map((item) => (
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
                {ROL_LIST.map((id) => (
                  <option key={id} value={id}>
                    {ROLES[id]?.label ?? id}
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
