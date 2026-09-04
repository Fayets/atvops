import Heatmap from '../../components/charts/Heatmap.jsx';
import StackedBar from '../../components/charts/StackedBar.jsx';
import Card from '../../components/ui/Card.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../../components/ui/Loading.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Pill from '../../components/ui/Pill.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import { getFulfillment } from '../../data/api.js';
import { hace } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';
import { CORTES, PESOS, SEMAFORO } from '../../lib/scoring.js';

export default function Engagement() {
  const { data, loading, error } = useResource(getFulfillment);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const porRitmo = data ? [...data.activos].sort((a, b) => b.engagement.mensajesClienteSemana - a.engagement.mensajesClienteSemana) : [];
  const silenciosos = data ? [...data.activos].filter((c) => c.engagement.diasSinMensaje >= 3).sort((a, b) => b.engagement.diasSinMensaje - a.engagement.diasSinMensaje) : [];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fulfillment · pilar 2"
        title="Engagement y consumo"
        desc="Cada cliente tiene su canal con su coach, así que existe un registro de cada interacción. Lo que importa no es solo cuánto habla, sino de qué habla: preguntar cómo implementar es compromiso; preguntar por el reembolso es una salida en curso."
        actions={<SourceTag sourceId="discord_transcripts" updatedAt={data?.syncAt} />}
      />

      {loading || !data ? (
        <>
          <SkeletonKpis />
          <SkeletonBlock height={340} />
        </>
      ) : (
        <>
          <div className="kpi-grid">
            {data.kpis.engagement.map((m) => (
              <KpiCard key={m.id} metric={m} />
            ))}
          </div>

          <Card
            title="Actividad semana a semana"
            sub={`Mensajes del canal · ${data.semanas.length} semanas · fuente Discord`}
            actions={<SourceTag sourceId="discord_transcripts" updatedAt={data.syncAt} conNombre={false} />}
            foot="El patrón que importa es la pendiente, no el nivel. Una fila que se apaga tres semanas seguidas es un churn anunciado."
          >
            <Heatmap
              filas={porRitmo.map((c) => {
                const porSemana = new Map(
                  data.actividad.filter((a) => a.clienteId === c.id).map((a) => [a.semana, a]),
                );
                return {
                  id: c.id,
                  label: c.nombre,
                  sub: `${c.engagement.mensajesClienteSemana}/sem`,
                  tono: SEMAFORO[c.salud.semaforo].color,
                  valores: data.semanas.map((sem) => {
                    const a = porSemana.get(sem);
                    return (a?.mensajesCliente ?? 0) + (a?.mensajesCoach ?? 0);
                  }),
                };
              })}
              columnas={data.semanas}
              unidad="msgs"
            />
          </Card>

          <div className="split">
            <Card
              title="Mix de conversación por cliente"
              sub="Verde implementación · gris soporte · rojo queja"
              flush
              foot="El clasificador de temas todavía no corre: no inventamos mix a mano."
            >
              {!data.mixDisponible ? (
                <div className="empty">Mix pendiente del clasificador sobre los transcripts.</div>
              ) : (
                porRitmo.map((c) => (
                  <div key={c.id} style={{ padding: '12px var(--space-5)', borderBottom: '1px solid var(--border-soft)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, gap: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{c.nombre}</span>
                      <Pill tone={SEMAFORO[c.salud.semaforo].tone}>{c.salud.score}</Pill>
                    </div>
                    <StackedBar
                      alto={8}
                      leyenda={false}
                      partes={[
                        { label: 'Implementación', valor: c.engagement.mix.implementacion, color: 'var(--ok)' },
                        { label: 'Soporte', valor: c.engagement.mix.soporte, color: 'var(--s4)' },
                        { label: 'Celebración', valor: c.engagement.mix.celebracion, color: 'var(--s3)' },
                        { label: 'Queja', valor: c.engagement.mix.queja, color: 'var(--brand)' },
                      ]}
                    />
                  </div>
                ))
              )}
            </Card>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <Card
                title="Silencios"
                sub="Clientes que hace días no escriben"
                flush
                foot={`Siete días de silencio pintan rojo sin importar el score. Es la regla dura del modelo.`}
              >
                {silenciosos.length === 0 ? (
                  <div className="empty">Nadie lleva más de dos días sin escribir.</div>
                ) : (
                  silenciosos.map((c) => (
                    <div key={c.id} className="lista-item">
                      <span className="who">{c.nombre}</span>
                      <span className="q">{c.engagement.tendencia}% de mensajes vs el mes anterior</span>
                      <span className="right">
                        <Pill tone={c.engagement.diasSinMensaje >= 7 ? 'alert' : 'warn'}>
                          {hace(c.ultimaActividadAt)}
                        </Pill>
                      </span>
                    </div>
                  ))
                )}
              </Card>
            </div>
          </div>

          <Card
            title="Cómo se calcula el semáforo"
            sub="El score es público y auditable a propósito"
            foot="Si el equipo no entiende el score, no lo va a usar. Por eso la ficha de cada cliente muestra el desglose factor por factor."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-5)' }}>
              {Object.entries(PESOS).map(([k, v]) => (
                <div key={k}>
                  <div className="eyebrow">{k}</div>
                  <div className="num" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>
                    {v}
                    <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}> pts</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 18, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
              Verde desde {CORTES.verde}, atención desde {CORTES.amarillo}, rojo abajo. Dos reglas duras se imponen al
              puntaje: siete días de silencio, y no haber activado después de la ventana de 30 días.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
