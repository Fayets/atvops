import { useState } from 'react';
import Bars from '../components/charts/Bars.jsx';
import HBars from '../components/charts/HBars.jsx';
import AvanceVsMeta from '../components/metas/AvanceVsMeta.jsx';
import MetaMesModal from '../components/metas/MetaMesModal.jsx';
import Card from '../components/ui/Card.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import KpiCard from '../components/ui/KpiCard.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import SourceTag from '../components/ui/SourceTag.jsx';
import { getMarketing, getMetasMes } from '../data/api.js';
import { ahora, formatValue, hace, mesId, nombreMesAnio } from '../lib/format.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';
import { useRol } from '../lib/RolContext.jsx';
import { puedeEditarMetas } from '../lib/roles.js';

const CANAL = { meta: 'Meta', youtube: 'YouTube', google: 'Google', tiktok: 'TikTok' };

function tonoFrecuencia(f, umbrales) {
  if (f >= umbrales.quemado) return 'alert';
  if (f >= umbrales.objetivo) return 'warn';
  return 'ok';
}

export default function Ads() {
  const { mes } = useMes();
  const { rol } = useRol();
  const puedeEditar = puedeEditarMetas(rol);
  const { data, loading, error } = useResource(() => getMarketing(mes), [mes]);
  const [tickMeta, setTickMeta] = useState(0);
  const [modalMeta, setModalMeta] = useState(false);
  const metas = useResource(() => getMetasMes(mes, { incluirAds: true }), [mes, tickMeta]);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  /** @type {import('../components/ui/DataTable.jsx').Columna[]} */
  const columnas = data
    ? [
        { key: 'nombre', label: 'Campaña', render: (c) => <span className="strong">{c.nombre}</span> },
        { key: 'canal', label: 'Canal', render: (c) => <span className="dim">{CANAL[c.canal] || c.canal}</span> },
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
            <Pill
              tone={tonoFrecuencia(c.frecuencia, data.umbrales)}
              title={`Máximo ${data.umbrales.objetivo}; quemado desde ${data.umbrales.quemado}`}
            >
              <span className="num">{Number(c.frecuencia || 0).toFixed(2)}</span>
            </Pill>
          ),
        },
        { key: 'gastoUsd', label: 'Gasto', align: 'right', render: (c) => <span className="num">{formatValue(c.gastoUsd, 'usd')}</span> },
        { key: 'leads', label: 'Leads', align: 'right', render: (c) => <span className="num">{c.leads}</span> },
        { key: 'cplUsd', label: 'CPL', align: 'right', render: (c) => <span className="num">{formatValue(c.cplUsd, 'usd')}</span> },
        { key: 'roas', label: 'ROAS', align: 'right', render: (c) => <span className="num">{Number(c.roas || 0).toFixed(1)}×</span> },
        {
          key: 'ultimaSyncAt',
          label: 'Sync',
          align: 'right',
          render: (c) => (
            <span className="dim" style={{ fontSize: 11.5 }}>
              {hace(c.ultimaSyncAt)}
            </span>
          ),
        },
      ]
    : [];

  const quemadas = data?.campanias.filter((c) => c.frecuencia >= data.umbrales.quemado) ?? [];
  const gastoVentas = data?.campanias.filter((c) => c.objetivo === 'ventas').reduce((s, c) => s + c.gastoUsd, 0) ?? 0;
  const gastoTotal = data?.campanias.reduce((s, c) => s + c.gastoUsd, 0) || 1;
  const metasData = metas.data;
  const ig = data?.instagram;
  const pubs = ig?.publicaciones ?? [];
  const diaLimite = data?.mes === mesId(ahora()) ? ahora().getDate() : 31;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Área · Juan Cruz"
        title="Ads"
        actions={
          <>
            {puedeEditar && (
              <button type="button" className="btn" onClick={() => setModalMeta(true)}>
                Definir meta del mes
              </button>
            )}
            <SourceTag sourceId="ads_manager" updatedAt={data?.syncAt} />
          </>
        }
      />

      {loading || !data ? (
        <>
          <SkeletonKpis />
          <SkeletonBlock height={300} />
        </>
      ) : (
        <>
          {metasData && (
            <AvanceVsMeta
              filas={metasData.avanceAds}
              titulo="Avance vs meta · Ads"
              sub={`Inversión · ${metasData.contexto.nombreMes} · día ${metasData.contexto.diaHoy}/${metasData.contexto.diasMes}`}
              syncAt={metasData.real.syncAt}
            />
          )}

          <div className="kpi-grid">
            {data.kpis.map((m) => (
              <KpiCard key={m.id} metric={m} />
            ))}
          </div>

          {ig && !ig.error && (
            <Card
              title="Contenido Instagram del mes"
              sub={`${ig.totales?.publicaciones ?? 0} publicaciones · ${ig.totales?.stories ?? 0} stories activas · ${formatValue(ig.totales?.likes ?? 0, 'count')} likes`}
              actions={<SourceTag sourceId="ads_manager" conNombre={false} updatedAt={ig.syncAt} />}
            >
              {pubs.length === 0 ? (
                <p className="dim" style={{ margin: 0 }}>Sin publicaciones en este mes.</p>
              ) : (
                <ul className="ig-pubs">
                  {pubs.map((p) => (
                    <li key={p.id} className="ig-pub">
                      {p.thumbnailUrl ? (
                        <a href={p.permalink || '#'} target="_blank" rel="noreferrer" className="ig-thumb">
                          <img src={p.thumbnailUrl} alt="" />
                        </a>
                      ) : (
                        <div className="ig-thumb ig-thumb--empty" />
                      )}
                      <div className="ig-pub-body">
                        <div className="ig-pub-meta">
                          <Pill tone="plain">{p.tipo || p.mediaType}</Pill>
                          <span className="dim">{(p.timestamp || '').slice(0, 10)}</span>
                          <span className="dim">{p.likes} likes · {p.comments} com.</span>
                        </div>
                        <p className="ig-caption">{p.caption || 'Sin caption'}</p>
                        {p.permalink && (
                          <a href={p.permalink} target="_blank" rel="noreferrer" className="dim" style={{ fontSize: 12 }}>
                            Ver en Instagram →
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {ig.storiesActivas?.length > 0 && (
                <p className="dim" style={{ margin: '12px 0 0', fontSize: 12.5 }}>
                  {ig.storiesActivas.length} stories activas ahora (ventana 24 h).
                </p>
              )}
            </Card>
          )}

          <div className="split">
            <Card
              title="Gasto diario"
              sub={`${nombreMesAnio()} · mes seleccionado`}
              actions={<SourceTag sourceId="ads_manager" conNombre={false} />}
              foot={`${formatValue(gastoVentas, 'usd')} del gasto (${Math.round((gastoVentas / gastoTotal) * 100)}%) en objetivo "ventas".`}
            >
              {(data.gastoDiario?.length ?? 0) === 0 ? (
                <p className="dim" style={{ margin: 0 }}>Sin gasto en el mes seleccionado.</p>
              ) : (
                <Bars
                  data={data.gastoDiario.filter((d) => Number(d.dia) <= diaLimite)}
                  x={(d) => d.dia}
                  y={(d) => d.gastoUsd}
                  format="usd"
                  label="Gasto"
                  height={252}
                  linea={{ key: (d) => d.leads, label: 'Leads', format: 'count' }}
                />
              )}
            </Card>

            <Card title="Gasto por canal" sub="Distribución del mes">
              <HBars
                data={(data.gastoCanal || []).map((c) => ({
                  label: c.canal,
                  value: c.gastoUsd,
                  sub: `${c.leads} leads · ${c.leads ? formatValue(c.gastoUsd / c.leads, 'usd') : '—'} por lead · ROAS ${Number(c.roas || 0).toFixed(1)}×`,
                }))}
              />
            </Card>
          </div>

          <Card
            title="Campañas"
            sub={data.fuente === 'meta_ads' ? 'Meta Ads · mes seleccionado' : 'Sin conexión con Meta Ads'}
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
            foot={`Frecuencia = impresiones ÷ alcance. Máximo ${data.umbrales.objetivo}; desde ${data.umbrales.quemado} el creativo está quemado.`}
          >
            <DataTable columns={columnas} rows={data.campanias} initialSort={{ key: 'frecuencia', dir: 'desc' }} />
          </Card>
        </>
      )}

      {puedeEditar && metasData && (
        <MetaMesModal
          abierto={modalMeta}
          onCerrar={() => setModalMeta(false)}
          decreto={metasData.decreto}
          mes={metasData.contexto.mes}
          nombreMes={metasData.contexto.nombreMes}
          onGuardado={() => setTickMeta((n) => n + 1)}
        />
      )}
    </div>
  );
}
