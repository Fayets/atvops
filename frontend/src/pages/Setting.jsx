import EmbudoSetting from '../components/ventas/EmbudoSetting.jsx';
import SemanasSetting from '../components/ventas/SemanasSetting.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import SourceTag from '../components/ui/SourceTag.jsx';
import { getEmbudoSetting } from '../data/api.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';
import { leerDecretoGuardado } from '../lib/metasMes.js';

/**
 * Setting visto desde operaciones: el embudo y nada más.
 *
 * Cuatro etapas, qué convierte cada paso y cuánto tarda el equipo en responder. El reporte
 * diario, el calendario de cargas y el detalle de cada llamada son el trabajo del setter y
 * viven en su vista: acá solo entra lo que sirve para ver si el mes cierra.
 */
export default function Setting() {
  const { mes, nombreMes } = useMes();
  const embudo = useResource(() => getEmbudoSetting(mes), [mes]);

  if (embudo.error) return <div className="page"><ErrorState error={embudo.error} /></div>;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Ventas"
        title={`Setting · ${nombreMes}`}
        desc="De cuántos chats entran a cuántas llamadas se presentan."
        actions={<SourceTag sourceId="ventas_ops" updatedAt={embudo.data?.generadoAt} />}
      />
      {embudo.loading && !embudo.data ? (
        <SkeletonBlock height={320} />
      ) : (
        <>
          <EmbudoSetting embudo={embudo.data} decreto={leerDecretoGuardado(mes) ?? {}} />
          <SemanasSetting semanas={embudo.data?.semanas ?? []} />
        </>
      )}
    </div>
  );
}
