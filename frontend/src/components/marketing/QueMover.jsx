import { useState } from 'react';
import { formatValue } from '../../lib/format.js';
import { useMeasure } from '../../lib/hooks.js';

/**
 * Cómo viene el mes, día por día, contra la meta de cada métrica.
 *
 * Las tres van en el mismo gráfico y por eso el eje es el porcentaje de la meta: chats,
 * agendas y cash no comparten unidad ni orden de magnitud, y en números absolutos el cash
 * aplastaría a las otras dos contra el piso. La diagonal punteada es el ritmo que llega
 * justo a fin de mes: lo que va por debajo está atrasado y esa distancia es lo que hay que
 * mover. Lo punteado de cada color es dónde cierra el mes si no cambia nada.
 *
 * @param {{ filas: Array<{ label: string, color: string, format?: string, meta: number,
 *                          acum: number[], proyectado: number }>,
 *           diaHoy: number, diasMes: number, height?: number }} props
 */
export default function QueMover({ filas, diaHoy, diasMes, height = 300 }) {
  const [ref, ancho] = useMeasure();
  const [dia, setDia] = useState(null);

  const M = { top: 14, right: 104, bottom: 26, left: 46 };
  const w = Math.max(ancho, 360);
  const iw = Math.max(w - M.left - M.right, 120);
  const ih = height - M.top - M.bottom;

  // Un poco de aire arriba del máximo: si no, la línea que se pasa de la meta termina
  // pegada al borde y parece cortada.
  const tope = Math.max(1.12, ...filas.map((f) => (f.proyectado / (f.meta || 1)) * 1.06));
  const px = (d) => M.left + (diasMes > 1 ? ((d - 1) / (diasMes - 1)) * iw : iw / 2);
  const py = (p) => M.top + ih - (Math.min(p, tope) / tope) * ih;

  const marcas = [];
  for (let p = 0; p <= tope + 0.001; p += 0.25) marcas.push(Math.round(p * 100) / 100);

  // Los días que se marcan abajo: el 1, el último y de a cinco en el medio.
  const diasEje = [1];
  for (let d = 6; d < diasMes; d += 5) diasEje.push(d);
  diasEje.push(diasMes);

  const lineas = filas.map((f) => {
    const pct = f.acum.map((v) => v / f.meta);
    const real = pct.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i + 1).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
    const ultimo = pct.length ? pct[pct.length - 1] : 0;
    return {
      ...f,
      pct,
      real,
      proy: `M${px(pct.length || 1).toFixed(1)} ${py(ultimo).toFixed(1)} L${px(diasMes).toFixed(1)} ${py(f.proyectado / f.meta).toFixed(1)}`,
      cx: px(pct.length || 1),
      cy: py(ultimo),
      yFin: py(f.proyectado / f.meta),
      llega: f.proyectado >= f.meta,
    };
  });

  // Dos métricas que cierran parecido dejarían sus nombres uno encima del otro.
  const etiquetas = lineas
    .map((l, i) => ({ i, y: l.yFin }))
    .sort((a, b) => a.y - b.y);
  etiquetas.forEach((e, n) => {
    if (n > 0 && e.y - etiquetas[n - 1].y < 30) e.y = etiquetas[n - 1].y + 30;
  });
  const yEtiqueta = {};
  etiquetas.forEach((e) => { yEtiqueta[e.i] = Math.min(Math.max(e.y, M.top + 10), M.top + ih); });

  return (
    <div className="chart-wrap" ref={ref}>
      {ancho > 0 && (
        <svg
          width={w}
          height={height}
          onMouseLeave={() => setDia(null)}
          onMouseMove={(e) => {
            const caja = e.currentTarget.getBoundingClientRect();
            const rel = e.clientX - caja.left - M.left;
            const d = Math.round((rel / iw) * (diasMes - 1)) + 1;
            setDia(Math.max(1, Math.min(diaHoy, d)));
          }}
        >
          {marcas.map((p) => (
            <g key={p}>
              <line x1={M.left} x2={M.left + iw} y1={py(p)} y2={py(p)} stroke="var(--border-soft)" />
              <text x={M.left - 8} y={py(p) + 4} textAnchor="end" fontSize="10.5" fill="var(--text-3)">
                {`${Math.round(p * 100)}%`}
              </text>
            </g>
          ))}
          {diasEje.map((d) => (
            <text key={d} x={px(d)} y={height - 8} textAnchor="middle" fontSize="10.5" fill="var(--text-3)">
              {d}
            </text>
          ))}

          {/* El ritmo que llega justo: de cero el día 1 a la meta el último día. */}
          <path
            d={`M${px(1).toFixed(1)} ${py(0).toFixed(1)} L${px(diasMes).toFixed(1)} ${py(1).toFixed(1)}`}
            fill="none"
            stroke="var(--text-3)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <line x1={M.left} x2={M.left + iw} y1={py(1)} y2={py(1)} stroke="var(--text-2)" strokeWidth="1" />
          <text x={M.left + 6} y={py(1) - 6} fontSize="10.5" fill="var(--text-2)">meta del mes</text>

          {dia !== null && (
            <line x1={px(dia)} x2={px(dia)} y1={M.top} y2={M.top + ih} stroke="var(--border)" strokeWidth="1" />
          )}

          {lineas.map((l, i) => (
            <g key={l.label}>
              <path d={l.real} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <path d={l.proy} fill="none" stroke={l.color} strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" opacity="0.6" />
              <circle cx={l.cx} cy={l.cy} r="3.5" fill={l.color} stroke="var(--surface)" strokeWidth="2" />
              {dia !== null && dia <= l.pct.length && (
                <circle cx={px(dia)} cy={py(l.pct[dia - 1])} r="3.5" fill={l.color} stroke="var(--surface)" strokeWidth="2" />
              )}
              <text x={M.left + iw + 8} y={yEtiqueta[i]} fontSize="12" fontWeight="600" fill={l.color}>
                {l.label}
              </text>
              <text x={M.left + iw + 8} y={yEtiqueta[i] + 14} fontSize="10.5" fill={l.llega ? 'var(--ok)' : 'var(--text-3)'}>
                {l.llega ? 'al ritmo' : `faltan ${formatValue(Math.max(l.meta - l.proyectado, 0), l.format ?? 'count')}`}
              </text>
            </g>
          ))}
        </svg>
      )}

      {dia !== null && (
        <div
          className="chart-tip"
          // Dentro del gráfico y lejos de los bordes: arriba tapaba la leyenda y en los
          // extremos se salía de la tarjeta.
          style={{ left: Math.min(Math.max(px(dia), M.left + 80), M.left + iw - 80), top: M.top + 92 }}
        >
          <div className="t">{`Día ${dia}`}</div>
          {lineas.map((l) => (
            <div key={l.label} className="v num" style={{ color: l.color }}>
              {`${l.label}: ${formatValue(l.acum[dia - 1] ?? 0, l.format ?? 'count')}`}
              <span className="dim" style={{ fontWeight: 500 }}>
                {` · ${Math.round(((l.acum[dia - 1] ?? 0) / l.meta) * 100)}%`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
