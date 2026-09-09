import Bars from '../charts/Bars.jsx';
import HBars from '../charts/HBars.jsx';
import Card from '../ui/Card.jsx';
import DataTable from '../ui/DataTable.jsx';
import KpiCard from '../ui/KpiCard.jsx';
import Pill from '../ui/Pill.jsx';
import Bar from '../ui/Bar.jsx';
import { formatRangoSemana, formatValue } from '../../lib/format.js';
import { etiquetaSemana, rangoSemana } from '../../lib/semanas.js';

const PROY_LABEL = {
  en_camino: { tone: 'ok', label: 'en camino' },
  atencion: { tone: 'warn', label: 'atención' },
  critico: { tone: 'alert', label: 'crítico' },
};

/** Verde = lidera el equipo · rojo = arrastra · amarillo = en el medio. */
function tonoVsEquipo(valor, valores) {
  if (!valores.length) return null;
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  if (max === min) return 'ok';
  if (valor >= max) return 'ok';
  if (valor <= min) return 'alert';
  return 'warn';
}

function colorTone(tone) {
  if (tone === 'ok') return 'var(--ok)';
  if (tone === 'warn') return 'var(--warn)';
  if (tone === 'alert') return 'var(--brand-hi)';
  return undefined;
}

function CeldaRendimiento({ children, tone }) {
  return (
    <span className="num ventas-celda-rend" style={{ color: colorTone(tone) }}>
      {children}
    </span>
  );
}

/**
 * Vista performance / salud del funnel.
 * @param {{ data: object }} props
 */
