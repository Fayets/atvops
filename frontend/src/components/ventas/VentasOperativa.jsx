import { useMemo, useState } from 'react';
import EditorReunion from './EditorReunion.jsx';
import NuevaReunion from './NuevaReunion.jsx';
import { moverReunion, ocultarReunion } from '../../data/api.js';
import CalendarioEquipo from './CalendarioEquipo.jsx';
import PanelOps from './PanelOps.jsx';
import DetalleLlamada from './DetalleLlamada.jsx';
import Card from '../ui/Card.jsx';

/**
 * Vista operativa día a día del Director de Ventas.
 * @param {{ data: object }} props
 */
export default function VentasOperativa({ data, agenda, agendaError, actualizando, onActualizar, onRango,
                                          reuniones, onCargado }) {
  const [editando, setEditando] = useState(null);
  const [agregando, setAgregando] = useState(false);
  const [detalle, setDetalle] = useState(null);

  // Las reuniones cargadas a mano no están en Google: se suman acá para que el calendario
  // las dibuje igual que las demás.
  const llamados = useMemo(() => {
    const deGoogle = agenda?.llamados ?? [];
    const manuales = (reuniones?.manuales ?? []).map((m) => ({
      id: m.eventoId,
      prospecto: m.prospecto,
      titulo: m.prospecto,
      email: '', telefono: '', instagram: '', facturacion: '', respuestas: [],
      fechaAt: m.fechaAt,
      duracionMin: 60,
      todoElDia: false,
      estado: 'pendiente',
      oferta: 'Cargada a mano',
      closer: m.closer || '',
      invitados: [],
      zoomUrl: null, meetUrl: null, url: null,
      notasSetter: m.reporte || '',
      montoUsd: m.cashUsd || null,
      origen: 'atv-ops',
    }));
    return [...deGoogle, ...manuales];
  }, [agenda?.llamados, reuniones?.manuales]);

  return (
    <div className="ventas-operativa">
      <PanelOps data={data} />

      {agendaError ? (
        <Card title="Calendario del equipo" sub="Google Calendar de ATV">
          <div className="empty">{agendaError.message}</div>
        </Card>
      ) : (
        <CalendarioEquipo
          llamados={llamados}
          onSelect={setDetalle}
          sub={agenda
            ? `${agenda.calendarId} · ${llamados.length} eventos entre ${agenda.desde} y ${agenda.hasta}`
            : 'Cargando el Google Calendar de ATV…'}
          actualizando={actualizando}
          onActualizar={onActualizar}
          onRango={onRango}
          estados={reuniones?.porEvento}
        cierresDeOtroMes={reuniones?.cierresDeOtroMes ?? []}
          ocultos={reuniones?.ocultos}
          onEditar={(reunion, estado) => setEditando({ reunion, estado })}
          onAgregar={() => setAgregando(true)}
          onOcultar={async (l) => {
            await ocultarReunion(l.id, { titulo: l.prospecto, fechaAt: l.fechaAt });
            onCargado?.();
          }}
          onMostrar={async (l) => {
            await ocultarReunion(l.id, { mostrar: true });
            onCargado?.();
          }}
          onMover={async (l, fecha) => {
            await moverReunion(l.id, fecha);
            onCargado?.();
          }}
        />
      )}

      {detalle && <DetalleLlamada llamada={detalle} onCerrar={() => setDetalle(null)} />}
      {agregando && (
        <NuevaReunion
          programas={reuniones?.programas ?? []}
          estados={reuniones?.estados ?? []}
          onCreada={onCargado}
          onCerrar={() => setAgregando(false)}
        />
      )}
      {editando && (
        <EditorReunion
          reunion={editando.reunion}
          estado={editando.estado}
          programas={reuniones?.programas ?? []}
          estados={reuniones?.estados ?? []}
          equipo={data?.equipo ?? reuniones?.equipo ?? []}
          onGuardado={onCargado}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}
