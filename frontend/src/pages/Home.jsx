import AccionesSemana from '../components/home/AccionesSemana.jsx';
import Bloque from '../components/home/Bloque.jsx';
import IdeasBloque from '../components/home/IdeasBloque.jsx';
import ResumenArea from '../components/home/ResumenArea.jsx';
import Bar from '../components/ui/Bar.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { getHome } from '../data/api.js';
import { formatCompact, formatValue, hace } from '../lib/format.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';
import { ESTADO_RITMO } from '../lib/pacing.js';

/** Las metas decretadas de un área, con la forma que espera la tarjeta. */
function metricasDe(metas = []) {
  return metas.slice(0, 3).map(({ meta, ritmo }) => ({
    label: meta.nombre,
    valor: meta.acumulado.at(-1) ?? 0,
    format: meta.format,
    meta: Number(meta.meta) > 0 ? meta.meta : null,
    tono: ritmo.estado === 'critico' ? 'alert' : ritmo.estado === 'atrasado' ? 'warn' : 'ok',
    nota: Number(meta.meta) > 0
      ? `esperado a hoy ${formatCompact(Math.round(ritmo.esperado), meta.format)}`
      : 'sin meta decretada',
  }));
}

/** La meta que manda para juzgar el área: la principal si está decretada, si no la
 *  primera que lo esté. Sin ninguna, el área no se juzga. */
function metaQueManda(area) {
  const conMeta = (area.metas ?? []).filter((m) => Number(m.meta?.meta) > 0);
  if (Number(area.principal?.meta?.meta) > 0) return area.principal;
  return conMeta[0] ?? null;
}

