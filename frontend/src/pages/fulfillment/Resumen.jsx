import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Heatmap from '../../components/charts/Heatmap.jsx';
import Senales from '../../components/fulfillment/Senales.jsx';
import Card from '../../components/ui/Card.jsx';
import Icon from '../../components/ui/Icon.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../../components/ui/Loading.jsx';
import Pill from '../../components/ui/Pill.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import { getFulfillment } from '../../data/api.js';
import { formatValue, hace } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';
import { SEMAFORO } from '../../lib/scoring.js';

const HEATMAP_MAX = 12;
const ACCION_MAX = 8;

const CAT_LABEL = {
  boost: 'Boost',
  advantage: 'Advantage',
  avanzados: 'Avanzados',
  principiantes: 'Principiantes',
  mentoria: 'Mentoría',
};

const CAT_ORDER = ['boost', 'advantage', 'avanzados', 'principiantes', 'mentoria'];

/** Serie semanal alineada a `semanas`, sumando mensajes del canal. */
function serieCanal(actividad, clienteId, semanas) {
  const porSemana = new Map(
    actividad.filter((a) => a.clienteId === clienteId).map((a) => [a.semana, a]),
  );
  return semanas.map((sem) => {
    const a = porSemana.get(sem);
    return (a?.mensajesCliente ?? 0) + (a?.mensajesCoach ?? 0);
  });
}

function labelFiltro(filtro, porCategoria, nAtencion, nTodos) {
  if (filtro === 'atencion') return `Solo atención · ${nAtencion}`;
  if (filtro === 'todos') return `Toda la cartera · ${nTodos}`;
  return `${CAT_LABEL[filtro] ?? filtro} · ${porCategoria[filtro] ?? 0}`;
}

