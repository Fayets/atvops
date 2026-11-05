import { useEffect, useState } from 'react';
import CalendarioContenido from '../../components/marketing/CalendarioContenido.jsx';
import Reels from '../../components/marketing/Reels.jsx';
import Secuencias from '../../components/marketing/Secuencias.jsx';
import VideosYouTube from '../../components/marketing/VideosYouTube.jsx';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import {
  bajarContenidoPdf, getInstagramPropio, getMesesContenido, getYouTubePropio,
  sincronizarInstagram, sincronizarYouTube,
} from '../../data/api.js';
import { HISTORICO, nombreMesDesdeId } from '../../lib/mes.js';
import { useMes } from '../../lib/MesContext.jsx';
import { useResource } from '../../lib/hooks.js';

const VISTAS = {
  calendario: {
    titulo: 'Calendario',
    fuente: 'instagram_ops',
  },
  reels: {
    titulo: 'Reels',
    fuente: 'instagram_ops',
  },
  historias: {
    titulo: 'Historias',
    fuente: 'instagram_ops',
  },
  youtube: {
    titulo: 'YouTube',
    fuente: 'youtube_ops',
  },
};

/** Instagram hace falta en todas menos YouTube; el canal, en YouTube y en el calendario. */
const NECESITA_IG = new Set(['calendario', 'reels', 'historias']);
const NECESITA_YT = new Set(['calendario', 'youtube']);
// Las vistas que se pueden bajar como PDF.
const PDF = new Set(['reels', 'historias']);
/**
 * Una subvista de contenido dentro de Marketing: el calendario, Reels, Historias o YouTube.
 * @param {{ vista: 'calendario' | 'reels' | 'historias' | 'youtube' }} props
 */
export default function ContenidoPage({ vista }) {
  const { mes, nombreMes, historico } = useMes();
  const periodoIg = vista === 'historias' && historico ? HISTORICO : mes;
  const [tick, setTick] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [avisoPdf, setAvisoPdf] = useState('');
  const [eligiendo, setEligiendo] = useState(false);
  const [elegidos, setElegidos] = useState([]);
  const ig = useResource(
    () => (NECESITA_IG.has(vista) ? getInstagramPropio(periodoIg) : Promise.resolve(null)),
    [periodoIg, vista, tick],
  );
  const yt = useResource(
    () => (NECESITA_YT.has(vista) ? getYouTubePropio(mes) : Promise.resolve(null)),
    [mes, vista, tick],
  );

  // Los meses que tienen algo publicado, para elegir cuáles entran al PDF.
  const mesesPdf = useResource(
    () => (PDF.has(vista) ? getMesesContenido() : Promise.resolve(null)),
    [vista, tick],
  );
  const disponibles = (vista === 'reels' ? mesesPdf.data?.reels : mesesPdf.data?.historias) ?? [];
  // Todos marcados por defecto, y de nuevo al cambiar de vista o al traer meses nuevos.
  useEffect(() => { setElegidos(disponibles); }, [disponibles.join(',')]);

  const traerAhora = async () => {
    setSincronizando(true);
    try {
      await (vista === 'youtube' ? sincronizarYouTube() : sincronizarInstagram());
      setTick((n) => n + 1);
    } finally {
      setSincronizando(false);
    }
  };

  // Los meses elegidos en un PDF: las piezas como se publicaron, con sus números debajo.
  const bajarPdf = async () => {
    setBajando(true);
    setAvisoPdf('');
    try {
      await bajarContenidoPdf(elegidos, vista);
      setEligiendo(false);
    } catch (e) {
      setAvisoPdf(e?.message || 'No se pudo armar el PDF.');
    } finally {
      setBajando(false);
    }
  };

  const meta = VISTAS[vista] ?? VISTAS.reels;
  const hayPdf = PDF.has(vista);
  const todos = Boolean(disponibles.length) && elegidos.length === disponibles.length;
  const estado = (vista === 'youtube' ? yt.data?.estado : ig.data?.estado) ?? {};
  const error = ig.error || yt.error;
  const cargando = (NECESITA_IG.has(vista) && ig.loading && !ig.data)
    || (NECESITA_YT.has(vista) && yt.loading && !yt.data);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  return (
    <div className="page">
      <PageHeader
        title={meta.titulo}
        actions={
          <>
            <SourceTag sourceId={meta.fuente} updatedAt={estado.ultimaAt} />
            {hayPdf && (
              <button className={`btn${eligiendo ? ' primary' : ''}`} disabled={!disponibles.length}
                onClick={() => setEligiendo((v) => !v)}
                title={disponibles.length ? 'Elegir los meses del PDF' : 'No hay nada publicado todavía'}>
                Descargar PDF
              </button>
            )}
            <button className="btn" onClick={traerAhora} disabled={sincronizando}>
              <span className={`recargar-icono${sincronizando ? ' girando' : ''}`}>⟳</span>
              {sincronizando ? ' Trayendo…' : ' Traer ahora'}
            </button>
          </>
        }
      />

      {hayPdf && eligiendo && (
        <div className="pdf-meses">
          <div className="pdf-meses-lista">
            {disponibles.map((m) => (
              <label key={m} className={`pdf-mes${elegidos.includes(m) ? ' on' : ''}`}>
                <input type="checkbox" checked={elegidos.includes(m)}
                  onChange={() => setElegidos((xs) => (xs.includes(m)
                    ? xs.filter((x) => x !== m)
                    : disponibles.filter((x) => x === m || xs.includes(x))))} />
                {nombreMesDesdeId(m)}
              </label>
            ))}
          </div>
          <div className="pdf-meses-pie">
            <button className="btn ghost" onClick={() => setElegidos(todos ? [] : disponibles)}>
              {todos ? 'Ninguno' : 'Todos'}
            </button>
            <button className="btn primary" onClick={bajarPdf} disabled={bajando || !elegidos.length}>
              {bajando ? 'Armando…' : `Descargar ${elegidos.length} ${elegidos.length === 1 ? 'mes' : 'meses'}`}
            </button>
          </div>
        </div>
      )}

      {avisoPdf && <p className="aud-aviso">{avisoPdf}</p>}

      {cargando ? (
        <SkeletonBlock height={360} />
      ) : vista === 'calendario' ? (
        <CalendarioContenido mes={mes} nombreMes={nombreMes} instagram={ig.data} youtube={yt.data} />
      ) : vista === 'reels' ? (
        <Reels items={ig.data?.reels ?? []} />
      ) : vista === 'historias' ? (
        <Secuencias items={ig.data?.secuencias ?? []} />
      ) : (
        <VideosYouTube yt={yt.data} cargando={yt.loading && !yt.data} />
      )}
    </div>
  );
}
