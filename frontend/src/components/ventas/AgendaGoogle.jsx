import { useState } from 'react';
import Card from '../ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../ui/Loading.jsx';
import Pill from '../ui/Pill.jsx';
import { getAgendaVentas } from '../../data/api.js';
import { useResource } from '../../lib/hooks.js';

const TONO_RESPUESTA = { accepted: 'ok', declined: 'alert', tentative: 'warn', needsAction: 'off' };
const TEXTO_RESPUESTA = { accepted: 'confirmó', declined: 'rechazó', tentative: 'tal vez', needsAction: 'sin responder' };

const hora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

function etiquetaDia(fecha) {
  const hoy = new Date();
  const d = new Date(`${fecha}T12:00:00`);
  const dif = Math.round((d - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12)) / 86400000);
  if (dif === 0) return 'Hoy';
  if (dif === 1) return 'Mañana';
  if (dif === -1) return 'Ayer';
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
}

function Evento({ e, pasado }) {
  const invitados = e.invitados.filter((i) => !i.equipo);
  const equipo = e.invitados.filter((i) => i.equipo);
  return (
    <div className={`agenda-evento${pasado ? ' pasado' : ''}`}>
      <div className="agenda-hora num">{e.todoElDia ? 'todo el día' : hora(e.inicioAt)}</div>
      <div className="agenda-cuerpo">
        <div className="agenda-titulo">
          {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.titulo}</a> : e.titulo}
          {e.duracionMin ? <span className="dim"> · {e.duracionMin} min</span> : null}
        </div>
        {(invitados.length > 0 || equipo.length > 0) && (
          <div className="agenda-invitados">
            {invitados.map((i) => (
              <span key={i.email || i.nombre} title={`${i.email || i.nombre} · ${TEXTO_RESPUESTA[i.estado] ?? i.estado}`}>
                <Pill tone={TONO_RESPUESTA[i.estado] ?? 'off'} dot>{i.nombre}</Pill>
              </span>
            ))}
            {equipo.length > 0 && <span className="dim">con {equipo.map((i) => i.nombre).join(', ')}</span>}
          </div>
        )}
      </div>
      {e.meetUrl && !pasado && (
        <a className="btn" href={e.meetUrl} target="_blank" rel="noreferrer">Meet</a>
      )}
    </div>
  );
}

/** La agenda real del Google Calendar de ATV, para el director de ventas. */
export default function AgendaGoogle({ dias = 14 }) {
  const [tick, setTick] = useState(0);
  const { data, loading, error } = useResource(() => getAgendaVentas({ dias, refrescar: tick > 0 }), [tick, dias]);

  if (error) {
    return (
      <Card title="Agenda de Google Calendar" sub="Calendario de Aumenta Tu Valor">
        <ErrorState error={error} />
      </Card>
    );
  }
  if (loading || !data) return <SkeletonBlock height={280} />;

  const ahora = new Date();
  const proximo = data.proximo;

  return (
    <Card
      title="Agenda · Google Calendar"
      sub={`${data.calendarId} · ${data.total} eventos entre ${data.desde} y ${data.hasta}`}
      actions={<button className="btn" onClick={() => setTick((t) => t + 1)}>Actualizar</button>}
      foot={`Se lee del calendario real de ATV, en vivo. Credenciales: ${data.origenCredenciales === 'atv-mkt' ? 'la conexión de ATV Marketing' : 'variables del servidor'}.`}
    >
      <div className="agenda-resumen">
        <div>
          <div className="eyebrow">Hoy</div>
          <div className="num agenda-num">{data.hoy.length}</div>
        </div>
        <div>
          <div className="eyebrow">Próximos 7 días</div>
          <div className="num agenda-num">{data.proximos7}</div>
        </div>
        {proximo && (
          <div className="agenda-proximo">
            <div className="eyebrow">Lo que viene</div>
            <div className="agenda-proximo-titulo">{proximo.titulo}</div>
            <div className="dim">
              {etiquetaDia(proximo.inicioAt.slice(0, 10))} {proximo.todoElDia ? '' : `· ${hora(proximo.inicioAt)}`}
              {proximo.invitados.filter((i) => !i.equipo).length
                ? ` · ${proximo.invitados.filter((i) => !i.equipo).map((i) => i.nombre).join(', ')}`
                : ''}
            </div>
          </div>
        )}
      </div>

      <div className="agenda-dias">
        {data.dias.length === 0 && <div className="empty">No hay eventos en la ventana.</div>}
        {data.dias.map((d) => (
          <div key={d.fecha} className="agenda-dia">
            <div className="agenda-dia-head">
              <span className="strong">{etiquetaDia(d.fecha)}</span>
              <span className="dim">{d.eventos.length} evento{d.eventos.length === 1 ? '' : 's'}</span>
            </div>
            {d.eventos.map((e) => (
              <Evento key={e.id} e={e} pasado={!e.todoElDia && new Date(e.inicioAt) < ahora} />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}
