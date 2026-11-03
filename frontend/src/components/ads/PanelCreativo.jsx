import { useCallback, useEffect, useState } from 'react';
import { audienciaMarcar, audienciaReanalizar, getPerfilesReel } from '../../data/api.js';
import Lead from '../audiencia/LeadAudiencia.jsx';
import { ErrorState, SkeletonBlock } from '../ui/Loading.jsx';
import Pill from '../ui/Pill.jsx';
import NumerosAnuncio from './NumerosAnuncio.jsx';

const TONO_VEREDICTO = { escalar: 'ok', mantener: 'plain', pausar: 'alert', 'juntando datos': 'off' };
const FILTROS = [['todos', 'Todos'], ['calificado', 'Calificados'], ['sin_analizar', 'Sin analizar'], ['no', 'Descartados']];

/**
 * El panel de la derecha al tocar un creativo: primero las personas que dejó su post, con el
 * veredicto de Audiencia; en la otra pestaña, los números del anuncio.
 */
export default function PanelCreativo({ cr, mes, mesLabel, onCerrar }) {
  const [tab, setTab] = useState(cr.mediaId ? 'perfiles' : 'numeros');
  const [filtro, setFiltro] = useState('todos');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(() => {
    if (!cr.mediaId) return Promise.resolve();
    return getPerfilesReel(cr.mediaId).then((r) => { setDatos(r); setError(null); }).catch(setError);
  }, [cr.mediaId]);

  useEffect(() => {
    setDatos(null);
    cargar();
    const esc = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [cargar, onCerrar]);

  const accion = async (fn) => {
    setOcupado(true);
    try { await fn(); await cargar(); } catch (e) { setError(e); } finally { setOcupado(false); }
  };

  const perfiles = datos?.perfiles ?? [];
  const cuenta = (k) => (k === 'todos' ? perfiles.length : perfiles.filter((l) => l.veredicto === k).length);
  const visibles = filtro === 'todos' ? perfiles : perfiles.filter((l) => l.veredicto === filtro);

  return (
    <div className="ads-velo" onClick={onCerrar} role="presentation">
      <aside className="ads-drawer panel-creativo" role="dialog" aria-label={`Creativo ${cr.nombre}`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ads-cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <div className="ads-det-cab">
          {cr.imagen && <img src={cr.imagen} alt="" referrerPolicy="no-referrer" />}
          <div>
            <Pill tone={TONO_VEREDICTO[cr.veredicto] ?? 'plain'}>{cr.veredicto}</Pill>
            <h2>{cr.nombre}</h2>
            <p className="dim">{cr.conjunto}</p>
          </div>
        </div>

        <div className="panel-tabs" role="tablist">
          {cr.mediaId && (
            <button type="button" role="tab" aria-selected={tab === 'perfiles'} className={tab === 'perfiles' ? 'active' : ''} onClick={() => setTab('perfiles')}>
              Perfiles {datos && <span className="dim num">{perfiles.length}</span>}
            </button>
          )}
          <button type="button" role="tab" aria-selected={tab === 'numeros'} className={tab === 'numeros' ? 'active' : ''} onClick={() => setTab('numeros')}>
            Números
          </button>
        </div>

        {tab === 'numeros' ? <NumerosAnuncio id={cr.id} mes={mes} mesLabel={mesLabel} /> : (
          error ? <div style={{ padding: 18 }}><ErrorState error={error} /></div>
            : !datos ? <div style={{ padding: 18 }}><SkeletonBlock height={320} /></div>
              : perfiles.length === 0 ? (
                <div className="ads-sec">
                  <p className="dim" style={{ margin: 0 }}>Todavía nadie comentó este anuncio, o Audiencia no pasó a leerlo.</p>
                </div>
              ) : (
                <div className="ads-sec">
                  <div className="ads-chips" role="group" aria-label="Qué perfiles ver">
                    {FILTROS.filter(([k]) => k === 'todos' || cuenta(k)).map(([k, label]) => (
                      <button key={k} type="button" className={`chip${filtro === k ? ' active' : ''}`} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>
                        {label} <span className="dim num">{cuenta(k)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="panel-perfiles">
                    {visibles.map((l) => (
                      <Lead
                        key={l.id}
                        l={l}
                        ocupado={ocupado}
                        onDescartar={(x, estado) => accion(() => audienciaMarcar(x.id, estado))}
                        onReanalizar={(x) => accion(() => audienciaReanalizar(x.id))}
                      />
                    ))}
                  </div>
                </div>
              )
        )}
      </aside>
    </div>
  );
}
