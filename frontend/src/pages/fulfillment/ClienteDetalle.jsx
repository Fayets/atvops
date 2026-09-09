import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import LineArea from '../../components/charts/LineArea.jsx';
import StackedBar from '../../components/charts/StackedBar.jsx';
import DatosClienteForm from '../../components/fulfillment/DatosClienteForm.jsx';
import LogEventos from '../../components/fulfillment/LogEventos.jsx';
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
import { useRol } from '../../lib/RolContext.jsx';
import { etiquetaSemana } from '../../lib/semanas.js';
import TiraDias from '../../components/fulfillment/TiraDias.jsx';
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
  const { rol } = useRol();
  const { data, loading, error } = useResource(() => getFulfillmentCliente(clienteId), [clienteId]);
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [datosLocales, setDatosLocales] = useState(null);

  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (loading || !data) return <div className="page"><SkeletonBlock height={480} /></div>;

  const { cliente, actividad, senales, blocker, semaforo, coach, eventos } = data;
  const datos = datosLocales ?? data.datos;
  const puedeEditar = ['admin', 'founder', 'csm', 'operaciones'].includes(rol);
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
        {cliente.canalId && (
          <Link to={`/fulfillment/chats/${cliente.canalId}`} className="btn">
            Abrir chat en vivo
          </Link>
        )}
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

      {cliente.ficha && (
        <Card
          title="Ficha viva"
          sub={`Claude la actualiza en cada ronda · ${hace(cliente.ficha.actualizadoAt)} · también en el cerebro`}
          actions={cliente.fase ? <span className={`fase-pill fase-${cliente.fase.id}`}>{cliente.fase.label}</span> : null}
        >
          <div className="ficha-viva">
            {cliente.fase?.motivo && <div className="dim" style={{ marginBottom: 8 }}>{cliente.fase.motivo}</div>}
            {cliente.ficha.resumen && <p className="ficha-viva-resumen">{cliente.ficha.resumen}</p>}
            <div className="ficha-viva-grid">
              {cliente.ficha.proximosPasos?.length > 0 && (
                <div>
                  <div className="eyebrow">Próximos pasos</div>
                  <ul className="ficha-viva-lista">{cliente.ficha.proximosPasos.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              )}
              <div>
                <div className="eyebrow">Riesgo</div>
                <div>
                  <Pill tone={cliente.ficha.riesgo === 'alto' ? 'alert' : cliente.ficha.riesgo === 'medio' ? 'warn' : 'ok'} dot>{cliente.ficha.riesgo ?? '—'}</Pill>
                  {cliente.ficha.riesgoMotivo && <span className="dim" style={{ marginLeft: 8 }}>{cliente.ficha.riesgoMotivo}</span>}
                </div>
                {cliente.ficha.upsell && (
                  <div style={{ marginTop: 8 }}>
                    <Pill tone="ok">candidato a upsell</Pill>
                    {cliente.ficha.upsellMotivo && <span className="dim" style={{ marginLeft: 8 }}>{cliente.ficha.upsellMotivo}</span>}
                  </div>
                )}
              </div>
              {cliente.ficha.wins?.length > 0 && (
                <div>
                  <div className="eyebrow">Resultados</div>
                  <ul className="ficha-viva-lista">
                    {cliente.ficha.wins.map((w, i) => <li key={i}><span className="dim">{w.fecha ? formatFecha(w.fecha) : '¿fecha?'} · {w.tipo}</span> «{w.descripcion}»</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card
        title="Datos del cliente"
        sub={datos ? `Objetivo, ICP y contacto · ${datos.completitud}% cargado · última edición de ${datos.actualizadoPor ?? '—'}` : 'Objetivo, ICP y contacto. Los carga el CSM; el contrato y los pagos viven en ATV Clients.'}
        actions={puedeEditar && !editandoDatos ? <button className="btn" onClick={() => setEditandoDatos(true)}>{datos ? 'Editar' : 'Cargar datos'}</button> : null}
      >
        {editandoDatos ? (
          <DatosClienteForm
            clienteId={cliente.id}
            datos={datos}
            onGuardado={(d) => { setDatosLocales(d); setEditandoDatos(false); }}
            onCerrar={() => setEditandoDatos(false)}
          />
        ) : datos ? (
          <dl className="datos-vista">
            {datos.objetivo && <div><dt>Objetivo</dt><dd>{datos.objetivo}</dd></div>}
            {datos.nicho && <div><dt>Nicho</dt><dd>{datos.nicho}</dd></div>}
            {datos.ticketPromedioUsd != null && <div><dt>Ticket promedio</dt><dd className="num">{formatValue(datos.ticketPromedioUsd, 'usd')}</dd></div>}
            {datos.stage && <div><dt>Stage</dt><dd>{datos.stage.replace('_', ' ')}</dd></div>}
            {datos.nombreCompleto && <div><dt>Nombre</dt><dd>{datos.nombreCompleto}</dd></div>}
            {datos.email && <div><dt>Email</dt><dd>{datos.email}</dd></div>}
            {datos.whatsapp && <div><dt>WhatsApp</dt><dd>{datos.whatsapp}</dd></div>}
            {(datos.pais || datos.zonaHoraria) && <div><dt>Zona</dt><dd>{[datos.pais, datos.zonaHoraria].filter(Boolean).join(' · ')}</dd></div>}
            {datos.equipo?.length > 0 && (
              <div><dt>Su equipo</dt><dd>{datos.equipo.map((m) => `${m.nombre}${m.rol ? ` (${m.rol})` : ''}`).join(' · ')}</dd></div>
            )}
            {datos.notas && <div className="datos-notas"><dt>Notas</dt><dd>{datos.notas}</dd></div>}
          </dl>
        ) : (
          <div className="empty">Sin datos cargados. {puedeEditar ? 'Tocá “Cargar datos”.' : ''}</div>
        )}
      </Card>

      <div className="split ficha-body">
        <div className="ficha-col">
          {activacion.activado && (
            <Card title="Primer resultado" sub={`Detectado el ${formatFecha(activacion.primerResultadoAt)}`}>
              <blockquote className="ficha-quote">{activacion.descripcion}</blockquote>
            </Card>
          )}

          <Card title="Últimos 30 días" sub="Qué días escribió el cliente y qué días respondió el equipo">
            <TiraDias dias={data.actividadDiaria ?? []} />
          </Card>

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
              x={(a) => etiquetaSemana(a.semana)}
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

          <Card
            title="Log de eventos"
            sub="Hechos con fecha que registró Claude en cada ronda · también en el cerebro"
            flush
          >
            <LogEventos eventos={eventos} />
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
