import { useState } from 'react';
import { formatValue } from '../../lib/format.js';
import { useMeasure } from '../../lib/hooks.js';

/**
 * Lo que falta para llegar a la meta del mes, por métrica.
 *
 * Cada barra está medida contra su propia meta, así chats, agendas y cash —que no tienen
 * ni la misma unidad ni el mismo orden de magnitud— se leen en la misma escala y en el
 * mismo eje: 100% es la meta. Lo negro es lo que ya pasó, lo gris lo que suma el ritmo de
 * hoy hasta fin de mes, y lo rojo es lo que hay que mover.
 *
 * @param {{ filas: Array<{ label: string, p: object, format?: string }>, height?: number }} props
 */
export default function QueMover({ filas, height }) {
  const [ref, width] = useMeasure();
  const [hover, setHover] = useState(null);

  const FILA = 42;
  const BARRA = 15;
  const M = { top: 10, right: 104, bottom: 24, left: 86 };
  const alto = height ?? M.top + M.bottom + filas.length * FILA;
  const w = Math.max(width, 320);
  const iw = Math.max(w - M.left - M.right, 80);

  // Eje en porcentaje de la meta: 100% es llegar. Se estira si alguna métrica proyecta
  // pasarse, para que la barra no se corte en el borde.
  // Un poco de aire arriba del máximo: si no, la barra que se pasa de la meta termina
  // pegada al borde y parece cortada.
  const tope = Math.max(1.12, ...filas.map((f) => ((f.p.proyectado ?? 0) / (f.p.meta || 1)) * 1.06));
  const x = (p) => M.left + (Math.max(p, 0) / tope) * iw;
  const cy = (i) => M.top + i * FILA + FILA / 2;

  const marcas = [0, 0.5, 1];

  return (
    <div className="chart-wrap" ref={ref}>
      {width > 0 && (
        <svg width={w} height={alto} onMouseLeave={() => setHover(null)}>
          {marcas.map((m) => (
            <line
              key={m}
              x1={x(m)}
              x2={x(m)}
              y1={M.top - 2}
              y2={M.top + filas.length * FILA}
              stroke={m === 1 ? 'var(--text-3)' : 'var(--border-soft)'}
              strokeDasharray={m === 1 ? '3 4' : undefined}
            />
          ))}
          {marcas.map((m) => (
            <text
              key={`t${m}`}
              x={x(m)}
              y={alto - 8}
              textAnchor={m === 0 ? 'start' : 'middle'}
              fontSize="10.5"
              fill={m === 1 ? 'var(--text-2)' : 'var(--text-3)'}
            >
              {m === 1 ? 'meta' : `${m * 100}%`}
            </text>
          ))}

          {filas.map((f, i) => {
            const { p } = f;
            const fmt = f.format ?? 'count';
            const pr = p.real / p.meta;
            const pp = Math.max(p.proyectado / p.meta, pr);
            const llega = pp >= 1;
            const activa = hover === i;
            const opacidad = hover === null || activa ? 1 : 0.45;
            // 2px de superficie entre tramos: si no, los bordes se tocan y la barra se
            // lee como un solo bloque.
            const tramo = (desde, hasta) => Math.max(x(hasta) - x(desde) - 2, 0);
            return (
              <g key={f.label} onMouseEnter={() => setHover(i)}>
                <rect x={0} y={M.top + i * FILA} width={w} height={FILA} fill="transparent" />
                <text x={M.left - 12} y={cy(i) + 4} textAnchor="end" fontSize="12.5" fill="var(--text)" fontWeight="500">
                  {f.label}
                </text>

                <rect
                  x={M.left}
                  y={cy(i) - BARRA / 2}
                  width={tramo(0, pr)}
                  height={BARRA}
                  rx="4"
                  fill="var(--s1)"
                  opacity={opacidad}
                />
                {pp > pr && (
                  <rect
                    x={x(pr)}
                    y={cy(i) - BARRA / 2}
                    width={tramo(pr, pp)}
                    height={BARRA}
                    rx="4"
                    fill="var(--s3)"
                    opacity={opacidad}
                  />
                )}
                {!llega && (
                  <rect
                    x={x(pp)}
                    y={cy(i) - BARRA / 2}
                    width={tramo(pp, 1)}
                    height={BARRA}
                    rx="4"
                    fill="var(--brand)"
                    opacity={opacidad}
                  />
                )}

                {llega ? (
                  <text x={w - M.right + 10} y={cy(i) + 4} fontSize="11.5" fill="var(--ok)" fontWeight="600">
                    al ritmo
                  </text>
                ) : (
                  <>
                    <text x={w - M.right + 10} y={cy(i) - 1} fontSize="11.5" fill="var(--brand-hi)" fontWeight="600">
                      {`faltan ${formatValue(Math.max(p.meta - p.proyectado, 0), fmt)}`}
                    </text>
                    <text x={w - M.right + 10} y={cy(i) + 12} fontSize="10.5" fill="var(--text-3)">
                      {`${formatValue(Math.ceil(p.necesarioDia), fmt)} / día`}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      )}

      {hover !== null && (() => {
        const f = filas[hover];
        const fmt = f.format ?? 'count';
        const pp = Math.max(f.p.proyectado / f.p.meta, f.p.real / f.p.meta);
        return (
          <div className="chart-tip" style={{ left: Math.min(x(Math.min(pp, 1)), w - M.right), top: cy(hover) - 6 }}>
            <div className="t">{f.label}</div>
            <div className="v num">{`va ${formatValue(f.p.real, fmt)} de ${formatValue(f.p.meta, fmt)}`}</div>
            <div className="v num" style={{ color: 'var(--text-2)', fontWeight: 500 }}>
              {`al ritmo de hoy cierra en ${formatValue(f.p.proyectado, fmt)}`}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
