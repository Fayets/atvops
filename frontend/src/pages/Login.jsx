import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { login } from '../data/api.js';
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

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    setRolPreview(null);
    clearSession();
    try {
      const session = await login(username.trim(), password);
      saveSession(session);
      const dest = from && from !== '/login'
        ? from
        : homeParaRol(normalizarRol(session.user?.rol));
      navigate(dest, { replace: true });
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

          <label className="login-field">
            <span>Usuario</span>
            <input
              autoComplete="username"
              autoFocus
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
