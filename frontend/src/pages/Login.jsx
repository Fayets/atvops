import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getAuthConfig, login, loginGoogle } from '../data/api.js';
import { clearSession, getStoredUser, getToken, saveSession } from '../lib/auth.js';
import { homeParaRol, normalizarRol, setRolPreview } from '../lib/roles.js';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const existing = getToken() && getStoredUser();
  if (existing) {
    return <Navigate to={homeParaRol(normalizarRol(getStoredUser()?.rol))} replace />;
  }

  const from = location.state?.from?.pathname ?? null;

  function entrar(session) {
    saveSession(session);
    const dest = from && from !== '/login'
      ? from
      : homeParaRol(normalizarRol(session.user?.rol));
    navigate(dest, { replace: true });
  }

  async function onGoogle(credencial) {
    setError('');
    setLoading(true);
    setRolPreview(null);
    clearSession();
    try {
      entrar(await loginGoogle(credencial));
    } catch (err) {
      setError(err.message || 'No se pudo entrar con Google.');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    setRolPreview(null);
    clearSession();
    try {
      entrar(await login(username.trim(), password));
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <div className="login-stack">
        <img
          className="login-logo"
          src="/atv-logo.png"
          alt="ATV"
          width={64}
          height={64}
        />

        <form className="login-card" onSubmit={onSubmit}>
          <h1 className="login-title">Iniciar sesion</h1>

          <BotonGoogle onCredencial={onGoogle} />
          <div className="login-o"><span>o con usuario</span></div>

          <label className="login-field">
            <span>Usuario</span>
            <input
              autoComplete="username"
              placeholder="tu_usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>

          <label className="login-field">
            <span>Contrasena</span>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Minimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error ? <p className="login-error">{error}</p> : null}

          <button
            className="login-submit"
            disabled={loading || !username || !password}
            type="submit"
          >
            {loading ? 'Entrando…' : 'Iniciar sesion'}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * El botón oficial de Google Identity Services. El equipo entra con la cuenta de Google
 * cargada en Backbone → Equipo; el usuario y la contraseña quedan para los de antes.
 */
function BotonGoogle({ onCredencial }) {
  const ref = useRef(null);
  const cb = useRef(onCredencial);
  useEffect(() => { cb.current = onCredencial; }, [onCredencial]);
  const [estado, setEstado] = useState('cargando');

  useEffect(() => {
    let vivo = true;
    getAuthConfig()
      .then(({ google_client_id: cid }) => {
        if (!vivo) return;
        if (!cid) { setEstado('sin-config'); return; }
        const pintar = () => {
          if (!vivo || !ref.current || !window.google?.accounts?.id) return;
          window.google.accounts.id.initialize({
            client_id: cid,
            callback: (r) => cb.current(r.credential),
          });
          window.google.accounts.id.renderButton(ref.current, {
            theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular',
            width: ref.current.offsetWidth || 320, locale: 'es',
          });
          setEstado('listo');
        };
        if (window.google?.accounts?.id) { pintar(); return; }
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = pintar;
        s.onerror = () => vivo && setEstado('error');
        document.head.appendChild(s);
      })
      .catch(() => vivo && setEstado('error'));
    return () => { vivo = false; };
  }, []);

  return (
    <div className="login-google">
      <div ref={ref} />
      {estado === 'sin-config' && <p className="dim">El ingreso con Google todavía no está configurado.</p>}
      {estado === 'error' && <p className="dim">No se pudo cargar el botón de Google.</p>}
    </div>
  );
}
