import { useMemo, useState } from 'react';
import HomeVentas from '../components/ventas/HomeVentas.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { getCajaUno, getVentasDirector } from '../data/api.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';

const dos = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

/** Desde y hasta (inclusivo) de cada período. El mes y el año siguen al mes elegido arriba. */
function rangoDe(periodo, mes, rango) {
  const hoy = new Date();
  if (periodo === 'hoy') return { desde: iso(hoy), hasta: iso(hoy) };
  if (periodo === 'semana') {
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    return { desde: iso(lunes), hasta: iso(domingo) };
  }
  const [y, m] = mes.split('-').map(Number);
  if (periodo === 'anio') return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
  const delMes = { desde: `${y}-${dos(m)}-01`, hasta: iso(new Date(y, m, 0)) };
  if (periodo === 'rango') {
    return rango.desde && rango.hasta && rango.desde <= rango.hasta ? rango : delMes;
  }
  return delMes;
}

/**
 * Home del Director de Ventas: Caja 1, las métricas generales y lo que trajo cada closer,
 * para el período, el programa y el closer que se elijan arriba.
 */
export default function HomeVentasPage() {
  const { mes } = useMes();
  const [periodo, setPeriodo] = useState('mes');
  const [rango, setRango] = useState({ desde: '', hasta: '' });
  const [programa, setPrograma] = useState('');
  const [closer, setCloser] = useState('');

  const { desde, hasta } = useMemo(() => rangoDe(periodo, mes, rango), [periodo, mes, rango]);
  const { data, loading, error } = useResource(
    () => getVentasDirector({ desde, hasta, programa, closer }), [desde, hasta, programa, closer]);
  // Caja 1 va aparte: si el esquema de clientes no responde, el resto del home igual se ve.
  const caja = useResource(() => getCajaUno(mes, { desde, hasta }), [desde, hasta]);

  if (error && !data) {
    return <div className="page"><ErrorState error={error} /></div>;
  }

  return (
    <div className="page home-ventas-page">
      {!data ? (
        <>
          <SkeletonBlock height={100} />
          <SkeletonBlock height={220} />
          <SkeletonBlock height={220} />
        </>
      ) : (
        <HomeVentas
          data={data}
          cargando={loading || caja.loading}
          caja={caja.data}
          cajaError={caja.error}
          filtros={{ periodo, rango, programa, closer, desde, hasta }}
          onPeriodo={setPeriodo}
          onRango={setRango}
          onPrograma={setPrograma}
          onCloser={setCloser}
        />
      )}
    </div>
  );
}
