import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Senales from '../../components/fulfillment/Senales.jsx';
import Card from '../../components/ui/Card.jsx';
import Icon from '../../components/ui/Icon.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../../components/ui/Loading.jsx';
import Pill from '../../components/ui/Pill.jsx';
import { getFulfillment } from '../../data/api.js';
import { formatFecha, formatValue, hace } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';
import { SEMAFORO } from '../../lib/scoring.js';

const LISTA_MAX = 12;

const CAT_LABEL = {
  boost: 'Boost',
  advantage: 'Advantage',
  avanzados: 'Avanzados',
  principiantes: 'Principiantes',
  mentoria: 'Mentoría',
};

const CAT_ORDER = ['boost', 'advantage', 'avanzados', 'principiantes', 'mentoria'];

function labelFiltro(filtro, porCategoria, nAtencion, nTodos) {
  if (filtro === 'atencion') return `Solo atención · ${nAtencion}`;
  if (filtro === 'todos') return `Toda la cartera · ${nTodos}`;
  return `${CAT_LABEL[filtro] ?? filtro} · ${porCategoria[filtro] ?? 0}`;
}

/** Salud 0–100 → % riesgo (100 = peor). */
function pctRiesgo(score) {
  return Math.max(0, Math.min(100, Math.round(100 - (score ?? 0))));
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

  const ranking = useMemo(() => {
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
      nombre: c.nombre,
      score: c.salud.score,
      riesgo: pctRiesgo(c.salud.score),
      semaforo: c.salud.semaforo,
      categoria: c.categoria,
      alerta: c.salud.alertas?.[0] ?? null,
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
          detalle: {
            titulo: 'Un canal de Discord en boost / advantage / mentoría = un cliente.',
            items: [...data.activos]
              .sort((a, b) => (b.ultimaActividadAt ?? '').localeCompare(a.ultimaActividadAt ?? ''))
              .map((c) => ({
                id: c.id,
                nombre: c.nombre,
                canalId: c.canalId,
                categoria: c.categoria,
                valor: `${c.mensajes ?? 0} msgs`,
                tono: 'plain',
              })),
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
          ]
            .filter(Boolean)
            .join(' · '),
        },
        k('engagement', 'score_verde'),
        k('engagement', 'silencio_7d'),
        k('engagement', 'mensajes_semana'),
        data.conFicha?.length
          ? {
              id: 'por_fase',
              label: 'En implementación',
              value: data.fases.find((f) => f.id === 'implementacion')?.clientes.length ?? 0,
              format: 'count',
              previous: null,
              sourceId: 'discord_transcripts',
              updatedAt: data.syncAt,
              detalle: {
                titulo: 'Fase de cada cliente según la ficha viva de Claude.',
                items: data.fases.flatMap((f) =>
                  f.clientes.map((c) => ({
                    id: c.id,
                    nombre: c.nombre,
                    canalId: c.canalId,
                    categoria: c.categoria,
                    valor: f.label,
                    tono: f.id === 'en_riesgo' ? 'alert' : f.id === 'estancado' ? 'warn' : 'plain',
                  })),
                ),
              },
              nota:
                data.fases
                  .filter((f) => f.clientes.length)
                  .map((f) => `${f.clientes.length} ${f.label}`)
                  .join(' · ') + (data.sinFase?.length ? ` · ${data.sinFase.length} sin ficha` : ''),
            }
          : null,
      ].filter(Boolean)
    : [];

  const visibles = expandido ? ranking : ranking.slice(0, LISTA_MAX);
  const hayMas = ranking.length > LISTA_MAX;
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
            sub="Solo lo que requiere acción · click filtra el ranking"
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

          {(data.churnIntent?.length ?? 0) > 0 && (
            <Card
              title="Intención de baja / reembolso"
              sub={`${data.churnIntent.length} canales con frase detectada`}
              flush
              foot={
                data.conFicha?.length
                  ? 'Frase textual detectada por Claude en la ficha viva.'
                  : 'Heurística léxica sobre mensajes recientes del cliente.'
              }
            >
              {data.churnIntent.map((c) => (
                <Link key={c.id} to={`/fulfillment/clientes/${c.id}`} className="lista-item">
                  <Pill tone="alert" dot>urgente</Pill>
                  <span className="who">{c.nombre}</span>
                  <span className="q">{c.churnIntent?.extracto}</span>
                  <span className="right">
                    <span className="dim" style={{ fontSize: 12 }}>
                      {formatFecha(c.churnIntent?.fechaAt)}
                    </span>
                    <Icon name="arrow" size={13} />
                  </span>
                </Link>
              ))}
            </Card>
          )}

          <Senales
            compacto
            max={5}
            senales={data.senales ?? []}
            nombrePorCliente={(id) => data.activos.find((c) => c.id === id)?.nombre ?? id}
          />

          <Card
            title="Ranking de riesgo"
            sub={labelFiltro(filtro, porCategoria, atencion.length, data.activos.length)}
            flush
            foot="% riesgo = 100 − score de salud. Peor primero. Click → ficha."
          >
            <div className="tabs" role="tablist" style={{ margin: '0 14px 10px', flexWrap: 'wrap' }}>
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

            {visibles.length === 0 ? (
              <div className="empty" style={{ margin: '0 14px 14px' }}>
                {filtro === 'atencion'
                  ? 'Nadie fuera de verde. Cambiá a un canal o a Todos.'
                  : 'Sin clientes en este filtro.'}
              </div>
            ) : (
              <>
                {visibles.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    className="lista-item resumen-rank-item"
                    onClick={() => navigate(`/fulfillment/clientes/${c.id}`)}
                  >
                    <span className="num dim resumen-rank-n">{i + 1}</span>
                    <span className="who">{c.nombre}</span>
                    <span className="q dim">{c.alerta || SEMAFORO[c.semaforo]?.label}</span>
                    <span className="right">
                      <Pill tone={SEMAFORO[c.semaforo]?.tone ?? 'plain'} dot>
                        {c.riesgo}%
                      </Pill>
                    </span>
                  </button>
                ))}
                {hayMas && (
                  <div className="resumen-mas" style={{ padding: '10px 14px 14px' }}>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setExpandido((v) => !v)}
                    >
                      {expandido
                        ? 'Mostrar menos'
                        : `Mostrar ${ranking.length - LISTA_MAX} más`}
                    </button>
                    <Link to="/fulfillment/clientes" className="dim" style={{ fontSize: 12.5 }}>
                      Ver todos en Clientes →
                    </Link>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
