import { useLocation } from 'react-router-dom';
import { useMes } from '../../lib/MesContext.jsx';
import Pill from '../ui/Pill.jsx';

const TITULOS = {
  '/calendario': 'Calendario',
  '/fulfillment': 'Fulfillment',
  '/fulfillment/pendientes': 'Fulfillment · Updates',
  '/fulfillment/clientes': 'Fulfillment · Clientes',
  '/fulfillment/activacion': 'Fulfillment · Activación',
  '/fulfillment/engagement': 'Fulfillment · Engagement',
  '/fulfillment/retencion': 'Fulfillment · Retención y riesgo',
  '/fulfillment/outcomes': 'Fulfillment · Resultados',
  '/fulfillment/chats': 'Fulfillment · Chats en vivo',
  '/marketing': 'Marketing',
  '/ads': 'Ads',
  '/ventas': 'Ventas · Operativa',
  '/ventas/performance': 'Ventas · Performance',
  '/ventas/ops': 'Ventas · Salud vs meta',
  '/metas': 'Metas del mes',
  '/sistemas': 'Sistemas · QA de datos',
  '/cobranza': 'Cobranza',
  '/asistente': 'ATV AI',
  '/ideas': 'Ideas',
  '/configuracion': 'Configuración',
};

function tituloDe(pathname) {
  if (pathname === '/') return null;
  if (TITULOS[pathname]) return TITULOS[pathname];
  if (pathname.startsWith('/fulfillment/clientes')) return 'Fulfillment · Ficha de cliente';
  if (pathname.startsWith('/fulfillment/chats')) return 'Fulfillment · Chats en vivo';
  return 'ATV Ops';
}

export default function Topbar() {
  const { pathname } = useLocation();
  const { mes, setMes, opciones, esActual } = useMes();
  const titulo = tituloDe(pathname);

  return (
    <header className="topbar">
      {titulo ? <span className="topbar-title">{titulo}</span> : <span />}
      <label className="topbar-mes">
        <span className="dim">Mes</span>
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          aria-label="Mes operativo"
        >
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {!esActual ? <Pill tone="warn">histórico</Pill> : null}
      </label>
    </header>
  );
}
