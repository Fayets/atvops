import CalendarioReuniones from '../components/home/CalendarioReuniones.jsx';
import { useRol } from '../lib/RolContext.jsx';

/** El calendario es personal: cada usuario ve y maneja solo sus reuniones. */
export default function Calendario() {
  const { user } = useRol();
  return (
    <div className="page">
      <div>
        <div className="eyebrow">Calendario personal</div>
        <p className="dim" style={{ fontSize: 12.5, marginTop: 4 }}>
          Lo que cargues acá lo ves vos{user?.nombre ? `, ${user.nombre}` : ''}. Cada usuario tiene el suyo.
        </p>
      </div>
      <CalendarioReuniones />
    </div>
  );
}
