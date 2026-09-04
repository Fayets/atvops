import Card from '../components/ui/Card.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import KpiCard from '../components/ui/KpiCard.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import Pill from '../components/ui/Pill.jsx';
import SourceTag from '../components/ui/SourceTag.jsx';
import MetaRow from '../components/home/MetaRow.jsx';
import { getCobranza } from '../data/api.js';
import { formatFecha, formatValue, hace } from '../lib/format.js';
import { useResource } from '../lib/hooks.js';

const ESTADO = {
  pagada: { tone: 'ok', label: 'pagada' },
  pendiente: { tone: 'plain', label: 'pendiente' },
  vencida: { tone: 'alert', label: 'vencida' },
};

const PLAN_TONE = {
  Boost: 'alert',
  Advantage: 'warn',
  Mentoría: 'plain',
};

/** @type {import('../components/ui/DataTable.jsx').Columna[]} */
const COLUMNAS = [
  { key: 'cliente', label: 'Cliente', render: (c) => <span className="strong">{c.cliente}</span> },
  {
    key: 'plan',
    label: 'Plan',
    render: (c) => <Pill tone={PLAN_TONE[c.plan] ?? 'plain'}>{c.plan}</Pill>,
  },
  {
    key: 'montoUsd',
    label: 'Monto',
    align: 'right',
    render: (c) => <span className="num">{formatValue(c.montoUsd, 'usd')}</span>,
  },
  { key: 'venceAt', label: 'Vence', render: (c) => <span className="dim">{formatFecha(c.venceAt)}</span> },
  {
    key: 'estado',
    label: 'Estado',
    render: (c) => (
      <Pill tone={(ESTADO[c.estado] ?? ESTADO.pendiente).tone} dot>
        {(ESTADO[c.estado] ?? ESTADO.pendiente).label}
      </Pill>
    ),
  },
  {
    key: 'diasAtraso',
    label: 'Atraso',
    align: 'right',
    render: (c) =>
      c.diasAtraso ? (
        <span className="num" style={{ color: 'var(--brand-hi)' }}>{c.diasAtraso} d</span>
      ) : (
        <span className="dim">—</span>
      ),
  },
  {
    key: 'pagadaAt',
    label: 'Pagada el',
    render: (c) => <span className="dim">{c.pagadaAt ? formatFecha(c.pagadaAt) : '—'}</span>,
  },
];

export default function Cobranza() {
  const { data, loading, error } = useResource(getCobranza);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  return (
    <div className="page">
      {loading || !data ? (
        <>
          <SkeletonKpis />
          <SkeletonBlock height={380} />
        </>
      ) : (
        <>
          <div className="filtros" style={{ alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              Cuotas {data.mes ?? ''} · ATV Clients
              {data.syncAt ? ` · sync ${hace(data.syncAt)}` : ''}
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <SourceTag sourceId="atv_clients" updatedAt={data.syncAt} />
            </div>
          </div>

          <div className="kpi-grid">
            {data.kpis.map((m) => (
              <KpiCard key={m.id} metric={m} spark={false} />
            ))}
          </div>

          <Card title="Ritmo de cobro" sub="Cobrado contra el total de cuotas del mes">
            <MetaRow
              meta={{ id: 'cobrado', nombre: 'Cobrado del mes', meta: data.totalMes, format: 'usd', acumulado: [data.cobrado] }}
              ritmo={data.ritmoCobro}
            />
          </Card>

          <Card
            title="Cuotas del mes"
            sub={`${data.cuotas.length} cuotas · vencidas primero`}
            flush
            foot="Lectura directa de clients.cuotas vía ATV Clients."
          >
            <DataTable columns={COLUMNAS} rows={data.cuotas} initialSort={{ key: 'diasAtraso', dir: 'desc' }} />
          </Card>
        </>
      )}
    </div>
  );
}
