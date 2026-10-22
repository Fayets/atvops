import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Bocetos from '../../components/marketing/Bocetos.jsx';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import { getPizarraVault, pizarraActualizarVariante, pizarraBorrarVariante } from '../../data/api.js';
import '../../styles/pizarra.css';

/**
 * El vault de ideas: todo lo que se aprobó en la pizarra, por canal, con la idea general y la
 * llamada de donde salió. Las de historias muestran sus secuencias.
 */

const CANALES = [['', 'Todas'], ['yt', 'YouTube'], ['reel', 'Reels'], ['story', 'Historias']];
const NOMBRE = { yt: 'YouTube', reel: 'Reel', story: 'Historias' };
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '');

export default function VaultIdeas() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [canal, setCanal] = useState('');
  const [abierta, setAbierta] = useState(null);

  const traer = () => getPizarraVault(true).then(setDatos).catch((e) => setError(e));
  useEffect(() => { traer(); }, []);

  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (!datos) return <div className="page"><SkeletonBlock height={400} /></div>;

  const ideas = datos.ideas.filter((i) => !canal || i.canal === canal);
  const sacar = async (id) => { await pizarraActualizarVariante(id, { estado: 'propuesta' }); traer(); };
  const borrar = async (i) => {
    const n = i.secuencias.length;
    const sec = n > 1 ? ` y sus ${n} secuencias` : n === 1 ? ' y su secuencia' : '';
    if (!window.confirm(`¿Borrar la idea "${i.titulo}"${sec}?`)) return;
    try { await pizarraBorrarVariante(i.id); setAbierta(null); traer(); } catch (e) { window.alert(e.message); }
  };

  return (
    <div className="page vt">
      <div className="pz-barra">
        <div className="pz-segmento vt-filtro" role="tablist">
          {CANALES.map(([k, l]) => (
            <button key={k || 'todas'} type="button" role="tab" aria-selected={canal === k} onClick={() => setCanal(k)}>
              {l} <span className="vt-n">{datos.ideas.filter((i) => !k || i.canal === k).length}</span>
            </button>
          ))}
        </div>
        <span className="pz-sep" />
        <Link to="/marketing/pizarra" className="btn">Pizarra</Link>
      </div>

      {ideas.length === 0 && <p className="pz-dim">Todavía no hay ideas aprobadas{canal ? ' en este canal' : ''}.</p>}
      <div className="vt-lista">
        {ideas.map((i) => (
          <article key={i.id} className={`vt-idea c-${i.canal}${abierta === i.id ? ' abierta' : ''}`}>
            <button type="button" className="vt-cab" onClick={() => setAbierta(abierta === i.id ? null : i.id)} aria-expanded={abierta === i.id}>
              <span className="vt-canal">{NOMBRE[i.canal]}</span>
              <b>{i.titulo}</b>
              <span className="pz-dim">{fecha(i.decididoAt)}{i.decididoPor ? ` · ${i.decididoPor}` : ''}</span>
            </button>
            {abierta === i.id && (
              <div className="vt-cuerpo">
                {i.detalle && <p className="pz-p-detalle">{i.detalle}</p>}
                <div className="vt-origen">
                  <span className="pz-k">Idea general</span>
                  <b>{i.general.titulo}</b>
                  {i.general.cita && <blockquote className="pz-cita">{i.general.minuto && <span className="pz-min">{i.general.minuto}</span>}{i.general.cita}</blockquote>}
                  <span className="pz-dim">{i.llamada.tipo === 'clase' ? 'Clase grupal' : '1 a 1'} · {i.llamada.titulo}</span>
                </div>
                {i.secuencias.length > 0 && <Bocetos secuencias={i.secuencias} />}
                <div className="pz-botones">
                  <button type="button" className="btn ghost sm" onClick={() => sacar(i.id)}>Sacar del vault</button>
                  <button type="button" className="btn ghost sm" onClick={() => borrar(i)}>Borrar</button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
