import { useEffect, useState } from 'react';
import { getSeguidoresVivo } from '../../data/api.js';
import { formatValue } from '../../lib/format.js';
import { useMeasure } from '../../lib/hooks.js';
import Card from '../ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../ui/Loading.jsx';
import Pill from '../ui/Pill.jsx';

const RANGOS = [[24, '24 h'], [72, '3 días'], [168, '7 días']];
const CADA_MS = 60_000; // la pantalla pregunta cada minuto; el servidor saca foto nueva cada 2 como mucho

const hora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
const diaHora = (iso) => new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
const signo = (n) => (n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatValue(Math.abs(n), 'count')}`);

/**
 * El total de seguidores de la cuenta en vivo y cómo vino subiendo y bajando. Instagram da el
 * total al instante pero no su historia: la historia son las fotos que saca Ops cada 10 minutos.
 */
export default function SeguidoresVivo() {
  const [horas, setHoras] = useState(24);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    const traer = () => getSeguidoresVivo(horas)
      .then((r) => { if (vivo) { setD(r); setError(null); } })
      .catch((e) => vivo && setError(e));
    traer();
    const t = setInterval(traer, CADA_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [horas]);

  const tono = (n) => (n > 0 ? 'ok' : n < 0 ? 'alert' : 'off');
  return (
    <Card
      title={d?.usuario ? `Seguidores de @${d.usuario}` : 'Seguidores de la cuenta'}
      sub={d ? `en vivo · ${hora(d.at)}` : 'en vivo'}
      actions={(
        <div className="ads-chips" role="group" aria-label="Cuánto para atrás">
          {RANGOS.map(([h, label]) => (
            <button key={h} type="button" className={`chip${horas === h ? ' active' : ''}`} aria-pressed={horas === h} onClick={() => setHoras(h)}>{label}</button>
          ))}
        </div>
      )}
      className="seg-vivo"
    >
      {error && !d ? <ErrorState error={error} /> : !d ? <SkeletonBlock height={220} /> : (
        <>
          <div className="seg-vivo-cab">
            <b className="num seg-vivo-total">{formatValue(d.actual, 'count')}</b>
            <div className="seg-vivo-deltas">
              <span><span className="dim">hoy</span> <Pill tone={tono(d.hoy)}>{signo(d.hoy)}</Pill></span>
              <span><span className="dim">última hora</span> <Pill tone={tono(d.ultimaHora)}>{signo(d.ultimaHora)}</Pill></span>
            </div>
          </div>
          {d.puntos.length < 2 ? (
            <p className="dim" style={{ margin: '8px 0 0' }}>{`Juntando datos desde ${diaHora(d.desdeAt ?? d.at)}: una foto cada 10 minutos.`}</p>
          ) : <Linea puntos={d.puntos} />}
        </>
      )}
    </Card>
  );
}

function Linea({ puntos, height = 220 }) {
  const [ref, ancho] = useMeasure();
  const [i, setI] = useState(null);
  const M = { top: 12, right: 16, bottom: 26, left: 58 };
  const w = Math.max(ancho, 280);
  const iw = w - M.left - M.right;
  const ih = height - M.top - M.bottom;

  const ts = puntos.map((p) => new Date(p.at).getTime());
  const t0 = ts[0];
  const t1 = Math.max(ts[ts.length - 1], t0 + 1);
  const totales = puntos.map((p) => p.total);
  // Un margen mínimo: con la línea casi plana, cada seguidor parecería un precipicio.
  const medio = (Math.min(...totales) + Math.max(...totales)) / 2;
  const mitad = Math.max(5, (Math.max(...totales) - Math.min(...totales)) * 0.6);
  const lo = Math.floor(medio - mitad);
  const hi = Math.ceil(medio + mitad);
  const px = (t) => M.left + ((t - t0) / (t1 - t0)) * iw;
  const py = (v) => M.top + ih - ((v - lo) / (hi - lo)) * ih;
  const d = puntos.map((p, k) => `${k ? 'L' : 'M'}${px(ts[k]).toFixed(1)} ${py(p.total).toFixed(1)}`).join(' ');
  const marcas = [lo, Math.round((lo + hi) / 2), hi];
  const ejeX = [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + (t1 - t0) * f);
  const largo = t1 - t0 > 36 * 3600_000;
  const ult = puntos.length - 1;

  return (
    <div className="chart-wrap" ref={ref}>
      {ancho > 0 && (
        <svg
          width={w}
          height={height}
          role="img"
          aria-label="Total de seguidores a lo largo del tiempo"
          onMouseLeave={() => setI(null)}
          onMouseMove={(e) => {
            const caja = e.currentTarget.getBoundingClientRect();
            const t = t0 + ((e.clientX - caja.left - M.left) / iw) * (t1 - t0);
            let mejor = 0;
            ts.forEach((x, k) => { if (Math.abs(x - t) < Math.abs(ts[mejor] - t)) mejor = k; });
            setI(mejor);
          }}
        >
          {marcas.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={M.left + iw} y1={py(v)} y2={py(v)} stroke="var(--border-soft)" />
              <text x={M.left - 8} y={py(v) + 4} textAnchor="end" fontSize="10.5" fill="var(--text-3)">{formatValue(v, 'count')}</text>
            </g>
          ))}
          {ejeX.map((t) => (
            <text key={t} x={px(t)} y={height - 8} textAnchor="middle" fontSize="10.5" fill="var(--text-3)">
              {largo ? diaHora(new Date(t).toISOString()) : hora(new Date(t).toISOString())}
            </text>
          ))}
          {i !== null && <line x1={px(ts[i])} x2={px(ts[i])} y1={M.top} y2={M.top + ih} stroke="var(--border)" />}
          <path d={d} fill="none" stroke="var(--s1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={px(ts[ult])} cy={py(puntos[ult].total)} r="4" fill="var(--s1)" stroke="var(--surface)" strokeWidth="2" />
          {i !== null && <circle cx={px(ts[i])} cy={py(puntos[i].total)} r="4" fill="var(--s1)" stroke="var(--surface)" strokeWidth="2" />}
        </svg>
      )}
      {i !== null && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(px(ts[i]), M.left + 70), M.left + iw - 70), top: M.top + 8 }}>
          <div className="t">{diaHora(puntos[i].at)}</div>
          <div className="v num">{formatValue(puntos[i].total, 'count')}</div>
          {i > 0 && <div className="v num dim">{`${signo(puntos[i].total - puntos[i - 1].total)} vs la foto anterior`}</div>}
        </div>
      )}
    </div>
  );
}
