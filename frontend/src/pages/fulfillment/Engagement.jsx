import { Link } from 'react-router-dom';
import Heatmap from '../../components/charts/Heatmap.jsx';
import StackedBar from '../../components/charts/StackedBar.jsx';
import Card from '../../components/ui/Card.jsx';
import Icon from '../../components/ui/Icon.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../../components/ui/Loading.jsx';
import Pill from '../../components/ui/Pill.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import { getFulfillment } from '../../data/api.js';
import { hace } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';
import { useMes } from '../../lib/MesContext.jsx';
import { ventanaMes } from '../../lib/semanas.js';
import { formatMes } from '../../lib/format.js';
import { CORTES, PESOS, SEMAFORO } from '../../lib/scoring.js';

const HEATMAP_MAX = 24;

export default function Engagement() {
  const { data, loading, error } = useResource(getFulfillment);
  const { mes } = useMes();
  const ventana = ventanaMes(data?.semanas ?? [], mes);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const porRitmo = data
    ? [...data.activos].sort((a, b) => b.engagement.mensajesClienteSemana - a.engagement.mensajesClienteSemana)
    : [];
  const conMix = data
    ? porRitmo.filter((c) => !c.engagement.mixPendiente)
    : [];
  const silenciosos = data
    ? [...data.activos]
        .filter((c) => c.engagement.diasSinMensaje >= 3)
        .sort((a, b) => b.engagement.diasSinMensaje - a.engagement.diasSinMensaje)
    : [];
  const heatmapFilas = porRitmo.slice(0, HEATMAP_MAX);

  return (
    <div className="page">
      {loading || !data ? (
        <>
          <SkeletonKpis />
          <SkeletonBlock height={340} />
        </>
      ) : (
        <>
          <div className="filtros" style={{ alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              Ritmo, mix léxico y silencios · sync {hace(data.syncAt)}
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <SourceTag sourceId="discord_transcripts" updatedAt={data.syncAt} />
            </div>
          </div>

          <div className="kpi-grid">
            {data.kpis.engagement.map((m) => (
              <KpiCard key={m.id} metric={m} spark={false} />
            ))}
          </div>

          <Card
            title="Actividad semana a semana"
            sub={`Top ${heatmapFilas.length} por ritmo · ${formatMes(mes)} + ${ventana.columnas.length - ventana.resaltadas.size} semanas previas`}
            actions={<SourceTag sourceId="discord_transcripts" updatedAt={data.syncAt} conNombre={false} />}
            foot="Pendiente de la fila importa más que el nivel. Tres semanas apagadas = churn anunciado."
          >
            <div className="heatmap-scroll">
              <Heatmap
                filas={heatmapFilas.map((c) => {
                  const porSemana = new Map(
                    data.actividad.filter((a) => a.clienteId === c.id).map((a) => [a.semana, a]),
                  );
                  return {
                    id: c.id,
                    label: c.nombre,
                    sub: `${c.engagement.mensajesClienteSemana}/sem`,
                    tono: SEMAFORO[c.salud.semaforo].color,
                    valores: ventana.columnas.map((sem) => {
                      const a = porSemana.get(sem);
                      return (a?.mensajesCliente ?? 0) + (a?.mensajesCoach ?? 0);
                    }),
                  };
                })}
                columnas={ventana.columnas}
                resaltadas={ventana.resaltadas}
                unidad="msgs"
              />
            </div>
            {porRitmo.length > HEATMAP_MAX && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--text-3)' }}>
                +{porRitmo.length - HEATMAP_MAX} canales más en Clientes.
              </div>
            )}
          </Card>

          <div className="split">
            <Card
              title="Mix de conversación"
              sub={`${conMix.length} con mensajes etiquetados · heurística léxica`}
              flush
              foot="Implementación / soporte / celebración / queja. No es LLM: palabras clave sobre el transcript."
            >
              {conMix.length === 0 ? (
                <div className="empty">Todavía no hay mensajes etiquetables.</div>
              ) : (
                <>
                  {data.mixDisponible && (
                    <div style={{ padding: '14px var(--space-5)', borderBottom: '1px solid var(--border-soft)' }}>
                      <div className="eyebrow" style={{ marginBottom: 8 }}>Promedio cartera</div>
                      <StackedBar
                        alto={10}
                        partes={[
                          { label: 'Implementación', valor: data.mixGlobal.implementacion, color: 'var(--ok)' },
                          { label: 'Soporte', valor: data.mixGlobal.soporte, color: 'var(--s4)' },
                          { label: 'Celebración', valor: data.mixGlobal.celebracion, color: 'var(--s3)' },
                          { label: 'Queja', valor: data.mixGlobal.queja, color: 'var(--brand)' },
                        ]}
                      />
                    </div>
                  )}
                  {conMix.slice(0, 16).map((c) => (
                    <Link
                      key={c.id}
                      to={`/fulfillment/clientes/${c.id}`}
                      style={{
                        display: 'block',
                        padding: '12px var(--space-5)',
                        borderBottom: '1px solid var(--border-soft)',
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
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
                    </Link>
                  ))}
                </>
              )}
            </Card>

            <Card
              title="Silencios"
              sub={`${silenciosos.length} con ≥3 días sin escribir`}
              flush
              foot="Siete días pintan rojo sin importar el score."
            >
              {silenciosos.length === 0 ? (
                <div className="empty">Nadie lleva más de dos días sin escribir.</div>
              ) : (
                silenciosos.map((c) => (
                  <Link key={c.id} to={`/fulfillment/clientes/${c.id}`} className="lista-item">
                    <span className="who">{c.nombre}</span>
                    <span className="q">
                      {c.engagement.tendencia >= 0 ? '+' : ''}
                      {c.engagement.tendencia}% tendencia · {c.engagement.mensajesClienteSemana}/sem
                    </span>
                    <span className="right">
                      <Pill tone={c.engagement.diasSinMensaje >= 7 ? 'alert' : 'warn'}>
                        {hace(c.ultimaActividadAt)}
                      </Pill>
                      <Icon name="arrow" size={13} />
                    </span>
                  </Link>
                ))
              )}
            </Card>
          </div>

          <Card
            title="Cómo se calcula el semáforo"
            sub="Auditable a propósito"
            foot="La ficha de cada cliente muestra el desglose factor por factor."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-5)' }}>
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
              Verde desde {CORTES.verde}, atención desde {CORTES.amarillo}. Reglas duras: silencio ≥ 7 días e
              intención de baja/reembolso en el texto.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
