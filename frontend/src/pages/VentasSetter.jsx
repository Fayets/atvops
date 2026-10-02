import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CalendarioReportes from '../components/ventas/CalendarioReportes.jsx';
import MetricasSetting from '../components/setting/MetricasSetting.jsx';
import NotasSetting from '../components/setting/Notas.jsx';
import Sets from '../components/setting/Sets.jsx';
import { ErrorState } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import {
  actualizarPitch, borrarPitch, crearPitch, getPitches, getSesionesNotas,
} from '../data/api.js';
import { useResource } from '../lib/hooks.js';
import { mesActualId } from '../lib/mes.js';
import { useMes } from '../lib/MesContext.jsx';
import { iso } from '../lib/setting.js';

const VISTAS = [
  { value: 'sets', label: 'Sets' },
  { value: 'metricas', label: 'Métricas' },
  { value: 'notas', label: 'Notes' },
  { value: 'reporte', label: 'Reporte diario' },
];

/**
 * La vista del setter: Sets, Métricas y Notes (el sistema de pitches) más el
 * calendario para cargar el reporte del día.
 *
 * Los pitches se cargan una vez acá y las pestañas los comparten. Cambiar un dato es
 * optimista: la fila cambia al toque y si el servidor dice que no, vuelve.
 */
export default function VentasSetter() {
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

  // El mes de arriba manda también acá. Cada pestaña arrancaba en "hoy" por su cuenta,
  // así que elegir septiembre un 1° de octubre dejaba la pantalla entera en cero mirando
  // la semana del 28 de septiembre al 4 de octubre, sin que nada lo dijera.
  //
  // En el mes corriente se abre en la semana —es el día a día del setter— y en cualquier
  // otro, en el mes entero, que es lo único que se puede mirar de un mes ya cerrado.
  const esMesCorriente = mes === mesActualId();
  const ancla = esMesCorriente ? hoy : `${mes}-01`;

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  return (
    <div className="page setter-page">
      <PageHeader
        title="Mi setting"
        actions={<Tabs value={vista} onChange={setVista} options={VISTAS} />}
      />

      {vista === 'sets' && (
        <Sets pitches={pitches} hoy={hoy} ancla={ancla} modoInicial={esMesCorriente ? 'semana' : 'mes'}
          cargando={cargando} tick={tick}
          onCambiar={cambiar} onCrear={crear} onBorrar={borrar} />
      )}
      {vista === 'metricas' && (
        <MetricasSetting pitches={pitches} sesiones={sesiones.data?.sesiones?.length ?? 0}
          hoy={hoy} ancla={ancla} tick={tick} onRecargar={recargar} />
      )}
      {vista === 'notas' && (
        <NotasSetting sesiones={sesiones.data?.sesiones ?? []} motor={sesiones.data?.motor} pitches={pitches}
          hoy={hoy} cargando={sesiones.loading} onRecargar={recargar} />
      )}
      {vista === 'reporte' && <CalendarioReportes rol="setter" mes={mes} />}
    </div>
  );
}
