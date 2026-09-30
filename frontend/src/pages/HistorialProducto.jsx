import { useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { getReportesProducto } from '../data/api.js';
import { useResource } from '../lib/hooks.js';
import { useMes } from '../lib/MesContext.jsx';

/**
 * Todos los reportes de producto, uno por mes.
 *
 * Es la contratapa del reporte: de un vistazo, cuánto cash trajo cada mes, cuántos
 * upsells y recompras hubo y cuánta gente se fue. Tocar una fila lleva a ese reporte,
 * que es cambiar el mes del sistema.
 */

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const usd = (n) => `US$ ${Math.round(n || 0).toLocaleString('es-AR')}`;

function etiqueta(periodo) {
  const [y, m] = (periodo || '').split('-');
  return MESES[Number(m) - 1] ? `${MESES[Number(m) - 1]} ${y}` : periodo;
}

function cuando(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function HistorialProducto() {
  const navegar = useNavigate();
  const { setMes } = useMes();
  const { data, error, loading } = useResource(() => getReportesProducto({ refrescar: true }), []);

  if (loading && !data) return <div className="page"><SkeletonBlock /></div>;
  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const reportes = data?.reportes ?? [];

  function abrir(periodo) {
    setMes(periodo);
    navegar('/reporte-producto');
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Dirección · Reporte de producto"
        title="Historial"
        desc="Todos los reportes armados, uno por mes. Tocá uno para abrirlo."
      />

      {reportes.length ? (
        <Card flush>
          <div className="tabla-scroll">
            <table className="hp-tabla">
              <thead><tr>
                <th>Mes</th><th>Estado</th><th className="num">Cobrado</th>
                <th className="num">Upsells</th><th className="num">Recompras</th>
                <th className="num">Vencidos</th><th className="num">Se fueron</th>
                <th>Lo armó</th><th>Última edición</th>
              </tr></thead>
              <tbody>
                {reportes.map((r) => (
                  <tr key={r.periodo} onClick={() => abrir(r.periodo)} className="hp-fila">
                    <td className="hp-mes">{etiqueta(r.periodo)}</td>
                    <td>
                      <Pill tone={r.estado === 'cerrado' ? 'ok' : 'warn'}>
                        {r.estado === 'cerrado' ? 'Cerrado' : 'Borrador'}
                      </Pill>
                    </td>
                    <td className="num hp-cc">{r.cobradoUsd ? usd(r.cobradoUsd) : <span className="dim">—</span>}</td>
                    <td className="num">{r.upsells ?? 0}</td>
                    <td className="num">{r.recompras ?? 0}</td>
                    <td className="num">{r.vencidos ?? 0}</td>
                    <td className="num">{r.seVan
                      ? <b style={{ color: 'var(--alert)' }}>{r.seVan}</b>
                      : <span className="dim">—</span>}</td>
                    <td className="dim">{r.creadoPor || '—'}</td>
                    <td className="dim">{cuando(r.actualizadoAt || r.creadoAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card title="Todavía no hay ningún reporte">
          <p className="dim" style={{ margin: 0 }}>
            El primero se arma desde <strong>Reporte de producto</strong>: elegís el mes en la barra
            de arriba, traés los clientes y el reporte queda guardado acá.
          </p>
        </Card>
      )}
    </div>
  );
}
