import { Link, useParams } from 'react-router-dom';
import LineArea from '../../components/charts/LineArea.jsx';
import StackedBar from '../../components/charts/StackedBar.jsx';
import PanelScore from '../../components/fulfillment/PanelScore.jsx';
import Senales from '../../components/fulfillment/Senales.jsx';
import Card from '../../components/ui/Card.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Pill from '../../components/ui/Pill.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import { getFulfillmentCliente } from '../../data/api.js';
import { ahora, diasEntre, formatFecha, formatValue, hace } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';
import { VENTANA_ACTIVACION } from '../../lib/scoring.js';

const TIER = { starter: 'Starter', growth: 'Growth', scale: 'Scale' };

/** Bloque de dato suelto, para la ficha. */
function Dato({ k, v, tono }) {
  return (
    <div>
      <div className="eyebrow">{k}</div>
      <div className="num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 3, color: tono }}>
        {v}
      </div>
    </div>
  );
}

export default function ClienteDetalle() {
  const { clienteId } = useParams();
  const { data, loading, error } = useResource(() => getFulfillmentCliente(clienteId), [clienteId]);

  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (loading || !data) return <div className="page"><SkeletonBlock height={480} /></div>;

  const { cliente, actividad, senales, blocker, semaforo } = data;
  const { activacion, engagement, outcome, expansion } = cliente;
  const diasDesdeEntrada = diasEntre(cliente.entradaAt, ahora().toISOString());
  const multiplo = outcome.revenueInicialUsd ? outcome.revenueActualUsd / outcome.revenueInicialUsd : 1;

  return (
    <div className="page">
      <Link to="/fulfillment/clientes" className="source-tag" style={{ gap: 6 }}>
        <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}>
          <Icon name="arrow" size={13} />
        </span>
        Volver a clientes
      </Link>

      <PageHeader
        eyebrow={`${cliente.categoria ?? 'Cliente'} · ${TIER[cliente.tier] ?? '—'} · canal #${cliente.canal ?? cliente.id}`}
        title={cliente.nombre}
        desc={`Primer mensaje el ${formatFecha(cliente.entradaAt)}, hace ${diasDesdeEntrada} días. Último mensaje ${hace(cliente.ultimaActividadAt)}.`}
        actions={
          <>
            <Pill tone={semaforo.tone} dot>
              {semaforo.label}
            </Pill>
            <SourceTag sourceId="discord_transcripts" />
          </>
        }
      />

      <div className="split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Card
            title="Activación"
            sub={`La promesa: primer resultado tangible antes del día ${VENTANA_ACTIVACION}`}
            actions={
              <Pill tone={activacion.activado ? (activacion.diasHastaResultado <= VENTANA_ACTIVACION ? 'ok' : 'warn') : 'alert'} dot>
                {activacion.activado ? `día ${activacion.diasHastaResultado}` : 'sin activar'}
              </Pill>
            }
            foot={
              activacion.activado
                ? `Detectado automáticamente en el canal el ${formatFecha(activacion.primerResultadoAt)} (mensaje ${activacion.evidenciaMensajeId}).`
                : 'El clasificador todavía no encontró un primer resultado en este canal.'
            }
          >
            {activacion.activado ? (
              <blockquote style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{activacion.descripcion}</blockquote>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  Van {diasDesdeEntrada} días sin un resultado tangible.
                </div>
                {blocker && (
                  <>
                    <div>
                      <Pill tone="alert">{blocker.label}</Pill>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>{blocker.descripcion}</div>
                    <div className="fuente-paso">Acción · {blocker.accion}</div>
                  </>
                )}
              </div>
            )}
          </Card>

          <Card
            title="Conversación del canal"
            sub="Mensajes por semana · últimas 12 semanas"
            foot={
              <div className="legend">
                <span className="k">
                  <i style={{ background: 'var(--s1)' }} /> Cliente
                </span>
                <span className="k">
                  <i style={{ background: 'var(--s4)' }} /> Coach
                </span>
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

            <div style={{ marginTop: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                De qué habla
              </div>
              {engagement.mixPendiente || !(engagement.mix?.implementacion || engagement.mix?.soporte || engagement.mix?.queja || engagement.mix?.celebracion) ? (
                <div className="empty">Mix pendiente del clasificador.</div>
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

          <Card title="Outcome del cliente" sub="Lo que cierra el ciclo: ¿está creciendo?">
            {!outcome.revenueInicialUsd ? (
              <div className="empty">Facturación pendiente de payments / CRM. Discord no alcanza para este número.</div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--space-5)' }}>
                  <Dato
                    k="Facturación"
                    v={`${formatValue(outcome.revenueActualUsd, 'usd')}`}
                    tono={multiplo >= 1.2 ? 'var(--ok)' : undefined}
                  />
                  <Dato k="Al entrar" v={formatValue(outcome.revenueInicialUsd, 'usd')} />
                  <Dato k="Múltiplo" v={`${multiplo.toFixed(2)}×`} tono={multiplo >= 1.5 ? 'var(--ok)' : 'var(--warn)'} />
                  <Dato
                    k="Audiencia"
                    v={`${(outcome.audienciaActual / 1000).toFixed(1)}k`}
                    tono={outcome.audienciaActual > outcome.audienciaInicial ? 'var(--ok)' : undefined}
                  />
                </div>
                {outcome.ultimoHito && (
                  <div style={{ marginTop: 18, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
                    Último hito · {outcome.ultimoHito}{' '}
                    <span style={{ color: 'var(--text-3)' }}>({formatFecha(outcome.ultimoHitoAt)})</span>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <PanelScore salud={cliente.salud} />

          <Card title="Expansión" sub="El revenue más barato: no tiene CAC">
            {!expansion.upsells && cliente.tier === expansion.tierInicial ? (
              <div className="empty">Sin upsells ni cambios de tier (falta CRM / payments).</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
                <Dato k="Tier hoy" v={TIER[cliente.tier]} />
                <Dato k="Tier de entrada" v={TIER[expansion.tierInicial]} />
                <Dato k="Upsells" v={expansion.upsells} />
                <Dato
                  k="Expansión"
                  v={formatValue(expansion.revenueExpansionUsd, 'usd')}
                  tono={expansion.revenueExpansionUsd > 0 ? 'var(--ok)' : undefined}
                />
              </div>
            )}
            {expansion.candidatoUpsell && (
              <div className="fuente-paso" style={{ marginTop: 16 }}>
                Candidato a upsell · el canal muestra señales de techo de capacidad. Es una conversación pendiente.
              </div>
            )}
          </Card>

          <Card title="Ritmo" sub="Números crudos del canal">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
              <Dato k="Mensajes / semana" v={engagement.mensajesClienteSemana} />
              <Dato k="Interacciones" v={engagement.interaccionesSemana} />
              <Dato
                k="Días sin escribir"
                v={engagement.diasSinMensaje}
                tono={engagement.diasSinMensaje >= 7 ? 'var(--brand-hi)' : undefined}
              />
            </div>
          </Card>
        </div>
      </div>

      <Senales senales={senales} titulo={`Señales del canal de ${cliente.nombre}`} />
    </div>
  );
}
