import { useCallback, useEffect, useState } from 'react';
import CalendarioReportes from '../components/ventas/CalendarioReportes.jsx';
import EmbudoSetting from '../components/ventas/EmbudoSetting.jsx';
import SetterVista from '../components/ventas/SetterVista.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import { completarReporteSetter, getEmbudoSetting, getSetterDashboard, marcarPitch } from '../data/api.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';
import { leerDecretoGuardado } from '../lib/metasMes.js';
import { useRol } from '../lib/RolContext.jsx';

/** Vista personal del Setter: progreso diario, mes y reporte. */
export default function VentasSetter() {
  const { user } = useRol();
  const { mes } = useMes();
  const [tick, setTick] = useState(0);
  const embudo = useResource(() => getEmbudoSetting(mes), [mes, tick]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getSetterDashboard();
      // Preferir el usuario logueado como perfil del reporte.
      if (user?.username || user?.nombre) {
        next.perfil = {
          ...next.perfil,
          id: user.username || next.perfil.id,
          nombre: user.nombre || next.perfil.nombre,
        };
      }
      setData(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onCompletarReporte = async (payload) => {
    const next = await completarReporteSetter(payload);
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
        <>
          <EmbudoSetting
            embudo={embudo.data}
            decreto={leerDecretoGuardado(mes) ?? {}}
            onPitch={async (datos) => {
              await marcarPitch(datos);
              setTick((t) => t + 1);
            }}
          />
          <CalendarioReportes rol="setter" />
          <SetterVista data={data} onCompletarReporte={onCompletarReporte} />
        </>
      )}
    </div>
  );
}
