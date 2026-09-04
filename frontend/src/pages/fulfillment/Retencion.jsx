import { Link } from 'react-router-dom';
import LineArea from '../../components/charts/LineArea.jsx';
import Waterfall from '../../components/charts/Waterfall.jsx';
import Card from '../../components/ui/Card.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Icon from '../../components/ui/Icon.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../../components/ui/Loading.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Pill from '../../components/ui/Pill.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import { getFulfillment } from '../../data/api.js';
import { formatFecha, formatMes, formatValue, hace } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';
import { SEMAFORO } from '../../lib/scoring.js';

export default function Retencion() {
  const { data, loading, error } = useResource(getFulfillment);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const mes = data?.nrr?.length ? data.nrr[data.nrr.length - 1] : null;
  const churned = data ? data.clientes.filter((c) => c.estado === 'churned') : [];
  const enRiesgo = data ? data.activos.filter((c) => c.salud.semaforo !== 'verde') : [];
  const silenciosos = data
    ? data.activos
        .filter((c) => c.engagement.diasSinMensaje >= 7)
        .sort((a, b) => b.engagement.diasSinMensaje - a.engagement.diasSinMensaje)
    : [];

  /** @type {import('../../components/ui/DataTable.jsx').Columna[]} */
  const columnasChurn = [
    { key: 'nombre', label: 'Cliente', render: (c) => <span className="strong">{c.nombre}</span> },
    { key: 'churnAt', label: 'Baja', render: (c) => <span className="dim">{formatFecha(c.churnAt)}</span> },
    {
      key: 'activacion',
      label: 'Activación',
      value: (c) => c.activacion.diasHastaResultado ?? 999,
      render: (c) =>
        c.activacion.activado ? (
          <span className="num" style={{ color: (c.activacion.diasHastaResultado ?? 0) > 30 ? 'var(--warn)' : 'var(--text-2)' }}>
            día {c.activacion.diasHastaResultado}
          </span>
        ) : (
          <Pill tone="alert">nunca</Pill>
        ),
    },
    {
      key: 'motivoChurn',
      label: 'Qué pasó',
      sortable: false,
      render: (c) => (
        <span className="dim" style={{ whiteSpace: 'normal', display: 'block', maxWidth: 520, lineHeight: 1.5 }}>
          {c.motivoChurn}
        </span>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fulfillment · pilar 3"
        title="Retención y NRR"
        desc="El riesgo de churn se anticipa desde el canal (silencio y score). El NRR y el puente de MRR necesitan payments: todavía no están conectados."
        actions={<SourceTag sourceId="discord_transcripts" />}
      />

      {loading || !data ? (
        <>
          <SkeletonKpis n={3} />
          <SkeletonBlock height={320} />
        </>
      ) : (
        <>
          <div className="kpi-grid">
            {data.kpis.retencion.map((m) => (
              <KpiCard key={m.id} metric={m} />
            ))}
          </div>

          {mes ? (
            <div className="split">
              <Card
                title={`Puente de revenue · ${formatMes(mes.mes)}`}
                sub="De dónde sale el MRR del mes"
                foot="El NRR se mide sobre la base existente: los clientes nuevos quedan fuera del cálculo a propósito."
              >
                <Waterfall
                  height={270}
                  pasos={[
                    { label: 'MRR inicial', valor: mes.mrrInicialUsd, tipo: 'base' },
                    { label: 'Expansión', delta: mes.expansionUsd, tipo: 'delta' },
                    { label: 'Contracción', delta: -mes.contraccionUsd, tipo: 'delta' },
                    { label: 'Churn', delta: -mes.churnUsd, tipo: 'delta' },
                    { label: 'Base retenida', tipo: 'total' },
                    { label: 'Nuevos', delta: mes.nuevoUsd, tipo: 'delta' },
                    { label: 'MRR final', tipo: 'total' },
                  ]}
                />
              </Card>

              <Card
                title="NRR mes a mes"
                sub="La línea de 100% es el punto donde el negocio compone solo"
                foot={`Expansión del último mes: ${formatValue(mes.expansionUsd, 'usd')}.`}
              >
                <LineArea
                  data={data.nrr}
                  x={(n) => formatMes(n.mes)}
                  format="pct"
                  height={270}
                  series={[{ key: (n) => n.nrr, label: 'NRR', color: 'var(--s1)' }]}
                  referencia={{ valor: 100, label: '100% · el negocio compone solo' }}
                />
              </Card>
            </div>
          ) : (
            <Card
              title="NRR y puente de MRR"
              sub="Fuente: payments"
              foot="Cuando conectemos el procesador de pagos, acá va a aparecer el puente mes a mes."
            >
              <div className="empty">
                Sin datos de revenue todavía. Lo que sí tenemos del canal es quién está en silencio o fuera de verde.
              </div>
            </Card>
          )}

          <Card
            title="Silencio ≥ 7 días"
            sub={`${silenciosos.length} canales sin mensaje del cliente`}
            flush
            foot="Señal dura del score: siete días sin escribir pintan riesgo aunque el resto esté bien."
          >
            {silenciosos.length === 0 ? (
              <div className="empty">Ningún cliente con silencio largo.</div>
            ) : (
              silenciosos.map((c) => (
                <Link key={c.id} to={`/fulfillment/clientes/${c.id}`} className="lista-item">
                  <Pill tone="alert" dot>
                    {c.engagement.diasSinMensaje}d
                  </Pill>
                  <span className="who">{c.nombre}</span>
                  <span className="q">#{c.canal} · último mensaje {hace(c.ultimaActividadAt)}</span>
                  <span className="right">
                    <span className="dim">{c.categoria}</span>
                    <Icon name="arrow" size={13} />
                  </span>
                </Link>
              ))
            )}
          </Card>

          <Card
            title="Clientes fuera de verde"
            sub={`${enRiesgo.length} en la cola de trabajo del área`}
            flush
            foot="El score anticipa el churn con semanas de ventaja. Esta lista es la cola de trabajo del área."
          >
            {enRiesgo.length === 0 ? (
              <div className="empty">Toda la cartera en verde.</div>
            ) : (
              enRiesgo.map((c) => (
                <Link key={c.id} to={`/fulfillment/clientes/${c.id}`} className="lista-item">
                  <Pill tone={SEMAFORO[c.salud.semaforo].tone} dot>
                    {c.salud.score}
                  </Pill>
                  <span className="who">{c.nombre}</span>
                  <span className="q">{c.salud.alertas[0] ?? 'Score por debajo del corte'}</span>
                  <span className="right">
                    <span className="dim">{c.categoria}</span>
                    <Icon name="arrow" size={13} />
                  </span>
                </Link>
              ))
            )}
          </Card>

          <Card
            title="Churn del período"
            sub="Qué pasó en cada caso"
            flush
            foot="Sin CRM todavía no marcamos bajas desde el canal. Cuando haya churnAt, van a aparecer acá."
          >
            {churned.length === 0 ? (
              <div className="empty">Sin churns registrados (falta CRM / estado de cuenta).</div>
            ) : (
              <DataTable columns={columnasChurn} rows={churned} initialSort={{ key: 'churnAt', dir: 'desc' }} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
