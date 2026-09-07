import { Link, useParams } from 'react-router-dom';
import LineArea from '../../components/charts/LineArea.jsx';
import StackedBar from '../../components/charts/StackedBar.jsx';
import PanelScore from '../../components/fulfillment/PanelScore.jsx';
import Senales from '../../components/fulfillment/Senales.jsx';
import Card from '../../components/ui/Card.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import Pill from '../../components/ui/Pill.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import { getFulfillmentCliente } from '../../data/api.js';
import { ahora, diasEntre, formatFecha, formatValue, hace } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';
import { VENTANA_ACTIVACION } from '../../lib/scoring.js';

const CAT_LABEL = {
  boost: 'Boost',
  advantage: 'Advantage',
  avanzados: 'Avanzados',
  principiantes: 'Principiantes',
  mentoria: 'Mentoría',
};

export default function ClienteDetalle() {
  const { clienteId } = useParams();
  const { data, loading, error } = useResource(() => getFulfillmentCliente(clienteId), [clienteId]);

  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (loading || !data) return <div className="page"><SkeletonBlock height={480} /></div>;

  const { cliente, actividad, senales, blocker, semaforo, coach } = data;
  const { activacion, engagement, expansion } = cliente;
  const diasDesdeEntrada = diasEntre(cliente.entradaAt, ahora().toISOString());
  const cat = CAT_LABEL[cliente.categoria] ?? cliente.categoria ?? 'Cliente';

  const actTone = activacion.activado
    ? (activacion.diasHastaResultado ?? 0) <= VENTANA_ACTIVACION
      ? 'ok'
      : 'warn'
    : 'alert';
  const actLabel = activacion.activado
    ? `Win día ${activacion.diasHastaResultado}`
    : diasDesdeEntrada <= VENTANA_ACTIVACION
      ? `Día ${diasDesdeEntrada}/${VENTANA_ACTIVACION}`
      : 'Sin activar';

  const alertas = [];
  if (cliente.churnIntent?.detectado) {
    alertas.push({
      id: 'churn',
      tone: 'alert',
      titulo: 'Intención de baja / reembolso',
      texto: cliente.churnIntent.extracto,
      meta: formatFecha(cliente.churnIntent.fechaAt),
    });
  }
  if (!activacion.activado && blocker) {
    alertas.push({
      id: 'blocker',
      tone: 'alert',
      titulo: blocker.label,
      texto: blocker.descripcion,
      meta: blocker.accion ? `Acción · ${blocker.accion}` : null,
    });
  }
  if (expansion?.candidatoUpsell) {
    alertas.push({
      id: 'upsell',
      tone: 'ok',
      titulo: 'Candidato a upsell',
      texto: 'El canal menciona techo, siguiente nivel o más acompañamiento.',
      meta: null,
    });
  }

  const metricas = [
    {
      k: 'Score',
      v: cliente.salud.score,
      tono: semaforo.color,
      sub: semaforo.label,
    },
    {
      k: 'Activación',
      v: actLabel,
      tono: actTone === 'ok' ? 'var(--ok)' : actTone === 'warn' ? 'var(--warn)' : 'var(--brand-hi)',
      sub: activacion.activado
        ? formatFecha(activacion.primerResultadoAt)
        : `entrada ${formatFecha(cliente.entradaAt)}`,
    },
    {
      k: 'Silencio',
      v: `${engagement.diasSinMensaje}d`,
      tono: engagement.diasSinMensaje >= 7 ? 'var(--brand-hi)' : undefined,
      sub: hace(cliente.ultimaActividadAt),
    },
    {
      k: 'Msg / sem',
      v: formatValue(engagement.mensajesClienteSemana ?? 0, 'ratio'),
      sub: `coach ${formatValue(engagement.mensajesCoachSemana ?? 0, 'ratio')}`,
    },
    {
      k: 'Tendencia',
      v: `${engagement.tendencia >= 0 ? '+' : ''}${engagement.tendencia}%`,
      tono:
        engagement.tendencia >= 20
          ? 'var(--ok)'
          : engagement.tendencia <= -30
            ? 'var(--brand-hi)'
            : undefined,
      sub: `${formatValue(cliente.mensajes ?? 0, 'count')} msgs`,
    },
  ];

  return (
    <div className="page ficha-cliente">
      <div className="ficha-nav">
        <Link to="/fulfillment/clientes" className="ficha-back">
          <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}>
            <Icon name="arrow" size={13} />
          </span>
          Clientes
        </Link>
        <SourceTag sourceId="discord_transcripts" updatedAt={cliente.ultimaActividadAt} />
      </div>

      <header className="ficha-head">
        <div className="ficha-head-main">
          <div className="eyebrow">
            {cat}
            {cliente.canal ? ` · #${cliente.canal}` : ''}
            {coach?.nombre ? ` · ${coach.nombre}` : ''}
          </div>
          <h1>{cliente.nombre}</h1>
          <p>
            Entrada {formatFecha(cliente.entradaAt)} · hace {diasDesdeEntrada} días · último mensaje{' '}
            {hace(cliente.ultimaActividadAt)}
          </p>
        </div>
        <Pill tone={semaforo.tone} dot>
          {semaforo.label}
        </Pill>
      </header>

      <div className="ficha-metricas">
        {metricas.map((m) => (
          <div key={m.k} className="ficha-metrica">
            <div className="eyebrow">{m.k}</div>
            <div className="num ficha-metrica-v" style={{ color: m.tono }}>{m.v}</div>
            {m.sub && <div className="ficha-metrica-sub">{m.sub}</div>}
          </div>
        ))}
      </div>

      {alertas.length > 0 && (
        <div className="ficha-alertas">
          {alertas.map((a) => (
            <div key={a.id} className={`ficha-alerta ficha-alerta-${a.tone}`}>
              <div className="ficha-alerta-top">
                <Pill tone={a.tone} dot>{a.titulo}</Pill>
                {a.meta && <span className="dim">{a.meta}</span>}
              </div>
              <p>{a.texto}</p>
            </div>
          ))}
        </div>
      )}

      <div className="split ficha-body">
        <div className="ficha-col">
          {activacion.activado && (
            <Card title="Primer resultado" sub={`Detectado el ${formatFecha(activacion.primerResultadoAt)}`}>
              <blockquote className="ficha-quote">{activacion.descripcion}</blockquote>
            </Card>
          )}

          <Card
            title="Actividad del canal"
            sub="Últimas 12 semanas"
            foot={
              <div className="legend">
                <span className="k"><i style={{ background: 'var(--s1)' }} /> Cliente</span>
                <span className="k"><i style={{ background: 'var(--s4)' }} /> Coach</span>
              </div>
            }
          >
            <LineArea
              data={actividad}
              x={(a) => a.semana}
              format="ratio"
              height={200}
              series={[
                { key: (a) => a.mensajesCliente, label: 'Cliente', color: 'var(--s1)' },
                { key: (a) => a.mensajesCoach, label: 'Coach', color: 'var(--s4)' },
              ]}
            />

            <div className="ficha-mix">
              <div className="eyebrow" style={{ marginBottom: 10 }}>Mix léxico</div>
              {engagement.mixPendiente ? (
                <div className="empty">Pocos mensajes etiquetables todavía.</div>
              ) : (
                <StackedBar
                  partes={[
                    { label: 'Implementación', valor: engagement.mix.implementacion, color: 'var(--ok)' },
                    { label: 'Soporte', valor: engagement.mix.soporte, color: 'var(--s4)' },
                    { label: 'Celebración', valor: engagement.mix.celebracion, color: 'var(--s3)' },
                    { label: 'Queja', valor: engagement.mix.queja, color: 'var(--brand)' },
                  ]}
                />
              )}
            </div>
          </Card>

          {senales.length > 0 && (
            <Senales senales={senales} titulo="Señales del canal" />
          )}
        </div>

        <div className="ficha-col">
          <PanelScore salud={cliente.salud} compact />
        </div>
      </div>
    </div>
  );
}
