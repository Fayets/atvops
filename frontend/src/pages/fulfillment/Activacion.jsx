import Bars from '../../components/charts/Bars.jsx';
import Card from '../../components/ui/Card.jsx';
import Icon from '../../components/ui/Icon.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../../components/ui/Loading.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Pill from '../../components/ui/Pill.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import { getFulfillment } from '../../data/api.js';
import { ahora, diasEntre, formatFecha, formatMes } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';
import { VENTANA_ACTIVACION } from '../../lib/scoring.js';

export default function Activacion() {
  const { data, loading, error } = useResource(getFulfillment);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const activados = data
    ? data.activos
        .filter((c) => c.activacion.activado)
        .sort((a, b) => (a.activacion.diasHastaResultado ?? 0) - (b.activacion.diasHastaResultado ?? 0))
    : [];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fulfillment · pilar 1"
        title="Activación"
        desc={`Activación es que el cliente haya conseguido un primer resultado tangible dentro de los ${VENTANA_ACTIVACION} días. Hoy la cartera sale de Discord; el clasificador que marca el win en el transcript todavía no corre, así que nadie figura activado.`}
        actions={<SourceTag sourceId="discord_transcripts" />}
      />

      {loading || !data ? (
        <>
          <SkeletonKpis n={3} />
          <SkeletonBlock height={300} />
        </>
      ) : (
        <>
          <div className="kpi-grid">
            {data.kpis.activacion.map((m) => (
              <KpiCard key={m.id} metric={m} />
            ))}
          </div>

          <div className="split">
            <Card
              title="Días hasta el primer resultado"
              sub="Cada barra es un cliente activo · la línea marca el día 30"
              foot="Cuando el clasificador lea los transcripts, el win (venta, lead, lanzamiento) va a aparecer acá con la fecha del mensaje."
            >
              {activados.length === 0 ? (
                <div className="empty">
                  Todavía no hay activaciones detectadas en los canales. Falta el clasificador sobre el transcript.
                </div>
              ) : (
                <Bars
                  data={activados}
                  x={(c) => c.nombre.split(' ')[0]}
                  y={(c) => c.activacion.diasHastaResultado ?? 0}
                  format="days"
                  label="Días"
                  height={252}
                  color={(c) => ((c.activacion.diasHastaResultado ?? 0) <= VENTANA_ACTIVACION ? 'var(--ok)' : 'var(--brand)')}
                  referencia={{ valor: VENTANA_ACTIVACION, label: `día ${VENTANA_ACTIVACION}` }}
                />
              )}
            </Card>

            <Card
              title="Cohortes"
              sub="Entradas por mes según el primer mensaje del canal"
              foot="El % de activación en 30 días queda en 0 hasta que corra el clasificador."
            >
              {data.cohortes.length === 0 ? (
                <div className="empty">Sin fechas de entrada en los transcripts.</div>
              ) : (
                <div className="cohorte-grid">
                  {data.cohortes.map((c) => {
                    const pct = Math.round((c.activados30 / c.entraron) * 100);
                    return (
                      <div key={c.mes} className="cohorte">
                        <div className="mes">{formatMes(c.mes)}</div>
                        <div
                          className="pct num"
                          style={{ color: pct >= 80 ? 'var(--ok)' : pct >= 50 ? 'var(--warn)' : 'var(--brand-hi)' }}
                        >
                          {pct}%
                        </div>
                        <div className="det">
                          {c.activados30}/{c.entraron} · {c.entraron} canales
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <Card
            title="Sin activar (toda la cartera actual)"
            sub="Un canal = un cliente · el reloj corre desde el primer mensaje"
            flush
            foot="Los blockers (onboarding trabado, sin entrega, etc.) van a salir del clasificador. Por ahora solo vemos cuántos días lleva cada canal."
          >
            {data.sinActivar.length === 0 ? (
              <div className="empty">Toda la cartera activa llegó a su primer resultado.</div>
            ) : (
              data.sinActivar.map((c) => {
                const dias = diasEntre(c.entradaAt, ahora().toISOString());
                return (
                  <div key={c.id} className="fuente-card">
                    <div className="fuente-top">
                      <h3>{c.nombre}</h3>
                      <Pill tone="alert">{c.categoria ?? 'canal'}</Pill>
                      <div className="meta">
                        <span>#{c.canal}</span>
                        <span>Primer mensaje {formatFecha(c.entradaAt)}</span>
                        <span style={{ color: dias > VENTANA_ACTIVACION ? 'var(--brand-hi)' : 'var(--text-3)' }}>
                          día {dias}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </Card>

          {activados.length > 0 && (
            <Card
              title="Primeros resultados detectados"
              sub="El win, tal como apareció en el canal"
              flush
              foot="Esto es lo que un formulario nunca captura: la frase exacta del cliente cuando algo funcionó."
            >
              {activados.slice(0, 6).map((c) => (
                <div key={c.id} className="senal positiva">
                  <i className="marca" />
                  <div>
                    <blockquote>{c.activacion.descripcion}</blockquote>
                    <div className="meta">
                      <strong style={{ color: 'var(--text-2)' }}>{c.nombre}</strong>
                      <span>{formatFecha(c.activacion.primerResultadoAt)}</span>
                    </div>
                  </div>
                  <Pill tone={(c.activacion.diasHastaResultado ?? 0) <= VENTANA_ACTIVACION ? 'ok' : 'warn'}>
                    <Icon name="reloj" size={11} />
                    día {c.activacion.diasHastaResultado}
                  </Pill>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
