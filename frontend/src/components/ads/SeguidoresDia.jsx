import { useState } from 'react';
import { useMeasure } from '../../lib/hooks.js';

const SIGUEN = 'var(--s2)';
const DEJAN = 'var(--s1)'; // las series no opinan: el rojo de la marca es para navegar (tokens.css)

/**
 * Cuántos empezaron a seguir y cuántos dejaron, día por día, con el arranque de la campaña
 * marcado. Son la misma unidad (personas por día), así que van en un solo eje.
 *
 * @param {{ dias: Array<{ fecha: string, siguen: number, dejan: number }>, inicio?: string,
 *           normalDejan?: number, height?: number }} props
 */
export default function SeguidoresDia({ dias, inicio, normalDejan = null, height = 220 }) {
  const [ref, ancho] = useMeasure();
  const [i, setI] = useState(null);

  const M = { top: 14, right: 16, bottom: 26, left: 34 };
  const w = Math.max(ancho, 280);
  const iw = w - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const n = dias.length;
  const tope = Math.max(10, normalDejan ?? 0, ...dias.flatMap((d) => [d.siguen, d.dejan])) * 1.12;
  const paso = Math.max(1, Math.ceil(tope / 4 / 10) * 10);
  const px = (k) => M.left + (n > 1 ? (k / (n - 1)) * iw : iw / 2);
  const py = (v) => M.top + ih - (v / tope) * ih;
  const linea = (clave) => dias.map((d, k) => `${k ? 'L' : 'M'}${px(k).toFixed(1)} ${py(d[clave]).toFixed(1)}`).join(' ');

  // El arranque cae entre dos días: a la hora en que arrancó, dentro de su día.
  let xAds = null;
  if (inicio && n) {
    const t = new Date(inicio);
    const dia = t.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
    const k = dias.findIndex((d) => d.fecha === dia);
    const hora = Number(t.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hour12: false })) % 24;
    if (k >= 0) xAds = px(k) + (k < n - 1 ? (px(k + 1) - px(k)) * (hora / 24) : 0);
    else if (dia < dias[0].fecha) xAds = M.left;
  }
  const etiqueta = (f) => {
    const [, m, d] = f.split('-');
    return `${Number(d)}/${Number(m)}`;
  };
  const cada = Math.max(1, Math.ceil(n / 8));
  const marcas = [];
  for (let v = 0; v <= tope; v += paso) marcas.push(v);

  return (
    <div className="chart-wrap" ref={ref}>
      {ancho > 0 && n > 0 && (
        <svg
          width={w}
          height={height}
          role="img"
          aria-label="Seguidores que entran y que se van por día"
          onMouseLeave={() => setI(null)}
          onMouseMove={(e) => {
            const caja = e.currentTarget.getBoundingClientRect();
            const k = Math.round(((e.clientX - caja.left - M.left) / iw) * (n - 1));
            setI(Math.max(0, Math.min(n - 1, k)));
          }}
        >
          {marcas.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={M.left + iw} y1={py(v)} y2={py(v)} stroke="var(--border-soft)" />
              <text x={M.left - 8} y={py(v) + 4} textAnchor="end" fontSize="10.5" fill="var(--text-3)">{v}</text>
            </g>
          ))}
          {xAds !== null && (
            <g>
              <rect x={xAds} y={M.top} width={M.left + iw - xAds} height={ih} fill="var(--text)" opacity="0.04" />
              <line x1={xAds} x2={xAds} y1={M.top} y2={M.top + ih} stroke="var(--text-2)" strokeDasharray="3 3" />
              <text x={xAds + 5} y={M.top + 11} fontSize="10.5" fill="var(--text-2)">ads</text>
            </g>
          )}
          {dias.map((d, k) => (k % cada === 0 || k === n - 1) && (
            <text key={d.fecha} x={px(k)} y={height - 8} textAnchor="middle" fontSize="10.5" fill="var(--text-3)">{etiqueta(d.fecha)}</text>
          ))}
          {normalDejan != null && (
            // Lo que se iba por día antes de la campaña: un día arriba no es alerta, tres seguidos sí.
            <g>
              <line x1={M.left} x2={M.left + iw} y1={py(normalDejan)} y2={py(normalDejan)} stroke="var(--text-3)" strokeDasharray="4 4" />
              <text x={M.left + iw} y={py(normalDejan) - 5} textAnchor="end" fontSize="10.5" fill="var(--text-3)">
                {`normal ${String(normalDejan).replace('.', ',')}`}
              </text>
            </g>
          )}
          {i !== null && <line x1={px(i)} x2={px(i)} y1={M.top} y2={M.top + ih} stroke="var(--border)" />}
          <path d={linea('siguen')} fill="none" stroke={SIGUEN} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <path d={linea('dejan')} fill="none" stroke={DEJAN} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {dias.map((d, k) => (
            <g key={d.fecha}>
              <circle cx={px(k)} cy={py(d.siguen)} r="4" fill={SIGUEN} stroke="var(--surface)" strokeWidth="2" />
              <circle cx={px(k)} cy={py(d.dejan)} r="4" fill={DEJAN} stroke="var(--surface)" strokeWidth="2" />
            </g>
          ))}
        </svg>
      )}
      {i !== null && dias[i] && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(px(i), M.left + 70), M.left + iw - 70), top: M.top + 8 }}>
          <div className="t">{etiqueta(dias[i].fecha)}</div>
          <div className="v num" style={{ color: SIGUEN }}>{`Siguen: ${dias[i].siguen}`}</div>
          <div className="v num" style={{ color: DEJAN }}>{`Dejan: ${dias[i].dejan}`}</div>
          <div className="v num">{`Neto: ${dias[i].siguen - dias[i].dejan > 0 ? '+' : ''}${dias[i].siguen - dias[i].dejan}`}</div>
        </div>
      )}
    </div>
  );
}