export default function VentasPerformance({ data }) {
  const ultima = data.semanas[data.semanas.length - 1];
  const meta = data.metaMes;
  const proy = PROY_LABEL[meta.estado] ?? PROY_LABEL.atencion;

  const totClosers = data.perfClosers.reduce(
    (a, c) => ({
      llamadas: a.llamadas + c.llamadas,
      shows: a.shows + c.shows,
      cierres: a.cierres + c.cierres,
      cashUsd: a.cashUsd + c.cashUsd,
    }),
    { llamadas: 0, shows: 0, cierres: 0, cashUsd: 0 },
  );
  const totSetters = data.perfSetters.reduce(
    (a, s) => ({
      conversaciones: a.conversaciones + s.conversaciones,
      aplicaciones: a.aplicaciones + s.aplicaciones,
      agendadas: a.agendadas + s.agendadas,
    }),
    { conversaciones: 0, aplicaciones: 0, agendadas: 0 },
  );

  const valsLlamadas = data.perfClosers.map((c) => c.llamadas);
  const valsClose = data.perfClosers.map((c) => c.closeRate);
  const valsCash = data.perfClosers.map((c) => c.cashUsd);

  /** @type {import('../ui/DataTable.jsx').Columna[]} */
  const colsClosers = [
    { key: 'nombre', label: 'Closer' },
    {
      key: 'llamadas',
      label: 'Llamadas',
      align: 'right',
      render: (r) => (
        <CeldaRendimiento tone={tonoVsEquipo(r.llamadas, valsLlamadas)}>
          {r.llamadas}
        </CeldaRendimiento>
      ),
    },
    { key: 'shows', label: 'Shows', align: 'right' },
    { key: 'cierres', label: 'Cierres', align: 'right' },
    {
      key: 'closeRate',
      label: 'Close rate',
      align: 'right',
      value: (r) => r.closeRate,
      render: (r) => (
        <CeldaRendimiento tone={tonoVsEquipo(r.closeRate, valsClose)}>
          {formatValue(r.closeRate, 'pct')}
        </CeldaRendimiento>
      ),
    },
    {
      key: 'cashUsd',
      label: 'Cash',
      align: 'right',
      render: (r) => (
        <CeldaRendimiento tone={tonoVsEquipo(r.cashUsd, valsCash)}>
          {formatValue(r.cashUsd, 'usd')}
        </CeldaRendimiento>
      ),
    },
    {
      key: 'promedioVentaUsd',
      label: 'Prom. venta',
      align: 'right',
      render: (r) => <span className="num">{formatValue(r.promedioVentaUsd, 'usd')}</span>,
    },
  ];

  /** @type {import('../ui/DataTable.jsx').Columna[]} */
  const colsSetters = [
    { key: 'nombre', label: 'Setter' },
    { key: 'conversaciones', label: 'Conversaciones', align: 'right' },
    { key: 'aplicaciones', label: 'Aplicaciones', align: 'right' },
    { key: 'agendadas', label: 'Agendadas', align: 'right' },
    {
      key: 'tasaApp',
      label: 'Conv → app',
      align: 'right',
      render: (r) => formatValue(r.tasaApp, 'pct'),
    },
    {
      key: 'tasaAgendado',
      label: 'App → agenda',
      align: 'right',
      render: (r) => formatValue(r.tasaAgendado, 'pct'),
    },
  ];

  const perdida = ultima.agendados
    ? Math.round((1 - ultima.cierres / ultima.agendados) * 100)
    : 0;

  return (
    <div className="ventas-performance">
      <div className="kpi-grid ventas-kpis">
        {data.kpis.map((m) => (
          <KpiCard key={m.id} metric={m} />
        ))}
      </div>

      <div className="split">
        <Card
          title="Performance por Closer"
          sub="Mes en curso · verde lidera · rojo arrastra · ordenable"
          flush
        >
          <DataTable columns={colsClosers} rows={data.perfClosers} initialSort={{ key: 'cashUsd', dir: 'desc' }} />
          <div className="ventas-totales">
            <span>Totales</span>
            <span>{totClosers.llamadas}</span>
            <span>{totClosers.shows}</span>
            <span>{totClosers.cierres}</span>
            <span>
              {formatValue(totClosers.shows ? (totClosers.cierres / totClosers.shows) * 100 : 0, 'pct')}
            </span>
            <span className="num">{formatValue(totClosers.cashUsd, 'usd')}</span>
            <span className="num">
              {formatValue(totClosers.cierres ? totClosers.cashUsd / totClosers.cierres : 0, 'usd')}
            </span>
          </div>
        </Card>

        <Card title="Performance por Setter" sub="Mes en curso · ordenable" flush>
          <DataTable columns={colsSetters} rows={data.perfSetters} initialSort={{ key: 'agendadas', dir: 'desc' }} />
          <div className="ventas-totales setters">
            <span>Totales</span>
            <span>{totSetters.conversaciones}</span>
            <span>{totSetters.aplicaciones}</span>
            <span>{totSetters.agendadas}</span>
            <span>
              {formatValue(
                totSetters.conversaciones ? (totSetters.aplicaciones / totSetters.conversaciones) * 100 : 0,
                'pct',
              )}
            </span>
            <span>
              {formatValue(
                totSetters.aplicaciones ? (totSetters.agendadas / totSetters.aplicaciones) * 100 : 0,
                'pct',
              )}
            </span>
          </div>
        </Card>
      </div>

      <div className="split">
        <Card
          title="Cash collected por semana"
          sub="Barras: cash · línea: close rate"
        >
          <Bars
            data={data.semanas}
            x={(s) => etiquetaSemana(s.desdeAt)}
            y={(s) => s.cashUsd}
            format="usd"
            label="Cash"
            height={260}
            linea={{ key: (s) => (s.cierres / (s.shows || 1)) * 100, label: 'Close rate' }}
          />
        </Card>

        <Card
          title={`Embudo semanal · ${rangoSemana(ultima.desdeAt)}`}
          sub={formatRangoSemana()}
          foot={`Del agendado al cierre se pierde el ${perdida}% de las oportunidades.`}
        >
          <HBars
            format="count"
            participacion={false}
            data={[
              { label: 'Agendados', value: ultima.agendados, sub: 'Calendly / setters' },
              {
                label: 'Con show',
                value: ultima.shows,
                sub: `${Math.round((ultima.shows / ultima.agendados) * 100)}% show rate`,
              },
              {
                label: 'Cerrados',
                value: ultima.cierres,
                sub: `${Math.round((ultima.cierres / ultima.shows) * 100)}% close · ${formatValue(ultima.cashUsd, 'usd')}`,
              },
            ]}
          />
        </Card>
      </div>

      <Card
        title="Proyección vs meta del mes"
        sub={`${meta.mes} · día ${meta.diaHoy} de ${meta.diasMes}`}
        actions={
          <Pill tone={proy.tone} dot>
            {proy.label}
          </Pill>
        }
      >
        <div className="ventas-proyeccion">
          <div className="ventas-proyeccion-nums">
            <div>
              <div className="k">Meta</div>
              <div className="n num">{formatValue(meta.revenueMetaUsd, 'usd')}</div>
            </div>
            <div>
              <div className="k">Actual</div>
              <div className="n num">{formatValue(meta.revenueActualUsd, 'usd')}</div>
            </div>
            <div>
              <div className="k">Gap</div>
              <div className="n num" style={{ color: 'var(--warn)' }}>
                {formatValue(meta.gap, 'usd')}
              </div>
            </div>
            <div>
              <div className="k">Proyectado al ritmo</div>
              <div className="n num">{formatValue(meta.proyectado, 'usd')}</div>
            </div>
          </div>
          <Bar pct={meta.pctMeta} tone={meta.estado === 'en_camino' ? 'ok' : meta.estado === 'atencion' ? 'warn' : 'alert'} />
          <div className="kpi-objetivo" style={{ marginTop: 8 }}>
            <span>{formatValue(meta.pctMeta, 'pct')} de la meta</span>
            <span className="dim">ritmo esperado {formatValue(meta.pctRitmoEsperado, 'pct')}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
