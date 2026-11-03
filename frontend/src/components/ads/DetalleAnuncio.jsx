import { useEffect, useState } from 'react';
import { getAnuncioMeta } from '../../data/api.js';
import { formatValue } from '../../lib/format.js';
import { ErrorState, SkeletonBlock } from '../ui/Loading.jsx';
import Pill from '../ui/Pill.jsx';

const TONO = { corriendo: 'ok', 'con problemas': 'warn', 'en revisión': 'warn', pausado: 'off', rechazado: 'alert' };
const usd = (n) => formatValue(n ?? 0, 'usd');
const num = (n) => formatValue(n ?? 0, 'count');

function Numeros({ n }) {
  const filas = [
    ['Gasto', usd(n.gastoUsd)], ['Leads', num(n.leads)], ['CPL', n.leads ? usd(n.cplUsd) : '—'],
    ['Impresiones', num(n.impresiones)], ['Alcance', num(n.alcance)], ['Frecuencia', Number(n.frecuencia || 0).toFixed(2)],
    ['Clicks', num(n.clicks)], ['CTR', `${Number(n.ctr || 0).toFixed(2)}%`], ['CPC', n.clicks ? usd(n.cpcUsd) : '—'],
  ].filter(([k]) => n.leads || (k !== 'Leads' && k !== 'CPL')); // una campaña de seguidores no tiene leads

  return (
    <div className="ads-kpis">
      {filas.map(([k, v]) => <div key={k}><span className="dim">{k}</span><b className="num">{v}</b></div>)}
    </div>
  );
}

/**
 * Un anuncio en el panel lateral: sus números del mes, día por día, los de toda su vida y el texto.
 */
export default function DetalleAnuncio({ id, mes, mesLabel, onCerrar }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let vivo = true;
    getAnuncioMeta(id, mes).then((r) => vivo && setD(r)).catch((e) => vivo && setError(e));
    const esc = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', esc);
    return () => { vivo = false; window.removeEventListener('keydown', esc); };
  }, [id, mes, onCerrar]);

  const max = Math.max(1, ...(d?.dias ?? []).map((x) => x.gastoUsd));
  return (
    <div className="ads-velo" onClick={onCerrar} role="presentation">
      <aside className="ads-drawer" role="dialog" aria-label="Detalle del anuncio" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ads-cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        {error ? <div style={{ padding: 18 }}><ErrorState error={error} /></div> : !d ? <div style={{ padding: 18 }}><SkeletonBlock height={320} /></div> : (
          <>
            <div className="ads-det-cab">
              {d.imagen && <img src={d.imagen} alt="" referrerPolicy="no-referrer" />}
              <div>
                <Pill tone={TONO[d.estado] ?? 'off'} dot>{d.estado}</Pill>
                <h2>{d.nombre}</h2>
                <p className="dim">{d.campania}{d.conjunto ? ` · ${d.conjunto}` : ''}</p>
                <a href={d.link} target="_blank" rel="noreferrer" className="dim">Abrir en Ads Manager →</a>
              </div>
            </div>
            <div className="ads-sec">
              <h3>En {mesLabel}</h3>
              <Numeros n={d.mes} />
              {d.dias.length > 0 ? (
                <div className="ads-dias" aria-label="Gasto por día">
                  {d.dias.map((x) => (
                    <span key={x.fecha} title={`${x.fecha}: ${usd(x.gastoUsd)} · ${x.leads} leads`}>
                      <i style={{ height: `${Math.max(2, (x.gastoUsd / max) * 100)}%` }} />
                    </span>
                  ))}
                </div>
              ) : <p className="dim">No gastó en {mesLabel}.</p>}
            </div>
            <div className="ads-sec">
              <h3>Toda su vida</h3>
              <Numeros n={d.vida} />
            </div>
            {(d.titulo || d.texto) && (
              <div className="ads-sec">
                <h3>El anuncio</h3>
                {d.titulo && <b>{d.titulo}</b>}
                {d.texto && <p className="ads-copy">{d.texto}</p>}
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
