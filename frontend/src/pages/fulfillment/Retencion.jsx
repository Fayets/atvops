import { Link } from 'react-router-dom';
import Bars from '../../components/charts/Bars.jsx';
import Card from '../../components/ui/Card.jsx';
import Icon from '../../components/ui/Icon.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../../components/ui/Loading.jsx';
import Pill from '../../components/ui/Pill.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import { getFulfillment } from '../../data/api.js';
import { ahora, diasEntre, formatFecha, formatMes, hace } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';
import { SEMAFORO, VENTANA_ACTIVACION } from '../../lib/scoring.js';

const CAT_LABEL = {
  boost: 'Boost',
  advantage: 'Advantage',
  avanzados: 'Avanzados',
  principiantes: 'Principiantes',
  mentoria: 'Mentoría',
};

export default function Retencion() {
  const { data, loading, error } = useResource(getFulfillment);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const enRiesgo = data
    ? data.activos
        .filter((c) => c.salud.semaforo !== 'verde')
        .sort((a, b) => a.salud.score - b.salud.score)
    : [];
  const silenciosos = data?.silencio ?? [];
  const riesgoAlto = data?.riesgoAlto ?? [];
  const sinActivarFuera = data?.sinActivarFuera ?? [];
  const caida = data?.caidaFuerte ?? [];

  /** % aún escribiendo (último msg &lt; 14d) por cohorte de entrada. */
  const cohortesRetencion = data
    ? data.cohortes.map((c) => {
        const delMes = data.activos.filter((x) => (x.entradaAt ?? '').slice(0, 7) === c.mes);
        const vivos = delMes.filter((x) => diasEntre(x.ultimaActividadAt, ahora().toISOString()) <= 14);
        return {
          mes: c.mes,
          entraron: c.entraron,
          vivos: vivos.length,
          pct: c.entraron ? Math.round((vivos.length / c.entraron) * 100) : 0,
        };
      })
    : [];

  return (
    <div className="page">
      {loading || !data ? (
        <>
          <SkeletonKpis n={4} />
          <SkeletonBlock height={320} />
        </>
      ) : (
        <>
          <div className="filtros" style={{ alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              Riesgo de churn desde el canal · sin NRR (falta payments) · sync {hace(data.syncAt)}
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <SourceTag sourceId="discord_transcripts" updatedAt={data.syncAt} />
            </div>
          </div>

          <div className="kpi-grid">
            {data.kpis.retencion.map((m) => (
              <KpiCard key={m.id} metric={m} spark={false} />
            ))}
          </div>

          <Card
            title="Retención de actividad por cohorte"
            sub="% con mensaje en los últimos 14 días · por mes de entrada"
            foot="Proxy de retención hasta conectar payments / CRM. No es NRR."
          >
            {cohortesRetencion.length === 0 ? (
              <div className="empty">Sin fechas de entrada.</div>
            ) : (
              <Bars
                data={cohortesRetencion.slice(-10)}
                x={(c) => formatMes(c.mes).split(' ')[0]}
                y={(c) => c.pct}
                format="pct"
                label="% activos"
                height={240}
                color={(c) => (c.pct >= 70 ? 'var(--ok)' : c.pct >= 40 ? 'var(--warn)' : 'var(--brand)')}
                referencia={{ valor: 70, label: '70%' }}
              />
            )}
          </Card>

          {riesgoAlto.length > 0 && (
            <Card
              title="Riesgo alto según la ficha viva"
              sub={`${riesgoAlto.length} clientes · Claude, en cada ronda`}
              flush
              foot="El motivo sale de la ficha del cerebro; abrí la ficha para ver próximos pasos."
            >
              {riesgoAlto.map((c) => (
                <Link key={c.id} to={`/fulfillment/clientes/${c.id}`} className="lista-item">
                  <Pill tone="alert" dot>{c.fase?.label ?? 'riesgo alto'}</Pill>
                  <span className="who">{c.nombre}</span>
                  <span className="q">{c.ficha.riesgoMotivo || c.ficha.resumen}</span>
                  <span className="right"><Icon name="arrow" size={13} /></span>
                </Link>
              ))}
            </Card>
          )}

          <div className="split">
            <Card
              title="Silencio ≥ 7 días"
              sub={`${silenciosos.length} canales`}
              flush
              foot="Regla dura del score."
            >
              {silenciosos.length === 0 ? (
                <div className="empty">Ningún silencio largo.</div>
              ) : (
                silenciosos.map((c) => (
                  <Link key={c.id} to={`/fulfillment/clientes/${c.id}`} className="lista-item">
                    <Pill tone="alert" dot>{c.engagement.diasSinMensaje}d</Pill>
                    <span className="who">{c.nombre}</span>
                    <span className="q">#{c.canal} · {hace(c.ultimaActividadAt)}</span>
                    <span className="right"><Icon name="arrow" size={13} /></span>
                  </Link>
                ))
              )}
            </Card>

            <Card
              title={`Sin activar (>${VENTANA_ACTIVACION}d)`}
              sub={`${sinActivarFuera.length} fuera de ventana sin win`}
              flush
              foot="Pasaron el día 30 sin resultado detectable."
            >
              {sinActivarFuera.length === 0 ? (
                <div className="empty">Nadie en esta cola.</div>
              ) : (
                sinActivarFuera
                  .sort((a, b) => diasEntre(b.entradaAt, ahora().toISOString()) - diasEntre(a.entradaAt, ahora().toISOString()))
                  .map((c) => (
                    <Link key={c.id} to={`/fulfillment/clientes/${c.id}`} className="lista-item">
                      <Pill tone="warn" dot>
                        día {diasEntre(c.entradaAt, ahora().toISOString())}
                      </Pill>
                      <span className="who">{c.nombre}</span>
                      <span className="q">
                        {CAT_LABEL[c.categoria] ?? c.categoria}
                        {c.activacion.blocker ? ` · ${c.activacion.blocker}` : ''}
                      </span>
                      <span className="right"><Icon name="arrow" size={13} /></span>
                    </Link>
                  ))
              )}
            </Card>
          </div>

          <Card
            title="Cola de trabajo · fuera de verde"
            sub={`${enRiesgo.length} canales`}
            flush
            foot={
              caida.length
                ? `${caida.length} además con caída fuerte de actividad (≤ −30%).`
                : 'Ordenados por score (peor primero).'
            }
          >
            {enRiesgo.length === 0 ? (
              <div className="empty">Toda la cartera en verde.</div>
            ) : (
              enRiesgo.map((c) => (
                <Link key={c.id} to={`/fulfillment/clientes/${c.id}`} className="lista-item">
                  <Pill tone={SEMAFORO[c.salud.semaforo].tone} dot>{c.salud.score}</Pill>
                  <span className="who">{c.nombre}</span>
                  <span className="q">{c.salud.alertas[0] ?? 'Score por debajo del corte'}</span>
                  <span className="right">
                    <span className="dim">{CAT_LABEL[c.categoria] ?? c.categoria}</span>
                    <Icon name="arrow" size={13} />
                  </span>
                </Link>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  );
}
