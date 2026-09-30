import { useEffect, useState } from 'react';
import { getReportesProducto } from '../../data/api.js';
import { useMes } from '../../lib/MesContext.jsx';

/**
 * Los reportes de producto ya armados, colgando del ítem del menú.
 *
 * Son botones y no links porque el período del reporte es el mes global —el mismo que
 * elige el selector del topbar— y no un pedazo de la URL. Tocar uno cambia el mes, que
 * es lo que hace que la pantalla cargue ese reporte.
 *
 * Se monta solo cuando el sidebar está mostrando esta sección, así que la lista se pide
 * al entrar al reporte y no en cada pantalla del sistema.
 */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function etiqueta(periodo) {
  const [y, m] = (periodo || '').split('-');
  const nombre = MESES[Number(m) - 1];
  if (!nombre) return periodo;
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${y}`;
}

export default function HistorialReportes() {
  const { mes, setMes } = useMes();
  const [reportes, setReportes] = useState(null);

  useEffect(() => {
    let vivo = true;
    getReportesProducto()
      .then((d) => vivo && setReportes(d?.reportes ?? []))
      .catch(() => vivo && setReportes([]));
    return () => { vivo = false; };
  }, []);

  if (!reportes?.length) return null;

  return (
    <div className="subnav">
      {reportes.slice(0, 12).map((r) => (
        <button
          key={r.periodo} type="button"
          className={`subnav-item${r.periodo === mes ? ' active' : ''}`}
          onClick={() => setMes(r.periodo)}
        >
          {etiqueta(r.periodo)}
          {r.estado === 'cerrado' ? null : <em className="subnav-borrador">borrador</em>}
        </button>
      ))}
    </div>
  );
}
