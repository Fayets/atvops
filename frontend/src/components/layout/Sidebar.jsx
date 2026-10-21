import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, entrarComoSesion, sesionOriginal, volverASesionOriginal } from '../../lib/auth.js';
import { entrarComo, getEquipoDaily } from '../../data/api.js';
import { useRol } from '../../lib/RolContext.jsx';
import { filtrarNav, homeParaRol, puedeOcultarReuniones, ROL_LIST, ROLES } from '../../lib/roles.js';
import Icon from '../ui/Icon.jsx';
import ReunionesOcultas from './ReunionesOcultas.jsx';

const ORDEN_GRUPOS = ['Tablero', 'Áreas', 'Dirección', 'Sistema'];

const NAV = [
  { to: '/', icon: 'home', label: 'Home', end: true, grupo: 'Tablero' },
  // La daily de cada uno: arma la semana el domingo y la marca de lunes a viernes.
  { to: '/daily', icon: 'check', label: 'Daily', grupo: 'Tablero' },
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
      // Un canal por cliente con sus datos al lado; por ahora, la conversación y su .txt.
      { to: '/fulfillment/canales', label: 'Canales', roles: ['csm', 'admin', 'operaciones', 'founder'] },
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
      // Quién comenta los reels y si es un lead calificado, con el criterio de marketing.
      { to: '/marketing/audiencia', label: 'Audiencia' },
      { to: '/marketing/historias', label: 'Historias' },
      { to: '/marketing/youtube', label: 'YouTube' },
    ],
  },
  { to: '/ads', icon: 'ads', label: 'Ads', grupo: 'Áreas' },
  {
    to: '/webinars',
    icon: 'webinars',
    label: 'Webinars',
    grupo: 'Áreas',
    roles: ['admin', 'founder', 'operaciones', 'ventas'],
    sub: [
      // El CTA del webinar es un Typeform: el que lo completa es el que agendó. Va como
      // subpantalla del área y no adentro de un webinar, porque el formulario es uno
      // solo y las respuestas llegan también días después del vivo.
      { to: '/webinars/agendas', label: 'Agendas' },
    ],
  },
  {
    to: '/ventas',
    icon: 'ventas',
    label: 'Ventas',
    grupo: 'Áreas',
    sub: [
      // El orden sigue el trabajo de cada uno, de lo más inmediato a lo más lejano:
      // el registro, después el análisis y al final la plata. La pantalla propia de
      // cada rol —Mi día para Nick, Mi setting para Cris— no va en la lista: es adonde
      // lleva "Ventas" cuando lo tocan ellos (ver filtrarNav), y repetirla abajo era
      // tener el mismo link dos veces, uno arriba del otro.
      { to: '/ventas/llamadas', label: 'Llamadas', roles: ['closer'] },
      // Los laboratorios son el análisis del área. El closer no ve el de setting: es de
      // Cris y del área. Operativa, Performance, Setting y Salud vs meta salieron del
      // menú; sus rutas siguen vivas hasta que se repartan entre los dos laboratorios.
      { to: '/ventas/lab-setting', label: 'Laboratorio Setting', roles: ['setter', 'ventas', 'admin', 'operaciones', 'founder'] },
      { to: '/ventas/lab-closing', label: 'Laboratorio Closing', roles: ['closer', 'ventas', 'admin', 'operaciones', 'founder'] },
      // Caja 1 cierra la lista: es lo que quedó de las ventas y todavía hay que terminar
      // de cobrar. Caja 2 —upsell y recompra— no es del área y vive en Cobranza.
      { to: '/ventas/caja', label: 'Caja 1', roles: ['closer', 'ventas', 'admin', 'founder', 'operaciones'] },
      // Quién es setter y quién closer: lo asigna el director.
      { to: '/ventas/equipo', label: 'Equipo', roles: ['ventas', 'admin', 'founder', 'operaciones'] },
    ],
  },
  // Los cuatro reportes en un solo ítem: el menú se achica y se despliegan al entrar.
  // Cada uno conserva sus permisos; a quien no ve el de dirección (ventas) el ítem lo
  // lleva al primero que sí ve.
  { to: '/reporte', icon: 'check', label: 'Reportes', grupo: 'Dirección', raiz: '/reporte',
    sub: [
      { to: '/reporte', label: 'Dirección', end: true },
      { to: '/reporte-producto', label: 'Producto', end: true, roles: ['admin', 'founder', 'operaciones'] },
      { to: '/reporte-producto/historial', label: 'Historial de producto', roles: ['admin', 'founder', 'operaciones'] },
      { to: '/reporte-closing', label: 'Closing', roles: ['admin', 'founder', 'operaciones', 'ventas'] },
      { to: '/reporte-setting', label: 'Setting', roles: ['admin', 'founder', 'operaciones', 'ventas'] },
    ] },
  { to: '/metas', icon: 'check', label: 'Metas', grupo: 'Dirección' },
  // El organigrama con lo que cada uno marcó en su daily. Equipo: mails, cargos y las
  // tareas fijas de cada rol, que edita Franco.
  { to: '/backbone', icon: 'clientes', label: 'Backbone', grupo: 'Dirección', roles: ['admin', 'founder'],
    sub: [{ to: '/backbone/equipo', label: 'Equipo y roles', rolesReales: ['admin', 'operaciones'] }] },
  { to: '/sistemas', icon: 'sistemas', label: 'Sistemas', grupo: 'Sistema' },
  // Lo que manda Theo por WhatsApp: lo que va a salir se edita o se frena, lo que salió
  // queda de registro. Es de sistemas y operaciones, no de founder.
  { to: '/theo', icon: 'ideas', label: 'Theo', grupo: 'Sistema', rolesReales: ['admin', 'operaciones'] },
  // Claves API cuelga de Integraciones: son las credenciales de esas mismas plataformas.
  {
    to: '/integraciones',
    icon: 'integraciones',
    label: 'Integraciones',
    grupo: 'Sistema',
    roles: ['admin', 'founder', 'operaciones'],
    raiz: '/integraciones',
    sub: [
      { to: '/integraciones', label: 'Integraciones', end: true },
      { to: '/claves', label: 'Claves API', roles: ['admin', 'founder', 'operaciones'] },
    ],
  },
  { to: '/cobranza', icon: 'cobranza', label: 'Cobranza', grupo: 'Áreas',
    sub: [
      // El listado de vencimientos es de dirección: es con lo que se sale a renovar,
      // y lleva la deuda de cada uno al lado.
      { to: '/cobranza/proximos-a-vencer', label: 'Próximos a vencer',
        roles: ['admin', 'founder', 'operaciones'] },
    ] },
  { to: '/configuracion', icon: 'config', label: 'Configuración', grupo: 'Sistema' },
];

