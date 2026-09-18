import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CalendarioReportes from '../components/ventas/CalendarioReportes.jsx';
import EmbudoSetting from '../components/ventas/EmbudoSetting.jsx';
import SemanasSetting from '../components/ventas/SemanasSetting.jsx';
import SetterVista from '../components/ventas/SetterVista.jsx';
import MetricasSetting from '../components/setting/MetricasSetting.jsx';
import NotasSetting from '../components/setting/Notas.jsx';
import Sets from '../components/setting/Sets.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import {
  actualizarPitch, borrarPitch, completarReporteSetter, crearPitch, getEmbudoSetting, getPitches,
  getSesionesNotas, getSetterDashboard, marcarPitch,
} from '../data/api.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';
import { leerDecretoGuardado } from '../lib/metasMes.js';
import { useRol } from '../lib/RolContext.jsx';
import { iso } from '../lib/setting.js';

const VISTAS = [
  { value: 'sets', label: 'Sets' },
  { value: 'metricas', label: 'Métricas' },
  { value: 'notas', label: 'Notes' },
  { value: 'reporte', label: 'Reporte diario' },
];

/**
 * La vista del setter: el sistema de SetSystem (Sets, Métricas, Notes) más lo que ya
 * tenía ATV Ops (embudo del mes, calendario de reportes y su día).
 *
 * Los pitches se cargan una vez acá y las pestañas los comparten. Cambiar un dato es
 * optimista: la fila cambia al toque y si el servidor dice que no, vuelve.
 */
export default function VentasSetter() {
  const { user } = useRol();
  const { mes } = useMes();
  const [params, setParams] = useSearchParams();
  const vista = VISTAS.some((v) => v.value === params.get('vista')) ? params.get('vista') : 'sets';
  const setVista = (v) => setParams((p) => { const n = new URLSearchParams(p); n.set('vista', v); return n; }, { replace: true });

  const [tick, setTick] = useState(0);
  const recargar = useCallback(() => setTick((t) => t + 1), []);
  const [pitches, setPitches] = useState([]);
  const [hoy, setHoy] = useState(iso(new Date()));
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const sesiones = useResource(() => getSesionesNotas(), [tick]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    getPitches()
      .then((d) => { if (!vivo) return; setPitches(d.pitches); setHoy(d.hoy); setError(null); })
      .catch((e) => vivo && setError(e))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [tick]);

  const cambiar = useCallback(async (id, patch) => {
    const antes = pitches;
    setPitches((lista) => lista.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      const nuevo = await actualizarPitch(id, patch);
      setPitches((lista) => lista.map((p) => (p.id === id ? nuevo : p)));
      recargar();
    } catch (e) {
      setPitches(antes);
      window.alert(e.message);
    }
  }, [pitches, recargar]);

  const crear = useCallback(async (datos) => {
    try {
      await crearPitch(datos);
      recargar();
    } catch (e) {
      window.alert(e.message);
      throw e;
    }
  }, [recargar]);

  const borrar = useCallback(async (id) => {
    try {
      await borrarPitch(id);
      setPitches((lista) => lista.filter((p) => p.id !== id));
      recargar();
    } catch (e) {
      window.alert(e.message);
    }
  }, [recargar]);

  // Lo que ya tenía la vista: el embudo del mes y el dashboard con el reporte diario.
  const embudo = useResource(() => getEmbudoSetting(mes), [mes, tick]);
  const [data, setData] = useState(null);
  const [cargandoDia, setCargandoDia] = useState(true);
  const refreshDia = useCallback(async () => {
    setCargandoDia(true);
    try {
      const next = await getSetterDashboard();
      if (user?.username || user?.nombre) {
        next.perfil = { ...next.perfil, id: user.username || next.perfil.id, nombre: user.nombre || next.perfil.nombre };
      }
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setCargandoDia(false);
    }
  }, [user]);
  useEffect(() => { if (vista === 'reporte') refreshDia(); }, [refreshDia, vista]);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  return (
    <div className="page setter-page">
      <PageHeader
        eyebrow="Ventas"
        title="Mi setting"
        desc="Cada link que mandás, lo que pasó después y las notas de cada llamada."
        actions={<Tabs value={vista} onChange={setVista} options={VISTAS} />}
      />

      {vista === 'sets' && (
        <Sets pitches={pitches} hoy={hoy} cargando={cargando} tick={tick}
          onCambiar={cambiar} onCrear={crear} onBorrar={borrar} />
      )}
      {vista === 'metricas' && (
        <MetricasSetting pitches={pitches} sesiones={sesiones.data?.sesiones?.length ?? 0} hoy={hoy} tick={tick} onRecargar={recargar} />
      )}
      {vista === 'notas' && (
        <NotasSetting sesiones={sesiones.data?.sesiones ?? []} motor={sesiones.data?.motor} pitches={pitches}
          hoy={hoy} cargando={sesiones.loading} onRecargar={recargar} />
      )}
      {vista === 'reporte' && (
        cargandoDia || !data ? (
          <><SkeletonKpis n={3} /><SkeletonKpis n={4} /><SkeletonBlock height={220} /></>
        ) : (
          <>
            <EmbudoSetting embudo={embudo.data} decreto={leerDecretoGuardado(mes) ?? {}}
              onPitch={async (datos) => { await marcarPitch(datos); recargar(); }} />
            <SemanasSetting semanas={embudo.data?.semanas ?? []} />
            <CalendarioReportes rol="setter" />
            <SetterVista data={data} onCompletarReporte={async (payload) => setData(await completarReporteSetter(payload))} />
          </>
        )
      )}
    </div>
  );
}
