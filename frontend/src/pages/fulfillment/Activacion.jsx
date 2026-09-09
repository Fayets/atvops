import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card.jsx';
import Icon from '../../components/ui/Icon.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../../components/ui/Loading.jsx';
import Pill from '../../components/ui/Pill.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import { getFulfillment } from '../../data/api.js';
import { formatFecha, formatMes, formatValue, hace } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';
import { VENTANA_ONBOARDING } from '../../lib/scoring.js';

const CAT_LABEL = {
  boost: 'Boost',
  advantage: 'Advantage',
  avanzados: 'Avanzados',
  principiantes: 'Principiantes',
  mentoria: 'Mentoría',
};

/**
 * Fase onboarding: desde la entrada al canal, 31 días.
 * Al día 31 salen de la fase (pasan al resto del programa).
 */
export default function Activacion() {
  const { data, loading, error } = useResource(getFulfillment);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const enFase = data
    ? [...(data.enOnboarding ?? [])].sort((a, b) => b.onboarding.dias - a.onboarding.dias)
    : [];

  return (
    <div className="page activacion-page">
      {loading || !data ? (
        <>
          <SkeletonKpis n={3} />
          <SkeletonBlock height={300} />
        </>
      ) : (
        <>
          <div className="filtros" style={{ alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              Activación = fase onboarding desde la entrada al canal · {VENTANA_ONBOARDING} días · al día{' '}
              {VENTANA_ONBOARDING} salen
              {data.syncAt ? ` · sync ${hace(data.syncAt)}` : ''}
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <SourceTag sourceId="discord_transcripts" updatedAt={data.syncAt} />
            </div>
          </div>

          <div className="kpi-grid activacion-kpis">
            {(data.kpis.onboarding ?? []).map((m) => (
              <KpiCard key={m.id} metric={m} spark={false} />
            ))}
          </div>

          <Card
            title="Por mes de entrada"
            sub={`% que ya cumplió los ${VENTANA_ONBOARDING} días y salió de onboarding`}
            foot="Mes = cuando llegó el primer mensaje al canal."
          >
            {data.cohortes.length === 0 ? (
              <div className="empty">Sin fechas de entrada en los transcripts.</div>
            ) : (
              <div className="cohorte-grid activacion-meses">
                {data.cohortes.map((c) => {
                  const salieronN = c.salieron ?? c.activados30 ?? 0;
                  const pct = c.entraron ? Math.round((salieronN / c.entraron) * 100) : 0;
                  return (
                    <div key={c.mes} className="cohorte">
                      <div className="mes">{formatMes(c.mes)}</div>
                      <div
                        className="pct num"
                        style={{
                          color: pct >= 80 ? 'var(--ok)' : pct >= 40 ? 'var(--warn)' : 'var(--brand-hi)',
                        }}
                      >
                        {pct}%
                      </div>
                      <div className="det">
                        {salieronN}/{c.entraron} salieron
                        {c.medianaDias != null ? ` · med ${formatValue(c.medianaDias, 'days')}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card
            title="En fase ahora"
            sub={`${enFase.length} clientes · día 0 a ${VENTANA_ONBOARDING - 1}`}
            flush
            foot="Ordenados por día (más cerca de salir primero)."
          >
            {enFase.length === 0 ? (
              <div className="empty">No hay clientes dentro de la ventana de 31 días.</div>
            ) : (
              enFase.map((c) => {
                const urgente = c.onboarding.diasRestantes <= 7;
                return (
                  <Link key={c.id} to={`/fulfillment/clientes/${c.id}`} className="lista-item">
                    <Pill tone={urgente ? 'warn' : 'ok'} dot>
                      día {c.onboarding.dias}/{VENTANA_ONBOARDING}
                    </Pill>
                    <span className="who">{c.nombre}</span>
                    <span className="q">
                      {CAT_LABEL[c.categoria] ?? c.categoria} · entrada {formatFecha(c.entradaAt)}
                      {urgente
                        ? ` · salen en ${c.onboarding.diasRestantes} d`
                        : ` · quedan ${c.onboarding.diasRestantes} d`}
                      {c.fase?.label ? ` · ficha: ${c.fase.label}` : ''}
                    </span>
                    <span className="right">
                      <Icon name="arrow" size={13} />
                    </span>
                  </Link>
                );
              })
            )}
          </Card>
        </>
      )}
    </div>
  );
}
