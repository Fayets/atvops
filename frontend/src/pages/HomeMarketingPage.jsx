import HomeMarketing from '../components/marketing/HomeMarketing.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { getMarketing, getMetasMes } from '../data/api.js';
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
  const mkt = useResource(() => getMarketing(mes), [mes]);
  const metas = useResource(() => getMetasMes(mes), [mes]);

  if (mkt.error) return <div className="page"><ErrorState error={mkt.error} /></div>;

  const cargando = (mkt.loading && !mkt.data) || (metas.loading && !metas.data);

  return (
    <div className="page">
      <PageHeader eyebrow="Marketing" title={`${nombreMes} · cómo viene el mes`} />
      {cargando ? (
        <>
          <SkeletonKpis n={4} />
          <SkeletonBlock height={220} />
          <SkeletonBlock height={280} />
        </>
      ) : (
        <HomeMarketing
          marketing={mkt.data}
          decreto={metas.data?.decreto ?? {}}
          contexto={metas.data?.contexto ?? {}}
          nombreMes={nombreMes}
        />
      )}
    </div>
  );
}
