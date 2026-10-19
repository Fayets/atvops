import HomeMarketing from '../components/marketing/HomeMarketing.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import { getConversaciones, getInstagramPropio, getMetasMes } from '../data/api.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';

/**
 * El home del director de marketing.
 *
 * Ve cómo viene el mes en su área: cuántas conversaciones abrió el contenido, de qué
 * formato salieron y qué piezas trajeron más. El cuadro de mando de operaciones, con
 * cobranza y fulfillment, no le sirve para decidir qué publicar.
 */
export default function HomeMarketingPage() {
  const { mes, nombreMes } = useMes();
  const metas = useResource(() => getMetasMes(mes), [mes]);
  // El contenido sale de la base propia, no del CRM de marketing.
  const ig = useResource(() => getInstagramPropio(mes), [mes]);
  const chats = useResource(() => getConversaciones(mes), [mes]);

  if (chats.error && !chats.data) return <div className="page"><ErrorState error={chats.error} /></div>;

  const cargando = (chats.loading && !chats.data) || (metas.loading && !metas.data);

  return (
    <div className="page">
      {cargando ? (
        <>
          <SkeletonKpis n={4} />
          <SkeletonBlock height={220} />
          <SkeletonBlock height={280} />
        </>
      ) : (
        <HomeMarketing
          decreto={metas.data?.decreto ?? {}}
          contexto={metas.data?.contexto ?? {}}
          conversaciones={chats.data}
          instagram={ig.data}
          nombreMes={nombreMes}
        />
      )}
    </div>
  );
}
