import { NavLink } from 'react-router-dom';

/**
 * ATV AI, siempre a mano y fuera de la barra.
 *
 * Es una herramienta que se usa desde cualquier vista, no una sección más del tablero:
 * ocupando un renglón de la barra competía con las áreas del negocio.
 */
export default function BotonAtvAi() {
  return (
    <NavLink
      to="/asistente"
      className={({ isActive }) => `atv-ai-fab${isActive ? ' activo' : ''}`}
      title="ATV AI · preguntale al sistema"
      aria-label="Abrir ATV AI"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          d="M12 3a9 9 0 0 0-7.6 13.8L3 21l4.4-1.3A9 9 0 1 0 12 3Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <circle cx="8.6" cy="12" r="1.1" fill="currentColor" />
        <circle cx="12" cy="12" r="1.1" fill="currentColor" />
        <circle cx="15.4" cy="12" r="1.1" fill="currentColor" />
      </svg>
      <span className="atv-ai-fab-texto">ATV AI</span>
    </NavLink>
  );
}
