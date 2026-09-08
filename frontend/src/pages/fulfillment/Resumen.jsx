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
import { useMes } from '../../lib/MesContext.jsx';
import { ventanaMes } from '../../lib/semanas.js';
import { formatMes } from '../../lib/format.js';
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
  const { mes } = useMes();
  const ventana = useMemo(() => ventanaMes(data?.semanas ?? [], mes), [data, mes]);
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
      valores: serieCanal(data.actividad, c.id, ventana.columnas),
    }));
  }, [atencion, data, filtro, ventana]);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const k = (grupo, id) => data?.kpis?.[grupo]?.find((x) => x.id === id);

  const titulares = data
    ? [
        {
          id: 'canales_activos',
          label: 'Canales de cliente',
          value: data.activos.length,
          detalle: {
            titulo: 'Un canal de Discord en boost / advantage / mentoría = un cliente.',
            items: [...data.activos]
              .sort((a, b) => (b.ultimaActividadAt ?? '').localeCompare(a.ultimaActividadAt ?? ''))
              .map((c) => ({ id: c.id, nombre: c.nombre, canalId: c.canalId, categoria: c.categoria, valor: `${c.mensajes ?? 0} msgs`, tono: 'plain' })),
          },
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
  const accionVisible = atencion.slice(0, ACCION_MAX);
  const totalCartera = data?.activos?.length ?? 0;
  const nAmarillo = data?.semaforoTotales?.amarillo ?? 0;
  const nRojo = data?.semaforoTotales?.rojo ?? 0;

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
          <div className="kpi-grid">
            {titulares.map((m) => (
              <KpiCard key={m.id} metric={m} spark={false} />
            ))}
          </div>

          <Card
            title="Semáforo"
            sub="Solo lo que requiere acción · click filtra el pulso"
            foot={(data.revision ?? []).join(' ')}
          >
            <div className="resumen-semaforo-stack">
              {[
                { id: 'amarillo', n: nAmarillo, filtro: 'atencion' },
                { id: 'rojo', n: nRojo, filtro: 'atencion' },
              ].map((s) => {
                const meta = SEMAFORO[s.id];
                const pct = totalCartera ? Math.round((s.n / totalCartera) * 100) : 0;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="resumen-semaforo-row"
                    onClick={() => elegirFiltro(s.filtro)}
                  >
                    <div className="resumen-semaforo-row-top">
                      <span className="resumen-semaforo-dot" style={{ background: meta.color }} />
                      <span className="resumen-semaforo-label">{meta.label}</span>
                      <span className="num resumen-semaforo-n">{s.n}</span>
                      <span className="dim resumen-semaforo-pct">{pct}%</span>
                    </div>
                    <div className="resumen-semaforo-track">
                      <div
                        className="resumen-semaforo-fill"
                        style={{ width: `${pct}%`, background: meta.color }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>
              Sync {hace(data.syncAt)} · {totalCartera} canales
            </div>
          </Card>

          <Card
            title="Pulso de la cartera"
            sub={`${labelFiltro(filtro, porCategoria, atencion.length, data.activos.length)} · ${formatMes(mes)} (${ventana.resaltadas.size} semanas) + ${ventana.columnas.length - ventana.resaltadas.size} previas · ${msgsPulso} msgs en vista`}
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
                    columnas={ventana.columnas}
                    resaltadas={ventana.resaltadas}
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
