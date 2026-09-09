import { formatFecha } from '../../lib/format.js';
import Pill from '../ui/Pill.jsx';

const MARCA = { hito: '🏆', intencion: '📣', cambio_fase: '🔄', blocker: '🚧', silencio: '🔇', riesgo: '⚠️' };
const TONO = { hito: 'ok', intencion: 'warn', blocker: 'alert', riesgo: 'warn', silencio: 'off', cambio_fase: 'plain' };

/** Línea de tiempo del cliente: hechos con fecha que escribió Claude en cada ronda. */
export default function LogEventos({ eventos, limite = 20 }) {
  if (!eventos?.length) return <div className="empty">Todavía no hay eventos registrados.</div>;
  return (
    <div className="log-eventos">
      {eventos.slice(0, limite).map((e) => (
        <div key={e.id} className={`log-evento log-${e.tipo}`}>
          <div className="log-fecha num">{formatFecha(e.fecha)}</div>
          <div className="log-marca">{MARCA[e.tipo] ?? '•'}</div>
          <div className="log-cuerpo">
            <div className="log-titulo">
              {e.titulo}
              {e.estado === 'abierto' && <Pill tone="alert">abierto {Math.round(e.diasAbierto ?? 0)} d</Pill>}
              {e.estado === 'resuelto' && e.tipo === 'blocker' && <Pill tone="ok">resuelto</Pill>}
            </div>
            {e.extracto && <div className="log-extracto">«{e.extracto}»</div>}
            <div className="log-meta">
              <Pill tone={TONO[e.tipo] ?? 'plain'}>{e.tipo.replace('_', ' ')}</Pill>
              {e.tags?.map((t) => <span key={t} className="log-tag">#{t}</span>)}
              {e.responsable && <span className="dim">@{e.responsable}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
