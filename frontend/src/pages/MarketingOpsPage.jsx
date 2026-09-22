import MarketingOps from '../components/marketing/MarketingOps.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import {
  getConversaciones, getInstagramPropio, getMarketing, getMetasMes, getVentasReal, getYouTubePropio,
} from '../data/api.js';
import { chatsDelMes } from '../lib/chats.js';
import { useMes } from '../lib/MesContext.jsx';
import PanelMarketing from '../components/marketing/PanelMarketing.jsx';
import { useResource } from '../lib/hooks.js';

/**
 * Marketing para operaciones: adónde termina el mes y qué habría que mover.
 *
 * El detalle de cada pieza —qué reel, qué historia, qué miniatura— es el trabajo de Emi y
 * está en las subvistas. Acá va lo que sirve para decidir.
 */
export default function MarketingOpsPage() {
  const { mes } = useMes();
  const metas = useResource(() => getMetasMes(mes), [mes]);
  const ventas = useResource(() => getVentasReal(mes), [mes]);
  const ig = useResource(() => getInstagramPropio(mes), [mes]);
  const yt = useResource(() => getYouTubePropio(mes), [mes]);
  const chats = useResource(() => getConversaciones(mes), [mes]);
  // Las conversaciones del bot: la misma cuenta que ve marketing en su home.
  const mkt = useResource(() => getMarketing(mes), [mes]);

  if (metas.error) return <div className="page"><ErrorState error={metas.error} /></div>;

  const cargando = (metas.loading && !metas.data) || (ventas.loading && !ventas.data);

  // Un solo lugar decide de dónde salen los chats del mes. El KPI de arriba y la
  // proyección de abajo son la misma métrica: si cada uno la resuelve por su cuenta,
  // terminan mostrando 106 y 0 en la misma pantalla.
  const chatsMes = chatsDelMes(chats.data);

  return (
    <div className="page">
      {mkt.data && <PanelMarketing data={mkt.data} chats={chatsMes} />}

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
          chats={chatsMes}
        />
      )}
    </div>
  );
}
