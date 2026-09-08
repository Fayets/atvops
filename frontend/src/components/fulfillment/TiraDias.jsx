import { formatFecha } from '../../lib/format.js';

/**
 * Tira de los últimos 30 días de un canal: el color es cuánto escribió el
 * cliente; el punto, si el equipo respondió ese día. Una sola fila que dice
 * más del vínculo que cualquier promedio.
 * @param {{ dias: { fecha: string, cliente: number, coach: number }[] }} props
 */
export default function TiraDias({ dias }) {
  if (!dias.length) return <div className="empty">Sin actividad diaria disponible.</div>;
  const tope = Math.max(1, ...dias.map((d) => d.cliente));
  const color = (v) =>
    v <= 0 ? 'var(--surface-2)' : `color-mix(in srgb, var(--brand) ${Math.round(8 + (v / tope) * 88)}%, var(--surface-2))`;
  const diasCliente = dias.filter((d) => d.cliente > 0).length;
  const diasCoach = dias.filter((d) => d.coach > 0).length;

  return (
    <div className="tira-dias">
      <div className="tira-dias-grid" style={{ '--n': dias.length }}>
        {dias.map((d) => (
          <span
            key={d.fecha}
            className="tira-dia"
            style={{ background: color(d.cliente) }}
            title={`${formatFecha(d.fecha)} · cliente ${d.cliente} · equipo ${d.coach}`}
          >
            {d.coach > 0 && <i />}
          </span>
        ))}
      </div>
      <div className="tira-dias-pie">
        <span>{formatFecha(dias[0].fecha)}</span>
        <span>
          el cliente escribió <b>{diasCliente}</b> de {dias.length} días · el equipo respondió <b>{diasCoach}</b>
        </span>
        <span>{formatFecha(dias[dias.length - 1].fecha)}</span>
      </div>
    </div>
  );
}
