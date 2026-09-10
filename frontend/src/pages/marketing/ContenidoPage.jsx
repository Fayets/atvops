import { useState } from 'react';
import CalendarioContenido from '../../components/marketing/CalendarioContenido.jsx';
import Reels from '../../components/marketing/Reels.jsx';
import Secuencias from '../../components/marketing/Secuencias.jsx';
import VideosYouTube from '../../components/marketing/VideosYouTube.jsx';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import {
  getInstagramPropio, getMarketing, getYouTubePropio,
  sincronizarInstagram, sincronizarYouTube,
} from '../../data/api.js';
import { useMes } from '../../lib/MesContext.jsx';
import { useResource } from '../../lib/hooks.js';

const VISTAS = {
  calendario: {
    titulo: 'Calendario',
    desc: 'El mes entero de un vistazo: una miniatura por pieza publicada.',
    fuente: 'instagram_ops',
  },
  reels: {
    titulo: 'Reels',
    desc: 'Lo que se publicó este mes, con lo que midió Instagram.',
    fuente: 'instagram_ops',
  },
  historias: {
    titulo: 'Historias',
    desc: 'Cada secuencia, pieza por pieza. Instagram las borra a las 24 horas: acá quedan.',
    fuente: 'instagram_ops',
  },
  youtube: {
    titulo: 'YouTube',
    desc: 'Los videos del canal, con vistas, likes y comentarios.',
    fuente: 'youtube_ops',
  },
};

/** Instagram hace falta en todas menos YouTube; el canal, en YouTube y en el calendario. */
const NECESITA_IG = new Set(['calendario', 'reels', 'historias']);
const NECESITA_YT = new Set(['calendario', 'youtube']);
/** Los reels le piden al CRM solo la palabra clave y las conversaciones que abrió cada uno. */
const NECESITA_CRM = new Set(['reels']);

/** Le pega a cada reel la palabra clave y las conversaciones que abrió, atando por enlace. */
function conNegocio(reels, publicaciones) {
  if (!publicaciones?.length) return reels;
  const porUrl = new Map(publicaciones.filter((p) => p.url).map((p) => [p.url, p]));
  return reels.map((r) => {
    const p = r.url ? porUrl.get(r.url) : null;
    return p ? { ...r, keyword: p.keyword, conversaciones: p.conversaciones ?? 0 } : r;
  });
}

/**
 * Una subvista de contenido dentro de Marketing: el calendario, Reels, Historias o YouTube.
 * @param {{ vista: 'calendario' | 'reels' | 'historias' | 'youtube' }} props
 */
export default function ContenidoPage({ vista }) {
  const { mes, nombreMes } = useMes();
  const [tick, setTick] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const ig = useResource(
    () => (NECESITA_IG.has(vista) ? getInstagramPropio(mes) : Promise.resolve(null)),
    [mes, vista, tick],
  );
  const yt = useResource(
    () => (NECESITA_YT.has(vista) ? getYouTubePropio(mes) : Promise.resolve(null)),
    [mes, vista, tick],
  );
  const mkt = useResource(
    () => (NECESITA_CRM.has(vista) ? getMarketing(mes) : Promise.resolve(null)),
    [mes, vista],
  );

  const traerAhora = async () => {
    setSincronizando(true);
    try {
      await (vista === 'youtube' ? sincronizarYouTube() : sincronizarInstagram());
      setTick((n) => n + 1);
    } finally {
      setSincronizando(false);
    }
  };

  const meta = VISTAS[vista] ?? VISTAS.reels;
  const estado = (vista === 'youtube' ? yt.data?.estado : ig.data?.estado) ?? {};
  const error = ig.error || yt.error;
  const cargando = (NECESITA_IG.has(vista) && ig.loading && !ig.data)
    || (NECESITA_YT.has(vista) && yt.loading && !yt.data);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  return (
    <div className="page">
      <PageHeader
        eyebrow={`Marketing · ${nombreMes}`}
        title={meta.titulo}
        desc={meta.desc}
        actions={
          <>
            <SourceTag sourceId={meta.fuente} updatedAt={estado.ultimaAt} />
            <button className="btn" onClick={traerAhora} disabled={sincronizando}>
              <span className={`recargar-icono${sincronizando ? ' girando' : ''}`}>⟳</span>
              {sincronizando ? ' Trayendo…' : ' Traer ahora'}
            </button>
          </>
        }
      />

      {cargando ? (
        <SkeletonBlock height={360} />
      ) : vista === 'calendario' ? (
        <CalendarioContenido mes={mes} nombreMes={nombreMes} instagram={ig.data} youtube={yt.data} />
      ) : vista === 'reels' ? (
        <Reels items={conNegocio(ig.data?.reels ?? [], mkt.data?.contenido?.publicaciones)} />
      ) : vista === 'historias' ? (
        <Secuencias items={ig.data?.secuencias ?? []} />
      ) : (
        <VideosYouTube yt={yt.data} cargando={yt.loading && !yt.data} />
      )}
    </div>
  );
}
