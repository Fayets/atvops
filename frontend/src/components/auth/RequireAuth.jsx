import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getDecretos, getMe } from '../../data/api.js';
import { clearSession, getStoredUser, getToken, saveSession } from '../../lib/auth.js';

/**
 * Exige sesión. Si ya hay user+rol en localStorage (p. ej. recién del login),
 * entra al toque y refresca /me en segundo plano.
 */
export default function RequireAuth() {
  const location = useLocation();
  const token = getToken();
  const stored = getStoredUser();
  const [ready, setReady] = useState(Boolean(token && stored));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const user = await getMe();
        if (cancelled) return;
        saveSession({ token, user });
        // Las metas son del equipo: se traen con la sesión para que todas las vistas las
        // lean igual, sin importar en qué navegador se cargaron.
        getDecretos().catch(() => {});
        setReady(true);
      } catch {
        if (cancelled) return;
        // Sesión recién guardada por login: no expulsar por un /me fallido puntual.
        if (getStoredUser()) {
          setReady(true);
          return;
        }
        clearSession();
        setInvalid(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token || invalid) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (!ready) {
    return (
      <div className="login">
        <p className="dim" style={{ padding: 24 }}>
          Cargando sesión…
        </p>
      </div>
    );
  }
  return <Outlet />;
}