/** Si la pantalla actual es de este ítem: su sección o cualquiera de sus subpantallas. */
function dentroDe(item, pathname) {
  const rutas = [item.raiz ?? item.to, ...(item.sub ?? []).map((s) => s.to)];
  return rutas.some((r) => pathname === r || pathname.startsWith(`${r}/`) || (r === item.raiz && pathname.startsWith(r)));
}

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, rol, rolReal, preview, puedePreview, setPreview } = useRol();
  const [verOcultas, setVerOcultas] = useState(false);
  // Franco entra a la cuenta de cualquiera: ve y carga lo mismo que esa persona.
  const comoOtro = Boolean(user?.por) || Boolean(sesionOriginal());
  const puedeEntrarComo = rolReal === 'admin' && !comoOtro;
  const [equipo, setEquipo] = useState([]);
  // Entrar como, Ver como y Reuniones ocultas viven en la ruedita: el pie queda en una línea.
  const [ajustes, setAjustes] = useState(false);
  const ajustesRef = useRef(null);
  const hayAjustes = puedeEntrarComo || (puedePreview && !comoOtro) || puedeOcultarReuniones(rol);
  useEffect(() => {
    if (!ajustes) return undefined;
    const fuera = (e) => { if (!ajustesRef.current?.contains(e.target)) setAjustes(false); };
    const esc = (e) => { if (e.key === 'Escape') setAjustes(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [ajustes]);
  useEffect(() => {
    if (!puedeEntrarComo) return;
    getEquipoDaily().then(setEquipo).catch(() => setEquipo([]));
  }, [puedeEntrarComo]);

  async function onEntrarComo(e) {
    const username = e.target.value;
    if (!username) return;
    try {
      entrarComoSesion(await entrarComo(username));
      setPreview(null);
      window.location.assign('/daily');
    } catch (err) {
      window.alert?.(err.message);
    }
  }

  function volver() {
    volverASesionOriginal();
    setPreview(null);
    window.location.assign('/backbone');
  }
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
                  className={({ isActive }) => `nav-item${
                    isActive || dentroDe(item, pathname) ? ' active' : ''}`}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>

                {item.sub && dentroDe(item, pathname) && (
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
        {comoOtro && (
          <div className="sidebar-como">
            <span>Estás como <b>{user?.nombre ?? user?.username}</b></span>
            <button type="button" onClick={volver}>Volver a {sesionOriginal()?.user?.nombre ?? user?.por ?? 'mi cuenta'}</button>
          </div>
        )}
        <div className="sidebar-quien">
          <span className="sidebar-account-name" title={user?.username}>
            {user?.username ?? '—'}
          </span>
          <span className={`sidebar-rol${preview ? ' preview' : ''}`}>
            {ROLES[rol]?.label ?? rol}
          </span>
        </div>

        <div className="sidebar-acciones">
          {hayAjustes && (
            <div className="sidebar-ajustes" ref={ajustesRef}>
              <button
                type="button"
                className={`sidebar-icono${ajustes ? ' abierto' : ''}`}
                onClick={() => setAjustes((v) => !v)}
                title="Ajustes"
                aria-label="Ajustes"
                aria-expanded={ajustes}
              >
                <Icon name="config" />
              </button>
              {ajustes && (
                <div className="sidebar-menu" role="menu">
                  {puedeEntrarComo && equipo.length > 0 && (
                    <label className="sidebar-preview">
                      <span>Entrar como</span>
                      <select value="" onChange={onEntrarComo} aria-label="Entrar a la cuenta de">
                        <option value="">Elegí a alguien…</option>
                        {equipo.filter((p) => p.username !== user?.username).map((p) => (
                          <option key={p.username} value={p.username}>{p.nombre}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {puedePreview && !comoOtro && (
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
                  {puedeOcultarReuniones(rol) && (
                    <button type="button" className="sidebar-menu-item" role="menuitem"
                      onClick={() => { setAjustes(false); setVerOcultas(true); }}>
                      Reuniones ocultas
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <button type="button" className="sidebar-salir" onClick={salir}>
            Salir
          </button>
        </div>
      </div>
      {verOcultas && puedeOcultarReuniones(rol) && <ReunionesOcultas onCerrar={() => setVerOcultas(false)} />}
    </aside>
  );
}
