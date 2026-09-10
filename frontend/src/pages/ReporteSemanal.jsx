import { useState } from 'react';
import Card from '../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import SourceTag from '../components/ui/SourceTag.jsx';
import { getReporteSemanal } from '../data/api.js';
import { formatValue } from '../lib/format.js';
import { useResource } from '../lib/hooks.js';
import { leerDecretoGuardado } from '../lib/metasMes.js';

const fecha = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
const TIPO = { reel: 'Reel', historia: 'Historia', youtube: 'YouTube' };
const ETAPA = {
  sin_abrir: 'no abrió el acceso', entro: 'entró', formulario: 'formulario listo',
  llamada_agendada: 'llamada agendada', completo: 'llamada hecha',
};
const ETAPA_TONO = { sin_abrir: 'alert', entro: 'warn', formulario: 'plain', llamada_agendada: 'plain', completo: 'ok' };

/** Diferencia contra la semana anterior, en palabras cortas. */
function Delta({ actual, previo, format = 'count', bueno = 'arriba' }) {
  const d = (actual ?? 0) - (previo ?? 0);
  if (!previo && !actual) return <span className="dim">sin datos la semana pasada</span>;
  if (d === 0) return <span className="dim">igual que la semana pasada</span>;
  const mejor = bueno === 'arriba' ? d > 0 : d < 0;
  return (
    <span style={{ color: mejor ? 'var(--ok)' : 'var(--brand-hi)' }}>
      {d > 0 ? '+' : ''}{formatValue(d, format)} vs la semana pasada
    </span>
  );
}

function Metrica({ label, valor, format = 'count', nota, tono }) {
  return (
    <article className="kpi sm">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value-row">
        <span className="kpi-value num" style={tono ? { color: tono } : undefined}>{formatValue(valor ?? 0, format)}</span>
      </div>
      <div className="kpi-nota">{nota}</div>
    </article>
  );
}