export default function Home() {
  const { mes: mesId } = useMes();
  const { data, loading, error } = useResource(() => getHome(mesId), [mesId]);

  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (loading || !data) {
    return (
      <div className="page">
        <SkeletonBlock height={90} />
        <SkeletonBlock height={260} />
        <SkeletonBlock height={520} />
      </div>
    );
  }

  const { mes, semana, acciones, marketing, ventas, fulfillment, sistemas, cobranza } = data;
  const pctMes = Math.round(mes.fraccion * 100);
  const mandaVentas = metaQueManda(ventas);
  const mandaMkt = metaQueManda(marketing);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Cuadro de mando"
        title={`${mes.nombre} · día ${mes.dia} de ${mes.dias}`}
      />

      <div className="mes-head">
        <div className="mes-progreso">
          <div className="row">
            <span>
              <b>{pctMes}%</b> del mes transcurrido
            </span>
            <span>
              {mes.dias - mes.dia} días para cerrar · semana {semana}
            </span>
          </div>
          <Bar pct={pctMes} tone="brand" />
        </div>
      </div>

      <AccionesSemana acciones={acciones} semana={semana} />

      <div className="areas-titulo">El mes, área por área</div>

      <div className="areas-resumen">
        <ResumenArea
          titulo="Ventas" dueno={ventas.dueno} href="/ventas"
          estado={mandaVentas ? ESTADO_RITMO[mandaVentas.ritmo.estado] : undefined}
          metricas={metricasDe(ventas.metas)}
          pie={mandaVentas
            ? `${mandaVentas.meta.nombre}: proyecta ${formatCompact(Math.round(mandaVentas.ritmo.proyeccion), mandaVentas.meta.format)} sobre ${formatCompact(mandaVentas.meta.meta, mandaVentas.meta.format)}.`
            : 'Todavía no hay metas decretadas para el mes.'}
        />

        <ResumenArea
          titulo="Marketing" dueno={marketing.dueno} href="/marketing"
          estado={mandaMkt ? ESTADO_RITMO[mandaMkt.ritmo.estado] : undefined}
          metricas={metricasDe(marketing.metas)}
          pie={mandaMkt
            ? `${mandaMkt.meta.nombre}: hacen falta ${formatCompact(Math.round(mandaMkt.ritmo.necesarioSemana), mandaMkt.meta.format)} por semana para llegar.`
            : 'Todavía no hay metas decretadas para el mes.'}
        />

        <ResumenArea
          titulo="Fulfillment" dueno="Franco" href="/fulfillment"
          estado={fulfillment.semaforoTotales.rojo > fulfillment.semaforoTotales.verde
            ? { tone: 'alert', label: 'en rojo' }
            : { tone: 'ok', label: 'sana' }}
          metricas={[
            { label: 'En rojo', valor: fulfillment.semaforoTotales.rojo, tono: 'alert',
              nota: `de ${fulfillment.activos ?? '—'} clientes activos` },
            { label: 'Amarillo', valor: fulfillment.semaforoTotales.amarillo, tono: 'warn',
              nota: 'para mirar esta semana' },
            { label: 'Verde', valor: fulfillment.semaforoTotales.verde, tono: 'ok',
              nota: 'avanzando solos' },
          ]}
          pie={fulfillment.revision?.[0]}
        />

        <ResumenArea
          titulo="Cobranza" dueno="Franco" href="/cobranza"
          estado={cobranza.unavailable ? { tone: 'off', label: 'sin datos' }
            : cobranza.vencidas.n ? { tone: 'alert', label: 'con vencidas' } : { tone: 'ok', label: 'al día' }}
          metricas={cobranza.unavailable ? [] : [
            { label: 'Cobrado del mes', valor: cobranza.cobrado, format: 'usd', meta: cobranza.totalMes,
              tono: cobranza.ritmoCobro?.estado === 'critico' ? 'alert' : 'ok',
              nota: `${Math.round(cobranza.pctSobreVencido)} % de lo que vencía` },
            { label: 'Vencido', valor: cobranza.vencidas.usd, format: 'usd', tono: 'alert',
              nota: `${cobranza.vencidas.n} cuotas pasadas de fecha` },
            { label: 'Vence en 7 días', valor: cobranza.porVencerSemana.usd, format: 'usd', tono: 'warn',
              nota: `${cobranza.porVencerSemana.n} cuotas por avisar` },
          ]}
          pie={cobranza.unavailable
            ? 'Sin datos de cobranza · levantá ATV Clients o revisá ATV_CLIENTS_API_URL'
            : undefined}
        />
      </div>

      <div className="areas-pie">
        <Bloque titulo="Sistemas" dueno="Franco" href="/sistemas">
          <div className="estado-lista">
            <div className="estado-item">
              <i className={`luz ${sistemas.backendOk ? 'ok' : 'alert'}`} />
              <span className="nombre">Backend ATV Ops</span>
              <span className="det">{sistemas.backendOk ? 'respondiendo' : 'sin respuesta'}</span>
            </div>
            <div className="estado-item">
              <i className={`luz ${sistemas.botUltimaEscritura ? (sistemas.transcriptsParcial ? 'warn' : 'ok') : 'off'}`} />
              <span className="nombre">Bot de Discord · transcripts</span>
              <span className="det">
                {sistemas.botUltimaEscritura
                  ? `${sistemas.transcriptsCanales} canales · último ${hace(sistemas.botUltimaEscritura, new Date())}${sistemas.transcriptsParcial ? ' · copia parcial' : ''}`
                  : 'sin datos'}
              </span>
            </div>
            <div className="estado-item">
              <i className={`luz ${sistemas.fuentes.some((f) => f.status === 'sin_conectar') ? 'warn' : 'ok'}`} />
              <span className="nombre">Fuentes de datos</span>
              <span className="det">
                {sistemas.fuentes.filter((f) => f.status === 'conectada').length} conectadas ·{' '}
                {sistemas.fuentes.filter((f) => f.status === 'manual').length} a mano ·{' '}
                {sistemas.fuentes.filter((f) => f.status === 'sin_conectar').length} sin conectar
              </span>
            </div>
            <div className="estado-item">
              <i className={`luz ${sistemas.grietas.some((g) => g.severidad === 'alta') ? 'alert' : sistemas.grietas.length ? 'warn' : 'ok'}`} />
              <span className="nombre">Alertas operativas</span>
              <span className="det">
                {sistemas.grietas.length
                  ? sistemas.grietas.map((g) => g.metrica.split(' · ')[0]).join(' · ')
                  : 'Sin alertas de fuentes caídas'}
              </span>
            </div>
          </div>
        </Bloque>

        <Bloque titulo="Ideas" href="/ideas">
          <IdeasBloque limite={3} />
        </Bloque>
      </div>
    </div>
  );
}