export default function FulfillmentResumen() {
  const navigate = useNavigate();
  const { data, loading, error } = useResource(getFulfillment);
  const [filtro, setFiltro] = useState('atencion');
  const [expandido, setExpandido] = useState(false);

  const porCategoria = data?.resumen?.por_categoria ?? {};

  const atencion = useMemo(() => {
    if (!data) return [];
    return data.activos
      .filter((c) => c.salud.semaforo !== 'verde')
      .sort((a, b) => a.salud.score - b.salud.score);
  }, [data]);

  const tabs = useMemo(() => {
    const cats = CAT_ORDER
      .filter((c) => (porCategoria[c] ?? 0) > 0)
      .map((c) => ({ id: c, label: CAT_LABEL[c] ?? c, n: porCategoria[c] }));
    return [
      { id: 'atencion', label: 'Atención', n: atencion.length },
      ...cats,
      { id: 'todos', label: 'Todos', n: data?.activos?.length ?? 0 },
    ];
  }, [atencion.length, data?.activos?.length, porCategoria]);

  const poolHeatmap = useMemo(() => {
    if (!data) return [];
    let pool;
    if (filtro === 'atencion') {
      pool = atencion;
    } else if (filtro === 'todos') {
      pool = [...data.activos].sort((a, b) => a.salud.score - b.salud.score);
    } else {
      pool = data.activos
        .filter((c) => c.categoria === filtro)
        .sort((a, b) => a.salud.score - b.salud.score);
    }
    return pool.map((c) => ({
      id: c.id,
      label: c.nombre,
      sub: SEMAFORO[c.salud.semaforo].label,
      tono: SEMAFORO[c.salud.semaforo].color,
      valores: serieCanal(data.actividad, c.id, data.semanas),
    }));
  }, [atencion, data, filtro]);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const k = (grupo, id) => data?.kpis?.[grupo]?.find((x) => x.id === id);

  const titulares = data
    ? [
        {
          id: 'canales_activos',
          label: 'Canales de cliente',
          value: data.activos.length,
          format: 'count',
          previous: null,
          sourceId: 'discord_transcripts',
          updatedAt: data.syncAt,
          nota: [
            porCategoria.boost != null ? `${porCategoria.boost} Boost` : null,
            porCategoria.advantage != null ? `${porCategoria.advantage} Advantage` : null,
            porCategoria.avanzados != null ? `${porCategoria.avanzados} Avanzados` : null,
            porCategoria.principiantes != null ? `${porCategoria.principiantes} Principiantes` : null,
            porCategoria.mentoria != null ? `${porCategoria.mentoria} Mentoría` : null,
            `${formatValue(data.resumen?.mensajes ?? 0, 'count')} msgs`,
          ].filter(Boolean).join(' · '),
        },
        k('engagement', 'score_verde'),
        k('engagement', 'silencio_7d'),
        k('engagement', 'mensajes_semana'),
      ].filter(Boolean)
    : [];

  const filasVisibles = expandido ? poolHeatmap : poolHeatmap.slice(0, HEATMAP_MAX);
  const hayMas = poolHeatmap.length > HEATMAP_MAX;
  const msgsPulso = filasVisibles.reduce((s, f) => s + f.valores.reduce((a, b) => a + b, 0), 0);
  const parcial = Boolean(data?.resumen?.parcial);
  const accionVisible = atencion.slice(0, ACCION_MAX);

  const elegirFiltro = (id) => {
    setFiltro(id);
    setExpandido(false);
  };

  return (
    <div className="page">
      {loading || !data ? (
        <>
          <SkeletonKpis n={6} />
          <SkeletonBlock height={360} />
        </>
      ) : (
        <>
          {parcial && (
            <Card
              title="Transcripts parciales"
              sub="La copia local no tiene el histórico completo del server"
              foot="Para ponerlos al día: en atv-clients corré el bot (Actualizar Discord) o traé /opt/atv-clients/transcripts al path local."
            >
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
                Último mensaje leído: {data.syncAt ? hace(data.syncAt) : '—'}.
                {' '}Completos: {data.resumen?.canales_completos ?? 0} de {data.activos.length}.
                El score y el pulso usan lo que hay; puede faltar actividad reciente.
              </div>
            </Card>
          )}

          <div className="kpi-grid">
            {titulares.map((m) => (
              <KpiCard key={m.id} metric={m} spark={false} />
            ))}
          </div>

          <Card
            title="Semáforo"
              sub="Ritmo y silencio del canal"
            foot={(data.revision ?? []).join(' ')}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, maxWidth: 420 }}>
              {['verde', 'amarillo', 'rojo'].map((s) => (
                <button
                  key={s}
                  type="button"
                  className="resumen-semaforo-btn"
                  onClick={() => elegirFiltro(s === 'verde' ? 'todos' : 'atencion')}
                  style={{ borderTop: `2px solid ${SEMAFORO[s].color}` }}
                >
                  <div className="num" style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>
                    {data.semaforoTotales[s]}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{SEMAFORO[s].label}</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>
              Sync {hace(data.syncAt)}. Mix/NRR no están acá a propósito.
            </div>
          </Card>

          <Card
            title="Pulso de la cartera"
            sub={`${labelFiltro(filtro, porCategoria, atencion.length, data.activos.length)} · ${data.semanas.length} semanas · ${msgsPulso} msgs en vista`}
            actions={<SourceTag sourceId="discord_transcripts" updatedAt={data.syncAt} conNombre={false} />}
            foot="Por defecto solo atención (máx. 12 filas). Click en una fila → ficha. Tabs: Boost / Advantage / Avanzados / Principiantes."
          >
            <div className="tabs" role="tablist" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={filtro === t.id}
                  className={`tab${filtro === t.id ? ' active' : ''}`}
                  onClick={() => elegirFiltro(t.id)}
                >
                  {t.label} {t.n}
                </button>
              ))}
            </div>

            {filasVisibles.length === 0 ? (
              <div className="empty">
                {filtro === 'atencion'
                  ? 'Nadie fuera de verde. Cambiá a un canal o a Todos.'
                  : 'Sin clientes en este filtro.'}
              </div>
            ) : (
              <>
                <div className="heatmap-scroll">
                  <Heatmap
                    filas={filasVisibles}
                    columnas={data.semanas}
                    onClickFila={(id) => navigate(`/fulfillment/clientes/${id}`)}
                    unidad="msgs"
                  />
                </div>
                {hayMas && (
                  <div className="resumen-mas">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setExpandido((v) => !v)}
                    >
                      {expandido
                        ? 'Mostrar menos'
                        : `Mostrar ${poolHeatmap.length - HEATMAP_MAX} más`}
                    </button>
                    <Link to="/fulfillment/engagement" className="dim" style={{ fontSize: 12.5 }}>
                      Vista completa en Engagement →
                    </Link>
                  </div>
                )}
              </>
            )}
          </Card>

          <div className="split">
            <Card
              title="Requieren acción hoy"
              sub={`${atencion.length} fuera de verde · top ${Math.min(ACCION_MAX, atencion.length) || 0}`}
              flush
              foot={
                atencion.length > ACCION_MAX
                  ? `Hay ${atencion.length - ACCION_MAX} más en Clientes.`
                  : 'Ordenados por score (peor primero).'
              }
            >
              {accionVisible.length === 0 ? (
                <div className="empty">Toda la cartera en verde.</div>
              ) : (
                <>
                  {accionVisible.map((c) => (
                    <Link key={c.id} to={`/fulfillment/clientes/${c.id}`} className="lista-item">
                      <Pill tone={SEMAFORO[c.salud.semaforo].tone} dot>
                        {c.salud.score}
                      </Pill>
                      <span className="who">{c.nombre}</span>
                      <span className="q">{c.salud.alertas[0] ?? 'Score por debajo del corte'}</span>
                      <span className="right">
                        <span className="dim" style={{ fontSize: 12 }}>
                          {CAT_LABEL[c.categoria] ?? c.categoria ?? '—'}
                        </span>
                        <Icon name="arrow" size={13} />
                      </span>
                    </Link>
                  ))}
                  {atencion.length > ACCION_MAX && (
                    <Link to="/fulfillment/clientes" className="lista-item resumen-ver-todos">
                      <span className="who">Ver todos los clientes</span>
                      <span className="right"><Icon name="arrow" size={13} /></span>
                    </Link>
                  )}
                </>
              )}
            </Card>

            <Senales
              senales={[...data.senales].sort((a, b) => new Date(b.fechaAt) - new Date(a.fechaAt)).slice(0, 6)}
              titulo="Silencio ≥ 7 días"
              nombrePorCliente={(id) => data.clientes.find((c) => c.id === id)?.nombre ?? id}
            />
          </div>
        </>
      )}
    </div>
  );
}
