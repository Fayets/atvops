import Bars from '../components/charts/Bars.jsx';
import HBars from '../components/charts/HBars.jsx';
import Card from '../components/ui/Card.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import KpiCard from '../components/ui/KpiCard.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import SourceTag from '../components/ui/SourceTag.jsx';
import { getMarketing } from '../data/api.js';
import { ahora, formatValue, hace, nombreMesAnio } from '../lib/format.js';
import { useResource } from '../lib/hooks.js';

const CANAL = { meta: 'Meta', youtube: 'YouTube', google: 'Google', tiktok: 'TikTok' };

/**
 * La frecuencia es la métrica que gobierna en campañas de tráfico a DM: sin
 * pixel ni evento de conversión, es la única con umbral y acción clara.
 */
function tonoFrecuencia(f, umbrales) {
  if (f >= umbrales.quemado) return 'alert';
  if (f >= umbrales.objetivo) return 'warn';
  return 'ok';
}

export default function Marketing() {
  const { data, loading, error } = useResource(getMarketing);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  /** @type {import('../components/ui/DataTable.jsx').Columna[]} */
  const columnas = data
    ? [
        { key: 'nombre', label: 'Campaña', render: (c) => <span className="strong">{c.nombre}</span> },
        { key: 'canal', label: 'Canal', render: (c) => <span className="dim">{CANAL[c.canal]}</span> },
        {
          key: 'objetivo',
          label: 'Objetivo',
          render: (c) => <Pill tone={c.objetivo === 'ventas' ? 'warn' : 'plain'}>{c.objetivo}</Pill>,
        },
        {
          key: 'estado',
          label: 'Estado',
          render: (c) => (
            <Pill tone={c.estado === 'activa' ? 'ok' : 'off'} dot>
              {c.estado}
            </Pill>
          ),
        },
        {
          key: 'frecuencia',
          label: 'Frecuencia',
          align: 'right',
          render: (c) => (
            <Pill tone={tonoFrecuencia(c.frecuencia, data.umbrales)} title={`Máximo ${data.umbrales.objetivo}; quemado desde ${data.umbrales.quemado}`}>
              <span className="num">{c.frecuencia.toFixed(2)}</span>
            </Pill>
          ),
        },
        { key: 'gastoUsd', label: 'Gasto', align: 'right', render: (c) => <span className="num">{formatValue(c.gastoUsd, 'usd')}</span> },
        { key: 'leads', label: 'Leads', align: 'right', render: (c) => <span className="num">{c.leads}</span> },
        { key: 'cplUsd', label: 'CPL', align: 'right', render: (c) => <span className="num">{formatValue(c.cplUsd, 'usd')}</span> },
        { key: 'roas', label: 'ROAS', align: 'right', render: (c) => <span className="num">{c.roas.toFixed(1)}×</span> },
        {
          key: 'ultimaSyncAt',
          label: 'Sync',
          align: 'right',
          render: (c) => <span className="dim" style={{ fontSize: 11.5 }}>{hace(c.ultimaSyncAt)}</span>,
        },
      ]
    : [];

  const quemadas = data?.campanias.filter((c) => c.frecuencia >= data.umbrales.quemado) ?? [];
  const gastoVentas = data?.campanias.filter((c) => c.objetivo === 'ventas').reduce((s, c) => s + c.gastoUsd, 0) ?? 0;
  const gastoTotal = data?.campanias.reduce((s, c) => s + c.gastoUsd, 0) ?? 1;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Área · Juan Cruz"
        title="Marketing"
        desc="Gasto, leads y frecuencia por campaña. En campañas de tráfico a DM no hay pixel ni evento de conversión: la métrica con umbral y acción es la frecuencia, y la conversión real se cierra en el chat."
        actions={<SourceTag sourceId="ads_manager" />}
      />

      {loading || !data ? (
        <>
          <SkeletonKpis />
          <SkeletonBlock height={300} />
        </>
      ) : (
        <>
          <div className="kpi-grid">
            {data.kpis.map((m) => (
              <KpiCard key={m.id} metric={m} />
            ))}
          </div>

          <div className="split">
            <Card
              title="Gasto diario"
              sub={`${nombreMesAnio()} · hasta hoy`}
              actions={<SourceTag sourceId="ads_manager" conNombre={false} />}
              foot={`${formatValue(gastoVentas, 'usd')} del gasto (${Math.round((gastoVentas / gastoTotal) * 100)}%) está en campañas con objetivo "ventas", que usan pixel y landing. Se miran aparte: distorsionan el costo por lead del modelo de DM.`}
            >
              <Bars
                data={data.gastoDiario.filter((d) => Number(d.dia) <= ahora().getDate())}
                x={(d) => d.dia}
                y={(d) => d.gastoUsd}
                format="usd"
                label="Gasto"
                height={252}
                linea={{ key: (d) => d.leads, label: 'Leads', format: 'count' }}
              />
            </Card>

            <Card title="Gasto por canal" sub="Distribución del mes">
              <HBars
                data={data.gastoCanal.map((c) => ({
                  label: c.canal,
                  value: c.gastoUsd,
                  sub: `${c.leads} leads · ${formatValue(c.gastoUsd / c.leads, 'usd')} por lead · ROAS ${c.roas.toFixed(1)}×`,
                }))}
              />
            </Card>
          </div>

          <Card
            title="Campañas"
            sub="Ordenadas por urgencia creativa"
            actions={
              quemadas.length ? (
                <Pill tone="alert" dot>
                  {quemadas.length} con el creativo quemado
                </Pill>
              ) : (
                <Pill tone="ok" dot>
                  frecuencia bajo control
                </Pill>
              )
            }
            flush
            foot={`Frecuencia = impresiones ÷ alcance. Máximo ${data.umbrales.objetivo}; desde ${data.umbrales.quemado} el creativo está quemado y hay que rotarlo. Escalar es duplicar la campaña en un conjunto nuevo, nunca subirle el presupuesto al que ya funciona.`}
          >
            <DataTable columns={columnas} rows={data.campanias} initialSort={{ key: 'frecuencia', dir: 'desc' }} />
          </Card>
        </>
      )}
    </div>
  );
}
