import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { clearSession } from '../../lib/auth.js';
import { useRol } from '../../lib/RolContext.jsx';
import { filtrarNav, homeParaRol, ROL_LIST, ROLES } from '../../lib/roles.js';
import Icon from '../ui/Icon.jsx';
import ReunionesOcultas from './ReunionesOcultas.jsx';

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
    // Cuatro vistas, no ocho. Activación, Engagement y Retención mostraban los mismos
    // clientes recortados distinto: ahora es una tabla con filtros. Chats en vivo vive
    // dentro de la ficha del cliente, que es donde se lo necesita.
    sub: [
      { to: '/fulfillment/ops', label: 'Salud de cartera', roles: ['admin', 'operaciones', 'founder'] },
      { to: '/fulfillment', label: 'Resumen', end: true, roles: ['csm'] },
      { to: '/fulfillment/diagnostico', label: 'Diagnóstico', roles: ['csm', 'operaciones', 'admin', 'founder'] },
      { to: '/fulfillment/pendientes', label: 'Updates', roles: ['csm'] },
      { to: '/fulfillment/outcomes', label: 'Resultados', roles: ['csm'] },
    ],
  },
  {
    to: '/marketing',
    icon: 'marketing',
    label: 'Marketing',
    grupo: 'Áreas',
    sub: [
      { to: '/marketing', label: 'Resumen', end: true },
      { to: '/marketing/calendario', label: 'Calendario' },
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
      // Las pantallas propias de cada uno: Mi día es de Nick y Mi setting es de Cris.
      // No son lecturas del área, así que no van en el menú de ops ni de dirección.
      { to: '/ventas/mi-dia', label: 'Mi día', roles: ['closer'] },
      { to: '/ventas/llamadas', label: 'Llamadas', roles: ['closer'] },
      { to: '/ventas/mi-progreso', label: 'Mi setting', roles: ['setter'] },
      // Ventas abre el dashboard del área —setting y closing, nada más— y debajo cuelgan
      // los dos laboratorios. Operativa, Performance, Setting y Salud vs meta salieron
      // del menú: sus rutas siguen vivas y su contenido se va a repartir entre los dos
      // laboratorios cuando se definan.
      { to: '/ventas/lab-setting', label: 'Laboratorio Setting', roles: ['setter', 'closer', 'ventas', 'admin', 'operaciones', 'founder'] },
      { to: '/ventas/lab-closing', label: 'Laboratorio Closing', roles: ['ventas', 'admin', 'operaciones', 'founder'] },
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
  const [verOcultas, setVerOcultas] = useState(false);
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

      {/* Quién sos arriba, qué podés hacer abajo. Antes el nombre, el rol, el selector
          de preview y Salir se apilaban sin jerarquía y el bloque se leía como una lista
          de cosas sueltas. */}
      <div className="sidebar-foot">
        <div className="sidebar-quien">
          <span className="sidebar-account-name" title={user?.username}>
            {user?.username ?? '—'}
          </span>
          <span className={`sidebar-rol${preview ? ' preview' : ''}`}>
            {ROLES[rol]?.label ?? rol}
          </span>
        </div>

        {puedePreview && (
          <label className="sidebar-preview">
            <span>Ver como</span>
            <select value={rol} onChange={onPreview} aria-label="Ver como rol">
              {ROL_LIST.map((id) => (
                <option key={id} value={id}>
                  {ROLES[id]?.label ?? id}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="sidebar-acciones">
          <button
            type="button"
            className="sidebar-icono"
            onClick={() => setVerOcultas(true)}
            title="Reuniones ocultas"
            aria-label="Reuniones ocultas"
          >
            <Icon name="config" />
          </button>
          <button type="button" className="sidebar-salir" onClick={salir}>
            Salir
          </button>
        </div>
      </div>
      {verOcultas && <ReunionesOcultas onCerrar={() => setVerOcultas(false)} />}
    </aside>
  );
}