/** Meta del mes contra lo que va: cuánto falta y cuánto hay que hacer por semana. */
function FilaMeta({ label, meta, acumulado, semanaActual, semanasRestantes, format = 'count' }) {
  const falta = Math.max(0, (meta ?? 0) - (acumulado ?? 0));
  const porSemana = semanasRestantes > 0 ? Math.ceil(falta / semanasRestantes) : falta;
  const pct = meta ? Math.min(100, (acumulado / meta) * 100) : 0;
  const tono = !meta ? 'off' : pct >= 90 ? 'ok' : pct >= 60 ? 'warn' : 'alert';
  return (
    <div className="meta-fila">
      <div className="meta-nombre">
        <span className="strong">{label}</span>
        <span className="dim">esta semana {formatValue(semanaActual ?? 0, format)}</span>
      </div>
      <div className="meta-barra"><div className="meta-barra-fill" style={{ width: `${pct}%` }} /></div>
      <div className="meta-numeros">
        <span className="num">{formatValue(acumulado ?? 0, format)}</span>
        <span className="dim">de {meta ? formatValue(meta, format) : 'sin meta'}</span>
      </div>
      <div className="meta-falta">
        {!meta ? (
          <span className="dim">cargá el decreto</span>
        ) : falta === 0 ? (
          <Pill tone="ok">cumplida</Pill>
        ) : (
          <>
            <Pill tone={tono}>faltan {formatValue(falta, format)}</Pill>
            <span className="dim">
              {semanasRestantes > 0
                ? `${formatValue(porSemana, format)} por semana en las ${semanasRestantes} que quedan`
                : 'última semana del mes'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** El reporte de la semana: qué pasó en cada área y qué falta para la meta del mes. */
export default function ReporteSemanal() {
  const [semana, setSemana] = useState(null);
  const { data, loading, error } = useResource(() => getReporteSemanal(semana), [semana]);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const mover = (dir) => {
    const base = new Date(`${data?.semana?.inicio ?? new Date().toISOString().slice(0, 10)}T12:00:00`);
    base.setDate(base.getDate() + dir * 7);
    setSemana(base.toISOString().slice(0, 10));
  };

  const decreto = data ? leerDecretoGuardado(data.mes.mes) : null;
  const v = data?.ventas ?? {};
  const vp = data?.ventasPrevia ?? {};
  const vm = data?.ventasMes ?? {};
  const m = data?.marketing ?? {};
  const mp = data?.marketingPrevia ?? {};
  const mm = data?.marketingMes ?? {};
  const c = data?.cartera ?? {};
  const ob = data?.onboarding ?? {};
  const obp = data?.onboardingPrevia ?? {};

  return (
    <div className="page">
      <PageHeader
        eyebrow="OPS · Reporte semanal"
        title={data ? `Semana ${data.semana.numero} · ${fecha(data.semana.inicio)} al ${fecha(data.semana.fin)}` : 'Reporte semanal'}
        desc="Lo que hizo cada área en la semana y qué falta para llegar a la meta del mes."
        actions={
          <>
            <SourceTag sourceId="mkt_crm" updatedAt={data?.generadoAt} />
            <div className="ventas-cal-actions">
              <button className="btn sm" onClick={() => mover(-1)} aria-label="Semana anterior">‹</button>
              <button className="btn sm" onClick={() => setSemana(null)}>Esta semana</button>
              <button className="btn sm" onClick={() => mover(1)} aria-label="Semana siguiente">›</button>
            </div>
          </>
        }
      />

      {loading && !data ? (
        <>
          <SkeletonKpis n={4} />
          <SkeletonBlock height={360} />
        </>
      ) : (
        <>
          <Card
            title="Contra la meta del mes"
            sub={
              decreto
                ? `${data.mes.mes} · quedan ${data.mes.semanasRestantes} semanas de ${data.mes.semanasTotales}`
                : 'Todavía no hay decreto cargado para este mes: cargalo en Metas y acá aparece cuánto falta.'
            }
          >
            <div className="metas-semanal">
              <FilaMeta label="Conversaciones" meta={decreto?.conversaciones} acumulado={mm.conversaciones}
                semanaActual={m.conversaciones} semanasRestantes={data.mes.semanasRestantes} />
              <FilaMeta label="Llamadas agendadas" meta={decreto?.agendas} acumulado={vm.agendadas}
                semanaActual={v.agendadas} semanasRestantes={data.mes.semanasRestantes} />
              <FilaMeta label="Cierres" meta={decreto?.cierres} acumulado={vm.cierres}
                semanaActual={v.cierres} semanasRestantes={data.mes.semanasRestantes} />
              <FilaMeta label="Cash cobrado" meta={decreto?.cashMeta} acumulado={vm.cashUsd}
                semanaActual={v.cashUsd} semanasRestantes={data.mes.semanasRestantes} format="usd" />
            </div>
          </Card>

          <div className="kpi-grid">
            <Metrica label="Llamadas agendadas" valor={v.agendadas} nota={<Delta actual={v.agendadas} previo={vp.agendadas} />} />
            <Metrica label="Se presentaron" valor={v.shows} nota={v.showRate != null ? `${v.showRate}% de show` : 'sin llamadas evaluables'} />
            <Metrica
              label="Ventas"
              valor={v.cierres}
              nota={[
                v.closeRate != null ? `${v.closeRate}% de cierre` : 'sin shows esta semana',
                v.senas ? `${v.senas} con seña aparte` : null,
              ].filter(Boolean).join(' · ')}
            />
            <Metrica label="Cash cobrado" valor={v.cashUsd} format="usd"
              nota={`facturado ${formatValue(v.facturacionUsd ?? 0, 'usd')}`} />
          </div>

          <div className="kpi-grid">
            <Metrica label="Conversaciones" valor={m.conversaciones} nota={<Delta actual={m.conversaciones} previo={mp.conversaciones} />} />
            <Metrica label="Contenido publicado" valor={(m.reels ?? 0) + (m.historias ?? 0) + (m.videos ?? 0)}
              nota={`${m.reels ?? 0} reels · ${m.historias ?? 0} historias · ${m.videos ?? 0} videos`} />
            <Metrica label="Onboardings" valor={ob.total} nota={<Delta actual={ob.total} previo={obp.total} />} />
            <Metrica label="Cobrado" valor={c.cobradoUsd} format="usd" nota={`${c.cuotasPagadas ?? 0} cuotas pagadas`} />
          </div>

          <div className="split">
            <Card title="Ventas de la semana" sub={v.ventas?.length ? `${v.ventas.length} cierres` : 'Sin ventas'} flush>
              {v.ventas?.length ? (
                v.ventas.map((x, i) => (
                  <div key={i} className="lista-item">
                    <Pill tone="ok" dot>{x.programa || 'sin programa'}</Pill>
                    <span className="who">{x.cliente}</span>
                    <span className="q">
                      {formatValue(x.cashUsd, 'usd')} cobrado
                      {x.saldoUsd ? ` · debe ${formatValue(x.saldoUsd, 'usd')}` : ''} · {x.closer}
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty">No hubo cierres esta semana.</div>
              )}
            </Card>

            <Card title="Por closer" sub="Llamadas, shows y cash de la semana" flush>
              {v.porCloser?.length ? (
                v.porCloser.map((x) => (
                  <div key={x.nombre} className="lista-item">
                    <Pill tone={x.cierres ? 'ok' : 'plain'} dot>{x.cierres} {x.cierres === 1 ? 'venta' : 'ventas'}</Pill>
                    <span className="who">{x.nombre}</span>
                    <span className="q">{x.agendadas} agendadas · {x.shows} shows · {formatValue(x.cashUsd, 'usd')}</span>
                  </div>
                ))
              ) : (
                <div className="empty">Sin llamadas asignadas.</div>
              )}
            </Card>
          </div>

          <Card
            title="Onboardings de la semana"
            sub={
              ob.total
                ? `${ob.conFormulario} completaron el formulario · ${ob.conLlamadaHecha} ya hicieron la llamada · ${ob.conDiscord} con canal de Discord`
                : 'Nadie arrancó el onboarding esta semana'
            }
            flush
            foot={
              ob.medianaFormularioDias != null
                ? `Del acceso al formulario tardan ${ob.medianaFormularioDias} días; hasta la llamada, ${ob.medianaLlamadaDias ?? '—'}.`
                : undefined
            }
          >
            {ob.sesiones?.length ? (
              ob.sesiones.map((s) => (
                <div key={s.id} className="lista-item">
                  <Pill tone={ETAPA_TONO[s.etapa] ?? 'plain'} dot>{ETAPA[s.etapa] ?? s.etapa}</Pill>
                  <span className="who">{s.cliente}</span>
                  <span className="q">
                    {s.plan}
                    {s.diasHastaFormulario != null ? ` · formulario en ${s.diasHastaFormulario} d` : ''}
                    {s.discord ? ' · con Discord' : ' · sin canal'}
                  </span>
                </div>
              ))
            ) : (
              <div className="empty">Ningún onboarding nuevo esta semana.</div>
            )}
          </Card>

          <div className="split">
            <Card
              title="Contenido de la semana"
              sub={`${m.reproducciones ?? 0} reproducciones · ${m.chatsHistorias ?? 0} chats de historias`}
              flush
              foot="De acá salen las conversaciones: el contenido es el techo del embudo."
            >
              {m.publicaciones?.length ? (
                m.publicaciones.map((p, i) => (
                  <div key={i} className="lista-item">
                    <Pill tone="plain" dot>{TIPO[p.tipo] ?? p.tipo}</Pill>
                    <span className="who">
                      {p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.titulo}</a> : p.titulo}
                    </span>
                    <span className="q">{formatValue(p.metrica, 'count')} {p.metricaLabel}</span>
                  </div>
                ))
              ) : (
                <div className="empty">No se publicó contenido esta semana.</div>
              )}
            </Card>

            <Card title="Setting por persona" sub="Lo que cada setter reportó en la semana" flush>
              {m.porSetter?.length ? (
                m.porSetter.map((s) => (
                  <div key={s.nombre} className="lista-item">
                    <Pill tone={s.diasReportados >= 5 ? 'ok' : 'warn'} dot>{s.diasReportados} días</Pill>
                    <span className="who">{s.nombre}</span>
                    <span className="q">{s.conversaciones} conversaciones · {s.linksEnviados} links · {s.agendas} agendas</span>
                  </div>
                ))
              ) : (
                <div className="empty">Nadie cargó su reporte esta semana.</div>
              )}
            </Card>
          </div>

          <Card
            title="Ads"
            sub={`Inversión del mes ${data.mes.mes} · Meta reporta por período mensual`}
            foot={`${data.ads.campanias} campañas con actividad en el mes.`}
          >
            <div className="kpi-grid">
              <Metrica label="Inversión" valor={data.ads.gastoUsd} format="usd" nota="del mes" />
              <Metrica label="Conversiones" valor={data.ads.conversiones} nota="reportadas por Meta" />
              <Metrica label="Costo por conversión" valor={data.ads.conversiones ? data.ads.gastoUsd / data.ads.conversiones : 0}
                format="usd" nota="inversión sobre conversiones" />
              <Metrica label="Clicks" valor={data.ads.clicks} nota={`${formatValue(data.ads.impresiones, 'count')} impresiones`} />
            </div>
          </Card>

          {(c.altasDetalle?.length > 0 || c.bajasDetalle?.length > 0) && (
            <div className="split">
              <Card title="Entraron esta semana" sub={`${c.altas} clientes nuevos`} flush>
                {c.altasDetalle.map((x, i) => (
                  <div key={i} className="lista-item">
                    <Pill tone="ok" dot>{x.plan || 'sin plan'}</Pill>
                    <span className="who">{x.cliente}</span>
                  </div>
                ))}
              </Card>
              <Card title="Se dieron de baja" sub={`${c.bajas} bajas`} flush>
                {c.bajasDetalle.length ? (
                  c.bajasDetalle.map((x, i) => (
                    <div key={i} className="lista-item">
                      <Pill tone="alert" dot>{x.plan || 'sin plan'}</Pill>
                      <span className="who">{x.cliente}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty">Ninguna baja esta semana.</div>
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
