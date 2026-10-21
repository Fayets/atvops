import HomeVentas from '../components/ventas/HomeVentas.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { getCajaUno, getVentasDirectorHome } from '../data/api.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';

/**
 * Home del Director de Ventas.
 * Cash collected, las métricas generales del mes y Caja 1 con su desglose.
 */
export default function HomeVentasPage() {
  const { mes } = useMes();
  const { data, loading, error } = useResource(() => getVentasDirectorHome(mes), [mes]);
  // Caja 1 va aparte: si el esquema de clientes no responde, el resto del home igual se ve.
  const caja = useResource(() => getCajaUno(mes), [mes]);

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
        <HomeVentas data={data} caja={caja.data} cajaError={caja.error} />
      )}
    </div>
  );
}
