import { Link } from 'react-router-dom';
import MarketingOps from '../components/marketing/MarketingOps.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import SourceTag from '../components/ui/SourceTag.jsx';
import {
  getConversaciones, getInstagramPropio, getMarketing, getMetasMes, getVentasReal, getYouTubePropio,
} from '../data/api.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';

/**
 * Marketing para operaciones: adónde termina el mes y qué habría que mover.
 *
 * El detalle de cada pieza —qué reel, qué historia, qué miniatura— es el trabajo de Emi y
 * está en las subvistas. Acá va lo que sirve para decidir.
 */
export default function MarketingOpsPage() {
  const { mes, nombreMes } = useMes();
  const metas = useResource(() => getMetasMes(mes), [mes]);
  const ventas = useResource(() => getVentasReal(mes), [mes]);
  const ig = useResource(() => getInstagramPropio(mes), [mes]);
  const yt = useResource(() => getYouTubePropio(mes), [mes]);
  const chats = useResource(() => getConversaciones(mes), [mes]);
  // Las conversaciones del bot: la misma cuenta que ve marketing en su home.
  const mkt = useResource(() => getMarketing(mes), [mes]);

  if (metas.error) return <div className="page"><ErrorState error={metas.error} /></div>;

  const cargando = (metas.loading && !metas.data) || (ventas.loading && !ventas.data);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Marketing · operaciones"
        title={`${nombreMes} · adónde termina`}
        desc="Cómo viene el mes y qué haría falta para llegar. El detalle del contenido lo lleva marketing."
        actions={
          <>
            <SourceTag sourceId="ventas_ops" updatedAt={ventas.data?.generadoAt} />
            <Link className="btn" to="/marketing/calendario">Ver el contenido →</Link>
          </>
        }
      />

      {cargando ? (
        <>
          <SkeletonKpis n={4} />
          <SkeletonBlock height={240} />
          <SkeletonBlock height={200} />
        </>
      ) : (
        <MarketingOps
          decreto={metas.data?.decreto ?? {}}
          real={metas.data?.real ?? {}}
          contexto={metas.data?.contexto ?? {}}
          origenes={ventas.data?.porOrigen ?? []}
          piezas={{
            reels: (ig.data?.reels ?? []).length,
            secuencias: (ig.data?.secuencias ?? []).length,
            videos: (yt.data?.videos ?? []).length,
          }}
          conversacionesPropias={chats.data}
          conversacionesCrm={mkt.data?.conversaciones?.total ?? 0}
        />
      )}
    </div>
  );
}
