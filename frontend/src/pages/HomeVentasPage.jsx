import HomeVentas from '../components/ventas/HomeVentas.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { getVentasDirectorHome } from '../data/api.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';

/**
 * Home del Director de Ventas.
 * Cash collected + métricas por segmento (general real; calificadas/descalificadas pendientes).
 */
export default function HomeVentasPage() {
  const { mes } = useMes();
  const { data, loading, error } = useResource(() => getVentasDirectorHome(mes), [mes]);

  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} />
      </div>
    );
  }

  return (
    <div className="page home-ventas-page">
      {loading || !data ? (
        <>
          <SkeletonBlock height={100} />
          <SkeletonBlock height={220} />
          <SkeletonBlock height={220} />
        </>
      ) : (
        <HomeVentas data={data} />
      )}
    </div>
  );
}
