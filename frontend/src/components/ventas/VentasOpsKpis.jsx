import KpiCard from '../ui/KpiCard.jsx';
import Card from '../ui/Card.jsx';

/**
 * Bloque 3: salud de rates del funnel.
 * @param {{ kpis: object[], alertaKpis: string | null }} props
 */
export default function VentasOpsKpis({ kpis, alertaKpis }) {
  return (
    <div className="ventas-ops-kpis-wrap">
      <div className="kpi-grid ventas-ops-kpis">
        {kpis.map((m) => (
          <KpiCard key={m.id} metric={m} />
        ))}
      </div>
      {alertaKpis ? (
        <Card className="ventas-ops-alerta">
          <p className="ventas-ops-alerta-texto">{alertaKpis}</p>
        </Card>
      ) : null}
    </div>
  );
}
