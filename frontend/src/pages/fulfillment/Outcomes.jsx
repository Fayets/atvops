import { Link } from 'react-router-dom';
import Bars from '../../components/charts/Bars.jsx';
import Senales from '../../components/fulfillment/Senales.jsx';
import Card from '../../components/ui/Card.jsx';
import Icon from '../../components/ui/Icon.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../../components/ui/Loading.jsx';
import Pill from '../../components/ui/Pill.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import { getFulfillment } from '../../data/api.js';
import { formatFecha, hace } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';
import { SEMAFORO, VENTANA_ACTIVACION } from '../../lib/scoring.js';

const CAT_LABEL = {
  boost: 'Boost',
  advantage: 'Advantage',
  avanzados: 'Avanzados',
  principiantes: 'Principiantes',
  mentoria: 'Mentoría',
};

export default function Outcomes() {
  const { data, loading, error } = useResource(getFulfillment);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const activados = data
    ? data.activos
        .filter((c) => c.activacion.activado)
        .sort((a, b) => (a.activacion.diasHastaResultado ?? 0) - (b.activacion.diasHastaResultado ?? 0))
    : [];
  const winsIA = data?.winsIA ?? [];
  const momentum = data?.momentumPos ?? [];
  const candidatos = data?.candidatos ?? [];
  const caida = data?.caidaFuerte ?? [];
  const nombrePorId = (id) => data?.activos?.find((c) => c.id === id)?.nombre ?? id;

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
              Resultados del canal (wins + momentum) · sin facturación USD · sync {hace(data.syncAt)}
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <SourceTag sourceId="discord_transcripts" updatedAt={data.syncAt} />
            </div>
          </div>

          <div className="kpi-grid">
            {[...data.kpis.outcomes, ...data.kpis.expansion].map((m) => (
              <KpiCard key={m.id} metric={m} spark={false} />
            ))}
          </div>

          <div className="split">
            <Card
              title="Días hasta el win"
              sub={`${activados.length} con resultado detectado`}
              foot={`Línea = día ${VENTANA_ACTIVACION}. Heurística sobre el transcript.`}
            >
              {activados.length === 0 ? (
                <div className="empty">Sin wins detectados todavía.</div>
              ) : (
                <Bars
                  data={activados.slice(0, 20)}
                  x={(c) => c.nombre.split(' ')[0]}
                  y={(c) => c.activacion.diasHastaResultado ?? 0}
                  format="days"
                  label="Días"
                  height={252}
                  color={(c) =>
                    (c.activacion.diasHastaResultado ?? 0) <= VENTANA_ACTIVACION ? 'var(--ok)' : 'var(--brand)'
                  }
                  referencia={{ valor: VENTANA_ACTIVACION, label: `día ${VENTANA_ACTIVACION}` }}
                />
              )}
            </Card>

            <Card
              title="Momentum de actividad"
              sub={`${momentum.length} con tendencia ≥ +20%`}
              foot="Tendencia de mensajes del cliente vs semanas previas."
            >
              {momentum.length === 0 ? (
                <div className="empty">Nadie con subida fuerte esta semana.</div>
              ) : (
                <Bars
                  data={[...momentum]
                    .sort((a, b) => (b.engagement.tendencia ?? 0) - (a.engagement.tendencia ?? 0))
                    .slice(0, 16)}
                  x={(c) => c.nombre.split(' ')[0]}
                  y={(c) => c.engagement.tendencia ?? 0}
                  format="pct"
                  label="Tendencia"
                  height={252}
                  color={() => 'var(--ok)'}
                />
              )}
            </Card>
          </div>

          {winsIA.length > 0 && (
            <Card
              title="Resultados reportados (Claude)"
              sub={`${winsIA.length} en los últimos 30 días · de las fichas vivas`}
              flush
              foot="Solo resultados tangibles ya ocurridos, en palabras del cliente."
            >
              {winsIA.map((w, i) => (
                <Link key={`${w.clienteId}-${i}`} to={`/fulfillment/clientes/${w.clienteId}`} className="lista-item">
                  <Pill tone="ok" dot>{w.tipo}</Pill>
                  <span className="who">{w.nombre}</span>
                  <span className="q">«{w.descripcion}»</span>
                  <span className="right">
                    <span className="dim" style={{ fontSize: 12 }}>{formatFecha(w.fecha)}</span>
                    <Icon name="arrow" size={13} />
                  </span>
                </Link>
              ))}
            </Card>
          )}

          <Senales
            compacto
            max={6}
            senales={data?.senales ?? []}
            nombrePorCliente={nombrePorId}
          />

          <div className="split">
            <Card
              title="Candidatos a upsell"
              sub={`${candidatos.length} con señal de techo / siguiente nivel`}
              flush
              foot={data.conFicha?.length ? 'Según la ficha viva de Claude; sin ficha, léxico del canal.' : 'Léxico: upsell, techo, escalar, pasar a Boost/Advantage, etc.'}
            >
              {candidatos.length === 0 ? (
                <div className="empty">Sin candidatos detectados.</div>
              ) : (
                candidatos.map((c) => (
                  <Link key={c.id} to={`/fulfillment/clientes/${c.id}`} className="lista-item">
                    <Pill tone="ok">candidato</Pill>
                    <span className="who">{c.nombre}</span>
                    <span className="q">
                      {c.expansion?.motivo ? c.expansion.motivo : `${CAT_LABEL[c.categoria] ?? c.categoria} · score ${c.salud.score} · #${c.canal}`}
                    </span>
                    <span className="right"><Icon name="arrow" size={13} /></span>
                  </Link>
                ))
              )}
            </Card>

            <Card
              title="Caída fuerte de actividad"
              sub={`${caida.length} con tendencia ≤ −30%`}
              flush
              foot="Señal de desenganche antes del silencio total."
            >
              {caida.length === 0 ? (
                <div className="empty">Nadie en caída fuerte.</div>
              ) : (
                caida
                  .sort((a, b) => (a.engagement.tendencia ?? 0) - (b.engagement.tendencia ?? 0))
                  .map((c) => (
                    <Link key={c.id} to={`/fulfillment/clientes/${c.id}`} className="lista-item">
                      <Pill tone={SEMAFORO[c.salud.semaforo].tone} dot>
                        {c.engagement.tendencia}%
                      </Pill>
                      <span className="who">{c.nombre}</span>
                      <span className="q">
                        {c.engagement.mensajesClienteSemana}/sem · {hace(c.ultimaActividadAt)}
                      </span>
                      <span className="right"><Icon name="arrow" size={13} /></span>
                    </Link>
                  ))
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
