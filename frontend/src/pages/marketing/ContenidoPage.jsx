import { useState } from 'react';
import CalendarioContenido from '../../components/marketing/CalendarioContenido.jsx';
import Reels from '../../components/marketing/Reels.jsx';
import Secuencias from '../../components/marketing/Secuencias.jsx';
import VideosYouTube from '../../components/marketing/VideosYouTube.jsx';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import { getInstagramPropio, getMarketing, sincronizarInstagram } from '../../data/api.js';
import { useMes } from '../../lib/MesContext.jsx';
import { useResource } from '../../lib/hooks.js';

const VISTAS = {
  calendario: {
    titulo: 'Calendario',
    desc: 'El mes entero de un vistazo: una miniatura por pieza publicada.',
  },
  reels: {
    titulo: 'Reels',
    desc: 'Lo que se publicó este mes, con lo que midió Instagram.',
  },
  historias: {
    titulo: 'Historias',
    desc: 'Cada secuencia, pieza por pieza. Instagram las borra a las 24 horas: acá quedan.',
  },
  youtube: {
    titulo: 'YouTube',
    desc: 'Los videos del mes, con vistas, CTR y los chats que abrieron.',
  },
};

/** El calendario y YouTube salen del CRM; los reels lo usan para saber qué palabra tienen. */
const NECESITA_CRM = new Set(['calendario', 'reels', 'youtube']);

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
  const ig = useResource(() => getInstagramPropio(mes), [mes, tick]);
  const mkt = useResource(
    () => (NECESITA_CRM.has(vista) ? getMarketing(mes) : Promise.resolve(null)),
    [mes, vista],
  );

  const traerAhora = async () => {
    setSincronizando(true);
    try {
      await sincronizarInstagram();
      setTick((n) => n + 1);
    } finally {
      setSincronizando(false);
    }
  };

  const meta = VISTAS[vista] ?? VISTAS.reels;
  const estado = ig.data?.estado ?? {};
  const cargando = (ig.loading && !ig.data) || (mkt.loading && NECESITA_CRM.has(vista) && !mkt.data);

  if (ig.error) return <div className="page"><ErrorState error={ig.error} /></div>;

  return (
    <div className="page">
      <PageHeader
        eyebrow={`Marketing · ${nombreMes}`}
        title={meta.titulo}
        desc={meta.desc}
        actions={
          <>
            <SourceTag sourceId={vista === 'youtube' ? 'mkt_crm' : 'instagram_ops'} updatedAt={estado.ultimaAt} />
            {vista !== 'youtube' && (
              <button className="btn" onClick={traerAhora} disabled={sincronizando}>
                <span className={`recargar-icono${sincronizando ? ' girando' : ''}`}>⟳</span>
                {sincronizando ? ' Trayendo…' : ' Traer ahora'}
              </button>
            )}
          </>
        }
      />

      {cargando ? (
        <SkeletonBlock height={360} />
      ) : vista === 'calendario' ? (
        <CalendarioContenido
          mes={mes}
          nombreMes={nombreMes}
          instagram={ig.data}
          youtube={mkt.data?.contenido?.youtube}
        />
      ) : vista === 'reels' ? (
        <Reels items={conNegocio(ig.data?.reels ?? [], mkt.data?.contenido?.publicaciones)} />
      ) : vista === 'historias' ? (
        <Secuencias items={ig.data?.secuencias ?? []} />
      ) : (
        <VideosYouTube yt={mkt.data?.contenido?.youtube} cargando={mkt.loading} />
      )}
    </div>
  );
}
