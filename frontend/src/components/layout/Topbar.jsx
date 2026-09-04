import { useLocation, useNavigate } from 'react-router-dom';
import { clearSession, getStoredUser } from '../../lib/auth.js';
import { nombreMesAnio } from '../../lib/format.js';
import Pill from '../ui/Pill.jsx';

const TITULOS = {
  '/calendario': 'Calendario',
  '/fulfillment': 'Fulfillment',
  '/fulfillment/clientes': 'Fulfillment · Clientes',
  '/fulfillment/activacion': 'Fulfillment · Activación',
  '/fulfillment/engagement': 'Fulfillment · Engagement',
  '/fulfillment/retencion': 'Fulfillment · Retención y NRR',
  '/fulfillment/outcomes': 'Fulfillment · Outcomes y expansión',
  '/marketing': 'Marketing',
  '/ventas': 'Ventas',
  '/sistemas': 'Sistemas · QA de datos',
  '/cobranza': 'Cobranza',
  '/ideas': 'Ideas',
  '/configuracion': 'Configuración',
};

function tituloDe(pathname) {
  if (pathname === '/') return null;
  if (TITULOS[pathname]) return TITULOS[pathname];
  if (pathname.startsWith('/fulfillment/clientes')) return 'Fulfillment · Ficha de cliente';
  return 'ATV Ops';
}

export default function Topbar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = getStoredUser();
  const titulo = tituloDe(pathname);

  function salir() {
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <header className="topbar">
      {titulo ? <span className="topbar-title">{titulo}</span> : null}
      <Pill tone="plain">{nombreMesAnio()}</Pill>

      <div className="topbar-right">
        {user ? (
          <span className="topbar-user">
            {user.nombre || user.username}
            <button className="btn" onClick={salir} type="button">
              Salir
            </button>
          </span>
        ) : null}
      </div>
    </header>
  );
}
