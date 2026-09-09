import { useCallback, useEffect, useState } from 'react';
import SetterVista from '../components/ventas/SetterVista.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import { completarReporteSetter, getSetterDashboard } from '../data/api.js';

/** Vista personal del Setter: progreso diario, mes y reporte. */
export default function VentasSetter() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getSetterDashboard();
      setData(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onCompletarReporte = async () => {
    const next = await completarReporteSetter();
    setData(next);
  };

  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} />
      </div>
    );
  }

  return (
    <div className="page setter-page">
      {loading || !data ? (
        <>
          <SkeletonKpis n={3} />
          <SkeletonKpis n={4} />
          <SkeletonBlock height={220} />
        </>
      ) : (
        <SetterVista data={data} onCompletarReporte={onCompletarReporte} />
      )}
    </div>
  );
}
