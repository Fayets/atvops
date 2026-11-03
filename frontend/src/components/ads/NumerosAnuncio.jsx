import { useEffect, useState } from 'react';
import { getAnuncioMeta } from '../../data/api.js';
import { formatValue } from '../../lib/format.js';
import { ErrorState, SkeletonBlock } from '../ui/Loading.jsx';

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
 * Los números de un anuncio: el mes día por día, los de toda su vida y el texto. Va adentro del
 * panel del creativo, en la pestaña "Números".
 */
export default function NumerosAnuncio({ id, mes, mesLabel }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let vivo = true;
    setD(null);
    getAnuncioMeta(id, mes).then((r) => vivo && setD(r)).catch((e) => vivo && setError(e));
    return () => { vivo = false; };
  }, [id, mes]);

  if (error) return <div style={{ padding: 18 }}><ErrorState error={error} /></div>;
  if (!d) return <div style={{ padding: 18 }}><SkeletonBlock height={320} /></div>;
  const max = Math.max(1, ...(d.dias ?? []).map((x) => x.gastoUsd));
  return (
    <>
      <div className="ads-sec">
        <h3>En {mesLabel}</h3>
        <Numeros n={d.mes} />
        {d.dias.length > 0 ? (
          <div className="ads-dias" aria-label="Gasto por día">
            {d.dias.map((x) => (
              <span key={x.fecha} title={`${x.fecha}: ${usd(x.gastoUsd)}`}>
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
      <div className="ads-sec">
        <a href={d.link} target="_blank" rel="noreferrer" className="dim">Abrir en Ads Manager →</a>
      </div>
    </>
  );
}
