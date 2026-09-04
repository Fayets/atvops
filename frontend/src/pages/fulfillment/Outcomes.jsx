import { Link } from 'react-router-dom';
import Bars from '../../components/charts/Bars.jsx';
import Card from '../../components/ui/Card.jsx';
import Icon from '../../components/ui/Icon.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../../components/ui/Loading.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Pill from '../../components/ui/Pill.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import { getFulfillment } from '../../data/api.js';
import { formatMes, formatValue } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';

const TIER = { starter: 'Starter', growth: 'Growth', scale: 'Scale' };

export default function Outcomes() {
  const { data, loading, error } = useResource(getFulfillment);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const conFactura = data
    ? data.activos.filter((c) => c.outcome.revenueInicialUsd > 0)
    : [];
  const porMultiplo = [...conFactura].sort(
    (a, b) =>
      b.outcome.revenueActualUsd / (b.outcome.revenueInicialUsd || 1) -
      a.outcome.revenueActualUsd / (a.outcome.revenueInicialUsd || 1),
  );
  const subieronTier = data ? data.activos.filter((c) => c.tier !== c.expansion.tierInicial) : [];
  const tieneNrr = Boolean(data?.nrr?.length);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fulfillment · pilares 5 y 6"
        title="Outcomes y expansión"
        desc="Facturación, audiencia y upsells no viven en Discord: salen de payments / CRM. Mientras tanto, acá solo quedan candidatos detectados en el canal (hoy ninguno) y los KPIs en cero."
        actions={<SourceTag sourceId="manual" />}
      />

      {loading || !data ? (
        <>
          <SkeletonKpis n={4} />
          <SkeletonBlock height={320} />
        </>
      ) : (
        <>
          <div className="kpi-grid">
            {[...data.kpis.outcomes, ...data.kpis.expansion].map((m) => (
              <KpiCard key={m.id} metric={m} />
            ))}
          </div>

          {conFactura.length > 0 || tieneNrr ? (
            <div className="split">
              {conFactura.length > 0 && (
                <Card
                  title="Cuánto creció cada cliente"
                  sub="Facturación de hoy dividida por la de su entrada"
                  foot="El múltiplo es lo que el cliente cuenta cuando lo llama un conocido."
                >
                  <Bars
                    data={porMultiplo}
                    x={(c) => c.nombre.split(' ')[0]}
                    y={(c) => c.outcome.revenueActualUsd / (c.outcome.revenueInicialUsd || 1)}
                    format="ratio"
                    label="Múltiplo"
                    height={252}
                    color={(c) =>
                      c.outcome.revenueActualUsd / (c.outcome.revenueInicialUsd || 1) >= 1.5 ? 'var(--ok)' : 'var(--s4)'
                    }
                  />
                </Card>
              )}
              {tieneNrr && (
                <Card
                  title="Expansión mes a mes"
                  sub="MRR sumado sobre la base existente"
                  foot="Expansión vs churn desde payments."
                >
                  <Bars
                    data={data.nrr}
                    x={(n) => formatMes(n.mes).split(' ')[0]}
                    y={(n) => n.expansionUsd}
                    format="usd"
                    label="Expansión"
                    height={252}
                    linea={{ key: (n) => n.churnUsd, label: 'Churn', format: 'usd', escala: 'compartida' }}
                    color={() => 'var(--ok)'}
                  />
                </Card>
              )}
            </div>
          ) : (
            <Card
              title="Facturación y expansión"
              sub="Fuente: payments / CRM"
              foot="Cuando haya revenue real por cliente, acá van a aparecer múltiplos y el puente de expansión."
            >
              <div className="empty">
                Ningún cliente tiene facturación cargada todavía. Discord no alcanza para outcomes de plata.
              </div>
            </Card>
          )}

          <Card
            title="Candidatos a upsell"
            sub="Detectados por señales en el canal"
            flush
            foot="La señal típica es el techo de capacidad. Hasta que corra el clasificador, esta lista queda vacía."
          >
            {data.candidatos.length === 0 ? (
              <div className="empty">Sin candidatos esta semana.</div>
            ) : (
              data.candidatos.map((c) => (
                <Link key={c.id} to={`/fulfillment/clientes/${c.id}`} className="lista-item">
                  <span className="who">{c.nombre}</span>
                  <span className="q">
                    {TIER[c.tier] ?? c.tier} · #{c.canal}
                  </span>
                  <span className="right">
                    <Pill tone="ok">candidato</Pill>
                    <Icon name="arrow" size={13} />
                  </span>
                </Link>
              ))
            )}
          </Card>

          <Card
            title="Movimientos de tier"
            sub={`${subieronTier.length} clientes activos subieron de escalón`}
            flush
            foot={
              subieronTier.length
                ? `Suman ${formatValue(
                    data.activos.reduce((s, c) => s + c.expansion.revenueExpansionUsd, 0),
                    'usd',
                  )} de expansión acumulada.`
                : 'Sin CRM / payments: no hay cambios de tier registrados.'
            }
          >
            {subieronTier.length === 0 ? (
              <div className="empty">Sin movimientos de tier.</div>
            ) : (
              subieronTier.map((c) => (
                <div key={c.id} className="lista-item">
                  <span className="who">{c.nombre}</span>
                  <span className="q">
                    {TIER[c.expansion.tierInicial]} → {TIER[c.tier]} · {c.expansion.upsells}{' '}
                    {c.expansion.upsells === 1 ? 'upsell' : 'upsells'}
                  </span>
                  <span className="right">
                    <span className="num" style={{ color: 'var(--ok)' }}>
                      +{formatValue(c.expansion.revenueExpansionUsd, 'usd')}
                    </span>
                  </span>
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  );
}
