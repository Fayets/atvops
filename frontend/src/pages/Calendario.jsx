import CalendarioReuniones from '../components/home/CalendarioReuniones.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';

export default function Calendario() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Equipo"
        title="Calendario"
        desc="Asigná reuniones por día. Las fotos de quienes participan se cargan en Configuración."
      />
      <CalendarioReuniones />
    </div>
  );
}
