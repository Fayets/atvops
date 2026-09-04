import BurnUp from '../components/charts/BurnUp.jsx';
import AccionesSemana from '../components/home/AccionesSemana.jsx';
import Bloque from '../components/home/Bloque.jsx';
import IdeasBloque from '../components/home/IdeasBloque.jsx';
import MetaRow from '../components/home/MetaRow.jsx';
import Bar from '../components/ui/Bar.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { getHome } from '../data/api.js';
import { formatValue, hace } from '../lib/format.js';
import { useResource } from '../lib/hooks.js';
import { ESTADO_RITMO } from '../lib/pacing.js';

export default function Home() {
  const { data, loading, error } = useResource(getHome);

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

      <div className="cuadro">
        {/* ---------------------------------------------------- fulfillment */}
        <Bloque
          titulo="Fulfillment"
          dueno="Franco"
          href="/fulfillment"
        >
          <div className="semaforo-mini">
            <div className="celda">
              <div className="n num" style={{ color: 'var(--ok)' }}>{fulfillment.semaforoTotales.verde}</div>
              <div className="k">verde</div>
            </div>
            <div className="celda">
              <div className="n num" style={{ color: 'var(--warn)' }}>{fulfillment.semaforoTotales.amarillo}</div>
              <div className="k">amarillo</div>
            </div>
            <div className="celda">
              <div className="n num" style={{ color: 'var(--brand-hi)' }}>{fulfillment.semaforoTotales.rojo}</div>
              <div className="k">rojo</div>
            </div>
          </div>
          <ul className="revision">
            {fulfillment.revision.slice(0, 2).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Bloque>

        {/* ------------------------------------------------------ marketing */}
        <Bloque
          titulo="Marketing"
          dueno={marketing.dueno}
          href="/marketing"
          extra={<Pill tone={ESTADO_RITMO[marketing.principal.ritmo.estado].tone}>{ESTADO_RITMO[marketing.principal.ritmo.estado].label}</Pill>}
        >
          <MetaRow meta={marketing.principal.meta} ritmo={marketing.principal.ritmo} />
          <BurnUp
            meta={marketing.principal.meta.meta}
            acumulado={marketing.principal.meta.acumulado}
            diasMes={mes.dias}
            ritmo={marketing.principal.ritmo}
            format={marketing.principal.meta.format}
            height={108}
          />
          {marketing.metas
            .filter((m) => m !== marketing.principal)
            .map((m) => (
              <MetaRow key={m.meta.id} meta={m.meta} ritmo={m.ritmo} compacta />
            ))}
        </Bloque>

        {/* --------------------------------------------------------- ventas */}
        <Bloque
          titulo="Ventas"
          dueno={ventas.dueno}
          href="/ventas"
          extra={<Pill tone={ESTADO_RITMO[ventas.principal.ritmo.estado].tone}>{ESTADO_RITMO[ventas.principal.ritmo.estado].label}</Pill>}
        >
          <MetaRow meta={ventas.principal.meta} ritmo={ventas.principal.ritmo} />
          <BurnUp
            meta={ventas.principal.meta.meta}
            acumulado={ventas.principal.meta.acumulado}
            diasMes={mes.dias}
            ritmo={ventas.principal.ritmo}
            format={ventas.principal.meta.format}
            height={108}
          />
          {ventas.metas
            .filter((m) => m !== ventas.principal)
            .map((m) => (
              <MetaRow key={m.meta.id} meta={m.meta} ritmo={m.ritmo} compacta />
            ))}
        </Bloque>

        {/* ------------------------------------------------------- sistemas */}
        <Bloque
          titulo="Sistemas"
          dueno="Franco"
          href="/sistemas"
        >
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
              <i className={`luz ${sistemas.grietas.some((g) => g.severidad === 'alta') ? 'alert' : 'ok'}`} />
              <span className="nombre">Grietas abiertas</span>
              <span className="det">{sistemas.grietas.length} · {sistemas.pedidosSemana} pedidos de datos esta semana</span>
            </div>
          </div>
        </Bloque>

        {/* ------------------------------------------------------- cobranza */}
        <Bloque
          titulo="Cobranza"
          dueno="Franco"
          href="/cobranza"
        >
          <MetaRow
            meta={{ id: 'cobrado', nombre: 'Cobrado del mes', meta: cobranza.totalMes, format: 'usd', acumulado: [cobranza.cobrado] }}
            ritmo={cobranza.ritmoCobro}
            compacta
          />
          <div className="semaforo-mini">
            <div className="celda">
              <div className="n num" style={{ color: cobranza.vencidas.n ? 'var(--brand-hi)' : 'var(--ok)' }}>{cobranza.vencidas.n}</div>
              <div className="k">vencidas · {formatValue(cobranza.vencidas.usd, 'usd')}</div>
            </div>
            <div className="celda">
              <div className="n num" style={{ color: 'var(--warn)' }}>{cobranza.porVencerSemana.n}</div>
              <div className="k">vencen en 7 d · {formatValue(cobranza.porVencerSemana.usd, 'usd')}</div>
            </div>
            <div className="celda">
              <div className="n num">{Math.round(cobranza.pctSobreVencido)}%</div>
              <div className="k">cobrado de lo vencido</div>
            </div>
          </div>
        </Bloque>

        {/* ---------------------------------------------------------- ideas */}
        <Bloque
          titulo="Ideas"
          href="/ideas"
        >
          <IdeasBloque limite={3} />
        </Bloque>
      </div>
    </div>
  );
}
