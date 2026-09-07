import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useRol } from '../../lib/RolContext.jsx';
import { homeParaRol, puedeVerRuta } from '../../lib/roles.js';

/**
 * Bloquea rutas que el rol efectivo no puede ver.
 */
export default function RequireRole() {
  const location = useLocation();
  const { rol } = useRol();

  if (!puedeVerRuta(location.pathname, rol)) {
    return <Navigate to={homeParaRol(rol)} replace />;
  }
  return <Outlet />;
}
