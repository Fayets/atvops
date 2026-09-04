import { useState } from 'react';

/**
 * Mapa de calor de actividad: una fila por cliente, una columna por semana.
 * De un vistazo se ve quién se apagó y cuándo — que es justo el dato que un
 * formulario nunca captura y el transcript sí.
 *
 * @param {{ filas: { id: string, label: string, valores: number[], sub?: string, tono?: string }[],
 *           columnas: string[], max?: number, onClickFila?: (id: string) => void,
 *           unidad?: string }} props
 */
export default function Heatmap({ filas, columnas, max, onClickFila, unidad = 'mensajes' }) {
  const [hover, setHover] = useState(null);
  const tope = max ?? Math.max(1, ...filas.flatMap((f) => f.valores));

  const color = (v) => {
    if (v <= 0) return 'var(--surface-2)';
    const t = Math.min(1, v / tope);
    return `color-mix(in srgb, var(--brand) ${Math.round(4 + t * 92)}%, var(--surface-2))`;
  };

  if (!columnas.length) {
    return <div className="empty">Sin semanas de actividad en los transcripts.</div>;
  }

  if (!filas.length) {
    return <div className="empty">Sin canales de cliente para armar el pulso.</div>;
  }

  return (
    <div className="heatmap" style={{ '--cols': columnas.length }}>
      <div className="heatmap-head">
        <span />
        {columnas.map((c) => (
          <span key={c} className="heatmap-col" title={c}>
            {c}
          </span>
        ))}
      </div>

      {filas.map((f) => (
        <div
          key={f.id}
          className={`heatmap-row${onClickFila ? ' clickable' : ''}`}
          onClick={() => onClickFila?.(f.id)}
        >
          <span className="heatmap-label" title={`${f.label}${f.sub ? ` · ${f.sub}` : ''}`}>
            {f.label}
            {f.sub && (
              <em style={f.tono ? { color: f.tono } : undefined}>{f.sub}</em>
            )}
          </span>
          {columnas.map((col, i) => {
            const v = f.valores[i] ?? 0;
            return (
              <span
                key={`${f.id}-${col}`}
                className="heatmap-cell"
                style={{ background: color(v) }}
                onMouseEnter={() => setHover({ fila: f.label, col, v })}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </div>
      ))}

      <div className="heatmap-pie">
        <span>menos {unidad}</span>
        {[0.05, 0.25, 0.5, 0.75, 1].map((t) => (
          <i key={t} style={{ background: color(t * tope) }} />
        ))}
        <span>
          más ({Math.round(tope * 10) / 10} por semana)
        </span>
        {hover && (
          <span className="heatmap-tip">
            <strong>{hover.fila}</strong> · {hover.col}: {hover.v} {unidad}
          </span>
        )}
      </div>
    </div>
  );
}
