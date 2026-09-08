import { Link } from 'react-router-dom';
import Bars from '../../components/charts/Bars.jsx';
import Card from '../../components/ui/Card.jsx';
import Icon from '../../components/ui/Icon.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../../components/ui/Loading.jsx';
import Pill from '../../components/ui/Pill.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import { getFulfillment } from '../../data/api.js';
import { ahora, diasEntre, formatFecha, formatMes, formatValue, hace } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';
import { VENTANA_ACTIVACION } from '../../lib/scoring.js';

const CAT_LABEL = {
  boost: 'Boost',
  advantage: 'Advantage',
  avanzados: 'Avanzados',
  principiantes: 'Principiantes',
  mentoria: 'Mentoría',
};

const BLOCKER_LABEL = {
  cliente_ausente: 'ausente',
  no_implementa: 'no implementa',
  bloqueo_tecnico: 'bloqueo técnico',
  expectativa: 'expectativa',
  esperando_equipo: 'esperando al equipo',
};

export default function Activacion() {
  const { data, loading, error } = useResource(getFulfillment);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const activados = data
    ? data.activos
        .filter((c) => c.activacion.activado)
        .sort((a, b) => (a.activacion.diasHastaResultado ?? 0) - (b.activacion.diasHastaResultado ?? 0))
    : [];

  const sinActivar = data
    ? [...data.sinActivar].sort(
        (a, b) => diasEntre(b.entradaAt, ahora().toISOString()) - diasEntre(a.entradaAt, ahora().toISOString()),
      )
    : [];
  const nIa = (data?.activos ?? []).filter((c) => c.activacion?.fuente === 'claude_code').length;
  const conIa = nIa > 0;
  const modeloIa = 'haiku';

  return (
    <div className="page">
      {loading || !data ? (
        <>
          <SkeletonKpis n={3} />
          <SkeletonBlock height={300} />
        </>
      ) : (
        <>
          <div className="filtros" style={{ alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              Activación = win en el transcript (venta / cierre / cobro) · ventana {VENTANA_ACTIVACION} días
              {data.syncAt ? ` · sync ${hace(data.syncAt)}` : ''}
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <SourceTag sourceId="discord_transcripts" updatedAt={data.syncAt} />
            </div>
          </div>

          <div className="kpi-grid">
            {data.kpis.activacion.map((m) => (
              <KpiCard key={m.id} metric={m} spark={false} />
            ))}
          </div>

          <div className="split">
            <Card
              title="Días hasta el primer resultado"
              sub={`${activados.length} activados · línea = día ${VENTANA_ACTIVACION}`}
              foot={conIa ? `Analizado por Claude Code (${modeloIa}) a las 08:00 y 18:00 · ${nIa} clientes con análisis` : "Detectado con heurística sobre el texto del cliente (Claude Code todavía no corrió)."}
            >
              {activados.length === 0 ? (
                <div className="empty">Nadie con win detectado en los canales todavía.</div>
              ) : (
                <Bars
                  data={activados.slice(0, 24)}
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
              title="Cohortes"
              sub="% activados a 30 días por mes de entrada"
              foot="Entrada = primer mensaje del canal."
            >
              {data.cohortes.length === 0 ? (
                <div className="empty">Sin fechas de entrada en los transcripts.</div>
              ) : (
                <div className="cohorte-grid">
                  {data.cohortes.map((c) => {
                    const pct = c.entraron ? Math.round((c.activados30 / c.entraron) * 100) : 0;
                    return (
                      <div key={c.mes} className="cohorte">
                        <div className="mes">{formatMes(c.mes)}</div>
                        <div
                          className="pct num"
                          style={{
                            color: pct >= 80 ? 'var(--ok)' : pct >= 50 ? 'var(--warn)' : 'var(--brand-hi)',
                          }}
                        >
                          {pct}%
                        </div>
                        <div className="det">
                          {c.activados30}/{c.entraron}
                          {c.medianaDias ? ` · med ${formatValue(c.medianaDias, 'days')}` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {activados.length > 0 && (
            <Card
              title="Primeros resultados detectados"
              sub="La frase del canal donde aparece el win"
              flush
              foot="Extracción automática · puede haber falsos positivos."
            >
              {activados.slice(0, 10).map((c) => (
                <Link key={c.id} to={`/fulfillment/clientes/${c.id}`} className="lista-item">
                  <Pill
                    tone={(c.activacion.diasHastaResultado ?? 0) <= VENTANA_ACTIVACION ? 'ok' : 'warn'}
                    dot
                  >
                    día {c.activacion.diasHastaResultado}
                  </Pill>
                  <span className="who">{c.nombre}</span>
                  <span className="q">{c.activacion.descripcion}</span>
                  <span className="right">
                    <span className="dim" style={{ fontSize: 12 }}>
                      {formatFecha(c.activacion.primerResultadoAt)}
                    </span>
                    <Icon name="arrow" size={13} />
                  </span>
                </Link>
              ))}
            </Card>
          )}

          <Card
            title="Sin activar"
            sub={`${sinActivar.length} canales · reloj desde el primer mensaje`}
            flush
            foot={conIa ? "Blocker según Claude Code, en palabras del cliente cuando hay detalle." : "Blocker grueso: ausente (casi no escribe) o no implementa (pasó la ventana sin win)."}
          >
            {sinActivar.length === 0 ? (
              <div className="empty">Toda la cartera activa tiene win detectado.</div>
            ) : (
              sinActivar.map((c) => {
                const dias = diasEntre(c.entradaAt, ahora().toISOString());
                const fuera = dias > VENTANA_ACTIVACION;
                return (
                  <Link key={c.id} to={`/fulfillment/clientes/${c.id}`} className="lista-item">
                    <Pill tone={fuera ? 'alert' : 'warn'} dot>
                      día {dias}
                    </Pill>
                    <span className="who">{c.nombre}</span>
                    <span className="q">
                      {CAT_LABEL[c.categoria] ?? c.categoria} · entrada {formatFecha(c.entradaAt)}
                      {c.activacion.blocker
                        ? ` · ${BLOCKER_LABEL[c.activacion.blocker] ?? c.activacion.blocker}${c.activacion.blockerDetalle ? ` — ${c.activacion.blockerDetalle}` : ''}`
                        : fuera
                          ? ' · fuera de ventana'
                          : ' · ventana abierta'}
                    </span>
                    <span className="right">
                      <Icon name="arrow" size={13} />
                    </span>
                  </Link>
                );
              })
            )}
          </Card>
        </>
      )}
    </div>
  );
}
